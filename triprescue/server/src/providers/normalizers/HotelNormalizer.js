/**
 * HotelNormalizer — Phase 10 Hotel Data Normalizer.
 *
 * Normalizes raw hotel provider responses into standardized TripRescue
 * travel options and segment structures.
 *
 * Enforces:
 * 1. Normalized location, price, dates, and availability.
 * 2. Explicit distance, cancellationPolicy, rating, and category fields.
 * 3. Zero fabricated booking URLs (DEEPLINK_UNAVAILABLE).
 * 4. Reliable confidence tagging (MOCK / CACHED / LIVE).
 */

class HotelNormalizer {
  /**
   * Normalize a raw hotel item into a standard travel option.
   * @param {Object} rawHotel
   * @param {Object} context - { checkInDate, checkOutDate, strategy }
   * @returns {Object|null}
   */
  normalizeHotel(rawHotel, context = {}) {
    if (!rawHotel || typeof rawHotel !== 'object') {
      return null;
    }

    const hotelId = rawHotel.hotelId || rawHotel.id || `HTL-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const name = rawHotel.name || 'Emergency Transit Hotel';
    const locationCode = (rawHotel.location?.code || rawHotel.location || 'DEL').toUpperCase();
    const locationName = rawHotel.location?.name || `${locationCode} Airport / Hub Area`;
    const city = rawHotel.location?.city || rawHotel.city || locationCode;

    const checkIn = rawHotel.checkIn || context.checkInDate || new Date().toISOString();
    const checkOut = rawHotel.checkOut || context.checkOutDate || new Date(new Date(checkIn).getTime() + 24 * 60 * 60 * 1000).toISOString();

    const depDate = new Date(checkIn);
    const arrDate = new Date(checkOut);
    const durationMinutes = Math.max(0, Math.round((arrDate - depDate) / 60000));

    const priceAmount = typeof rawHotel.price === 'object' ? rawHotel.price.amount : (Number(rawHotel.price) || 0);
    const currency = (typeof rawHotel.price === 'object' && rawHotel.price.currency) || 'INR';

    const availability = rawHotel.availability !== undefined ? rawHotel.availability : true;
    const availableRooms = rawHotel.availableRooms !== undefined ? rawHotel.availableRooms : (rawHotel.availableSeats || 10);

    const distance = rawHotel.distance || (rawHotel.distanceKm ? `${rawHotel.distanceKm} km from terminal` : 'Near transit hub');
    const distanceKm = rawHotel.distanceKm !== undefined ? rawHotel.distanceKm : null;
    const cancellationPolicy = rawHotel.cancellationPolicy || 'FREE_CANCELLATION';
    const rating = rawHotel.rating !== undefined ? rawHotel.rating : 4.0;
    const category = rawHotel.category || 'Transit Hotel';

    const nowIso = new Date().toISOString();
    const sourceTimestamp = rawHotel.sourceTimestamp || nowIso;
    const retrievedAt = nowIso;
    const dataConfidence = rawHotel.dataConfidence || 'MOCK';

    const segment = {
      segmentId: rawHotel.segmentId || `SEG-HTL-${hotelId}-${Date.now()}`,
      transportMode: 'hotel',
      hotelId,
      name,
      carrier: name,
      identifier: hotelId,
      origin: {
        code: locationCode,
        name: locationName,
        city,
        type: 'hotel',
      },
      destination: {
        code: locationCode,
        name: locationName,
        city,
        type: 'hotel',
      },
      checkIn,
      checkOut,
      departure: checkIn,
      arrival: checkOut,
      durationMinutes,
      price: {
        amount: priceAmount,
        currency,
      },
      availability,
      availableRooms,
      availableSeats: availableRooms,
      distance,
      distanceKm,
      cancellationPolicy,
      rating,
      category,
      retrievedAt,
      sourceTimestamp,
      dataConfidence,
      metadata: rawHotel.metadata || {
        amenities: rawHotel.amenities || ['Transit Accommodation', 'WiFi', '24h Reception'],
      },
    };

    return {
      optionId: rawHotel.optionId || `OPT-HTL-${hotelId}`,
      provider: rawHotel.provider || 'HotelProvider',
      strategy: context.strategy || rawHotel.strategy || 'TRANSIT_HOTEL',
      transportMode: 'hotel',
      hotelId,
      name,
      carrier: name,
      identifier: hotelId,
      location: {
        code: locationCode,
        name: locationName,
        city,
        type: 'hotel',
      },
      origin: segment.origin,
      destination: segment.destination,
      checkIn,
      checkOut,
      departure: checkIn,
      arrival: checkOut,
      durationMinutes,
      price: {
        amount: priceAmount,
        currency,
      },
      availability,
      availableRooms,
      availableSeats: availableRooms,
      distance,
      distanceKm,
      cancellationPolicy,
      rating,
      category,
      segments: rawHotel.segments || [segment],
      dataConfidence,
      retrievedAt,
      sourceTimestamp,
      metadata: segment.metadata,
      externalHandoff: {
        type: 'DEEPLINK',
        url: null,
        provider: name,
        status: 'DEEPLINK_UNAVAILABLE',
        verifiedAt: nowIso,
      },
    };
  }
}

module.exports = new HotelNormalizer();
