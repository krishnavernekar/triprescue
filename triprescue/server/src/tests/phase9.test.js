const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const http = require('http');
const mongoose = require('mongoose');
const app = require('../app');
const Trip = require('../models/Trip');
const RecoverySession = require('../models/RecoverySession');
const config = require('../config/environment');

// Phase 9 modules
const TrainProvider = require('../providers/train/TrainProvider');
const MockTrainProvider = require('../providers/train/MockTrainProvider');
const BusProvider = require('../providers/bus/BusProvider');
const MockBusProvider = require('../providers/bus/MockBusProvider');
const trainNormalizer = require('../providers/normalizers/TrainNormalizer');
const busNormalizer = require('../providers/normalizers/BusNormalizer');
const { getProvider, getProviderPair, providerRegistry } = require('../providers');
const toolRegistry = require('../agent/ToolRegistry');
const actionExecutor = require('../agent/ActionExecutor');
const actionValidator = require('../agent/ActionValidator');
const constraintValidator = require('../evaluation/ConstraintValidator');
const connectionValidator = require('../evaluation/ConnectionValidator');
const adaptationEngine = require('../agent/AdaptationEngine');
const recoveryPlanner = require('../agent/RecoveryPlanner');
const fallbackManager = require('../providers/FallbackManager');

describe('Phase 9: Train + Bus Providers & Multimodal Recovery', () => {
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

  // 1. TrainProvider contract
  it('1. TrainProvider base class defines contract and enforces subclass implementation', async () => {
    const base = new TrainProvider();
    assert.strictEqual(base.name, 'TrainProvider');
    assert.strictEqual(base.type, 'train');

    await assert.rejects(async () => await base.search({}), /not implemented/);
    await assert.rejects(async () => await base.getDetails('123'), /not implemented/);
    await assert.rejects(async () => await base.revalidate('123'), /not implemented/);
    await assert.rejects(async () => await base.getExternalLink('123'), /not implemented/);
  });

  // 2. BusProvider contract
  it('2. BusProvider base class defines contract and enforces subclass implementation', async () => {
    const base = new BusProvider();
    assert.strictEqual(base.name, 'BusProvider');
    assert.strictEqual(base.type, 'bus');

    await assert.rejects(async () => await base.search({}), /not implemented/);
    await assert.rejects(async () => await base.getDetails('123'), /not implemented/);
    await assert.rejects(async () => await base.revalidate('123'), /not implemented/);
    await assert.rejects(async () => await base.getExternalLink('123'), /not implemented/);
  });

  // 3. MockTrainProvider deterministic search and details
  it('3. MockTrainProvider executes deterministic search across key Indian railway corridors', async () => {
    const provider = new MockTrainProvider();

    // Corridor 1: Delhi to Jaipur
    const delJai = await provider.search({ origin: 'NDLS', destination: 'JAI', departureTime: '2026-09-20T08:00:00+05:30' });
    assert.ok(delJai.results.length >= 2);
    const vb = delJai.results.find((r) => r.identifier.includes('20978'));
    assert.ok(vb, 'Should return Vande Bharat Express');
    assert.strictEqual(vb.transportMode, 'train');
    assert.strictEqual(vb.origin.code, 'NDLS');
    assert.strictEqual(vb.destination.code, 'JAI');
    assert.strictEqual(vb.price.amount, 1600);
    assert.strictEqual(vb.dataConfidence, 'MOCK');
    assert.strictEqual(vb.externalHandoff.status, 'DEEPLINK_UNAVAILABLE');
    assert.strictEqual(vb.externalHandoff.url, null);

    // Corridor 2: Bengaluru to Chennai
    const blrMaa = await provider.search({ origin: 'SBC', destination: 'MAS' });
    assert.ok(blrMaa.results.length >= 1);
    assert.strictEqual(blrMaa.results[0].origin.code, 'SBC');
    assert.strictEqual(blrMaa.results[0].destination.code, 'MAS');

    // Details lookup
    const details = await provider.getDetails('Vande Bharat 20978');
    assert.strictEqual(details.result.status, 'CONFIRMED');
    assert.ok(details.result.availableSeats > 0);

    const missingDetails = await provider.getDetails('TR-UNKNOWN');
    assert.strictEqual(missingDetails.result, null);
  });

  // 4. MockTrainProvider revalidation
  it('4. MockTrainProvider revalidates active and cancelled train services', async () => {
    const provider = new MockTrainProvider();

    const active = await provider.revalidate('Vande Bharat 20978');
    assert.strictEqual(active.valid, true);
    assert.strictEqual(active.status, 'AVAILABLE');

    const cancelled = await provider.revalidate('TRAIN-CANCELLED-999');
    assert.strictEqual(cancelled.valid, false);
    assert.strictEqual(cancelled.status, 'CANCELLED');
  });

  // 5. MockBusProvider deterministic search and details
  it('5. MockBusProvider executes deterministic search across key intercity bus routes', async () => {
    const provider = new MockBusProvider();

    // Corridor 1: Delhi to Jaipur
    const delJai = await provider.search({ origin: 'DEL', destination: 'JAI', departureTime: '2026-09-20T09:00:00+05:30' });
    assert.ok(delJai.results.length >= 2);
    const volvo = delJai.results.find((r) => r.carrier.includes('RSRTC'));
    assert.ok(volvo, 'Should return RSRTC Volvo Express');
    assert.strictEqual(volvo.transportMode, 'bus');
    assert.strictEqual(volvo.origin.code, 'DEL');
    assert.strictEqual(volvo.destination.code, 'JAI');
    assert.strictEqual(volvo.price.amount, 850);
    assert.strictEqual(volvo.dataConfidence, 'MOCK');
    assert.strictEqual(volvo.externalHandoff.status, 'DEEPLINK_UNAVAILABLE');
    assert.strictEqual(volvo.externalHandoff.url, null);

    // Corridor 2: Mumbai to Pune
    const bomPune = await provider.search({ origin: 'BOM', destination: 'PUNE' });
    assert.ok(bomPune.results.length >= 1);
    assert.strictEqual(bomPune.results[0].transportMode, 'bus');

    // Details lookup
    const details = await provider.getDetails('RJ-14-VB-101');
    assert.strictEqual(details.result.status, 'CONFIRMED');
    assert.ok(details.result.availableSeats > 0);

    const missingDetails = await provider.getDetails('BUS-UNKNOWN');
    assert.strictEqual(missingDetails.result, null);
  });

  // 6. MockBusProvider revalidation
  it('6. MockBusProvider revalidates active and disrupted bus services', async () => {
    const provider = new MockBusProvider();

    const active = await provider.revalidate('RJ-14-VB-101');
    assert.strictEqual(active.valid, true);
    assert.strictEqual(active.status, 'AVAILABLE');

    const cancelled = await provider.revalidate('BUS-CANCELLED-101');
    assert.strictEqual(cancelled.valid, false);
    assert.strictEqual(cancelled.status, 'CANCELLED');
  });

  // 7. Normalization schemas
  it('7. TrainNormalizer and BusNormalizer enforce uniform schema with zero fabricated URLs', () => {
    const rawTrain = {
      identifier: '12015',
      carrier: 'Indian Railways',
      origin: 'NDLS',
      destination: 'JAI',
      departure: '2026-09-20T06:00:00+05:30',
      arrival: '2026-09-20T10:30:00+05:30',
      durationMinutes: 270,
      price: { amount: 1200, currency: 'INR' },
    };
    const normTrain = trainNormalizer.normalizeTrain(rawTrain);
    assert.strictEqual(normTrain.transportMode, 'train');
    assert.strictEqual(normTrain.price.amount, 1200);
    assert.strictEqual(normTrain.externalHandoff.url, null);
    assert.strictEqual(normTrain.externalHandoff.status, 'DEEPLINK_UNAVAILABLE');

    const rawBus = {
      identifier: 'KA-01-999',
      carrier: 'KSRTC',
      origin: 'BLR',
      destination: 'MAA',
      departure: '2026-09-20T07:00:00+05:30',
      arrival: '2026-09-20T13:00:00+05:30',
      price: 950,
    };
    const normBus = busNormalizer.normalizeBus(rawBus);
    assert.strictEqual(normBus.transportMode, 'bus');
    assert.strictEqual(normBus.price.amount, 950);
    assert.strictEqual(normBus.externalHandoff.url, null);
    assert.strictEqual(normBus.externalHandoff.status, 'DEEPLINK_UNAVAILABLE');
  });

  // 8. Provider Registry resolution
  it('8. Provider registry resolves train and bus providers via getProvider and getProviderPair', () => {
    const trainP = getProvider('train');
    assert.ok(trainP instanceof MockTrainProvider);

    const busP = getProvider('bus');
    assert.ok(busP instanceof MockBusProvider);

    const trainPair = getProviderPair('train');
    assert.ok(trainPair.primary instanceof MockTrainProvider);
    assert.ok(trainPair.fallback instanceof MockTrainProvider);

    const busPair = getProviderPair('bus');
    assert.ok(busPair.primary instanceof MockBusProvider);
    assert.ok(busPair.fallback instanceof MockBusProvider);
  });

  // 9. ActionExecutor dispatch
  it('9. ActionExecutor dispatches SEARCH_TRAINS and SEARCH_BUSES through FallbackManager', async () => {
    const trainAction = {
      actionId: 'ACT-T-01',
      type: 'SEARCH_TRAINS',
      tool: 'train',
      parameters: { origin: 'NDLS', destination: 'JAI' },
    };
    const trainRes = await actionExecutor.execute(trainAction);
    assert.strictEqual(trainRes.success, true);
    assert.ok(trainRes.data.results.length > 0);
    assert.strictEqual(trainRes.data.results[0].transportMode, 'train');

    const busAction = {
      actionId: 'ACT-B-01',
      type: 'SEARCH_BUSES',
      tool: 'bus',
      parameters: { origin: 'DEL', destination: 'JAI' },
    };
    const busRes = await actionExecutor.execute(busAction);
    assert.strictEqual(busRes.success, true);
    assert.ok(busRes.data.results.length > 0);
    assert.strictEqual(busRes.data.results[0].transportMode, 'bus');
  });

  // 10. Constraint validation on train & bus
  it('10. ConstraintValidator verifies train and bus plans against budget, deadline, and capacity', () => {
    const provider = new MockTrainProvider();
    const candidate = {
      planId: 'PLAN-TR-VAL',
      segments: [
        {
          segmentId: 'S-TR-1',
          transportMode: 'train',
          origin: { code: 'NDLS' },
          destination: { code: 'JAI' },
          departure: '2026-09-20T08:00:00+05:30',
          arrival: '2026-09-20T10:30:00+05:30',
          price: { amount: 1600, currency: 'INR' },
          availableSeats: 50,
          availability: true,
        },
      ],
      totalCost: 1600,
      finalArrivalTime: '2026-09-20T10:30:00+05:30',
    };

    // Case A: fits budget
    const validObjective = {
      origin: 'NDLS',
      destination: 'JAI',
      maxAdditionalBudget: 2000,
      arrivalDeadline: '2026-09-20T20:00:00+05:30',
      passengerCount: 1,
    };
    const checkA = constraintValidator.validate(candidate, validObjective);
    assert.strictEqual(checkA.valid, true);

    // Case B: budget exceeded
    const tightObjective = {
      origin: 'NDLS',
      destination: 'JAI',
      maxAdditionalBudget: 1000, // less than ₹1600
    };
    const checkB = constraintValidator.validate(candidate, tightObjective);
    assert.strictEqual(checkB.valid, false);
    assert.ok(checkB.violations.some((v) => v.type === 'BUDGET'));

    // Case C: capacity exceeded
    const largeGroupObjective = {
      origin: 'NDLS',
      destination: 'JAI',
      maxAdditionalBudget: 10000,
      passengerCount: 100, // availableSeats is 50
    };
    const checkC = constraintValidator.validate(candidate, largeGroupObjective);
    assert.strictEqual(checkC.valid, false);
    assert.ok(checkC.violations.some((v) => v.type === 'PASSENGERS'));
  });

  // 11. Multimodal connection validation
  it('11. ConnectionValidator verifies physical transfer buffer between flight, train, and bus legs', () => {
    const flightLeg = {
      segmentId: 'SEG-FL-1',
      transportMode: 'flight',
      origin: { code: 'BLR' },
      destination: { code: 'DEL' },
      departure: '2026-09-20T10:00:00+05:30',
      arrival: '2026-09-20T12:45:00+05:30',
    };

    // Train departs at 14:15 (90 mins after flight arrival at DEL)
    // DEL to NDLS requires 45 mins + 30 min buffer = 75 mins required. Available = 90 mins -> VALID
    const trainLegFeasible = {
      segmentId: 'SEG-TR-1',
      transportMode: 'train',
      origin: { code: 'NDLS' },
      destination: { code: 'JAI' },
      departure: '2026-09-20T14:15:00+05:30',
      arrival: '2026-09-20T16:45:00+05:30',
    };
    const resFeasible = connectionValidator.validatePlanConnections([flightLeg, trainLegFeasible]);
    assert.strictEqual(resFeasible.valid, true);

    // Train departs at 13:15 (30 mins after flight arrival) -> INSUFFICIENT
    const trainLegTooSoon = {
      segmentId: 'SEG-TR-2',
      transportMode: 'train',
      origin: { code: 'NDLS' },
      destination: { code: 'JAI' },
      departure: '2026-09-20T13:15:00+05:30',
      arrival: '2026-09-20T15:45:00+05:30',
    };
    const resTooSoon = connectionValidator.validatePlanConnections([flightLeg, trainLegTooSoon]);
    assert.strictEqual(resTooSoon.valid, false);
  });

  // 12. AdaptationEngine transitions
  it('12. AdaptationEngine switches dynamically to train and bus on budget or availability failure', () => {
    // Flight budget failed with tight budget (<= ₹3000) -> prefers train
    const adaptBudget = adaptationEngine.adapt('DIRECT_FLIGHT', 'BUDGET_EXCEEDED', ['DIRECT_FLIGHT'], {
      maxAdditionalBudget: 2500,
    });
    assert.ok(adaptBudget.nextStrategy === 'FLIGHT_PLUS_TRAIN' || adaptBudget.nextStrategy === 'TRAIN_ONLY');

    // Train failed due to no results -> switches to BUS_ONLY
    const adaptTrainDisrupt = adaptationEngine.adapt('TRAIN_ONLY', 'NO_RESULTS', ['TRAIN_ONLY'], {
      disruptionType: 'TRAIN_CANCELLED',
    });
    assert.strictEqual(adaptTrainDisrupt.nextStrategy, 'BUS_ONLY');
  });

  // 13. Full Autonomous Recovery: TRAIN_ONLY
  it('13. RecoveryPlanner executes complete autonomous recovery via TRAIN_ONLY strategy', async () => {
    const trip = new Trip({
      passengerName: 'Rohit Verma',
      passengerCount: 1,
      origin: 'NDLS',
      destination: 'JAI',
      departureTime: '2026-09-20T08:00:00+05:30',
      arrivalDeadline: '2026-09-20T22:00:00+05:30',
      maxAdditionalBudget: 2500,
      priority: 'arrival_time',
      riskTolerance: 'MEDIUM',
      status: 'DISRUPTED',
      itinerary: [
        {
          segmentId: 'SEG-TR-DISR-1',
          transportMode: 'train',
          origin: { code: 'NDLS', type: 'railway_station' },
          destination: { code: 'JAI', type: 'railway_station' },
          departure: '2026-09-20T08:00:00+05:30',
          arrival: '2026-09-20T12:00:00+05:30',
          status: 'CANCELLED',
        },
      ],
      disruption: {
        type: 'TRAIN_CANCELLED',
        affectedSegmentId: 'SEG-TR-DISR-1',
        description: 'Scheduled train cancelled due to track maintenance',
      },
    });
    await trip.save();
    testTripId = trip._id.toString();

    const session = new RecoverySession({
      tripId: trip._id,
      objective: {
        origin: 'NDLS',
        destination: 'JAI',
        departureTime: '2026-09-20T08:00:00+05:30',
        arrivalDeadline: '2026-09-20T22:00:00+05:30',
        maxAdditionalBudget: 2500,
        passengerCount: 1,
      },
      currentItinerary: trip.itinerary,
      disruption: trip.disruption,
      status: 'READY',
      currentStrategy: 'TRAIN_ONLY',
    });
    await session.save();
    testSessionId = session._id.toString();

    const result = await recoveryPlanner.runRecovery(session, 5);
    assert.ok(result.selectedPlan, 'Should formulate verified train recovery plan');
    assert.strictEqual(result.selectedPlan.strategy, 'TRAIN_ONLY');
    assert.strictEqual(result.selectedPlan.segments[0].transportMode, 'train');
    assert.ok(result.selectedPlan.totalCost <= 2500);
    assert.strictEqual(result.status, 'AWAITING_APPROVAL');
  });

  // 14. Full Autonomous Recovery: FLIGHT_PLUS_BUS multimodal
  it('14. RecoveryPlanner executes multimodal FLIGHT_PLUS_BUS recovery loop with route verification', async () => {
    const trip = new Trip({
      passengerName: 'Pooja Iyer',
      passengerCount: 1,
      origin: 'BLR',
      destination: 'JAI',
      departureTime: '2026-09-20T08:00:00+05:30',
      arrivalDeadline: '2026-09-20T23:00:00+05:30',
      maxAdditionalBudget: 6000,
      priority: 'arrival_time',
      riskTolerance: 'MEDIUM',
      status: 'DISRUPTED',
      itinerary: [
        {
          segmentId: 'SEG-MM-DISR-1',
          transportMode: 'flight',
          origin: { code: 'BLR', type: 'airport' },
          destination: { code: 'JAI', type: 'airport' },
          departure: '2026-09-20T08:00:00+05:30',
          arrival: '2026-09-20T10:45:00+05:30',
          status: 'CANCELLED',
        },
      ],
      disruption: {
        type: 'FLIGHT_CANCELLED',
        affectedSegmentId: 'SEG-MM-DISR-1',
        description: 'Flight cancelled due to airspace restriction',
      },
    });
    await trip.save();

    const session = new RecoverySession({
      tripId: trip._id,
      objective: {
        origin: 'BLR',
        destination: 'JAI',
        departureTime: '2026-09-20T08:00:00+05:30',
        arrivalDeadline: '2026-09-20T23:00:00+05:30',
        maxAdditionalBudget: 6000,
        passengerCount: 1,
      },
      currentItinerary: trip.itinerary,
      disruption: trip.disruption,
      status: 'READY',
      currentStrategy: 'FLIGHT_PLUS_BUS',
    });
    await session.save();

    const result = await recoveryPlanner.runRecovery(session, 5);
    assert.ok(result.selectedPlan, 'Should formulate verified flight+bus multimodal plan');
    assert.strictEqual(result.selectedPlan.strategy, 'FLIGHT_PLUS_BUS');
    assert.strictEqual(result.selectedPlan.segments.length, 2);
    assert.strictEqual(result.selectedPlan.segments[0].transportMode, 'flight');
    assert.strictEqual(result.selectedPlan.segments[1].transportMode, 'bus');

    await Trip.findByIdAndDelete(trip._id);
    await RecoverySession.deleteMany({ tripId: trip._id });
  });
});
