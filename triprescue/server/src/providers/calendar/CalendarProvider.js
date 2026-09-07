const BaseProvider = require('../BaseProvider');

/**
 * CalendarProvider — Phase 11 Calendar Provider Base Class.
 * Abstract interface for calendar event retrieval, conflict detection,
 * non-mutating update proposal, and explicit user-approved modifications.
 */
class CalendarProvider extends BaseProvider {
  constructor(name = 'CalendarProvider') {
    super(name, 'calendar');
  }

  async getEvents(criteria) {
    throw new Error('getEvents() must be implemented by subclass');
  }

  detectConflicts(recoveryArrival, events) {
    throw new Error('detectConflicts() must be implemented by subclass');
  }

  prepareEventUpdate(eventId, proposedStart, proposedEnd) {
    throw new Error('prepareEventUpdate() must be implemented by subclass');
  }

  async createEvent(eventData) {
    throw new Error('createEvent() must be implemented by subclass');
  }

  async updateEvent(eventId, updates, userApproved = false) {
    throw new Error('updateEvent() must be implemented by subclass');
  }

  async search() {
    throw new Error('search() not applicable for CalendarProvider');
  }

  async getDetails() {
    throw new Error('getDetails() not applicable for CalendarProvider');
  }

  async revalidate() {
    return { provider: this.name, valid: true };
  }

  async getExternalLink() {
    return { provider: this.name, url: null, status: 'DEEPLINK_UNAVAILABLE' };
  }
}

module.exports = CalendarProvider;
