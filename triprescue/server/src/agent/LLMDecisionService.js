/**
 * LLMDecisionService — Phase 4 LLM-powered strategy and action decision maker.
 *
 * Architecture:
 *   RecoveryPlanner (when LLM_ENABLED=true)
 *     -> LLMDecisionService.decide()
 *       -> build sanitized observation context
 *       -> build role-separated prompt (SYSTEM | OBSERVATION | TOOL_RESULTS)
 *       -> GeminiProvider.complete()
 *       -> parse + validate structured JSON output
 *       -> safety boundary check (allowed actions only)
 *     -> returns { strategy, action, reason, target, constraints, confidence }
 *     -> OR returns null (trigger deterministic fallback)
 *
 * Security principles:
 *   - Provider/external content NEVER placed in system instructions
 *   - All external data sanitized: strip control chars, truncate per field
 *   - API keys never appear in any prompt
 *   - LLM can only suggest strategy + action type -- cannot invent data
 *
 * The deterministic validation chain (ConstraintValidator, ConnectionValidator,
 * PlanEvaluator) remains the final authority and cannot be bypassed.
 */

const { getLLMProvider } = require('../llm');
const config = require('../config/environment');
const toolRegistry = require('./ToolRegistry');

// Allowed action types the LLM may select (maps to ActionExecutor capabilities)
const ALLOWED_ACTIONS = new Set([
  'SEARCH_FLIGHTS',
  'SEARCH_TRAINS',
  'SEARCH_BUSES',
  'SEARCH_HOTELS',
  'CALCULATE_ROUTE',
  'EVALUATE_PLAN',
  'REVALIDATE_PLAN',
  'ADAPT_STRATEGY',
  'VERIFY_PLAN',
]);

// Allowed strategies the LLM may select
const ALLOWED_STRATEGIES = new Set([
  'DIRECT_FLIGHT',
  'CONNECTING_FLIGHT',
  'FLIGHT_PLUS_TRAIN',
  'FLIGHT_PLUS_BUS',
  'FLIGHT_PLUS_HOTEL',
  'TRAIN_ONLY',
  'BUS_ONLY',
  'TRANSIT_HOTEL',
]);

// Confidence levels
const ALLOWED_CONFIDENCE = new Set(['LOW', 'MEDIUM', 'HIGH']);

/**
 * Sanitize a string from external/untrusted data:
 * - Remove control characters
 * - Truncate to maxLen
 * - Never allows prompt-injection payloads to reach system instructions
 */
function sanitize(value, maxLen) {
  if (maxLen === undefined) maxLen = 200;
  if (value === null || value === undefined) return '';
  const str = String(value)
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .replace(/\[SYSTEM INSTRUCTIONS?\]/gi, '[BLOCKED]')
    .replace(/\[TOOL RESULTS?\]/gi, '[BLOCKED]')
    .replace(/\[CURRENT OBSERVATION\]/gi, '[BLOCKED]')
    .trim();
  return str.length > maxLen ? str.slice(0, maxLen) + '...' : str;
}

class LLMDecisionService {
  /**
   * Ask the LLM to decide the next recovery action.
   *
   * @param {Object} observation - Normalized observation from Observation.build()
   * @param {Object} session - RecoverySession document (used for prior LLM call history)
   * @param {string} activeStrategy - Currently active strategy
   * @param {number} callsThisRecovery - Number of LLM calls already made this recovery
   * @returns {Promise<Object|null>} Structured decision or null (triggers deterministic fallback)
   */
  async decide(observation, session, activeStrategy, callsThisRecovery) {
    // Cost Guard: never exceed max calls
    if (callsThisRecovery >= config.llmMaxCallsPerRecovery) {
      return null; // Caller will log LLM_FALLBACK and use deterministic engine
    }

    const provider = getLLMProvider();

    // Build system prompt (static, immutable, no external data)
    const systemPrompt = this._buildSystemPrompt();

    // Build user prompt (includes observation + prior context)
    const userPrompt = this._buildUserPrompt(observation, session, activeStrategy);

    const startTime = Date.now();
    let rawResponse = '';

    try {
      rawResponse = await provider.complete(systemPrompt, userPrompt, {
        maxTokens: config.llmMaxTokens,
        temperature: config.llmTemperature,
      });
    } catch (err) {
      return {
        _error: err.message || 'LLM provider error',
        _status: 'FAILED',
        _durationMs: Date.now() - startTime,
        _rawResponse: '',
      };
    }

    const durationMs = Date.now() - startTime;

    // Parse + Validate structured JSON output
    let decision;
    try {
      decision = this._parseDecision(rawResponse);
    } catch (parseErr) {
      return {
        _error: 'LLM output parse failed: ' + parseErr.message,
        _status: 'FAILED',
        _durationMs: durationMs,
        _rawResponse: rawResponse.slice(0, 500),
      };
    }

    // Safety boundary validation
    const safetyResult = this._validateSafety(decision);
    if (!safetyResult.valid) {
      return {
        _error: safetyResult.reason,
        _status: 'REJECTED',
        _durationMs: durationMs,
        _rawResponse: rawResponse.slice(0, 500),
        _rejectedDecision: decision,
      };
    }

    // Success
    return {
      strategy: decision.strategy,
      action: decision.action,
      reason: decision.reason || 'LLM reasoning',
      target: decision.target || {},
      constraints: decision.constraints || {},
      confidence: decision.confidence || 'MEDIUM',
      _status: 'SUCCESS',
      _durationMs: durationMs,
      _rawResponse: rawResponse.slice(0, 500),
    };
  }

  // PRIVATE: Prompt Building

  /**
   * Static system instructions -- never contains external data.
   * Clearly separated from observation and tool results via section headers.
   */
  _buildSystemPrompt() {
    return '[SYSTEM INSTRUCTIONS]\n' +
      'You are TripRescue, an autonomous travel disruption recovery agent.\n' +
      'Your role is to reason about a disrupted travel itinerary and decide which recovery strategy and action to attempt next.\n' +
      '\n' +
      'RULES (mandatory, never violate):\n' +
      '1. You MUST respond with a single valid JSON object. No prose, no markdown, no code fences.\n' +
      '2. You MUST choose strategy from: DIRECT_FLIGHT, CONNECTING_FLIGHT, FLIGHT_PLUS_TRAIN, TRAIN_ONLY, BUS_ONLY\n' +
      '3. You MUST choose action from: SEARCH_FLIGHTS, SEARCH_TRAINS, SEARCH_BUSES, SEARCH_HOTELS, CALCULATE_ROUTE, EVALUATE_PLAN, REVALIDATE_PLAN, ADAPT_STRATEGY, VERIFY_PLAN\n' +
      '4. You MUST NOT invent flight numbers, prices, train schedules, seat counts, hotel availability, or any factual travel data.\n' +
      '5. You MUST NOT claim a ticket is booked or a purchase is complete.\n' +
      '6. You MUST NOT override budget, deadline, or connection constraints.\n' +
      '7. You MUST respect the traveler hard constraints listed in the observation.\n' +
      '8. If no good strategy exists, choose the best remaining untried option.\n' +
      '\n' +
      'OUTPUT FORMAT (strict JSON, no other text):\n' +
      '{\n' +
      '  "strategy": "DIRECT_FLIGHT",\n' +
      '  "action": "SEARCH_FLIGHTS",\n' +
      '  "reason": "Concise explanation of why this strategy was chosen",\n' +
      '  "target": { "origin": "BLR", "destination": "JAI" },\n' +
      '  "constraints": { "maxBudget": 5000, "deadline": "2026-09-05T18:00:00.000Z" },\n' +
      '  "confidence": "MEDIUM"\n' +
      '}';
  }

  /**
   * Dynamic user prompt -- contains observation and prior context.
   * External data is clearly separated and sanitized.
   * NEVER placed in system instructions.
   */
  _buildUserPrompt(observation, session, activeStrategy) {
    const hardConstraintsStr = sanitize(JSON.stringify(observation.hardConstraints || {}), 200);
    const softConstraintsStr = sanitize(JSON.stringify(observation.softConstraints || {}), 200);

    const obsBlock = '[CURRENT OBSERVATION]\n' +
      'Session ID: ' + sanitize(String(observation.sessionId || ''), 50) + '\n' +
      'Journey: ' + sanitize(observation.origin, 10) + ' -> ' + sanitize(observation.destination, 10) + '\n' +
      'Disruption Type: ' + sanitize(observation.disruptionType, 50) + '\n' +
      'Disruption Description: ' + sanitize(observation.disruptionDescription, 200) + '\n' +
      'Current Strategy: ' + sanitize(activeStrategy, 30) + '\n' +
      'Attempted Strategies: ' + sanitize((observation.attemptedStrategies || []).join(', '), 100) + '\n' +
      'Previous Failures: ' + sanitize((observation.previousFailures || []).map(function(f) { return f.type; }).join(', '), 100) + '\n' +
      'Budget Available: INR ' + sanitize(String(observation.maxAdditionalBudget), 20) + '\n' +
      'Arrival Deadline: ' + sanitize(observation.arrivalDeadline, 40) + '\n' +
      'Remaining Minutes to Deadline: ' + sanitize(String(observation.remainingMinutes), 10) + '\n' +
      'Passenger Count: ' + sanitize(String(observation.passengerCount), 5) + '\n' +
      'Priority: ' + sanitize(observation.priority, 30) + '\n' +
      'Risk Tolerance: ' + sanitize(observation.riskTolerance, 10) + '\n' +
      'Hard Constraints: ' + hardConstraintsStr + '\n' +
      'Soft Constraints: ' + softConstraintsStr + '\n' +
      'Candidate Plans Found: ' + sanitize(String(observation.candidatePlansCount), 5) + '\n' +
      'Iteration: ' + sanitize(String(observation.iterationCount), 5);

    // Build prior LLM call history block (last 3 calls for context)
    const llmHistory = (session.llmCalls || []).slice(-3);
    let toolResultsBlock = '[TOOL RESULTS]\nNo prior LLM decisions in this session.';

    if (llmHistory.length > 0) {
      const historyLines = llmHistory.map(function(call, i) {
        const dec = call.parsedDecision;
        if (!dec) return 'Call ' + (i + 1) + ': Status=' + call.status;
        return 'Call ' + (i + 1) + ': Strategy=' + sanitize(dec.strategy, 30) +
          ' Action=' + sanitize(dec.action, 30) +
          ' Confidence=' + sanitize(dec.confidence, 10) +
          ' Status=' + call.status;
      });
      toolResultsBlock = '[TOOL RESULTS]\nPrior LLM decisions this session:\n' + historyLines.join('\n');
    }

    return obsBlock + '\n\n' + toolResultsBlock + '\n\nBased on the above observation, decide the best next recovery action. Respond with JSON only.';
  }

  // PRIVATE: Output Parsing

  /**
   * Parse the LLM raw text output into a structured decision object.
   * Handles Gemini returning JSON directly (responseMimeType=application/json).
   * @throws {Error} If JSON is malformed or required fields are missing
   */
  _parseDecision(rawText) {
    // Strip any stray markdown code fences the model might add
    const cleaned = rawText
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();

    let obj;
    try {
      obj = JSON.parse(cleaned);
    } catch (err) {
      throw new Error('JSON parse failed: ' + err.message + '. Raw: ' + cleaned.slice(0, 200));
    }

    // Required fields
    if (!obj.strategy) throw new Error('Missing required field: strategy');
    if (!obj.action) throw new Error('Missing required field: action');

    return obj;
  }

  // PRIVATE: Safety Boundary

  /**
   * Validate that the LLM decision is within safe operational boundaries.
   * The LLM may only choose from allowed strategies and actions.
   * @param {Object} decision - Parsed LLM decision object
   * @returns {{ valid: boolean, reason?: string }}
   */
  _validateSafety(decision) {
    if (!ALLOWED_STRATEGIES.has(decision.strategy)) {
      return {
        valid: false,
        reason: 'LLM selected unknown strategy "' + decision.strategy + '". Allowed: ' + [...ALLOWED_STRATEGIES].join(', '),
      };
    }

    if (!ALLOWED_ACTIONS.has(decision.action)) {
      return {
        valid: false,
        reason: 'LLM selected unknown action "' + decision.action + '". Allowed: ' + [...ALLOWED_ACTIONS].join(', '),
      };
    }

    if (decision.confidence && !ALLOWED_CONFIDENCE.has(decision.confidence)) {
      decision.confidence = 'MEDIUM';
    }

    return { valid: true };
  }

  /**
   * Get the ToolRegistry instance.
   * @returns {Object} ToolRegistry
   */
  getToolRegistry() {
    return toolRegistry;
  }

  /**
   * Decide the next recovery action using Gemini function calling / tool calling.
   *
   * @param {Object} observation
   * @param {Object} session
   * @param {string} activeStrategy
   * @param {number} callsThisRecovery
   * @returns {Promise<Object|null>}
   */
  async decideWithTools(observation, session, activeStrategy, callsThisRecovery) {
    if (callsThisRecovery >= config.llmMaxCallsPerRecovery) {
      return null;
    }

    const provider = getLLMProvider();
    const systemPrompt = this._buildSystemPrompt();
    const userPrompt = this._buildUserPrompt(observation, session, activeStrategy);
    const toolDeclarations = toolRegistry.getFunctionDeclarations();

    const startTime = Date.now();
    let result;

    try {
      if (typeof provider.completeWithTools === 'function') {
        result = await provider.completeWithTools(systemPrompt, userPrompt, toolDeclarations, {
          maxTokens: config.llmMaxTokens,
          temperature: config.llmTemperature,
        });
      } else {
        const rawText = await provider.complete(systemPrompt, userPrompt, {
          maxTokens: config.llmMaxTokens,
          temperature: config.llmTemperature,
        });
        result = { text: rawText };
      }
    } catch (err) {
      return {
        _error: err.message || 'LLM tool completion error',
        _status: 'FAILED',
        _durationMs: Date.now() - startTime,
        _rawResponse: '',
      };
    }

    const durationMs = Date.now() - startTime;

    // Handle Gemini functionCall response
    if (result.functionCall) {
      const tool = toolRegistry.getToolByName(result.functionCall.name);
      if (!tool) {
        return {
          _error: 'Unknown function call returned by model: ' + result.functionCall.name,
          _status: 'REJECTED',
          _durationMs: durationMs,
          _rawResponse: JSON.stringify(result.functionCall),
        };
      }

      const args = result.functionCall.args || {};
      const actionType = tool.actionType;

      const safetyResult = this._validateSafety({
        strategy: args.strategy || activeStrategy,
        action: actionType,
      });

      if (!safetyResult.valid) {
        return {
          _error: safetyResult.reason,
          _status: 'REJECTED',
          _durationMs: durationMs,
          _rawResponse: JSON.stringify(result.functionCall),
          _rejectedDecision: { strategy: args.strategy || activeStrategy, action: actionType },
        };
      }

      return {
        strategy: args.strategy || activeStrategy,
        action: actionType,
        toolCall: {
          name: result.functionCall.name,
          args,
        },
        reason: args.reason || ('Tool invoked: ' + result.functionCall.name),
        target: {
          origin: args.origin,
          destination: args.destination,
          location: args.location,
        },
        constraints: {
          maxBudget: args.maxBudget,
          deadline: args.deadline,
        },
        confidence: 'HIGH',
        _status: 'SUCCESS',
        _durationMs: durationMs,
        _rawResponse: JSON.stringify(result.functionCall),
      };
    }

    // Otherwise fallback to text JSON parsing
    if (result.text) {
      let decision;
      try {
        decision = this._parseDecision(result.text);
      } catch (parseErr) {
        return {
          _error: 'LLM output parse failed: ' + parseErr.message,
          _status: 'FAILED',
          _durationMs: durationMs,
          _rawResponse: result.text.slice(0, 500),
        };
      }

      const safetyResult = this._validateSafety(decision);
      if (!safetyResult.valid) {
        return {
          _error: safetyResult.reason,
          _status: 'REJECTED',
          _durationMs: durationMs,
          _rawResponse: result.text.slice(0, 500),
          _rejectedDecision: decision,
        };
      }

      return {
        strategy: decision.strategy,
        action: decision.action,
        reason: decision.reason || 'LLM reasoning',
        target: decision.target || {},
        constraints: decision.constraints || {},
        confidence: decision.confidence || 'MEDIUM',
        _status: 'SUCCESS',
        _durationMs: durationMs,
        _rawResponse: result.text.slice(0, 500),
      };
    }

    return {
      _error: 'Model returned neither function call nor text content',
      _status: 'FAILED',
      _durationMs: durationMs,
      _rawResponse: '',
    };
  }
}

module.exports = new LLMDecisionService();
