/**
 * RecoveryPlanner — Phase 4 LLM-Augmented Autonomous Recovery Loop.
 *
 * Implements the stateful agent loop:
 *   OBSERVE
 *   → BUILD OBJECTIVE
 *   → SELECT STRATEGY (LLM when enabled, deterministic fallback)
 *   → EXECUTE ACTION (deterministic tool layer)
 *   → NORMALIZE RESULT
 *   → EVALUATE (PlanEvaluator: ConstraintValidator + ConnectionValidator)
 *   → SCORE (PlanScorer)
 *   → UPDATE STATE (RiskEngine, CascadeImpact)
 *   → ADAPT IF NECESSARY (AdaptationEngine)
 *   → CONTINUE / VERIFY / FAIL
 *
 * LLM Integration (Phase 4):
 *   When LLM_ENABLED=true, LLMDecisionService replaces decisionEngine.selectAction()
 *   for strategy + action selection. All subsequent deterministic steps are unchanged.
 *   When LLM_ENABLED=false or LLM quota exceeded or LLM fails, falls through to
 *   deterministic DecisionEngine seamlessly.
 */

const Observation = require('./Observation');
const decisionEngine = require('./DecisionEngine');
const actionValidator = require('./ActionValidator');
const actionExecutor = require('./ActionExecutor');
const adaptationEngine = require('./AdaptationEngine');
const eventLogger = require('./EventLogger');
const stateManager = require('./StateManager');
const planEvaluator = require('../evaluation/PlanEvaluator');
const constraintValidator = require('../evaluation/ConstraintValidator');
const connectionValidator = require('../evaluation/ConnectionValidator');
const planScorer = require('../evaluation/PlanScorer');
const riskEngine = require('../evaluation/RiskEngine');
const cascadeImpactEngine = require('../evaluation/CascadeImpactEngine');
const config = require('../config/environment');
const llmDecisionService = require('./LLMDecisionService');


class RecoveryPlanner {
  /**
   * Run the deterministic recovery workflow for a given RecoverySession.
   * @param {Object} session - Mongoose RecoverySession document
   * @param {number} maxIterations - Maximum iterations safeguard (default 10)
   * @returns {Promise<Object>} Updated RecoverySession
   */
  async runRecovery(session, maxIterations = 10) {
    session.recoveryStartedAt = new Date();
    session.status = 'RECOVERING';
    session.currentStatus = 'RECOVERING';
    await stateManager.updateTripStatus(session.tripId, 'RECOVERING');

    eventLogger.log(session, 'RECOVERY_STARTED', 'Autonomous recovery workflow started.', {
      tripId: session.tripId,
      maxIterations,
      llmEnabled: config.llmEnabled,
    });

    // Run initial cascade impact analysis
    const initialImpact = cascadeImpactEngine.analyzeImpact(
      session.currentItinerary,
      session.disruption,
      0,
      session.objective
    );
    session.downstreamImpacts = initialImpact.affectedSegments.map((s) => ({
      affectedSegmentId: s.segmentId,
      impactType: s.impactType,
      description: s.description,
      severityLevel: s.severityLevel,
    }));
    eventLogger.log(session, 'IMPACT_DETECTED', initialImpact.summary, initialImpact);

    // Initial strategy is state-driven based on disruption, budget, and traveler preferences
    const initialObservation = Observation.build(session);
    let activeStrategy = session.currentStrategy || this._selectInitialStrategy(initialObservation);
    session.currentStrategy = activeStrategy;

    let iteration = 0;
    let recoveryCompleted = false;
    // Phase 4: track LLM calls this recovery session (cost guard)
    let llmCallsThisRecovery = 0;

    while (iteration < maxIterations && !recoveryCompleted) {

      iteration++;
      session.iterationCount = iteration;

      // 1. OBSERVE
      const observation = Observation.build(session);
      eventLogger.log(
        session,
        'OBSERVATION_CREATED',
        `Observed state: Journey ${observation.origin} → ${observation.destination}, Disruption: ${observation.disruptionType}, Strategy: ${activeStrategy}`,
        { iteration, activeStrategy },
        activeStrategy,
        iteration
      );

      // Record attempted strategy
      if (!session.attemptedStrategies.includes(activeStrategy)) {
        session.attemptedStrategies.push(activeStrategy);
      }
      eventLogger.log(
        session,
        'STRATEGY_SELECTED',
        `Selected strategy [${activeStrategy}] for evaluation.`,
        { activeStrategy },
        activeStrategy,
        iteration
      );

      // 2. DECIDE ACTION — LLM when enabled, deterministic fallback otherwise
      let action;

      if (config.llmEnabled) {
        // ── Phase 4: LLM-guided decision ──────────────────────────────────
        eventLogger.log(
          session,
          'LLM_STARTED',
          `LLM reasoning started for strategy [${activeStrategy}] (call ${llmCallsThisRecovery + 1}/${config.llmMaxCallsPerRecovery})`,
          { activeStrategy, callIndex: llmCallsThisRecovery },
          activeStrategy,
          iteration
        );

        const llmResult = await llmDecisionService.decide(
          observation,
          session,
          activeStrategy,
          llmCallsThisRecovery
        );

        // Increment counter regardless of outcome (null = quota exceeded, no call made)
        if (llmResult !== null) {
          llmCallsThisRecovery++;
        }

        // Store LLM call record in session memory
        const callRecord = {
          callIndex: llmCallsThisRecovery,
          iteration,
          strategy: activeStrategy,
          promptSummary: '',
          rawResponseSummary: llmResult ? (llmResult._rawResponse || '').slice(0, 500) : '',
          parsedDecision: llmResult && llmResult._status === 'SUCCESS' ? {
            strategy: llmResult.strategy,
            action: llmResult.action,
            reason: llmResult.reason,
            confidence: llmResult.confidence,
          } : null,
          status: llmResult === null ? 'QUOTA_EXCEEDED' : (llmResult._status || 'FAILED'),
          durationMs: llmResult ? (llmResult._durationMs || 0) : 0,
        };
        if (!session.llmCalls) session.llmCalls = [];
        session.llmCalls.push(callRecord);

        if (llmResult === null) {
          // Quota exceeded — fallback
          eventLogger.log(
            session,
            'LLM_FALLBACK',
            `LLM call quota exhausted (${config.llmMaxCallsPerRecovery} calls). Using deterministic DecisionEngine.`,
            { llmCallsThisRecovery },
            activeStrategy,
            iteration
          );
          action = decisionEngine.selectAction(activeStrategy, observation);

        } else if (llmResult._status === 'FAILED') {
          // LLM error (network, timeout, parse) — fallback
          eventLogger.log(
            session,
            'LLM_FAILED',
            `LLM call failed: ${llmResult._error}. Falling back to deterministic engine.`,
            { error: llmResult._error },
            activeStrategy,
            iteration
          );
          eventLogger.log(
            session,
            'LLM_FALLBACK',
            `Deterministic DecisionEngine taking over for iteration ${iteration}.`,
            {},
            activeStrategy,
            iteration
          );
          action = decisionEngine.selectAction(activeStrategy, observation);

        } else if (llmResult._status === 'REJECTED') {
          // LLM output failed safety boundary check
          eventLogger.log(
            session,
            'LLM_DECISION_REJECTED',
            `LLM decision rejected by safety guard: ${llmResult._error}`,
            { error: llmResult._error, rejectedDecision: llmResult._rejectedDecision },
            activeStrategy,
            iteration
          );
          eventLogger.log(
            session,
            'LLM_FALLBACK',
            `Deterministic DecisionEngine taking over after rejected LLM decision.`,
            {},
            activeStrategy,
            iteration
          );
          action = decisionEngine.selectAction(activeStrategy, observation);

        } else {
          // LLM success — use its decision
          eventLogger.log(
            session,
            'LLM_COMPLETED',
            `LLM reasoning completed in ${llmResult._durationMs}ms. Confidence: ${llmResult.confidence}`,
            { durationMs: llmResult._durationMs, confidence: llmResult.confidence },
            activeStrategy,
            iteration
          );

          // If LLM chose a different strategy, update it (and record adaptation)
          if (llmResult.strategy && llmResult.strategy !== activeStrategy) {
            const prevStrategy = activeStrategy;
            activeStrategy = llmResult.strategy;
            session.currentStrategy = activeStrategy;

            if (!session.attemptedStrategies.includes(activeStrategy)) {
              session.attemptedStrategies.push(activeStrategy);
            }

            session.adaptationHistory.push({
              previousStrategy: prevStrategy,
              failureReason: 'LLM_STRATEGY_CHANGE',
              newStrategy: activeStrategy,
              triggeredBy: 'LLM_DECISION',
              iteration,
            });

            eventLogger.log(
              session,
              'ADAPTATION_TRIGGERED',
              `LLM changed strategy from [${prevStrategy}] to [${activeStrategy}]: ${llmResult.reason}`,
              { prevStrategy, newStrategy: activeStrategy, reason: llmResult.reason },
              activeStrategy,
              iteration
            );
          }

          eventLogger.log(
            session,
            'LLM_DECISION',
            `LLM decided: [${llmResult.strategy}] → ${llmResult.action}. Reason: ${llmResult.reason}`,
            {
              strategy: llmResult.strategy,
              action: llmResult.action,
              reason: llmResult.reason,
              confidence: llmResult.confidence,
            },
            activeStrategy,
            iteration
          );

          // Translate LLM decision into the same action shape as DecisionEngine
          action = decisionEngine.selectAction(activeStrategy, observation);
          // Override the type if LLM specified a compatible one
          if (llmResult.action && ['SEARCH_FLIGHTS', 'SEARCH_TRAINS', 'SEARCH_BUSES', 'SEARCH_HOTELS', 'CALCULATE_ROUTE', 'EVALUATE_PLAN', 'REVALIDATE_PLAN', 'ADAPT_STRATEGY', 'VERIFY_PLAN'].includes(llmResult.action)) {
            action.type = llmResult.action;
            action.reason = llmResult.reason || action.reason;
          }
          // Forward LLM-specified targets and constraints
          if (llmResult.target) {
            if (llmResult.target.origin) action.parameters.origin = llmResult.target.origin;
            if (llmResult.target.destination) action.parameters.destination = llmResult.target.destination;
            if (llmResult.target.location) action.parameters.location = llmResult.target.location;
          }
          if (llmResult.constraints) {
            action.parameters.constraints = { ...action.parameters.constraints, ...llmResult.constraints };
          }
          if (llmResult.toolCall) {
            action.toolCall = llmResult.toolCall;
          }
        }

      } else {
        // ── LLM disabled — purely deterministic ────────────────────────────
        action = decisionEngine.selectAction(activeStrategy, observation);
      }

      const valCheck = actionValidator.validate(action, session);

      if (!valCheck.valid) {
        eventLogger.log(session, 'FAILURE_DETECTED', `Action validation rejected: ${valCheck.errors.join(', ')}`);
        session.status = 'FAILED';
        session.currentStatus = 'FAILED';
        break;
      }

      eventLogger.log(
        session,
        'DECISION_MADE',
        `Decided action: ${action.type} (${action.reason})`,
        action,
        activeStrategy,
        iteration
      );


      // 3. EXECUTE ACTION WITH FALLBACK PROTECTION
      const execOptions = {
        sessionId: session._id ? session._id.toString() : 'global',
        emitEventFn: (type, msg, meta = {}) => {
          eventLogger.log(session, type, msg, meta, activeStrategy, iteration);
        },
      };

      eventLogger.log(session, 'TOOL_STARTED', `Querying tool [${action.tool}] for ${action.type}...`);
      const execResult = await actionExecutor.execute(action, execOptions);
      eventLogger.log(session, 'TOOL_COMPLETED', `Tool [${action.tool}] finished in ${execResult.durationMs}ms`, {
        success: execResult.success,
      });

      // Handle secondary/composite action if strategy requires it (e.g. FLIGHT_PLUS_TRAIN, FLIGHT_PLUS_BUS, FLIGHT_PLUS_HOTEL)
      let secondaryResult = null;
      if ((activeStrategy === 'FLIGHT_PLUS_TRAIN' || activeStrategy === 'FLIGHT_PLUS_BUS' || activeStrategy === 'FLIGHT_PLUS_HOTEL') && execResult.success && execResult.data?.results?.length > 0) {
        const secAction = decisionEngine.selectComplementaryAction(
          activeStrategy,
          execResult.data.results[0],
          observation
        );
        if (secAction) {
          eventLogger.log(session, 'TOOL_STARTED', `Querying complementary tool [${secAction.tool}] for ${secAction.type}...`);
          secondaryResult = await actionExecutor.execute(secAction, execOptions);
          eventLogger.log(session, 'TOOL_COMPLETED', `Complementary tool [${secAction.tool}] completed.`);
        }
      }

      // Record agent action in session
      session.agentActions.push({
        actionId: action.actionId,
        type: action.type,
        strategy: activeStrategy,
        tool: action.tool,
        parameters: action.parameters,
        reason: action.reason,
        result: execResult.data,
        success: execResult.success,
        iteration,
      });

      // 4. NORMALIZE INTO CANDIDATE PLAN
      const rawCandidatePlan = this._constructCandidatePlan(
        activeStrategy,
        execResult,
        secondaryResult,
        observation
      );

      if (!rawCandidatePlan) {
        // No options found by provider
        const failureType = 'NO_RESULTS';
        session.failures.push({
          type: failureType,
          action: action.type,
          tool: action.tool,
          strategy: activeStrategy,
          reason: `No travel results returned for strategy ${activeStrategy}`,
        });
        eventLogger.log(session, 'FAILURE_DETECTED', `Strategy ${activeStrategy} returned zero options.`);

        // Adapt
        const adaptDecision = adaptationEngine.adapt(activeStrategy, failureType, session.attemptedStrategies, observation);
        if (adaptDecision.nextStrategy) {
          session.adaptationHistory.push({
            previousStrategy: activeStrategy,
            failureReason: failureType,
            newStrategy: adaptDecision.nextStrategy,
            triggeredBy: failureType,
            iteration,
          });
          eventLogger.log(session, 'ADAPTATION_TRIGGERED', adaptDecision.reason, adaptDecision);
          activeStrategy = adaptDecision.nextStrategy;
          session.currentStrategy = activeStrategy;
          continue;
        } else {
          session.status = 'FAILED';
          session.currentStatus = 'FAILED';
          eventLogger.log(session, 'RECOVERY_FAILED', 'No feasible recovery strategies remain.');
          break;
        }
      }

      eventLogger.log(
        session,
        'PLAN_CREATED',
        `Generated candidate plan ${rawCandidatePlan.planId} via [${activeStrategy}] totaling ₹${rawCandidatePlan.totalCost}.`,
        rawCandidatePlan
      );

      // 5. EVALUATE PLAN (ConstraintValidator + ConnectionValidator)
      session.status = 'EVALUATING';
      session.currentStatus = 'EVALUATING';
      const evaluatedPlan = planEvaluator.evaluate(rawCandidatePlan, session.objective);

      session.candidatePlans.push(evaluatedPlan);

      if (evaluatedPlan.status === 'INVALID') {
        session.rejectedPlans.push(evaluatedPlan);
        const failureType = evaluatedPlan.primaryFailureType || 'BUDGET_EXCEEDED';
        const failureReason = evaluatedPlan.rejectionReasons.join('; ');

        session.failures.push({
          type: failureType,
          action: action.type,
          tool: action.tool,
          strategy: activeStrategy,
          reason: failureReason,
          planId: evaluatedPlan.planId,
        });

        eventLogger.log(
          session,
          'PLAN_REJECTED',
          `Plan ${evaluatedPlan.planId} REJECTED: ${failureReason}`,
          { failureType, reasons: evaluatedPlan.rejectionReasons },
          activeStrategy,
          iteration
        );

        // 6. ADAPT (AdaptationEngine)
        session.status = 'ADAPTING';
        session.currentStatus = 'ADAPTING';
        const adaptDecision = adaptationEngine.adapt(
          activeStrategy,
          failureType,
          session.attemptedStrategies,
          observation
        );

        if (adaptDecision.nextStrategy) {
          session.adaptationHistory.push({
            previousStrategy: activeStrategy,
            failureReason,
            newStrategy: adaptDecision.nextStrategy,
            triggeredBy: failureType,
            iteration,
          });
          eventLogger.log(session, 'ADAPTATION_TRIGGERED', adaptDecision.reason, adaptDecision, activeStrategy, iteration);
          activeStrategy = adaptDecision.nextStrategy;
          session.currentStrategy = activeStrategy;
          continue;
        } else {
          session.status = 'FAILED';
          session.currentStatus = 'FAILED';
          eventLogger.log(session, 'RECOVERY_FAILED', 'All recovery strategies exhausted without feasible candidate.');
          break;
        }
      }

      // 7. PLAN IS VALID! SCORE AND VERIFY
      if (evaluatedPlan.status === 'VALID') {
        const scoreResult = planScorer.score(evaluatedPlan, session.objective);
        evaluatedPlan.score = scoreResult.score;

        // TripShield Risk Assessment
        const risk = riskEngine.assess(
          evaluatedPlan,
          session.objective,
          session.disruption,
          session.candidatePlans
        );
        evaluatedPlan.riskScore = risk.score;
        session.riskScore = {
          score: risk.score,
          level: risk.level,
          reasons: risk.reasons,
          factors: risk.factors,
          calculatedAt: new Date(),
        };
        eventLogger.log(
          session,
          'RISK_UPDATED',
          `TripShield Risk Score evaluated: ${risk.score}/100 (${risk.level})`,
          risk
        );

        // Final Verification step
        session.status = 'VERIFYING';
        session.currentStatus = 'VERIFYING';
        const isVerified = await this._verifyPlan(evaluatedPlan, session, observation);

        if (isVerified) {
          evaluatedPlan.status = 'SELECTED';
          session.selectedPlan = evaluatedPlan;

          eventLogger.log(
            session,
            'PLAN_VERIFIED',
            `Plan ${evaluatedPlan.planId} verified against all hard constraints, route continuity, and connection safety buffers.`,
            { planId: evaluatedPlan.planId, score: evaluatedPlan.score, totalCost: evaluatedPlan.totalCost },
            activeStrategy,
            iteration
          );

          // Phase 2 lifecycle step: PLAN_READY
          session.status = 'PLAN_READY';
          session.currentStatus = 'PLAN_READY';
          eventLogger.log(
            session,
            'RECOVERY_PLAN_READY',
            `Complete recovery plan ready via [${activeStrategy}] totaling ₹${evaluatedPlan.totalCost} (Score: ${evaluatedPlan.score}/100).`,
            { selectedPlanId: evaluatedPlan.planId, score: evaluatedPlan.score, totalCost: evaluatedPlan.totalCost },
            activeStrategy,
            iteration
          );

          // Phase 2 lifecycle step: AWAITING_APPROVAL
          session.status = 'AWAITING_APPROVAL';
          session.currentStatus = 'AWAITING_APPROVAL';
          eventLogger.log(
            session,
            'AWAITING_APPROVAL',
            `Waiting for traveler approval. Trip remains in recovery state until traveler confirmation.`,
            { selectedPlanId: evaluatedPlan.planId },
            activeStrategy,
            iteration
          );

          await stateManager.updateTripStatus(session.tripId, 'RECOVERING');

          // Phase 11: Notification emission & Calendar conflict check
          try {
            const { notificationService } = require('../notifications');
            const { calendarService } = require('../calendar');

            await notificationService.emitNotification('RECOVERY_PLAN_READY', {
              tripId: session.tripId,
              sessionId: session._id,
              title: 'Recovery Plan Ready for Review',
              message: `A viable recovery plan via ${activeStrategy} (₹${evaluatedPlan.totalCost}) has been verified.`,
              metadata: { planId: evaluatedPlan.planId, totalCost: evaluatedPlan.totalCost },
            });

            if (evaluatedPlan.finalArrivalTime) {
              const calResult = await calendarService.checkAndNotifyConflicts(evaluatedPlan.finalArrivalTime, {
                tripId: session.tripId,
                sessionId: session._id,
              });
              if (calResult.hasConflict) {
                eventLogger.log(
                  session,
                  'CALENDAR_CONFLICT',
                  `Calendar conflict identified with recovery arrival: ${calResult.conflicts[0]?.eventTitle}`,
                  calResult,
                  activeStrategy,
                  iteration
                );
              }
            }
          } catch (e) {
            console.warn(`[RecoveryPlanner] Phase 11 notification/calendar warning: ${e.message}`);
          }

          recoveryCompleted = true;
          break;
        }
      }
    }

    if (iteration >= maxIterations && !recoveryCompleted && session.status !== 'FAILED') {
      session.status = 'MAX_ITERATIONS';
      session.currentStatus = 'MAX_ITERATIONS';
      eventLogger.log(session, 'MAX_ITERATIONS_REACHED', `Recovery halted after reaching maximum iterations limit (${maxIterations}).`);
    }

    // Persist session to MongoDB
    return await stateManager.saveSession(session);
  }

  /**
   * Helper to normalize raw tool responses into a complete RecoveryPlan.
   */
  _constructCandidatePlan(strategy, primaryResult, secondaryResult, observation) {
    const rawOption = primaryResult?.data?.results?.[0];
    if (!rawOption) return null;

    let segments = [];
    let totalCost = 0;
    const baseDateStr = new Date(observation.departureTime).toISOString().slice(0, 10);

    if (strategy === 'DIRECT_FLIGHT') {
      segments = rawOption.segments || [rawOption];
      totalCost = rawOption.price?.amount || 0;
    } else if (strategy === 'CONNECTING_FLIGHT') {
      segments = rawOption.segments || [];
      totalCost = rawOption.price?.amount || 0;
    } else if (strategy === 'FLIGHT_PLUS_TRAIN') {
      const flightLeg = rawOption.segments?.[0] || rawOption;
      const trainOption = secondaryResult?.data?.results?.[0];
      const trainLeg = trainOption?.segments?.[0] || trainOption;

      if (!trainLeg) return null;

      segments = [flightLeg, trainLeg];
      totalCost = (flightLeg.price?.amount || 0) + (trainLeg.price?.amount || 0);
    } else if (strategy === 'FLIGHT_PLUS_BUS') {
      const flightLeg = rawOption.segments?.[0] || rawOption;
      const busOption = secondaryResult?.data?.results?.[0];
      const busLeg = busOption?.segments?.[0] || busOption;

      if (!busLeg) return null;

      segments = [flightLeg, busLeg];
      totalCost = (flightLeg.price?.amount || 0) + (busLeg.price?.amount || 0);
    } else if (strategy === 'FLIGHT_PLUS_HOTEL') {
      const flightLeg = rawOption.segments?.[0] || rawOption;
      const hotelOption = secondaryResult?.data?.results?.[0];
      const hotelLeg = hotelOption?.segments?.[0] || hotelOption;

      if (!hotelLeg) return null;

      segments = [flightLeg, hotelLeg];
      totalCost = (flightLeg.price?.amount || 0) + (hotelLeg.price?.amount || 0);
    } else if (strategy === 'TRAIN_ONLY') {
      segments = rawOption.segments || [rawOption];
      totalCost = rawOption.price?.amount || 0;
    } else if (strategy === 'BUS_ONLY') {
      segments = rawOption.segments || [rawOption];
      totalCost = rawOption.price?.amount || 0;
    } else if (strategy === 'TRANSIT_HOTEL') {
      segments = rawOption.segments || [rawOption];
      totalCost = rawOption.price?.amount || 0;
    }

    const nowIso = new Date().toISOString();
    segments = segments.map((s) => ({
      ...s,
      retrievedAt: s.retrievedAt || nowIso,
      sourceTimestamp: s.sourceTimestamp || nowIso,
      dataConfidence: s.dataConfidence || 'MOCK',
    }));

    const firstSeg = segments[0];
    const lastSeg = segments[segments.length - 1];

    const dep = firstSeg ? new Date(firstSeg.departure) : new Date();
    const arr = lastSeg ? new Date(lastSeg.arrival) : new Date();
    const durationMin = Math.round((arr - dep) / 60000);

    return {
      planId: `PLAN-${strategy.substring(0, 3)}-${Date.now()}`,
      strategy,
      segments,
      totalCost,
      currency: 'INR',
      retrievedAt: nowIso,
      sourceTimestamp: nowIso,
      departureTime: dep.toISOString(),
      finalArrivalTime: arr.toISOString(),
      totalDurationMinutes: durationMin,
      transferCount: Math.max(0, segments.length - 1),
      status: 'CANDIDATE',
      hardConstraintsPassed: false,
      connectionsFeasible: false,
      rejectionReasons: [],
      score: 0,
      riskScore: 50,
      externalHandoffs: [
        {
          type: 'DEEPLINK',
          url: null,
          provider: firstSeg?.carrier || 'Carrier',
          verifiedAt: new Date().toISOString(),
          status: 'DEEPLINK_UNAVAILABLE',
        },
      ],
    };
  }

  /**
   * Determine initial strategy based on disruption type, budget constraints, and traveler preferences.
   */
  _selectInitialStrategy(observation) {
    const disType = (observation?.disruptionType || '').toUpperCase();
    const budget = observation?.maxAdditionalBudget || 0;
    const prefMode = observation?.softConstraints?.preferredTransportMode?.toLowerCase();

    // Mode-driven disruptions
    if (disType.includes('TRAIN')) {
      return 'TRAIN_ONLY';
    }
    if (disType.includes('BUS')) {
      return 'BUS_ONLY';
    }

    // Traveler preference
    if (prefMode === 'train') {
      return 'TRAIN_ONLY';
    }

    // Tight budget constraint (e.g. <= ₹2000)
    if (budget > 0 && budget <= 2000) {
      return 'TRAIN_ONLY';
    }

    // Default for air travel disruptions when budget permits
    return 'DIRECT_FLIGHT';
  }

  /**
   * Final verification of candidate plan against hard constraints, connection safety, complete route,
   * and live provider revalidation.
   */
  async _verifyPlan(plan, session, observation) {
    if (!plan || plan.status === 'INVALID') return false;

    // 1. Re-validate hard constraints directly
    const constraintCheck = constraintValidator.validate(plan, session.objective);
    if (!constraintCheck.valid) return false;

    // 2. Re-validate connection feasibility
    const connectionCheck = connectionValidator.validatePlanConnections(plan.segments);
    if (!connectionCheck.valid) return false;

    // 3. Ensure journey is non-empty, has arrival time, and covers route
    if (!plan.segments || plan.segments.length === 0 || !plan.finalArrivalTime) return false;

    // 4. Provider Revalidation of flight, train, and bus segments
    const { getProvider } = require('../providers');
    const flightProvider = getProvider('flight');
    const trainProvider = getProvider('train');
    const busProvider = getProvider('bus');
    const hotelProvider = getProvider('hotel');

    for (const seg of plan.segments) {
      if (seg.transportMode === 'flight' && seg.identifier) {
        try {
          const reval = await flightProvider.revalidate(seg.identifier);
          if (reval && reval.valid === false && !reval.fallbackNeeded) {
            eventLogger.log(
              session,
              'FAILURE_DETECTED',
              `Flight revalidation failed for ${seg.identifier}: ${reval.message || 'Cancelled or unavailable'}`,
              { segmentId: seg.segmentId, identifier: seg.identifier }
            );
            return false;
          }
        } catch (err) {
          console.warn(`[RecoveryPlanner] Flight revalidation warning: ${err.message}`);
        }
      } else if (seg.transportMode === 'train' && seg.identifier) {
        try {
          const reval = await trainProvider.revalidate(seg.identifier);
          if (reval && reval.valid === false && !reval.fallbackNeeded) {
            eventLogger.log(
              session,
              'FAILURE_DETECTED',
              `Train revalidation failed for ${seg.identifier}: ${reval.message || 'Cancelled or unavailable'}`,
              { segmentId: seg.segmentId, identifier: seg.identifier }
            );
            return false;
          }
        } catch (err) {
          console.warn(`[RecoveryPlanner] Train revalidation warning: ${err.message}`);
        }
      } else if (seg.transportMode === 'bus' && seg.identifier) {
        try {
          const reval = await busProvider.revalidate(seg.identifier);
          if (reval && reval.valid === false && !reval.fallbackNeeded) {
            eventLogger.log(
              session,
              'FAILURE_DETECTED',
              `Bus revalidation failed for ${seg.identifier}: ${reval.message || 'Cancelled or unavailable'}`,
              { segmentId: seg.segmentId, identifier: seg.identifier }
            );
            return false;
          }
        } catch (err) {
          console.warn(`[RecoveryPlanner] Bus revalidation warning: ${err.message}`);
        }
      } else if (seg.transportMode === 'hotel' && (seg.identifier || seg.hotelId)) {
        try {
          const reval = await hotelProvider.revalidate(seg.identifier || seg.hotelId);
          if (reval && reval.valid === false) {
            eventLogger.log(
              session,
              'FAILURE_DETECTED',
              `Hotel revalidation failed for ${seg.identifier || seg.hotelId}: ${reval.message || 'Sold out or unavailable'}`,
              { segmentId: seg.segmentId, identifier: seg.identifier || seg.hotelId }
            );
            return false;
          }
        } catch (err) {
          console.warn(`[RecoveryPlanner] Hotel revalidation warning: ${err.message}`);
        }
      }
    }

    return true;
  }
}

module.exports = new RecoveryPlanner();
