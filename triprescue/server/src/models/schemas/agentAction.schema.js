const mongoose = require('mongoose');

const agentActionSchema = new mongoose.Schema(
  {
    actionId: {
      type: String,
      default: () => `ACT-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
    },
    type: {
      type: String,
      enum: [
        'SEARCH_FLIGHTS',
        'SEARCH_TRAINS',
        'SEARCH_BUSES',
        'SEARCH_HOTELS',
        'CALCULATE_ROUTE',
        'EVALUATE_PLAN',
        'REVALIDATE_PLAN',
        'ADAPT_STRATEGY',
        'VERIFY_PLAN',
        'BUILD_OBSERVATION',
        'SELECT_STRATEGY',
      ],
    },
    strategy: { type: String, default: null },
    tool: { type: String, default: null },
    parameters: { type: mongoose.Schema.Types.Mixed, default: null },
    reason: { type: String, default: '' },
    result: { type: mongoose.Schema.Types.Mixed, default: null },
    success: { type: Boolean, default: true },
    errorMessage: { type: String, default: null },
    iteration: { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now },
    completedAt: { type: Date, default: null },
  },
  { _id: false }
);

module.exports = agentActionSchema;
