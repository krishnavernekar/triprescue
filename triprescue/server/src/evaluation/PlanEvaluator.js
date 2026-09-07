/**
 * PlanEvaluator — Phase 2 deterministic plan evaluation.
 *
 * Orchestrates ConstraintValidator and ConnectionValidator.
 * Transitions plan status: CANDIDATE → VALIDATING → VALID / INVALID
 */

const constraintValidator = require('./ConstraintValidator');
const connectionValidator = require('./ConnectionValidator');

class PlanEvaluator {
  /**
   * Evaluate a candidate plan against the recovery objective.
   * @param {Object} plan - The candidate plan
   * @param {Object} objective - The recovery objective
   * @returns {Object} evaluated plan with status, results, rejectionReasons
   */
  evaluate(plan, objective) {
    const evaluated = { ...plan, status: 'VALIDATING' };
    const rejectionReasons = [];

    // 1. Hard constraint validation
    const constraintResult = constraintValidator.validate(plan, objective);
    evaluated.constraintResults = constraintResult.results;
    evaluated.hardConstraintsPassed = constraintResult.valid;

    if (!constraintResult.valid) {
      for (const v of constraintResult.violations) {
        rejectionReasons.push(`${v.type}: ${v.message}`);
      }
    }

    // 2. Connection feasibility validation
    const segments = plan.segments || [];
    const connectionResult = connectionValidator.validatePlanConnections(segments);
    evaluated.connectionResults = connectionResult.results;
    evaluated.connectionsFeasible = connectionResult.valid;

    // UNKNOWN connections don't invalidate — they just flag uncertainty
    const invalidConnections = (connectionResult.results || []).filter(
      (r) => r.status === 'INVALID'
    );
    if (invalidConnections.length > 0) {
      for (const ic of invalidConnections) {
        rejectionReasons.push(`CONNECTION: ${ic.message}`);
      }
      evaluated.connectionsFeasible = false;
    }

    // Determine plan status
    const isValid = constraintResult.valid && evaluated.connectionsFeasible;
    evaluated.status = isValid ? 'VALID' : 'INVALID';
    evaluated.rejectionReasons = rejectionReasons;
    if (!isValid) {
      evaluated.score = 0;
    }

    // Derive primary failure type for adaptation engine
    evaluated.primaryFailureType = this._determinePrimaryFailureType(
      constraintResult,
      connectionResult
    );

    return evaluated;
  }

  /**
   * Determine the most important failure type for the adaptation engine.
   */
  _determinePrimaryFailureType(constraintResult, connectionResult) {
    // Check hard constraint violations first
    for (const v of constraintResult.violations || []) {
      if (v.failureType) return v.failureType;
    }

    // Check connection failures
    const invalidConn = (connectionResult.results || []).find((r) => r.status === 'INVALID');
    if (invalidConn) return invalidConn.failureType || 'INSUFFICIENT_TRANSFER_TIME';

    return null;
  }
}

module.exports = new PlanEvaluator();
