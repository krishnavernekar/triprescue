const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/triprescue';
    await mongoose.connect(uri);
    console.log('[TripRescue] MongoDB connected successfully');
  } catch (error) {
    console.error('[TripRescue] MongoDB connection error:', error.message);
    throw error;
  }
};

const disconnectDB = async () => {
  try {
    await mongoose.disconnect();
    console.log('[TripRescue] MongoDB disconnected');
  } catch (error) {
    console.error('[TripRescue] MongoDB disconnect error:', error.message);
  }
};

module.exports = { connectDB, disconnectDB };
