/**
 * Authoritative formatting and translation utilities for TripRescue
 */

export function formatDate(d, options = {}) {
  if (!d) return '—';
  try {
    const date = new Date(d);
    if (isNaN(date.getTime())) return String(d);
    
    return date.toLocaleString([], {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      ...options,
    });
  } catch {
    return String(d);
  }
}

export function formatTime(d) {
  if (!d) return '—';
  try {
    const date = new Date(d);
    if (isNaN(date.getTime())) return String(d);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  } catch {
    return String(d);
  }
}

export function formatCurrency(amount) {
  if (amount === undefined || amount === null) return '₹0';
  return `₹${Number(amount).toLocaleString('en-IN')}`;
}

export function modeIcon(mode) {
  switch (mode?.toLowerCase()) {
    case 'flight':
      return '✈️';
    case 'train':
      return '🚆';
    case 'bus':
      return '🚌';
    case 'ground':
      return '🚗';
    case 'hotel':
      return '🏨';
    default:
      return '📍';
  }
}

export function translateStrategy(strategy) {
  if (!strategy) return 'Recovery Plan';
  const s = String(strategy).toUpperCase();
  switch (s) {
    case 'DIRECT_FLIGHT':
      return 'Direct Alternative Flight';
    case 'FLIGHT_PLUS_TRAIN':
      return 'Flight + High-Speed Rail (Vande Bharat / Express)';
    case 'FLIGHT_PLUS_BUS':
      return 'Flight + Intercity Bus Express';
    case 'TRAIN_ONLY':
      return 'Direct Railway Route';
    case 'BUS_ONLY':
      return 'Direct Intercity Bus';
    case 'TRANSIT_HOTEL':
      return 'Emergency Transit Accommodation + Rebooking';
    default:
      return s.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
  }
}

export function translateDisruption(type) {
  if (!type) return 'Trip Disruption';
  const t = String(type).toUpperCase();
  switch (t) {
    case 'FLIGHT_CANCELLED':
      return 'Flight Cancelled';
    case 'FLIGHT_DELAYED':
      return 'Flight Delayed';
    case 'TRAIN_CANCELLED':
      return 'Train Cancelled';
    case 'TRAIN_DELAYED':
      return 'Train Delayed';
    case 'BUS_CANCELLED':
      return 'Bus Cancelled';
    case 'BUS_DELAYED':
      return 'Bus Delayed';
    case 'HOTEL_CANCELLED':
    case 'HOTEL_CHANGED':
      return 'Hotel Unavailable';
    case 'MISSED_CONNECTION':
      return 'Missed Transfer Connection';
    case 'AIRPORT_DISRUPTION':
      return 'Airport Terminal Congestion';
    case 'WEATHER_DISRUPTION':
      return 'Severe Weather Disruption';
    default:
      return t.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
  }
}

