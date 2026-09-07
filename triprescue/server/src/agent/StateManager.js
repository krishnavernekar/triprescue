/**
 * StateManager — Persistent Recovery State Management.
 *
 * Coordinates MongoDB persistence for RecoverySession documents.
 * Ensures state survives server restarts while offering fast in-memory caching.
 */

const RecoverySession = require('../models/RecoverySession');
const Trip = require('../models/Trip');

class StateManager {
  constructor() {
    this._cache = new Map();
  }

  /**
   * Load authoritative recovery session by ID with populated trip reference.
   * @param {string} sessionId - RecoverySession MongoDB _id
   * @returns {Promise<Object>} Mongoose document
   */
  async loadSession(sessionId) {
    const session = await RecoverySession.findById(sessionId).populate('tripId');
    if (!session) {
      const err = new Error(`Recovery session ${sessionId} not found`);
      err.statusCode = 404;
      err.code = 'NOT_FOUND';
      throw err;
    }

    this._cache.set(sessionId.toString(), session);
    return session;
  }

  /**
   * Find recovery session by Trip ID.
   * @param {string} tripId - Trip MongoDB _id
   * @returns {Promise<Object>}
   */
  async getSessionByTripId(tripId) {
    let session = await RecoverySession.findOne({ tripId }).sort({ createdAt: -1 });
    if (!session) {
      // Find trip and construct a session if not exists
      const trip = await Trip.findById(tripId);
      if (!trip) {
        const err = new Error(`Trip ${tripId} not found`);
        err.statusCode = 404;
        err.code = 'NOT_FOUND';
        throw err;
      }

      session = new RecoverySession({
        tripId: trip._id,
        objective: trip.recoveryObjective,
        objectiveSnapshot: trip.recoveryObjective,
        currentItinerary: trip.itinerary,
        itinerarySnapshot: trip.itinerary,
        disruption: trip.disruption || {
          type: 'OTHER',
          description: 'Initial disruption state',
          detectedAt: new Date(),
        },
        disruptionSnapshot: trip.disruption,
        status: 'READY',
      });
      await session.save();
      trip.currentRecoverySessionId = session._id;
      await trip.save();
    }

    return session;
  }

  /**
   * Persist authoritative RecoverySession state to MongoDB.
   * @param {Object} session - Mongoose document
   * @returns {Promise<Object>}
   */
  async saveSession(session) {
    const saved = await session.save();
    this._cache.set(saved._id.toString(), saved);
    return saved;
  }

  /**
   * Update trip document status in sync with recovery session.
   * @param {string} tripId - Trip ID
   * @param {string} status - Trip status (e.g. 'RECOVERING', 'RECOVERED')
   */
  async updateTripStatus(tripId, status) {
    await Trip.findByIdAndUpdate(tripId, { status });
  }
}

module.exports = new StateManager();
