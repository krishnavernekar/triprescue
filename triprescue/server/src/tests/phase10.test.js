const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const http = require('http');
const mongoose = require('mongoose');
const app = require('../app');
const Trip = require('../models/Trip');
const RecoverySession = require('../models/RecoverySession');
const config = require('../config/environment');

// Phase 10 modules
const HotelProvider = require('../providers/hotel/HotelProvider');
const MockHotelProvider = require('../providers/hotel/MockHotelProvider');
const hotelNormalizer = require('../providers/normalizers/HotelNormalizer');
const { getProvider, getProviderPair } = require('../providers');
const toolRegistry = require('../agent/ToolRegistry');
const actionExecutor = require('../agent/ActionExecutor');
const actionValidator = require('../agent/ActionValidator');
const constraintValidator = require('../evaluation/ConstraintValidator');
const connectionValidator = require('../evaluation/ConnectionValidator');
const adaptationEngine = require('../agent/AdaptationEngine');
const recoveryPlanner = require('../agent/RecoveryPlanner');

describe('Phase 10: Hotel Provider & Emergency Transit Accommodation', () => {
  let server;
  let testTripId;
  let testSessionId;

  before(async () => {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/triprescue';
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(mongoUri);
    }

    server = http.createServer(app);
    await new Promise((resolve) => {
      server.listen(0, () => resolve());
    });
  });

  after(async () => {
    if (testTripId) {
      await Trip.findByIdAndDelete(testTripId);
      await RecoverySession.deleteMany({ tripId: testTripId });
    }
    if (server) {
      server.close();
    }
    await mongoose.disconnect();
  });

  // 1. HotelProvider base contract
  it('1. HotelProvider base class defines contract and enforces subclass implementation', async () => {
    const base = new HotelProvider();
    assert.strictEqual(base.name, 'HotelProvider');
    assert.strictEqual(base.type, 'hotel');

    await assert.rejects(async () => await base.search({}), /not implemented/);
    await assert.rejects(async () => await base.getDetails('HTL-1'), /not implemented/);
    await assert.rejects(async () => await base.revalidate('HTL-1'), /not implemented/);
    await assert.rejects(async () => await base.getExternalLink('HTL-1'), /not implemented/);
  });

  // 2. MockHotelProvider deterministic search across hubs
  it('2. MockHotelProvider executes deterministic search across major Indian transit hubs', async () => {
    const provider = new MockHotelProvider();

    // Hub 1: Delhi
    const delSearch = await provider.search({ location: 'DEL', checkInDate: '2026-09-20T22:00:00+05:30' });
    assert.ok(delSearch.results.length >= 2);
    const holidayInn = delSearch.results.find((h) => h.hotelId.includes('T3'));
    assert.ok(holidayInn, 'Should return Holiday Inn T3');
    assert.strictEqual(holidayInn.transportMode, 'hotel');
    assert.strictEqual(holidayInn.location.code, 'DEL');
    assert.strictEqual(holidayInn.price.amount, 4200);
    assert.strictEqual(holidayInn.price.currency, 'INR');
    assert.strictEqual(holidayInn.cancellationPolicy, 'FREE_CANCELLATION');
    assert.strictEqual(holidayInn.rating, 4.4);
    assert.strictEqual(holidayInn.distanceKm, 0.3);
    assert.strictEqual(holidayInn.dataConfidence, 'MOCK');
    assert.strictEqual(holidayInn.externalHandoff.status, 'DEEPLINK_UNAVAILABLE');
    assert.strictEqual(holidayInn.externalHandoff.url, null);

    // Hub 2: Mumbai
    const bomSearch = await provider.search({ location: 'BOM' });
    assert.ok(bomSearch.results.length >= 1);
    assert.strictEqual(bomSearch.results[0].location.code, 'BOM');

    // Hub 3: Bengaluru
    const blrSearch = await provider.search({ location: 'BLR' });
    assert.ok(blrSearch.results.length >= 1);
    assert.strictEqual(blrSearch.results[0].location.code, 'BLR');

    // Hub 4: Jaipur
    const jaiSearch = await provider.search({ location: 'JAI' });
    assert.ok(jaiSearch.results.length >= 1);
    assert.strictEqual(jaiSearch.results[0].location.code, 'JAI');
  });

  // 3. MockHotelProvider details
  it('3. MockHotelProvider returns detailed property info and handles unknown IDs', async () => {
    const provider = new MockHotelProvider();

    const details = await provider.getDetails('HTL-DEL-T3-001');
    assert.ok(details.result);
    assert.strictEqual(details.result.status, 'CONFIRMED');
    assert.ok(details.result.availableRooms > 0);
    assert.ok(details.result.amenities.length > 0);

    const notFound = await provider.getDetails('HTL-UNKNOWN');
    assert.strictEqual(notFound.result, null);
    assert.ok(notFound.error);
  });

  // 4. MockHotelProvider revalidation
  it('4. MockHotelProvider revalidates active, sold out, and price-adjusted inventory', async () => {
    const provider = new MockHotelProvider();

    // Active
    const active = await provider.revalidate('HTL-DEL-T3-001');
    assert.strictEqual(active.valid, true);
    assert.strictEqual(active.status, 'AVAILABLE');

    // Sold out
    const soldOut = await provider.revalidate('HTL-DEL-SOLD_OUT-001');
    assert.strictEqual(soldOut.valid, false);
    assert.strictEqual(soldOut.status, 'UNAVAILABLE');

    // Price change
    const priceChanged = await provider.revalidate('HTL-DEL-PRICE_CHANGED-001');
    assert.strictEqual(priceChanged.valid, true);
    assert.strictEqual(priceChanged.priceChanged, true);
    assert.strictEqual(priceChanged.newPrice, 5500);
  });

  // 5. HotelNormalizer schema compliance
  it('5. HotelNormalizer standardizes hotel data and prevents booking URL fabrication', () => {
    const raw = {
      id: 'HTL-RAW-101',
      name: 'Airport Transit Lodge',
      location: 'DEL',
      checkIn: '2026-09-20T21:00:00+05:30',
      checkOut: '2026-09-21T09:00:00+05:30',
      price: 2500,
      cancellationPolicy: 'FREE_CANCELLATION',
      rating: 4.2,
      distanceKm: 1.5,
    };

    const norm = hotelNormalizer.normalizeHotel(raw);
    assert.strictEqual(norm.transportMode, 'hotel');
    assert.strictEqual(norm.hotelId, 'HTL-RAW-101');
    assert.strictEqual(norm.price.amount, 2500);
    assert.strictEqual(norm.price.currency, 'INR');
    assert.strictEqual(norm.distanceKm, 1.5);
    assert.strictEqual(norm.externalHandoff.url, null);
    assert.strictEqual(norm.externalHandoff.status, 'DEEPLINK_UNAVAILABLE');
    assert.ok(norm.segments.length > 0);
    assert.strictEqual(norm.segments[0].transportMode, 'hotel');
  });

  // 6. Provider Registry resolution
  it('6. Provider registry resolves hotel provider via getProvider and getProviderPair', () => {
    const hotelP = getProvider('hotel');
    assert.ok(hotelP instanceof MockHotelProvider);

    const pair = getProviderPair('hotel');
    assert.ok(pair.primary instanceof MockHotelProvider);
    assert.ok(pair.fallback instanceof MockHotelProvider);
  });

  // 7. ToolRegistry and ActionValidator
  it('7. ActionValidator enforces required location parameter for SEARCH_HOTELS', () => {
    const invalidAction = {
      actionId: 'ACT-H-INV',
      type: 'SEARCH_HOTELS',
      tool: 'hotel',
      parameters: {}, // missing location
    };
    const invRes = actionValidator.validate(invalidAction);
    assert.strictEqual(invRes.valid, false);
    assert.ok(invRes.errors.some((e) => e.includes('location')));

    const validAction = {
      actionId: 'ACT-H-VAL',
      type: 'SEARCH_HOTELS',
      tool: 'hotel',
      parameters: { location: 'DEL', checkInDate: '2026-09-20T22:00:00+05:30' },
    };
    const valRes = actionValidator.validate(validAction);
    assert.strictEqual(valRes.valid, true);
  });

  // 8. ActionExecutor dispatch
  it('8. ActionExecutor dispatches SEARCH_HOTELS cleanly through provider fallback layer', async () => {
    const action = {
      actionId: 'ACT-H-EXEC',
      type: 'SEARCH_HOTELS',
      tool: 'hotel',
      parameters: { location: 'DEL', checkInDate: '2026-09-20T22:00:00+05:30' },
    };
    const execRes = await actionExecutor.execute(action);
    assert.strictEqual(execRes.success, true);
    assert.ok(execRes.data.results.length > 0);
    assert.strictEqual(execRes.data.results[0].transportMode, 'hotel');
  });

  // 9. ConstraintValidator on Hotel
  it('9. ConstraintValidator evaluates candidate plan with hotel against budget and availability', () => {
    const candidate = {
      planId: 'PLAN-HTL-VAL',
      strategy: 'TRANSIT_HOTEL',
      segments: [
        {
          segmentId: 'S-HTL-1',
          transportMode: 'hotel',
          name: 'Ibis Aerocity',
          origin: { code: 'DEL' },
          destination: { code: 'DEL' },
          departure: '2026-09-20T22:00:00+05:30',
          arrival: '2026-09-21T08:00:00+05:30',
          price: { amount: 3100, currency: 'INR' },
          availability: true,
        },
      ],
      totalCost: 3100,
      finalArrivalTime: '2026-09-21T08:00:00+05:30',
    };

    // Case A: fits budget
    const validObjective = {
      origin: 'DEL',
      destination: 'DEL',
      maxAdditionalBudget: 5000,
    };
    const checkA = constraintValidator.validate(candidate, validObjective);
    assert.strictEqual(checkA.valid, true);

    // Case B: budget exceeded
    const tightObjective = {
      origin: 'DEL',
      destination: 'DEL',
      maxAdditionalBudget: 2000, // less than ₹3100
    };
    const checkB = constraintValidator.validate(candidate, tightObjective);
    assert.strictEqual(checkB.valid, false);
    assert.ok(checkB.violations.some((v) => v.type === 'BUDGET'));

    // Case C: unavailable hotel
    const unavailCandidate = {
      ...candidate,
      segments: [{ ...candidate.segments[0], availability: false }],
    };
    const checkC = constraintValidator.validate(unavailCandidate, validObjective);
    assert.strictEqual(checkC.valid, false);
    assert.ok(checkC.violations.some((v) => v.type === 'AVAILABILITY'));
  });

  // 10. ConnectionValidator with hotel segment
  it('10. ConnectionValidator enforces physical transfer buffer between flight arrival and hotel check-in', () => {
    const flightLeg = {
      segmentId: 'SEG-FL-DEL',
      transportMode: 'flight',
      origin: { code: 'BLR' },
      destination: { code: 'DEL' },
      departure: '2026-09-20T18:00:00+05:30',
      arrival: '2026-09-20T20:45:00+05:30',
    };

    // Hotel check-in at 22:00 (75 mins after arrival)
    // DEL to airport hotel requires 20 mins + 30 min buffer = 50 mins required -> VALID (75 >= 50)
    const hotelLegFeasible = {
      segmentId: 'SEG-HTL-AERO',
      transportMode: 'hotel',
      origin: { code: 'DEL' },
      destination: { code: 'DEL' },
      departure: '2026-09-20T22:00:00+05:30',
      arrival: '2026-09-21T08:00:00+05:30',
    };
    const resFeasible = connectionValidator.validatePlanConnections([flightLeg, hotelLegFeasible]);
    assert.strictEqual(resFeasible.valid, true);

    // Hotel check-in at 21:00 (15 mins after arrival) -> INSUFFICIENT
    const hotelLegTooSoon = {
      segmentId: 'SEG-HTL-EARLY',
      transportMode: 'hotel',
      origin: { code: 'DEL' },
      destination: { code: 'DEL' },
      departure: '2026-09-20T21:00:00+05:30',
      arrival: '2026-09-21T08:00:00+05:30',
    };
    const resTooSoon = connectionValidator.validatePlanConnections([flightLeg, hotelLegTooSoon]);
    assert.strictEqual(resTooSoon.valid, false);
  });

  // 11. AdaptationEngine transitions to hotel
  it('11. AdaptationEngine switches dynamically to hotel recovery strategies on overnight delay', () => {
    const adaptOvernight = adaptationEngine.adapt('DIRECT_FLIGHT', 'OVERNIGHT_DELAY', ['DIRECT_FLIGHT']);
    assert.ok(
      adaptOvernight.nextStrategy === 'FLIGHT_PLUS_HOTEL' ||
      adaptOvernight.nextStrategy === 'TRANSIT_HOTEL' ||
      adaptOvernight.nextStrategy === 'MULTIMODAL_REPLAN'
    );
  });

  // 12. Complete Autonomous Recovery: TRANSIT_HOTEL
  it('12. RecoveryPlanner executes autonomous recovery via TRANSIT_HOTEL strategy', async () => {
    const trip = new Trip({
      passengerName: 'Sanjay Kapoor',
      passengerCount: 1,
      origin: 'DEL',
      destination: 'DEL',
      departureTime: '2026-09-20T22:00:00+05:30',
      arrivalDeadline: '2026-09-21T12:00:00+05:30',
      maxAdditionalBudget: 5000,
      priority: 'cost',
      riskTolerance: 'LOW',
      status: 'DISRUPTED',
      itinerary: [
        {
          segmentId: 'SEG-STRAND-1',
          transportMode: 'flight',
          origin: { code: 'DEL', type: 'airport' },
          destination: { code: 'DEL', type: 'airport' },
          departure: '2026-09-20T22:00:00+05:30',
          arrival: '2026-09-20T23:00:00+05:30',
          status: 'CANCELLED',
        },
      ],
      disruption: {
        type: 'FLIGHT_CANCELLED',
        affectedSegmentId: 'SEG-STRAND-1',
        description: 'Stranded overnight due to late cancellation',
      },
    });
    await trip.save();
    testTripId = trip._id.toString();

    const session = new RecoverySession({
      tripId: trip._id,
      objective: {
        origin: 'DEL',
        destination: 'DEL',
        departureTime: '2026-09-20T22:00:00+05:30',
        arrivalDeadline: '2026-09-21T12:00:00+05:30',
        maxAdditionalBudget: 5000,
        passengerCount: 1,
      },
      currentItinerary: trip.itinerary,
      disruption: trip.disruption,
      status: 'READY',
      currentStrategy: 'TRANSIT_HOTEL',
    });
    await session.save();
    testSessionId = session._id.toString();

    const result = await recoveryPlanner.runRecovery(session, 5);
    assert.ok(result.selectedPlan, 'Should formulate verified hotel recovery plan');
    assert.strictEqual(result.selectedPlan.strategy, 'TRANSIT_HOTEL');
    assert.strictEqual(result.selectedPlan.segments[0].transportMode, 'hotel');
    assert.ok(result.selectedPlan.totalCost <= 5000);
    assert.strictEqual(result.status, 'AWAITING_APPROVAL');
  });

  // 13. Multimodal recovery: FLIGHT_PLUS_HOTEL
  it('13. RecoveryPlanner executes composite FLIGHT_PLUS_HOTEL recovery loop', async () => {
    const trip = new Trip({
      passengerName: 'Neha Sharma',
      passengerCount: 1,
      origin: 'BLR',
      destination: 'DEL',
      departureTime: '2026-09-20T16:00:00+05:30',
      arrivalDeadline: '2026-09-21T14:00:00+05:30',
      maxAdditionalBudget: 15000,
      priority: 'arrival_time',
      riskTolerance: 'MEDIUM',
      status: 'DISRUPTED',
      itinerary: [
        {
          segmentId: 'SEG-FPH-1',
          transportMode: 'flight',
          origin: { code: 'BLR', type: 'airport' },
          destination: { code: 'DEL', type: 'airport' },
          departure: '2026-09-20T16:00:00+05:30',
          arrival: '2026-09-20T18:45:00+05:30',
          status: 'DELAYED',
        },
      ],
      disruption: {
        type: 'FLIGHT_DELAYED',
        affectedSegmentId: 'SEG-FPH-1',
        description: 'Connecting flight missed, overnight layover at transit hub',
      },
    });
    await trip.save();

    const session = new RecoverySession({
      tripId: trip._id,
      objective: {
        origin: 'BLR',
        destination: 'DEL',
        departureTime: '2026-09-20T16:00:00+05:30',
        arrivalDeadline: '2026-09-21T14:00:00+05:30',
        maxAdditionalBudget: 15000,
        passengerCount: 1,
      },
      currentItinerary: trip.itinerary,
      disruption: trip.disruption,
      status: 'READY',
      currentStrategy: 'FLIGHT_PLUS_HOTEL',
    });
    await session.save();

    const result = await recoveryPlanner.runRecovery(session, 5);
    assert.ok(result.selectedPlan, 'Should formulate flight + hotel composite plan');
    assert.strictEqual(result.selectedPlan.strategy, 'FLIGHT_PLUS_HOTEL');
    assert.strictEqual(result.selectedPlan.segments.length, 2);
    assert.strictEqual(result.selectedPlan.segments[0].transportMode, 'flight');
    assert.strictEqual(result.selectedPlan.segments[1].transportMode, 'hotel');

    await Trip.findByIdAndDelete(trip._id);
    await RecoverySession.deleteMany({ tripId: trip._id });
  });

  // 14. Hotel revalidation in plan verification
  it('14. ActionExecutor REVALIDATE_PLAN correctly revalidates hotel segments', async () => {
    const action = {
      actionId: 'ACT-REVAL-HTL',
      type: 'REVALIDATE_PLAN',
      tool: 'revalidator',
      parameters: {
        segments: [
          {
            segmentId: 'S-HTL-TEST',
            transportMode: 'hotel',
            identifier: 'HTL-DEL-T3-001',
          },
        ],
      },
    };

    const result = await actionExecutor.execute(action);
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.data.revalidated, true);
    assert.ok(result.data.results.length > 0);
    assert.strictEqual(result.data.results[0].mode, 'hotel');
    assert.strictEqual(result.data.results[0].valid, true);
  });
});
