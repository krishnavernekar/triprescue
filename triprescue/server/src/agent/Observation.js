/**
 * Observation — Phase 2 Normalized Agent Observation.
 *
 * Inspects current trip state, disruption, recovery objective,
 * previously attempted strategies, and failure history to give
 * the DecisionEngine a clear, unified view of the situation.
 */

class Observation {
  /**
   * Build an observation snapshot from session and trip state.
   * @param {Object} recoverySession - The RecoverySession document
   * @param {Object} trip - The associated Trip document (or snapshot)
   * @returns {Object} Normalized observation
   */
  static build(recoverySession, trip = null) {
    const objective = recoverySession.objective || recoverySession.objectiveSnapshot || {};
    const disruption = recoverySession.disruption || recoverySession.disruptionSnapshot || {};
    const itinerary = recoverySession.currentItinerary || recoverySession.itinerarySnapshot || [];

    const origin = objective.origin || trip?.origin || itinerary[0]?.origin?.code || 'BLR';
    const destination = objective.destination || trip?.destination || itinerary[itinerary.length - 1]?.destination?.code || 'JAI';

    const now = new Date();
    const deadline = objective.arrivalDeadline ? new Date(objective.arrivalDeadline) : null;
    const remainingMinutes = deadline ? Math.round((deadline - now) / 60000) : null;

    return {
      observationId: `OBS-${Date.now()}`,
      timestamp: now.toISOString(),
      tripId: recoverySession.tripId,
      sessionId: recoverySession._id,
      tripStatus: trip?.status || 'DISRUPTED',
      sessionStatus: recoverySession.status,
      disruptionType: disruption.type || 'UNKNOWN',
      disruptionDescription: disruption.description || '',
      affectedSegmentId: disruption.affectedSegmentId || null,
      origin: origin.toUpperCase(),
      destination: destination.toUpperCase(),
      departureTime: objective.departureTime || trip?.departureTime || now.toISOString(),
      arrivalDeadline: objective.arrivalDeadline,
      remainingMinutes,
      maxAdditionalBudget: objective.maxAdditionalBudget || 0,
      passengerCount: objective.passengerCount || 1,
      priority: objective.priority || 'arrival_time',
      riskTolerance: objective.riskTolerance || 'MEDIUM',
      hardConstraints: objective.hardConstraints || {},
      softConstraints: objective.softConstraints || {},
      currentItineraryCount: itinerary.length,
      currentStrategy: recoverySession.currentStrategy || null,
      attemptedStrategies: recoverySession.attemptedStrategies || [],
      candidatePlansCount: (recoverySession.candidatePlans || []).length,
      previousFailures: recoverySession.failures || [],
      adaptationCount: (recoverySession.adaptationHistory || []).length,
      iterationCount: recoverySession.iterationCount || 0,
    };
  }
}

module.exports = Observation;
