const mongoose = require('mongoose');

const externalHandoffModelSchema = new mongoose.Schema(
  {
    handoffId: {
      type: String,
      required: true,
      unique: true,
      default: () => 'HOF-' + Date.now() + '-' + Math.floor(Math.random() * 10000),
    },
    sessionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'RecoverySession',
      required: true,
      index: true,
    },
    planId: {
      type: String,
      required: true,
      index: true,
    },
    provider: {
      type: String,
      required: true,
      trim: true,
    },
    providerType: {
      type: String,
      enum: ['flight', 'train', 'bus', 'multimodal', 'hotel', 'other'],
      default: 'flight',
    },
    externalUrl: {
      type: String,
      required: true,
      trim: true,
    },
    status: {
      type: String,
      enum: [
        'AVAILABLE',
        'PENDING_APPROVAL',
        'APPROVED',
        'OPENED',
        'REJECTED',
        'INVALID',
        'FAILED',
      ],
      default: 'AVAILABLE',
      uppercase: true,
    },
    approvedAt: {
      type: Date,
      default: null,
    },
    openedAt: {
      type: Date,
      default: null,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('ExternalHandoff', externalHandoffModelSchema);
