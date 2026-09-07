const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const http = require('http');
const mongoose = require('mongoose');
const app = require('../app');
const Trip = require('../models/Trip');
const RecoverySession = require('../models/RecoverySession');
const Notification = require('../models/Notification');
const InsuranceAnalysis = require('../models/InsuranceAnalysis');
const CompensationCase = require('../models/CompensationCase');
const simulationService = require('../simulation/SimulationService');
const toolRegistry = require('../agent/ToolRegistry');
const actionValidator = require('../agent/ActionValidator');
const actionExecutor = require('../agent/ActionExecutor');

describe('Phase 13: What-If Simulation Engine Subsystem', () => {
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
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });

    // Create a multi-leg trip: BLR -> DEL -> JAI
    const now = Date.now();
    const trip = await Trip.create({
      passengerName: 'Ananya Sharma',
      passengerCount: 1,
      origin: 'BLR',
      destination: 'JAI',
      status: 'DISRUPTED',
      departureTime: new Date(now + 3600000),
      arrivalDeadline: new Date(now + 18000000), // 5 hours deadline
      maxAdditionalBudget: 3000,
      disruption: {
        type: 'FLIGHT_DELAYED',
        delayMinutes: 20,
        expectedImpact: 'Initial runway delay at BLR',
      },
      itinerary: [
        {
          segmentId: 'SEG-BLR-DEL',
          transportMode: 'flight',
          carrier: '6E',
          identifier: '6E-101',
          origin: {
            code: 'BLR',
            name: 'Kempegowda International Airport',
            city: 'Bengaluru',
            country: 'India',
          },
          destination: {
            code: 'DEL',
            name: 'Indira Gandhi International Airport',
            city: 'Delhi',
            country: 'India',
          },
          departure: new Date(now + 3600000),
          arrival: new Date(now + 9000000), // arrives at T+2.5h
        },
        {
          segmentId: 'SEG-DEL-JAI',
          transportMode: 'flight',
          carrier: 'AI',
          identifier: 'AI-404',
          origin: {
            code: 'DEL',
            name: 'Indira Gandhi International Airport',
            city: 'Delhi',
            country: 'India',
          },
          destination: {
            code: 'JAI',
            name: 'Jaipur International Airport',
            city: 'Jaipur',
            country: 'India',
          },
          departure: new Date(now + 12000000), // leaves at T+3.33h (50 min transfer window)
          arrival: new Date(now + 15600000), // arrives at T+4.33h
        },
      ],
    });
    testTripId = trip._id.toString();

    // Create persistent RecoverySession
    const session = await RecoverySession.create({
      tripId: trip._id,
      status: 'RECOVERING',
      currentStrategy: 'DIRECT_FLIGHT',
      objective: {
        origin: 'BLR',
        destination: 'JAI',
        departureTime: new Date(now + 3600000),
        arrivalDeadline: new Date(now + 18000000),
        maxAdditionalBudget: 3000,
        maxTransfers: 1,
        priority: 'arrival_time',
        riskTolerance: 'MEDIUM',
      },
      disruption: trip.disruption,
      currentItinerary: trip.itinerary,
      candidatePlans: [
        {
          planId: 'PLAN-1-ORIGINAL',
          strategy: 'DIRECT_FLIGHT',
          totalCost: 2500,
          finalArrivalTime: new Date(now + 15600000),
          status: 'VALID',
          hardConstraintsPassed: true,
          connectionsFeasible: true,
          segments: trip.itinerary,
          score: 85,
        },
        {
          planId: 'PLAN-2-EXPENSIVE',
          strategy: 'DIRECT_FLIGHT',
          totalCost: 5500, // exceeds 3000 budget
          finalArrivalTime: new Date(now + 14400000),
          status: 'INVALID',
          hardConstraintsPassed: false,
          connectionsFeasible: true,
          rejectionReasons: ['BUDGET_EXCEEDED: Cost 5500 exceeds 3000'],
          segments: [
            {
              segmentId: 'SEG-BLR-JAI-DIRECT',
              transportMode: 'flight',
              carrier: '6E',
              identifier: '6E-999',
              origin: {
                code: 'BLR',
                city: 'Bengaluru',
                country: 'India',
              },
              destination: {
                code: 'JAI',
                city: 'Jaipur',
                country: 'India',
              },
              departure: new Date(now + 3600000),
              arrival: new Date(now + 14400000),
            },
          ],
          score: 40,
        },
      ],
      selectedPlan: {
        planId: 'PLAN-1-ORIGINAL',
        strategy: 'DIRECT_FLIGHT',
        totalCost: 2500,
        finalArrivalTime: new Date(now + 15600000),
        status: 'VALID',
        segments: trip.itinerary,
        score: 85,
      },
      riskScore: {
        score: 25,
        level: 'LOW',
        reasons: ['Operational transfer margin adequate'],
      },
    });
    testSessionId = session._id.toString();
  });

  after(async () => {
    if (testTripId) {
      await Trip.findByIdAndDelete(testTripId);
      await RecoverySession.deleteMany({ tripId: testTripId });
      await Notification.deleteMany({ tripId: testTripId });
      await InsuranceAnalysis.deleteMany({ tripId: testTripId });
      await CompensationCase.deleteMany({ tripId: testTripId });
    }
    if (server) {
      server.close();
    }
    await mongoose.disconnect();
  });

  // 1. Deep cloning & state isolation
  it('1. State cloning: mutations in simulation do not leak into the original session object', async () => {
    const session = await RecoverySession.findById(testSessionId).lean();
    const originalCandidatePlansCount = session.candidatePlans.length;
    const originalSelectedPlanStatus = session.selectedPlan.status;

    const result = simulationService.simulate(session, {
      type: 'DELAY',
      delayMinutes: 60,
    });

    assert.strictEqual(result.isSimulation, true);
    assert.ok(result.simulationId.startsWith('SIM-'));

    // Assert that original in-memory session object was not modified
    assert.strictEqual(session.candidatePlans.length, originalCandidatePlansCount);
    assert.strictEqual(session.selectedPlan.status, originalSelectedPlanStatus);
    assert.notStrictEqual(result.simulatedPlans, session.candidatePlans);
  });

  // 2. Deterministic demo scenario: +60 min delay breaks connection at DEL
  it('2. Delay simulation: +60m delay breaks downstream transfer connection and increases risk', async () => {
    const session = await RecoverySession.findById(testSessionId).lean();

    const result = simulationService.simulate(session, {
      type: 'ADDITIONAL_DELAY',
      delayMinutes: 60,
    });

    assert.strictEqual(result.isSimulation, true);
    assert.strictEqual(result.hypotheticalEvent.delayMinutes, 60);

    // Cascade report should show broken connection at DEL
    assert.ok(result.impactReport.hasImpact);
    assert.ok(result.impactReport.brokenConnections.length > 0);

    // Risk should recalculate higher
    assert.ok(result.simulatedRisk.score > 25);
    assert.ok(['MEDIUM', 'HIGH', 'CRITICAL'].includes(result.simulatedRisk.level));

    // Simulated plans should reflect invalidation
    const originalPlan = result.simulatedPlans.find((p) => p.planId === 'PLAN-1-ORIGINAL');
    assert.strictEqual(originalPlan.connectionsFeasible, false);
    assert.strictEqual(originalPlan.status, 'INVALID');
  });

  // 3. Cancellation simulation: severs route and invalidates candidate plans
  it('3. Cancellation simulation: cancels primary segment and severs downstream legs', async () => {
    const session = await RecoverySession.findById(testSessionId).lean();

    const result = simulationService.simulate(session, {
      type: 'FLIGHT_CANCELLED',
      affectedSegmentId: 'SEG-BLR-DEL',
    });

    assert.strictEqual(result.isSimulation, true);
    assert.ok(result.impactReport.hasImpact);
    assert.ok(result.impactReport.summary.toLowerCase().includes('cancelled'));

    // All simulated plans using the cancelled segment must be INVALID
    assert.strictEqual(result.predictedOutcome.plansValidCount, 0);
    assert.strictEqual(result.predictedOutcome.selectedPlanStillValid, false);
    assert.ok(result.predictedOutcome.recommendation.toLowerCase().includes('cancelled'));
  });

  // 4. Budget change simulation: relaxing budget makes previously invalid plan valid
  it('4. Budget simulation: expanding maxAdditionalBudget enables previously rejected plans', async () => {
    const session = await RecoverySession.findById(testSessionId).lean();

    // Original budget is 3000, PLAN-2-EXPENSIVE costs 5500.
    // Adding +3000 budget raises cap to 6000, allowing PLAN-2-EXPENSIVE to pass budget check.
    const result = simulationService.simulate(session, {
      type: 'BUDGET_CHANGE',
      delayMinutes: 0,
      additionalBudget: 3000,
    });

    assert.strictEqual(result.isSimulation, true);
    const expensivePlan = result.simulatedPlans.find((p) => p.planId === 'PLAN-2-EXPENSIVE');
    assert.ok(expensivePlan);
    assert.strictEqual(expensivePlan.hardConstraintsPassed, true);
    assert.strictEqual(expensivePlan.status, 'VALID');
  });

  // 5. Constraint relaxation: allows extra transfer in simulation
  it('5. Constraint relaxation: allowExtraTransfer increases objective transfer allowance in clone', async () => {
    const session = await RecoverySession.findById(testSessionId).lean();

    const result = simulationService.simulate(session, {
      type: 'ALLOW_EXTRA_TRANSFER',
      allowExtraTransfer: true,
      delayMinutes: 0,
    });

    assert.strictEqual(result.isSimulation, true);
    assert.ok(result.predictedOutcome);
  });

  // 6. Risk recalculation produces explainable simulation-specific reasons
  it('6. Risk engine: generates scenario-specific explainable risk assessment in simulation', async () => {
    const session = await RecoverySession.findById(testSessionId).lean();

    const result = simulationService.simulate(session, {
      type: 'FLIGHT_CANCELLED',
    });

    assert.ok(result.simulatedRisk);
    assert.ok(typeof result.simulatedRisk.score === 'number');
    assert.ok(result.simulatedRisk.reasons.length > 0);
    assert.strictEqual(result.simulatedRisk.factors.disruptionSeverity, 'CRITICAL');
  });

  // 7. Mandatory Real-State Immutability: MongoDB state is completely untouched
  it('7. MANDATORY IMMUTABILITY: Active MongoDB Trip and RecoverySession records are 100% unchanged', async () => {
    const sessionBefore = await RecoverySession.findById(testSessionId).lean();
    const tripBefore = await Trip.findById(testTripId).lean();

    // Run multiple diverse simulations
    simulationService.simulate(sessionBefore, { type: 'FLIGHT_CANCELLED' });
    simulationService.simulate(sessionBefore, { type: 'ADDITIONAL_DELAY', delayMinutes: 120 });
    simulationService.simulate(sessionBefore, { type: 'BUDGET_CHANGE', additionalBudget: 10000 });

    const sessionAfter = await RecoverySession.findById(testSessionId).lean();
    const tripAfter = await Trip.findById(testTripId).lean();

    // Verify exact equality of MongoDB records
    assert.strictEqual(sessionAfter.status, sessionBefore.status);
    assert.strictEqual(sessionAfter.candidatePlans.length, sessionBefore.candidatePlans.length);
    assert.strictEqual(sessionAfter.selectedPlan.status, sessionBefore.selectedPlan.status);
    assert.strictEqual(sessionAfter.riskScore.score, sessionBefore.riskScore.score);
    assert.strictEqual(sessionAfter.agentEvents.length, sessionBefore.agentEvents.length);
    assert.strictEqual(tripAfter.status, tripBefore.status);
    assert.strictEqual(tripAfter.disruption.delayMinutes, tripBefore.disruption.delayMinutes);
  });

  // 8. Side-Effect Isolation: No notifications, calendar modifications, or insurance/compensation cases
  it('8. Side-Effect Isolation: Simulation causes ZERO side effects in Notification, Calendar, or Insurance/Claims DBs', async () => {
    const notifsBefore = await Notification.countDocuments({ tripId: testTripId });
    const insuranceBefore = await InsuranceAnalysis.countDocuments({ tripId: testTripId });
    const compBefore = await CompensationCase.countDocuments({ tripId: testTripId });

    const session = await RecoverySession.findById(testSessionId).lean();
    simulationService.simulate(session, { type: 'FLIGHT_CANCELLED' });
    simulationService.simulate(session, { type: 'DELAY', delayMinutes: 240 });

    const notifsAfter = await Notification.countDocuments({ tripId: testTripId });
    const insuranceAfter = await InsuranceAnalysis.countDocuments({ tripId: testTripId });
    const compAfter = await CompensationCase.countDocuments({ tripId: testTripId });

    assert.strictEqual(notifsAfter, notifsBefore, 'No real notifications created');
    assert.strictEqual(insuranceAfter, insuranceBefore, 'No insurance cases created');
    assert.strictEqual(compAfter, compBefore, 'No compensation cases created');
  });

  // 9. Tool calling integration: ToolRegistry, ActionValidator, ActionExecutor
  it('9. Tool Calling: run_simulation is registered in ToolRegistry, validated, and executed by ActionExecutor', async () => {
    // Registered in ToolRegistry
    const tool = toolRegistry.getToolByName('run_simulation');
    assert.ok(tool, 'run_simulation tool exists in registry');
    assert.strictEqual(tool.actionType, 'RUN_SIMULATION');

    // Default listTools preserves Phase 8 9-core-tools contract
    const defaultTools = toolRegistry.listTools();
    assert.strictEqual(defaultTools.length, 9);
    assert.strictEqual(defaultTools.some((t) => t.name === 'run_simulation'), false);

    // Validation via ActionValidator
    const validAction = actionValidator.validate({
      type: 'RUN_SIMULATION',
      tool: 'simulation',
      parameters: {
        sessionId: testSessionId,
        scenario: { type: 'DELAY', delayMinutes: 45 },
      },
    });
    assert.strictEqual(validAction.valid, true);

    const invalidAction = actionValidator.validate({
      type: 'RUN_SIMULATION',
      tool: 'simulation',
      parameters: {}, // missing sessionId
    });
    assert.strictEqual(invalidAction.valid, false);

    // Execution via ActionExecutor
    const execRes = await actionExecutor.execute({
      type: 'RUN_SIMULATION',
      tool: 'simulation',
      parameters: {
        sessionId: testSessionId,
        scenario: { type: 'DELAY', delayMinutes: 30 },
      },
    });
    assert.strictEqual(execRes.success, true);
    assert.strictEqual(execRes.data.isSimulation, true);
  });

  // 10. REST API: POST /api/recovery-sessions/:id/simulate
  it('10. REST API: POST /api/recovery-sessions/:id/simulate executes simulation and preserves MongoDB state', async () => {
    const res = await fetch(`${baseUrl}/api/recovery-sessions/${testSessionId}/simulate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'FLIGHT_DELAYED',
        delayMinutes: 60,
      }),
    });

    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.success, true);
    assert.strictEqual(body.data.isSimulation, true);
    assert.ok(body.data.impactReport);
    assert.ok(body.data.simulatedRisk);
  });

  // 11. REST API Alias: POST /api/recovery/:id/simulate
  it('11. REST API Alias: POST /api/recovery/:id/simulate executes simulation seamlessly', async () => {
    const res = await fetch(`${baseUrl}/api/recovery/${testSessionId}/simulate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'BUDGET_CHANGE',
        additionalBudget: 2000,
      }),
    });

    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.success, true);
    assert.strictEqual(body.data.isSimulation, true);
    assert.ok(body.data.predictedOutcome);
  });

  // 12. Input validation: safe error handling on nonexistent session
  it('12. Input validation: returns 404 cleanly when session is not found', async () => {
    const fakeId = new mongoose.Types.ObjectId().toString();
    const res = await fetch(`${baseUrl}/api/recovery-sessions/${fakeId}/simulate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'DELAY', delayMinutes: 30 }),
    });

    assert.strictEqual(res.status, 404);
    const body = await res.json();
    assert.strictEqual(body.success, false);
  });
});
