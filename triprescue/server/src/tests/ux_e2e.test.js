'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const mongoose = require('mongoose');

const app = require('../app');
const { Trip, RecoverySession, MonitoringState, Notification, ExternalHandoff, InsuranceAnalysis, CompensationCase } = require('../models');
const { monitoringService } = require('../monitoring');

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
  const oldTrips = await Trip.find({ passengerName: /UXE2ETraveler/ }, '_id');
  const oldTripIds = oldTrips.map((t) => t._id);
  await Trip.deleteMany({ _id: { $in: oldTripIds } });
  await RecoverySession.deleteMany({ tripId: { $in: oldTripIds } });
  await MonitoringState.deleteMany({ tripId: { $in: oldTripIds } });
  await Notification.deleteMany({ tripId: { $in: oldTripIds } });
  await ExternalHandoff.deleteMany({ tripId: { $in: oldTripIds } });
  await InsuranceAnalysis.deleteMany({ tripId: { $in: oldTripIds } });
  await CompensationCase.deleteMany({ tripId: { $in: oldTripIds } });

  server = http.createServer(app);
  await new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });
});

describe('Post-Phase-15 UX & End-to-End Traveler Journey Suite', () => {
  let createdTripId;
  let activeSessionId;
  let recommendedPlanId;

  it('Step 1: Traveler creates trip with recovery objective and initial multi-leg itinerary', async () => {
    const now = new Date();
    const dep = new Date(now.getTime() + 2 * 3600 * 1000);
    const arr = new Date(now.getTime() + 10 * 3600 * 1000);

    const tripPayload = {
      passengerName: 'UXE2ETraveler Krishna',
      passengerCount: 1,
      origin: 'BLR',
      destination: 'JAI',
      departureTime: dep.toISOString(),
      arrivalDeadline: arr.toISOString(),
      maxAdditionalBudget: 8000,
      priority: 'arrival_time',
      riskTolerance: 'MEDIUM',
    };

    const res = await request('POST', '/api/trips', tripPayload);
    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.body.success, true);
    assert.ok(res.body.data._id);
    createdTripId = res.body.data._id;

    // Add multi-leg itinerary segments: BLR -> DEL flight, DEL -> JAI flight
    const seg1 = {
      transportMode: 'flight',
      carrier: '6E',
      identifier: '6E-501',
      origin: { code: 'BLR', name: 'Bengaluru Kempegowda', city: 'Bengaluru' },
      destination: { code: 'DEL', name: 'Delhi IGI Airport', city: 'Delhi' },
      departure: new Date(now.getTime() + 2 * 3600 * 1000).toISOString(),
      arrival: new Date(now.getTime() + 4.5 * 3600 * 1000).toISOString(),
      status: 'CONFIRMED',
      bookingReference: 'INDIGO-BLR-DEL',
    };
    const segRes1 = await request('POST', `/api/trips/${createdTripId}/segments`, seg1);
    assert.strictEqual(segRes1.status, 201);

    const seg2 = {
      transportMode: 'flight',
      carrier: 'AI',
      identifier: 'AI-402',
      origin: { code: 'DEL', name: 'Delhi IGI Airport', city: 'Delhi' },
      destination: { code: 'JAI', name: 'Jaipur Airport', city: 'Jaipur' },
      departure: new Date(now.getTime() + 6 * 3600 * 1000).toISOString(),
      arrival: new Date(now.getTime() + 7 * 3600 * 1000).toISOString(),
      status: 'CONFIRMED',
      bookingReference: 'AI-DEL-JAI',
    };
    const segRes2 = await request('POST', `/api/trips/${createdTripId}/segments`, seg2);
    assert.strictEqual(segRes2.status, 201);

    // Fetch trip to verify state
    const fetchRes = await request('GET', `/api/trips/${createdTripId}`);
    assert.strictEqual(fetchRes.status, 200);
    assert.strictEqual(fetchRes.body.data.itinerary.length, 2);
    assert.strictEqual(fetchRes.body.data.status, 'ACTIVE');
  });

  it('Step 2: Disruption reported -> transitions trip to DISRUPTED and activates RecoverySession', async () => {
    const disruptionPayload = {
      type: 'FLIGHT_CANCELLED',
      affectedSegmentId: 'SEG-001',
      description: 'Flight 6E-501 cancelled by carrier due to airspace restrictions',
      expectedImpact: 'Missed onward connection AI-402 at DEL',
      source: 'USER',
      detectedAt: new Date().toISOString(),
    };

    const res = await request('POST', `/api/trips/${createdTripId}/disruption`, disruptionPayload);
    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.data.trip.status, 'DISRUPTED');
    assert.ok(res.body.data.recoverySession);
    assert.strictEqual(res.body.data.recoverySession.status, 'READY');

    activeSessionId = res.body.data.recoverySession._id;
  });

  it('Step 3: Traveler requests "Find My Best Recovery" -> runs autonomous recovery loop and scores candidates', async () => {
    const res = await request('POST', `/api/trips/${createdTripId}/recovery/start`, { maxIterations: 10 });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    assert.ok(res.body.data.candidatePlans);
    assert.ok(res.body.data.candidatePlans.length > 0);

    const plan = res.body.data.selectedPlan || res.body.data.candidatePlans[0];
    assert.ok(plan, 'Must identify a viable recovery plan');
    assert.ok(plan.segments.length > 0, 'Plan must contain itinerary segments');
    recommendedPlanId = plan.planId || plan._id;
  });

  it('Step 4: Decision log, candidate plans, and rejected plans are accessible via session endpoints', async () => {
    const res = await request('GET', `/api/recovery-sessions/${activeSessionId}`);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);

    const session = res.body.data;
    assert.ok(session.candidatePlans.length > 0);
    assert.ok(Array.isArray(session.agentEvents));
    assert.ok(Array.isArray(session.rejectedPlans));
  });

  it('Step 5: External Handoff Rejection — Refuses handoff without prior traveler approval', async () => {
    const res = await request('POST', `/api/recovery/${activeSessionId}/handoff`, {
      planId: recommendedPlanId,
    });
    // Handoff must fail if plan is not yet approved
    assert.ok(res.status === 403 || res.status === 400 || res.body.success === false);
  });

  it('Step 6: Plan Approval — Traveler explicitly approves recommended plan', async () => {
    const res = await request('POST', `/api/recovery/${activeSessionId}/approve`, {
      planId: recommendedPlanId,
    });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    assert.ok(res.body.handoff);
    assert.strictEqual(res.body.handoff.status, 'APPROVED');
  });

  it('Step 7: External Handoff Execution — Validates approved plan and returns secure carrier handoff URL', async () => {
    const res = await request('POST', `/api/recovery/${activeSessionId}/handoff`, {
      planId: recommendedPlanId,
    });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    assert.ok(res.body.handoff);
    assert.strictEqual(res.body.handoff.status, 'OPENED');
    assert.ok(res.body.handoff.externalUrl);
    assert.ok(res.body.handoff.provider);
  });

  it('Step 8: What-If Simulation Isolation — Runs hypothetical delay without corrupting active trip state', async () => {
    const res = await request('POST', `/api/recovery/${activeSessionId}/simulate`, {
      type: 'FLIGHT_DELAYED',
      delayMinutes: 90,
    });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    assert.ok(res.body.data.simulationId);
    assert.ok(res.body.data.simulatedRisk);
    assert.ok(res.body.data.summary);

    // Verify original trip is untouched
    const tripCheck = await request('GET', `/api/trips/${createdTripId}`);
    assert.strictEqual(tripCheck.status, 200);
    assert.strictEqual(tripCheck.body.data.passengerName, 'UXE2ETraveler Krishna');
  });

  it('Step 9: Insurance Review & Evidence Checklist Generation', async () => {
    const policyText = `SECTION 4: TRIP DELAY
The insurer will reimburse reasonable accommodation and meals up to INR 15,000 for delays exceeding 2 hours caused by carrier disruption.`;

    const res = await request('POST', '/api/insurance/analyze', {
      tripId: createdTripId,
      policyText,
      policyName: 'UX Traveler Policy Guard',
    });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    assert.ok(res.body.data.analysisId);
    assert.ok(Array.isArray(res.body.data.relevantClauses));
    assert.ok(Array.isArray(res.body.data.evidenceChecklist));
    assert.ok(res.body.data.disclaimer);
  });

  it('Step 10: Statutory Passenger Rights Compensation Evaluation', async () => {
    const res = await request('POST', '/api/compensation/check', {
      tripId: createdTripId,
      overrideFacts: {
        delayMinutes: 180,
        disruptionType: 'FLIGHT_CANCELLED',
        carrier: 'IndiGo',
        flightNumber: '6E-501',
        origin: 'BLR',
        destination: 'JAI',
      },
    });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    assert.ok(res.body.data.framework);
    assert.ok(res.body.data.draftClaim?.editableBody);
    assert.ok(res.body.data.disclaimer);
  });

  it('Step 11: Error Handling Resilience — Non-existent trip or malformed payload returns 400/404', async () => {
    const fakeId = new mongoose.Types.ObjectId();
    const res = await request('GET', `/api/trips/${fakeId}`);
    assert.strictEqual(res.status, 404);
    assert.strictEqual(res.body.success, false);

    const badPost = await request('POST', '/api/trips', { invalid: 'payload' });
    assert.strictEqual(badPost.status, 400);
    assert.strictEqual(badPost.body.success, false);
  });

  it('Step 12: Provider Unavailable Handling — Unmapped provider returns explicit safe rejection', async () => {
    const externalHandoffService = require('../handoff/ExternalHandoffService');
    const now = new Date();
    const fakePlan = {
      planId: 'PLAN-UNMAPPED',
      status: 'VALID',
      destination: 'JAI',
      finalArrivalTime: new Date(now.getTime() + 4 * 3600 * 1000).toISOString(),
      totalCost: 3000,
      segments: [{
        carrier: 'UnknownFictionalAirlines99',
        transportMode: 'flight',
        identifier: 'UF-999',
        origin: 'BLR',
        destination: 'JAI',
        departure: new Date(now.getTime() + 2 * 3600 * 1000).toISOString(),
        arrival: new Date(now.getTime() + 4 * 3600 * 1000).toISOString(),
      }],
    };
    const session = await RecoverySession.findById(activeSessionId);
    const result = externalHandoffService.validatePlanForHandoff(fakePlan, session);
    assert.strictEqual(result.valid, false);
    assert.match(result.error, /Provider link unavailable|No booking was made/i);
  });

  it('Step 13: System Health Check — Verifies production status without internal Phase labels', async () => {
    const res = await request('GET', '/api/health');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.status, 'ok');
    assert.strictEqual(res.body.phase, undefined, 'Internal Phase label must NOT leak in health API');
    assert.strictEqual(res.body.version, '1.0.0');
  });

  after(async () => {
    monitoringService.stopAll();
    const oldTrips = await Trip.find({ passengerName: /UXE2ETraveler/ }, '_id');
    const oldTripIds = oldTrips.map((t) => t._id);
    await Trip.deleteMany({ _id: { $in: oldTripIds } });
    await RecoverySession.deleteMany({ tripId: { $in: oldTripIds } });
    await MonitoringState.deleteMany({ tripId: { $in: oldTripIds } });
    await Notification.deleteMany({ tripId: { $in: oldTripIds } });
    await ExternalHandoff.deleteMany({ tripId: { $in: oldTripIds } });
    await InsuranceAnalysis.deleteMany({ tripId: { $in: oldTripIds } });
    await CompensationCase.deleteMany({ tripId: { $in: oldTripIds } });
    if (server) {
      await new Promise((r) => server.close(r));
    }
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  });
});
