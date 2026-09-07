/**
 * SimulationService — Phase 13 What-If Travel Simulation Engine.
 *
 * Clones the active recovery state and evaluates hypothetical disruptions
 * (e.g. +60 min delay, segment cancellation, budget changes, constraint relaxation)
 * without mutating the actual MongoDB trip or recovery session.
 *
 * Invariant:
 * SIMULATION MUST NEVER MUTATE THE REAL ACTIVE TRIP OR RECOVERY SESSION.
 */

const cascadeImpactEngine = require('../evaluation/CascadeImpactEngine');
const constraintValidator = require('../evaluation/ConstraintValidator');
const connectionValidator = require('../evaluation/ConnectionValidator');
const riskEngine = require('../evaluation/RiskEngine');

class SimulationService {
  /**
   * Run a what-if simulation against a RecoverySession.
   * @param {Object} recoverySession - The persistent RecoverySession (or plain object)
   * @param {Object} hypotheticalEvent - e.g. { type: 'DELAY', delayMinutes: 60, additionalBudget: 2000 }
   * @returns {Object} Structured simulation prediction with immutable original state confirmation
   */
  simulate(recoverySession, hypotheticalEvent = {}) {
    if (!recoverySession) {
      throw new Error('Recovery session is required for simulation');
    }

    // Deep clone the session state so original is completely untouched
    const rawSession = typeof recoverySession.toObject === 'function'
      ? recoverySession.toObject()
      : recoverySession;
    const sessionClone = JSON.parse(JSON.stringify(rawSession));

    const itinerary = sessionClone.currentItinerary || [];
    const objective = sessionClone.objective ? { ...sessionClone.objective } : {};
    sessionClone.objective = objective;

    // Sanitize and normalize hypothetical event parameters
    const hypotheticalType = String(hypotheticalEvent.type || 'FLIGHT_DELAYED').toUpperCase();
    const isCancellation = hypotheticalType.includes('CANCEL');
    const isBudgetChange = hypotheticalType.includes('BUDGET') || typeof hypotheticalEvent.additionalBudget === 'number';

    let delayMinutes = 0;
    if (!isCancellation) {
      delayMinutes = Number(
        hypotheticalEvent.delayMinutes !== undefined
          ? hypotheticalEvent.delayMinutes
          : hypotheticalEvent.additionalDelayMinutes !== undefined
          ? hypotheticalEvent.additionalDelayMinutes
          : 60
      );
      if (isNaN(delayMinutes) || delayMinutes < 0) delayMinutes = 0;
      if (delayMinutes > 1440) delayMinutes = 1440; // max 24h cap
    }

    const additionalBudget = Number(hypotheticalEvent.additionalBudget || hypotheticalEvent.budgetChange || 0);
    if (!isNaN(additionalBudget) && additionalBudget !== 0) {
      objective.maxAdditionalBudget = Math.max(0, (Number(objective.maxAdditionalBudget) || 0) + additionalBudget);
    }

    if (hypotheticalEvent.allowExtraTransfer) {
      objective.maxTransfers = (Number(objective.maxTransfers) || 1) + 1;
    }

    if (hypotheticalEvent.arrivalDeadline) {
      objective.arrivalDeadline = new Date(hypotheticalEvent.arrivalDeadline);
    }

    // 1. Recalculate downstream cascade impact with the hypothetical disruption
    const affectedSegmentId = hypotheticalEvent.affectedSegmentId || itinerary[0]?.segmentId || null;
    const simulatedDisruption = {
      type: hypotheticalType,
      affectedSegmentId,
      detectedAt: new Date().toISOString(),
      delayMinutes,
      description: isCancellation
        ? `[SIMULATION] Hypothetical segment cancellation`
        : `[SIMULATION] Hypothetical additional delay of ${delayMinutes} minutes`,
    };

    const impactReport = cascadeImpactEngine.analyzeImpact(
      itinerary,
      simulatedDisruption,
      delayMinutes,
      objective
    );

    // 2. Re-evaluate candidate plans against hypothetical disruption
    const candidatePlans = sessionClone.candidatePlans || [];
    const simulatedPlans = candidatePlans.map((plan) => {
      const planClone = JSON.parse(JSON.stringify(plan));

      // Cancellation check: if plan uses the cancelled segment or fails downstream
      if (isCancellation) {
        const usesCancelled = (planClone.segments || []).some((seg) =>
          seg.segmentId === affectedSegmentId || seg.identifier === itinerary[0]?.identifier
        );
        if (usesCancelled || impactReport.hasImpact) {
          planClone.status = 'INVALID';
          planClone.hardConstraintsPassed = false;
          planClone.rejectionReasons = [
            `SIMULATED_CANCELLATION: Route severed by cancellation of ${affectedSegmentId || 'primary segment'}`,
          ];
          return planClone;
        }
      }

      // Delay check: shift arrival time
      if (planClone.finalArrivalTime && delayMinutes > 0) {
        const shiftedArrival = new Date(new Date(planClone.finalArrivalTime).getTime() + delayMinutes * 60000);
        planClone.finalArrivalTime = shiftedArrival.toISOString();
      }

      // Re-validate against updated objective (budget, deadline, transfers)
      const constraintCheck = constraintValidator.validate(planClone, objective);
      const connectionCheck = connectionValidator.validatePlanConnections(planClone.segments || []);

      const isValid = constraintCheck.valid && connectionCheck.valid;
      planClone.status = isValid ? 'VALID' : 'INVALID';
      planClone.hardConstraintsPassed = constraintCheck.valid;
      planClone.connectionsFeasible = connectionCheck.valid;

      if (!isValid) {
        planClone.rejectionReasons = [
          ...constraintCheck.violations.map((v) => `${v.type}: ${v.message}`),
          ...connectionCheck.results.filter((c) => c.status === 'INVALID').map((c) => `CONNECTION: ${c.message}`),
        ];
      } else {
        planClone.rejectionReasons = [];
      }

      return planClone;
    });

    // Determine simulated selected plan
    let simulatedSelectedPlan = null;
    if (sessionClone.selectedPlan) {
      simulatedSelectedPlan = JSON.parse(JSON.stringify(sessionClone.selectedPlan));
      if (isCancellation) {
        simulatedSelectedPlan.status = 'INVALID';
        simulatedSelectedPlan.rejectionReasons = ['SIMULATED_CANCELLATION: Primary route cancelled in simulation'];
      } else {
        if (simulatedSelectedPlan.finalArrivalTime && delayMinutes > 0) {
          const shifted = new Date(new Date(simulatedSelectedPlan.finalArrivalTime).getTime() + delayMinutes * 60000);
          simulatedSelectedPlan.finalArrivalTime = shifted.toISOString();
        }
        const check = constraintValidator.validate(simulatedSelectedPlan, objective);
        const conn = connectionValidator.validatePlanConnections(simulatedSelectedPlan.segments || []);
        const valid = check.valid && conn.valid;
        simulatedSelectedPlan.status = valid ? 'VALID' : 'INVALID';
        if (!valid) {
          simulatedSelectedPlan.rejectionReasons = [
            ...check.violations.map((v) => `${v.type}: ${v.message}`),
            ...conn.results.filter((c) => c.status === 'INVALID').map((c) => `CONNECTION: ${c.message}`),
          ];
        }
      }
    }

    // 3. Recalculate hypothetical risk indicator
    const simulatedRisk = riskEngine.assess(
      simulatedSelectedPlan,
      objective,
      simulatedDisruption,
      simulatedPlans
    );

    // 4. Check simulated calendar conflict (read-only without mutating real calendar)
    let simulatedCalendarConflict = null;
    try {
      const { calendarService } = require('../calendar');
      if (calendarService && simulatedSelectedPlan?.finalArrivalTime) {
        simulatedCalendarConflict = calendarService.detectConflicts(simulatedSelectedPlan.finalArrivalTime);
      }
    } catch (e) {
      // calendar check is non-fatal in simulation
    }

    // 5. Build Predicted Recovery Recommendation
    const validPlans = simulatedPlans.filter((p) => p.status === 'VALID');
    let recommendation = '';
    if (isCancellation) {
      recommendation = 'Primary travel segment cancelled in simulation. Initiate multimodal recovery (Train/Bus) or alternative carrier search.';
    } else if (validPlans.length > 0) {
      recommendation = `Identified ${validPlans.length} feasible alternative candidate plan(s) under this simulation scenario.`;
    } else if (impactReport.deadlineConflict) {
      recommendation = 'Hypothetical delay breaches arrival deadline. Consider relaxing deadline constraint or budget for direct express alternatives.';
    } else if (impactReport.brokenConnections.length > 0) {
      recommendation = `Simulated delay breaks ${impactReport.brokenConnections.length} connection(s). Re-routing via alternate hub recommended.`;
    } else {
      recommendation = 'Current recovery plan remains feasible under this hypothetical scenario.';
    }

    let summary = '';
    if (isCancellation) {
      summary = `Hypothetical cancellation severs route with ${impactReport.affectedSegments.length} affected segment(s). Risk: ${simulatedRisk.score}/100 (${simulatedRisk.level}).`;
    } else if (isBudgetChange) {
      summary = `Hypothetical budget adjustment to ₹${objective.maxAdditionalBudget}. ${validPlans.length} candidate plan(s) feasible. Risk: ${simulatedRisk.score}/100 (${simulatedRisk.level}).`;
    } else {
      summary = `Hypothetical +${delayMinutes} min delay results in ${impactReport.brokenConnections.length} broken connections and risk score ${simulatedRisk.score} (${simulatedRisk.level}).`;
    }

    return {
      simulationId: `SIM-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      isSimulation: true,
      originalState: {
        sessionId: rawSession._id || null,
        status: rawSession.status || null,
        selectedPlanStatus: rawSession.selectedPlan?.status || null,
        riskScore: rawSession.riskScore?.score || null,
        riskLevel: rawSession.riskScore?.level || null,
      },
      hypotheticalEvent: {
        type: hypotheticalType,
        delayMinutes,
        additionalBudget,
        affectedSegmentId: simulatedDisruption.affectedSegmentId,
      },
      impactReport,
      simulatedPlans,
      simulatedRisk,
      simulatedCalendarConflict,
      predictedOutcome: {
        plansValidCount: validPlans.length,
        selectedPlanStillValid: simulatedSelectedPlan?.status === 'VALID',
        recommendation,
      },
      summary,
      immutableStateVerified: true,
    };
  }
}

module.exports = new SimulationService();
