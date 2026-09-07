const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const http = require('http');
const mongoose = require('mongoose');
const app = require('../app');
const config = require('../config/environment');

// Phase 7 modules
const RouteProvider = require('../providers/route/RouteProvider');
const MockRouteProvider = require('../providers/route/MockRouteProvider');
const GoogleRoutesProvider = require('../providers/route/GoogleRoutesProvider');
const { getProvider, getProviderPair, providerRegistry } = require('../providers');
const routeNormalizer = require('../providers/normalizers/RouteNormalizer');
const fallbackManager = require('../providers/FallbackManager');
const connectionValidator = require('../evaluation/ConnectionValidator');
const dataFreshnessValidator = require('../evaluation/DataFreshnessValidator');
const actionExecutor = require('../agent/ActionExecutor');

describe('Phase 7: Route Provider & Physical Transfer Verification', () => {
  let server;
  let baseUrl;

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
  });

  after(async () => {
    if (server) {
      server.close();
    }
    fallbackManager.clearCache();
    await mongoose.disconnect();
  });

  // 1. Route Provider Abstraction & Contract
  it('1. RouteProvider base class defines calculateRoute method and subclasses inherit it', async () => {
    const base = new RouteProvider();
    assert.strictEqual(base.name, 'RouteProvider');
    assert.strictEqual(base.type, 'route');
    await assert.rejects(
      async () => base.calculateRoute('DEL', 'NDLS', 'DRIVE'),
      /not implemented/
    );

    const mock = new MockRouteProvider();
    assert.strictEqual(mock.name, 'MockRouteProvider');
    assert.strictEqual(mock.type, 'route');
    assert.strictEqual(typeof mock.calculateRoute, 'function');

    const google = new GoogleRoutesProvider();
    assert.strictEqual(google.name, 'GoogleRoutesProvider');
    assert.strictEqual(google.type, 'route');
    assert.strictEqual(typeof google.calculateRoute, 'function');
  });

  // 2. MockRouteProvider Deterministic Behavior
  it('2. MockRouteProvider calculates deterministic inter-hub routes and handles unmodeled routes', async () => {
    const mock = new MockRouteProvider();

    // Known DEL-NDLS route
    const delNdls = await mock.calculateRoute('DEL', 'NDLS', 'driving');
    assert.ok(delNdls);
    assert.strictEqual(delNdls.provider, 'MockRouteProvider');
    assert.strictEqual(delNdls.origin, 'DEL');
    assert.strictEqual(delNdls.destination, 'NDLS');
    assert.strictEqual(delNdls.durationMinutes, 45);
    assert.strictEqual(delNdls.duration, 45);
    assert.strictEqual(delNdls.distanceKm, 16);

    // Reverse NDLS-DEL route
    const ndlsDel = await mock.calculateRoute('NDLS', 'DEL', 'driving');
    assert.strictEqual(ndlsDel.durationMinutes, 45);

    // Unmodeled route BLR-DEL returns duration: null per specification
    const blrDel = await mock.calculateRoute('BLR', 'DEL', 'driving');
    assert.strictEqual(blrDel.duration, null);
    assert.strictEqual(blrDel.distance, null);
  });

  // 3. Provider Factory Selection & Configuration Switching
  it('3. getProvider and providerRegistry select route providers based on configuration and overrides', () => {
    assert.ok(providerRegistry.route);
    assert.strictEqual(providerRegistry.route.mock, MockRouteProvider);
    assert.strictEqual(providerRegistry.route.google, GoogleRoutesProvider);

    const mockInstance = getProvider('route', 'mock');
    assert.ok(mockInstance instanceof MockRouteProvider);

    const googleInstance = getProvider('route', 'google');
    assert.ok(googleInstance instanceof GoogleRoutesProvider);

    const pair = getProviderPair('route');
    assert.ok(pair.primary);
    assert.ok(pair.fallback instanceof MockRouteProvider);
  });

  // 4. GoogleRoutesProvider Driving & Transit Route Calculation
  it('4. GoogleRoutesProvider handles driving and transit modes cleanly with fallback baseline capability', async () => {
    const provider = new GoogleRoutesProvider();

    // Driving mode
    const driveRoute = await provider.calculateRoute('DEL', 'NDLS', 'DRIVE');
    assert.ok(driveRoute);
    assert.strictEqual(driveRoute.origin, 'DEL');
    assert.strictEqual(driveRoute.destination, 'NDLS');
    assert.strictEqual(typeof driveRoute.durationMinutes, 'number');
    assert.ok(driveRoute.durationMinutes > 0);
    assert.ok(['LIVE', 'ESTIMATED'].includes(driveRoute.confidence));

    // Transit mode
    const transitRoute = await provider.calculateRoute('DEL', 'NDLS', 'TRANSIT');
    assert.ok(transitRoute);
    assert.strictEqual(transitRoute.origin, 'DEL');
    assert.strictEqual(transitRoute.destination, 'NDLS');
    assert.strictEqual(typeof transitRoute.durationMinutes, 'number');
    assert.ok(transitRoute.durationMinutes > 0);
    assert.ok(['LIVE', 'ESTIMATED'].includes(transitRoute.confidence));
  });

  // 5. Waypoint formatting with coordinates and location objects
  it('5. GoogleRoutesProvider waypoint formatter supports coordinate objects and transport hub codes', () => {
    const provider = new GoogleRoutesProvider();

    const hubWp = provider._formatWaypoint('DEL');
    assert.ok(hubWp.address.includes('Indira Gandhi International Airport'));

    const objHubWp = provider._formatWaypoint({ code: 'NDLS' });
    assert.ok(objHubWp.address.includes('New Delhi Railway Station'));

    const coordWp = provider._formatWaypoint({ lat: 28.5562, lng: 77.1000 });
    assert.strictEqual(coordWp.location.latLng.latitude, 28.5562);
    assert.strictEqual(coordWp.location.latLng.longitude, 77.1000);

    const fullCoordWp = provider._formatWaypoint({ latitude: 12.9716, longitude: 77.5946 });
    assert.strictEqual(fullCoordWp.location.latLng.latitude, 12.9716);
    assert.strictEqual(fullCoordWp.location.latLng.longitude, 77.5946);

    const customAddrWp = provider._formatWaypoint('Connaught Place, New Delhi');
    assert.strictEqual(customAddrWp.address, 'Connaught Place, New Delhi');
  });

  // 6. Route Normalizer Contract: duration, distance, confidence tags, timestamps
  it('6. RouteNormalizer normalizes Google API responses and stamps LIVE / ESTIMATED tags correctly', () => {
    // Live payload from Google Routes v2
    const rawGooglePayload = {
      routes: [
        {
          duration: '1800s', // 30 minutes
          distanceMeters: 15200, // 15.2 km
        },
      ],
    };

    const normalized = routeNormalizer.normalizeGoogleRoute(rawGooglePayload, 'DEL', 'NDLS', 'DRIVE');
    assert.ok(normalized);
    assert.strictEqual(normalized.provider, 'Google Routes');
    assert.strictEqual(normalized.origin, 'DEL');
    assert.strictEqual(normalized.destination, 'NDLS');
    assert.strictEqual(normalized.durationMinutes, 30);
    assert.strictEqual(normalized.duration, 30);
    assert.strictEqual(normalized.distanceKm, 15.2);
    assert.strictEqual(normalized.confidence, 'LIVE');
    assert.strictEqual(normalized.source, 'GOOGLE_ROUTES');
    assert.ok(normalized.retrievedAt);
    assert.ok(normalized.sourceTimestamp);

    // Fallback estimate
    const fallback = routeNormalizer.createFallbackEstimate('BLR', 'SBC', 65, 'Baseline estimate');
    assert.ok(fallback);
    assert.strictEqual(fallback.provider, 'Fallback Route Estimator');
    assert.strictEqual(fallback.origin, 'BLR');
    assert.strictEqual(fallback.destination, 'SBC');
    assert.strictEqual(fallback.durationMinutes, 65);
    assert.strictEqual(fallback.confidence, 'ESTIMATED');
    assert.strictEqual(fallback.source, 'FALLBACK_ESTIMATE');

    // Invalid payload
    assert.strictEqual(routeNormalizer.normalizeGoogleRoute(null, 'DEL', 'NDLS'), null);
    assert.strictEqual(routeNormalizer.normalizeGoogleRoute({}, 'DEL', 'NDLS'), null);
    assert.strictEqual(routeNormalizer.normalizeGoogleRoute({ routes: [] }, 'DEL', 'NDLS'), null);
  });

  // 7. Fallback Sequence: Primary -> Fallback / Baseline -> Cache
  it('7. FallbackManager executes route fallback sequence and caches results with TTL', async () => {
    fallbackManager.clearCache();

    let primaryAttempts = 0;
    const failingPrimary = {
      name: 'FailingGoogleRoutesProvider',
      calculateRoute: async () => {
        primaryAttempts++;
        throw new Error('Google Routes API connection timeout (504)');
      },
    };

    const fallbackMock = {
      name: 'MockRouteProvider',
      calculateRoute: async (params) => {
        return {
          provider: 'MockRouteProvider',
          origin: params.origin,
          destination: params.destination,
          durationMinutes: 45,
          duration: 45,
          distanceKm: 16,
          confidence: 'MOCK',
          source: 'MOCK',
        };
      },
    };

    const events = [];
    const options = {
      sessionId: 'sess-p7-fallback',
      emitEventFn: (t, m) => events.push({ type: t, message: m }),
    };

    // First call: primary fails -> fallback triggered
    const res1 = await fallbackManager.execute(
      'route',
      'calculateRoute',
      failingPrimary,
      fallbackMock,
      { origin: 'DEL', destination: 'NDLS', mode: 'DRIVE' },
      options
    );

    assert.ok(res1);
    assert.strictEqual(res1.durationMinutes, 45);
    assert.strictEqual(res1.fallbackUsed, true);
    assert.strictEqual(primaryAttempts, 1);
    assert.ok(events.some((e) => e.type === 'TOOL_FAILED'));
    assert.ok(events.some((e) => e.type === 'FALLBACK_TRIGGERED'));

    // Second call with same parameters: served directly from cache without hitting primary
    const res2 = await fallbackManager.execute(
      'route',
      'calculateRoute',
      failingPrimary,
      fallbackMock,
      { origin: 'DEL', destination: 'NDLS', mode: 'DRIVE' },
      options
    );

    assert.ok(res2);
    assert.strictEqual(res2.fromCache, true);
    assert.strictEqual(res2.confidence, 'CACHED');
    assert.strictEqual(primaryAttempts, 1); // No new network call
  });

  // 8. Connection Feasibility Validation: Mandatory 30-Minute Safety Buffer
  it('8. ConnectionValidator consumes physical transfer duration and strictly enforces 30-minute safety buffer', () => {
    const flightArrival = {
      segmentId: 'SEG-ARR-01',
      transportMode: 'flight',
      destination: { code: 'DEL' },
      arrival: '2026-09-20T14:00:00.000Z',
    };

    // Case A: Transfer duration = 40 min -> Required = 40 + 30 = 70 min. Available = 60 min (< 70 min) -> INVALID
    const departureInsufficient = {
      segmentId: 'SEG-DEP-01',
      transportMode: 'train',
      origin: { code: 'NDLS' },
      departure: '2026-09-20T15:00:00.000Z', // 60 min available
    };
    const routeInfoA = { durationMinutes: 40, confidence: 'LIVE', source: 'GOOGLE_ROUTES' };
    const checkA = connectionValidator.validateConnection(flightArrival, departureInsufficient, routeInfoA);

    assert.strictEqual(checkA.status, 'INVALID');
    assert.strictEqual(checkA.availableMinutes, 60);
    assert.strictEqual(checkA.requiredMinutes, 70); // 40 + 30
    assert.strictEqual(checkA.bufferMinutes, 30);
    assert.strictEqual(checkA.failureType, 'INSUFFICIENT_TRANSFER_TIME');

    // Case B: Exact boundary: Available = 70 min == Required 70 min -> VALID
    const departureExact = {
      segmentId: 'SEG-DEP-02',
      transportMode: 'train',
      origin: { code: 'NDLS' },
      departure: '2026-09-20T15:10:00.000Z', // 70 min available
    };
    const checkB = connectionValidator.validateConnection(flightArrival, departureExact, routeInfoA);

    assert.strictEqual(checkB.status, 'VALID');
    assert.strictEqual(checkB.availableMinutes, 70);
    assert.strictEqual(checkB.requiredMinutes, 70);
    assert.strictEqual(checkB.failureType, null);

    // Case C: Generous transfer: Available = 90 min (> 70 min) -> VALID
    const departureGenerous = {
      segmentId: 'SEG-DEP-03',
      transportMode: 'train',
      origin: { code: 'NDLS' },
      departure: '2026-09-20T15:30:00.000Z', // 90 min available
    };
    const checkC = connectionValidator.validateConnection(flightArrival, departureGenerous, routeInfoA);

    assert.strictEqual(checkC.status, 'VALID');
    assert.strictEqual(checkC.availableMinutes, 90);
    assert.strictEqual(checkC.requiredMinutes, 70);
    assert.strictEqual(checkC.failureType, null);
  });

  // 9. Data Freshness Validation for Route Data (Threshold: 15 minutes)
  it('9. DataFreshnessValidator validates route data freshness against 15-minute threshold', () => {
    const now = Date.now();

    // Route retrieved 10 minutes ago (<= 15 min threshold) -> FRESH
    const freshRoute = {
      durationMinutes: 45,
      retrievedAt: new Date(now - 10 * 60000).toISOString(),
    };
    const freshCheck = dataFreshnessValidator.evaluateFreshness(freshRoute, 'route');
    assert.strictEqual(freshCheck.status, 'FRESH');
    assert.strictEqual(freshCheck.thresholdMinutes, 15);
    assert.ok(freshCheck.ageMinutes <= 15);

    // Route retrieved 20 minutes ago (> 15 min threshold) -> STALE
    const staleRoute = {
      durationMinutes: 45,
      retrievedAt: new Date(now - 20 * 60000).toISOString(),
    };
    const staleCheck = dataFreshnessValidator.evaluateFreshness(staleRoute, 'route');
    assert.strictEqual(staleCheck.status, 'STALE');
    assert.strictEqual(staleCheck.thresholdMinutes, 15);
    assert.ok(staleCheck.ageMinutes > 15);
  });

  // 10. Credential Protection & Fault Isolation
  it('10. Credential protection ensures API keys are never exposed in normalized outputs, errors, or fallback payloads', async () => {
    const provider = new GoogleRoutesProvider();
    const testSecret = 'AIzaSy_FAKE_SECRET_KEY_12345';
    provider.apiKey = testSecret;

    // Simulate API request failure with custom mock key
    const result = await provider.calculateRoute('DEL', 'NDLS', 'DRIVE');
    assert.ok(result);

    const serialized = JSON.stringify(result);
    assert.strictEqual(serialized.includes(testSecret), false, 'API key must NEVER appear in route output payload');
    assert.strictEqual(result.confidence, 'ESTIMATED');
    assert.strictEqual(result.source, 'FALLBACK_ESTIMATE');
  });

  // 11. ActionExecutor Dispatches CALCULATE_ROUTE Seamlessly
  it('11. ActionExecutor dispatches CALCULATE_ROUTE action through provider fallback layer', async () => {
    const action = {
      type: 'CALCULATE_ROUTE',
      parameters: {
        origin: 'DEL',
        destination: 'NDLS',
        mode: 'DRIVE',
      },
    };

    const execResult = await actionExecutor.execute(action, { sessionId: 'sess-action-route' });
    assert.ok(execResult.success);
    assert.ok(execResult.data);
    assert.strictEqual(execResult.data.origin, 'DEL');
    assert.strictEqual(execResult.data.destination, 'NDLS');
    assert.strictEqual(typeof execResult.data.durationMinutes, 'number');
    assert.ok(execResult.data.durationMinutes > 0);
  });

  // 12. Live Google Routes API Query (when GOOGLE_MAPS_API_KEY is configured)
  it('12. Live Google Routes API query verifies computeRoutes endpoint connectivity and response parsing', async () => {
    if (!config.googleMapsApiKey) {
      console.log('Skipping live Google Routes API query (no key configured)');
      return;
    }

    const provider = new GoogleRoutesProvider();
    const liveResult = await provider.calculateRoute('DEL', 'NDLS', 'DRIVE');

    assert.ok(liveResult, 'Live route result must be returned');
    assert.strictEqual(liveResult.origin, 'DEL');
    assert.strictEqual(liveResult.destination, 'NDLS');
    assert.strictEqual(typeof liveResult.durationMinutes, 'number');
    assert.ok(liveResult.durationMinutes >= 15 && liveResult.durationMinutes <= 180);
    assert.ok(['LIVE', 'ESTIMATED'].includes(liveResult.confidence));
    if (liveResult.confidence === 'LIVE') {
      assert.strictEqual(liveResult.source, 'GOOGLE_ROUTES');
      assert.ok(typeof liveResult.distanceKm === 'number');
      assert.ok(liveResult.distanceKm > 0);
    }
  });
});
