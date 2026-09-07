/**
 * ActionValidator — Phase 2 Action Validation Engine.
 *
 * Verifies that a generated action is supported, targeted at a registered tool,
 * has valid parameters with correct types, and is permitted in the current state.
 */

const SUPPORTED_ACTIONS = [
  'SEARCH_FLIGHTS',
  'SEARCH_TRAINS',
  'SEARCH_BUSES',
  'SEARCH_HOTELS',
  'CALCULATE_ROUTE',
  'EVALUATE_PLAN',
  'REVALIDATE_PLAN',
  'ADAPT_STRATEGY',
  'VERIFY_PLAN',
  'CHECK_CALENDAR_CONFLICT',
  'ANALYZE_INSURANCE',
  'CHECK_COMPENSATION',
  'RUN_SIMULATION',
];

const ACTION_TOOL_MAP = {
  SEARCH_FLIGHTS: 'flight',
  SEARCH_TRAINS: 'train',
  SEARCH_BUSES: 'bus',
  SEARCH_HOTELS: 'hotel',
  CALCULATE_ROUTE: 'route',
  EVALUATE_PLAN: 'evaluator',
  REVALIDATE_PLAN: 'revalidator',
  ADAPT_STRATEGY: 'adaptation',
  VERIFY_PLAN: 'verifier',
  CHECK_CALENDAR_CONFLICT: 'calendar',
  ANALYZE_INSURANCE: 'insurance',
  CHECK_COMPENSATION: 'compensation',
  RUN_SIMULATION: 'simulation',
};

class ActionValidator {
  /**
   * Validate an action object before execution.
   * @param {Object} action - The action to validate
   * @param {Object} sessionState - Current recovery session state
   * @returns {{ valid: boolean, errors: string[] }}
   */
  validate(action, sessionState = {}) {
    const errors = [];

    if (!action) {
      return { valid: false, errors: ['Action object is required'] };
    }

    // 1. Supported action check
    if (!action.type || !SUPPORTED_ACTIONS.includes(action.type)) {
      errors.push(`Action type '${action.type}' is not supported. Allowed: ${SUPPORTED_ACTIONS.join(', ')}`);
    }

    // 2. Tool alignment check
    const expectedTool = ACTION_TOOL_MAP[action.type];
    if (action.tool && expectedTool && action.tool !== expectedTool) {
      errors.push(`Action '${action.type}' expects tool '${expectedTool}', but received '${action.tool}'`);
    }

    // 3. Parameters presence & type checks
    if (!action.parameters || typeof action.parameters !== 'object') {
      errors.push(`Action '${action.type}' requires a parameters object`);
    } else {
      if (['SEARCH_FLIGHTS', 'SEARCH_TRAINS', 'SEARCH_BUSES'].includes(action.type)) {
        if (!action.parameters.origin || typeof action.parameters.origin !== 'string') {
          errors.push(`Action '${action.type}' requires a valid string origin parameter`);
        }
        if (!action.parameters.destination || typeof action.parameters.destination !== 'string') {
          errors.push(`Action '${action.type}' requires a valid string destination parameter`);
        }
      }
      if (action.type === 'SEARCH_HOTELS') {
        if (!action.parameters.location || typeof action.parameters.location !== 'string') {
          errors.push(`Action 'SEARCH_HOTELS' requires a valid string location parameter`);
        }
      }
      if (action.type === 'CHECK_CALENDAR_CONFLICT') {
        if (!action.parameters.arrivalTime) {
          errors.push(`Action 'CHECK_CALENDAR_CONFLICT' requires an arrivalTime parameter`);
        }
      }
      if (action.type === 'ANALYZE_INSURANCE') {
        if (!action.parameters.policyText || typeof action.parameters.policyText !== 'string') {
          errors.push(`Action 'ANALYZE_INSURANCE' requires a valid string policyText parameter`);
        }
      }
      if (action.type === 'CHECK_COMPENSATION') {
        if (!action.parameters.disruptionFacts || typeof action.parameters.disruptionFacts !== 'object') {
          errors.push(`Action 'CHECK_COMPENSATION' requires a disruptionFacts object`);
        }
      }
      if (action.type === 'RUN_SIMULATION') {
        if (!action.parameters.sessionId) {
          errors.push(`Action 'RUN_SIMULATION' requires a sessionId parameter`);
        }
      }
    }

    // 4. State lifecycle permission check
    const sessionStatus = sessionState.status || 'RECOVERING';
    const disallowedInStatuses = ['CANCELLED', 'COMPLETED', 'EXPIRED'];
    if (disallowedInStatuses.includes(sessionStatus)) {
      errors.push(`Action execution is not permitted when session status is '${sessionStatus}'`);
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}

module.exports = new ActionValidator();
