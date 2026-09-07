const BaseProvider = require('../BaseProvider');

/**
 * CompensationProvider — Phase 12 Compensation Base Provider.
 * Abstract interface for statutory compensation evaluation and draft claim generation.
 */
class CompensationProvider extends BaseProvider {
  constructor(name = 'CompensationProvider') {
    super(name, 'compensation');
  }

  async checkCompensation(disruptionFacts = {}, passengerInfo = {}) {
    throw new Error('checkCompensation() must be implemented by subclass');
  }

  async search() {
    throw new Error('search() not applicable for CompensationProvider');
  }

  async getDetails() {
    throw new Error('getDetails() not applicable for CompensationProvider');
  }

  async revalidate() {
    return { provider: this.name, valid: true };
  }

  async getExternalLink() {
    return { provider: this.name, url: null, status: 'DEEPLINK_UNAVAILABLE' };
  }
}

module.exports = CompensationProvider;
