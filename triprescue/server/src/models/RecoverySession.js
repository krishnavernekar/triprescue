const mongoose = require('mongoose');
const { recoveryObjectiveSchema } = require('./schemas/objective.schema');
const itinerarySegmentSchema = require('./schemas/segment.schema');
const disruptionSchema = require('./schemas/disruption.schema');
const { recoveryPlanSchema } = require('./schemas/plan.schema');
const agentEventSchema = require('./schemas/agentEvent.schema');
const agentActionSchema = require('./schemas/agentAction.schema');

// Failure record schema
const failureRecordSchema = new mongoose.Schema(
  {
    type: { type: String }, // NO_RESULTS, BUDGET_EXCEEDED, DEADLINE_MISSED, UNAVAILABLE, INVALID_CONNECTION, INSUFFICIENT_TRANSFER_TIME, TOOL_EXECUTION_FAILED, NO_FEASIBLE_RECOVERY
    action: { type: String, default: null },
    tool: { type: String, default: null },
    strategy: { type: String, default: null },
    reason: { type: String, default: '' },
    planId: { type: String, default: null },
    timestamp: { type: Date, default: Date.now },
    recovered: { type: Boolean, default: false },
  },
  { _id: false }
);

// Adaptation history record schema
const adaptationRecordSchema = new mongoose.Schema(
  {
    previousStrategy: { type: String },
    failureReason: { type: String },
    newStrategy: { type: String },
    triggeredBy: { type: String },
    timestamp: { type: Date, default: Date.now },
    iteration: { type: Number, default: 0 },
  },
  { _id: false }
);

// TripShield risk score schema
const riskScoreSchema = new mongoose.Schema(
  {
    score: { type: Number, default: 50 },
    level: {
      type: String,
      enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
      default: 'MEDIUM',
    },
    reasons: { type: [String], default: [] },
    factors: { type: mongoose.Schema.Types.Mixed, default: {} },
    calculatedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

// Downstream impact schema
const downstreamImpactSchema = new mongoose.Schema(
  {
    affectedSegmentId: { type: String },
    impactType: { type: String }, // TIMING_CHANGED, CONNECTION_BROKEN, ARRIVAL_DELAYED, DEADLINE_CONFLICT
    description: { type: String },
    originalTime: { type: Date, default: null },
    newTime: { type: Date, default: null },
    severityLevel: { type: String, default: 'MEDIUM' },
  },
  { _id: false }
);

const recoverySessionSchema = new mongoose.Schema(
  {
    tripId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Trip',
      required: [true, 'Trip ID is required'],
      index: true,
    },

    // Core objective and itinerary snapshots
    objective: {
      type: recoveryObjectiveSchema,
      required: [true, 'Recovery objective snapshot is required'],
    },
    objectiveSnapshot: { type: recoveryObjectiveSchema },
    currentItinerary: { type: [itinerarySegmentSchema], default: [] },
    itinerarySnapshot: { type: [itinerarySegmentSchema], default: [] },
    disruption: {
      type: disruptionSchema,
      required: [true, 'Disruption snapshot is required'],
    },
    disruptionSnapshot: { type: disruptionSchema },

    // Session status lifecycle
    status: {
      type: String,
      enum: {
        values: [
          'CREATED',
          'READY',
          'RECOVERING',
          'EVALUATING',
          'ADAPTING',
          'VERIFYING',
          'PLAN_READY',
          'AWAITING_APPROVAL',
          'RECOVERED',
          'FAILED',
          'MAX_ITERATIONS',
        ],
        message: '{VALUE} is not a valid recovery session status',
      },
      default: 'READY',
      uppercase: true,
    },
    currentStatus: { type: String, default: 'READY' },

    // Agent state
    currentStrategy: { type: String, default: null },
    attemptedStrategies: { type: [String], default: [] },
    iterationCount: { type: Number, default: 0 },
    maxIterations: { type: Number, default: 10 },

    // Plans
    candidatePlans: { type: [recoveryPlanSchema], default: [] },
    selectedPlan: { type: recoveryPlanSchema, default: null },
    rejectedPlans: { type: [recoveryPlanSchema], default: [] },

    // History and events
    failures: { type: [failureRecordSchema], default: [] },
    adaptationHistory: { type: [adaptationRecordSchema], default: [] },
    agentEvents: { type: [agentEventSchema], default: [] },
    agentActions: { type: [agentActionSchema], default: [] },

    // TripShield
    riskScore: { type: riskScoreSchema, default: null },
    downstreamImpacts: { type: [downstreamImpactSchema], default: [] },

    // Phase 4 — LLM session-scoped memory (no RAG, no vector DB)
    llmCalls: {
      type: [
        new mongoose.Schema(
          {
            callIndex: { type: Number, default: 0 },
            iteration: { type: Number, default: 0 },
            strategy: { type: String, default: null },
            promptSummary: { type: String, default: '' }, // truncated to 500 chars
            rawResponseSummary: { type: String, default: '' }, // truncated to 500 chars
            parsedDecision: { type: mongoose.Schema.Types.Mixed, default: null },
            status: {
              type: String,
              enum: ['SUCCESS', 'FAILED', 'REJECTED', 'FALLBACK', 'QUOTA_EXCEEDED'],
              default: 'SUCCESS',
            },
            durationMs: { type: Number, default: 0 },
            timestamp: { type: Date, default: Date.now },
          },
          { _id: false }
        ),
      ],
      default: [],
    },

    // Timing
    recoveryStartedAt: { type: Date, default: null },
    recoveryCompletedAt: { type: Date, default: null },
  },
  {
    timestamps: true,
  }
);

// Pre-save hook to sync status and snapshots
recoverySessionSchema.pre('save', function (next) {
  if (!this.objectiveSnapshot && this.objective) {
    this.objectiveSnapshot = this.objective;
  }
  if ((!this.itinerarySnapshot || this.itinerarySnapshot.length === 0) && this.currentItinerary) {
    this.itinerarySnapshot = this.currentItinerary;
  }
  if (!this.disruptionSnapshot && this.disruption) {
    this.disruptionSnapshot = this.disruption;
  }
  this.currentStatus = this.status;
  next();
});

module.exports = mongoose.model('RecoverySession', recoverySessionSchema);
