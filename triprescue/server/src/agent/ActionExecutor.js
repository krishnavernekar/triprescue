/**
 * ActionExecutor — Phase 3 Resilient Action Dispatcher.
 *
 * Dispatches validated actions to provider pairs (Primary -> Fallback -> Mock)
 * using FallbackManager to protect against API failures, stale data, and quota limits.
 */

const { getProviderPair } = require('../providers');
const fallbackManager = require('../providers/FallbackManager');

class ActionExecutor {
  /**
   * Execute a validated action against the provider layer with fallback resilience.
   * @param {Object} action - Validated action
   * @param {Object} options - { sessionId, emitEventFn }
   * @returns {Promise<{ success: boolean, data: any, error?: string, durationMs: number }>}
   */
  async execute(action, options = {}) {
    const startTime = Date.now();

    try {
      let result = null;

      switch (action.type) {
        case 'SEARCH_FLIGHTS': {
          const { primary, fallback } = getProviderPair('flight');
          result = await fallbackManager.execute('flight', 'search', primary, fallback, action.parameters, options);
          break;
        }

        case 'SEARCH_TRAINS': {
          const { primary, fallback } = getProviderPair('train');
          result = await fallbackManager.execute('train', 'search', primary, fallback, action.parameters, options);
          break;
        }

        case 'SEARCH_BUSES': {
          const { primary, fallback } = getProviderPair('bus');
          result = await fallbackManager.execute('bus', 'search', primary, fallback, action.parameters, options);
          break;
        }

        case 'SEARCH_HOTELS': {
          const { primary, fallback } = getProviderPair('hotel');
          result = await fallbackManager.execute('hotel', 'search', primary, fallback, action.parameters, options);
          break;
        }

        case 'CALCULATE_ROUTE': {
          const { primary, fallback } = getProviderPair('route');
          result = await fallbackManager.execute('route', 'calculateRoute', primary, fallback, {
            origin: action.parameters.origin,
            destination: action.parameters.destination,
            mode: action.parameters.mode || 'DRIVE',
          }, options);
          break;
        }

        case 'EVALUATE_PLAN': {
          const planEvaluator = require('../evaluation/PlanEvaluator');
          result = planEvaluator.evaluate(action.parameters.plan, action.parameters.objective || {});
          break;
        }

        case 'REVALIDATE_PLAN': {
          const { getProvider } = require('../providers');
          const flightProvider = getProvider('flight');
          const trainProvider = getProvider('train');
          const busProvider = getProvider('bus');
          const hotelProvider = getProvider('hotel');
          const segments = action.parameters.segments || [];
          const revalResults = [];
          for (const seg of segments) {
            if (seg.transportMode === 'flight' && seg.identifier) {
              const res = await flightProvider.revalidate(seg.identifier);
              revalResults.push({ identifier: seg.identifier, mode: 'flight', ...res });
            } else if (seg.transportMode === 'train' && seg.identifier) {
              const res = await trainProvider.revalidate(seg.identifier);
              revalResults.push({ identifier: seg.identifier, mode: 'train', ...res });
            } else if (seg.transportMode === 'bus' && seg.identifier) {
              const res = await busProvider.revalidate(seg.identifier);
              revalResults.push({ identifier: seg.identifier, mode: 'bus', ...res });
            } else if (seg.transportMode === 'hotel' && (seg.identifier || seg.hotelId)) {
              const res = await hotelProvider.revalidate(seg.identifier || seg.hotelId);
              revalResults.push({ identifier: seg.identifier || seg.hotelId, mode: 'hotel', ...res });
            }
          }
          result = { revalidated: true, results: revalResults };
          break;
        }

        case 'ADAPT_STRATEGY': {
          const adaptationEngine = require('./AdaptationEngine');
          result = adaptationEngine.adapt(
            action.parameters.currentStrategy,
            action.parameters.failureReason,
            action.parameters.attemptedStrategies || [],
            action.parameters.observation || {}
          );
          break;
        }

        case 'VERIFY_PLAN': {
          const constraintValidator = require('../evaluation/ConstraintValidator');
          const connectionValidator = require('../evaluation/ConnectionValidator');
          const plan = action.parameters.plan;
          const objective = action.parameters.objective || {};
          const cCheck = constraintValidator.validate(plan, objective);
          const connCheck = connectionValidator.validatePlanConnections(plan?.segments || []);
          result = {
            verified: cCheck.valid && connCheck.valid,
            constraints: cCheck,
            connections: connCheck,
          };
          break;
        }

        case 'CHECK_CALENDAR_CONFLICT': {
          const { calendarService } = require('../calendar');
          result = await calendarService.detectConflicts(action.parameters.arrivalTime);
          break;
        }

        case 'ANALYZE_INSURANCE': {
          const { getProvider } = require('../providers');
          const provider = getProvider('insurance');
          result = await provider.analyzePolicy(
            action.parameters.policyText,
            action.parameters.disruptionFacts || {}
          );
          break;
        }

        case 'CHECK_COMPENSATION': {
          const { getProvider } = require('../providers');
          const provider = getProvider('compensation');
          result = await provider.checkCompensation(
            action.parameters.disruptionFacts || {},
            action.parameters.passengerInfo || {}
          );
          break;
        }

        case 'RUN_SIMULATION': {
          const stateManager = require('./StateManager');
          const simulationService = require('../simulation/SimulationService');
          const session = await stateManager.loadSession(action.parameters.sessionId);
          if (!session) {
            throw new Error(`Recovery session ${action.parameters.sessionId} not found`);
          }
          result = simulationService.simulate(session, action.parameters.scenario || {});
          break;
        }

        default:
          throw new Error(`Unhandled action type: ${action.type}`);
      }

      return {
        success: true,
        data: result,
        durationMs: Date.now() - startTime,
      };
    } catch (error) {
      return {
        success: false,
        data: null,
        error: error.message || 'Action execution failed',
        durationMs: Date.now() - startTime,
      };
    }
  }
}

module.exports = new ActionExecutor();
