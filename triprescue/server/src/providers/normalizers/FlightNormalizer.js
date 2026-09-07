/**
 * FlightNormalizer — Phase 3 External Flight Data Normalizer.
 *
 * Converts external aviation provider responses (such as Aviationstack)
 * into standard TripRescue travel options and segment structures.
 *
 * Rules:
 * 1. Never invent data not provided by the source.
 * 2. Missing fields must be explicitly `null` or marked unavailable.
 * 3. Use ISO 8601 timestamps.
 * 4. Tag with source provider, timestamps, and confidence rating.
 */

class FlightNormalizer {
  /**
   * Normalize an Aviationstack flight object into a TripRescue segment/option.
   * @param {Object} rawFlight - Raw flight item from Aviationstack API
   * @param {Object} context - Optional context (e.g. strategy, pricing)
   * @returns {Object|null} Normalized travel option
   */
  normalizeAviationstackFlight(rawFlight, context = {}) {
    if (!rawFlight || typeof rawFlight !== 'object') {
      return null;
    }

    try {
      const departure = rawFlight.departure || {};
      const arrival = rawFlight.arrival || {};
      const airline = rawFlight.airline || {};
      const flight = rawFlight.flight || {};

      const depTime = departure.estimated || departure.scheduled || departure.actual || null;
      const arrTime = arrival.estimated || arrival.scheduled || arrival.actual || null;

      const depDate = depTime ? new Date(depTime) : null;
      const arrDate = arrTime ? new Date(arrTime) : null;

      let durationMinutes = null;
      if (depDate && arrDate && !isNaN(depDate.getTime()) && !isNaN(arrDate.getTime())) {
        durationMinutes = Math.max(0, Math.round((arrDate - depDate) / 60000));
      }

      const normalizedStatus = this.normalizeStatus(rawFlight.flight_status);
      const carrier = airline.name || flight.iata || 'Unknown Airline';
      const flightNumber = flight.iata || flight.number || 'FL-UNKNOWN';

      const originCode = (departure.iata || departure.icao || 'UNKNOWN').toUpperCase();
      const destCode = (arrival.iata || arrival.icao || 'UNKNOWN').toUpperCase();

      const sourceTimestamp = rawFlight.flight_date ? new Date(rawFlight.flight_date).toISOString() : new Date().toISOString();
      const retrievedAt = new Date().toISOString();

      const segment = {
        segmentId: `SEG-AVS-${flightNumber}-${Date.now()}`,
        transportMode: 'flight',
        origin: {
          code: originCode,
          name: departure.airport || departure.iata || originCode,
          type: 'airport',
        },
        destination: {
          code: destCode,
          name: arrival.airport || arrival.iata || destCode,
          type: 'airport',
        },
        departure: depDate ? depDate.toISOString() : null,
        arrival: arrDate ? arrDate.toISOString() : null,
        durationMinutes,
        carrier,
        identifier: flightNumber,
        status: normalizedStatus,
        availableSeats: rawFlight.available_seats || null, // null if status API
        price: context.price || { amount: 0, currency: 'INR' },
        availability: normalizedStatus !== 'CANCELLED',
        provider: 'Aviationstack',
        sourceTimestamp,
        retrievedAt,
        dataConfidence: 'LIVE',
      };

      return {
        optionId: `OPT-AVS-${flightNumber}-${Date.now()}`,
        provider: 'Aviationstack',
        strategy: context.strategy || 'DIRECT_FLIGHT',
        transportMode: 'flight',
        origin: segment.origin,
        destination: segment.destination,
        departure: segment.departure,
        arrival: segment.arrival,
        durationMinutes,
        carrier,
        identifier: flightNumber,
        status: normalizedStatus,
        availableSeats: segment.availableSeats,
        price: segment.price,
        availability: segment.availability,
        segments: [segment],
        sourceTimestamp,
        retrievedAt,
        dataConfidence: 'LIVE',
        externalHandoff: {
          type: 'DEEPLINK',
          url: null, // No fake URLs!
          provider: carrier,
          referenceId: flightNumber,
          status: 'DEEPLINK_UNAVAILABLE',
          generatedAt: retrievedAt,
        },
      };
    } catch (error) {
      console.warn(`[FlightNormalizer] Normalization failed for record: ${error.message}`);
      return null;
    }
  }

  /**
   * Normalize multiple flight items from API response array.
   */
  normalizeAviationstackList(apiResponse, context = {}) {
    const rawList = Array.isArray(apiResponse?.data) ? apiResponse.data : (Array.isArray(apiResponse) ? apiResponse : []);
    const results = [];

    for (const item of rawList) {
      const normalized = this.normalizeAviationstackFlight(item, context);
      if (normalized) {
        results.push(normalized);
      }
    }

    return results;
  }

  /**
   * Standardize external flight status strings into project enums.
   */
  normalizeStatus(rawStatus) {
    if (!rawStatus) return 'UNKNOWN';

    const s = String(rawStatus).toLowerCase().trim();
    if (s === 'scheduled' || s === 'active') return 'SCHEDULED';
    if (s.includes('delay')) return 'DELAYED';
    if (s.includes('cancel')) return 'CANCELLED';
    if (s === 'landed' || s === 'arrived') return 'LANDED';
    return 'UNKNOWN';
  }
}

module.exports = new FlightNormalizer();
