/**
 * PlanScorer — Phase 2 deterministic plan scoring.
 * 
 * Calculates a configurable weighted score (0-100) based on:
 * - Arrival time (compared to deadline)
 * - Additional Cost (compared to max budget)
 * - Reliability (mode-based reliability index)
 * - Duration
 * - Transfer count
 * - Comfort / transport mode preference
 *
 * RecoveryObjective optimizationPriorities dynamically adjust weights.
 */

const DEFAULT_WEIGHTS = {
  arrival: 0.35,
  cost: 0.25,
  reliability: 0.15,
  duration: 0.10,
  transfers: 0.10,
  comfort: 0.05,
};

// Transport mode reliability heuristics
const MODE_RELIABILITY = {
  flight: 85,
  train: 80,
  bus: 70,
  ground: 90,
  hotel: 95,
};

class PlanScorer {
  /**
   * Score a valid recovery plan.
   * @param {Object} plan - Evaluated valid plan
   * @param {Object} objective - RecoveryObjective
   * @param {Object} customWeights - Optional weight overrides
   * @returns {{ score: number, breakdown: Object }}
   */
  score(plan, objective, customWeights = {}) {
    if (!plan || plan.status === 'INVALID') {
      return { score: 0, breakdown: {} };
    }

    const weights = this._deriveWeights(objective, customWeights);

    // 1. Arrival Score (earlier than deadline is higher score)
    const arrivalScore = this._calculateArrivalScore(plan, objective);

    // 2. Cost Score (cheaper than max budget is higher score)
    const costScore = this._calculateCostScore(plan, objective);

    // 3. Reliability Score (combination of transport modes)
    const reliabilityScore = this._calculateReliabilityScore(plan);

    // 4. Duration Score (shorter journey is higher score)
    const durationScore = this._calculateDurationScore(plan);

    // 5. Transfer Score (fewer transfers is higher score)
    const transferScore = this._calculateTransferScore(plan);

    // 6. Comfort Score
    const comfortScore = this._calculateComfortScore(plan, objective);

    const totalScore = Math.round(
      arrivalScore * weights.arrival +
      costScore * weights.cost +
      reliabilityScore * weights.reliability +
      durationScore * weights.duration +
      transferScore * weights.transfers +
      comfortScore * weights.comfort
    );

    const normalizedScore = Math.max(0, Math.min(100, totalScore));

    return {
      score: normalizedScore,
      breakdown: {
        arrival: { score: arrivalScore, weight: weights.arrival },
        cost: { score: costScore, weight: weights.cost },
        reliability: { score: reliabilityScore, weight: weights.reliability },
        duration: { score: durationScore, weight: weights.duration },
        transfers: { score: transferScore, weight: weights.transfers },
        comfort: { score: comfortScore, weight: weights.comfort },
      },
    };
  }

  _deriveWeights(objective, customWeights) {
    const priorities = objective?.optimizationPriorities || ['arrival_time', 'cost', 'reliability', 'transfers'];
    const weights = { ...DEFAULT_WEIGHTS, ...customWeights };

    // If top priority is cost, shift weight
    if (priorities[0] === 'cost') {
      weights.cost = 0.40;
      weights.arrival = 0.25;
    } else if (priorities[0] === 'reliability') {
      weights.reliability = 0.35;
      weights.arrival = 0.25;
      weights.cost = 0.20;
    } else if (priorities[0] === 'transfers') {
      weights.transfers = 0.30;
      weights.arrival = 0.25;
    }

    // Normalize weights so sum is 1.0
    const sum = Object.values(weights).reduce((a, b) => a + b, 0);
    for (const key of Object.keys(weights)) {
      weights[key] = weights[key] / sum;
    }

    return weights;
  }

  _calculateArrivalScore(plan, objective) {
    if (!objective.arrivalDeadline || !plan.finalArrivalTime) return 80;

    const deadline = new Date(objective.arrivalDeadline).getTime();
    const arrival = new Date(plan.finalArrivalTime).getTime();

    if (arrival > deadline) return 0; // Missed deadline

    const marginMinutes = (deadline - arrival) / (60 * 1000);
    // 120+ minutes margin = 100%, 0 margin = 60%
    return Math.min(100, Math.round(60 + Math.min(40, marginMinutes / 3)));
  }

  _calculateCostScore(plan, objective) {
    const budget = objective.maxAdditionalBudget || 5000;
    const cost = plan.totalCost || 0;

    if (cost > budget) return 0;
    if (budget === 0) return cost === 0 ? 100 : 50;

    // Remaining budget ratio
    const remainingRatio = (budget - cost) / budget;
    return Math.round(50 + remainingRatio * 50);
  }

  _calculateReliabilityScore(plan) {
    const segments = plan.segments || [];
    if (segments.length === 0) return 50;

    const avg = segments.reduce((sum, seg) => {
      const mode = (seg.transportMode || 'flight').toLowerCase();
      return sum + (MODE_RELIABILITY[mode] || 75);
    }, 0) / segments.length;

    return Math.round(avg);
  }

  _calculateDurationScore(plan) {
    const durMin = plan.totalDurationMinutes || 180;
    // Shorter is better: 2h or less = 100, 10h = 40
    const score = 100 - (durMin / 600) * 60;
    return Math.max(30, Math.min(100, Math.round(score)));
  }

  _calculateTransferScore(plan) {
    const transfers = plan.transferCount !== undefined
      ? plan.transferCount
      : Math.max(0, (plan.segments?.length || 1) - 1);

    if (transfers === 0) return 100;
    if (transfers === 1) return 80;
    if (transfers === 2) return 55;
    return 30;
  }

  _calculateComfortScore(plan, objective) {
    const prefAirline = objective?.softConstraints?.preferredAirline;
    const prefMode = objective?.softConstraints?.preferredTransportMode;

    let score = 80;
    const segments = plan.segments || [];

    if (prefMode) {
      const hasPrefMode = segments.some((s) => s.transportMode?.toLowerCase() === prefMode.toLowerCase());
      score += hasPrefMode ? 10 : -10;
    }

    if (prefAirline) {
      const hasPrefAirline = segments.some((s) => s.carrier?.toLowerCase().includes(prefAirline.toLowerCase()));
      score += hasPrefAirline ? 10 : -10;
    }

    return Math.max(0, Math.min(100, score));
  }
}

module.exports = new PlanScorer();
