/**
 * CascadeImpactEngine — Deterministic Downstream Impact Analysis.
 *
 * When an earlier segment changes or experiences a disruption:
 * 1. Identifies directly and indirectly dependent segments.
 * 2. Propagates delay through transfers.
 * 3. Determines which connections become infeasible.
 * 4. Identifies arrival timing impacts and potential deadline conflicts.
 * 5. Returns a structured cascade impact report.
 */

const connectionValidator = require('./ConnectionValidator');

class CascadeImpactEngine {
  /**
   * Analyze downstream cascade impact of a delay or segment disruption.
   * @param {Array} itinerary - Current itinerary segments
   * @param {Object} disruption - Disruption event
   * @param {number} additionalDelayMinutes - Hypothetical or actual delay in minutes
   * @param {Object} objective - Recovery objective
   * @returns {Object} Impact report with affectedSegments, brokenConnections, deadlineRisk
   */
  analyzeImpact(itinerary = [], disruption = {}, additionalDelayMinutes = 0, objective = {}) {
    const affectedSegments = [];
    const brokenConnections = [];
    let cumulativeDelay = additionalDelayMinutes;

    if (!itinerary || itinerary.length === 0) {
      return {
        hasImpact: false,
        affectedSegments: [],
        brokenConnections: [],
        deadlineConflict: false,
        summary: 'No active itinerary to analyze.',
      };
    }

    // Identify the initial disrupted segment index
    let startIndex = 0;
    if (disruption?.affectedSegmentId) {
      const idx = itinerary.findIndex((s) => s.segmentId === disruption.affectedSegmentId);
      if (idx !== -1) startIndex = idx;
    }

    // If cancellation, all downstream segments are disconnected
    const isCancelled = disruption?.type?.includes('CANCELLED');

    if (isCancelled) {
      for (let i = startIndex; i < itinerary.length; i++) {
        const seg = itinerary[i];
        affectedSegments.push({
          segmentId: seg.segmentId,
          transportMode: seg.transportMode,
          carrier: seg.carrier,
          identifier: seg.identifier,
          impactType: i === startIndex ? 'CANCELLED' : 'DISCONNECTED_DOWNSTREAM',
          description: i === startIndex
            ? `Primary cancelled segment (${seg.carrier} ${seg.identifier})`
            : `Downstream connection severed due to cancellation of earlier segment`,
          severityLevel: 'CRITICAL',
        });
      }

      return {
        hasImpact: true,
        disruptedSegmentIndex: startIndex,
        affectedSegments,
        brokenConnections: itinerary.length > 1 ? ['All downstream connections severed'] : [],
        deadlineConflict: true,
        summary: `Segment ${itinerary[startIndex]?.identifier || startIndex} cancelled; ${itinerary.length - startIndex} downstream segments affected.`,
      };
    }

    // Delay Propagation Analysis
    let currentArrival = new Date(itinerary[startIndex].arrival);
    // Add cumulative delay to the disrupted segment's arrival
    currentArrival = new Date(currentArrival.getTime() + cumulativeDelay * 60000);

    affectedSegments.push({
      segmentId: itinerary[startIndex].segmentId,
      transportMode: itinerary[startIndex].transportMode,
      carrier: itinerary[startIndex].carrier,
      identifier: itinerary[startIndex].identifier,
      impactType: 'DELAYED',
      originalArrival: itinerary[startIndex].arrival,
      projectedArrival: currentArrival.toISOString(),
      delayMinutes: cumulativeDelay,
      severityLevel: cumulativeDelay > 60 ? 'HIGH' : 'MEDIUM',
      description: `Primary delay of ${cumulativeDelay} minutes on ${itinerary[startIndex].carrier} ${itinerary[startIndex].identifier}`,
    });

    // Check subsequent connections
    for (let i = startIndex; i < itinerary.length - 1; i++) {
      const current = itinerary[i];
      const next = itinerary[i + 1];

      // Simulated current segment arrival with cumulative delay
      const simulatedCurrent = {
        ...current,
        arrival: currentArrival,
      };

      const connCheck = connectionValidator.validateConnection(simulatedCurrent, next);

      if (connCheck.status === 'INVALID') {
        brokenConnections.push({
          fromSegmentId: current.segmentId,
          toSegmentId: next.segmentId,
          availableMinutes: connCheck.availableMinutes,
          requiredMinutes: connCheck.requiredMinutes,
          description: `Transfer between ${current.carrier || current.segmentId} and ${next.carrier || next.segmentId} breached safety threshold (${connCheck.availableMinutes} min available < ${connCheck.requiredMinutes} min required)`,
        });

        affectedSegments.push({
          segmentId: next.segmentId,
          transportMode: next.transportMode,
          carrier: next.carrier,
          identifier: next.identifier,
          impactType: 'CONNECTION_BROKEN',
          severityLevel: 'CRITICAL',
          description: `Downstream connection to ${next.carrier} ${next.identifier} is infeasible due to accumulated upstream delay`,
        });
      } else {
        // If connection holds, delay might still affect final arrival
        affectedSegments.push({
          segmentId: next.segmentId,
          transportMode: next.transportMode,
          carrier: next.carrier,
          identifier: next.identifier,
          impactType: 'CONNECTION_SQUEEZED',
          severityLevel: connCheck.availableMinutes < connCheck.requiredMinutes + 15 ? 'HIGH' : 'LOW',
          description: `Transfer window compressed to ${connCheck.availableMinutes} minutes`,
        });
      }
    }

    // Check Final Deadline Impact
    let deadlineConflict = false;
    const finalSegment = itinerary[itinerary.length - 1];
    if (objective?.arrivalDeadline && finalSegment?.arrival) {
      const finalEstArrival = new Date(new Date(finalSegment.arrival).getTime() + cumulativeDelay * 60000);
      const deadline = new Date(objective.arrivalDeadline);
      if (finalEstArrival > deadline) {
        deadlineConflict = true;
      }
    }

    return {
      hasImpact: affectedSegments.length > 0 || brokenConnections.length > 0,
      disruptedSegmentIndex: startIndex,
      delayMinutes: cumulativeDelay,
      affectedSegments,
      brokenConnections,
      deadlineConflict,
      summary: brokenConnections.length > 0
        ? `Upstream disruption broke ${brokenConnections.length} downstream transfer connection(s).`
        : `Delay propagates with ${affectedSegments.length} segments under compressed schedules.`,
    };
  }
}

module.exports = new CascadeImpactEngine();
