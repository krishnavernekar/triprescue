const mongoose = require('mongoose');

const locationSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: [true, 'Location code is required'],
      trim: true,
      uppercase: true,
    },
    name: {
      type: String,
      trim: true,
      default: '',
    },
    type: {
      type: String,
      enum: {
        values: [
          'airport',
          'railway_station',
          'bus_station',
          'hotel',
          'city',
          'address',
          'point_of_interest',
        ],
        message: '{VALUE} is not a supported location type',
      },
      default: 'airport',
    },
    city: {
      type: String,
      trim: true,
      default: '',
    },
    country: {
      type: String,
      trim: true,
      default: '',
    },
    timezone: {
      type: String,
      trim: true,
      default: 'UTC',
    },
    latitude: {
      type: Number,
      default: null,
    },
    longitude: {
      type: Number,
      default: null,
    },
  },
  { _id: false }
);

module.exports = locationSchema;
