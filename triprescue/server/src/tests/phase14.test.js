'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const mongoose = require('mongoose');

const app = require('../app');
const { Trip, RecoverySession, MonitoringState, Notification } = require('../models');
const { monitoringService } = require('../monitoring');
const { notificationService } = require('../notifications');

let server, baseUrl;

function request(method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const url = new URL(path, baseUrl);
    const opts = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      headers: { 'Content-Type': 'application/json' },
    };
    const req = http.request(opts, (res) => {
      let raw = '';
      res.on('data', (c) => (raw += c));
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(raw) }); }
        catch { resolve({ status: res.statusCode, body: raw }); }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------
const createdTripIds = [];
const createdSessionIds = [];

before(async () => {
  const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/triprescue';
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(mongoUri);
  }
  const oldTrips = await Trip.find({ passengerName: /Phase14/ }, '_id');
  const oldTripIds = oldTrips.map((t) => t._id);
  await Trip.deleteMany({ _id: { $in: oldTripIds } });
  await RecoverySession.deleteMany({ tripId: { $in: oldTripIds } });
  await MonitoringState.deleteMany({ tripId: { $in: oldTripIds } });
  await Notification.deleteMany({ tripId: { $in: oldTripIds } });

  server = http.createServer(app);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  monitoringService.stopAll();
  await new Promise((r) => setTimeout(r, 100));
  await Trip.deleteMany({ _id: { $in: createdTripIds } });
  await RecoverySession.deleteMany({ _id: { $in: createdSessionIds } });
  await MonitoringState.deleteMany({ sessionId: { $in: createdSessionIds } });
  await Notification.deleteMany({ sessionId: { $in: createdSessionIds } });
  if (server) {
    await new Promise((r) => server.close(r));
  }
  await new Promise((r) => setTimeout(r, 100));
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
});

// ---------------------------------------------------------------------------
// Helper: create test trip and recovery session
// ---------------------------------------------------------------------------
async function createTestTripAndSession(overrides = {}) {
  const now = Date.now();
  const trip = await Trip.create({
    passengerName: 'Phase14 Traveler',
    passengerCount: 1,
    origin: 'JFK',
    destination: 'LAX',
    status: 'DISRUPTED',
    departureTime: new Date(now + 3600000),
    arrivalDeadline: new Date(now + 25200000),
    maxAdditionalBudget: 2000,
    disruption: {
      type: 'FLIGHT_DELAYED',
      delayMinutes: 30,
      expectedImpact: 'Inbound aircraft delayed',
    },
    itinerary: [
      {
        segmentId: 'SEG-JFK-LAX',
        transportMode: 'flight',
        carrier: 'AA',
        identifier: 'AA-100',
        origin: { code: 'JFK', name: 'John F Kennedy Intl', city: 'New York', country: 'USA' },
        destination: { code: 'LAX', name: 'Los Angeles Intl', city: 'Los Angeles', country: 'USA' },
        departure: new Date(now + 3600000),
        arrival: new Date(now + 21600000),
      },
    ],
    ...overrides,
  });

  const session = await RecoverySession.create({
    tripId: trip._id,
    status: 'RECOVERING',
    currentStrategy: 'DIRECT_FLIGHT',
    objective: {
      origin: 'JFK',
      destination: 'LAX',
      departureTime: trip.departureTime,
      arrivalDeadline: trip.arrivalDeadline,
      maxAdditionalBudget: trip.maxAdditionalBudget,
      priority: 'arrival_time',
      riskTolerance: 'MEDIUM',
    },
    disruption: trip.disruption,
    currentItinerary: trip.itinerary,
    candidatePlans: [
      {
        planId: 'PLAN-14-BASE',
        strategy: 'DIRECT_FLIGHT',
        totalCost: 450,
        finalArrivalTime: new Date(now + 21600000),
        status: 'VALID',
        hardConstraintsPassed: true,
        connectionsFeasible: true,
        segments: trip.itinerary,
        score: 90,
      },
    ],
    selectedPlan: {
      planId: 'PLAN-14-BASE',
      strategy: 'DIRECT_FLIGHT',
      totalCost: 450,
      finalArrivalTime: new Date(now + 21600000),
      status: 'VALID',
      hardConstraintsPassed: true,
      connectionsFeasible: true,
      segments: trip.itinerary,
      score: 90,
    },
  });

  createdTripIds.push(trip._id);
  createdSessionIds.push(session._id);

  return { trip, session, sessionId: session._id.toString(), tripId: trip._id.toString() };
}

// ---------------------------------------------------------------------------
// Phase 14 Test Suite
// ---------------------------------------------------------------------------
describe('Phase 14 — Monitoring & Dynamic Adjustment Engine', () => {

  it('1. POST /api/recovery/:id/monitor/start initializes ACTIVE monitoring and registers timer', async () => {
    const { sessionId } = await createTestTripAndSession();
    const res = await request('POST', `/api/recovery/${sessionId}/monitor/start`, { intervalMs: 30000 });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.status, 'ACTIVE');
    assert.equal(res.body.data.intervalMs, 30000);

    // Verify DB state persisted
    const dbState = await MonitoringState.findOne({ sessionId });
    assert.ok(dbState, 'MonitoringState should be created in DB');
    assert.equal(dbState.status, 'ACTIVE');

    monitoringService.stopMonitoring(sessionId);
  });

  it('2. GET /api/recovery/:id/monitor/status returns current monitoring state', async () => {
    const { sessionId } = await createTestTripAndSession();
    await request('POST', `/api/recovery/${sessionId}/monitor/start`, { intervalMs: 60000 });

    const res = await request('GET', `/api/recovery/${sessionId}/monitor/status`);
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.status, 'ACTIVE');
    assert.equal(res.body.data.isTimerActive, true);
    assert.equal(res.body.data.replanCount, 0);

    monitoringService.stopMonitoring(sessionId);
  });

  it('3. POST /api/recovery/:id/monitor/pause transitions monitoring to PAUSED', async () => {
    const { sessionId } = await createTestTripAndSession();
    await request('POST', `/api/recovery/${sessionId}/monitor/start`, { intervalMs: 60000 });

    const res = await request('POST', `/api/recovery/${sessionId}/monitor/pause`);
    assert.equal(res.status, 200);
    assert.equal(res.body.data.status, 'PAUSED');

    const dbState = await MonitoringState.findOne({ sessionId });
    assert.equal(dbState.status, 'PAUSED');

    monitoringService.stopMonitoring(sessionId);
  });

  it('4. POST /api/recovery/:id/monitor/stop clears timer and marks status STOPPED', async () => {
    const { sessionId } = await createTestTripAndSession();
    await request('POST', `/api/recovery/${sessionId}/monitor/start`, { intervalMs: 60000 });

    const res = await request('POST', `/api/recovery/${sessionId}/monitor/stop`);
    assert.equal(res.status, 200);
    assert.equal(res.body.data.status, 'STOPPED');

    const dbState = await MonitoringState.findOne({ sessionId });
    assert.equal(dbState.status, 'STOPPED');
    assert.equal(monitoringService._monitors.has(sessionId), false);
  });

  it('5. Manual check with FLIGHT_DELAYED mock override detects new delay and logs MONITORING_ALERT', async () => {
    const { sessionId } = await createTestTripAndSession();
    await request('POST', `/api/recovery/${sessionId}/monitor/start`, { intervalMs: 600000 });

    const res = await request('POST', `/api/recovery/${sessionId}/monitor/check`, {
      mockOverride: {
        eventType: 'FLIGHT_DELAYED',
        delayMinutes: 60,
        affectedSegmentId: 'SEG-JFK-LAX',
        status: 'DELAYED',
      },
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.ok(res.body.data.monitoringEvent);
    assert.equal(res.body.data.monitoringEvent.type, 'FLIGHT_DELAYED');
    assert.equal(res.body.data.monitoringEvent.delta.delayMinutes, 60);

    // Verify persisted observation in DB
    const dbState = await MonitoringState.findOne({ sessionId });
    assert.ok(dbState.lastObservation);
    assert.equal(dbState.lastObservation.eventType, 'FLIGHT_DELAYED');

    monitoringService.stopMonitoring(sessionId);
  });

  it('6. Fingerprint deduplication: identical repeated check does not re-alert', async () => {
    const { sessionId } = await createTestTripAndSession();
    await request('POST', `/api/recovery/${sessionId}/monitor/start`, { intervalMs: 600000 });

    const checkPayload = {
      mockOverride: {
        eventType: 'FLIGHT_DELAYED',
        delayMinutes: 45,
        affectedSegmentId: 'SEG-JFK-LAX',
        status: 'DELAYED',
      },
    };

    const firstCheck = await request('POST', `/api/recovery/${sessionId}/monitor/check`, checkPayload);
    assert.equal(firstCheck.status, 200);
    assert.equal(firstCheck.body.data.changeDetected, true);

    const secondCheck = await request('POST', `/api/recovery/${sessionId}/monitor/check`, checkPayload);
    assert.equal(secondCheck.status, 200);
    // Fingerprint matches - no change emitted
    assert.equal(secondCheck.body.data.changeDetected, false);
    assert.equal(secondCheck.body.data.eventType, 'NO_CHANGE');

    monitoringService.stopMonitoring(sessionId);
  });

  it('7. FLIGHT_CANCELLED mock override triggers automated replan evaluation', async () => {
    const { sessionId } = await createTestTripAndSession();
    await request('POST', `/api/recovery/${sessionId}/monitor/start`, { intervalMs: 600000 });

    const res = await request('POST', `/api/recovery/${sessionId}/monitor/check`, {
      mockOverride: {
        eventType: 'FLIGHT_CANCELLED',
        delayMinutes: 0,
        affectedSegmentId: 'SEG-JFK-LAX',
        status: 'CANCELLED',
      },
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.ok(res.body.data.replanTriggered !== undefined);

    monitoringService.stopMonitoring(sessionId);
  });

  it('8. TRAIN_DELAYED mock override is processed correctly by monitoring engine', async () => {
    const { sessionId } = await createTestTripAndSession();
    await request('POST', `/api/recovery/${sessionId}/monitor/start`, { intervalMs: 600000 });

    const res = await request('POST', `/api/recovery/${sessionId}/monitor/check`, {
      mockOverride: {
        eventType: 'TRAIN_DELAYED',
        delayMinutes: 25,
        affectedSegmentId: 'SEG-TRAIN-01',
        status: 'DELAYED',
      },
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.monitoringEvent.type, 'TRAIN_DELAYED');

    monitoringService.stopMonitoring(sessionId);
  });

  it('9. BUS_CANCELLED mock override is processed correctly by monitoring engine', async () => {
    const { sessionId } = await createTestTripAndSession();
    await request('POST', `/api/recovery/${sessionId}/monitor/start`, { intervalMs: 600000 });

    const res = await request('POST', `/api/recovery/${sessionId}/monitor/check`, {
      mockOverride: {
        eventType: 'BUS_CANCELLED',
        delayMinutes: 0,
        affectedSegmentId: 'SEG-BUS-01',
        status: 'CANCELLED',
      },
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.monitoringEvent.type, 'BUS_CANCELLED');

    monitoringService.stopMonitoring(sessionId);
  });

  it('10. HOTEL_CHANGED mock override is processed correctly by monitoring engine', async () => {
    const { sessionId } = await createTestTripAndSession();
    await request('POST', `/api/recovery/${sessionId}/monitor/start`, { intervalMs: 600000 });

    const res = await request('POST', `/api/recovery/${sessionId}/monitor/check`, {
      mockOverride: {
        eventType: 'HOTEL_CHANGED',
        delayMinutes: 0,
        affectedSegmentId: 'SEG-HOTEL-01',
        status: 'UNAVAILABLE',
      },
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.monitoringEvent.type, 'HOTEL_CHANGED');

    monitoringService.stopMonitoring(sessionId);
  });

  it('11. Replan loop guard: caps automatic replans at maxReplansPerSession (3)', async () => {
    const { sessionId, tripId } = await createTestTripAndSession();
    
    // Simulate session that has already reached maximum automated replans
    await MonitoringState.create({
      sessionId,
      tripId,
      status: 'ACTIVE',
      replanCount: 3,
      lastReplanAt: new Date(),
    });

    const res = await request('POST', `/api/recovery/${sessionId}/monitor/check`, {
      mockOverride: {
        eventType: 'FLIGHT_CANCELLED',
        delayMinutes: 0,
        affectedSegmentId: 'SEG-JFK-LAX',
        status: 'CANCELLED',
      },
    });

    assert.equal(res.status, 200);
    // Should NOT trigger another replan because cap of 3 has been reached
    assert.equal(res.body.data.replanTriggered, false);
    assert.match(res.body.data.replanBlockedReason || '', /Max replan/i);
  });

  it('12. Notification service emits alert for critical monitored disruptions', async () => {
    const { sessionId, trip } = await createTestTripAndSession();

    const notifRes = await notificationService.emitNotification('CONNECTION_AT_RISK', {
      tripId: trip._id,
      sessionId,
      title: 'Monitored Disruption Alert',
      message: 'Dynamic monitoring detected high cascade impact on connection.',
      metadata: { delayMinutes: 45 },
    });

    assert.ok(notifRes);
    assert.equal(notifRes.type, 'CONNECTION_AT_RISK');
  });
});
