const mongoose = require('mongoose');
const MonitoringState = require('../models/MonitoringState');
const Trip = require('../models/Trip');
const stateManager = require('../agent/StateManager');
const recoveryPlanner = require('../agent/RecoveryPlanner');
const cascadeImpactEngine = require('../evaluation/CascadeImpactEngine');
const constraintValidator = require('../evaluation/ConstraintValidator');
const connectionValidator = require('../evaluation/ConnectionValidator');
const riskEngine = require('../evaluation/RiskEngine');
const { notificationService } = require('../notifications');
const { calendarService } = require('../calendar');
const { getProvider } = require('../providers');
const eventLogger = require('../agent/EventLogger');

class MonitoringService {
  constructor() {
    // In-memory registry of active interval timers keyed by sessionId
    this._monitors = new Map();
    // Default polling interval in ms (default 60 seconds)
    this.defaultIntervalMs = 60000;
    // Maximum automated replans allowed per session
    this.maxReplansPerSession = 3;
    // Minimum cooldown period in ms between automated replans
    this.replanCooldownMs = 10000;
  }

  /**
   * Start periodic monitoring for a recovery session.
   * @param {string} sessionId
   * @param {number} [intervalMs]
   * @returns {Promise<Object>} Status object
   */
  async startMonitoring(sessionId, intervalMs = this.defaultIntervalMs) {
    if (!sessionId) throw new Error('Session ID is required to start monitoring');

    const session = await stateManager.loadSession(sessionId);
    if (!session) throw new Error(`Recovery session ${sessionId} not found`);

    const trip = await Trip.findById(session.tripId);
    if (!trip) throw new Error(`Trip ${session.tripId} not found`);

    // Verify trip is in an active/monitorable state
    const monitorableStatuses = ['ACTIVE', 'DISRUPTED', 'RECOVERING', 'active', 'disrupted', 'recovering'];
    if (!monitorableStatuses.includes(trip.status)) {
      return {
        success: false,
        sessionId,
        status: 'IGNORED',
        message: `Trip is in ${trip.status} state; monitoring only applies to active/recovering trips`,
      };
    }

    // Stop existing timer if already running
    this.stopMonitoringTimer(sessionId);

    // Upsert MonitoringState in MongoDB
    let state = await MonitoringState.findOne({ sessionId });
    if (!state) {
      state = await MonitoringState.create({
        sessionId,
        tripId: trip._id,
        status: 'ACTIVE',
      });
    } else {
      state.status = 'ACTIVE';
      await state.save();
    }

    // Register bounded interval timer
    const timer = setInterval(() => {
      this.checkTrip(sessionId).catch((err) => {
        console.warn(`[MonitoringService] Background check error for ${sessionId}: ${err.message}`);
      });
    }, intervalMs);

    // Prevent timer from keeping Node process alive in tests
    if (timer.unref) timer.unref();

    this._monitors.set(sessionId, {
      timer,
      intervalMs,
      status: 'ACTIVE',
      startedAt: new Date(),
    });

    return {
      success: true,
      sessionId,
      status: 'ACTIVE',
      intervalMs,
      message: 'Monitoring started successfully',
    };
  }

  /**
   * Pause monitoring for a recovery session.
   * @param {string} sessionId
   * @returns {Promise<Object>}
   */
  async pauseMonitoring(sessionId) {
    this.stopMonitoringTimer(sessionId);

    const state = await MonitoringState.findOne({ sessionId });
    if (state) {
      state.status = 'PAUSED';
      await state.save();
    }

    const monitorInfo = this._monitors.get(sessionId);
    if (monitorInfo) {
      monitorInfo.status = 'PAUSED';
    }

    return {
      success: true,
      sessionId,
      status: 'PAUSED',
      message: 'Monitoring paused',
    };
  }

  /**
   * Stop monitoring completely for a recovery session.
   * @param {string} sessionId
   * @returns {Promise<Object>}
   */
  async stopMonitoring(sessionId) {
    this.stopMonitoringTimer(sessionId);
    this._monitors.delete(sessionId);

    const state = await MonitoringState.findOne({ sessionId });
    if (state) {
      state.status = 'STOPPED';
      await state.save();
    }

    return {
      success: true,
      sessionId,
      status: 'STOPPED',
      message: 'Monitoring stopped',
    };
  }

  /**
   * Helper to clear an in-memory timer.
   */
  stopMonitoringTimer(sessionId) {
    if (this._monitors.has(sessionId)) {
      const info = this._monitors.get(sessionId);
      if (info?.timer) {
        clearInterval(info.timer);
      }
      this._monitors.delete(sessionId);
    }
  }

  /**
   * Stop all active monitoring timers (e.g. for testing teardown).
   */
  stopAll() {
    for (const [sessionId, info] of this._monitors) {
      if (info?.timer) {
        clearInterval(info.timer);
      }
    }
    this._monitors.clear();
  }

  /**
   * Get monitoring status for a recovery session.
   * @param {string} sessionId
   * @returns {Promise<Object>}
   */
  async getStatus(sessionId) {
    let state = await MonitoringState.findOne({ sessionId }).lean();
    const inMemory = this._monitors.get(sessionId);

    return {
      sessionId,
      status: inMemory?.status || state?.status || 'STOPPED',
      isTimerActive: Boolean(inMemory && inMemory.status === 'ACTIVE'),
      lastCheckedAt: state?.lastCheckedAt || null,
      lastObservation: state?.lastObservation || null,
      lastEventFingerprint: state?.lastEventFingerprint || null,
      lastTriggeredEvent: state?.lastTriggeredEvent || null,
      replanCount: state?.replanCount || 0,
      historyCount: state?.history?.length || 0,
    };
  }

  /**
   * Execute a single monitoring cycle for a session.
   * Can be triggered on-demand, by timer, or with deterministic mock overrides.
   *
   * @param {string} sessionId
   * @param {Object} [mockOverride] - Deterministic test/demo override { eventType, delayMinutes, affectedSegmentId, status }
   * @returns {Promise<Object>} Detailed monitoring inspection result
   */
  async checkTrip(sessionId, mockOverride = null) {
    const session = await stateManager.loadSession(sessionId);
    if (!session) throw new Error(`Recovery session ${sessionId} not found`);

    const trip = await Trip.findById(session.tripId);
    if (!trip) throw new Error(`Trip ${session.tripId} not found`);

    // Verify trip is still in an active/recovering state
    const nonMonitorable = ['COMPLETED', 'CANCELLED', 'completed', 'cancelled'];
    if (nonMonitorable.includes(trip.status)) {
      await this.stopMonitoring(sessionId);
      return {
        sessionId,
        status: 'STOPPED',
        changeDetected: false,
        message: `Trip has transitioned to ${trip.status}; monitoring terminated.`,
      };
    }

    // Ensure MonitoringState record exists
    let state = null;
    try {
      state = await MonitoringState.findOne({ sessionId });
      if (!state) {
        state = await MonitoringState.create({
          sessionId,
          tripId: trip._id,
          status: 'ACTIVE',
        });
      }
    } catch (e) {
      return {
        sessionId,
        checkedAt: new Date(),
        changeDetected: false,
        eventType: 'NO_CHANGE',
        message: 'Monitoring state unavailable',
      };
    }

    const checkTimestamp = new Date();
    const itinerary = session.currentItinerary || [];

    // 1. Observe segments and detect state changes
    let detectedEventType = 'NO_CHANGE';
    let affectedSegmentId = null;
    let delayMinutes = 0;
    let segmentStatus = 'NORMAL';
    let changeDescription = 'All itinerary segments operating nominally';

    if (mockOverride) {
      // Deterministic mock override for demo/test scenarios
      detectedEventType = mockOverride.eventType || 'FLIGHT_DELAYED';
      delayMinutes = Number(mockOverride.delayMinutes) || 0;
      affectedSegmentId = mockOverride.affectedSegmentId || itinerary[0]?.segmentId || null;
      segmentStatus = mockOverride.status || (detectedEventType.includes('CANCEL') ? 'CANCELLED' : 'DELAYED');
      changeDescription = mockOverride.description || `Observed ${detectedEventType} with ${delayMinutes}m delay`;
    } else {
      // Query provider abstractions for each segment
      for (const seg of itinerary) {
        try {
          const provider = getProvider(seg.transportMode || 'flight');
          const reval = await provider.revalidate(seg.identifier || seg.segmentId);

          if (reval.status === 'CANCELLED' || reval.valid === false) {
            detectedEventType = seg.transportMode === 'train'
              ? 'TRAIN_CANCELLED'
              : seg.transportMode === 'bus'
              ? 'BUS_CANCELLED'
              : 'FLIGHT_CANCELLED';
            affectedSegmentId = seg.segmentId;
            segmentStatus = 'CANCELLED';
            changeDescription = `Segment ${seg.identifier} cancelled by provider`;
            break;
          }

          if (reval.status === 'UNAVAILABLE') {
            detectedEventType = 'AVAILABILITY_CHANGED';
            affectedSegmentId = seg.segmentId;
            segmentStatus = 'UNAVAILABLE';
            changeDescription = `Segment ${seg.identifier} is no longer available`;
            break;
          }
        } catch (e) {
          // Provider error is isolated
        }
      }
    }

    // Check connection feasibility if no cancellation yet
    let connectionAtRisk = false;
    if (itinerary.length > 1 && !detectedEventType.includes('CANCEL')) {
      const connCheck = connectionValidator.validatePlanConnections(itinerary);
      if (!connCheck.valid) {
        connectionAtRisk = true;
        if (detectedEventType === 'NO_CHANGE') {
          detectedEventType = 'CONNECTION_AT_RISK';
          changeDescription = 'Downstream connection window compressed below safety threshold';
        }
      }
    }

    // 2. Event Fingerprinting & Duplicate Prevention
    const currentFingerprint = `${detectedEventType}:${affectedSegmentId || 'none'}:${delayMinutes}:${segmentStatus}`;

    if (detectedEventType === 'NO_CHANGE' || currentFingerprint === state.lastEventFingerprint) {
      await MonitoringState.updateOne(
        { sessionId },
        { $set: { lastCheckedAt: checkTimestamp } }
      ).catch(() => {});

      return {
        sessionId,
        checkedAt: checkTimestamp,
        changeDetected: false,
        eventType: 'NO_CHANGE',
        message: 'No new meaningful change detected in monitored state',
        fingerprint: currentFingerprint,
      };
    }

    // 3. Construct Structured Monitoring Event
    const monitoringEvent = {
      eventId: `MON-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      type: detectedEventType,
      tripId: trip._id.toString(),
      sessionId,
      segmentId: affectedSegmentId,
      detectedAt: checkTimestamp.toISOString(),
      previousState: state.lastObservation || null,
      currentState: {
        eventType: detectedEventType,
        segmentId: affectedSegmentId,
        delayMinutes,
        status: segmentStatus,
      },
      delta: { delayMinutes },
      severity: detectedEventType.includes('CANCEL') ? 'CRITICAL' : delayMinutes > 45 ? 'HIGH' : 'MEDIUM',
      requiresReevaluation: true,
      description: changeDescription,
    };

    // Log event to session agent timeline
    eventLogger.log(session, 'MONITORING_ALERT', changeDescription, {
      monitoringEvent,
    });

    // 4. Downstream Cascade Impact Analysis
    const disruption = {
      type: detectedEventType,
      affectedSegmentId,
      detectedAt: checkTimestamp.toISOString(),
      delayMinutes,
      description: changeDescription,
    };

    const impactReport = cascadeImpactEngine.analyzeImpact(
      itinerary,
      disruption,
      delayMinutes,
      session.objective
    );

    // 5. Plan Re-Evaluation
    let planStillFeasible = true;
    let planInvalidationReason = null;

    if (session.selectedPlan) {
      const plan = session.selectedPlan;

      if (detectedEventType.includes('CANCEL')) {
        planStillFeasible = false;
        planInvalidationReason = `Monitored cancellation of segment ${affectedSegmentId}`;
      } else {
        // Shift arrival if delayed
        const planClone = JSON.parse(JSON.stringify(plan));
        if (delayMinutes > 0 && planClone.finalArrivalTime) {
          const shifted = new Date(new Date(planClone.finalArrivalTime).getTime() + delayMinutes * 60000);
          planClone.finalArrivalTime = shifted.toISOString();
        }

        const constr = constraintValidator.validate(planClone, session.objective);
        const conn = connectionValidator.validatePlanConnections(planClone.segments || []);
        planStillFeasible = constr.valid && conn.valid;

        if (!planStillFeasible) {
          planInvalidationReason = [
            ...constr.violations.map((v) => v.message),
            ...conn.results.filter((c) => c.status === 'INVALID').map((c) => c.message),
          ].join('; ');
        }
      }
    }

    // 6. Automated Replanning Trigger & Loop Safeguard
    let replanTriggered = false;
    let replanBlockedReason = null;

    if (!planStillFeasible) {
      const nowMs = Date.now();
      const lastReplanMs = state.lastReplanAt ? new Date(state.lastReplanAt).getTime() : 0;
      const cooldownElapsed = nowMs - lastReplanMs >= this.replanCooldownMs;

      if (state.replanCount >= this.maxReplansPerSession) {
        replanBlockedReason = `Max replan count (${this.maxReplansPerSession}) reached for this monitoring session`;
        eventLogger.log(session, 'MAX_ITERATIONS_REACHED', replanBlockedReason, {
          replanCount: state.replanCount,
        });
      } else if (!cooldownElapsed) {
        replanBlockedReason = 'Automated replan paused due to cooldown debounce';
      } else {
        // Execute automated replanning
        replanTriggered = true;
        state.replanCount += 1;
        state.lastReplanAt = new Date();

        eventLogger.log(session, 'REPLAN_TRIGGERED', `Plan invalidated by monitoring event: ${planInvalidationReason}`, {
          trigger: detectedEventType,
        });

        session.status = 'READY';
        session.currentStatus = 'READY';
        await recoveryPlanner.runRecovery(session, 5);

        // Emit notification
        await notificationService.emitNotification('PLAN_INVALIDATED', {
          tripId: trip._id,
          sessionId,
          title: 'Recovery Plan Invalidated',
          message: `Monitored change (${detectedEventType}) made current plan infeasible: ${planInvalidationReason}. Autonomous replanning triggered.`,
        });

        await notificationService.emitNotification('RECOVERY_UPDATED', {
          tripId: trip._id,
          sessionId,
          title: 'Recovery Plan Updated',
          message: 'Autonomous replanning generated updated feasible candidate plans.',
        });
      }
    } else if (detectedEventType === 'CONNECTION_AT_RISK' || connectionAtRisk) {
      await notificationService.emitNotification('CONNECTION_AT_RISK', {
        tripId: trip._id,
        sessionId,
        title: 'Connection At Risk',
        message: 'Flight arrival delay has compressed your transfer window close to minimum connection time.',
      });
    }

    // 7. Read-Only Calendar Conflict Detection
    let calendarConflict = null;
    try {
      if (session.selectedPlan?.finalArrivalTime) {
        calendarConflict = calendarService.detectConflicts(session.selectedPlan.finalArrivalTime);
      }
    } catch (calErr) {
      // isolated
    }

    // 8. Update MonitoringState in Database
    await MonitoringState.updateOne(
      { sessionId },
      {
        $set: {
          lastCheckedAt: checkTimestamp,
          lastObservation: {
            eventType: detectedEventType,
            segmentId: affectedSegmentId,
            delayMinutes,
            status: segmentStatus,
          },
          lastEventFingerprint: currentFingerprint,
          lastTriggeredEvent: monitoringEvent,
          replanCount: state.replanCount,
          lastReplanAt: state.lastReplanAt,
        },
        $push: {
          history: {
            $each: [{ timestamp: checkTimestamp, eventType: detectedEventType, replanTriggered }],
            $position: 0,
            $slice: 20,
          },
        },
      }
    ).catch(() => {});

    return {
      sessionId,
      checkedAt: checkTimestamp,
      changeDetected: true,
      monitoringEvent,
      impactReport,
      planStillFeasible,
      planInvalidationReason,
      replanTriggered,
      replanBlockedReason,
      calendarConflict,
      replanCount: state.replanCount,
    };
  }
}

module.exports = new MonitoringService();
