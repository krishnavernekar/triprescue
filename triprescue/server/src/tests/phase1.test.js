const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const http = require('http');
const mongoose = require('mongoose');
const app = require('../app');
const Trip = require('../models/Trip');
const RecoverySession = require('../models/RecoverySession');

describe('Phase 1: Trip + Recovery Objective + State', () => {
  let server;
  let baseUrl;
  let createdTripId;
  let createdSessionId;

  before(async () => {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/triprescue';
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(mongoUri);
    }

    server = http.createServer(app);
    await new Promise((resolve) => {
      server.listen(0, () => {
        const port = server.address().port;
        baseUrl = `http://localhost:${port}`;
        resolve();
      });
    });
  });

  after(async () => {
    if (createdTripId) {
      await Trip.findByIdAndDelete(createdTripId);
      await RecoverySession.deleteMany({ tripId: createdTripId });
    }
    if (server) {
      server.close();
    }
    await mongoose.disconnect();
  });

  // 1. Create valid trip
  it('1. should create a valid trip with recovery objective', async () => {
    const tripPayload = {
      passengerName: 'Krishna',
      passengerCount: 1,
      origin: 'BLR',
      destination: 'JAI',
      departureTime: '2026-09-10T14:00:00+05:30',
      arrivalDeadline: '2026-09-10T22:00:00+05:30',
      maxAdditionalBudget: 5000,
      priority: 'arrival_time',
      riskTolerance: 'MEDIUM',
    };

    const res = await fetch(`${baseUrl}/api/trips`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(tripPayload),
    });

    const body = await res.json();

    assert.strictEqual(res.status, 201);
    assert.strictEqual(body.success, true);
    assert.strictEqual(body.data.passengerName, 'Krishna');
    assert.strictEqual(body.data.origin, 'BLR');
    assert.strictEqual(body.data.destination, 'JAI');
    assert.strictEqual(body.data.status, 'ACTIVE');

    // Check recovery objective structure
    const obj = body.data.recoveryObjective;
    assert.ok(obj, 'Recovery objective should be defined');
    assert.strictEqual(obj.origin, 'BLR');
    assert.strictEqual(obj.destination, 'JAI');
    assert.strictEqual(obj.maxAdditionalBudget, 5000);
    assert.strictEqual(obj.passengerCount, 1);
    assert.strictEqual(obj.priority, 'arrival_time');
    assert.strictEqual(obj.riskTolerance, 'MEDIUM');
    assert.strictEqual(obj.hardConstraints.destinationRequired, true);
    assert.strictEqual(obj.hardConstraints.budgetRequired, true);
    assert.ok(Array.isArray(obj.optimizationPriorities));
    assert.ok(obj.optimizationPriorities.includes('arrival_time'));

    createdTripId = body.data._id;
  });

  // 2. Reject missing destination
  it('2. should reject trip with missing destination', async () => {
    const invalidPayload = {
      passengerName: 'Krishna',
      passengerCount: 1,
      origin: 'BLR',
      departureTime: '2026-09-10T14:00:00+05:30',
    };

    const res = await fetch(`${baseUrl}/api/trips`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(invalidPayload),
    });

    const body = await res.json();
    assert.strictEqual(res.status, 400);
    assert.strictEqual(body.success, false);
    assert.strictEqual(body.error.code, 'VALIDATION_ERROR');
    assert.match(body.error.message, /Destination is required/i);
  });

  // 3. Reject invalid passenger count
  it('3. should reject trip with invalid passenger count (0)', async () => {
    const invalidPayload = {
      passengerName: 'Krishna',
      passengerCount: 0,
      origin: 'BLR',
      destination: 'JAI',
      departureTime: '2026-09-10T14:00:00+05:30',
    };

    const res = await fetch(`${baseUrl}/api/trips`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(invalidPayload),
    });

    const body = await res.json();
    assert.strictEqual(res.status, 400);
    assert.strictEqual(body.success, false);
    assert.strictEqual(body.error.code, 'VALIDATION_ERROR');
    assert.match(body.error.message, /Passenger count must be at least 1/i);
  });

  // 4. Reject negative budget
  it('4. should reject trip with negative budget', async () => {
    const invalidPayload = {
      passengerName: 'Krishna',
      passengerCount: 1,
      origin: 'BLR',
      destination: 'JAI',
      departureTime: '2026-09-10T14:00:00+05:30',
      maxAdditionalBudget: -500,
    };

    const res = await fetch(`${baseUrl}/api/trips`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(invalidPayload),
    });

    const body = await res.json();
    assert.strictEqual(res.status, 400);
    assert.strictEqual(body.success, false);
    assert.strictEqual(body.error.code, 'VALIDATION_ERROR');
    assert.match(body.error.message, /Budget cannot be negative/i);
  });

  // 5. Create itinerary segment
  it('5. should create itinerary segment for a trip', async () => {
    const segmentPayload = {
      transportMode: 'flight',
      origin: {
        code: 'BLR',
        type: 'airport',
        name: 'Kempegowda International',
      },
      destination: {
        code: 'DEL',
        type: 'airport',
        name: 'Indira Gandhi International',
      },
      departure: '2026-09-10T14:00:00+05:30',
      arrival: '2026-09-10T16:45:00+05:30',
      carrier: 'Example Airlines',
      identifier: 'EX123',
      status: 'CONFIRMED',
    };

    const res = await fetch(`${baseUrl}/api/trips/${createdTripId}/segments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(segmentPayload),
    });

    const body = await res.json();
    assert.strictEqual(res.status, 201);
    assert.strictEqual(body.success, true);
    assert.strictEqual(body.data.itinerary.length, 1);

    const seg = body.data.itinerary[0];
    assert.strictEqual(seg.transportMode, 'flight');
    assert.strictEqual(seg.origin.code, 'BLR');
    assert.strictEqual(seg.destination.code, 'DEL');
    assert.strictEqual(seg.carrier, 'Example Airlines');
    assert.strictEqual(seg.identifier, 'EX123');
    assert.strictEqual(seg.status, 'CONFIRMED');
    assert.ok(seg.segmentId);
  });

  // 6. Reject invalid transport mode
  it('6. should reject invalid transport mode', async () => {
    const invalidSegment = {
      transportMode: 'rocket',
      origin: 'BLR',
      destination: 'DEL',
      departure: '2026-09-10T14:00:00+05:30',
      arrival: '2026-09-10T16:45:00+05:30',
    };

    const res = await fetch(`${baseUrl}/api/trips/${createdTripId}/segments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(invalidSegment),
    });

    const body = await res.json();
    assert.strictEqual(res.status, 400);
    assert.strictEqual(body.success, false);
    assert.strictEqual(body.error.code, 'VALIDATION_ERROR');
    assert.match(body.error.message, /Transport mode 'rocket' is invalid/i);
  });

  // 7. Report flight cancellation
  it('7. should report flight cancellation disruption', async () => {
    const disruptionPayload = {
      type: 'FLIGHT_CANCELLED',
      affectedSegmentId: 'SEG-001',
      detectedAt: '2026-09-10T11:00:00+05:30',
      description: 'Flight cancelled by carrier due to weather',
      source: 'USER',
    };

    const res = await fetch(`${baseUrl}/api/trips/${createdTripId}/disruption`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(disruptionPayload),
    });

    const body = await res.json();
    assert.strictEqual(res.status, 201);
    assert.strictEqual(body.success, true);
    assert.ok(body.data.trip);
    assert.ok(body.data.recoverySession);

    createdSessionId = body.data.recoverySession._id;
  });

  // 8. Trip becomes DISRUPTED
  it('8. should verify trip status changed to DISRUPTED and original itinerary is preserved', async () => {
    const res = await fetch(`${baseUrl}/api/trips/${createdTripId}`);
    const body = await res.json();

    assert.strictEqual(res.status, 200);
    assert.strictEqual(body.data.status, 'DISRUPTED');
    assert.strictEqual(body.data.disruption.type, 'FLIGHT_CANCELLED');
    assert.strictEqual(body.data.itinerary.length, 1);
    assert.strictEqual(body.data.itinerary[0].carrier, 'Example Airlines');
  });

  // 9. RecoverySession is created
  it('9. should verify RecoverySession is created with objective and itinerary snapshots', async () => {
    assert.ok(createdSessionId, 'Recovery session ID should exist');

    const session = await RecoverySession.findById(createdSessionId);
    assert.ok(session);
    assert.strictEqual(session.tripId.toString(), createdTripId.toString());
    assert.strictEqual(session.objective.origin, 'BLR');
    assert.strictEqual(session.objective.destination, 'JAI');
    assert.strictEqual(session.currentItinerary.length, 1);
    assert.strictEqual(session.disruption.type, 'FLIGHT_CANCELLED');
  });

  // 10. RecoverySession starts in READY
  it('10. should verify RecoverySession starts in READY status', async () => {
    const session = await RecoverySession.findById(createdSessionId);
    assert.strictEqual(session.status, 'READY');
    assert.strictEqual(session.currentStatus, 'READY');
  });

  // 11. Retrieve recovery session through API
  it('11. should retrieve recovery session through API', async () => {
    const res = await fetch(`${baseUrl}/api/recovery-sessions/${createdSessionId}`);
    const body = await res.json();

    assert.strictEqual(res.status, 200);
    assert.strictEqual(body.success, true);
    assert.strictEqual(body.data._id, createdSessionId);
    assert.strictEqual(body.data.status, 'READY');
    assert.strictEqual(body.data.objective.origin, 'BLR');
    assert.strictEqual(body.data.objective.destination, 'JAI');
    assert.strictEqual(body.data.disruption.type, 'FLIGHT_CANCELLED');
  });
});
