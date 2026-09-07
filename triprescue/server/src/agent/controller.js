/**
 * AgentController — Phase 2 HTTP API entry point for recovery agent operations.
 */

const stateManager = require('./StateManager');
const recoveryPlanner = require('./RecoveryPlanner');
const simulationService = require('../simulation/SimulationService');
const Trip = require('../models/Trip');

class AgentController {
  /**
   * POST /api/trips/:id/recovery/start
   * Triggers the autonomous recovery loop for a trip.
   */
  async startRecovery(req, res, next) {
    try {
      const tripId = req.params.id;
      const trip = await Trip.findById(tripId);
      if (!trip) {
        const err = new Error('Trip not found');
        err.statusCode = 404;
        err.code = 'NOT_FOUND';
        throw err;
      }

      // Ensure trip is in a disrupted state or has an active session
      const session = await stateManager.getSessionByTripId(tripId);

      // Run deterministic recovery loop
      const maxIterations = req.body.maxIterations || 10;
      const updatedSession = await recoveryPlanner.runRecovery(session, maxIterations);

      res.status(200).json({
        success: true,
        data: updatedSession,
        message: `Recovery execution ended with status ${updatedSession.status}`,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/recovery-sessions/:id/replan
   * Re-triggers the recovery loop on an existing session.
   */
  async replan(req, res, next) {
    try {
      const sessionId = req.params.id;
      const session = await stateManager.loadSession(sessionId);

      // Reset state for replanning
      session.status = 'READY';
      session.currentStatus = 'READY';
      session.currentStrategy = req.body.strategy || null;
      if (req.body.resetAttempted) {
        session.attemptedStrategies = [];
      }

      const updatedSession = await recoveryPlanner.runRecovery(session);

      res.status(200).json({
        success: true,
        data: updatedSession,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/recovery-sessions/:id/simulate & POST /api/recovery/:id/simulate
   * Runs what-if simulation without mutating actual session state.
   */
  async simulate(req, res, next) {
    try {
      const sessionId = req.params.id;
      const session = await stateManager.loadSession(sessionId);

      if (!session) {
        return res.status(404).json({ success: false, message: 'Recovery session not found' });
      }

      const hypotheticalEvent = {
        type: req.body.type || 'FLIGHT_DELAYED',
        delayMinutes: req.body.delayMinutes !== undefined
          ? req.body.delayMinutes
          : req.body.additionalDelayMinutes !== undefined
          ? req.body.additionalDelayMinutes
          : 60,
        additionalBudget: req.body.additionalBudget || req.body.budgetChange || 0,
        allowExtraTransfer: req.body.allowExtraTransfer || false,
        arrivalDeadline: req.body.arrivalDeadline || null,
        affectedSegmentId: req.body.affectedSegmentId || null,
      };

      const simulationResult = simulationService.simulate(session, hypotheticalEvent);

      res.status(200).json({
        success: true,
        data: simulationResult,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/recovery-sessions/:id/events
   * Returns the agent event timeline.
   */
  async getEvents(req, res, next) {
    try {
      const sessionId = req.params.id;
      const session = await stateManager.loadSession(sessionId);

      res.status(200).json({
        success: true,
        count: (session.agentEvents || []).length,
        data: session.agentEvents || [],
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/recovery-sessions/:id/plans
   * Returns candidate, rejected, and selected plans.
   */
  async getPlans(req, res, next) {
    try {
      const sessionId = req.params.id;
      const session = await stateManager.loadSession(sessionId);

      res.status(200).json({
        success: true,
        data: {
          selectedPlan: session.selectedPlan,
          candidatePlans: session.candidatePlans || [],
          rejectedPlans: session.rejectedPlans || [],
          count: {
            candidate: (session.candidatePlans || []).length,
            rejected: (session.rejectedPlans || []).length,
          },
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/recovery/:id/approve or /api/recovery-sessions/:id/approve
   * Records explicit user approval of the recovery plan for external handoff.
   * Does NOT perform booking or payment.
   */
  async approveRecovery(req, res, next) {
    try {
      const sessionId = req.params.id;
      const planId = req.body.planId || null;
      const { externalHandoffService } = require('../handoff');

      const result = await externalHandoffService.approveHandoff(sessionId, planId);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/recovery/:id/handoff or /api/recovery-sessions/:id/handoff
   * Validates and returns the authorized external handoff link.
   * Enforces that user approval occurred first.
   */
  async executeRecoveryHandoff(req, res, next) {
    try {
      const sessionId = req.params.id;
      const planId = req.body.planId || null;
      const { externalHandoffService } = require('../handoff');

      const result = await externalHandoffService.executeHandoff(sessionId, planId);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new AgentController();
