const BaseProvider = require('../BaseProvider');

/**
 * InsuranceProvider — Phase 12 Insurance Base Provider.
 * Abstract interface for policy text analysis and evidence checklist generation.
 */
class InsuranceProvider extends BaseProvider {
  constructor(name = 'InsuranceProvider') {
    super(name, 'insurance');
  }

  async analyzePolicy(policyText, disruptionFacts = {}) {
    throw new Error('analyzePolicy() must be implemented by subclass');
  }

  async search() {
    throw new Error('search() not applicable for InsuranceProvider');
  }

  async getDetails() {
    throw new Error('getDetails() not applicable for InsuranceProvider');
  }

  async revalidate() {
    return { provider: this.name, valid: true };
  }

  async getExternalLink() {
    return { provider: this.name, url: null, status: 'DEEPLINK_UNAVAILABLE' };
  }
}

module.exports = InsuranceProvider;
