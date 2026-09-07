const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const http = require('http');
const mongoose = require('mongoose');
const app = require('../app');
const Trip = require('../models/Trip');
const RecoverySession = require('../models/RecoverySession');
const config = require('../config/environment');

// Phase 8 modules
const toolRegistry = require('../agent/ToolRegistry');
const actionExecutor = require('../agent/ActionExecutor');
const actionValidator = require('../agent/ActionValidator');
const llmDecisionService = require('../agent/LLMDecisionService');
const recoveryPlanner = require('../agent/RecoveryPlanner');
const { getLLMProvider } = require('../llm');
const LLMProvider = require('../llm/LLMProvider');
const GeminiProvider = require('../llm/GeminiProvider');

describe('Phase 8: LLM Decision Engine / Tool Calling', () => {
  let server;
  let testTripId;
  let testSessionId;

  before(async () => {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/triprescue';
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(mongoUri);
    }

    server = http.createServer(app);
    await new Promise((resolve) => {
      server.listen(0, () => resolve());
    });

    const trip = new Trip({
      passengerName: 'Ananya Roy',
      passengerCount: 1,
      origin: 'BLR',
      destination: 'JAI',
      departureTime: '2026-09-15T08:00:00+05:30',
      arrivalDeadline: '2026-09-15T22:00:00+05:30',
      maxAdditionalBudget: 8000,
      priority: 'arrival_time',
      riskTolerance: 'LOW',
      status: 'DISRUPTED',
      itinerary: [
        {
          segmentId: 'SEG-P8-001',
          transportMode: 'flight',
          origin: { code: 'BLR', type: 'airport' },
          destination: { code: 'JAI', type: 'airport' },
          departure: '2026-09-15T08:00:00+05:30',
          arrival: '2026-09-15T10:45:00+05:30',
          status: 'CANCELLED',
        },
      ],
      disruption: {
        type: 'FLIGHT_CANCELLED',
        affectedSegmentId: 'SEG-P8-001',
        description: 'Direct flight cancelled due to severe weather',
      },
    });
    await trip.save();
    testTripId = trip._id.toString();

    const session = new RecoverySession({
      tripId: trip._id,
      objective: {
        origin: 'BLR',
        destination: 'JAI',
        departureTime: '2026-09-15T08:00:00+05:30',
        arrivalDeadline: '2026-09-15T22:00:00+05:30',
        maxAdditionalBudget: 8000,
        passengerCount: 1,
        priority: 'arrival_time',
        riskTolerance: 'LOW',
      },
      currentItinerary: trip.itinerary,
      disruption: trip.disruption,
      status: 'READY',
    });
    await session.save();
    testSessionId = session._id.toString();
  });

  after(async () => {
    if (testTripId) {
      await Trip.findByIdAndDelete(testTripId);
      await RecoverySession.deleteMany({ tripId: testTripId });
    }
    if (server) {
      server.close();
    }
    await mongoose.disconnect();
  });

  // 1. Tool Registry Tests
  it('1. ToolRegistry registers all 9 tools with complete parameter schemas', () => {
    const tools = toolRegistry.listTools();
    assert.strictEqual(tools.length, 9);

    const expectedTools = [
      'search_flights',
      'search_trains',
      'search_buses',
      'search_hotels',
      'calculate_route',
      'evaluate_plan',
      'revalidate_plan',
      'adapt_strategy',
      'verify_plan',
    ];

    for (const name of expectedTools) {
      const tool = toolRegistry.getToolByName(name);
      assert.ok(tool, 'Tool ' + name + ' must be registered');
      assert.ok(tool.actionType, 'Tool ' + name + ' must have actionType');
      assert.ok(tool.parameters, 'Tool ' + name + ' must have parameter schema');
      assert.strictEqual(tool.parameters.type, 'OBJECT');
    }
  });

  it('2. ToolRegistry generates Gemini-compatible function declarations', () => {
    const decls = toolRegistry.getFunctionDeclarations();
    assert.strictEqual(decls.length, 9);

    const flightDecl = decls.find((d) => d.name === 'search_flights');
    assert.ok(flightDecl);
    assert.strictEqual(flightDecl.parameters.type, 'OBJECT');
    assert.ok(flightDecl.parameters.properties.origin);
    assert.ok(flightDecl.parameters.properties.destination);
    assert.deepStrictEqual(flightDecl.parameters.required, ['origin', 'destination']);
  });

  it('3. ToolRegistry maps between function names and ActionExecutor action types bidirectional', () => {
    const flightTool = toolRegistry.getToolByName('search_flights');
    assert.strictEqual(flightTool.actionType, 'SEARCH_FLIGHTS');

    const byAction = toolRegistry.getToolByActionType('SEARCH_FLIGHTS');
    assert.strictEqual(byAction.name, 'search_flights');

    const routeTool = toolRegistry.getToolByActionType('CALCULATE_ROUTE');
    assert.strictEqual(routeTool.name, 'calculate_route');
  });

  it('4. ToolRegistry converts model function calls into validated action objects', () => {
    const action = toolRegistry.createActionFromCall('search_flights', {
      origin: 'BLR',
      destination: 'DEL',
      strategy: 'DIRECT_FLIGHT',
    }, 'DIRECT_FLIGHT');

    assert.strictEqual(action.type, 'SEARCH_FLIGHTS');
    assert.strictEqual(action.tool, 'flight');
    assert.strictEqual(action.parameters.origin, 'BLR');
    assert.strictEqual(action.parameters.destination, 'DEL');

    const val = actionValidator.validate(action);
    assert.strictEqual(val.valid, true);
  });

  // 2. ActionExecutor Enhanced Actions
  it('5. ActionExecutor dispatches EVALUATE_PLAN action cleanly', async () => {
    const dummyPlan = {
      planId: 'PLAN-TEST-001',
      strategy: 'DIRECT_FLIGHT',
      segments: [
        {
          segmentId: 'S1',
          transportMode: 'flight',
          origin: { code: 'BLR' },
          destination: { code: 'DEL' },
          departure: '2026-09-15T09:00:00+05:30',
          arrival: '2026-09-15T11:45:00+05:30',
        },
      ],
      totalCost: 5000,
      finalArrivalTime: '2026-09-15T11:45:00+05:30',
    };

    const action = {
      actionId: 'ACT-EVAL-01',
      type: 'EVALUATE_PLAN',
      tool: 'evaluator',
      parameters: {
        plan: dummyPlan,
        objective: {
          origin: 'BLR',
          destination: 'DEL',
          maxAdditionalBudget: 6000,
          arrivalDeadline: '2026-09-15T22:00:00+05:30',
        },
      },
    };

    const result = await actionExecutor.execute(action);
    assert.strictEqual(result.success, true);
    assert.ok(result.data);
    assert.strictEqual(result.data.status, 'VALID');
  });

  it('6. ActionExecutor dispatches REVALIDATE_PLAN action cleanly', async () => {
    const action = {
      actionId: 'ACT-REVAL-01',
      type: 'REVALIDATE_PLAN',
      tool: 'revalidator',
      parameters: {
        segments: [
          {
            segmentId: 'S-TEST-1',
            transportMode: 'flight',
            identifier: 'AI-501',
          },
        ],
      },
    };

    const result = await actionExecutor.execute(action);
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.data.revalidated, true);
    assert.ok(result.data.results.length > 0);
  });

  it('7. ActionExecutor dispatches ADAPT_STRATEGY action cleanly', async () => {
    const action = {
      actionId: 'ACT-ADAPT-01',
      type: 'ADAPT_STRATEGY',
      tool: 'adaptation',
      parameters: {
        currentStrategy: 'DIRECT_FLIGHT',
        failureReason: 'BUDGET_EXCEEDED',
        attemptedStrategies: ['DIRECT_FLIGHT'],
        observation: { maxAdditionalBudget: 2500 },
      },
    };

    const result = await actionExecutor.execute(action);
    assert.strictEqual(result.success, true);
    assert.ok(result.data.nextStrategy);
  });

  it('8. ActionExecutor dispatches VERIFY_PLAN action cleanly', async () => {
    const action = {
      actionId: 'ACT-VERIFY-01',
      type: 'VERIFY_PLAN',
      tool: 'verifier',
      parameters: {
        plan: {
          planId: 'PLAN-V-01',
          segments: [
            {
              segmentId: 'SEG-1',
              origin: { code: 'BLR' },
              destination: { code: 'DEL' },
              departure: '2026-09-15T10:00:00+05:30',
              arrival: '2026-09-15T12:45:00+05:30',
            },
          ],
          totalCost: 4000,
          finalArrivalTime: '2026-09-15T12:45:00+05:30',
        },
        objective: {
          origin: 'BLR',
          destination: 'DEL',
          maxAdditionalBudget: 6000,
          arrivalDeadline: '2026-09-15T20:00:00+05:30',
        },
      },
    };

    const result = await actionExecutor.execute(action);
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.data.verified, true);
  });

  // 3. GeminiProvider & LLMDecisionService Tool Calling
  it('9. GeminiProvider implements completeWithTools contract and error handling', async () => {
    const provider = new GeminiProvider();
    assert.strictEqual(typeof provider.completeWithTools, 'function');

    const origKey = config.geminiApiKey;
    config.geminiApiKey = '';

    try {
      await assert.rejects(
        async () => await provider.completeWithTools('sys', 'user', []),
        /GEMINI_API_KEY is not configured/
      );
    } finally {
      config.geminiApiKey = origKey;
    }
  });

  it('10. LLMDecisionService decideWithTools handles functionCall response', async () => {
    const provider = getLLMProvider();
    const origCompleteWithTools = provider.completeWithTools;

    provider.completeWithTools = async () => ({
      functionCall: {
        name: 'search_flights',
        args: {
          origin: 'BLR',
          destination: 'DEL',
          strategy: 'DIRECT_FLIGHT',
          maxBudget: 7500,
        },
      },
    });

    try {
      const observation = {
        sessionId: 'sess-p8-test',
        origin: 'BLR',
        destination: 'DEL',
        disruptionType: 'FLIGHT_CANCELLED',
        maxAdditionalBudget: 8000,
      };
      const session = { llmCalls: [] };

      const decision = await llmDecisionService.decideWithTools(observation, session, 'DIRECT_FLIGHT', 0);
      assert.ok(decision);
      assert.strictEqual(decision._status, 'SUCCESS');
      assert.strictEqual(decision.action, 'SEARCH_FLIGHTS');
      assert.strictEqual(decision.strategy, 'DIRECT_FLIGHT');
      assert.strictEqual(decision.target.origin, 'BLR');
      assert.strictEqual(decision.target.destination, 'DEL');
      assert.strictEqual(decision.constraints.maxBudget, 7500);
      assert.ok(decision.toolCall);
      assert.strictEqual(decision.toolCall.name, 'search_flights');
    } finally {
      provider.completeWithTools = origCompleteWithTools;
    }
  });

  it('11. RecoveryPlanner forwards LLM-decided target and constraints into action execution parameters', async () => {
    config.llmEnabled = true;

    const provider = getLLMProvider();
    const origComplete = provider.complete;

    provider.complete = async () => {
      return JSON.stringify({
        strategy: 'DIRECT_FLIGHT',
        action: 'SEARCH_FLIGHTS',
        reason: 'Optimal flight path to JAI',
        target: { origin: 'BLR', destination: 'JAI' },
        constraints: { maxBudget: 7500 },
        confidence: 'HIGH',
      });
    };

    try {
      const session = await RecoverySession.findById(testSessionId);
      session.status = 'READY';
      session.agentEvents = [];
      session.candidatePlans = [];
      session.llmCalls = [];
      session.agentActions = [];

      const result = await recoveryPlanner.runRecovery(session, 5);
      assert.ok(result.selectedPlan);

      // Verify that agentActions recorded the parameters forwarded from LLM
      const flightAction = result.agentActions.find((a) => a.type === 'SEARCH_FLIGHTS');
      assert.ok(flightAction);
      assert.strictEqual(flightAction.parameters.origin, 'BLR');
      assert.strictEqual(flightAction.parameters.destination, 'JAI');
      assert.ok(flightAction.parameters.constraints);
      assert.strictEqual(flightAction.parameters.constraints.maxBudget, 7500);
    } finally {
      provider.complete = origComplete;
      config.llmEnabled = false;
    }
  });

  it('12. Live Gemini API connectivity test (skipped if key is invalid or quota limited)', async () => {
    if (!config.geminiApiKey || config.geminiApiKey === 'mock_invalid_key_for_testing') {
      console.log('Skipping live Gemini test: no valid GEMINI_API_KEY configured');
      return;
    }

    const provider = new GeminiProvider();
    try {
      const resp = await provider.complete(
        'You are a travel assistant. Answer in JSON.',
        'Respond with: {"status": "ok", "message": "ping"}'
      );
      assert.ok(resp, 'Should return text response');
      const parsed = JSON.parse(resp);
      assert.strictEqual(parsed.status, 'ok');
    } catch (err) {
      console.warn('Live Gemini API test returned expected network/quota result:', err.message);
      assert.ok(err.message.includes('Gemini API') || err.message.includes('fetch'));
    }
  });
});
