const { getProvider } = require('../providers');
const { notificationService } = require('../notifications');

class CalendarService {
  /**
   * Get active calendar events for traveler.
   */
  async getEvents(criteria = {}) {
    const provider = getProvider('calendar');
    return await provider.getEvents(criteria);
  }

  /**
   * Detect conflicts between recovery arrival and calendar.
   * Pure, non-mutating.
   */
  async detectConflicts(recoveryArrival, events = null) {
    const provider = getProvider('calendar');
    return provider.detectConflicts(recoveryArrival, events);
  }

  /**
   * Prepare a proposed event update without mutating calendar state.
   */
  async prepareEventUpdate(eventId, proposedStart, proposedEnd) {
    const provider = getProvider('calendar');
    return provider.prepareEventUpdate(eventId, proposedStart, proposedEnd);
  }

  /**
   * Execute an event update. Enforces user approval requirement.
   */
  async updateEvent(eventId, updates = {}, userApproved = false) {
    const provider = getProvider('calendar');
    const result = await provider.updateEvent(eventId, updates, userApproved);

    // Emit notification on successful update
    try {
      await notificationService.emitNotification('CALENDAR_UPDATED', {
        title: 'Calendar Schedule Adjusted',
        message: `Event ${result.event?.title || eventId} moved to ${new Date(result.event?.start).toLocaleTimeString()}.`,
        metadata: { eventId, updatedEvent: result.event },
      });
    } catch (e) {
      console.warn(`[CalendarService] Notification emission warning: ${e.message}`);
    }

    return result;
  }

  /**
   * Check conflicts and emit notification if any are detected.
   */
  async checkAndNotifyConflicts(recoveryArrival, context = {}) {
    const conflictResult = await this.detectConflicts(recoveryArrival);

    if (conflictResult.hasConflict) {
      const topConflict = conflictResult.conflicts[0];
      await notificationService.emitNotification('CALENDAR_CONFLICT', {
        tripId: context.tripId,
        sessionId: context.sessionId,
        title: 'Calendar Conflict Detected',
        message: `Recovery arrival overlaps with "${topConflict.eventTitle}" (${topConflict.reason}).`,
        conflictDetails: topConflict.reason,
        metadata: {
          conflicts: conflictResult.conflicts,
          recoveryArrival,
        },
      });
    }

    return conflictResult;
  }
}

module.exports = new CalendarService();
