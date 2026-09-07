const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const http = require('http');
const mongoose = require('mongoose');
const app = require('../app');
const config = require('../config/environment');

// Phase 6 modules
const FlightProvider = require('../providers/flight/FlightProvider');
const MockFlightProvider = require('../providers/flight/MockFlightProvider');
const AviationstackFlightProvider = require('../providers/flight/AviationstackFlightProvider');
const { getProvider, getProviderPair, providerRegistry } = require('../providers');
const flightNormalizer = require('../providers/normalizers/FlightNormalizer');
const fallbackManager = require('../providers/FallbackManager');
const recoveryPlanner = require('../agent/RecoveryPlanner');
const Trip = require('../models/Trip');
const RecoverySession = require('../models/RecoverySession');

describe('Phase 6: Real Flight Discovery Provider & Pluggability', () => {
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
        baseUrl = 'http://localhost:' + port;
        resolve();
      });
    });

    const trip = new Trip({
      passengerName: 'Neha Patel',
      passengerCount: 1,
      origin: 'BLR',
      destination: 'JAI',
      departureTime: '2026-09-20T10:00:00+05:30',
      arrivalDeadline: '2026-09-20T20:00:00+05:30',
      maxAdditionalBudget: 6000,
      priority: 'arrival_time',
      riskTolerance: 'MEDIUM',
      status: 'DISRUPTED',
      itinerary: [
        {
          segmentId: 'SEG-P6-001',
          transportMode: 'flight',
          origin: { code: 'BLR', type: 'airport' },
          destination: { code: 'JAI', type: 'airport' },
          departure: '2026-09-20T10:00:00+05:30',
          arrival: '2026-09-20T12:30:00+05:30',
          carrier: 'Vistara',
          identifier: 'UK 812',
          status: 'CANCELLED',
        },
      ],
      disruption: {
        type: 'FLIGHT_CANCELLED',
        affectedSegmentId: 'SEG-P6-001',
        description: 'Flight UK-812 cancelled',
      },
    });
    await trip.save();
    testTripId = trip._id.toString();

    const session = new RecoverySession({
      tripId: trip._id,
      objective: {
        origin: 'BLR',
        destination: 'JAI',
        departureTime: '2026-09-20T10:00:00+05:30',
        arrivalDeadline: '2026-09-20T20:00:00+05:30',
        maxAdditionalBudget: 6000,
        passengerCount: 1,
        priority: 'arrival_time',
        riskTolerance: 'MEDIUM',
      },
      currentItinerary: trip.itinerary,
      disruption: trip.disruption,
      status: 'READY',
    });
    await session.save();
    testSessionId = session._id.toString();
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

  // 1. Generic FlightDiscoveryProvider Interface Verification
  it('1. FlightProvider base class defines search, getDetails, revalidate, and getExternalLink methods', () => {
    const base = new FlightProvider('TestBaseFlightProvider');
    assert.strictEqual(base.name, 'TestBaseFlightProvider');
    assert.strictEqual(base.type, 'flight');
    assert.strictEqual(typeof base.search, 'function');
    assert.strictEqual(typeof base.getDetails, 'function');
    assert.strictEqual(typeof base.revalidate, 'function');
    assert.strictEqual(typeof base.getExternalLink, 'function');
  });

  // 2. MockFlightProvider Conformance
  it('2. MockFlightProvider implements full FlightDiscoveryProvider contract deterministically', async () => {
    const mock = new MockFlightProvider();
    assert.strictEqual(mock.type, 'flight');

    // search
    const searchRes = await mock.search({ origin: 'BLR', destination: 'JAI', strategy: 'DIRECT_FLIGHT' });
    assert.ok(Array.isArray(searchRes.results));
    assert.strictEqual(searchRes.results.length > 0, true);

    // getDetails
    const detailsRes = await mock.getDetails('OPT-FL-DIR-001');
    assert.strictEqual(detailsRes.provider, 'MockFlightProvider');
    assert.strictEqual(detailsRes.result.status, 'AVAILABLE');

    // revalidate
    const revalRes = await mock.revalidate('OPT-FL-DIR-001');
    assert.strictEqual(revalRes.valid, true);

    // getExternalLink — never invents URL
    const linkRes = await mock.getExternalLink('OPT-FL-DIR-001');
    assert.strictEqual(linkRes.url, null);
    assert.strictEqual(linkRes.status, 'DEEPLINK_UNAVAILABLE');
  });

  // 3. AviationstackFlightProvider Contract Conformance
  it('3. AviationstackFlightProvider implements full FlightDiscoveryProvider contract safely', async () => {
    const avs = new AviationstackFlightProvider();
    assert.strictEqual(avs.type, 'flight');
    assert.strictEqual(avs.name, 'AviationstackFlightProvider');
    assert.strictEqual(typeof avs.search, 'function');
    assert.strictEqual(typeof avs.getDetails, 'function');
    assert.strictEqual(typeof avs.revalidate, 'function');
    assert.strictEqual(typeof avs.getExternalLink, 'function');

    // getExternalLink never fabricates URLs
    const linkRes = await avs.getExternalLink('AI2985');
    assert.strictEqual(linkRes.url, null);
    assert.strictEqual(linkRes.status, 'DEEPLINK_UNAVAILABLE');
    assert.match(linkRes.message, /No fabricated URL/);
  });

  // 4. Provider Pluggability & Selection via Configuration
  it('4. getProvider selects MockFlightProvider or AviationstackFlightProvider based on configuration', () => {
    const mockProv = getProvider('flight', 'mock');
    assert.ok(mockProv instanceof MockFlightProvider);

    const avsProv = getProvider('flight', 'aviationstack');
    assert.ok(avsProv instanceof AviationstackFlightProvider);

    // Registry contains both
    assert.ok(providerRegistry.flight.mock === MockFlightProvider);
    assert.ok(providerRegistry.flight.aviationstack === AviationstackFlightProvider);
  });

  // 5. Normalization of Aviationstack Responses
  it('5. FlightNormalizer maps raw airline payload to normalized segment schema without fabricated fields', () => {
    const rawAviationstack = {
      flight_date: '2026-09-20',
      flight_status: 'scheduled',
      departure: {
        airport: 'Kempegowda International',
        iata: 'BLR',
        scheduled: '2026-09-20T10:00:00+00:00',
      },
      arrival: {
        airport: 'Indira Gandhi International',
        iata: 'DEL',
        scheduled: '2026-09-20T12:45:00+00:00',
      },
      airline: { name: 'IndiGo' },
      flight: { iata: '6E204' },
    };

    const normalized = flightNormalizer.normalizeAviationstackFlight(rawAviationstack);
    assert.ok(normalized);
    assert.strictEqual(normalized.origin.code, 'BLR');
    assert.strictEqual(normalized.destination.code, 'DEL');
    assert.strictEqual(normalized.carrier, 'IndiGo');
    assert.strictEqual(normalized.identifier, '6E204');
    assert.strictEqual(normalized.durationMinutes, 165);
    assert.strictEqual(normalized.status, 'SCHEDULED');
    assert.strictEqual(normalized.dataConfidence, 'LIVE');
    // Ensure no fake deeplink URL
    assert.strictEqual(normalized.externalHandoff.url, null);
    assert.strictEqual(normalized.externalHandoff.status, 'DEEPLINK_UNAVAILABLE');
  });

  // 6. Safe Handling of Missing / Malformed API Responses
  it('6. Aviationstack handles missing credentials and network timeouts with fallback needed', async () => {
    const origKey = config.aviationstackApiKey;
    config.aviationstackApiKey = '';
    const avsNoKey = new AviationstackFlightProvider();

    try {
      const searchRes = await avsNoKey.search({ origin: 'BLR', destination: 'DEL' });
      assert.strictEqual(searchRes.status, 'UNAVAILABLE');
      assert.strictEqual(searchRes.fallbackNeeded, true);
      assert.strictEqual(searchRes.results.length, 0);

      const statusRes = await avsNoKey.getFlightStatus('6E204');
      assert.strictEqual(statusRes.fallbackNeeded, true);
      assert.strictEqual(statusRes.result, null);
    } finally {
      config.aviationstackApiKey = origKey;
    }
  });

  // 7. Revalidation Engine
  it('7. Revalidation correctly flags active vs cancelled flights', async () => {
    const avs = new AviationstackFlightProvider();
    const origGetStatus = avs.getFlightStatus;

    // Simulate active flight
    avs.getFlightStatus = async () => ({
      provider: avs.name,
      result: { identifier: 'AI101', status: 'SCHEDULED' },
    });

    const activeReval = await avs.revalidate('AI101');
    assert.strictEqual(activeReval.valid, true);
    assert.strictEqual(activeReval.status, 'SCHEDULED');

    // Simulate cancelled flight
    avs.getFlightStatus = async () => ({
      provider: avs.name,
      result: { identifier: 'AI102', status: 'CANCELLED' },
    });

    const cancelledReval = await avs.revalidate('AI102');
    assert.strictEqual(cancelledReval.valid, false);
    assert.strictEqual(cancelledReval.status, 'CANCELLED');
    assert.match(cancelledReval.message, /cancelled/i);

    avs.getFlightStatus = origGetStatus;
  });

  // 8. RecoveryPlanner Integration with Provider Revalidation
  it('8. RecoveryPlanner executes deterministic recovery loop and validates candidate plan through provider revalidation', async () => {
    const session = await RecoverySession.findById(testSessionId);
    session.status = 'READY';
    session.agentEvents = [];
    session.candidatePlans = [];

    const updatedSession = await recoveryPlanner.runRecovery(session, 5);

    assert.ok(updatedSession.status === 'AWAITING_APPROVAL' || updatedSession.status === 'PLAN_READY');
    assert.ok(updatedSession.selectedPlan, 'Must select verified recovery plan');
    assert.strictEqual(updatedSession.selectedPlan.hardConstraintsPassed, true);
    assert.strictEqual(updatedSession.selectedPlan.connectionsFeasible, true);

    // Verify PLAN_VERIFIED was recorded in timeline
    const verifiedEvent = updatedSession.agentEvents.find((e) => e.type === 'PLAN_VERIFIED');
    assert.ok(verifiedEvent, 'Session must record PLAN_VERIFIED event');
  });

  // 9. Live API Call Check (Conditional if Aviationstack key exists and is reachable)
  it('9. Live Aviationstack API search test against real endpoints', async () => {
    if (!config.aviationstackApiKey) {
      console.log('Skipping live Aviationstack test: AVIATIONSTACK_API_KEY is not configured');
      return;
    }

    const avs = new AviationstackFlightProvider();
    const res = await avs.search({ origin: 'DEL', destination: 'BOM' });

    assert.strictEqual(res.provider, 'AviationstackFlightProvider');
    if (res.status === 'FAILED' && res.error) {
      console.log('Live Aviationstack query failed gracefully (expected if sandbox rate limited):', res.error);
      assert.strictEqual(res.fallbackNeeded, true);
    } else {
      assert.ok(Array.isArray(res.results));
      assert.strictEqual(res.confidence, 'LIVE');
      if (res.results.length > 0) {
        assert.ok(res.results[0].carrier);
        assert.ok(res.results[0].identifier);
        assert.strictEqual(res.results[0].externalHandoff.url, null); // No fabricated link
      }
    }
  });
});
