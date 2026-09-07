/**
 * EventLogger — Structured Agent Event Logging for Phase 2.
 *
 * Appends timeline events to the recovery session in memory
 * and generates human-readable timeline messages for the UI.
 */

class EventLogger {
  /**
   * Log an event into the session's agentEvents array.
   * @param {Object} session - Active RecoverySession document
   * @param {string} type - Event type from agentEventSchema enum
   * @param {string} message - Human-readable narrative description
   * @param {Object} metadata - Optional contextual parameters
   * @param {string} strategy - Active strategy
   * @param {number} iteration - Current loop iteration
   * @returns {Object} The created event object
   */
  log(session, type, message, metadata = null, strategy = null, iteration = 0) {
    const event = {
      eventId: `EVT-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
      type,
      timestamp: new Date(),
      message,
      strategy: strategy || session.currentStrategy || null,
      iteration: iteration || session.iterationCount || 0,
      metadata,
    };

    if (!session.agentEvents) {
      session.agentEvents = [];
    }

    session.agentEvents.push(event);
    return event;
  }
}

module.exports = new EventLogger();
