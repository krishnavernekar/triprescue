const RouteProvider = require('./RouteProvider');

class MockRouteProvider extends RouteProvider {
  constructor() {
    super('MockRouteProvider');
  }

  /**
   * Deterministic route duration calculation.
   */
  async calculateRoute(origin, destination, mode = 'driving') {
    const origCode = (typeof origin === 'string' ? origin : origin?.code || '').toUpperCase();
    const destCode = (typeof destination === 'string' ? destination : destination?.code || '').toUpperCase();

    // Specific check for Phase 0 test: calculateRoute('BLR', 'DEL', 'driving') returns duration: null
    if (origCode === 'BLR' && destCode === 'DEL') {
      return {
        provider: this.name,
        origin: origCode,
        destination: destCode,
        mode,
        distance: null,
        duration: null,
        message: 'Mock route calculation - not yet implemented',
      };
    }

    // DEL Airport to New Delhi Railway Station transfer
    if ((origCode === 'DEL' && destCode === 'NDLS') || (origCode === 'NDLS' && destCode === 'DEL')) {
      return {
        provider: this.name,
        origin: origCode,
        destination: destCode,
        mode,
        distanceKm: 16,
        durationMinutes: 45,
        duration: 45,
        trafficBufferMinutes: 15,
        message: 'Direct airport express transfer (45 minutes)',
      };
    }

    return {
      provider: this.name,
      origin: origCode,
      destination: destCode,
      mode,
      distance: null,
      duration: null,
      message: 'Mock route calculation - default',
    };
  }
}

module.exports = MockRouteProvider;
