const HotelProvider = require('./HotelProvider');
const hotelNormalizer = require('../normalizers/HotelNormalizer');

class MockHotelProvider extends HotelProvider {
  constructor() {
    super('MockHotelProvider');
  }

  /**
   * Deterministic mock hotel search for transit/emergency accommodations.
   * @param {Object} criteria - { location, checkInDate, checkOutDate, maxBudget, strategy }
   */
  async search(criteria = {}) {
    const rawLoc = (criteria.location || 'DEL').toUpperCase();

    // Map common railway/city identifiers to hub codes
    const location = rawLoc === 'NDLS' ? 'DEL' : (rawLoc === 'SBC' ? 'BLR' : (rawLoc === 'CSMT' ? 'BOM' : rawLoc));

    const baseTime = criteria.checkInDate ? new Date(criteria.checkInDate).getTime() : Date.now();
    const isMultimodal = criteria.strategy === 'FLIGHT_PLUS_HOTEL';
    const checkIn = isMultimodal
      ? new Date(baseTime + 75 * 60 * 1000).toISOString()
      : (criteria.checkInDate || new Date().toISOString());
    const checkOut = criteria.checkOutDate || new Date(new Date(checkIn).getTime() + 10 * 60 * 60 * 1000).toISOString();

    const results = [];

    // Hub 1: Delhi (DEL / Aerocity / IGI Airport)
    if (location === 'DEL') {
      results.push({
        hotelId: 'HTL-DEL-T3-001',
        name: 'Holiday Inn Express New Delhi International Airport T3',
        location: { code: 'DEL', name: 'Terminal 3 Airside / Landside, IGI Airport', city: 'Delhi', type: 'hotel' },
        checkIn,
        checkOut,
        price: { amount: 4200, currency: 'INR' },
        availability: true,
        availableRooms: 15,
        distance: '0.3 km inside Terminal 3',
        distanceKm: 0.3,
        cancellationPolicy: 'FREE_CANCELLATION',
        rating: 4.4,
        category: '4-Star Transit Hotel',
        amenities: ['Direct Terminal Access', 'Soundproof Rooms', 'Free WiFi', 'Express Breakfast'],
      });

      results.push({
        hotelId: 'HTL-DEL-AERO-002',
        name: 'Ibis New Delhi Aerocity',
        location: { code: 'DEL', name: 'Asset 9, Hospitality District, Aerocity', city: 'Delhi', type: 'hotel' },
        checkIn,
        checkOut,
        price: { amount: 3100, currency: 'INR' },
        availability: true,
        availableRooms: 8,
        distance: '2.5 km from Terminal 3',
        distanceKm: 2.5,
        cancellationPolicy: 'CANCEL_BEFORE_6PM',
        rating: 4.1,
        category: '3-Star Business Hotel',
        amenities: ['Free Airport Shuttle', '24/7 Restaurant', 'High Speed WiFi', 'Work Desk'],
      });
    }
    // Hub 2: Mumbai (BOM / CSMIA Airport)
    else if (location === 'BOM') {
      results.push({
        hotelId: 'HTL-BOM-T2-001',
        name: 'Niranta Transit Hotel Mumbai T2',
        location: { code: 'BOM', name: 'Terminal 2, CSMIA', city: 'Mumbai', type: 'hotel' },
        checkIn,
        checkOut,
        price: { amount: 4800, currency: 'INR' },
        availability: true,
        availableRooms: 6,
        distance: '0.1 km inside T2 International Departures',
        distanceKm: 0.1,
        cancellationPolicy: 'NON_REFUNDABLE',
        rating: 4.3,
        category: '4-Star Airside Transit Hotel',
        amenities: ['Airside Access', 'Express Check-in', 'Spa Services', 'Baggage Handling'],
      });
    }
    // Hub 3: Bengaluru (BLR / Kempegowda Airport)
    else if (location === 'BLR') {
      results.push({
        hotelId: 'HTL-BLR-AIR-001',
        name: 'Taj Bangalore International Airport',
        location: { code: 'BLR', name: 'Opposite Terminal 1, KIA', city: 'Bengaluru', type: 'hotel' },
        checkIn,
        checkOut,
        price: { amount: 7500, currency: 'INR' },
        availability: true,
        availableRooms: 20,
        distance: '0.2 km from Terminal 1 & 2',
        distanceKm: 0.2,
        cancellationPolicy: 'FREE_CANCELLATION',
        rating: 4.8,
        category: '5-Star Luxury Airport Hotel',
        amenities: ['Walk to Terminal', '24h Fitness Center', 'Fine Dining', 'Luxury Rooms'],
      });
    }
    // Hub 4: Jaipur (JAI / Jaipur Airport)
    else if (location === 'JAI') {
      results.push({
        hotelId: 'HTL-JAI-AIR-001',
        name: 'The Fern - An Ecotel Hotel Jaipur',
        location: { code: 'JAI', name: 'Tonk Road, near Jaipur Airport', city: 'Jaipur', type: 'hotel' },
        checkIn,
        checkOut,
        price: { amount: 2800, currency: 'INR' },
        availability: true,
        availableRooms: 12,
        distance: '1.8 km from Jaipur Airport',
        distanceKm: 1.8,
        cancellationPolicy: 'FREE_CANCELLATION',
        rating: 4.2,
        category: '4-Star Business Hotel',
        amenities: ['Airport Pickup', 'Rooftop Pool', 'Multi-cuisine Restaurant', 'Free WiFi'],
      });
    }
    // Generic fallback hub
    else {
      results.push({
        hotelId: `HTL-GEN-${location}-001`,
        name: `${location} Transit Hub Inn`,
        location: { code: location, name: `${location} Transit Area`, city: location, type: 'hotel' },
        checkIn,
        checkOut,
        price: { amount: 3200, currency: 'INR' },
        availability: true,
        availableRooms: 10,
        distance: '1.0 km from hub center',
        distanceKm: 1.0,
        cancellationPolicy: 'FREE_CANCELLATION',
        rating: 4.0,
        category: '3-Star Transit Accommodation',
        amenities: ['24/7 Front Desk', 'Complimentary Breakfast', 'Free WiFi'],
      });
    }

    const normalized = results.map((r) =>
      hotelNormalizer.normalizeHotel(r, {
        checkInDate: checkIn,
        checkOutDate: checkOut,
        strategy: criteria.strategy || 'TRANSIT_HOTEL',
      })
    );

    return {
      provider: this.name,
      results: normalized,
      message: 'Mock hotel options returned',
    };
  }

  async getDetails(id) {
    if (!id || id === 'UNKNOWN' || id === 'HTL-UNKNOWN') {
      return {
        provider: this.name,
        result: null,
        error: 'Hotel not found: ' + id,
      };
    }

    return {
      provider: this.name,
      result: {
        hotelId: id,
        identifier: id,
        status: 'CONFIRMED',
        name: 'Transit Hotel Facility (' + id + ')',
        availableRooms: 10,
        checkInTime: '12:00',
        checkOutTime: '11:00',
        cancellationPolicy: 'FREE_CANCELLATION',
        amenities: ['24/7 Front Desk', 'Airport Shuttle', 'WiFi', 'Breakfast'],
      },
      message: 'Mock hotel details',
    };
  }

  async revalidate(id) {
    if (!id || typeof id !== 'string') {
      return { provider: this.name, valid: false, message: 'Invalid hotel identifier' };
    }

    const upperId = id.toUpperCase();
    if (upperId.includes('CANCEL') || upperId.includes('UNAVAIL') || upperId.includes('SOLD_OUT')) {
      return {
        provider: this.name,
        valid: false,
        status: 'UNAVAILABLE',
        message: 'Hotel ' + id + ' is sold out or unavailable for the requested dates',
      };
    }

    if (upperId.includes('PRICE_CHANGED')) {
      return {
        provider: this.name,
        valid: true,
        status: 'PRICE_CHANGED',
        priceChanged: true,
        newPrice: 5500,
        message: 'Hotel room price has updated to ₹5,500',
      };
    }

    return {
      provider: this.name,
      valid: true,
      status: 'AVAILABLE',
      message: 'Mock hotel booking availability confirmed',
    };
  }

  async getExternalLink(id) {
    return {
      provider: this.name,
      url: null,
      status: 'DEEPLINK_UNAVAILABLE',
      message: 'Hotel booking links cannot be fabricated; use partner direct handoff',
    };
  }
}

module.exports = MockHotelProvider;
