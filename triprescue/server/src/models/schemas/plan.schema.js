const mongoose = require('mongoose');

// External handoff placeholder structure
const externalHandoffSchema = new mongoose.Schema(
  {
    type: { type: String, default: 'DEEPLINK' },
    url: { type: String, default: null },
    provider: { type: String, default: null },
    verifiedAt: { type: Date, default: null },
    status: { type: String, default: 'DEEPLINK_UNAVAILABLE' },
  },
  { _id: false }
);

// Individual constraint check result
const constraintResultSchema = new mongoose.Schema(
  {
    type: { type: String },
    passed: { type: Boolean },
    actual: { type: mongoose.Schema.Types.Mixed, default: null },
    limit: { type: mongoose.Schema.Types.Mixed, default: null },
    message: { type: String, default: '' },
  },
  { _id: false }
);

// A single plan segment (normalized travel option)
const planSegmentSchema = new mongoose.Schema(
  {
    segmentId: { type: String },
    transportMode: { type: String },
    origin: { type: mongoose.Schema.Types.Mixed },
    destination: { type: mongoose.Schema.Types.Mixed },
    departure: { type: Date },
    arrival: { type: Date },
    carrier: { type: String, default: '' },
    identifier: { type: String, default: '' },
    durationMinutes: { type: Number, default: 0 },
    price: {
      amount: { type: Number, default: 0 },
      currency: { type: String, default: 'INR' },
    },
    availability: { type: Boolean, default: true },
    externalHandoff: { type: externalHandoffSchema, default: null },
  },
  { _id: false }
);

// Connection validation result within a plan
const connectionResultSchema = new mongoose.Schema(
  {
    fromSegmentId: { type: String },
    toSegmentId: { type: String },
    availableMinutes: { type: Number },
    requiredMinutes: { type: Number },
    bufferMinutes: { type: Number, default: 30 },
    transferDurationMinutes: { type: Number, default: 0 },
    status: { type: String, enum: ['VALID', 'INVALID', 'UNKNOWN'], default: 'UNKNOWN' },
    message: { type: String, default: '' },
  },
  { _id: false }
);

// A complete RecoveryPlan
const recoveryPlanSchema = new mongoose.Schema(
  {
    planId: {
      type: String,
      default: () => `PLAN-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    },
    strategy: { type: String },
    segments: { type: [planSegmentSchema], default: [] },

    totalCost: { type: Number, default: 0 },
    currency: { type: String, default: 'INR' },

    departureTime: { type: Date },
    finalArrivalTime: { type: Date },
    totalDurationMinutes: { type: Number, default: 0 },

    transferCount: { type: Number, default: 0 },

    constraintResults: { type: [constraintResultSchema], default: [] },
    connectionResults: { type: [connectionResultSchema], default: [] },

    hardConstraintsPassed: { type: Boolean, default: false },
    connectionsFeasible: { type: Boolean, default: false },

    rejectionReasons: { type: [String], default: [] },

    score: { type: Number, default: 0 },
    riskScore: { type: Number, default: 50 },

    externalHandoffs: { type: [externalHandoffSchema], default: [] },

    status: {
      type: String,
      enum: [
        'CANDIDATE',
        'VALIDATING',
        'VALID',
        'INVALID',
        'STALE',
        'REVALIDATION_REQUIRED',
        'SELECTED',
        'REJECTED',
        'EXPIRED',
      ],
      default: 'CANDIDATE',
    },
  },
  { _id: false, timestamps: true }
);

module.exports = {
  recoveryPlanSchema,
  planSegmentSchema,
  constraintResultSchema,
  connectionResultSchema,
  externalHandoffSchema,
};
