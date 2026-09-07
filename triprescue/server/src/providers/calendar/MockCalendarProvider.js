const CalendarProvider = require('./CalendarProvider');

/**
 * MockCalendarProvider — Phase 11 Deterministic Mock Calendar.
 * Provides deterministic calendar fixtures, strictly non-mutating
 * conflict detection, and user-approval enforced mutations.
 */
class MockCalendarProvider extends CalendarProvider {
  constructor() {
    super('MockCalendarProvider');
    this._resetEvents();
  }

  _resetEvents() {
    // Deterministic base events for testing and demo flows
    this.events = [
      {
        eventId: 'EVT-CAL-001',
        title: 'Client Strategy Presentation',
        start: '2026-09-20T19:00:00+05:30',
        end: '2026-09-20T20:30:00+05:30',
        timezone: 'Asia/Kolkata',
        location: 'Jaipur Marriott & Online',
        importance: 'HIGH',
        status: 'ACTIVE',
      },
      {
        eventId: 'EVT-CAL-002',
        title: 'Dinner with Regional Partners',
        start: '2026-09-20T21:00:00+05:30',
        end: '2026-09-20T22:30:00+05:30',
        timezone: 'Asia/Kolkata',
        location: 'Tonk Road, Jaipur',
        importance: 'NORMAL',
        status: 'ACTIVE',
      },
      {
        eventId: 'EVT-CAL-003',
        title: 'Quarterly Executive Review',
        start: '2026-09-21T09:00:00+05:30',
        end: '2026-09-21T11:00:00+05:30',
        timezone: 'Asia/Kolkata',
        location: 'Boardroom B, Jaipur',
        importance: 'CRITICAL',
        status: 'ACTIVE',
      },
    ];
  }

  /**
   * Retrieve active calendar events for a traveler/session.
   * @param {Object} criteria
   * @returns {Promise<Array<Object>>}
   */
  async getEvents(criteria = {}) {
    return [...this.events];
  }

  /**
   * Detect scheduling conflicts between candidate recovery arrival and calendar events.
   * Pure, deterministic, non-mutating.
   * @param {string|Date} recoveryArrival
   * @param {Array<Object>} [events]
   * @returns {{ hasConflict: boolean, conflicts: Array<Object> }}
   */
  detectConflicts(recoveryArrival, events = null) {
    if (!recoveryArrival) {
      return { hasConflict: false, conflicts: [] };
    }

    const arrivalMs = new Date(recoveryArrival).getTime();
    const eventList = events || this.events;
    const conflicts = [];

    for (const evt of eventList) {
      const startMs = new Date(evt.start).getTime();
      const endMs = new Date(evt.end).getTime();

      // Overlap condition 1: Arrival happens during the event
      const arrivalDuringEvent = arrivalMs > startMs && arrivalMs < endMs;
      // Overlap condition 2: Arrival happens after the event has already ended
      const arrivalAfterEventEnded = arrivalMs >= endMs;
      // Overlap condition 3: Insufficient buffer (< 30 mins) before event start
      const insufficientBuffer = arrivalMs <= startMs && (startMs - arrivalMs < 30 * 60 * 1000);

      if (arrivalDuringEvent || arrivalAfterEventEnded || insufficientBuffer) {
        let reason = '';
        if (arrivalDuringEvent) {
          reason = `Recovery arrival (${new Date(arrivalMs).toLocaleTimeString()}) falls during event window (${new Date(startMs).toLocaleTimeString()} - ${new Date(endMs).toLocaleTimeString()})`;
        } else if (arrivalAfterEventEnded) {
          reason = `Recovery arrival (${new Date(arrivalMs).toLocaleTimeString()}) occurs after event conclusion (${new Date(endMs).toLocaleTimeString()})`;
        } else {
          reason = `Insufficient physical transfer buffer (< 30 min) between recovery arrival and event start`;
        }

        conflicts.push({
          eventId: evt.eventId,
          eventTitle: evt.title,
          recoveryArrival: new Date(arrivalMs).toISOString(),
          calendarStart: evt.start,
          calendarEnd: evt.end,
          location: evt.location,
          importance: evt.importance || 'NORMAL',
          reason,
          suggestedAction: 'RESCHEDULE',
        });
      }
    }

    return {
      hasConflict: conflicts.length > 0,
      conflicts,
    };
  }

  /**
   * Prepare a proposed calendar event update without mutating stored state.
   * @param {string} eventId
   * @param {string} proposedStart
   * @param {string} proposedEnd
   * @returns {Object}
   */
  prepareEventUpdate(eventId, proposedStart, proposedEnd) {
    const existing = this.events.find((e) => e.eventId === eventId);
    if (!existing) {
      throw new Error(`Calendar event not found: ${eventId}`);
    }

    return {
      eventId,
      currentEvent: { ...existing },
      proposedChange: {
        start: proposedStart,
        end: proposedEnd,
      },
      status: 'PROPOSED',
      userApprovalRequired: true,
      importance: existing.importance || 'NORMAL',
      protected: ['HIGH', 'CRITICAL'].includes(existing.importance),
    };
  }

  /**
   * Apply an event update. Enforces user approval requirement.
   * @param {string} eventId
   * @param {Object} updates
   * @param {boolean} userApproved
   * @returns {Promise<Object>}
   */
  async updateEvent(eventId, updates = {}, userApproved = false) {
    if (!userApproved) {
      const err = new Error('Calendar modification requires explicit user approval');
      err.code = 'APPROVAL_REQUIRED';
      err.statusCode = 403;
      throw err;
    }

    const idx = this.events.findIndex((e) => e.eventId === eventId);
    if (idx === -1) {
      throw new Error(`Calendar event not found: ${eventId}`);
    }

    const existing = this.events[idx];
    const updated = {
      ...existing,
      ...updates,
      updatedAt: new Date().toISOString(),
      status: 'CONFIRMED',
    };

    this.events[idx] = updated;

    return {
      provider: this.name,
      eventId,
      updated: true,
      status: 'CONFIRMED',
      event: updated,
    };
  }

  /**
   * Simulate creation of a calendar event.
   * @param {Object} eventData
   */
  async createEvent(eventData) {
    const newEvent = {
      eventId: eventData.eventId || `EVT-CAL-${Date.now()}`,
      title: eventData.title || 'New Calendar Entry',
      start: eventData.start || new Date().toISOString(),
      end: eventData.end || new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      timezone: eventData.timezone || 'Asia/Kolkata',
      location: eventData.location || 'Jaipur',
      importance: eventData.importance || 'NORMAL',
      status: 'ACTIVE',
    };

    this.events.push(newEvent);
    return {
      provider: this.name,
      created: true,
      event: newEvent,
    };
  }
}

module.exports = MockCalendarProvider;
