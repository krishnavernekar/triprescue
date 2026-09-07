/**
 * AdaptationEngine — Phase 2 Dynamic, State-Driven Strategy Switching.
 *
 * Chooses the next viable recovery strategy based on:
 * - Specific structured failure reason (BUDGET_EXCEEDED, INSUFFICIENT_TRANSFER_TIME, etc.)
 * - Current observation snapshot (budget limits, remaining time to deadline, disruption type)
 * - Strict history of attempted strategies to prevent infinite loops
 *
 * Deterministic rules — no LLM.
 */

class AdaptationEngine {
  /**
   * Determine the next recovery strategy dynamically from failure type and current state.
   * @param {string} currentStrategy - The strategy that just failed
   * @param {string} failureReason - Standardized failure type
   * @param {Array<string>} attemptedStrategies - Strategies already attempted
   * @param {Object} observation - Active situational observation
   * @returns {{ nextStrategy: string|null, reason: string, triggeredBy: string }}
   */
  adapt(currentStrategy, failureReason, attemptedStrategies = [], observation = {}) {
    const budget = observation.maxAdditionalBudget || 0;
    const remainingMinutes = observation.remainingMinutes;
    const disruptionType = observation.disruptionType || '';
    const preferredMode = observation.softConstraints?.preferredTransportMode;

    let candidateStrategies = [];

    // 1. DYNAMIC STRATEGY RANKING BASED ON FAILURE REASON & STATE
    switch (failureReason) {
      case 'BUDGET_EXCEEDED':
        // Budget failed: cheaper alternatives needed.
        // If budget is very tight (<= ₹3000), prefer ground/train directly over connecting flights
        if (budget > 0 && budget <= 3000) {
          candidateStrategies = ['FLIGHT_PLUS_TRAIN', 'TRAIN_ONLY', 'FLIGHT_PLUS_BUS', 'BUS_ONLY', 'CONNECTING_FLIGHT'];
        } else {
          candidateStrategies = ['CONNECTING_FLIGHT', 'FLIGHT_PLUS_TRAIN', 'TRAIN_ONLY', 'FLIGHT_PLUS_BUS', 'BUS_ONLY'];
        }
        break;

      case 'INSUFFICIENT_TRANSFER_TIME':
      case 'INVALID_CONNECTION':
        // Connection window at hub breached safety threshold.
        // Switch to multimodal or alternative hub / ground transit with wider transfer windows.
        candidateStrategies = ['FLIGHT_PLUS_TRAIN', 'NEARBY_AIRPORT', 'MULTIMODAL_REPLAN', 'TRAIN_ONLY', 'BUS_ONLY'];
        break;

      case 'DEADLINE_MISSED':
        // Time is critical: need faster modes. Avoid slow trains or buses if long distance.
        if (remainingMinutes !== null && remainingMinutes < 300) {
          candidateStrategies = ['DIRECT_FLIGHT', 'CONNECTING_FLIGHT', 'FLIGHT_PLUS_TRAIN'];
        } else {
          candidateStrategies = ['DIRECT_FLIGHT', 'CONNECTING_FLIGHT', 'FLIGHT_PLUS_TRAIN', 'TRAIN_ONLY'];
        }
        break;

      case 'DESTINATION_MISMATCH':
      case 'ORIGIN_MISMATCH':
        // Route doesn't span complete journey: prioritize full multimodal replanning
        candidateStrategies = ['MULTIMODAL_REPLAN', 'FLIGHT_PLUS_TRAIN', 'CONNECTING_FLIGHT', 'TRAIN_ONLY'];
        break;

      case 'CAPACITY_EXCEEDED':
      case 'UNAVAILABLE':
        // Carrier / seats full: switch transport mode or route
        if (currentStrategy.includes('FLIGHT')) {
          candidateStrategies = ['FLIGHT_PLUS_TRAIN', 'TRAIN_ONLY', 'CONNECTING_FLIGHT', 'BUS_ONLY'];
        } else {
          candidateStrategies = ['CONNECTING_FLIGHT', 'DIRECT_FLIGHT', 'BUS_ONLY'];
        }
        break;

      case 'NO_RESULTS':
        // No options for current mode
        if (disruptionType.includes('TRAIN')) {
          candidateStrategies = ['BUS_ONLY', 'DIRECT_FLIGHT', 'CONNECTING_FLIGHT'];
        } else {
          candidateStrategies = ['CONNECTING_FLIGHT', 'FLIGHT_PLUS_TRAIN', 'TRAIN_ONLY', 'BUS_ONLY'];
        }
        break;

      case 'OVERNIGHT_DELAY':
      case 'ARRIVAL_TOO_LATE':
      case 'HOTEL_REQUIRED':
        candidateStrategies = ['FLIGHT_PLUS_HOTEL', 'TRANSIT_HOTEL', 'MULTIMODAL_REPLAN'];
        break;

      default:
        // General fallback respecting traveler preferences if set
        if (preferredMode === 'train') {
          candidateStrategies = ['TRAIN_ONLY', 'FLIGHT_PLUS_TRAIN', 'DIRECT_FLIGHT', 'CONNECTING_FLIGHT'];
        } else {
          candidateStrategies = ['DIRECT_FLIGHT', 'CONNECTING_FLIGHT', 'FLIGHT_PLUS_TRAIN', 'TRAIN_ONLY', 'BUS_ONLY'];
        }
        break;
    }

    // 2. FILTER OUT STRATEGIES ALREADY ATTEMPTED
    const nextStrategy = candidateStrategies.find(
      (strat) => strat !== currentStrategy && !attemptedStrategies.includes(strat)
    );

    if (nextStrategy) {
      return {
        nextStrategy,
        reason: `Strategy ${currentStrategy} failed due to ${failureReason}. State-driven engine selected viable alternative [${nextStrategy}].`,
        triggeredBy: failureReason || 'EVALUATION_FAILURE',
      };
    }

    // 3. IF NO CANDIDATE FROM TAILORED LIST, TRY ANY UNATTEMPTED RECOVERY STRATEGY
    const ALL_STRATEGIES = [
      'DIRECT_FLIGHT',
      'CONNECTING_FLIGHT',
      'FLIGHT_PLUS_TRAIN',
      'TRAIN_ONLY',
      'FLIGHT_PLUS_BUS',
      'BUS_ONLY',
      'FLIGHT_PLUS_HOTEL',
      'TRANSIT_HOTEL',
      'NEARBY_AIRPORT',
      'MULTIMODAL_REPLAN',
    ];

    const fallbackAny = ALL_STRATEGIES.find(
      (strat) => strat !== currentStrategy && !attemptedStrategies.includes(strat)
    );

    if (fallbackAny) {
      return {
        nextStrategy: fallbackAny,
        reason: `Previous strategy ${currentStrategy} failed (${failureReason}). Exploring alternative unattempted strategy [${fallbackAny}].`,
        triggeredBy: failureReason || 'GENERAL_FALLBACK',
      };
    }

    // 4. STRATEGIES EXHAUSTED: RETURN NULL
    return {
      nextStrategy: null,
      reason: `All viable recovery strategies have been exhausted (${attemptedStrategies.length} attempted) without finding a plan that satisfies all hard constraints.`,
      triggeredBy: 'NO_FEASIBLE_RECOVERY',
    };
  }
}

module.exports = new AdaptationEngine();
