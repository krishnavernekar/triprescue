/**
 * DataFreshnessValidator — Phase 3 External Data Freshness Validator.
 *
 * Checks timestamps of normalized flight, status, and route data against
 * configurable freshness thresholds (FLIGHT_STATUS_MAX_AGE_MINUTES, ROUTE_MAX_AGE_MINUTES).
 */

const config = require('../config/environment');

class DataFreshnessValidator {
  /**
   * Evaluate the freshness of a segment or travel option.
   * @param {Object} dataItem - Normalized segment, plan, or route
   * @param {string} type - 'flight' | 'route' | 'status'
   * @returns {{ status: 'FRESH'|'STALE'|'MISSING_TIMESTAMP', ageMinutes: number|null, thresholdMinutes: number, message: string }}
   */
  evaluateFreshness(dataItem, type = 'flight') {
    if (!dataItem) {
      return { status: 'MISSING_TIMESTAMP', ageMinutes: null, thresholdMinutes: 5, message: 'No data item provided' };
    }

    const timestampStr = dataItem.retrievedAt || dataItem.sourceTimestamp || null;
    const thresholdMinutes = type === 'route' ? config.routeMaxAgeMinutes : config.flightStatusMaxAgeMinutes;

    if (!timestampStr) {
      return {
        status: 'MISSING_TIMESTAMP',
        ageMinutes: null,
        thresholdMinutes,
        message: `Missing timestamp on ${type} data; freshness cannot be verified.`,
      };
    }

    const itemDate = new Date(timestampStr);
    if (isNaN(itemDate.getTime())) {
      return {
        status: 'MISSING_TIMESTAMP',
        ageMinutes: null,
        thresholdMinutes,
        message: `Invalid timestamp format '${timestampStr}'.`,
      };
    }

    const ageMinutes = Math.max(0, Math.round((Date.now() - itemDate.getTime()) / 60000));
    const isFresh = ageMinutes <= thresholdMinutes;

    return {
      status: isFresh ? 'FRESH' : 'STALE',
      ageMinutes,
      thresholdMinutes,
      message: isFresh
        ? `Data is FRESH (${ageMinutes} min old <= ${thresholdMinutes} min threshold)`
        : `Data is STALE (${ageMinutes} min old > ${thresholdMinutes} min threshold)`,
    };
  }

  /**
   * Evaluate overall freshness across all segments of a plan.
   */
  evaluatePlanFreshness(plan) {
    const segments = plan?.segments || [];
    let hasStale = false;
    let hasMissing = false;
    const details = [];

    for (const seg of segments) {
      const freshCheck = this.evaluateFreshness(seg, seg.transportMode || 'flight');
      details.push({ segmentId: seg.segmentId, ...freshCheck });

      if (freshCheck.status === 'STALE') hasStale = true;
      if (freshCheck.status === 'MISSING_TIMESTAMP') hasMissing = true;
    }

    let overallStatus = 'FRESH';
    if (hasStale) overallStatus = 'STALE';
    else if (hasMissing) overallStatus = 'MISSING_TIMESTAMP';

    return {
      status: overallStatus,
      segments: details,
    };
  }
}

module.exports = new DataFreshnessValidator();
