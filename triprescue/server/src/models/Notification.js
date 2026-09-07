const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
  {
    notificationId: {
      type: String,
      required: true,
      unique: true,
      default: () => `NTF-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
    },
    sessionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'RecoverySession',
      default: null,
    },
    tripId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Trip',
      default: null,
    },
    type: {
      type: String,
      required: true,
      enum: [
        'DISRUPTION_DETECTED',
        'RECOVERY_PLAN_READY',
        'CONNECTION_AT_RISK',
        'PLAN_INVALIDATED',
        'APPROVAL_REQUIRED',
        'RECOVERY_UPDATED',
        'INSURANCE_REVIEW_READY',
        'COMPENSATION_REVIEW_READY',
        'CALENDAR_CONFLICT',
        'CALENDAR_UPDATED',
      ],
    },
    channel: {
      type: String,
      enum: ['dashboard', 'email'],
      default: 'dashboard',
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    message: {
      type: String,
      required: true,
      trim: true,
    },
    status: {
      type: String,
      enum: ['UNREAD', 'READ', 'DISMISSED'],
      default: 'UNREAD',
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
    readAt: {
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

notificationSchema.index({ tripId: 1, status: 1 });
notificationSchema.index({ sessionId: 1, status: 1 });
notificationSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Notification', notificationSchema);
