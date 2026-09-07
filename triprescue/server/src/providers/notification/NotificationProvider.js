const BaseProvider = require('../BaseProvider');

/**
 * NotificationProvider — Phase 11 Notification Provider Base Class.
 */
class NotificationProvider extends BaseProvider {
  constructor(name = 'NotificationProvider') {
    super(name, 'notification');
  }

  async sendDashboardNotification(notification) {
    throw new Error('sendDashboardNotification() must be implemented by subclass');
  }

  async sendMockEmailNotification(emailData) {
    throw new Error('sendMockEmailNotification() must be implemented by subclass');
  }

  async search() {
    throw new Error('search() not applicable for NotificationProvider');
  }

  async getDetails() {
    throw new Error('getDetails() not applicable for NotificationProvider');
  }

  async revalidate() {
    return { provider: this.name, valid: true };
  }

  async getExternalLink() {
    return { provider: this.name, url: null, status: 'DEEPLINK_UNAVAILABLE' };
  }
}

module.exports = NotificationProvider;
