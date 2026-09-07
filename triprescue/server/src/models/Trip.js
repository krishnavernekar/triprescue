const mongoose = require('mongoose');
const { recoveryObjectiveSchema } = require('./schemas/objective.schema');
const itinerarySegmentSchema = require('./schemas/segment.schema');
const disruptionSchema = require('./schemas/disruption.schema');

const tripSchema = new mongoose.Schema(
  {
    passengerName: {
      type: String,
      required: [true, 'Passenger name is required'],
      trim: true,
    },
    passengerCount: {
      type: Number,
      required: [true, 'Passenger count is required'],
      min: [1, 'At least 1 passenger required'],
      default: 1,
    },
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
      validate: {
        validator: function (value) {
          if (!value || !this.departureTime) return true;
          return new Date(value) >= new Date(this.departureTime);
        },
        message: 'Arrival deadline must be after departure time',
      },
    },
    maxAdditionalBudget: {
      type: Number,
      default: 0,
      min: [0, 'Budget cannot be negative'],
    },
    priority: {
      type: String,
      default: 'balanced',
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
    disruptionType: {
      type: String,
      default: 'none',
    },
    status: {
      type: String,
      enum: {
        values: [
          'ACTIVE',
          'DISRUPTED',
          'RECOVERING',
          'RECOVERED',
          'CANCELLED',
          'COMPLETED',
          'draft',
          'active',
          'disrupted',
          'recovering',
          'recovered',
          'cancelled',
          'completed',
        ],
        message: '{VALUE} is not a valid trip status',
      },
      default: 'draft',
    },
    itinerary: {
      type: [itinerarySegmentSchema],
      default: [],
    },
    recoveryObjective: {
      type: recoveryObjectiveSchema,
    },
    disruption: {
      type: disruptionSchema,
      default: null,
    },
    disruptions: {
      type: [disruptionSchema],
      default: [],
    },
    currentRecoverySessionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'RecoverySession',
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Pre-validate hook to populate recoveryObjective if not explicitly set
tripSchema.pre('validate', function (next) {
  if (this.origin && this.destination && this.departureTime) {
    if (!this.recoveryObjective) {
      this.recoveryObjective = {
        origin: this.origin,
        destination: this.destination,
        departureTime: this.departureTime,
        arrivalDeadline: this.arrivalDeadline,
        maxAdditionalBudget: this.maxAdditionalBudget || 0,
        passengerCount: this.passengerCount || 1,
        priority: this.priority === 'balanced' ? 'arrival_time' : (this.priority || 'arrival_time'),
        riskTolerance: this.riskTolerance || 'MEDIUM',
        hardConstraints: {
          destinationRequired: true,
          deadlineRequired: Boolean(this.arrivalDeadline),
          budgetRequired: this.maxAdditionalBudget !== undefined,
          passengerCount: this.passengerCount || 1,
          accessibilityRequirements: [],
        },
        softConstraints: {
          preferredAirline: null,
          preferredTransportMode: null,
          preferredAirport: null,
          maxTransfers: 1,
          comfort: 'standard',
        },
        optimizationPriorities: ['arrival_time', 'cost', 'reliability', 'transfers'],
      };
    } else {
      if (!this.recoveryObjective.origin) this.recoveryObjective.origin = this.origin;
      if (!this.recoveryObjective.destination) this.recoveryObjective.destination = this.destination;
      if (!this.recoveryObjective.departureTime) this.recoveryObjective.departureTime = this.departureTime;
      if (this.recoveryObjective.arrivalDeadline === undefined) this.recoveryObjective.arrivalDeadline = this.arrivalDeadline;
      if (this.recoveryObjective.maxAdditionalBudget === undefined) this.recoveryObjective.maxAdditionalBudget = this.maxAdditionalBudget || 0;
      if (this.recoveryObjective.passengerCount === undefined) this.recoveryObjective.passengerCount = this.passengerCount || 1;
      if (!this.recoveryObjective.priority) {
        this.recoveryObjective.priority = this.priority === 'balanced' ? 'arrival_time' : (this.priority || 'arrival_time');
      }
      if (!this.recoveryObjective.riskTolerance) {
        this.recoveryObjective.riskTolerance = this.riskTolerance || 'MEDIUM';
      }
    }
  }
  next();
});

module.exports = mongoose.model('Trip', tripSchema);
