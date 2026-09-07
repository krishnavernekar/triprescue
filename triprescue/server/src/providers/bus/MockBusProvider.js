const BusProvider = require('./BusProvider');
const busNormalizer = require('../normalizers/BusNormalizer');

class MockBusProvider extends BusProvider {
  constructor() {
    super('MockBusProvider');
  }

  /**
   * Deterministic mock bus search for recovery scenarios.
   * @param {Object} criteria - { origin, destination, strategy, departureTime }
   */
  async search(criteria = {}) {
    const rawOrigin = (criteria.origin || 'DEL').toUpperCase();
    const rawDest = (criteria.destination || 'JAI').toUpperCase();

    // Map airport codes to city/bus terminal codes if needed
    const origin = rawOrigin;
    const destination = rawDest;

    const baseTime = criteria.departureTime ? new Date(criteria.departureTime).getTime() : Date.now();
    const results = [];

    // Route 1: Delhi (DEL/ISBT) to Jaipur (JAI)
    if ((origin === 'DEL' || origin === 'ISBT' || origin === 'NDLS') && destination === 'JAI') {
      const volvoDep = new Date(baseTime + 120 * 60 * 1000);
      const volvoArr = new Date(baseTime + 450 * 60 * 1000);

      results.push({
        optionId: 'OPT-BUS-DEL-JAI-001',
        provider: this.name,
        strategy: criteria.strategy || 'BUS_ONLY',
        transportMode: 'bus',
        origin: { code: 'DEL', name: 'ISBT Kashmiri Gate', type: 'bus_station', city: 'Delhi' },
        destination: { code: 'JAI', name: 'Sindhi Camp Bus Stand', type: 'bus_station', city: 'Jaipur' },
        departure: volvoDep.toISOString(),
        arrival: volvoArr.toISOString(),
        durationMinutes: 330,
        carrier: 'RSRTC Volvo Express',
        identifier: 'RJ-14-VB-101',
        price: { amount: 850, currency: 'INR' },
        availability: true,
        availableSeats: 32,
      });

      const zingDep = new Date(baseTime + 180 * 60 * 1000);
      const zingArr = new Date(baseTime + 540 * 60 * 1000);

      results.push({
        optionId: 'OPT-BUS-DEL-JAI-002',
        provider: this.name,
        strategy: criteria.strategy || 'BUS_ONLY',
        transportMode: 'bus',
        origin: { code: 'DEL', name: 'ISBT Kashmiri Gate', type: 'bus_station', city: 'Delhi' },
        destination: { code: 'JAI', name: 'Narayan Singh Circle', type: 'bus_station', city: 'Jaipur' },
        departure: zingDep.toISOString(),
        arrival: zingArr.toISOString(),
        durationMinutes: 360,
        carrier: 'Zingbus Electric Intercity',
        identifier: 'ZB-DEL-JAI-404',
        price: { amount: 750, currency: 'INR' },
        availability: true,
        availableSeats: 18,
      });
    }
    // Route 2: Bengaluru (BLR) to Chennai (MAA/MAS)
    else if ((origin === 'BLR' || origin === 'SBC') && (destination === 'MAA' || destination === 'MAS')) {
      const ksrtcDep = new Date(baseTime + 90 * 60 * 1000);
      const ksrtcArr = new Date(baseTime + 450 * 60 * 1000);

      results.push({
        optionId: 'OPT-BUS-BLR-MAA-001',
        provider: this.name,
        strategy: criteria.strategy || 'BUS_ONLY',
        transportMode: 'bus',
        origin: { code: 'BLR', name: 'Kempegowda Bus Station Majestic', type: 'bus_station', city: 'Bengaluru' },
        destination: { code: 'MAA', name: 'CMBT Koyambedu', type: 'bus_station', city: 'Chennai' },
        departure: ksrtcDep.toISOString(),
        arrival: ksrtcArr.toISOString(),
        durationMinutes: 360,
        carrier: 'KSRTC Airavat Club Class',
        identifier: 'KA-01-AIR-555',
        price: { amount: 950, currency: 'INR' },
        availability: true,
        availableSeats: 24,
      });
    }
    // Route 3: Mumbai (BOM) to Pune (PUNE)
    else if ((origin === 'BOM' || origin === 'CSMT') && destination === 'PUNE') {
      const shivneriDep = new Date(baseTime + 60 * 60 * 1000);
      const shivneriArr = new Date(baseTime + 300 * 60 * 1000);

      results.push({
        optionId: 'OPT-BUS-BOM-PUNE-001',
        provider: this.name,
        strategy: criteria.strategy || 'BUS_ONLY',
        transportMode: 'bus',
        origin: { code: 'BOM', name: 'Dadar Bus Stand', type: 'bus_station', city: 'Mumbai' },
        destination: { code: 'PUNE', name: 'Swargate Bus Stand', type: 'bus_station', city: 'Pune' },
        departure: shivneriDep.toISOString(),
        arrival: shivneriArr.toISOString(),
        durationMinutes: 240,
        carrier: 'MSRTC Shivneri Volvo',
        identifier: 'MH-02-SHIV-801',
        price: { amount: 520, currency: 'INR' },
        availability: true,
        availableSeats: 30,
      });
    }
    // Generic fallback route
    else {
      const genDep = new Date(baseTime + 90 * 60 * 1000);
      const genArr = new Date(baseTime + 450 * 60 * 1000);

      results.push({
        optionId: `OPT-BUS-GEN-${origin}-${destination}`,
        provider: this.name,
        strategy: criteria.strategy || 'BUS_ONLY',
        transportMode: 'bus',
        origin: { code: origin, name: `${origin} Bus Terminus`, type: 'bus_station' },
        destination: { code: destination, name: `${destination} Bus Stand`, type: 'bus_station' },
        departure: genDep.toISOString(),
        arrival: genArr.toISOString(),
        durationMinutes: 360,
        carrier: 'Intercity State Transport',
        identifier: `BUS-${origin}-${destination}`,
        price: { amount: 700, currency: 'INR' },
        availability: true,
        availableSeats: 20,
      });
    }

    const normalized = results.map((r) => busNormalizer.normalizeBus(r, { strategy: criteria.strategy }));

    return {
      provider: this.name,
      results: normalized,
      message: 'Mock bus options returned',
    };
  }

  async getDetails(id) {
    if (!id || id === 'UNKNOWN' || id === 'BUS-UNKNOWN') {
      return {
        provider: this.name,
        result: null,
        error: 'Bus not found: ' + id,
      };
    }

    return {
      provider: this.name,
      result: {
        id,
        identifier: id,
        status: 'CONFIRMED',
        carrier: 'Intercity Bus Service',
        availableSeats: 24,
        amenities: ['AC Seater/Sleeper', 'Live Tracking', 'Water Bottle'],
      },
      message: 'Mock bus details',
    };
  }

  async revalidate(id) {
    if (!id || typeof id !== 'string') {
      return { provider: this.name, valid: false, message: 'Invalid bus identifier' };
    }

    const upperId = id.toUpperCase();
    if (upperId.includes('CANCEL') || upperId.includes('UNAVAIL') || upperId.includes('DISRUPT')) {
      return {
        provider: this.name,
        valid: false,
        status: 'CANCELLED',
        message: 'Bus ' + id + ' is cancelled or fully booked',
      };
    }

    return {
      provider: this.name,
      valid: true,
      status: 'AVAILABLE',
      message: 'Mock bus revalidation passed',
    };
  }

  async getExternalLink(id) {
    return {
      provider: this.name,
      url: null,
      status: 'DEEPLINK_UNAVAILABLE',
      message: 'External booking handoff not configured for mock provider',
    };
  }
}

module.exports = MockBusProvider;
