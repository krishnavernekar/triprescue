const config = require('../config/environment');

const { MockFlightProvider, AviationstackFlightProvider } = require('./flight');
const { MockTrainProvider } = require('./train');
const { MockBusProvider } = require('./bus');
const { MockHotelProvider } = require('./hotel');
const { MockRouteProvider, GoogleRoutesProvider } = require('./route');
const { MockNotificationProvider } = require('./notification');
const { MockCalendarProvider } = require('./calendar');
const { MockInsuranceProvider } = require('./insurance');
const { MockCompensationProvider } = require('./compensation');

const providerRegistry = {
  flight: {
    mock: MockFlightProvider,
    aviationstack: AviationstackFlightProvider,
    real: AviationstackFlightProvider,
  },
  train: {
    mock: MockTrainProvider,
  },
  bus: {
    mock: MockBusProvider,
  },
  hotel: {
    mock: MockHotelProvider,
  },
  route: {
    mock: MockRouteProvider,
    google: GoogleRoutesProvider,
    google_routes: GoogleRoutesProvider,
    real: GoogleRoutesProvider,
  },
  notification: {
    mock: MockNotificationProvider,
  },
  calendar: {
    mock: MockCalendarProvider,
  },
  insurance: {
    mock: MockInsuranceProvider,
  },
  compensation: {
    mock: MockCompensationProvider,
  },
};

/**
 * Get provider instance by tool type with fallback resolution.
 */
function getProvider(type, overrideProviderType = null) {
  const configuredType = overrideProviderType || config.providers[type] || (config.realProvidersEnabled ? 'real' : 'mock');
  const ProviderClass = providerRegistry[type]?.[configuredType] || providerRegistry[type]?.mock;

  if (!ProviderClass) {
    throw new Error(`Unknown provider: ${type}/${configuredType}`);
  }

  return new ProviderClass();
}

/**
 * Get both primary and fallback provider instances for pipeline execution.
 */
function getProviderPair(type) {
  const primaryType = config.providers[type] || (config.realProvidersEnabled ? 'real' : 'mock');
  const PrimaryClass = providerRegistry[type]?.[primaryType] || providerRegistry[type]?.mock;
  const FallbackClass = providerRegistry[type]?.mock;

  return {
    primary: new PrimaryClass(),
    fallback: new FallbackClass(),
  };
}

module.exports = { getProvider, getProviderPair, providerRegistry };
