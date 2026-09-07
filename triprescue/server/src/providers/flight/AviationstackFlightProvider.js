const FlightProvider = require('./FlightProvider');
const flightNormalizer = require('../normalizers/FlightNormalizer');
const config = require('../../config/environment');

class AviationstackFlightProvider extends FlightProvider {
  constructor() {
    super('AviationstackFlightProvider');
    this.apiKey = config.aviationstackApiKey;
    this.baseUrl = 'https://api.aviationstack.com/v1';
  }

  /**
   * Search flights via Aviationstack.
   * @param {Object} criteria - { origin, destination, departureTime, strategy }
   */
  async search(criteria = {}) {
    if (!this.apiKey) {
      return {
        provider: this.name,
        results: [],
        status: 'UNAVAILABLE',
        error: 'AVIATIONSTACK_API_KEY is not configured',
        fallbackNeeded: true,
      };
    }

    const origin = (criteria.origin || '').toUpperCase();
    const destination = (criteria.destination || '').toUpperCase();

    if (!origin || !destination) {
      return { provider: this.name, results: [], message: 'Missing origin/destination for flight search' };
    }

    try {
      const url = new URL(`${this.baseUrl}/flights`);
      url.searchParams.append('access_key', this.apiKey);
      url.searchParams.append('dep_iata', origin);
      url.searchParams.append('arr_iata', destination);
      url.searchParams.append('limit', '10');

      const response = await fetch(url.toString(), { method: 'GET', signal: AbortSignal.timeout(6000) });
      if (!response.ok) {
        throw new Error(`Aviationstack HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      if (data.error) {
        throw new Error(`Aviationstack Error: ${data.error.message || data.error.info || 'API error'}`);
      }

      const normalizedResults = flightNormalizer.normalizeAviationstackList(data, {
        strategy: criteria.strategy,
      });

      return {
        provider: this.name,
        results: normalizedResults,
        sourceTimestamp: new Date().toISOString(),
        confidence: 'LIVE',
        count: normalizedResults.length,
        message: `Retrieved ${normalizedResults.length} live flight options from Aviationstack`,
      };
    } catch (error) {
      return {
        provider: this.name,
        results: [],
        status: 'FAILED',
        error: error.message,
        fallbackNeeded: true,
      };
    }
  }

  /**
   * Get live flight status by flight number.
   */
  async getFlightStatus(flightIata, flightDate = null) {
    if (!this.apiKey) {
      return { provider: this.name, result: null, error: 'NO_API_KEY', fallbackNeeded: true };
    }

    try {
      const url = new URL(`${this.baseUrl}/flights`);
      url.searchParams.append('access_key', this.apiKey);
      url.searchParams.append('flight_iata', flightIata.toUpperCase());
      if (flightDate) {
        url.searchParams.append('flight_date', flightDate);
      }

      const response = await fetch(url.toString(), { method: 'GET', signal: AbortSignal.timeout(6000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const data = await response.json();
      const firstItem = data.data?.[0] || null;
      if (!firstItem) {
        return { provider: this.name, result: null, message: 'Flight not found in live schedule' };
      }

      const normalized = flightNormalizer.normalizeAviationstackFlight(firstItem);
      return {
        provider: this.name,
        result: normalized,
        status: normalized.status,
        confidence: 'LIVE',
      };
    } catch (error) {
      return {
        provider: this.name,
        result: null,
        error: error.message,
        fallbackNeeded: true,
      };
    }
  }

  /**
   * Get details for a flight option/identifier.
   * @param {string} id - Flight IATA code or option ID
   */
  async getDetails(id) {
    if (!id) {
      return { provider: this.name, result: null, error: 'Flight ID required' };
    }
    // Extract flight IATA code if passed an OPT/SEG ID format
    const flightCode = String(id).replace(/^(OPT|SEG)-AVS-/, '').split('-')[0] || id;
    const statusResult = await this.getFlightStatus(flightCode);
    return {
      provider: this.name,
      result: statusResult.result,
      status: statusResult.status || (statusResult.result ? 'AVAILABLE' : 'UNAVAILABLE'),
      message: statusResult.error ? `Failed to retrieve details: ${statusResult.error}` : 'Flight details retrieved',
      fallbackNeeded: Boolean(statusResult.fallbackNeeded),
    };
  }

  /**
   * Revalidate a flight option before finalizing a recovery plan.
   * Checks whether the flight is active and not cancelled in the live schedule.
   * @param {string} id - Flight identifier or option ID
   * @returns {Promise<{ provider: string, valid: boolean, status: string, message: string }>}
   */
  async revalidate(id) {
    if (!this.apiKey) {
      return { provider: this.name, valid: true, message: 'Revalidated in mock/fallback mode', confidence: 'MOCK' };
    }

    const flightCode = String(id).replace(/^(OPT|SEG)-AVS-/, '').split('-')[0] || id;
    const statusResult = await this.getFlightStatus(flightCode);

    if (statusResult.error || !statusResult.result) {
      return {
        provider: this.name,
        valid: false,
        status: 'UNVERIFIED',
        message: statusResult.error || 'Flight not found during revalidation',
        fallbackNeeded: true,
      };
    }

    const isCancelled = statusResult.result.status === 'CANCELLED';
    return {
      provider: this.name,
      valid: !isCancelled,
      status: statusResult.result.status,
      message: isCancelled ? 'Flight has been cancelled by airline' : 'Flight revalidated successfully',
      confidence: 'LIVE',
    };
  }

  /**
   * Get external provider deeplink for a flight.
   * Follows strict safety rule: never fabricate booking URLs.
   * Returns DEEPLINK_UNAVAILABLE if genuine direct booking link is not provided by API.
   * @param {string} id - Flight identifier
   */
  async getExternalLink(id) {
    // Aviationstack API is a flight status/schedule aggregator and does not offer direct booking URLs.
    // As per prompt.pdf: "never invent a booking URL... safely return an unavailable state".
    return {
      provider: this.name,
      url: null,
      status: 'DEEPLINK_UNAVAILABLE',
      message: 'Aviationstack does not provide direct booking URLs. No fabricated URL returned.',
    };
  }
}

module.exports = AviationstackFlightProvider;
