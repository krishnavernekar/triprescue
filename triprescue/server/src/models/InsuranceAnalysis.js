const mongoose = require('mongoose');

const insuranceAnalysisSchema = new mongoose.Schema(
  {
    analysisId: {
      type: String,
      required: true,
      unique: true,
      default: () => `INS-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
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
    policyName: {
      type: String,
      default: 'Uploaded Travel Policy',
    },
    status: {
      type: String,
      enum: ['POTENTIALLY_APPLICABLE', 'UNCERTAIN', 'NOT_FOUND'],
      required: true,
    },
    disruptionFacts: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    relevantClauses: [
      {
        clauseName: String,
        sectionReference: String,
        sourceText: String,
        applicabilityReason: String,
        status: {
          type: String,
          enum: ['POTENTIALLY_APPLICABLE', 'UNCERTAIN', 'NOT_FOUND'],
        },
      },
    ],
    evidenceChecklist: [String],
    uncertainties: [String],
    disclaimer: {
      type: String,
      default: 'This is a draft preparation aid, not a guarantee of coverage or legal eligibility. TripRescue does not file claims or submit documents automatically.',
    },
  },
  {
    timestamps: true,
  }
);

insuranceAnalysisSchema.index({ tripId: 1, createdAt: -1 });

module.exports = mongoose.model('InsuranceAnalysis', insuranceAnalysisSchema);
