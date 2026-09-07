const Trip = require('../models/Trip');
const RecoverySession = require('../models/RecoverySession');

function normalizeLocation(loc) {
  if (!loc) return null;
  if (typeof loc === 'string') {
    return {
      code: loc.trim().toUpperCase(),
      name: loc.trim().toUpperCase(),
      type: 'airport',
    };
  }
  if (typeof loc === 'object') {
    return {
      code: (loc.code || loc.name || '').trim().toUpperCase(),
      name: loc.name || loc.code || '',
      type: loc.type || 'airport',
      city: loc.city || '',
      country: loc.country || '',
      timezone: loc.timezone || 'UTC',
      latitude: loc.latitude ?? null,
      longitude: loc.longitude ?? null,
    };
  }
  return loc;
}

const createTrip = async (req, res, next) => {
  try {
    const {
      passengerName,
      passengerCount = 1,
      origin,
      destination,
      departureTime,
      arrivalDeadline,
      maxAdditionalBudget = 0,
      priority = 'arrival_time',
      riskTolerance = 'MEDIUM',
      status,
      itinerary = [],
      hardConstraints,
      softConstraints,
      optimizationPriorities,
      recoveryObjective,
    } = req.body;

    // Explicit validation checks for cleaner messages
    if (!passengerName || !passengerName.trim()) {
      const err = new Error('Passenger name is required');
      err.statusCode = 400;
      err.code = 'VALIDATION_ERROR';
      throw err;
    }

    if (passengerCount !== undefined && (typeof passengerCount !== 'number' || passengerCount < 1)) {
      const err = new Error('Passenger count must be at least 1');
      err.statusCode = 400;
      err.code = 'VALIDATION_ERROR';
      throw err;
    }

    if (!origin || !origin.trim()) {
      const err = new Error('Origin is required');
      err.statusCode = 400;
      err.code = 'VALIDATION_ERROR';
      throw err;
    }

    if (!destination || !destination.trim()) {
      const err = new Error('Destination is required');
      err.statusCode = 400;
      err.code = 'VALIDATION_ERROR';
      throw err;
    }

    if (!departureTime) {
      const err = new Error('Departure time is required');
      err.statusCode = 400;
      err.code = 'VALIDATION_ERROR';
      throw err;
    }

    if (maxAdditionalBudget !== undefined && (typeof maxAdditionalBudget !== 'number' || maxAdditionalBudget < 0)) {
      const err = new Error('Budget cannot be negative');
      err.statusCode = 400;
      err.code = 'VALIDATION_ERROR';
      throw err;
    }

    if (arrivalDeadline && new Date(arrivalDeadline) < new Date(departureTime)) {
      const err = new Error('Arrival deadline must be after departure time');
      err.statusCode = 400;
      err.code = 'VALIDATION_ERROR';
      throw err;
    }

    // Build the recovery objective
    const builtObjective = recoveryObjective || {
      origin: origin.trim().toUpperCase(),
      destination: destination.trim().toUpperCase(),
      departureTime: new Date(departureTime),
      arrivalDeadline: arrivalDeadline ? new Date(arrivalDeadline) : null,
      maxAdditionalBudget,
      passengerCount,
      priority,
      riskTolerance: riskTolerance.toUpperCase(),
      hardConstraints: hardConstraints || {
        destinationRequired: true,
        deadlineRequired: Boolean(arrivalDeadline),
        budgetRequired: maxAdditionalBudget !== undefined,
        passengerCount,
        accessibilityRequirements: [],
      },
      softConstraints: softConstraints || {
        preferredAirline: null,
        preferredTransportMode: null,
        preferredAirport: null,
        maxTransfers: 1,
        comfort: 'standard',
      },
      optimizationPriorities: optimizationPriorities || [
        'arrival_time',
        'cost',
        'reliability',
        'transfers',
      ],
    };

    const tripData = {
      passengerName: passengerName.trim(),
      passengerCount,
      origin: origin.trim().toUpperCase(),
      destination: destination.trim().toUpperCase(),
      departureTime: new Date(departureTime),
      arrivalDeadline: arrivalDeadline ? new Date(arrivalDeadline) : null,
      maxAdditionalBudget,
      priority,
      riskTolerance: riskTolerance.toUpperCase(),
      status: status || 'ACTIVE',
      itinerary,
      recoveryObjective: builtObjective,
    };

    const trip = new Trip(tripData);
    const savedTrip = await trip.save();
    res.status(201).json({ success: true, data: savedTrip });
  } catch (error) {
    next(error);
  }
};

const getAllTrips = async (req, res, next) => {
  try {
    const trips = await Trip.find().sort({ createdAt: -1 });
    res.json({ success: true, data: trips, count: trips.length });
  } catch (error) {
    next(error);
  }
};

const getTripById = async (req, res, next) => {
  try {
    const trip = await Trip.findById(req.params.id).populate('currentRecoverySessionId');
    if (!trip) {
      const error = new Error('Trip not found');
      error.statusCode = 404;
      error.code = 'NOT_FOUND';
      throw error;
    }
    res.json({ success: true, data: trip });
  } catch (error) {
    next(error);
  }
};

const patchTrip = async (req, res, next) => {
  try {
    const trip = await Trip.findById(req.params.id);
    if (!trip) {
      const error = new Error('Trip not found');
      error.statusCode = 404;
      error.code = 'NOT_FOUND';
      throw error;
    }

    // Merge updates
    const updates = req.body;
    Object.keys(updates).forEach((key) => {
      if (key === 'recoveryObjective') {
        trip.recoveryObjective = {
          ...trip.recoveryObjective.toObject(),
          ...updates.recoveryObjective,
        };
      } else {
        trip[key] = updates[key];
      }
    });

    const savedTrip = await trip.save();
    res.json({ success: true, data: savedTrip });
  } catch (error) {
    next(error);
  }
};

const updateTrip = async (req, res, next) => {
  try {
    const trip = await Trip.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });
    if (!trip) {
      const error = new Error('Trip not found');
      error.statusCode = 404;
      error.code = 'NOT_FOUND';
      throw error;
    }
    res.json({ success: true, data: trip });
  } catch (error) {
    next(error);
  }
};

const deleteTrip = async (req, res, next) => {
  try {
    const trip = await Trip.findByIdAndDelete(req.params.id);
    if (!trip) {
      const error = new Error('Trip not found');
      error.statusCode = 404;
      error.code = 'NOT_FOUND';
      throw error;
    }
    res.json({ success: true, data: {}, message: 'Trip deleted successfully' });
  } catch (error) {
    next(error);
  }
};

const addSegment = async (req, res, next) => {
  try {
    const trip = await Trip.findById(req.params.id);
    if (!trip) {
      const error = new Error('Trip not found');
      error.statusCode = 404;
      error.code = 'NOT_FOUND';
      throw error;
    }

    const {
      transportMode,
      origin,
      destination,
      departure,
      arrival,
      carrier = '',
      identifier = '',
      status = 'CONFIRMED',
      segmentId,
    } = req.body;

    const allowedModes = ['flight', 'train', 'bus', 'ground', 'hotel'];
    if (!transportMode || !allowedModes.includes(transportMode.toLowerCase())) {
      const error = new Error(`Transport mode '${transportMode}' is invalid. Supported: ${allowedModes.join(', ')}`);
      error.statusCode = 400;
      error.code = 'VALIDATION_ERROR';
      throw error;
    }

    const normOrigin = normalizeLocation(origin);
    const normDestination = normalizeLocation(destination);

    if (!normOrigin || !normOrigin.code) {
      const error = new Error('Origin location is required');
      error.statusCode = 400;
      error.code = 'VALIDATION_ERROR';
      throw error;
    }

    if (!normDestination || !normDestination.code) {
      const error = new Error('Destination location is required');
      error.statusCode = 400;
      error.code = 'VALIDATION_ERROR';
      throw error;
    }

    if (!departure) {
      const error = new Error('Departure time is required');
      error.statusCode = 400;
      error.code = 'VALIDATION_ERROR';
      throw error;
    }

    if (!arrival) {
      const error = new Error('Arrival time is required');
      error.statusCode = 400;
      error.code = 'VALIDATION_ERROR';
      throw error;
    }

    const newSegment = {
      segmentId: segmentId || `SEG-${String(trip.itinerary.length + 1).padStart(3, '0')}`,
      transportMode: transportMode.toLowerCase(),
      origin: normOrigin,
      destination: normDestination,
      departure: new Date(departure),
      arrival: new Date(arrival),
      carrier,
      identifier,
      status: status.toUpperCase(),
    };

    trip.itinerary.push(newSegment);
    const updatedTrip = await trip.save();

    res.status(201).json({
      success: true,
      data: updatedTrip,
    });
  } catch (error) {
    next(error);
  }
};

const reportDisruption = async (req, res, next) => {
  try {
    const trip = await Trip.findById(req.params.id);
    if (!trip) {
      const error = new Error('Trip not found');
      error.statusCode = 404;
      error.code = 'NOT_FOUND';
      throw error;
    }

    const {
      type,
      affectedSegmentId = null,
      detectedAt = new Date(),
      expectedImpact = '',
      description = '',
      source = 'USER',
    } = req.body;

    const allowedTypes = [
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
    ];

    if (!type || !allowedTypes.includes(type.toUpperCase())) {
      const error = new Error(`Disruption type '${type}' is invalid. Supported: ${allowedTypes.join(', ')}`);
      error.statusCode = 400;
      error.code = 'VALIDATION_ERROR';
      throw error;
    }

    const disruptionData = {
      disruptionId: `DIS-${Date.now()}`,
      type: type.toUpperCase(),
      affectedSegmentId,
      detectedAt: new Date(detectedAt),
      expectedImpact,
      description,
      source,
      status: 'ACTIVE',
    };

    // Update trip status and preserve original itinerary
    trip.status = 'DISRUPTED';
    trip.disruption = disruptionData;
    trip.disruptions.push(disruptionData);
    trip.disruptionType = type.toLowerCase();

    // Create RecoverySession
    const recoverySession = new RecoverySession({
      tripId: trip._id,
      objective: trip.recoveryObjective,
      objectiveSnapshot: trip.recoveryObjective,
      currentItinerary: trip.itinerary,
      itinerarySnapshot: trip.itinerary,
      disruption: disruptionData,
      disruptionSnapshot: disruptionData,
      status: 'READY',
      currentStatus: 'READY',
    });

    const savedSession = await recoverySession.save();
    trip.currentRecoverySessionId = savedSession._id;
    const savedTrip = await trip.save();

    res.status(201).json({
      success: true,
      data: {
        trip: savedTrip,
        recoverySession: savedSession,
      },
    });
  } catch (error) {
    next(error);
  }
};

const createRecoverySession = async (req, res, next) => {
  try {
    const trip = await Trip.findById(req.params.id);
    if (!trip) {
      const error = new Error('Trip not found');
      error.statusCode = 404;
      error.code = 'NOT_FOUND';
      throw error;
    }

    const disruptionData = trip.disruption || (trip.disruptions && trip.disruptions.length > 0 ? trip.disruptions[trip.disruptions.length - 1] : {
      type: 'OTHER',
      description: 'Manual recovery session trigger',
      detectedAt: new Date(),
      status: 'ACTIVE',
    });

    const recoverySession = new RecoverySession({
      tripId: trip._id,
      objective: trip.recoveryObjective,
      objectiveSnapshot: trip.recoveryObjective,
      currentItinerary: trip.itinerary,
      itinerarySnapshot: trip.itinerary,
      disruption: disruptionData,
      disruptionSnapshot: disruptionData,
      status: 'READY',
      currentStatus: 'READY',
    });

    const savedSession = await recoverySession.save();
    trip.currentRecoverySessionId = savedSession._id;
    await trip.save();

    res.status(201).json({
      success: true,
      data: savedSession,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createTrip,
  getAllTrips,
  getTripById,
  patchTrip,
  updateTrip,
  deleteTrip,
  addSegment,
  reportDisruption,
  createRecoverySession,
};
