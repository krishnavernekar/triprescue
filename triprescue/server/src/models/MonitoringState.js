const mongoose = require('mongoose');

const monitoringStateSchema = new mongoose.Schema(
  {
    sessionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'RecoverySession',
      required: true,
      unique: true,
      index: true,
    },
    tripId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Trip',
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ['ACTIVE', 'PAUSED', 'STOPPED'],
      default: 'ACTIVE',
    },
    lastCheckedAt: {
      type: Date,
      default: null,
    },
    lastObservation: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    lastEventFingerprint: {
      type: String,
      default: null,
    },
    lastTriggeredEvent: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    replanCount: {
      type: Number,
      default: 0,
    },
    lastReplanAt: {
      type: Date,
      default: null,
    },
    history: {
      type: [mongoose.Schema.Types.Mixed],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('MonitoringState', monitoringStateSchema);
