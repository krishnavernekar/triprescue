const mongoose = require('mongoose');

const disruptionSchema = new mongoose.Schema(
  {
    disruptionId: {
      type: String,
      default: () => `DIS-${Date.now()}`,
    },
    type: {
      type: String,
      required: [true, 'Disruption type is required'],
      enum: {
        values: [
          'FLIGHT_DELAYED',
          'FLIGHT_CANCELLED',
          'TRAIN_DELAYED',
          'TRAIN_CANCELLED',
          'BUS_DELAYED',
          'BUS_CANCELLED',
          'HOTEL_CANCELLED',
          'MISSED_CONNECTION',
          'AIRPORT_DISRUPTION',
          'WEATHER_DISRUPTION',
          'OTHER',
        ],
        message: '{VALUE} is not a supported disruption type',
      },
      uppercase: true,
    },
    affectedSegmentId: {
      type: String,
      default: null,
    },
    detectedAt: {
      type: Date,
      default: Date.now,
    },
    expectedImpact: {
      type: String,
      default: '',
    },
    description: {
      type: String,
      default: '',
    },
    source: {
      type: String,
      default: 'USER',
    },
    status: {
      type: String,
      enum: {
        values: ['ACTIVE', 'RESOLVED', 'ACKNOWLEDGED', 'INVESTIGATING'],
        message: '{VALUE} is not a valid disruption status',
      },
      default: 'ACTIVE',
      uppercase: true,
    },
  },
  { _id: false, timestamps: true }
);

module.exports = disruptionSchema;
