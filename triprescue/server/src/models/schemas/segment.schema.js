const mongoose = require('mongoose');
const locationSchema = require('./location.schema');

const itinerarySegmentSchema = new mongoose.Schema(
  {
    segmentId: {
      type: String,
      required: [true, 'Segment ID is required'],
      default: () => `SEG-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    },
    transportMode: {
      type: String,
      required: [true, 'Transport mode is required'],
      enum: {
        values: ['flight', 'train', 'bus', 'ground', 'hotel'],
        message: '{VALUE} is not a supported transport mode',
      },
      lowercase: true,
      trim: true,
    },
    origin: {
      type: locationSchema,
      required: [true, 'Origin location is required'],
    },
    destination: {
      type: locationSchema,
      required: [true, 'Destination location is required'],
    },
    departure: {
      type: Date,
      required: [true, 'Departure time is required'],
    },
    arrival: {
      type: Date,
      required: [true, 'Arrival time is required'],
    },
    carrier: {
      type: String,
      trim: true,
      default: '',
    },
    identifier: {
      type: String,
      trim: true,
      default: '',
    },
    status: {
      type: String,
      enum: {
        values: ['CONFIRMED', 'SCHEDULED', 'DELAYED', 'CANCELLED', 'COMPLETED', 'PENDING'],
        message: '{VALUE} is not a valid segment status',
      },
      default: 'CONFIRMED',
      uppercase: true,
    },
  },
  { _id: false, timestamps: true }
);

module.exports = itinerarySegmentSchema;
