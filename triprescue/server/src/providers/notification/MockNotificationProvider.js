const NotificationProvider = require('./NotificationProvider');

/**
 * MockNotificationProvider — Phase 11 Mock Notification Implementation.
 * Produces deterministic dashboard alerts and records simulated emails
 * in an offline memory inbox for inspection without external credentials.
 */
class MockNotificationProvider extends NotificationProvider {
  constructor() {
    super('MockNotificationProvider');
    this.inbox = [];
    this.dashboardDispatches = [];
  }

  /**
   * Send or format a dashboard notification.
   * @param {Object} notification
   */
  async sendDashboardNotification(notification) {
    const record = {
      notificationId: notification.notificationId || `NTF-DASH-${Date.now()}`,
      channel: 'dashboard',
      type: notification.type,
      title: notification.title,
      message: notification.message,
      timestamp: new Date().toISOString(),
      metadata: notification.metadata || {},
      status: 'DELIVERED',
    };
    this.dashboardDispatches.push(record);
    return {
      provider: this.name,
      delivered: true,
      channel: 'dashboard',
      record,
    };
  }

  /**
   * Send a simulated email notification (deterministic mock, offline).
   * @param {Object} emailData
   */
  async sendMockEmailNotification(emailData) {
    const emailRecord = {
      emailId: `EML-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      recipient: emailData.recipient || 'traveler@tripshield.internal',
      subject: emailData.subject || `[TripRescue Alert] ${emailData.type || 'Travel Update'}`,
      body: emailData.message || emailData.body || '',
      notificationType: emailData.type || 'NOTIFICATION',
      sentAt: new Date().toISOString(),
      status: 'SENT_MOCK',
    };
    this.inbox.push(emailRecord);
    return {
      provider: this.name,
      delivered: true,
      channel: 'email',
      emailId: emailRecord.emailId,
      recipient: emailRecord.recipient,
      subject: emailRecord.subject,
    };
  }

  getInbox() {
    return [...this.inbox];
  }

  clearInbox() {
    this.inbox = [];
    this.dashboardDispatches = [];
  }
}

module.exports = MockNotificationProvider;
