const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const http = require('http');
const mongoose = require('mongoose');
const app = require('../app');
const Trip = require('../models/Trip');
const RecoverySession = require('../models/RecoverySession');

// Phase 3 modules
const flightNormalizer = require('../providers/normalizers/FlightNormalizer');
const routeNormalizer = require('../providers/normalizers/RouteNormalizer');
const fallbackManager = require('../providers/FallbackManager');
const { getProviderPair } = require('../providers');
const GoogleRoutesProvider = require('../providers/route/GoogleRoutesProvider');
const connectionValidator = require('../evaluation/ConnectionValidator');
const dataFreshnessValidator = require('../evaluation/DataFreshnessValidator');
const riskEngine = require('../evaluation/RiskEngine');
const cascadeImpactEngine = require('../evaluation/CascadeImpactEngine');
const recoveryPlanner = require('../agent/RecoveryPlanner');

describe('Phase 3: Real Travel Data + Physical Transfer Verification + Provider Fallback', () => {
  let server;
  let baseUrl;
  let testTripId;
  let testSessionId;

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

    // Create primary demo trip for Phase 3
    const trip = new Trip({
      passengerName: 'Krishna',
      passengerCount: 1,
      origin: 'BLR',
      destination: 'JAI',
      departureTime: '2026-09-10T14:00:00+05:30',
      arrivalDeadline: '2026-09-10T22:00:00+05:30',
      maxAdditionalBudget: 5000,
      priority: 'arrival_time',
      riskTolerance: 'MEDIUM',
      status: 'DISRUPTED',
      itinerary: [
        {
          segmentId: 'SEG-P3-001',
          transportMode: 'flight',
          origin: { code: 'BLR', type: 'airport' },
          destination: { code: 'DEL', type: 'airport' },
          departure: '2026-09-10T14:00:00+05:30',
          arrival: '2026-09-10T16:45:00+05:30',
          carrier: 'IndiGo',
          identifier: '6E 2341',
          status: 'CANCELLED',
        },
      ],
      disruption: {
        type: 'FLIGHT_CANCELLED',
        affectedSegmentId: 'SEG-P3-001',
        description: 'Flight cancelled by carrier',
        detectedAt: new Date(),
        status: 'ACTIVE',
      },
    });

    const savedTrip = await trip.save();
    testTripId = savedTrip._id.toString();

    const session = new RecoverySession({
      tripId: savedTrip._id,
      objective: savedTrip.recoveryObjective,
      objectiveSnapshot: savedTrip.recoveryObjective,
      currentItinerary: savedTrip.itinerary,
      itinerarySnapshot: savedTrip.itinerary,
      disruption: savedTrip.disruption,
      disruptionSnapshot: savedTrip.disruption,
      status: 'READY',
      currentStatus: 'READY',
    });

    const savedSession = await session.save();
    testSessionId = savedSession._id.toString();
    savedTrip.currentRecoverySessionId = savedSession._id;
    await savedTrip.save();
  });

  after(async () => {
    if (testTripId) {
      await Trip.findByIdAndDelete(testTripId);
      await RecoverySession.deleteMany({ tripId: testTripId });
    }
    if (server) {
      server.close();
    }
    fallbackManager.clearCache();
    await mongoose.disconnect();
  });

  // 1. Flight Normalization: Valid Aviationstack Payload
  it('1. should normalize valid external aviation payload correctly', () => {
    const rawPayload = {
      flight_date: '2026-09-10',
      flight_status: 'scheduled',
      departure: {
        airport: 'Kempegowda International Airport',
        iata: 'BLR',
        scheduled: '2026-09-10T14:00:00+00:00',
        estimated: '2026-09-10T14:00:00+00:00',
      },
      arrival: {
        airport: 'Indira Gandhi International Airport',
        iata: 'DEL',
        scheduled: '2026-09-10T16:45:00+00:00',
        estimated: '2026-09-10T16:45:00+00:00',
      },
      airline: { name: 'IndiGo' },
      flight: { iata: '6E 2341', number: '2341' },
    };

    const normalized = flightNormalizer.normalizeAviationstackFlight(rawPayload);

    assert.ok(normalized);
    assert.strictEqual(normalized.provider, 'Aviationstack');
    assert.strictEqual(normalized.carrier, 'IndiGo');
    assert.strictEqual(normalized.identifier, '6E 2341');
    assert.strictEqual(normalized.origin.code, 'BLR');
    assert.strictEqual(normalized.destination.code, 'DEL');
    assert.strictEqual(normalized.status, 'SCHEDULED');
    assert.strictEqual(normalized.durationMinutes, 165);
    assert.strictEqual(normalized.dataConfidence, 'LIVE');
    assert.strictEqual(normalized.externalHandoff.url, null); // Never fake URLs
  });

  // 2. Flight Normalization: Missing optional fields handling (no fabricated data)
  it('2. should handle missing optional fields without fabricating data', () => {
    const sparsePayload = {
      flight_status: 'delayed',
      departure: { iata: 'BLR' },
      arrival: { iata: 'JAI' },
      flight: { number: '101' },
    };

    const normalized = flightNormalizer.normalizeAviationstackFlight(sparsePayload);
    assert.ok(normalized);
    assert.strictEqual(normalized.status, 'DELAYED');
    assert.strictEqual(normalized.durationMinutes, null); // Not fabricated!
    assert.strictEqual(normalized.departure, null);
    assert.strictEqual(normalized.availableSeats, null);
  });

  // 3. Flight Normalization: Invalid payload returns null safely
  it('3. should return null gracefully for invalid payload', () => {
    assert.strictEqual(flightNormalizer.normalizeAviationstackFlight(null), null);
    assert.strictEqual(flightNormalizer.normalizeAviationstackFlight('invalid string'), null);
  });

  // 4. Google Routes Normalization & Fallback Estimates
  it('4. should normalize Google Routes payload and generate tagged fallback estimates', () => {
    // Case A: Google Routes v2 response
    const rawRoutesResponse = {
      routes: [
        {
          duration: '3300s', // 55 minutes
          distanceMeters: 28500, // 28.5 km
        },
      ],
    };

    const routeResult = routeNormalizer.normalizeGoogleRoute(rawRoutesResponse, 'DEL', 'NDLS', 'DRIVE');
    assert.ok(routeResult);
    assert.strictEqual(routeResult.durationMinutes, 55);
    assert.strictEqual(routeResult.distanceKm, 28.5);
    assert.strictEqual(routeResult.confidence, 'LIVE');
    assert.strictEqual(routeResult.source, 'GOOGLE_ROUTES');

    // Case B: Fallback estimate
    const fallback = routeNormalizer.createFallbackEstimate('DEL', 'NDLS', 45, 'Baseline estimate');
    assert.strictEqual(fallback.durationMinutes, 45);
    assert.strictEqual(fallback.confidence, 'ESTIMATED');
    assert.strictEqual(fallback.source, 'FALLBACK_ESTIMATE');
  });

  // 5. Provider Fallback Pipeline: Primary -> Fallback -> Cache
  it('5. should execute provider fallback pipeline and cache results', async () => {
    const mockPrimaryFailing = {
      name: 'FailingPrimaryProvider',
      search: async () => {
        throw new Error('Network timeout (simulated API failure)');
      },
    };

    const mockFallback = {
      name: 'ResilientFallbackProvider',
      search: async (params) => {
        return {
          provider: 'ResilientFallbackProvider',
          results: [{ optionId: 'OPT-FB-1', carrier: 'Fallback Air' }],
          confidence: 'MOCK',
        };
      },
    };

    const eventsEmitted = [];
    const options = {
      sessionId: 'test-session-1',
      emitEventFn: (type, msg) => eventsEmitted.push({ type, msg }),
    };

    // First call: primary fails -> fallback triggered
    const result1 = await fallbackManager.execute(
      'flight',
      'search',
      mockPrimaryFailing,
      mockFallback,
      { origin: 'BLR', destination: 'DEL' },
      options
    );

    assert.ok(result1);
    assert.strictEqual(result1.fallbackUsed, true);
    assert.strictEqual(result1.confidence, 'MOCK');
    assert.ok(eventsEmitted.some((e) => e.type === 'TOOL_FAILED'));
    assert.ok(eventsEmitted.some((e) => e.type === 'FALLBACK_TRIGGERED'));

    // Second call with same params should be served from in-memory cache
    const result2 = await fallbackManager.execute(
      'flight',
      'search',
      mockPrimaryFailing,
      mockFallback,
      { origin: 'BLR', destination: 'DEL' },
      options
    );

    assert.strictEqual(result2.fromCache, true);
    assert.strictEqual(result2.confidence, 'CACHED');
  });

  // 6. GoogleRoutesProvider: Physical transit calculation & fallback
  it('6. should calculate physical transfer duration using GoogleRoutesProvider', async () => {
    const routesProvider = new GoogleRoutesProvider();
    const route = await routesProvider.calculateRoute('DEL', 'NDLS', 'DRIVE');

    assert.ok(route);
    assert.ok(typeof route.durationMinutes === 'number');
    assert.ok(['LIVE', 'ESTIMATED'].includes(route.confidence));
    assert.ok(route.durationMinutes >= 15 && route.durationMinutes <= 180);
  });

  // 7. Connection Validation with Physical Transfer Durations & Safety Buffer
  it('7. should validate connections using physical transfer duration and 30-min buffer', () => {
    const flightArrival = {
      segmentId: 'S-FLIGHT',
      transportMode: 'flight',
      destination: { code: 'DEL' },
      arrival: '2026-09-10T18:10:00.000Z',
    };

    const trainDeparture = {
      segmentId: 'S-TRAIN',
      transportMode: 'train',
      origin: { code: 'NDLS' },
      departure: '2026-09-10T19:30:00.000Z', // 80 min available
    };

    // Case 1: Google Routes returns 55 min transfer -> required = 55 + 30 buffer = 85 min > 80 min avail -> INVALID
    const googleRouteResult = { durationMinutes: 55, confidence: 'LIVE', source: 'GOOGLE_ROUTES' };
    const check1 = connectionValidator.validateConnection(flightArrival, trainDeparture, googleRouteResult);

    assert.strictEqual(check1.status, 'INVALID');
    assert.strictEqual(check1.availableMinutes, 80);
    assert.strictEqual(check1.requiredMinutes, 85); // 55 + 30
    assert.strictEqual(check1.transferDurationMinutes, 55);
    assert.strictEqual(check1.routeConfidence, 'LIVE');
    assert.strictEqual(check1.failureType, 'INSUFFICIENT_TRANSFER_TIME');

    // Case 2: Faster transfer (45 min) -> required = 45 + 30 buffer = 75 min <= 80 min avail -> VALID
    const fastRouteResult = { durationMinutes: 45, confidence: 'LIVE', source: 'GOOGLE_ROUTES' };
    const check2 = connectionValidator.validateConnection(flightArrival, trainDeparture, fastRouteResult);

    assert.strictEqual(check2.status, 'VALID');
    assert.strictEqual(check2.availableMinutes, 80);
    assert.strictEqual(check2.requiredMinutes, 75);
    assert.strictEqual(check2.failureType, null);

    // Case 3: Exact boundary (available 85 min == required 85 min) -> VALID
    const boundaryDeparture = {
      segmentId: 'S-TRAIN-BOUND',
      transportMode: 'train',
      origin: { code: 'NDLS' },
      departure: '2026-09-10T19:35:00.000Z', // 85 min available
    };
    const check3 = connectionValidator.validateConnection(flightArrival, boundaryDeparture, googleRouteResult);
    assert.strictEqual(check3.status, 'VALID');
    assert.strictEqual(check3.availableMinutes, 85);
    assert.strictEqual(check3.requiredMinutes, 85);
  });

  // 8. Data Freshness Tracker
  it('8. should evaluate external data freshness against configurable thresholds', () => {
    const now = new Date();

    // 2 minutes old -> FRESH (threshold is 5 min)
    const freshFlight = {
      retrievedAt: new Date(now.getTime() - 2 * 60000).toISOString(),
    };
    const freshCheck = dataFreshnessValidator.evaluateFreshness(freshFlight, 'flight');
    assert.strictEqual(freshCheck.status, 'FRESH');
    assert.strictEqual(freshCheck.ageMinutes, 2);

    // 25 minutes old -> STALE (threshold is 5 min for flight)
    const staleFlight = {
      retrievedAt: new Date(now.getTime() - 25 * 60000).toISOString(),
    };
    const staleCheck = dataFreshnessValidator.evaluateFreshness(staleFlight, 'flight');
    assert.strictEqual(staleCheck.status, 'STALE');
    assert.strictEqual(staleCheck.ageMinutes, 25);

    // Missing timestamp -> MISSING_TIMESTAMP
    const missingCheck = dataFreshnessValidator.evaluateFreshness({}, 'flight');
    assert.strictEqual(missingCheck.status, 'MISSING_TIMESTAMP');
  });

  // 9. TripShield Risk Engine incorporates route confidence & data freshness
  it('9. should reflect route confidence and freshness in TripShield Risk Engine', () => {
    const objective = { arrivalDeadline: '2026-09-10T22:00:00.000Z', maxAdditionalBudget: 5000 };
    const disruption = { type: 'FLIGHT_CANCELLED' };

    // Plan with ESTIMATED route transfer
    const estimatedPlan = {
      finalArrivalTime: '2026-09-10T21:30:00.000Z',
      totalCost: 4800,
      transferCount: 1,
      connectionResults: [
        {
          availableMinutes: 120,
          requiredMinutes: 75,
          routeConfidence: 'ESTIMATED',
        },
      ],
      segments: [
        {
          transportMode: 'flight',
          retrievedAt: new Date().toISOString(), // fresh
        },
      ],
    };

    const risk = riskEngine.assess(estimatedPlan, objective, disruption, [{ status: 'VALID' }]);

    assert.ok(risk.score >= 0 && risk.score <= 100);
    assert.strictEqual(risk.factors.routeConfidence, 'ESTIMATED');
    assert.strictEqual(risk.factors.providerDataFreshness, 'FRESH');
    assert.ok(risk.reasons.some((r) => r.includes('estimated')));
  });

  // 10. End-to-End Primary Demo via API with Phase 3 Fallback & Route Verification
  it('10. should run full Phase 3 autonomous recovery workflow through API', async () => {
    const res = await fetch(`${baseUrl}/api/trips/${testTripId}/recovery/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ maxIterations: 10 }),
    });

    const body = await res.json();
    assert.strictEqual(res.status, 200);
    assert.strictEqual(body.success, true);

    const session = body.data;
    assert.strictEqual(session.status, 'AWAITING_APPROVAL');
    assert.ok(session.selectedPlan);
    assert.strictEqual(session.selectedPlan.strategy, 'FLIGHT_PLUS_TRAIN');
    assert.strictEqual(session.selectedPlan.hardConstraintsPassed, true);
    assert.strictEqual(session.selectedPlan.connectionsFeasible, true);

    // Verify external handoff model structure
    assert.ok(session.selectedPlan.externalHandoffs);
    assert.strictEqual(session.selectedPlan.externalHandoffs[0].url, null); // No fabricated URLs
  });

  // 11. Secondary Demo — Cascading Delay with Downstream Connection Recalculation
  it('11. should demonstrate cascade impact recalculation when flight is delayed +90 minutes', () => {
    const itinerary = [
      {
        segmentId: 'SEG-FLIGHT-101',
        transportMode: 'flight',
        carrier: 'IndiGo',
        identifier: '6E 101',
        departure: '2026-09-10T14:00:00.000Z',
        arrival: '2026-09-10T16:45:00.000Z',
      },
      {
        segmentId: 'SEG-TRAIN-202',
        transportMode: 'train',
        carrier: 'Indian Railways',
        identifier: '12015',
        departure: '2026-09-10T17:45:00.000Z', // Originally 60 min transfer window
        arrival: '2026-09-10T21:30:00.000Z',
      },
    ];

    const disruption = {
      type: 'FLIGHT_DELAYED',
      affectedSegmentId: 'SEG-FLIGHT-101',
    };

    // A 90-minute delay pushes arrival from 16:45 to 18:15. Train departs at 17:45 -> Broken connection!
    const impact = cascadeImpactEngine.analyzeImpact(itinerary, disruption, 90, {
      arrivalDeadline: '2026-09-10T22:00:00.000Z',
    });

    assert.strictEqual(impact.hasImpact, true);
    assert.strictEqual(impact.brokenConnections.length, 1);
    assert.strictEqual(impact.brokenConnections[0].fromSegmentId, 'SEG-FLIGHT-101');
    assert.ok(impact.affectedSegments.some((s) => s.segmentId === 'SEG-TRAIN-202'));
  });
});
