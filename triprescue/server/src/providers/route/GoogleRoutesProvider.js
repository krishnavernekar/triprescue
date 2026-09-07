const RouteProvider = require('./RouteProvider');
const routeNormalizer = require('../normalizers/RouteNormalizer');
const config = require('../../config/environment');

// Known physical transfer baseline estimates (fallback)
const KNOWN_TRANSFER_ESTIMATES = {
  'DEL:NDLS': 45, // DEL Airport to New Delhi Railway Station
  'NDLS:DEL': 45,
  'DEL:NZM': 50,  // DEL Airport to Hazrat Nizamuddin
  'NZM:DEL': 50,
  'BLR:SBC': 65,  // BLR Airport to KSR Bengaluru City Station
  'SBC:BLR': 65,
  'BOM:CSMT': 75, // BOM Airport to CSMT
  'CSMT:BOM': 75,
  'DEL:DEL': 30,  // Inter-terminal transfer
  'BLR:BLR': 20,
  'BOM:BOM': 40,
};

// Geocodable address mappings for key transport hubs
const HUB_ADDRESSES = {
  DEL: 'Indira Gandhi International Airport, New Delhi, Delhi, India',
  NDLS: 'New Delhi Railway Station, Bhavbhuti Marg, Ratan Lal Market, Kamla Market, Ajmeri Gate, New Delhi, Delhi, India',
  NZM: 'Hazrat Nizamuddin Railway Station, Nizamuddin, New Delhi, Delhi, India',
  BLR: 'Kempegowda International Airport, Devanahalli, Bengaluru, Karnataka, India',
  SBC: 'KSR Bengaluru City Railway Station, Majestic, Bengaluru, Karnataka, India',
  BOM: 'Chhatrapati Shivaji Maharaj International Airport, Mumbai, Maharashtra, India',
  CSMT: 'Chhatrapati Shivaji Maharaj Terminus, Fort, Mumbai, Maharashtra, India',
  JAI: 'Jaipur International Airport, Jaipur, Rajasthan, India',
  MAA: 'Chennai International Airport, Meenambakkam, Chennai, Tamil Nadu, India',
  CCU: 'Netaji Subhash Chandra Bose International Airport, Kolkata, West Bengal, India',
};

class GoogleRoutesProvider extends RouteProvider {
  constructor() {
    super('GoogleRoutesProvider');
    this.apiKey = config.googleMapsApiKey;
    this.baseUrl = 'https://routes.googleapis.com/directions/v2:computeRoutes';
  }

  /**
   * Format input origin/destination into Google Routes API waypoint.
   * Supports string code/address or object with lat/lng, code, address.
   */
  _formatWaypoint(point) {
    if (!point) return null;

    if (typeof point === 'object') {
      if (point.lat !== undefined && point.lng !== undefined) {
        return { location: { latLng: { latitude: Number(point.lat), longitude: Number(point.lng) } } };
      }
      if (point.latitude !== undefined && point.longitude !== undefined) {
        return { location: { latLng: { latitude: Number(point.latitude), longitude: Number(point.longitude) } } };
      }
      const code = (point.code || point.name || '').toUpperCase();
      if (HUB_ADDRESSES[code]) {
        return { address: HUB_ADDRESSES[code] };
      }
      if (point.address) {
        return { address: point.address };
      }
      if (code) {
        return { address: code };
      }
    }

    const str = String(point).trim();
    const upper = str.toUpperCase();
    if (HUB_ADDRESSES[upper]) {
      return { address: HUB_ADDRESSES[upper] };
    }
    return { address: str };
  }

  /**
   * Calculate physical transfer duration between two transport nodes.
   * @param {string|Object} origin - Origin code or address
   * @param {string|Object} destination - Destination code or address
   * @param {string} mode - Transit mode ('DRIVE' | 'TRANSIT' | 'driving')
   */
  async calculateRoute(origin, destination, mode = 'DRIVE') {
    const origCode = (typeof origin === 'string' ? origin : origin?.code || origin?.name || '').toUpperCase();
    const destCode = (typeof destination === 'string' ? destination : destination?.code || destination?.name || '').toUpperCase();
    const requestedMode = (mode || '').toLowerCase();
    const travelMode = (requestedMode === 'transit' || requestedMode === 'train' || requestedMode === 'bus') ? 'TRANSIT' : 'DRIVE';

    // If no API key configured, use tagged fallback estimate
    if (!this.apiKey) {
      return this.getTransferEstimate(origCode, destCode, 'Google Maps API key not configured');
    }

    try {
      const originWaypoint = this._formatWaypoint(origin);
      const destWaypoint = this._formatWaypoint(destination);

      if (!originWaypoint || !destWaypoint) {
        throw new Error('Invalid origin or destination waypoint for route calculation');
      }

      const headers = {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': this.apiKey,
        'X-Goog-FieldMask': 'routes.duration,routes.distanceMeters,routes.legs',
      };

      const body = {
        origin: originWaypoint,
        destination: destWaypoint,
        travelMode,
      };

      if (travelMode === 'DRIVE') {
        body.routingPreference = 'TRAFFIC_AWARE';
      }

      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) {
        throw new Error(`Google Routes HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      const normalized = routeNormalizer.normalizeGoogleRoute(data, origCode, destCode, travelMode);

      if (!normalized) {
        throw new Error('Google Routes returned empty route data');
      }

      return normalized;
    } catch (error) {
      // Gracefully fall back to physical baseline estimate without exposing credentials
      return this.getTransferEstimate(
        origCode,
        destCode,
        `Google Routes live query failed (${error.message}) — using physical baseline estimate`
      );
    }
  }

  /**
   * Return standardized fallback transfer estimate.
   */
  getTransferEstimate(origin, destination, reason = 'Physical transfer baseline estimate') {
    const key = `${origin}:${destination}`;
    const durationMinutes = KNOWN_TRANSFER_ESTIMATES[key] || 45;

    return routeNormalizer.createFallbackEstimate(origin, destination, durationMinutes, reason);
  }
}

module.exports = GoogleRoutesProvider;
