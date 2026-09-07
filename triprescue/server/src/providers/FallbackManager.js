/**
 * FallbackManager — Phase 3 Provider Fallback, Caching & Quota Protection Engine.
 *
 * Implements:
 * Primary (Real Provider) → Fallback Provider → Deterministic Mock Provider
 *
 * Features:
 * - TTL in-memory caching for routes & flight statuses
 * - Session-level API quota protection (MAX_PROVIDER_REQUESTS_PER_RECOVERY)
 * - Structured event reporting (TOOL_FAILED, FALLBACK_TRIGGERED, PROVIDER_SWITCHED)
 */

const config = require('../config/environment');

class FallbackManager {
  constructor() {
    this._cache = new Map();
    this._sessionRequestCounts = new Map();
  }

  /**
   * Execute a tool query through the resilient fallback pipeline.
   * @param {string} toolType - 'flight' | 'train' | 'bus' | 'hotel' | 'route'
   * @param {string} method - 'search' | 'calculateRoute' | 'getFlightStatus'
   * @param {Object} primaryProvider - Primary provider instance
   * @param {Object} fallbackProvider - Fallback provider instance (e.g. Mock)
   * @param {Object} params - Query parameters
   * @param {Object} options - { sessionId, emitEventFn }
   */
  async execute(toolType, method, primaryProvider, fallbackProvider, params, options = {}) {
    const sessionId = options.sessionId || 'global';
    const emitEvent = options.emitEventFn || (() => {});
    const cacheKey = `${toolType}:${method}:${JSON.stringify(params)}`;

    // 1. In-memory Cache Check
    const cached = this._getFromCache(cacheKey, toolType);
    if (cached) {
      return {
        ...cached,
        confidence: 'CACHED',
        fromCache: true,
      };
    }

    // 2. Quota Check
    const currentCount = this._sessionRequestCounts.get(sessionId) || 0;
    if (currentCount >= config.maxProviderRequestsPerRecovery) {
      emitEvent('FALLBACK_TRIGGERED', `API quota threshold (${config.maxProviderRequestsPerRecovery}) reached. Diverting to fallback provider.`);
      const fallbackResult = await fallbackProvider[method](params);
      return {
        ...fallbackResult,
        confidence: fallbackResult.confidence || 'MOCK',
        source: 'QUOTA_FALLBACK',
      };
    }

    // 3. Try Primary Provider (if real providers enabled or primary is configured)
    let primaryFailed = false;
    let primaryError = null;

    if (primaryProvider && primaryProvider.name !== fallbackProvider.name) {
      try {
        this._sessionRequestCounts.set(sessionId, currentCount + 1);
        const result = await primaryProvider[method](params);

        if (result && !result.fallbackNeeded && (!result.results || result.results.length > 0 || method !== 'search')) {
          // Success with primary provider! Cache result
          this._setCache(cacheKey, result, toolType);
          return {
            ...result,
            confidence: result.confidence || 'LIVE',
          };
        } else {
          primaryFailed = true;
          primaryError = result?.error || 'Primary provider returned zero options or signaled fallbackNeeded';
        }
      } catch (err) {
        primaryFailed = true;
        primaryError = err.message;
      }
    } else {
      // Primary is already fallback/mock
      const result = await fallbackProvider[method](params);
      this._setCache(cacheKey, result, toolType);
      return result;
    }

    // 4. Trigger Fallback Pipeline
    if (primaryFailed) {
      emitEvent('TOOL_FAILED', `Primary tool [${primaryProvider.name}] failed: ${primaryError}`);
      emitEvent('FALLBACK_TRIGGERED', `Switching to fallback provider [${fallbackProvider.name}].`);

      try {
        const fallbackResult = await fallbackProvider[method](params);
        this._setCache(cacheKey, fallbackResult, toolType);

        return {
          ...fallbackResult,
          confidence: fallbackResult.confidence || 'ESTIMATED',
          fallbackUsed: true,
          fallbackReason: primaryError,
        };
      } catch (fallbackErr) {
        throw new Error(`Both primary [${primaryProvider.name}] and fallback [${fallbackProvider.name}] failed: ${fallbackErr.message}`);
      }
    }
  }

  _getFromCache(key, toolType) {
    const entry = this._cache.get(key);
    if (!entry) return null;

    const maxAgeMinutes = toolType === 'route' ? config.routeMaxAgeMinutes : config.flightStatusMaxAgeMinutes;
    const isExpired = Date.now() - entry.timestamp > maxAgeMinutes * 60 * 1000;

    if (isExpired) {
      this._cache.delete(key);
      return null;
    }

    return entry.data;
  }

  _setCache(key, data, toolType) {
    this._cache.set(key, {
      data,
      timestamp: Date.now(),
      toolType,
    });
  }

  clearCache() {
    this._cache.clear();
    this._sessionRequestCounts.clear();
  }
}

module.exports = new FallbackManager();
