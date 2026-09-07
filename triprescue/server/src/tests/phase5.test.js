const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const http = require('http');
const mongoose = require('mongoose');
const app = require('../app');
const Trip = require('../models/Trip');
const RecoverySession = require('../models/RecoverySession');
const ExternalHandoff = require('../models/ExternalHandoff');

// Phase 5 modules
const { deeplinkValidator, externalHandoffService } = require('../handoff');

describe('Phase 5: External Deeplink / Handoff Subsystem', () => {
  let server;
  let baseUrl;
  let testTripId;
  let testSessionId;
  let validTestPlan;

  before(async () => {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/triprescue';
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(mongoUri);
    }

    server = http.createServer(app);
    await new Promise((resolve) => {
      server.listen(0, () => {
        const port = server.address().port;
        baseUrl = 'http://localhost:' + port;
        resolve();
      });
    });

    // Create a base trip and recovery session
    const trip = new Trip({
      passengerName: 'Ananya Roy',
      passengerCount: 1,
      origin: 'BLR',
      destination: 'JAI',
      departureTime: '2026-09-15T09:00:00+05:30',
      arrivalDeadline: '2026-09-15T18:00:00+05:30',
      maxAdditionalBudget: 6000,
      priority: 'arrival_time',
      riskTolerance: 'MEDIUM',
      status: 'DISRUPTED',
      itinerary: [
        {
          segmentId: 'SEG-P5-001',
          transportMode: 'flight',
          origin: { code: 'BLR', type: 'airport' },
          destination: { code: 'JAI', type: 'airport' },
          departure: '2026-09-15T09:00:00+05:30',
          arrival: '2026-09-15T11:45:00+05:30',
          status: 'CANCELLED',
        },
      ],
      disruption: {
        type: 'FLIGHT_CANCELLED',
        affectedSegmentId: 'SEG-P5-001',
        description: 'Flight cancelled due to technical maintenance',
      },
    });
    await trip.save();
    testTripId = trip._id.toString();

    validTestPlan = {
      planId: 'PLAN-DIR-TEST-001',
      strategy: 'DIRECT_FLIGHT',
      totalCost: 4500,
      currency: 'INR',
      departureTime: new Date(Date.now() + 3600000).toISOString(),
      finalArrivalTime: new Date(Date.now() + 10800000).toISOString(),
      totalDurationMinutes: 120,
      status: 'SELECTED',
      hardConstraintsPassed: true,
      connectionsFeasible: true,
      score: 90,
      riskScore: 30,
      segments: [
        {
          segmentId: 'SEG-PLAN-1',
          transportMode: 'flight',
          origin: { code: 'BLR', type: 'airport' },
          destination: { code: 'JAI', type: 'airport' },
          departure: new Date(Date.now() + 3600000).toISOString(),
          arrival: new Date(Date.now() + 10800000).toISOString(),
          carrier: 'Air India Express',
          identifier: 'IX 1922',
          price: { amount: 4500, currency: 'INR' },
          retrievedAt: new Date().toISOString(),
          dataConfidence: 'MOCK',
        },
      ],
      externalHandoffs: [
        {
          type: 'DEEPLINK',
          url: 'https://express.airindia.com/booking?flight=IX1922&ref=P5',
          provider: 'Air India Express',
          verifiedAt: new Date().toISOString(),
          status: 'AVAILABLE',
        },
      ],
    };

    const session = new RecoverySession({
      tripId: trip._id,
      objective: {
        origin: 'BLR',
        destination: 'JAI',
        departureTime: '2026-09-15T09:00:00+05:30',
        arrivalDeadline: '2026-09-15T18:00:00+05:30',
        maxAdditionalBudget: 6000,
        passengerCount: 1,
        priority: 'arrival_time',
        riskTolerance: 'MEDIUM',
      },
      currentItinerary: trip.itinerary,
      disruption: trip.disruption,
      status: 'AWAITING_APPROVAL',
      selectedPlan: validTestPlan,
      candidatePlans: [validTestPlan],
    });
    await session.save();
    testSessionId = session._id.toString();
  });

  after(async () => {
    if (testTripId) {
      await Trip.findByIdAndDelete(testTripId);
      await RecoverySession.deleteMany({ tripId: testTripId });
      await ExternalHandoff.deleteMany({ sessionId: testSessionId });
    }
    if (server) {
      server.close();
    }
    await mongoose.disconnect();
  });

  // 1. DeeplinkValidator Unit Tests
  it('1. DeeplinkValidator accepts valid HTTPS URL matching provider domain', () => {
    const res = deeplinkValidator.validate('https://www.airindiaexpress.com/booking?flight=IX101', 'Air India Express');
    assert.strictEqual(res.valid, true);
    assert.ok(res.normalizedUrl.startsWith('https://www.airindiaexpress.com'));
  });

  it('2. DeeplinkValidator accepts valid demo domain in demo mode', () => {
    const res = deeplinkValidator.validate('https://demo.example.com/booking?ref=PLAN-001', 'AnyProvider');
    assert.strictEqual(res.valid, true);
  });

  it('3. DeeplinkValidator rejects missing, null, or empty URLs', () => {
    assert.strictEqual(deeplinkValidator.validate(null, 'IndiGo').valid, false);
    assert.strictEqual(deeplinkValidator.validate('', 'IndiGo').valid, false);
    assert.strictEqual(deeplinkValidator.validate('   ', 'IndiGo').valid, false);
  });

  it('4. DeeplinkValidator rejects malformed URLs', () => {
    const res = deeplinkValidator.validate('not_a_valid_url_string', 'IndiGo');
    assert.strictEqual(res.valid, false);
    assert.match(res.error, /Malformed URL/);
  });

  it('5. DeeplinkValidator rejects dangerous protocols (javascript:, data:, file:)', () => {
    assert.strictEqual(deeplinkValidator.validate('javascript:alert(1)', 'IndiGo').valid, false);
    assert.strictEqual(deeplinkValidator.validate('data:text/html,<script>alert(1)</script>', 'IndiGo').valid, false);
    assert.strictEqual(deeplinkValidator.validate('file:///etc/passwd', 'IndiGo').valid, false);
  });

  it('6. DeeplinkValidator rejects wrong provider domain (Provider A URL pointing to Provider B domain)', () => {
    // IndiGo claiming to point to airindiaexpress.com
    const res = deeplinkValidator.validate('https://airindiaexpress.com/flight', 'IndiGo');
    assert.strictEqual(res.valid, false);
    assert.match(res.error, /does not belong to authorized domains/);
  });

  it('7. DeeplinkValidator rejects arbitrary unapproved external domains', () => {
    const res = deeplinkValidator.validate('https://malicious-phishing-site.com/redirect', 'IndiGo');
    assert.strictEqual(res.valid, false);
    assert.match(res.error, /does not belong to authorized domains/);
  });

  // 2. ExternalHandoffService & Plan Gating Tests
  it('8. ExternalHandoffService rejects plan with status INVALID or REJECTED', () => {
    const invalidPlan = {
      ...validTestPlan,
      status: 'INVALID',
    };
    const session = { status: 'RECOVERING' };
    const res = externalHandoffService.validatePlanForHandoff(invalidPlan, session);
    assert.strictEqual(res.valid, false);
    assert.match(res.error, /cannot hand off an invalid/);
  });

  it('9. ExternalHandoffService rejects plan with STALE data', () => {
    const stalePlan = {
      ...validTestPlan,
      status: 'SELECTED',
      segments: [
        {
          ...validTestPlan.segments[0],
          retrievedAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(), // 30 mins old > 5m threshold
        },
      ],
    };
    const session = { status: 'AWAITING_APPROVAL' };
    const res = externalHandoffService.validatePlanForHandoff(stalePlan, session);
    assert.strictEqual(res.valid, false);
    assert.match(res.error, /STALE/);
  });

  it('10. Handoff execution fails if user approval was not granted first', async () => {
    // Reset any previous handoff to AVAILABLE
    await ExternalHandoff.deleteMany({ sessionId: testSessionId });
    const handoff = new ExternalHandoff({
      sessionId: testSessionId,
      planId: validTestPlan.planId,
      provider: 'Air India Express',
      externalUrl: 'https://express.airindia.com/booking?flight=IX1922&ref=P5',
      status: 'AVAILABLE',
    });
    await handoff.save();

    await assert.rejects(
      async () => await externalHandoffService.executeHandoff(testSessionId, validTestPlan.planId),
      /requires explicit user approval/
    );
  });

  // 3. Complete Approval and Handoff Flow Integration Tests
  it('11. Full approval and handoff lifecycle: approve -> execute -> logged', async () => {
    // Step 1: Approve handoff
    const approveRes = await externalHandoffService.approveHandoff(testSessionId, validTestPlan.planId);
    assert.strictEqual(approveRes.success, true);
    assert.strictEqual(approveRes.handoff.status, 'APPROVED');

    // Step 2: Execute handoff
    const handoffRes = await externalHandoffService.executeHandoff(testSessionId, validTestPlan.planId);
    assert.strictEqual(handoffRes.success, true);
    assert.strictEqual(handoffRes.handoff.status, 'OPENED');
    assert.strictEqual(handoffRes.handoff.externalUrl, 'https://express.airindia.com/booking?flight=IX1922&ref=P5');
    assert.strictEqual(handoffRes.handoff.provider, 'Air India Express');

    // Step 3: Verify audit event logs in RecoverySession
    const session = await RecoverySession.findById(testSessionId);
    const approvedEvent = session.agentEvents.find((e) => e.type === 'HANDOFF_APPROVED');
    const handoffEvent = session.agentEvents.find((e) => e.type === 'EXTERNAL_HANDOFF');

    assert.ok(approvedEvent, 'Session must record HANDOFF_APPROVED event');
    assert.ok(handoffEvent, 'Session must record EXTERNAL_HANDOFF event');
    assert.strictEqual(handoffEvent.metadata?.provider, 'Air India Express');
    assert.strictEqual(handoffEvent.metadata?.planId, validTestPlan.planId);

    // Verify security: zero credentials or secrets logged
    assert.strictEqual(handoffEvent.metadata?.apiKey, undefined);
    assert.strictEqual(handoffEvent.metadata?.password, undefined);
  });

  // 4. HTTP API Endpoints Tests
  it('12. POST /api/recovery-sessions/:id/approve & POST /api/recovery-sessions/:id/handoff API flow', async () => {
    // Test through HTTP API
    const approveResponse = await fetch(baseUrl + '/api/recovery-sessions/' + testSessionId + '/approve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ planId: validTestPlan.planId }),
    });

    assert.strictEqual(approveResponse.status, 200);
    const approveData = await approveResponse.json();
    assert.strictEqual(approveData.success, true);
    assert.strictEqual(approveData.handoff.status, 'APPROVED');

    const handoffResponse = await fetch(baseUrl + '/api/recovery-sessions/' + testSessionId + '/handoff', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ planId: validTestPlan.planId }),
    });

    assert.strictEqual(handoffResponse.status, 200);
    const handoffData = await handoffResponse.json();
    assert.strictEqual(handoffData.success, true);
    assert.strictEqual(handoffData.handoff.status, 'OPENED');
    assert.ok(handoffData.handoff.externalUrl.startsWith('https://'));
  });

  it('13. POST /api/recovery/:id/approve alias endpoint works', async () => {
    const res = await fetch(baseUrl + '/api/recovery/' + testSessionId + '/approve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ planId: validTestPlan.planId }),
    });

    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);
  });
});
