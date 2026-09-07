const { EventEmitter } = require('events');
const mongoose = require('mongoose');
const Notification = require('../models/Notification');
const { getProvider } = require('../providers');

const ALLOWED_NOTIFICATION_TYPES = new Set([
  'DISRUPTION_DETECTED',
  'RECOVERY_PLAN_READY',
  'CONNECTION_AT_RISK',
  'PLAN_INVALIDATED',
  'APPROVAL_REQUIRED',
  'RECOVERY_UPDATED',
  'INSURANCE_REVIEW_READY',
  'COMPENSATION_REVIEW_READY',
  'CALENDAR_CONFLICT',
  'CALENDAR_UPDATED',
]);

class NotificationService extends EventEmitter {
  constructor() {
    super();
    this.sseClients = new Set();
    this.inMemoryStore = [];
  }

  /**
   * Validate and emit a structured notification.
   * @param {string} type - Notification event type
   * @param {Object} context - { tripId, sessionId, title, message, channel, metadata }
   * @returns {Promise<Object>} Created notification
   */
  async emitNotification(type, context = {}) {
    if (!ALLOWED_NOTIFICATION_TYPES.has(type)) {
      throw new Error(`Invalid notification event type: ${type}`);
    }

    const title = context.title || this._getDefaultTitle(type, context);
    const message = context.message || this._getDefaultMessage(type, context);
    const channel = context.channel || 'dashboard';

    const notificationData = {
      notificationId: `NTF-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
      tripId: context.tripId || null,
      sessionId: context.sessionId || null,
      type,
      channel,
      title,
      message,
      status: 'UNREAD',
      createdAt: new Date(),
      metadata: context.metadata || {},
    };

    // 1. Dispatch through provider
    try {
      const provider = getProvider('notification');
      if (channel === 'email') {
        await provider.sendMockEmailNotification({
          type,
          recipient: context.recipient || 'traveler@tripshield.internal',
          subject: title,
          message,
          metadata: context.metadata,
        });
      } else {
        await provider.sendDashboardNotification(notificationData);
      }
    } catch (err) {
      console.warn(`[NotificationService] Provider dispatch warning: ${err.message}`);
    }

    // 2. Persist to MongoDB if connected, otherwise in-memory
    let persisted = notificationData;
    if (mongoose.connection.readyState === 1) {
      try {
        persisted = await Notification.create(notificationData);
      } catch (dbErr) {
        console.warn(`[NotificationService] MongoDB persistence warning: ${dbErr.message}`);
        this.inMemoryStore.unshift(notificationData);
      }
    } else {
      this.inMemoryStore.unshift(notificationData);
    }

    // 3. Emit real-time event to SSE subscribers
    this.emit('notification', persisted);
    this._broadcastSSE(persisted);

    return persisted;
  }

  /**
   * Get notifications with optional filtering.
   * @param {Object} filter - { tripId, sessionId, status }
   */
  async getNotifications(filter = {}) {
    if (mongoose.connection.readyState === 1) {
      try {
        const query = {};
        if (filter.tripId) query.tripId = filter.tripId;
        if (filter.sessionId) query.sessionId = filter.sessionId;
        if (filter.status) query.status = filter.status;
        return await Notification.find(query).sort({ createdAt: -1 }).limit(50).lean();
      } catch (err) {
        console.warn(`[NotificationService] Mongo fetch failed, using memory: ${err.message}`);
      }
    }

    return this.inMemoryStore.filter((n) => {
      if (filter.tripId && String(n.tripId) !== String(filter.tripId)) return false;
      if (filter.sessionId && String(n.sessionId) !== String(filter.sessionId)) return false;
      if (filter.status && n.status !== filter.status) return false;
      return true;
    });
  }

  /**
   * Mark a single notification as read.
   * @param {string} notificationId
   */
  async markAsRead(notificationId) {
    if (mongoose.connection.readyState === 1) {
      try {
        const updated = await Notification.findOneAndUpdate(
          { notificationId },
          { status: 'READ', readAt: new Date() },
          { new: true }
        );
        if (updated) return updated;
      } catch (err) {
        console.warn(`[NotificationService] Mongo update warning: ${err.message}`);
      }
    }

    const item = this.inMemoryStore.find((n) => n.notificationId === notificationId);
    if (item) {
      item.status = 'READ';
      item.readAt = new Date();
      return item;
    }
    return null;
  }

  /**
   * Register an SSE client connection.
   */
  addStreamClient(res) {
    this.sseClients.add(res);
  }

  /**
   * Remove an SSE client connection.
   */
  removeStreamClient(res) {
    this.sseClients.delete(res);
  }

  _broadcastSSE(notification) {
    const data = `data: ${JSON.stringify(notification)}\n\n`;
    for (const client of this.sseClients) {
      try {
        client.write(data);
      } catch (e) {
        this.sseClients.delete(client);
      }
    }
  }

  _getDefaultTitle(type, context) {
    switch (type) {
      case 'DISRUPTION_DETECTED': return 'Flight Disruption Detected';
      case 'RECOVERY_PLAN_READY': return 'Recovery Plan Verified & Ready';
      case 'CONNECTION_AT_RISK': return 'Connection Buffer At Risk';
      case 'PLAN_INVALIDATED': return 'Recovery Plan Invalidated';
      case 'APPROVAL_REQUIRED': return 'Traveler Approval Required';
      case 'RECOVERY_UPDATED': return 'Recovery Options Updated';
      case 'INSURANCE_REVIEW_READY': return 'Parametric Insurance Review Ready';
      case 'COMPENSATION_REVIEW_READY': return 'EU261 / DGCA Compensation Review Ready';
      case 'CALENDAR_CONFLICT': return 'Calendar Conflict Detected';
      case 'CALENDAR_UPDATED': return 'Calendar Successfully Updated';
      default: return 'Travel Notice';
    }
  }

  _getDefaultMessage(type, context) {
    switch (type) {
      case 'DISRUPTION_DETECTED':
        return `A schedule disruption was identified for your travel itinerary.`;
      case 'RECOVERY_PLAN_READY':
        return `A viable recovery option has been formulated and validated against constraints.`;
      case 'CONNECTION_AT_RISK':
        return `A connection buffer at transit hub has breached safety minimums.`;
      case 'PLAN_INVALIDATED':
        return `The candidate recovery plan is no longer viable due to updated schedules.`;
      case 'APPROVAL_REQUIRED':
        return `Your explicit approval is required before booking handoff or calendar update.`;
      case 'RECOVERY_UPDATED':
        return `Alternative recovery options have been regenerated.`;
      case 'INSURANCE_REVIEW_READY':
        return `Parametric protection criteria satisfied for immediate claims review.`;
      case 'COMPENSATION_REVIEW_READY':
        return `Carrier delay qualifies for statutory compensation filing.`;
      case 'CALENDAR_CONFLICT':
        return context.conflictDetails || `Recovery arrival overlaps with an existing calendar commitment.`;
      case 'CALENDAR_UPDATED':
        return `Your calendar has been updated with the approved schedule adjustment.`;
      default:
        return 'Travel alert received from TripRescue.';
    }
  }
}

module.exports = new NotificationService();
