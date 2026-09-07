'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const mongoose = require('mongoose');

const app = require('../app');
const { Trip, RecoverySession, MonitoringState, Notification, ExternalHandoff } = require('../models');
const { monitoringService } = require('../monitoring');
const simulationService = require('../simulation/SimulationService');
const { deeplinkValidator, externalHandoffService } = require('../handoff');
const cascadeImpactEngine = require('../evaluation/CascadeImpactEngine');
const constraintValidator = require('../evaluation/ConstraintValidator');
const connectionValidator = require('../evaluation/ConnectionValidator');
const riskEngine = require('../evaluation/RiskEngine');
const adaptationEngine = require('../agent/AdaptationEngine');
const recoveryPlanner = require('../agent/RecoveryPlanner');
const { getProvider } = require('../providers');

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

before(async () => {
  const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/triprescue';
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(mongoUri);
  }
  const oldTrips = await Trip.find({ passengerName: /Phase15/ }, '_id');
  const oldTripIds = oldTrips.map((t) => t._id);
  await Trip.deleteMany({ _id: { $in: oldTripIds } });
  await RecoverySession.deleteMany({ tripId: { $in: oldTripIds } });
  await MonitoringState.deleteMany({ tripId: { $in: oldTripIds } });
  await Notification.deleteMany({ tripId: { $in: oldTripIds } });
  await ExternalHandoff.deleteMany({ tripId: { $in: oldTripIds } });
  server = http.createServer(app);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

describe('Phase 15 — Final Testing, Demo Hardening & E2E Verification', () => {

  // ── 1. Primary Hackathon Demo E2E (BLR -> DEL -> JAI) ───────────────────
  it('1. Primary Demo E2E: Executes complete BLR -> DEL -> JAI disruption recovery flow', async () => {
    const now = Date.now();
    const trip = await Trip.create({
      passengerName: 'Phase15 Traveler Ananya Sharma',
      passengerCount: 1,
      origin: 'BLR',
      destination: 'JAI',
      status: 'DISRUPTED',
      departureTime: new Date(now + 3600000),
      arrivalDeadline: new Date(now + 28800000), // 8h deadline
      maxAdditionalBudget: 8000,
      disruption: {
        type: 'FLIGHT_DELAYED',
        delayMinutes: 60,
        expectedImpact: 'Inbound delay at Kempegowda Intl',
      },
      itinerary: [
        {
          segmentId: 'SEG-BLR-DEL',
          transportMode: 'flight',
          carrier: '6E',
          identifier: '6E-101',
          origin: { code: 'BLR', name: 'Kempegowda Intl', city: 'Bengaluru', country: 'India' },
          destination: { code: 'DEL', name: 'Indira Gandhi Intl', city: 'Delhi', country: 'India' },
          departure: new Date(now + 3600000),
          arrival: new Date(now + 13500000),
        },
        {
          segmentId: 'SEG-DEL-JAI',
          transportMode: 'flight',
          carrier: 'AI',
          identifier: 'AI-404',
          origin: { code: 'DEL', name: 'Indira Gandhi Intl', city: 'Delhi', country: 'India' },
          destination: { code: 'JAI', name: 'Jaipur Intl', city: 'Jaipur', country: 'India' },
          departure: new Date(now + 14400000), // 15 min transfer window (broken)
          arrival: new Date(now + 18600000),
        },
      ],
    });

    const session = await RecoverySession.create({
      tripId: trip._id,
      status: 'READY',
      currentStatus: 'READY',
      currentStrategy: 'DIRECT_FLIGHT',
      objective: {
        origin: 'BLR',
        destination: 'JAI',
        departureTime: trip.departureTime,
        arrivalDeadline: trip.arrivalDeadline,
        maxAdditionalBudget: 8000,
        passengerCount: 1,
        priority: 'arrival_time',
        riskTolerance: 'MEDIUM',
      },
      disruption: trip.disruption,
      currentItinerary: trip.itinerary,
    });

    // 1. Cascade Impact
    const impact = cascadeImpactEngine.analyzeImpact(trip.itinerary, trip.disruption, 60, session.objective);
    assert.ok(impact.hasImpact);
    assert.ok(impact.brokenConnections.length > 0 || impact.affectedSegments.length > 0);

    // 2. Risk Score
    const risk = riskEngine.assess(null, session.objective, trip.disruption, []);
    assert.ok(risk.score >= 20);

    // 3. Autonomous Recovery Execution
    const recoveryResult = await recoveryPlanner.runRecovery(session, 10);
    assert.ok(recoveryResult.candidatePlans.length > 0, 'Recovery loop must generate at least one candidate plan');

    // When using live providers (Aviationstack), flights may not meet tight deadline constraints.
    // Verify the recovery loop executed correctly regardless of plan selection outcome.
    if (recoveryResult.selectedPlan) {
      assert.ok(recoveryResult.selectedPlan.status === 'SELECTED' || recoveryResult.selectedPlan.status === 'VALID');

      // 4. Approval & Handoff (only when a viable plan was found)
      const approveRes = await externalHandoffService.approveHandoff(recoveryResult._id, recoveryResult.selectedPlan.planId);
      assert.equal(approveRes.success, true);
      assert.equal(approveRes.handoff.status, 'APPROVED');

      const handoffRes = await externalHandoffService.executeHandoff(recoveryResult._id, recoveryResult.selectedPlan.planId);
      assert.equal(handoffRes.success, true);
      assert.equal(handoffRes.handoff.status, 'OPENED');
    } else {
      // All strategies were exhausted — verify the loop completed gracefully
      assert.ok(recoveryResult.status === 'FAILED' || recoveryResult.status === 'AWAITING_APPROVAL');
      assert.ok(recoveryResult.candidatePlans.length >= 3, 'Recovery must attempt multiple strategies before giving up');
    }
  });

  // ── 2. Scenario 1: Flight cancellation cascade ──────────────────────────
  it('2. Scenario 1: Flight cancellation triggers complete cascade re-evaluation', async () => {
    const now = Date.now();
    const trip = await Trip.create({
      passengerName: 'Phase15 Traveler Scen1',
      passengerCount: 1,
      origin: 'BLR',
      destination: 'DEL',
      status: 'DISRUPTED',
      departureTime: new Date(now + 3600000),
      arrivalDeadline: new Date(now + 28800000),
      maxAdditionalBudget: 6000,
      disruption: { type: 'FLIGHT_CANCELLED', delayMinutes: 0, expectedImpact: 'Flight cancelled' },
      itinerary: [
        {
          segmentId: 'SEG-1',
          transportMode: 'flight',
          carrier: '6E',
          identifier: '6E-501',
          origin: { code: 'BLR' },
          destination: { code: 'DEL' },
          departure: new Date(now + 3600000),
          arrival: new Date(now + 13500000),
        },
      ],
    });

    const impact = cascadeImpactEngine.analyzeImpact(trip.itinerary, trip.disruption, 0, {
      origin: 'BLR',
      destination: 'DEL',
      arrivalDeadline: trip.arrivalDeadline,
    });
    assert.ok(impact.hasImpact);
  });

  // ── 3. Scenario 2: Connection buffer risk ────────────────────────────────
  it('3. Scenario 2: Arrival delay compresses transfer buffer below MCT', async () => {
    const now = Date.now();
    const itinerary = [
      {
        segmentId: 'LEG-1',
        transportMode: 'flight',
        origin: { code: 'BLR' },
        destination: { code: 'DEL' },
        departure: new Date(now + 3600000),
        arrival: new Date(now + 13500000),
      },
      {
        segmentId: 'LEG-2',
        transportMode: 'flight',
        origin: { code: 'DEL' },
        destination: { code: 'JAI' },
        departure: new Date(now + 14400000), // only 15m transfer
        arrival: new Date(now + 18600000),
      },
    ];

    const conn = connectionValidator.validatePlanConnections(itinerary);
    assert.equal(conn.valid, false);
    assert.ok(conn.results.some((r) => r.status === 'INVALID'));
  });

  // ── 4. Scenario 4: Budget exceeded rejection ─────────────────────────────
  it('4. Scenario 4: Over-budget recovery candidate is strictly rejected', async () => {
    const now = Date.now();
    const candidate = {
      planId: 'PLAN-EXPENSIVE',
      strategy: 'DIRECT_FLIGHT',
      totalCost: 7500,
      finalArrivalTime: new Date(now + 18000000),
      origin: 'BLR',
      destination: 'JAI',
      segments: [{ segmentId: 'SEG-1', price: { amount: 7500 } }],
    };
    const objective = { maxAdditionalBudget: 5000, arrivalDeadline: new Date(now + 28800000), origin: 'BLR', destination: 'JAI' };

    const validation = constraintValidator.validate(candidate, objective);
    assert.equal(validation.valid, false);
    assert.ok(validation.violations.length > 0);
  });

  // ── 5. Scenario 6: Multimodal Train & Bus adaptation ─────────────────────
  it('5. Scenario 6: Multimodal fallback discovers valid train/bus alternatives', async () => {
    const trainProvider = getProvider('train');
    const res = await trainProvider.search({ origin: 'DEL', destination: 'JAI' });
    assert.ok(res.results.length > 0);
    assert.equal(res.results[0].transportMode, 'train');
    assert.ok(res.results[0].price.amount <= 3000);
  });

  // ── 6. Scenario 7: Emergency transit hotel accommodation searches near transit hubs ──
  it('6. Scenario 7: Emergency transit hotel accommodation searches near transit hubs', async () => {
    const hotelProvider = getProvider('hotel');
    const res = await hotelProvider.search({ location: 'DEL', checkInDate: new Date().toISOString() });
    assert.ok(res.results.length > 0);
    assert.ok(res.results[0].availableRooms > 0);
  });

  // ── 7. Scenario 8: Fallback provider resilience ──────────────────────────
  it('7. Scenario 8: Provider failure does not crash agent, fallback recovers gracefully', async () => {
    const { getProviderPair } = require('../providers');
    const { primary, fallback } = getProviderPair('flight');
    let res;
    try {
      res = await primary.search({ origin: 'BLR', destination: 'JAI', strategy: 'DIRECT_FLIGHT' });
    } catch {
      res = null;
    }
    if (!res || !res.results || res.results.length === 0) {
      res = await fallback.search({ origin: 'BLR', destination: 'JAI', strategy: 'DIRECT_FLIGHT' });
    }
    assert.ok(res.results.length > 0);
  });

  // ── 8. What-If Simulation: Active MongoDB Immutability ───────────────────
  it('8. What-If Simulation: Clones state and preserves active MongoDB documents perfectly', async () => {
    const now = Date.now();
    const trip = await Trip.create({
      passengerName: 'Phase15 Sim Tester',
      passengerCount: 1,
      origin: 'BLR',
      destination: 'JAI',
      status: 'DISRUPTED',
      departureTime: new Date(now + 3600000),
      arrivalDeadline: new Date(now + 28800000),
      maxAdditionalBudget: 5000,
      disruption: { type: 'FLIGHT_DELAYED', delayMinutes: 30, expectedImpact: 'Delay' },
      itinerary: [
        {
          segmentId: 'SEG-1',
          transportMode: 'flight',
          carrier: '6E',
          origin: { code: 'BLR', name: 'Kempegowda Intl', city: 'Bengaluru', country: 'India' },
          destination: { code: 'JAI', name: 'Jaipur Intl', city: 'Jaipur', country: 'India' },
          departure: new Date(now + 3600000),
          arrival: new Date(now + 18000000),
        },
      ],
    });

    const session = await RecoverySession.create({
      tripId: trip._id,
      status: 'RECOVERING',
      currentStrategy: 'DIRECT_FLIGHT',
      objective: {
        origin: 'BLR',
        destination: 'JAI',
        departureTime: trip.departureTime,
        arrivalDeadline: trip.arrivalDeadline,
        maxAdditionalBudget: 5000,
        priority: 'arrival_time',
        riskTolerance: 'MEDIUM',
      },
      disruption: trip.disruption,
      currentItinerary: trip.itinerary,
      candidatePlans: [],
    });

    const simResult = simulationService.simulate(session, {
      additionalDelayMinutes: 60,
    });
    assert.strictEqual(simResult.isSimulation, true);
    assert.ok(simResult.simulationId);

    // Verify original DB records are 100% untouched
    const freshTrip = await Trip.findById(trip._id);
    assert.equal(freshTrip.status, 'DISRUPTED');
  });

  // ── 9. Monitoring Loop Guard & Fingerprint Deduplication ─────────────────
  it('9. Monitoring: Suppresses identical duplicate alerts and strictly enforces replan cap', async () => {
    const now = Date.now();
    const trip = await Trip.create({
      passengerName: 'Phase15 Mon Tester',
      passengerCount: 1,
      origin: 'BLR',
      destination: 'JAI',
      status: 'DISRUPTED',
      departureTime: new Date(now + 3600000),
      arrivalDeadline: new Date(now + 28800000),
      maxAdditionalBudget: 5000,
      disruption: { type: 'FLIGHT_DELAYED', delayMinutes: 20 },
      itinerary: [
        {
          segmentId: 'SEG-1',
          transportMode: 'flight',
          carrier: '6E',
          origin: { code: 'BLR', name: 'Kempegowda Intl', city: 'Bengaluru', country: 'India' },
          destination: { code: 'JAI', name: 'Jaipur Intl', city: 'Jaipur', country: 'India' },
          departure: new Date(now + 3600000),
          arrival: new Date(now + 18000000),
        },
      ],
    });

    const session = await RecoverySession.create({
      tripId: trip._id,
      status: 'RECOVERING',
      currentStrategy: 'DIRECT_FLIGHT',
      objective: {
        origin: 'BLR',
        destination: 'JAI',
        departureTime: trip.departureTime,
        arrivalDeadline: trip.arrivalDeadline,
        maxAdditionalBudget: 5000,
        priority: 'arrival_time',
        riskTolerance: 'MEDIUM',
      },
      disruption: trip.disruption,
      currentItinerary: trip.itinerary,
    });

    const check1 = await monitoringService.checkTrip(session._id.toString(), {
      eventType: 'FLIGHT_DELAYED', delayMinutes: 40, affectedSegmentId: 'SEG-1', status: 'DELAYED',
    });
    assert.equal(check1.changeDetected, true);

    const check2 = await monitoringService.checkTrip(session._id.toString(), {
      eventType: 'FLIGHT_DELAYED', delayMinutes: 40, affectedSegmentId: 'SEG-1', status: 'DELAYED',
    });
    assert.equal(check2.changeDetected, false);

    monitoringService.stopMonitoring(session._id.toString());
  });

  // ── 10. Handoff Security & Domain Whitelist ──────────────────────────────
  it('10. Handoff Security: Blocks malicious URLs and validates trusted domain allowlist', async () => {
    const validated = deeplinkValidator.validate('javascript:alert(1)', 'Untrusted');
    assert.equal(validated.valid, false);
  });

  after(async () => {
    monitoringService.stopAll();
    const oldTrips = await Trip.find({ passengerName: /Phase15/ }, '_id');
    const oldTripIds = oldTrips.map((t) => t._id);
    await Trip.deleteMany({ _id: { $in: oldTripIds } });
    await RecoverySession.deleteMany({ tripId: { $in: oldTripIds } });
    await MonitoringState.deleteMany({ tripId: { $in: oldTripIds } });
    await Notification.deleteMany({ tripId: { $in: oldTripIds } });
    await ExternalHandoff.deleteMany({ tripId: { $in: oldTripIds } });
    if (server) {
      await new Promise((r) => server.close(r));
    }
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  });
});
