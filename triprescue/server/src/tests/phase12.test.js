const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const http = require('http');
const mongoose = require('mongoose');
const app = require('../app');
const Trip = require('../models/Trip');
const Notification = require('../models/Notification');
const InsuranceAnalysis = require('../models/InsuranceAnalysis');
const CompensationCase = require('../models/CompensationCase');

// Phase 12 modules
const InsuranceProvider = require('../providers/insurance/InsuranceProvider');
const MockInsuranceProvider = require('../providers/insurance/MockInsuranceProvider');
const CompensationProvider = require('../providers/compensation/CompensationProvider');
const MockCompensationProvider = require('../providers/compensation/MockCompensationProvider');
const { insuranceService } = require('../insurance');
const { compensationService } = require('../compensation');
const { getProvider } = require('../providers');
const toolRegistry = require('../agent/ToolRegistry');
const actionValidator = require('../agent/ActionValidator');
const actionExecutor = require('../agent/ActionExecutor');

describe('Phase 12: Insurance & Statutory Compensation Subsystem', () => {
  let server;
  let baseUrl;
  let testTripId;

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

    // Create a disrupted test trip with valid schema fields
    const trip = await Trip.create({
      passengerName: 'Sanjay Verma',
      passengerCount: 1,
      origin: 'DEL',
      destination: 'BOM',
      status: 'DISRUPTED',
      departureTime: new Date(Date.now() + 3600000),
      arrivalDeadline: new Date(Date.now() + 24 * 3600000),
      disruption: {
        type: 'FLIGHT_DELAYED',
        delayMinutes: 240,
        expectedImpact: 'Technical malfunction at gate',
      },
      itinerary: [
        {
          segmentId: 'SEG-P12-1',
          transportMode: 'flight',
          carrier: '6E',
          identifier: '6E-204',
          origin: {
            code: 'DEL',
            name: 'Indira Gandhi International Airport',
            airportCode: 'DEL',
            city: 'Delhi',
            country: 'India',
          },
          destination: {
            code: 'BOM',
            name: 'Chhatrapati Shivaji Maharaj International Airport',
            airportCode: 'BOM',
            city: 'Mumbai',
            country: 'India',
          },
          departure: new Date(Date.now() + 3600000),
          arrival: new Date(Date.now() + 10800000),
        },
      ],
    });
    testTripId = trip._id.toString();
  });

  after(async () => {
    if (testTripId) {
      await Trip.findByIdAndDelete(testTripId);
      await Notification.deleteMany({ tripId: testTripId });
      await InsuranceAnalysis.deleteMany({ tripId: testTripId });
      await CompensationCase.deleteMany({ tripId: testTripId });
    }
    if (server) {
      server.close();
    }
    await mongoose.disconnect();
  });

  // 1. InsuranceProvider base contract
  it('1. InsuranceProvider base class enforces abstract methods', async () => {
    const base = new InsuranceProvider();
    assert.strictEqual(base.name, 'InsuranceProvider');
    await assert.rejects(
      async () => base.analyzePolicy('test'),
      /must be implemented by subclass/
    );
  });

  // 2. MockInsuranceProvider analysis with applicable clauses
  it('2. MockInsuranceProvider analyzes policy text and classifies as POTENTIALLY_APPLICABLE for >= 4h delay', async () => {
    const provider = new MockInsuranceProvider();
    const policyDoc = 'Trip delay benefit: In case of delay exceeding 4 hours, coverage for meals up to $200.';
    const disruptionFacts = { delayMinutes: 240, disruptionType: 'FLIGHT_DELAYED' };

    const result = await provider.analyzePolicy(policyDoc, disruptionFacts);
    assert.strictEqual(result.status, 'POTENTIALLY_APPLICABLE');
    assert.ok(result.relevantClauses.length > 0);
    assert.ok(result.evidenceChecklist.length > 0);
    assert.match(result.disclaimer, /not a guarantee of coverage/i);
    // Strict prohibition check: Never returns APPROVED or COVERED
    assert.notStrictEqual(result.status, 'COVERED');
    assert.notStrictEqual(result.status, 'APPROVED');
    assert.notStrictEqual(result.status, 'ELIGIBLE');
  });

  // 3. MockInsuranceProvider handles short delays as UNCERTAIN or irrelevant text as NOT_FOUND
  it('3. MockInsuranceProvider returns UNCERTAIN or NOT_FOUND appropriately', async () => {
    const provider = new MockInsuranceProvider();
    // Delay below 4 hours
    const shortDelayResult = await provider.analyzePolicy(
      'Trip delay benefit: delay exceeding 4 hours is reimbursable.',
      { delayMinutes: 90, disruptionType: 'FLIGHT_DELAYED' }
    );
    assert.strictEqual(shortDelayResult.status, 'UNCERTAIN');

    // Irrelevant document
    const irrelevantResult = await provider.analyzePolicy(
      'This document only contains recipe instructions for pasta.',
      { delayMinutes: 300, disruptionType: 'FLIGHT_DELAYED' }
    );
    assert.strictEqual(irrelevantResult.status, 'NOT_FOUND');
  });

  // 4. Input sanitization & security limits
  it('4. InsuranceService enforces 1MB limit and sanitizes control characters', async () => {
    // 1MB limit check
    const oversizedText = 'A'.repeat(1024 * 1024 + 10);
    assert.throws(
      () => insuranceService.extractText(oversizedText),
      /exceeds maximum allowable size/
    );

    // Sanitization of prompt injection / control chars
    const dirtyText = 'Trip delay benefit\u0000\u0008: Meals covered after 4 hours.';
    const cleanText = insuranceService.extractText(dirtyText);
    assert.strictEqual(cleanText.includes('\u0000'), false);
    assert.strictEqual(cleanText.includes('\u0008'), false);

    const res = await insuranceService.analyze(testTripId, dirtyText);
    assert.ok(res);
    assert.ok(['POTENTIALLY_APPLICABLE', 'UNCERTAIN'].includes(res.status));
    const saved = await InsuranceAnalysis.findById(res._id);
    assert.ok(saved);
  });

  // 5. CompensationProvider base contract
  it('5. CompensationProvider base class enforces abstract methods', async () => {
    const base = new CompensationProvider();
    assert.strictEqual(base.name, 'CompensationProvider');
    await assert.rejects(
      async () => base.checkCompensation({}),
      /must be implemented by subclass/
    );
  });

  // 6. MockCompensationProvider evaluates DGCA CAR for Indian domestic flight
  it('6. MockCompensationProvider evaluates Indian DGCA CAR for domestic disruption', async () => {
    const provider = new MockCompensationProvider();
    const disruptionFacts = {
      carrier: '6E',
      flightNumber: '6E-204',
      origin: 'DEL',
      destination: 'BOM',
      disruptionType: 'FLIGHT_DELAYED',
      delayMinutes: 240,
    };
    const passengerInfo = { passengerName: 'Sanjay Verma' };

    const res = await provider.checkCompensation(disruptionFacts, passengerInfo);
    assert.ok(res.framework.includes('DGCA'));
    assert.strictEqual(res.status, 'POTENTIALLY_APPLICABLE');
    assert.ok(res.draftClaim.editableBody.includes('DGCA'));
    assert.ok(res.disclaimer.includes('informational'));
    // Strict prohibition check: Never returns APPROVED or COVERED
    assert.notStrictEqual(res.status, 'COVERED');
    assert.notStrictEqual(res.status, 'APPROVED');
    assert.notStrictEqual(res.status, 'ELIGIBLE');
  });

  // 7. MockCompensationProvider marks minor delay as UNCERTAIN / NOT_FOUND
  it('7. MockCompensationProvider classifies minor delay (< 60m) as NOT_FOUND or UNCERTAIN', async () => {
    const provider = new MockCompensationProvider();
    const res = await provider.checkCompensation({
      carrier: 'AI',
      flightNumber: 'AI-101',
      origin: 'DEL',
      destination: 'BOM',
      disruptionType: 'FLIGHT_DELAYED',
      delayMinutes: 30,
    });
    assert.strictEqual(res.status, 'NOT_FOUND');
  });

  // 8. CompensationService creates claim case & emits notification without auto-submitting
  it('8. CompensationService creates case, drafts notice, and emits COMPENSATION_REVIEW_READY', async () => {
    const res = await compensationService.check(testTripId);
    assert.ok(res);
    assert.ok(res.draftClaim.editableBody);
    assert.strictEqual(res.draftClaim.carrier, '6E');

    // Check DB record
    const saved = await CompensationCase.findById(res._id);
    assert.ok(saved);
    assert.ok(saved.framework.includes('DGCA'));

    // Check notification collection
    const notifs = await Notification.find({ tripId: testTripId, type: 'COMPENSATION_REVIEW_READY' });
    assert.ok(notifs.length > 0);
  });

  // 9. Tool calling integration: ToolRegistry, ActionValidator, ActionExecutor
  it('9. ToolRegistry exposes analyze_insurance and check_compensation tools', async () => {
    // Both tools exist in all tools
    const toolInsurance = toolRegistry.getToolByName('analyze_insurance');
    const toolComp = toolRegistry.getToolByName('check_compensation');
    assert.ok(toolInsurance, 'analyze_insurance tool exists');
    assert.ok(toolComp, 'check_compensation tool exists');

    // Check ActionValidator validation
    const validInsurance = actionValidator.validate({
      type: 'ANALYZE_INSURANCE',
      tool: 'insurance',
      parameters: { policyText: 'Sample policy document text' },
    });
    assert.strictEqual(validInsurance.valid, true);

    const validComp = actionValidator.validate({
      type: 'CHECK_COMPENSATION',
      tool: 'compensation',
      parameters: { disruptionFacts: { delayMinutes: 240, carrier: '6E' } },
    });
    assert.strictEqual(validComp.valid, true);

    // Check ActionExecutor execution
    const execComp = await actionExecutor.execute({
      type: 'CHECK_COMPENSATION',
      tool: 'compensation',
      parameters: {
        disruptionFacts: { delayMinutes: 240, carrier: '6E', origin: 'DEL', destination: 'BOM' },
        passengerInfo: { passengerName: 'Sanjay' },
      },
    });
    assert.strictEqual(execComp.success, true);
    assert.ok(execComp.data);
  });

  // 10. Provider Registry exposes insurance and compensation providers
  it('10. Provider registry returns registered insurance and compensation providers', () => {
    const insProvider = getProvider('insurance');
    const compProvider = getProvider('compensation');
    assert.ok(insProvider instanceof InsuranceProvider);
    assert.ok(compProvider instanceof CompensationProvider);
  });

  // 11. REST API: POST /api/insurance/analyze & GET /api/insurance/:tripId
  it('11. REST API handles POST /api/insurance/analyze and GET /api/insurance/:tripId', async () => {
    const postRes = await fetch(`${baseUrl}/api/insurance/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tripId: testTripId,
        policyText: 'Medical and Baggage delay benefits apply after 6 hours.',
      }),
    });
    assert.strictEqual(postRes.status, 200);
    const postData = await postRes.json();
    assert.strictEqual(postData.success, true);
    assert.ok(postData.data);

    const getRes = await fetch(`${baseUrl}/api/insurance/${testTripId}`);
    assert.strictEqual(getRes.status, 200);
    const getData = await getRes.json();
    assert.strictEqual(getData.success, true);
    assert.ok(getData.data);
  });

  // 12. REST API: POST /api/compensation/check & GET /api/compensation/:tripId
  it('12. REST API handles POST /api/compensation/check and GET /api/compensation/:tripId', async () => {
    const postRes = await fetch(`${baseUrl}/api/compensation/check`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tripId: testTripId }),
    });
    assert.strictEqual(postRes.status, 200);
    const postData = await postRes.json();
    assert.strictEqual(postData.success, true);
    assert.ok(postData.data);

    const getRes = await fetch(`${baseUrl}/api/compensation/${testTripId}`);
    assert.strictEqual(getRes.status, 200);
    const getData = await getRes.json();
    assert.strictEqual(getData.success, true);
    assert.ok(getData.data);
  });
});
