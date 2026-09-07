const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const http = require('http');
const mongoose = require('mongoose');
const app = require('../app');
const Trip = require('../models/Trip');
const RecoverySession = require('../models/RecoverySession');
const cascadeImpactEngine = require('../evaluation/CascadeImpactEngine');
const constraintValidator = require('../evaluation/ConstraintValidator');
const connectionValidator = require('../evaluation/ConnectionValidator');
const planEvaluator = require('../evaluation/PlanEvaluator');
const riskEngine = require('../evaluation/RiskEngine');
const simulationService = require('../simulation/SimulationService');
const recoveryPlanner = require('../agent/RecoveryPlanner');
const adaptationEngine = require('../agent/AdaptationEngine');

describe('Phase 2: Deterministic Recovery Engine + TripShield Core (Hardened)', () => {
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

    // Create the primary demo trip (Section 29)
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
          segmentId: 'SEG-001',
          transportMode: 'flight',
          origin: { code: 'BLR', type: 'airport' },
          destination: { code: 'DEL', type: 'airport' },
          departure: '2026-09-10T14:00:00+05:30',
          arrival: '2026-09-10T16:45:00+05:30',
          carrier: 'IndiGo',
          identifier: '6E 2341',
          status: 'CANCELLED',
        },
        {
          segmentId: 'SEG-002',
          transportMode: 'train',
          origin: { code: 'NDLS', type: 'railway_station' },
          destination: { code: 'JAI', type: 'railway_station' },
          departure: '2026-09-10T17:40:00+05:30',
          arrival: '2026-09-10T21:30:00+05:30',
          carrier: 'Indian Railways',
          identifier: 'Vande Bharat 20978',
          status: 'CONFIRMED',
        },
      ],
      disruption: {
        type: 'FLIGHT_CANCELLED',
        affectedSegmentId: 'SEG-001',
        description: 'Flight cancelled by carrier',
        detectedAt: new Date(),
        status: 'ACTIVE',
      },
    });

    const savedTrip = await trip.save();
    testTripId = savedTrip._id.toString();

    // Create associated RecoverySession in READY status
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
    await mongoose.disconnect();
  });

  // 1. Recovery starts from READY
  it('1. should verify RecoverySession starts from READY status', async () => {
    const session = await RecoverySession.findById(testSessionId);
    assert.strictEqual(session.status, 'READY');
  });

  // 2. Primary Demo Scenario: DIRECT_FLIGHT (₹7000 BUDGET_EXCEEDED) -> CONNECTING_FLIGHT (15m INSUFFICIENT_TRANSFER_TIME) -> FLIGHT_PLUS_TRAIN (₹4800 VALID)
  it('2. should run full autonomous recovery loop through API (Primary Demo Scenario)', async () => {
    const res = await fetch(`${baseUrl}/api/trips/${testTripId}/recovery/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ maxIterations: 10 }),
    });

    const body = await res.json();
    assert.strictEqual(res.status, 200);
    assert.strictEqual(body.success, true);

    const session = body.data;

    // Direct strategy selected initially for flight cancellation
    assert.ok(session.attemptedStrategies.includes('DIRECT_FLIGHT'));
    assert.strictEqual(session.attemptedStrategies[0], 'DIRECT_FLIGHT');

    // Budget failure causes rejection (Option A: ₹7,000 > ₹5,000 budget)
    const budgetFail = session.failures.find((f) => f.type === 'BUDGET_EXCEEDED');
    assert.ok(budgetFail, 'Should record BUDGET_EXCEEDED failure');
    assert.strictEqual(budgetFail.strategy, 'DIRECT_FLIGHT');

    // Budget failure triggers adaptation to CONNECTING_FLIGHT
    const firstAdapt = session.adaptationHistory[0];
    assert.ok(firstAdapt, 'Should record adaptation history');
    assert.strictEqual(firstAdapt.previousStrategy, 'DIRECT_FLIGHT');
    assert.strictEqual(firstAdapt.triggeredBy, 'BUDGET_EXCEEDED');
    assert.strictEqual(firstAdapt.newStrategy, 'CONNECTING_FLIGHT');
    assert.ok(session.attemptedStrategies.includes('CONNECTING_FLIGHT'));

    // Insufficient transfer time causes rejection (Option B: 15 min available < 90 min required)
    const transferFail = session.failures.find((f) => f.type === 'INSUFFICIENT_TRANSFER_TIME');
    assert.ok(transferFail, 'Should record INSUFFICIENT_TRANSFER_TIME failure');
    assert.strictEqual(transferFail.strategy, 'CONNECTING_FLIGHT');

    // Multimodal strategy succeeds (Option C: Flight + Train = ₹4,800 <= ₹5,000)
    assert.ok(session.attemptedStrategies.includes('FLIGHT_PLUS_TRAIN'));
    assert.ok(session.selectedPlan, 'Should have selected a recovery plan');
    assert.strictEqual(session.selectedPlan.strategy, 'FLIGHT_PLUS_TRAIN');
    assert.strictEqual(session.selectedPlan.status, 'SELECTED');
    assert.strictEqual(session.selectedPlan.hardConstraintsPassed, true);
    assert.strictEqual(session.selectedPlan.connectionsFeasible, true);
    assert.strictEqual(session.selectedPlan.totalCost, 4800);
    assert.ok(session.selectedPlan.totalCost <= 5000);

    // Invalid plans cannot become SELECTED
    assert.ok(session.rejectedPlans.length >= 2);
    for (const rejected of session.rejectedPlans) {
      assert.strictEqual(rejected.status, 'INVALID');
      assert.notStrictEqual(rejected.planId, session.selectedPlan.planId);
    }

    // Strategy history is recorded
    assert.deepStrictEqual(session.attemptedStrategies, [
      'DIRECT_FLIGHT',
      'CONNECTING_FLIGHT',
      'FLIGHT_PLUS_TRAIN',
    ]);

    // Failure history is recorded
    assert.strictEqual(session.failures.length, 2);

    // Reaches AWAITING_APPROVAL status
    assert.strictEqual(session.status, 'AWAITING_APPROVAL');
  });

  // 3. Event semantics: emits PLAN_VERIFIED, RECOVERY_PLAN_READY, AWAITING_APPROVAL, and NOT RECOVERY_COMPLETED
  it('3. should verify correct event lifecycle semantics (no premature RECOVERY_COMPLETED)', async () => {
    const session = await RecoverySession.findById(testSessionId);
    const eventTypes = session.agentEvents.map((e) => e.type);

    assert.ok(eventTypes.includes('PLAN_VERIFIED'), 'Must emit PLAN_VERIFIED');
    assert.ok(eventTypes.includes('RECOVERY_PLAN_READY'), 'Must emit RECOVERY_PLAN_READY');
    assert.ok(eventTypes.includes('AWAITING_APPROVAL'), 'Must emit AWAITING_APPROVAL');

    // Must NOT emit RECOVERY_COMPLETED because traveler has not approved yet
    assert.strictEqual(
      eventTypes.includes('RECOVERY_COMPLETED'),
      false,
      'Must NOT emit RECOVERY_COMPLETED prior to traveler approval'
    );
  });

  // 4. Connection Feasibility Formula: availableTransferTime >= physicalTransferDuration + minimumTransferBuffer
  it('4. should verify connection feasibility formula with exact buffer arithmetic', () => {
    // Case A: Valid connection (available = 120m, required = 60m + 30m buffer = 90m -> 120 >= 90)
    const seg1 = {
      segmentId: 'S1',
      transportMode: 'flight',
      destination: { code: 'DEL' },
      arrival: '2026-09-10T14:00:00.000Z',
    };
    const seg2Valid = {
      segmentId: 'S2',
      transportMode: 'flight',
      origin: { code: 'DEL' },
      departure: '2026-09-10T16:00:00.000Z', // 120 min available
    };
    const validCheck = connectionValidator.validateConnection(seg1, seg2Valid);
    assert.strictEqual(validCheck.status, 'VALID');
    assert.strictEqual(validCheck.availableMinutes, 120);
    assert.strictEqual(validCheck.requiredMinutes, 90); // 60 transfer + 30 buffer
    assert.strictEqual(validCheck.bufferMinutes, 30);

    // Case B: Invalid connection (available = 80m, required = 90m -> 80 < 90)
    const seg2Invalid = {
      segmentId: 'S3',
      transportMode: 'flight',
      origin: { code: 'DEL' },
      departure: '2026-09-10T15:20:00.000Z', // 80 min available
    };
    const invalidCheck = connectionValidator.validateConnection(seg1, seg2Invalid);
    assert.strictEqual(invalidCheck.status, 'INVALID');
    assert.strictEqual(invalidCheck.availableMinutes, 80);
    assert.strictEqual(invalidCheck.requiredMinutes, 90);
    assert.strictEqual(invalidCheck.failureType, 'INSUFFICIENT_TRANSFER_TIME');
  });

  // 5. Hard Constraints Priority: Hard constraint violation MUST invalidate plan regardless of score
  it('5. should reject high-scoring plan if it violates a hard constraint', () => {
    const invalidCandidate = {
      planId: 'PLAN-HIGH-SCORE-INVALID',
      strategy: 'DIRECT_FLIGHT',
      totalCost: 15000, // Budget is 5000 -> Exceeds budget!
      segments: [
        {
          segmentId: 'SEG-EXP',
          transportMode: 'flight',
          origin: { code: 'BLR' },
          destination: { code: 'JAI' },
          departure: '2026-09-10T14:00:00.000Z',
          arrival: '2026-09-10T16:00:00.000Z',
          price: { amount: 15000, currency: 'INR' },
        },
      ],
      finalArrivalTime: '2026-09-10T16:00:00.000Z',
    };

    const objective = {
      origin: 'BLR',
      destination: 'JAI',
      arrivalDeadline: '2026-09-10T22:00:00.000Z',
      maxAdditionalBudget: 5000,
    };

    const evaluated = planEvaluator.evaluate(invalidCandidate, objective);

    assert.strictEqual(evaluated.status, 'INVALID');
    assert.strictEqual(evaluated.hardConstraintsPassed, false);
    assert.strictEqual(evaluated.score, 0, 'Invalid plan must receive score 0');
    assert.strictEqual(evaluated.primaryFailureType, 'BUDGET_EXCEEDED');
  });

  // 6. Complete Journey Validation: Plan must cover complete route from origin to destination without geographic gaps
  it('6. should reject plan with incomplete journey or geographic disconnection', () => {
    const incompletePlan = {
      planId: 'PLAN-GAP',
      totalCost: 3000,
      segments: [
        {
          segmentId: 'S1',
          transportMode: 'flight',
          origin: { code: 'BLR' },
          destination: { code: 'DEL' }, // Ends at DEL
          departure: '2026-09-10T14:00:00.000Z',
          arrival: '2026-09-10T16:00:00.000Z',
        },
        {
          segmentId: 'S2',
          transportMode: 'flight',
          origin: { code: 'BOM' }, // Starts from BOM! Geographic gap!
          destination: { code: 'JAI' },
          departure: '2026-09-10T19:00:00.000Z',
          arrival: '2026-09-10T21:00:00.000Z',
        },
      ],
      finalArrivalTime: '2026-09-10T21:00:00.000Z',
    };

    const objective = { origin: 'BLR', destination: 'JAI', maxAdditionalBudget: 5000 };
    const evaluated = planEvaluator.evaluate(incompletePlan, objective);

    assert.strictEqual(evaluated.status, 'INVALID');
    assert.ok(evaluated.rejectionReasons.some((r) => r.includes('Geographic gap')));
  });

  // 7. State-Driven Strategy Selection: Train disruption initiates with TRAIN_ONLY; tight budget initiates with TRAIN_ONLY
  it('7. should dynamically select initial strategy based on observation state', () => {
    // Train disruption -> starts with TRAIN_ONLY
    const trainDisruptionObs = {
      disruptionType: 'TRAIN_CANCELLED',
      maxAdditionalBudget: 5000,
    };
    const strat1 = recoveryPlanner._selectInitialStrategy(trainDisruptionObs);
    assert.strictEqual(strat1, 'TRAIN_ONLY');

    // Very low budget (₹1,500) -> starts with TRAIN_ONLY
    const lowBudgetObs = {
      disruptionType: 'FLIGHT_CANCELLED',
      maxAdditionalBudget: 1500,
    };
    const strat2 = recoveryPlanner._selectInitialStrategy(lowBudgetObs);
    assert.strictEqual(strat2, 'TRAIN_ONLY');

    // Flight disruption with budget -> starts with DIRECT_FLIGHT
    const flightDisruptionObs = {
      disruptionType: 'FLIGHT_CANCELLED',
      maxAdditionalBudget: 5000,
    };
    const strat3 = recoveryPlanner._selectInitialStrategy(flightDisruptionObs);
    assert.strictEqual(strat3, 'DIRECT_FLIGHT');
  });

  // 8. TripShield RiskEngine properties: bounded 0-100, consistent levels, structured factors, no probability phrasing
  it('8. should verify TripShield RiskEngine properties and absence of probability phrasing', () => {
    const objective = { arrivalDeadline: '2026-09-10T22:00:00.000Z', maxAdditionalBudget: 5000 };
    const disruption = { type: 'FLIGHT_CANCELLED' };
    const plan = {
      finalArrivalTime: '2026-09-10T21:45:00.000Z',
      totalCost: 4800,
      transferCount: 1,
      connectionResults: [{ availableMinutes: 75, requiredMinutes: 60 }],
    };

    const risk = riskEngine.assess(plan, objective, disruption, [{ status: 'VALID' }]);

    // Bounded
    assert.ok(risk.score >= 0 && risk.score <= 100);
    assert.ok(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(risk.level));

    // Structured factors
    assert.ok(risk.factors, 'Must contain structured factors object');
    assert.strictEqual(risk.factors.disruptionSeverity, 'CRITICAL');
    assert.ok(typeof risk.factors.alternativePlanCount === 'number');

    // No probability phrasing in reasons
    for (const reason of risk.reasons) {
      assert.strictEqual(
        reason.toLowerCase().includes('probability'),
        false,
        'Risk reasons must NOT describe risk as probability'
      );
      assert.strictEqual(
        reason.toLowerCase().includes('% chance'),
        false,
        'Risk reasons must NOT claim statistical percentage chance'
      );
    }
  });

  // 9. Cascade impact identifies affected downstream segments and preserves original itinerary
  it('9. should identify affected downstream segments when flight is delayed without mutating original itinerary', () => {
    const originalItinerary = [
      {
        segmentId: 'SEG-A',
        transportMode: 'flight',
        carrier: 'IndiGo',
        identifier: '6E 101',
        departure: '2026-09-10T14:00:00.000Z',
        arrival: '2026-09-10T16:45:00.000Z',
      },
      {
        segmentId: 'SEG-B',
        transportMode: 'train',
        carrier: 'Indian Railways',
        identifier: '12015',
        departure: '2026-09-10T17:45:00.000Z',
        arrival: '2026-09-10T21:30:00.000Z',
      },
    ];

    const itineraryCopy = JSON.parse(JSON.stringify(originalItinerary));
    const disruption = { type: 'FLIGHT_DELAYED', affectedSegmentId: 'SEG-A' };

    const impact = cascadeImpactEngine.analyzeImpact(originalItinerary, disruption, 90, {
      arrivalDeadline: '2026-09-10T22:00:00.000Z',
    });

    assert.strictEqual(impact.hasImpact, true);
    assert.ok(impact.affectedSegments.length >= 2);
    assert.ok(impact.brokenConnections.length > 0);

    // Verify original itinerary object was NOT mutated
    assert.deepStrictEqual(originalItinerary, itineraryCopy);
  });

  // 10. SimulationService does not mutate actual MongoDB state
  it('10. should run what-if simulation without mutating actual session or trip state in MongoDB', async () => {
    const sessionBefore = await RecoverySession.findById(testSessionId).lean();
    const tripBefore = await Trip.findById(testTripId).lean();

    const res = await fetch(`${baseUrl}/api/recovery-sessions/${testSessionId}/simulate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'FLIGHT_DELAYED',
        delayMinutes: 60,
      }),
    });

    const body = await res.json();
    assert.strictEqual(res.status, 200);
    assert.strictEqual(body.success, true);
    assert.strictEqual(body.data.isSimulation, true);

    const sessionAfter = await RecoverySession.findById(testSessionId).lean();
    const tripAfter = await Trip.findById(testTripId).lean();

    // Verify exact state equality
    assert.strictEqual(sessionAfter.status, sessionBefore.status);
    assert.strictEqual(sessionAfter.candidatePlans.length, sessionBefore.candidatePlans.length);
    assert.strictEqual(sessionAfter.agentEvents.length, sessionBefore.agentEvents.length);
    assert.strictEqual(tripAfter.status, tripBefore.status);
  });

  // 11. Strategy exhaustion: transitions to FAILED when all options fail
  it('11. should transition to FAILED when all feasible strategies are exhausted', async () => {
    const impossibleSession = new RecoverySession({
      tripId: new mongoose.Types.ObjectId(),
      objective: {
        origin: 'BLR',
        destination: 'JAI',
        departureTime: '2026-09-10T14:00:00+05:30',
        arrivalDeadline: '2026-09-10T15:00:00+05:30', // 1-hour deadline
        maxAdditionalBudget: 50, // ₹50 budget
        passengerCount: 1,
        priority: 'arrival_time',
        riskTolerance: 'LOW',
      },
      currentItinerary: [],
      disruption: {
        type: 'FLIGHT_CANCELLED',
        description: 'Test impossible disruption',
        detectedAt: new Date(),
      },
      status: 'READY',
      maxIterations: 5,
    });

    const savedImpossible = await impossibleSession.save();
    const result = await recoveryPlanner.runRecovery(savedImpossible, 5);

    assert.ok(['FAILED', 'MAX_ITERATIONS'].includes(result.status));
    assert.strictEqual(result.selectedPlan, null);

    await RecoverySession.findByIdAndDelete(savedImpossible._id);
  });

  // 12. API endpoints: events timeline and plans
  it('12. should retrieve events timeline and candidate plans via API', async () => {
    const eventsRes = await fetch(`${baseUrl}/api/recovery-sessions/${testSessionId}/events`);
    const eventsBody = await eventsRes.json();
    assert.strictEqual(eventsRes.status, 200);
    assert.ok(eventsBody.count > 0);
    assert.ok(Array.isArray(eventsBody.data));

    const plansRes = await fetch(`${baseUrl}/api/recovery-sessions/${testSessionId}/plans`);
    const plansBody = await plansRes.json();
    assert.strictEqual(plansRes.status, 200);
    assert.ok(plansBody.data.selectedPlan);
    assert.strictEqual(plansBody.data.selectedPlan.strategy, 'FLIGHT_PLUS_TRAIN');
    assert.ok(plansBody.data.rejectedPlans.length >= 2);
  });
});
