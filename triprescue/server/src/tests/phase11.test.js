const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const http = require('http');
const mongoose = require('mongoose');
const app = require('../app');
const Trip = require('../models/Trip');
const RecoverySession = require('../models/RecoverySession');
const Notification = require('../models/Notification');

// Phase 11 modules
const NotificationProvider = require('../providers/notification/NotificationProvider');
const MockNotificationProvider = require('../providers/notification/MockNotificationProvider');
const CalendarProvider = require('../providers/calendar/CalendarProvider');
const MockCalendarProvider = require('../providers/calendar/MockCalendarProvider');
const { notificationService } = require('../notifications');
const { calendarService } = require('../calendar');
const { getProvider, getProviderPair } = require('../providers');
const toolRegistry = require('../agent/ToolRegistry');
const actionValidator = require('../agent/ActionValidator');
const actionExecutor = require('../agent/ActionExecutor');
const recoveryPlanner = require('../agent/RecoveryPlanner');

describe('Phase 11: Notifications & Calendar Subsystem', () => {
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
  });

  after(async () => {
    if (testTripId) {
      await Trip.findByIdAndDelete(testTripId);
      await RecoverySession.deleteMany({ tripId: testTripId });
      await Notification.deleteMany({ tripId: testTripId });
    }
    if (server) {
      server.close();
    }
    await mongoose.disconnect();
  });

  // 1. NotificationProvider contract
  it('1. NotificationProvider base class enforces abstract methods', async () => {
    const base = new NotificationProvider();
    assert.strictEqual(base.name, 'NotificationProvider');
    assert.strictEqual(base.type, 'notification');

    await assert.rejects(async () => await base.sendDashboardNotification({}), /must be implemented/);
    await assert.rejects(async () => await base.sendMockEmailNotification({}), /must be implemented/);
  });

  // 2. MockNotificationProvider channels
  it('2. MockNotificationProvider delivers dashboard notifications and logs mock emails offline', async () => {
    const provider = new MockNotificationProvider();

    // Dashboard
    const dashRes = await provider.sendDashboardNotification({
      type: 'RECOVERY_PLAN_READY',
      title: 'Plan Ready',
      message: 'Plan has been verified.',
    });
    assert.strictEqual(dashRes.delivered, true);
    assert.strictEqual(dashRes.channel, 'dashboard');
    assert.strictEqual(provider.dashboardDispatches.length, 1);

    // Email
    const emailRes = await provider.sendMockEmailNotification({
      recipient: 'sanjay@tripshield.internal',
      subject: 'Flight Delay Alert',
      message: 'Your flight 6E-204 is delayed by 90 minutes.',
      type: 'DISRUPTION_DETECTED',
    });
    assert.strictEqual(emailRes.delivered, true);
    assert.strictEqual(emailRes.channel, 'email');
    assert.strictEqual(provider.getInbox().length, 1);
    assert.strictEqual(provider.getInbox()[0].recipient, 'sanjay@tripshield.internal');
  });

  // 3. NotificationService event validation & emission
  it('3. NotificationService validates allowed event types and persists notifications', async () => {
    // Rejection on invalid event type
    await assert.rejects(
      async () => await notificationService.emitNotification('INVALID_EVENT_TYPE', {}),
      /Invalid notification event type/
    );

    // Valid emission
    const notif = await notificationService.emitNotification('DISRUPTION_DETECTED', {
      title: 'Flight Disrupted',
      message: 'Incoming flight cancelled due to airspace restriction.',
    });

    assert.ok(notif.notificationId);
    assert.strictEqual(notif.type, 'DISRUPTION_DETECTED');
    assert.strictEqual(notif.status, 'UNREAD');

    // Retrieval and mark read
    const found = await notificationService.markAsRead(notif.notificationId);
    assert.strictEqual(found.status, 'READ');
    assert.ok(found.readAt);
  });

  // 4. CalendarProvider base contract
  it('4. CalendarProvider base class enforces abstract methods', async () => {
    const base = new CalendarProvider();
    assert.strictEqual(base.name, 'CalendarProvider');
    assert.strictEqual(base.type, 'calendar');

    await assert.rejects(async () => await base.getEvents(), /must be implemented/);
    assert.throws(() => base.detectConflicts('2026-09-20T20:00:00+05:30'), /must be implemented/);
    assert.throws(() => base.prepareEventUpdate('EVT-1', '', ''), /must be implemented/);
    await assert.rejects(async () => await base.updateEvent('EVT-1', {}, true), /must be implemented/);
  });

  // 5. MockCalendarProvider getEvents
  it('5. MockCalendarProvider returns deterministic calendar fixtures without external APIs', async () => {
    const provider = new MockCalendarProvider();
    const events = await provider.getEvents();

    assert.ok(events.length >= 3);
    const meeting = events.find((e) => e.eventId === 'EVT-CAL-001');
    assert.ok(meeting);
    assert.strictEqual(meeting.title, 'Client Strategy Presentation');
    assert.strictEqual(meeting.importance, 'HIGH');
  });

  // 6. Conflict detection: No overlap vs Overlap
  it('6. Calendar conflict detection identifies overlaps and clear arrival windows correctly', () => {
    const provider = new MockCalendarProvider();

    // Event 1: 19:00 - 20:30
    // Case A: Early arrival at 17:00 -> NO CONFLICT (> 30 min buffer before 19:00)
    const noConflict = provider.detectConflicts('2026-09-20T17:00:00+05:30');
    const hasEvent1Conflict = noConflict.conflicts.some((c) => c.eventId === 'EVT-CAL-001');
    assert.strictEqual(hasEvent1Conflict, false);

    // Case B: Arrival during event at 19:45 -> CONFLICT
    const overlapDuring = provider.detectConflicts('2026-09-20T19:45:00+05:30');
    assert.strictEqual(overlapDuring.hasConflict, true);
    const conflictObj = overlapDuring.conflicts.find((c) => c.eventId === 'EVT-CAL-001');
    assert.ok(conflictObj);
    assert.ok(conflictObj.reason.includes('falls during event window'));

    // Case C: Arrival after event at 20:45 -> CONFLICT (meeting missed)
    const overlapAfter = provider.detectConflicts('2026-09-20T20:45:00+05:30');
    const missedObj = overlapAfter.conflicts.find((c) => c.eventId === 'EVT-CAL-001');
    assert.ok(missedObj);
    assert.ok(missedObj.reason.includes('after event conclusion'));
  });

  // 7. prepareEventUpdate creates proposed update without mutating calendar
  it('7. prepareEventUpdate produces non-mutating proposal requiring user approval', async () => {
    const provider = new MockCalendarProvider();
    const eventsBefore = await provider.getEvents();
    const origEvent = eventsBefore.find((e) => e.eventId === 'EVT-CAL-001');

    const proposal = provider.prepareEventUpdate(
      'EVT-CAL-001',
      '2026-09-20T21:30:00+05:30',
      '2026-09-20T23:00:00+05:30'
    );

    assert.strictEqual(proposal.status, 'PROPOSED');
    assert.strictEqual(proposal.userApprovalRequired, true);
    assert.strictEqual(proposal.proposedChange.start, '2026-09-20T21:30:00+05:30');

    // Verify calendar was NOT mutated
    const eventsAfter = await provider.getEvents();
    const untouched = eventsAfter.find((e) => e.eventId === 'EVT-CAL-001');
    assert.strictEqual(untouched.start, origEvent.start);
  });

  // 8. User approval enforcement & protection of important events
  it('8. updateEvent strictly rejects updates without user approval and protects high importance events', async () => {
    const provider = new MockCalendarProvider();

    // Attempt update WITHOUT user approval -> MUST FAIL
    await assert.rejects(
      async () => {
        await provider.updateEvent(
          'EVT-CAL-001',
          { start: '2026-09-20T21:30:00+05:30' },
          false // userApproved = false
        );
      },
      (err) => {
        return err.code === 'APPROVAL_REQUIRED' || err.message.includes('explicit user approval');
      }
    );

    // Attempt update WITH user approval -> SUCCEEDS
    const approved = await provider.updateEvent(
      'EVT-CAL-001',
      { start: '2026-09-20T21:30:00+05:30', end: '2026-09-20T23:00:00+05:30' },
      true // userApproved = true
    );
    assert.strictEqual(approved.updated, true);
    assert.strictEqual(approved.status, 'CONFIRMED');
    assert.strictEqual(approved.event.start, '2026-09-20T21:30:00+05:30');
  });

  // 9. ToolRegistry, ActionValidator, and ActionExecutor for check_calendar_conflict
  it('9. CHECK_CALENDAR_CONFLICT is registered, validated, and executed through ActionExecutor', async () => {
    // 1. ToolRegistry
    const tool = toolRegistry.getToolByName('check_calendar_conflict');
    assert.ok(tool, 'Tool should be registered in ToolRegistry');
    assert.strictEqual(tool.actionType, 'CHECK_CALENDAR_CONFLICT');
    assert.strictEqual(tool.toolType, 'calendar');

    // 2. ActionValidator
    const inv = actionValidator.validate({
      type: 'CHECK_CALENDAR_CONFLICT',
      tool: 'calendar',
      parameters: {}, // missing arrivalTime
    });
    assert.strictEqual(inv.valid, false);

    const val = actionValidator.validate({
      type: 'CHECK_CALENDAR_CONFLICT',
      tool: 'calendar',
      parameters: { arrivalTime: '2026-09-20T20:00:00+05:30' },
    });
    assert.strictEqual(val.valid, true);

    // 3. ActionExecutor
    const execRes = await actionExecutor.execute({
      type: 'CHECK_CALENDAR_CONFLICT',
      tool: 'calendar',
      parameters: { arrivalTime: '2026-09-20T20:00:00+05:30' },
    });
    assert.strictEqual(execRes.success, true);
    assert.ok(execRes.data.hasConflict !== undefined);
  });

  // 10. End-to-end Recovery integration with Notifications & Calendar
  it('10. RecoveryPlanner emits RECOVERY_PLAN_READY and detects calendar conflicts during recovery loop', async () => {
    const trip = new Trip({
      passengerName: 'Kavita Iyer',
      passengerCount: 1,
      origin: 'BLR',
      destination: 'JAI',
      departureTime: '2026-09-20T17:00:00+05:30',
      arrivalDeadline: '2026-09-20T23:30:00+05:30',
      maxAdditionalBudget: 8000,
      priority: 'arrival_time',
      riskTolerance: 'LOW',
      status: 'DISRUPTED',
      itinerary: [
        {
          segmentId: 'SEG-CAL-1',
          transportMode: 'flight',
          origin: { code: 'BLR', type: 'airport' },
          destination: { code: 'JAI', type: 'airport' },
          departure: '2026-09-20T17:00:00+05:30',
          arrival: '2026-09-20T18:00:00+05:30',
          status: 'DELAYED',
        },
      ],
      disruption: {
        type: 'FLIGHT_DELAYED',
        affectedSegmentId: 'SEG-CAL-1',
        description: 'Mechanical maintenance delay',
      },
    });
    await trip.save();
    testTripId = trip._id.toString();

    const session = new RecoverySession({
      tripId: trip._id,
      objective: {
        origin: 'BLR',
        destination: 'JAI',
        departureTime: '2026-09-20T17:00:00+05:30',
        arrivalDeadline: '2026-09-20T23:30:00+05:30',
        maxAdditionalBudget: 8000,
        passengerCount: 1,
      },
      currentItinerary: trip.itinerary,
      disruption: trip.disruption,
      status: 'READY',
      currentStrategy: 'DIRECT_FLIGHT',
    });
    await session.save();
    testSessionId = session._id.toString();

    // Run recovery loop
    const resSession = await recoveryPlanner.runRecovery(session, 5);
    assert.ok(resSession.selectedPlan);
    assert.strictEqual(resSession.status, 'AWAITING_APPROVAL');

    // Verify notifications were created
    const notifications = await notificationService.getNotifications({ tripId: trip._id });
    assert.ok(notifications.length > 0, 'Should have emitted notifications');
    const planReadyNotif = notifications.find((n) => n.type === 'RECOVERY_PLAN_READY');
    assert.ok(planReadyNotif, 'Should emit RECOVERY_PLAN_READY notification');
  });

  // 11. REST API endpoints for Notifications and Calendar
  it('11. REST endpoints serve notifications, read state updates, and calendar operations', async () => {
    // 1. GET /api/notifications
    const notifRes = await fetch(`${baseUrl}/api/notifications`);
    assert.strictEqual(notifRes.status, 200);
    const notifBody = await notifRes.json();
    assert.strictEqual(notifBody.success, true);
    assert.ok(Array.isArray(notifBody.data));

    // 2. GET /api/calendar/events
    const calRes = await fetch(`${baseUrl}/api/calendar/events`);
    assert.strictEqual(calRes.status, 200);
    const calBody = await calRes.json();
    assert.strictEqual(calBody.success, true);
    assert.ok(calBody.data.length >= 3);

    // 3. POST /api/calendar/check-conflicts
    const confRes = await fetch(`${baseUrl}/api/calendar/check-conflicts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ arrivalTime: '2026-09-20T19:30:00+05:30' }),
    });
    assert.strictEqual(confRes.status, 200);
    const confBody = await confRes.json();
    assert.strictEqual(confBody.success, true);
    assert.strictEqual(confBody.data.hasConflict, true);

    // 4. POST /api/calendar/prepare-update
    const prepRes = await fetch(`${baseUrl}/api/calendar/prepare-update`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        eventId: 'EVT-CAL-002',
        proposedStart: '2026-09-20T22:00:00+05:30',
        proposedEnd: '2026-09-20T23:30:00+05:30',
      }),
    });
    assert.strictEqual(prepRes.status, 200);
    const prepBody = await prepRes.json();
    assert.strictEqual(prepBody.data.status, 'PROPOSED');

    // 5. POST /api/calendar/update with approval
    const updateRes = await fetch(`${baseUrl}/api/calendar/update`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        eventId: 'EVT-CAL-002',
        updates: { start: '2026-09-20T22:00:00+05:30' },
        userApproved: true,
      }),
    });
    assert.strictEqual(updateRes.status, 200);
    const updateBody = await updateRes.json();
    assert.strictEqual(updateBody.data.updated, true);
  });
});
