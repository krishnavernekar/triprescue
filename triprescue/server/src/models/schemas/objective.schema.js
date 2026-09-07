const mongoose = require('mongoose');

const hardConstraintsSchema = new mongoose.Schema(
  {
    destinationRequired: {
      type: Boolean,
      default: true,
    },
    deadlineRequired: {
      type: Boolean,
      default: true,
    },
    budgetRequired: {
      type: Boolean,
      default: true,
    },
    passengerCount: {
      type: Number,
      min: [1, 'At least 1 passenger required'],
      default: 1,
    },
    accessibilityRequirements: {
      type: [String],
      default: [],
    },
  },
  { _id: false }
);

const softConstraintsSchema = new mongoose.Schema(
  {
    preferredAirline: {
      type: String,
      default: null,
    },
    preferredTransportMode: {
      type: String,
      default: null,
    },
    preferredAirport: {
      type: String,
      default: null,
    },
    maxTransfers: {
      type: Number,
      default: 1,
      min: [0, 'Transfers cannot be negative'],
    },
    comfort: {
      type: String,
      default: 'standard',
    },
  },
  { _id: false }
);

const recoveryObjectiveSchema = new mongoose.Schema(
  {
    origin: {
      type: String,
      required: [true, 'Origin is required'],
      trim: true,
      uppercase: true,
    },
    destination: {
      type: String,
      required: [true, 'Destination is required'],
      trim: true,
      uppercase: true,
    },
    departureTime: {
      type: Date,
      required: [true, 'Departure time is required'],
    },
    arrivalDeadline: {
      type: Date,
      default: null,
    },
    maxAdditionalBudget: {
      type: Number,
      min: [0, 'Budget cannot be negative'],
      default: 0,
    },
    passengerCount: {
      type: Number,
      min: [1, 'At least 1 passenger required'],
      default: 1,
    },
    priority: {
      type: String,
      enum: {
        values: [
          'arrival_time',
          'cost',
          'reliability',
          'transfers',
          'fastest',
          'cheapest',
          'balanced',
        ],
        message: '{VALUE} is not a valid priority',
      },
      default: 'arrival_time',
    },
    riskTolerance: {
      type: String,
      enum: {
        values: ['LOW', 'MEDIUM', 'HIGH'],
        message: '{VALUE} is not a valid risk tolerance',
      },
      default: 'MEDIUM',
      uppercase: true,
    },
    hardConstraints: {
      type: hardConstraintsSchema,
      default: () => ({}),
    },
    softConstraints: {
      type: softConstraintsSchema,
      default: () => ({}),
    },
    optimizationPriorities: {
      type: [String],
      default: ['arrival_time', 'cost', 'reliability', 'transfers'],
    },
  },
  { _id: false }
);

module.exports = {
  hardConstraintsSchema,
  softConstraintsSchema,
  recoveryObjectiveSchema,
};
