const FlightProvider = require('./FlightProvider');

class MockFlightProvider extends FlightProvider {
  constructor() {
    super('MockFlightProvider');
  }

  /**
   * Deterministic mock flight search for Phase 2 recovery scenarios.
   * Uses relative offsets from criteria.departureTime so timezone and deadline
   * constraints are always mathematically accurate.
   *
   * Note: An empty search `{}` returns empty results to keep Phase 0 tests passing.
   * @param {Object} criteria - { origin, destination, strategy, departureTime }
   */
  async search(criteria = {}) {
    // If empty criteria passed, return empty results (satisfies Phase 0 tests)
    if (!criteria.origin && !criteria.destination && !criteria.strategy) {
      return {
        provider: this.name,
        results: [],
        message: 'No criteria provided',
      };
    }

    const origin = (criteria.origin || 'BLR').toUpperCase();
    const destination = (criteria.destination || 'JAI').toUpperCase();
    const strategy = criteria.strategy || 'DIRECT_FLIGHT';

    const baseTime = criteria.departureTime ? new Date(criteria.departureTime).getTime() : Date.now();

    // Scenario 1: DIRECT_FLIGHT BLR -> JAI
    if (strategy === 'DIRECT_FLIGHT' || (origin === 'BLR' && destination === 'JAI' && strategy !== 'CONNECTING_FLIGHT')) {
      const depDate = new Date(baseTime + 90 * 60 * 1000); // dep + 1.5h
      const arrDate = new Date(baseTime + 255 * 60 * 1000); // dep + 4h 15m

      const optionA = {
        optionId: 'OPT-FL-DIR-001',
        provider: this.name,
        strategy: 'DIRECT_FLIGHT',
        transportMode: 'flight',
        origin: { code: 'BLR', name: 'Kempegowda International Airport', type: 'airport' },
        destination: { code: 'JAI', name: 'Jaipur International Airport', type: 'airport' },
        departure: depDate.toISOString(),
        arrival: arrDate.toISOString(),
        durationMinutes: 165,
        carrier: 'Air India Express',
        identifier: 'IX 1922',
        price: { amount: 7000, currency: 'INR' }, // Exceeds 5000 budget! Fails BUDGET_EXCEEDED
        availability: true,
        segments: [
          {
            segmentId: 'SEG-DIR-1',
            transportMode: 'flight',
            origin: { code: 'BLR', name: 'Kempegowda International', type: 'airport' },
            destination: { code: 'JAI', name: 'Jaipur International', type: 'airport' },
            departure: depDate.toISOString(),
            arrival: arrDate.toISOString(),
            carrier: 'Air India Express',
            identifier: 'IX 1922',
            durationMinutes: 165,
            price: { amount: 7000, currency: 'INR' },
            availability: true,
          },
        ],
        externalHandoff: {
          type: 'DEEPLINK',
          url: null,
          provider: 'Air India Express',
          verifiedAt: new Date().toISOString(),
          status: 'DEEPLINK_UNAVAILABLE',
        },
      };

      return {
        provider: this.name,
        results: [optionA],
        message: 'Mock direct flight options returned',
      };
    }

    // Scenario 2: CONNECTING_FLIGHT (e.g. BLR -> DEL -> JAI)
    if (strategy === 'CONNECTING_FLIGHT') {
      const leg1Dep = new Date(baseTime); // Departs at base time
      const leg1Arr = new Date(baseTime + 165 * 60 * 1000); // Arrives 2h 45m later
      const leg2Dep = new Date(baseTime + 180 * 60 * 1000); // Departs ONLY 15 min after leg 1 arrives!
      const leg2Arr = new Date(baseTime + 250 * 60 * 1000); // Arrives 1h 10m later (well before 8h deadline)

      const optionB = {
        optionId: 'OPT-FL-CONN-001',
        provider: this.name,
        strategy: 'CONNECTING_FLIGHT',
        transportMode: 'flight',
        origin: { code: 'BLR', name: 'Kempegowda International Airport', type: 'airport' },
        destination: { code: 'JAI', name: 'Jaipur International Airport', type: 'airport' },
        departure: leg1Dep.toISOString(),
        arrival: leg2Arr.toISOString(),
        durationMinutes: 250,
        price: { amount: 4500, currency: 'INR' }, // Fits within 5000 budget
        availability: true,
        segments: [
          {
            segmentId: 'SEG-CONN-1',
            transportMode: 'flight',
            origin: { code: 'BLR', name: 'Kempegowda International', type: 'airport' },
            destination: { code: 'DEL', name: 'Indira Gandhi International', type: 'airport' },
            departure: leg1Dep.toISOString(),
            arrival: leg1Arr.toISOString(),
            carrier: 'IndiGo',
            identifier: '6E 2101',
            durationMinutes: 165,
            price: { amount: 2500, currency: 'INR' },
            availability: true,
          },
          {
            segmentId: 'SEG-CONN-2',
            transportMode: 'flight',
            origin: { code: 'DEL', name: 'Indira Gandhi International', type: 'airport' },
            destination: { code: 'JAI', name: 'Jaipur International', type: 'airport' },
            departure: leg2Dep.toISOString(), // 15 min transfer window -> fails INSUFFICIENT_TRANSFER_TIME
            arrival: leg2Arr.toISOString(),
            carrier: 'Alliance Air',
            identifier: '9I 843',
            durationMinutes: 70,
            price: { amount: 2000, currency: 'INR' },
            availability: true,
          },
        ],
        externalHandoff: {
          type: 'DEEPLINK',
          url: null,
          provider: 'IndiGo',
          status: 'DEEPLINK_UNAVAILABLE',
        },
      };

      return {
        provider: this.name,
        results: [optionB],
        message: 'Mock connecting flight options returned',
      };
    }

    // Scenario 3: Flight leg for Multimodal recovery (BLR -> DEL)
    if (strategy === 'FLIGHT_PLUS_TRAIN' || strategy === 'FLIGHT_PLUS_BUS' || destination === 'DEL') {
      const leg1Dep = new Date(baseTime); // Departs at base time
      const leg1Arr = new Date(baseTime + 165 * 60 * 1000); // Arrives 2h 45m later at DEL

      const flightLeg = {
        optionId: 'OPT-FL-LEG-001',
        provider: this.name,
        strategy,
        transportMode: 'flight',
        origin: { code: 'BLR', name: 'Kempegowda International Airport', type: 'airport' },
        destination: { code: 'DEL', name: 'Indira Gandhi International Airport', type: 'airport' },
        departure: leg1Dep.toISOString(),
        arrival: leg1Arr.toISOString(),
        durationMinutes: 165,
        carrier: 'Vistara',
        identifier: 'UK 812',
        price: { amount: 3200, currency: 'INR' },
        availability: true,
        segments: [
          {
            segmentId: 'SEG-MM-FLIGHT-1',
            transportMode: 'flight',
            origin: { code: 'BLR', name: 'Kempegowda International', type: 'airport' },
            destination: { code: 'DEL', name: 'Indira Gandhi International', type: 'airport' },
            departure: leg1Dep.toISOString(),
            arrival: leg1Arr.toISOString(),
            carrier: 'Vistara',
            identifier: 'UK 812',
            durationMinutes: 165,
            price: { amount: 3200, currency: 'INR' },
            availability: true,
          },
        ],
        externalHandoff: {
          type: 'DEEPLINK',
          url: null,
          provider: 'Vistara',
          status: 'DEEPLINK_UNAVAILABLE',
        },
      };

      return {
        provider: this.name,
        results: [flightLeg],
        message: 'Mock multimodal flight leg returned',
      };
    }

    return { provider: this.name, results: [], message: 'No mock flight results for criteria' };
  }

  async getDetails(id) {
    return { provider: this.name, result: { id, status: 'AVAILABLE' }, message: 'Mock flight details' };
  }

  async revalidate(id) {
    return { provider: this.name, valid: true, message: 'Mock revalidation passed' };
  }

  async getExternalLink(id) {
    return { provider: this.name, url: null, status: 'DEEPLINK_UNAVAILABLE', message: 'Handoff placeholder' };
  }
}

module.exports = MockFlightProvider;
