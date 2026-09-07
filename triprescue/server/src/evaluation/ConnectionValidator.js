/**
 * ConnectionValidator — Phase 3 Physical Transfer & Route Verification Engine.
 *
 * Formula:
 *   availableTransferTime = nextSegment.departure - previousSegment.arrival
 *   requiredTransferTime = physicalTransferDurationMinutes + minimumSafetyBufferMinutes (30 min)
 *   Valid when: availableTransferTime >= requiredTransferTime
 *
 * Supports route verification from Google Routes API, physical baseline estimates,
 * or mock route provider. Stamps confidence and source.
 */

const MINIMUM_SAFETY_BUFFER_MINUTES = 30; // 30-minute safety buffer

// Known physical transfer durations between key Indian transit hubs (minutes)
const KNOWN_TRANSFER_DURATIONS = {
  // Delhi airport (DEL) to New Delhi Railway Station (NDLS)
  'DEL:NDLS': 45,
  'NDLS:DEL': 45,
  // DEL airport to Hazrat Nizamuddin (NZM)
  'DEL:NZM': 50,
  'NZM:DEL': 50,
  // Bengaluru airport (BLR) to KSR Bengaluru City (SBC)
  'BLR:SBC': 65,
  'SBC:BLR': 65,
  // Mumbai airport (BOM) to CSMT
  'BOM:CSMT': 75,
  'CSMT:BOM': 75,
  // DEL airport to ISBT Kashmiri Gate bus terminal
  'DEL:ISBT': 45,
  'ISBT:DEL': 45,
  // Same airport / airside minimum connection times
  'DEL:DEL': 60,
  'BLR:BLR': 60,
  'BOM:BOM': 75,
  'MAA:MAA': 60,
  'CCU:CCU': 90,
  DEFAULT_SAME_AIRPORT: 60,
  DEFAULT_AIRPORT_TO_STATION: 60,
  DEFAULT_AIRPORT_TO_BUS: 45,
  DEFAULT_STATION_TO_BUS: 30,
  DEFAULT_AIRPORT_TO_HOTEL: 20,
  DEFAULT_STATION_TO_HOTEL: 15,
  DEFAULT_HOTEL_TO_AIRPORT: 30,
  DEFAULT_HOTEL_TO_STATION: 20,
};

class ConnectionValidator {
  /**
   * Validate all connections in a plan's segment array.
   * @param {Array} segments - Array of plan segments ordered by departure
   * @param {Object} routeOverrides - Optional map of route info keyed by "fromId:toId"
   * @returns {{ valid: boolean, results: Array, overallConfidence: string }}
   */
  validatePlanConnections(segments, routeOverrides = {}) {
    if (!segments || segments.length <= 1) {
      return {
        valid: true,
        results: [],
        overallConfidence: 'MOCK',
        message: 'Single segment — no connections to validate',
      };
    }

    const results = [];
    let allValid = true;
    let hasEstimated = false;

    for (let i = 0; i < segments.length - 1; i++) {
      const current = segments[i];
      const next = segments[i + 1];
      const overrideKey = `${current.segmentId}:${next.segmentId}`;
      const routeInfo = routeOverrides[overrideKey] || null;

      const result = this.validateConnection(current, next, routeInfo);
      results.push(result);

      if (result.status === 'INVALID') {
        allValid = false;
      }
      if (result.routeConfidence === 'ESTIMATED') {
        hasEstimated = true;
      }
    }

    return {
      valid: allValid,
      results,
      overallConfidence: hasEstimated ? 'ESTIMATED' : (results[0]?.routeConfidence || 'MOCK'),
    };
  }

  /**
   * Validate a single connection between two consecutive segments.
   * @param {Object} fromSegment - Preceding segment
   * @param {Object} toSegment - Succeeding segment
   * @param {Object|number} routeOrMinutes - Route calculation object or numeric minutes
   */
  validateConnection(fromSegment, toSegment, routeOrMinutes = null) {
    const fromSegId = fromSegment.segmentId || 'unknown-from';
    const toSegId = toSegment.segmentId || 'unknown-to';

    const fromArrival = new Date(fromSegment.arrival);
    const toDeparture = new Date(toSegment.departure);

    if (isNaN(fromArrival.getTime()) || isNaN(toDeparture.getTime())) {
      return {
        fromSegmentId: fromSegId,
        toSegmentId: toSegId,
        availableMinutes: null,
        requiredMinutes: null,
        bufferMinutes: MINIMUM_SAFETY_BUFFER_MINUTES,
        transferDurationMinutes: null,
        routeConfidence: 'ESTIMATED',
        routeSource: 'UNKNOWN',
        status: 'UNKNOWN',
        message: 'Cannot validate connection — missing arrival or departure timestamp',
      };
    }

    const availableMinutes = Math.round((toDeparture - fromArrival) / 60000);

    // Resolve physical transfer duration, confidence, and source
    let transferMinutes = null;
    let routeConfidence = 'MOCK';
    let routeSource = 'MOCK';

    if (typeof routeOrMinutes === 'number') {
      transferMinutes = routeOrMinutes;
      routeConfidence = 'LIVE';
      routeSource = 'CUSTOM_OVERRIDE';
    } else if (routeOrMinutes && typeof routeOrMinutes === 'object') {
      transferMinutes = routeOrMinutes.durationMinutes !== undefined ? routeOrMinutes.durationMinutes : routeOrMinutes.duration;
      routeConfidence = routeOrMinutes.confidence || 'LIVE';
      routeSource = routeOrMinutes.source || routeOrMinutes.provider || 'GOOGLE_ROUTES';
    } else {
      transferMinutes = this._getTransferDuration(fromSegment, toSegment);
      routeConfidence = transferMinutes !== null ? 'ESTIMATED' : 'UNKNOWN';
      routeSource = 'FALLBACK_ESTIMATE';
    }

    if (transferMinutes === null) {
      return {
        fromSegmentId: fromSegId,
        toSegmentId: toSegId,
        availableMinutes,
        requiredMinutes: null,
        bufferMinutes: MINIMUM_SAFETY_BUFFER_MINUTES,
        transferDurationMinutes: null,
        routeConfidence: 'ESTIMATED',
        routeSource: 'UNKNOWN',
        status: 'UNKNOWN',
        message: `Transfer time between ${fromSegId} and ${toSegId} is unknown. Cannot determine feasibility.`,
      };
    }

    const requiredMinutes = transferMinutes + MINIMUM_SAFETY_BUFFER_MINUTES;
    const isValid = availableMinutes >= requiredMinutes;

    return {
      fromSegmentId: fromSegId,
      toSegmentId: toSegId,
      availableMinutes,
      requiredMinutes,
      bufferMinutes: MINIMUM_SAFETY_BUFFER_MINUTES,
      transferDurationMinutes: transferMinutes,
      routeConfidence,
      routeSource,
      status: isValid ? 'VALID' : 'INVALID',
      message: isValid
        ? `Connection valid: ${availableMinutes} min available ≥ ${requiredMinutes} min required (${transferMinutes} min physical transfer [${routeSource}] + ${MINIMUM_SAFETY_BUFFER_MINUTES} min buffer)`
        : `Connection invalid: only ${availableMinutes} min available but ${requiredMinutes} min required (${transferMinutes} min physical transfer [${routeSource}] + ${MINIMUM_SAFETY_BUFFER_MINUTES} min buffer)`,
      failureType: isValid ? null : 'INSUFFICIENT_TRANSFER_TIME',
    };
  }

  /**
   * Look up physical baseline transfer duration.
   */
  _getTransferDuration(fromSegment, toSegment) {
    const fromMode = (fromSegment.transportMode || '').toLowerCase();
    const toMode = (toSegment.transportMode || '').toLowerCase();

    const fromDest = (fromSegment.destination?.code || fromSegment.destination || '').toUpperCase();
    const toOrigin = (toSegment.origin?.code || toSegment.origin || '').toUpperCase();

    if (fromDest === toOrigin) {
      if (fromMode === 'flight' && toMode === 'flight') {
        return KNOWN_TRANSFER_DURATIONS[`${fromDest}:${toOrigin}`] || KNOWN_TRANSFER_DURATIONS.DEFAULT_SAME_AIRPORT;
      }
      if (fromMode === 'flight' && toMode === 'train') {
        return KNOWN_TRANSFER_DURATIONS[`${fromDest}:${toOrigin}`] || KNOWN_TRANSFER_DURATIONS.DEFAULT_AIRPORT_TO_STATION;
      }
      if (fromMode === 'flight' && toMode === 'bus') {
        return KNOWN_TRANSFER_DURATIONS[`${fromDest}:${toOrigin}`] || KNOWN_TRANSFER_DURATIONS.DEFAULT_AIRPORT_TO_BUS;
      }
      if (fromMode === 'train' && toMode === 'bus') {
        return KNOWN_TRANSFER_DURATIONS[`${fromDest}:${toOrigin}`] || KNOWN_TRANSFER_DURATIONS.DEFAULT_STATION_TO_BUS;
      }
      if (toMode === 'hotel') {
        return fromMode === 'flight'
          ? (KNOWN_TRANSFER_DURATIONS[`${fromDest}:HOTEL`] || KNOWN_TRANSFER_DURATIONS.DEFAULT_AIRPORT_TO_HOTEL)
          : KNOWN_TRANSFER_DURATIONS.DEFAULT_STATION_TO_HOTEL;
      }
      if (fromMode === 'hotel') {
        return toMode === 'flight'
          ? (KNOWN_TRANSFER_DURATIONS[`HOTEL:${toOrigin}`] || KNOWN_TRANSFER_DURATIONS.DEFAULT_HOTEL_TO_AIRPORT)
          : KNOWN_TRANSFER_DURATIONS.DEFAULT_HOTEL_TO_STATION;
      }
      return 0; // Ground direct handover
    }

    const key = `${fromDest}:${toOrigin}`;
    if (KNOWN_TRANSFER_DURATIONS[key] !== undefined) {
      return KNOWN_TRANSFER_DURATIONS[key];
    }

    if (fromMode === 'flight' && toMode === 'train') {
      return KNOWN_TRANSFER_DURATIONS.DEFAULT_AIRPORT_TO_STATION;
    }

    if (fromMode === 'flight' && toMode === 'bus') {
      return KNOWN_TRANSFER_DURATIONS.DEFAULT_AIRPORT_TO_BUS;
    }

    if (fromMode === 'train' && toMode === 'bus') {
      return KNOWN_TRANSFER_DURATIONS.DEFAULT_STATION_TO_BUS;
    }

    if (toMode === 'hotel') {
      return fromMode === 'flight' ? KNOWN_TRANSFER_DURATIONS.DEFAULT_AIRPORT_TO_HOTEL : KNOWN_TRANSFER_DURATIONS.DEFAULT_STATION_TO_HOTEL;
    }

    if (fromMode === 'hotel') {
      return toMode === 'flight' ? KNOWN_TRANSFER_DURATIONS.DEFAULT_HOTEL_TO_AIRPORT : KNOWN_TRANSFER_DURATIONS.DEFAULT_HOTEL_TO_STATION;
    }

    return null;
  }
}

module.exports = new ConnectionValidator();
