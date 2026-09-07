require('dotenv').config();

const config = {
  port: process.env.PORT || 5000,
  mongodbUri: process.env.MONGODB_URI || 'mongodb://localhost:27017/triprescue',
  nodeEnv: process.env.NODE_ENV || 'development',
  demoMode: process.env.DEMO_MODE === 'true' || process.env.DEMO_MODE === undefined,

  // Phase 3 Real Providers Switch
  realProvidersEnabled: process.env.REAL_PROVIDERS_ENABLED === 'true',

  // Provider API Keys
  aviationstackApiKey: process.env.AVIATIONSTACK_API_KEY || '',
  googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_ROUTES_API_KEY || '',

  // Provider type overrides ('mock' | 'aviationstack' | 'google' | etc.)
  providers: {
    flight: process.env.FLIGHT_PROVIDER || (process.env.REAL_PROVIDERS_ENABLED === 'true' ? 'aviationstack' : 'mock'),
    train: process.env.TRAIN_PROVIDER || 'mock',
    bus: process.env.BUS_PROVIDER || 'mock',
    hotel: process.env.HOTEL_PROVIDER || 'mock',
    route: process.env.ROUTE_PROVIDER || (process.env.REAL_PROVIDERS_ENABLED === 'true' ? 'google' : 'mock'),
  },

  // Freshness thresholds (minutes)
  flightStatusMaxAgeMinutes: parseInt(process.env.FLIGHT_STATUS_MAX_AGE_MINUTES, 10) || 5,
  routeMaxAgeMinutes: parseInt(process.env.ROUTE_MAX_AGE_MINUTES, 10) || 15,

  // Quota & Rate Limit Protection
  maxProviderRequestsPerRecovery: parseInt(process.env.MAX_PROVIDER_REQUESTS_PER_RECOVERY, 10) || 10,

  // Legacy key alias (kept for backward compatibility)
  llmApiKey: process.env.LLM_API_KEY || '',

  // Phase 4 — LLM Agent Configuration
  llmEnabled: process.env.LLM_ENABLED === 'true',
  geminiApiKey: process.env.GEMINI_API_KEY || process.env.LLM_API_KEY || '',
  geminiModel: process.env.GEMINI_MODEL || 'gemini-1.5-flash',
  llmMaxTokens: parseInt(process.env.LLM_MAX_TOKENS, 10) || 1024,
  llmTemperature: parseFloat(process.env.LLM_TEMPERATURE) || 0.2,
  llmMaxCallsPerRecovery: parseInt(process.env.LLM_MAX_CALLS_PER_RECOVERY, 10) || 5,
};

module.exports = config;

