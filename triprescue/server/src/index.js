const dotenv = require('dotenv');
dotenv.config();

const app = require('./app');
const { connectDB } = require('./config/database');

const PORT = process.env.PORT || 5000;

async function startServer() {
  try {
    await connectDB();
    const server = app.listen(PORT, () => {
      console.log(`[TripRescue] Server running on port ${PORT}`);
      console.log(`[TripRescue] Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`[TripRescue] Demo Mode: ${process.env.DEMO_MODE || 'true'}`);
    });

    const shutdown = async (signal) => {
      console.log(`\n[TripRescue] ${signal} received. Shutting down gracefully...`);
      server.close(() => {
        console.log('[TripRescue] HTTP server closed.');
        const mongoose = require('mongoose');
        mongoose.connection.close(false).then(() => {
          console.log('[TripRescue] MongoDB connection closed.');
          process.exit(0);
        });
      });
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (error) {
    console.error('[TripRescue] Failed to start server:', error.message);
    process.exit(1);
  }
}

startServer();
