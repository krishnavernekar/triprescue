const mongoose = require('mongoose');

const compensationCaseSchema = new mongoose.Schema(
  {
    caseId: {
      type: String,
      required: true,
      unique: true,
      default: () => `CMP-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
    },
    tripId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Trip',
      required: true,
    },
    sessionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'RecoverySession',
      default: null,
    },
    status: {
      type: String,
      enum: ['POTENTIALLY_APPLICABLE', 'UNCERTAIN', 'NOT_FOUND'],
      required: true,
    },
    framework: {
      type: String,
      default: 'DGCA CAR / Carrier Passenger Charter',
    },
    draftClaim: {
      claimType: String,
      passengerName: String,
      carrier: String,
      flightNumber: String,
      route: String,
      disruptionType: String,
      delayMinutes: Number,
      summary: String,
      supportingReasons: [String],
      editableBody: String,
    },
    requestedEvidence: [String],
    uncertainties: [String],
    submitted: {
      type: Boolean,
      default: false,
    },
    disclaimer: {
      type: String,
      default: 'This is an informational preparation draft aid, not legal advice or a guarantee of legal eligibility. No claim is filed automatically.',
    },
  },
  {
    timestamps: true,
  }
);

compensationCaseSchema.index({ tripId: 1, createdAt: -1 });

module.exports = mongoose.model('CompensationCase', compensationCaseSchema);
