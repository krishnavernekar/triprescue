const TrainProvider = require('./TrainProvider');
const trainNormalizer = require('../normalizers/TrainNormalizer');

class MockTrainProvider extends TrainProvider {
  constructor() {
    super('MockTrainProvider');
  }

  /**
   * Deterministic mock train search for recovery scenarios.
   * @param {Object} criteria - { origin, destination, strategy, departureTime }
   */
  async search(criteria = {}) {
    const rawOrigin = (criteria.origin || 'DEL').toUpperCase();
    const rawDest = (criteria.destination || 'JAI').toUpperCase();

    // Map airport codes to station codes if needed
    const origin = rawOrigin === 'DEL' ? 'NDLS' : (rawOrigin === 'BLR' ? 'SBC' : (rawOrigin === 'BOM' ? 'CSMT' : rawOrigin));
    const destination = rawDest === 'DEL' ? 'NDLS' : (rawDest === 'BLR' ? 'SBC' : (rawDest === 'BOM' ? 'CSMT' : rawDest));

    const baseTime = criteria.departureTime ? new Date(criteria.departureTime).getTime() : Date.now();
    const results = [];

    // Route 1: Delhi (NDLS) to Jaipur (JAI)
    if ((origin === 'NDLS' || origin === 'DEL') && destination === 'JAI') {
      const vbDep = new Date(baseTime + 165 * 60 * 1000);
      const vbArr = new Date(baseTime + 315 * 60 * 1000);

      results.push({
        optionId: 'OPT-TR-VB-001',
        provider: this.name,
        strategy: criteria.strategy || 'TRAIN_ONLY',
        transportMode: 'train',
        origin: { code: 'NDLS', name: 'New Delhi Railway Station', type: 'railway_station', city: 'Delhi' },
        destination: { code: 'JAI', name: 'Jaipur Junction', type: 'railway_station', city: 'Jaipur' },
        departure: vbDep.toISOString(),
        arrival: vbArr.toISOString(),
        durationMinutes: 150,
        carrier: 'Indian Railways',
        identifier: 'Vande Bharat 20978',
        price: { amount: 1600, currency: 'INR' },
        availability: true,
        availableSeats: 52,
      });

      const shatabdiDep = new Date(baseTime + 240 * 60 * 1000);
      const shatabdiArr = new Date(baseTime + 510 * 60 * 1000);

      results.push({
        optionId: 'OPT-TR-SHAT-001',
        provider: this.name,
        strategy: criteria.strategy || 'TRAIN_ONLY',
        transportMode: 'train',
        origin: { code: 'NDLS', name: 'New Delhi Railway Station', type: 'railway_station', city: 'Delhi' },
        destination: { code: 'JAI', name: 'Jaipur Junction', type: 'railway_station', city: 'Jaipur' },
        departure: shatabdiDep.toISOString(),
        arrival: shatabdiArr.toISOString(),
        durationMinutes: 270,
        carrier: 'Indian Railways',
        identifier: 'Ajmer Shatabdi 12015',
        price: { amount: 1200, currency: 'INR' },
        availability: true,
        availableSeats: 28,
      });
    }
    // Route 2: Bengaluru (SBC) to Chennai (MAS/MAA)
    else if ((origin === 'SBC' || origin === 'BLR') && (destination === 'MAS' || destination === 'MAA')) {
      const shatabdiDep = new Date(baseTime + 120 * 60 * 1000);
      const shatabdiArr = new Date(baseTime + 420 * 60 * 1000);

      results.push({
        optionId: 'OPT-TR-BLR-MAA-001',
        provider: this.name,
        strategy: criteria.strategy || 'TRAIN_ONLY',
        transportMode: 'train',
        origin: { code: 'SBC', name: 'KSR Bengaluru City', type: 'railway_station', city: 'Bengaluru' },
        destination: { code: 'MAS', name: 'Chennai Central', type: 'railway_station', city: 'Chennai' },
        departure: shatabdiDep.toISOString(),
        arrival: shatabdiArr.toISOString(),
        durationMinutes: 300,
        carrier: 'Indian Railways',
        identifier: 'Chennai Shatabdi 12008',
        price: { amount: 1050, currency: 'INR' },
        availability: true,
        availableSeats: 40,
      });
    }
    // Route 3: Mumbai (CSMT) to Pune (PUNE)
    else if ((origin === 'CSMT' || origin === 'BOM') && destination === 'PUNE') {
      const dqDep = new Date(baseTime + 90 * 60 * 1000);
      const dqArr = new Date(baseTime + 285 * 60 * 1000);

      results.push({
        optionId: 'OPT-TR-BOM-PUNE-001',
        provider: this.name,
        strategy: criteria.strategy || 'TRAIN_ONLY',
        transportMode: 'train',
        origin: { code: 'CSMT', name: 'Chhatrapati Shivaji Maharaj Terminus', type: 'railway_station', city: 'Mumbai' },
        destination: { code: 'PUNE', name: 'Pune Junction', type: 'railway_station', city: 'Pune' },
        departure: dqDep.toISOString(),
        arrival: dqArr.toISOString(),
        durationMinutes: 195,
        carrier: 'Indian Railways',
        identifier: 'Deccan Queen 12124',
        price: { amount: 450, currency: 'INR' },
        availability: true,
        availableSeats: 35,
      });
    }
    // Generic fallback route
    else {
      const genDep = new Date(baseTime + 120 * 60 * 1000);
      const genArr = new Date(baseTime + 480 * 60 * 1000);

      results.push({
        optionId: `OPT-TR-GEN-${origin}-${destination}`,
        provider: this.name,
        strategy: criteria.strategy || 'TRAIN_ONLY',
        transportMode: 'train',
        origin: { code: origin, name: `${origin} Station`, type: 'railway_station' },
        destination: { code: destination, name: `${destination} Station`, type: 'railway_station' },
        departure: genDep.toISOString(),
        arrival: genArr.toISOString(),
        durationMinutes: 360,
        carrier: 'Indian Railways',
        identifier: `Express ${origin}${destination}`,
        price: { amount: 950, currency: 'INR' },
        availability: true,
        availableSeats: 25,
      });
    }

    const normalized = results.map((r) => trainNormalizer.normalizeTrain(r, { strategy: criteria.strategy }));

    return {
      provider: this.name,
      results: normalized,
      message: 'Mock train options returned',
    };
  }

  async getDetails(id) {
    if (!id || id === 'UNKNOWN' || id === 'TR-UNKNOWN') {
      return {
        provider: this.name,
        result: null,
        error: 'Train not found: ' + id,
      };
    }

    return {
      provider: this.name,
      result: {
        id,
        identifier: id,
        status: 'CONFIRMED',
        carrier: 'Indian Railways',
        availableSeats: 45,
        amenities: ['AC Chair Car', 'Meals Available', 'Charging Points'],
      },
      message: 'Mock train details',
    };
  }

  async revalidate(id) {
    if (!id || typeof id !== 'string') {
      return { provider: this.name, valid: false, message: 'Invalid train identifier' };
    }

    const upperId = id.toUpperCase();
    if (upperId.includes('CANCEL') || upperId.includes('UNAVAIL') || upperId.includes('DISRUPT')) {
      return {
        provider: this.name,
        valid: false,
        status: 'CANCELLED',
        message: 'Train ' + id + ' is cancelled or unavailable',
      };
    }

    return {
      provider: this.name,
      valid: true,
      status: 'AVAILABLE',
      message: 'Mock train revalidation passed',
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

module.exports = MockTrainProvider;
