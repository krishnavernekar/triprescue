/**
 * BusNormalizer — Phase 9 Bus Data Normalizer.
 *
 * Normalizes raw bus provider search and details responses into
 * standard TripRescue travel options and segment structures.
 */

class BusNormalizer {
  /**
   * Normalize a raw bus item into a standard travel option.
   * @param {Object} rawBus
   * @param {Object} context
   * @returns {Object|null}
   */
  normalizeBus(rawBus, context = {}) {
    if (!rawBus || typeof rawBus !== 'object') {
      return null;
    }

    const depTime = rawBus.departure || rawBus.depTime || null;
    const arrTime = rawBus.arrival || rawBus.arrTime || null;
    const depDate = depTime ? new Date(depTime) : null;
    const arrDate = arrTime ? new Date(arrTime) : null;

    let durationMinutes = rawBus.durationMinutes;
    if (!durationMinutes && depDate && arrDate && !isNaN(depDate.getTime()) && !isNaN(arrDate.getTime())) {
      durationMinutes = Math.max(0, Math.round((arrDate - depDate) / 60000));
    }

    const carrier = rawBus.carrier || 'Intercity Bus';
    const identifier = rawBus.identifier || rawBus.busNumber || rawBus.serviceNumber || 'BUS-UNKNOWN';
    const originCode = (rawBus.origin?.code || rawBus.origin || 'DEL').toUpperCase();
    const destCode = (rawBus.destination?.code || rawBus.destination || 'JAI').toUpperCase();

    const originName = rawBus.origin?.name || originCode;
    const destName = rawBus.destination?.name || destCode;

    const priceAmount = typeof rawBus.price === 'object' ? rawBus.price.amount : (Number(rawBus.price) || 0);
    const currency = (typeof rawBus.price === 'object' && rawBus.price.currency) || 'INR';

    const nowIso = new Date().toISOString();
    const sourceTimestamp = rawBus.sourceTimestamp || nowIso;
    const retrievedAt = nowIso;
    const dataConfidence = rawBus.dataConfidence || 'MOCK';

    const segment = {
      segmentId: rawBus.segmentId || `SEG-BUS-${identifier.replace(/\s+/g, '')}-${Date.now()}`,
      transportMode: 'bus',
      origin: {
        code: originCode,
        name: originName,
        type: 'bus_station',
      },
      destination: {
        code: destCode,
        name: destName,
        type: 'bus_station',
      },
      departure: depDate ? depDate.toISOString() : null,
      arrival: arrDate ? arrDate.toISOString() : null,
      durationMinutes,
      carrier,
      identifier,
      price: {
        amount: priceAmount,
        currency,
      },
      availability: rawBus.availability !== undefined ? rawBus.availability : true,
      availableSeats: rawBus.availableSeats !== undefined ? rawBus.availableSeats : 30,
      retrievedAt,
      sourceTimestamp,
      dataConfidence,
    };

    return {
      optionId: rawBus.optionId || `OPT-BUS-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      provider: rawBus.provider || 'BusProvider',
      strategy: context.strategy || rawBus.strategy || 'BUS_ONLY',
      transportMode: 'bus',
      origin: {
        code: originCode,
        name: originName,
        type: 'bus_station',
      },
      destination: {
        code: destCode,
        name: destName,
        type: 'bus_station',
      },
      departure: depDate ? depDate.toISOString() : null,
      arrival: arrDate ? arrDate.toISOString() : null,
      durationMinutes,
      carrier,
      identifier,
      price: {
        amount: priceAmount,
        currency,
      },
      availability: segment.availability,
      availableSeats: segment.availableSeats,
      segments: rawBus.segments || [segment],
      dataConfidence,
      retrievedAt,
      sourceTimestamp,
      externalHandoff: {
        type: 'DEEPLINK',
        url: null,
        provider: carrier,
        status: 'DEEPLINK_UNAVAILABLE',
        verifiedAt: nowIso,
      },
    };
  }
}

module.exports = new BusNormalizer();
