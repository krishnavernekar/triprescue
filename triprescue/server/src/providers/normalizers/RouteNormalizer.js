/**
 * RouteNormalizer — Phase 3 Physical Route & Transfer Normalizer.
 *
 * Converts Google Routes / Directions API payloads into standardized
 * transfer duration and distance metrics with confidence tags.
 */

class RouteNormalizer {
  /**
   * Normalize Google Routes API v2 (or Directions API) response.
   * @param {Object} rawResponse - Google API JSON response
   * @param {string} origin - Origin code/address
   * @param {string} destination - Destination code/address
   * @param {string} mode - Transit mode
   * @returns {Object|null} Normalized route result
   */
  normalizeGoogleRoute(rawResponse, origin, destination, mode = 'driving') {
    if (!rawResponse || typeof rawResponse !== 'object') {
      return null;
    }

    try {
      let durationSeconds = null;
      let distanceMeters = null;

      // Handle Google Routes API v2 structure (e.g. routes[0].duration: "3300s")
      if (rawResponse.routes && rawResponse.routes.length > 0) {
        const route = rawResponse.routes[0];
        if (route.duration) {
          durationSeconds = parseInt(String(route.duration).replace('s', ''), 10);
        }
        if (route.distanceMeters !== undefined) {
          distanceMeters = route.distanceMeters;
        }

        // Alternative Directions API structure (routes[0].legs[0].duration.value)
        if (durationSeconds === null && route.legs && route.legs.length > 0) {
          const leg = route.legs[0];
          durationSeconds = leg.duration?.value || null;
          distanceMeters = leg.distance?.value || null;
        }
      }

      if (durationSeconds === null) {
        return null;
      }

      const durationMinutes = Math.round(durationSeconds / 60);
      const distanceKm = distanceMeters ? Number((distanceMeters / 1000).toFixed(1)) : null;

      const now = new Date().toISOString();

      return {
        provider: 'Google Routes',
        origin: (typeof origin === 'string' ? origin : origin?.code || 'ORIGIN').toUpperCase(),
        destination: (typeof destination === 'string' ? destination : destination?.code || 'DEST').toUpperCase(),
        mode,
        durationMinutes,
        duration: durationMinutes,
        distanceKm,
        confidence: 'LIVE',
        source: 'GOOGLE_ROUTES',
        retrievedAt: now,
        sourceTimestamp: now,
        message: `Verified physical transfer duration via Google Routes: ${durationMinutes} minutes (${distanceKm || '—'} km)`,
      };
    } catch (error) {
      console.warn(`[RouteNormalizer] Normalization error: ${error.message}`);
      return null;
    }
  }

  /**
   * Create a standardized fallback estimate object when live route API is unreachable.
   */
  createFallbackEstimate(origin, destination, fallbackMinutes, reason = 'Fallback transfer estimate') {
    const now = new Date().toISOString();
    const origCode = (typeof origin === 'string' ? origin : origin?.code || 'ORIGIN').toUpperCase();
    const destCode = (typeof destination === 'string' ? destination : destination?.code || 'DEST').toUpperCase();

    return {
      provider: 'Fallback Route Estimator',
      origin: origCode,
      destination: destCode,
      mode: 'transit_estimate',
      durationMinutes: fallbackMinutes,
      duration: fallbackMinutes,
      distanceKm: null,
      confidence: 'ESTIMATED',
      source: 'FALLBACK_ESTIMATE',
      retrievedAt: now,
      sourceTimestamp: now,
      message: `${reason}: ${fallbackMinutes} minutes estimated (${origCode} → ${destCode})`,
    };
  }
}

module.exports = new RouteNormalizer();
