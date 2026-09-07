/**
 * TrainNormalizer — Phase 9 Train Data Normalizer.
 *
 * Normalizes raw train provider search and details responses into
 * standard TripRescue travel options and segment structures.
 */

class TrainNormalizer {
  /**
   * Normalize a raw train item into a standard travel option.
   * @param {Object} rawTrain
   * @param {Object} context
   * @returns {Object|null}
   */
  normalizeTrain(rawTrain, context = {}) {
    if (!rawTrain || typeof rawTrain !== 'object') {
      return null;
    }

    const depTime = rawTrain.departure || rawTrain.depTime || null;
    const arrTime = rawTrain.arrival || rawTrain.arrTime || null;
    const depDate = depTime ? new Date(depTime) : null;
    const arrDate = arrTime ? new Date(arrTime) : null;

    let durationMinutes = rawTrain.durationMinutes;
    if (!durationMinutes && depDate && arrDate && !isNaN(depDate.getTime()) && !isNaN(arrDate.getTime())) {
      durationMinutes = Math.max(0, Math.round((arrDate - depDate) / 60000));
    }

    const carrier = rawTrain.carrier || 'Indian Railways';
    const identifier = rawTrain.identifier || rawTrain.trainNumber || rawTrain.trainNo || 'TR-UNKNOWN';
    const originCode = (rawTrain.origin?.code || rawTrain.origin || 'NDLS').toUpperCase();
    const destCode = (rawTrain.destination?.code || rawTrain.destination || 'JAI').toUpperCase();

    const originName = rawTrain.origin?.name || originCode;
    const destName = rawTrain.destination?.name || destCode;

    const priceAmount = typeof rawTrain.price === 'object' ? rawTrain.price.amount : (Number(rawTrain.price) || 0);
    const currency = (typeof rawTrain.price === 'object' && rawTrain.price.currency) || 'INR';

    const nowIso = new Date().toISOString();
    const sourceTimestamp = rawTrain.sourceTimestamp || nowIso;
    const retrievedAt = nowIso;
    const dataConfidence = rawTrain.dataConfidence || 'MOCK';

    const segment = {
      segmentId: rawTrain.segmentId || `SEG-TR-${identifier.replace(/\s+/g, '')}-${Date.now()}`,
      transportMode: 'train',
      origin: {
        code: originCode,
        name: originName,
        type: 'railway_station',
      },
      destination: {
        code: destCode,
        name: destName,
        type: 'railway_station',
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
      availability: rawTrain.availability !== undefined ? rawTrain.availability : true,
      availableSeats: rawTrain.availableSeats !== undefined ? rawTrain.availableSeats : 50,
      retrievedAt,
      sourceTimestamp,
      dataConfidence,
    };

    return {
      optionId: rawTrain.optionId || `OPT-TR-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      provider: rawTrain.provider || 'TrainProvider',
      strategy: context.strategy || rawTrain.strategy || 'TRAIN_ONLY',
      transportMode: 'train',
      origin: {
        code: originCode,
        name: originName,
        type: 'railway_station',
      },
      destination: {
        code: destCode,
        name: destName,
        type: 'railway_station',
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
      segments: rawTrain.segments || [segment],
      dataConfidence,
      retrievedAt,
      sourceTimestamp,
      externalHandoff: {
        type: 'DEEPLINK',
        url: null,
        provider: 'IRCTC',
        status: 'DEEPLINK_UNAVAILABLE',
        verifiedAt: nowIso,
      },
    };
  }
}

module.exports = new TrainNormalizer();
