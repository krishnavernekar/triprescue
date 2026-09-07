/**
 * RiskEngine — TripShield Phase 3 Explainable Risk Indicator.
 *
 * Deterministically evaluates travel recovery vulnerability across:
 * - Transfer buffer adequacy & physical route confidence (LIVE vs ESTIMATED)
 * - Provider data freshness (FRESH vs STALE)
 * - Deadline pressure
 * - Availability of alternative plans
 * - Disruption severity
 * - Transfer count & transport modes
 *
 * Strictly explainable score [0-100]. Never uses probabilistic failure language.
 * Output: { score: number, level: string, reasons: string[], factors: Object }
 */

const dataFreshnessValidator = require('./DataFreshnessValidator');

class RiskEngine {
  /**
   * Assess recovery session / plan risk.
   * @param {Object} plan - Selected or active candidate plan (or null)
   * @param {Object} objective - RecoveryObjective
   * @param {Object} disruption - Current travel disruption
   * @param {Array} candidatePlans - All candidate plans found so far
   * @returns {{ score: number, level: string, reasons: string[], factors: Object }}
   */
  assess(plan, objective, disruption, candidatePlans = []) {
    const reasons = [];
    const factors = {
      disruptionSeverity: 'LOW',
      transferBufferMarginMinutes: null,
      deadlineMarginMinutes: null,
      alternativePlanCount: 0,
      transferCount: 0,
      budgetUtilizationRatio: 0,
      routeConfidence: 'MOCK',
      providerDataFreshness: 'FRESH',
    };

    let riskPoints = 20; // baseline operational risk

    // 1. Disruption Severity
    const disType = disruption?.type || 'OTHER';
    if (disType.includes('CANCELLED')) {
      riskPoints += 30;
      factors.disruptionSeverity = 'CRITICAL';
      reasons.push(`Disruption severity is HIGH (${disType.replace('_', ' ')})`);
    } else if (disType.includes('DELAYED')) {
      riskPoints += 15;
      factors.disruptionSeverity = 'MEDIUM';
      reasons.push(`Disruption involves active segment delay`);
    } else if (disType.includes('MISSED_CONNECTION')) {
      riskPoints += 25;
      factors.disruptionSeverity = 'HIGH';
      reasons.push(`Missed connection requires downstream itinerary replanning`);
    }

    // 2. Alternative Candidates Available
    const validCandidates = candidatePlans.filter((p) => p.status === 'VALID' || p.status === 'SELECTED');
    factors.alternativePlanCount = validCandidates.length;

    if (validCandidates.length === 0) {
      riskPoints += 25;
      reasons.push('No valid alternative recovery plans verified yet');
    } else if (validCandidates.length === 1) {
      riskPoints += 12;
      reasons.push('Only one viable alternative recovery option identified');
    }

    // 3. Plan-specific checks (if a plan exists)
    if (plan) {
      // Transfer Buffer & Physical Route Confidence
      if (plan.connectionResults && plan.connectionResults.length > 0) {
        let hasEstimated = false;

        for (const conn of plan.connectionResults) {
          const avail = conn.availableMinutes || 0;
          const req = conn.requiredMinutes || 60;
          const buffer = avail - req;
          factors.transferBufferMarginMinutes = buffer;

          if (conn.routeConfidence === 'ESTIMATED') {
            hasEstimated = true;
          }

          if (buffer < 0) {
            riskPoints += 30;
            reasons.push(`Connection transfer time is insufficient (${avail} min available vs ${req} min required)`);
          } else if (buffer < 20) {
            riskPoints += 15;
            reasons.push(`Connection safety buffer is narrow (${buffer} minutes remaining)`);
          }
        }

        if (hasEstimated) {
          riskPoints += 8;
          factors.routeConfidence = 'ESTIMATED';
          reasons.push('Physical transfer duration is estimated; live traffic verification unavailable');
        } else if (plan.connectionResults[0]?.routeConfidence === 'LIVE') {
          factors.routeConfidence = 'LIVE';
        }
      }

      // External Data Freshness Check
      const freshnessCheck = dataFreshnessValidator.evaluatePlanFreshness(plan);
      factors.providerDataFreshness = freshnessCheck.status;

      if (freshnessCheck.status === 'STALE') {
        riskPoints += 10;
        reasons.push('External provider data exceeds freshness threshold (stale schedule data)');
      }

      // Deadline Pressure
      if (objective?.arrivalDeadline && plan.finalArrivalTime) {
        const deadline = new Date(objective.arrivalDeadline).getTime();
        const arrival = new Date(plan.finalArrivalTime).getTime();
        const marginMinutes = Math.round((deadline - arrival) / 60000);
        factors.deadlineMarginMinutes = marginMinutes;

        if (marginMinutes < 30) {
          riskPoints += 20;
          reasons.push(`Tight arrival deadline: only ${marginMinutes} minutes before deadline`);
        } else if (marginMinutes < 60) {
          riskPoints += 10;
          reasons.push(`Moderate deadline buffer: ${marginMinutes} minutes before deadline`);
        }
      }

      // Number of transfers
      const transfers = plan.transferCount !== undefined
        ? plan.transferCount
        : (plan.segments ? Math.max(0, plan.segments.length - 1) : 0);
      factors.transferCount = transfers;

      if (transfers >= 2) {
        riskPoints += 15;
        reasons.push(`Multimodal journey requires ${transfers} transfers, increasing cascade vulnerability`);
      }

      // Budget utilization
      const budget = objective?.maxAdditionalBudget || 0;
      const cost = plan.totalCost || 0;
      if (budget > 0) {
        factors.budgetUtilizationRatio = Number((cost / budget).toFixed(2));
        if (cost > budget * 0.9) {
          riskPoints += 10;
          reasons.push(`Recovery plan utilizes >90% of available additional budget (₹${cost}/₹${budget})`);
        }
      }
    } else {
      riskPoints += 20;
      reasons.push('Current itinerary remains disrupted without active recovery plan');
    }

    // Strictly clamp score between 0 and 100
    const score = Math.max(0, Math.min(100, Math.round(riskPoints)));

    // Deterministic level derivation
    let level = 'LOW';
    if (score >= 75) {
      level = 'CRITICAL';
    } else if (score >= 55) {
      level = 'HIGH';
    } else if (score >= 35) {
      level = 'MEDIUM';
    }

    return {
      score,
      level,
      reasons,
      factors,
    };
  }
}

module.exports = new RiskEngine();
