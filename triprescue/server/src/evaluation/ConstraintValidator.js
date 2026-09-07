/**
 * ConstraintValidator — Phase 2 deterministic hard constraint validation.
 *
 * Hard constraints are authoritative and must ALWAYS be evaluated before scoring.
 * A plan that violates any hard constraint is immediately INVALID.
 * The recovery engine never overrides hard constraints.
 */

class ConstraintValidator {
  /**
   * Validate a recovery plan against the recovery objective's hard constraints.
   * @param {Object} plan - The candidate plan to validate
   * @param {Object} objective - The recovery objective
   * @returns {{ valid: boolean, violations: Array, results: Array }}
   */
  validate(plan, objective) {
    const results = [];
    const violations = [];

    // 1. Budget validation (maximum additional budget)
    const budgetResult = this._validateBudget(plan, objective);
    results.push(budgetResult);
    if (!budgetResult.passed) violations.push(budgetResult);

    // 2. Origin validation (must start from origin)
    const originResult = this._validateOrigin(plan, objective);
    results.push(originResult);
    if (!originResult.passed) violations.push(originResult);

    // 3. Destination validation (must reach target destination)
    const destResult = this._validateDestination(plan, objective);
    results.push(destResult);
    if (!destResult.passed) violations.push(destResult);

    // 4. Arrival deadline validation
    const deadlineResult = this._validateDeadline(plan, objective);
    results.push(deadlineResult);
    if (!deadlineResult.passed) violations.push(deadlineResult);

    // 5. Passenger capacity check
    const paxResult = this._validatePassengers(plan, objective);
    results.push(paxResult);
    if (!paxResult.passed) violations.push(paxResult);

    // 6. Availability check
    const availResult = this._validateAvailability(plan);
    results.push(availResult);
    if (!availResult.passed) violations.push(availResult);

    // 7. Transport mode restrictions
    const restrictionResult = this._validateTransportRestrictions(plan, objective);
    results.push(restrictionResult);
    if (!restrictionResult.passed) violations.push(restrictionResult);

    // 8. Geographic route continuity
    const continuityResult = this._validateRouteContinuity(plan);
    results.push(continuityResult);
    if (!continuityResult.passed) violations.push(continuityResult);

    return {
      valid: violations.length === 0,
      violations,
      results,
    };
  }

  _validateBudget(plan, objective) {
    const maxBudget = objective?.maxAdditionalBudget !== undefined ? objective.maxAdditionalBudget : 0;
    const planCost = plan?.totalCost || 0;
    const passed = planCost <= maxBudget;

    return {
      type: 'BUDGET',
      passed,
      actual: planCost,
      limit: maxBudget,
      message: passed
        ? `Cost ₹${planCost} is within budget ₹${maxBudget}`
        : `Cost ₹${planCost} exceeds maximum additional budget ₹${maxBudget}`,
      failureType: passed ? null : 'BUDGET_EXCEEDED',
    };
  }

  _validateOrigin(plan, objective) {
    const requiredOrigin = (objective?.origin || '').toUpperCase().trim();
    const segments = plan?.segments || [];
    const firstSegment = segments.length > 0 ? segments[0] : null;
    const planOrigin = firstSegment
      ? (firstSegment.origin?.code || firstSegment.origin || '').toUpperCase().trim()
      : '';

    // If objective has origin specified, ensure plan starts from that origin
    const passed = !requiredOrigin || !planOrigin || requiredOrigin === planOrigin;

    return {
      type: 'ORIGIN',
      passed,
      actual: planOrigin,
      limit: requiredOrigin,
      message: passed
        ? `Plan departs from required origin ${requiredOrigin}`
        : `Plan origin ${planOrigin} does not match required origin ${requiredOrigin}`,
      failureType: passed ? null : 'ORIGIN_MISMATCH',
    };
  }

  _validateDestination(plan, objective) {
    const requiredDest = (objective?.destination || '').toUpperCase().trim();
    const segments = plan?.segments || [];
    const lastSegment = segments.length > 0 ? segments[segments.length - 1] : null;
    const planDest = lastSegment
      ? (lastSegment.destination?.code || lastSegment.destination || '').toUpperCase().trim()
      : '';

    const passed = requiredDest === planDest;

    return {
      type: 'DESTINATION',
      passed,
      actual: planDest,
      limit: requiredDest,
      message: passed
        ? `Plan correctly terminates at destination ${requiredDest}`
        : `Plan destination ${planDest} does not match required destination ${requiredDest}`,
      failureType: passed ? null : 'DESTINATION_MISMATCH',
    };
  }

  _validateDeadline(plan, objective) {
    if (!objective?.arrivalDeadline) {
      return {
        type: 'DEADLINE',
        passed: true,
        actual: null,
        limit: null,
        message: 'No arrival deadline set',
        failureType: null,
      };
    }

    const deadline = new Date(objective.arrivalDeadline);
    const arrival = plan?.finalArrivalTime ? new Date(plan.finalArrivalTime) : null;

    if (!arrival || isNaN(arrival.getTime())) {
      return {
        type: 'DEADLINE',
        passed: false,
        actual: null,
        limit: deadline.toISOString(),
        message: 'Plan has no valid final arrival timestamp',
        failureType: 'DEADLINE_MISSED',
      };
    }

    const passed = arrival <= deadline;
    const diffMinutes = Math.round((deadline - arrival) / 60000);

    return {
      type: 'DEADLINE',
      passed,
      actual: arrival.toISOString(),
      limit: deadline.toISOString(),
      message: passed
        ? `Arrives ${diffMinutes} minutes before deadline`
        : `Arrives ${Math.abs(diffMinutes)} minutes after deadline`,
      failureType: passed ? null : 'DEADLINE_MISSED',
    };
  }

  _validatePassengers(plan, objective) {
    const requiredPax = objective?.passengerCount || 1;
    const segments = plan?.segments || [];

    // Check if any segment specifies an explicit seat capacity below requiredPax
    const overCapacity = segments.find(
      (s) => typeof s.availableSeats === 'number' && s.availableSeats < requiredPax
    );

    const passed = !overCapacity;

    return {
      type: 'PASSENGERS',
      passed,
      actual: overCapacity ? overCapacity.availableSeats : requiredPax,
      limit: requiredPax,
      message: passed
        ? `Passenger capacity check passed for ${requiredPax} passenger(s)`
        : `Segment ${overCapacity?.segmentId || overCapacity?.carrier} has only ${overCapacity?.availableSeats} seats available, but ${requiredPax} required`,
      failureType: passed ? null : 'CAPACITY_EXCEEDED',
    };
  }

  _validateAvailability(plan) {
    const segments = plan?.segments || [];
    const unavailable = segments.filter((s) => s.availability === false);

    const passed = unavailable.length === 0;

    return {
      type: 'AVAILABILITY',
      passed,
      actual: unavailable.length,
      limit: 0,
      message: passed
        ? 'All segments are available'
        : `${unavailable.length} segment(s) marked as unavailable`,
      failureType: passed ? null : 'UNAVAILABLE',
    };
  }

  _validateTransportRestrictions(plan, objective) {
    const hardConstraints = objective?.hardConstraints || {};
    const excludedModes = hardConstraints.excludedModes || hardConstraints.excludedTransportModes || [];
    const segments = plan?.segments || [];

    const prohibitedSegment = segments.find((s) =>
      excludedModes.map((m) => m.toLowerCase()).includes((s.transportMode || '').toLowerCase())
    );

    const passed = !prohibitedSegment;

    return {
      type: 'TRANSPORT_RESTRICTION',
      passed,
      actual: prohibitedSegment?.transportMode || null,
      limit: excludedModes,
      message: passed
        ? 'No excluded transport modes used'
        : `Segment uses prohibited transport mode: ${prohibitedSegment?.transportMode}`,
      failureType: passed ? null : 'TRANSPORT_RESTRICTION_VIOLATED',
    };
  }

  _validateRouteContinuity(plan) {
    const segments = plan?.segments || [];
    if (segments.length <= 1) {
      return {
        type: 'ROUTE_CONTINUITY',
        passed: true,
        message: 'Direct single-segment route',
        failureType: null,
      };
    }

    // Check that destination of segment i is geographically continuous with origin of segment i+1
    // Known transfer cities or co-located hubs (e.g. DEL airport to NDLS railway station)
    const KNOWN_TRANSFERS = {
      'DEL:NDLS': true,
      'NDLS:DEL': true,
      'DEL:NZM': true,
      'NZM:DEL': true,
    };

    for (let i = 0; i < segments.length - 1; i++) {
      const fromDest = (segments[i].destination?.code || segments[i].destination || '').toUpperCase();
      const toOrigin = (segments[i + 1].origin?.code || segments[i + 1].origin || '').toUpperCase();

      if (fromDest !== toOrigin && !KNOWN_TRANSFERS[`${fromDest}:${toOrigin}`]) {
        return {
          type: 'ROUTE_CONTINUITY',
          passed: false,
          actual: `${fromDest} → ${toOrigin}`,
          limit: 'Continuous connection',
          message: `Geographic gap between arrival at ${fromDest} and departure from ${toOrigin}`,
          failureType: 'DESTINATION_MISMATCH',
        };
      }
    }

    return {
      type: 'ROUTE_CONTINUITY',
      passed: true,
      message: 'All itinerary segments form a geographically continuous journey',
      failureType: null,
    };
  }
}

module.exports = new ConstraintValidator();
