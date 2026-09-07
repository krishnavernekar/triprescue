const express = require('express');
const router = express.Router();
const { calendarService } = require('../calendar');

/**
 * GET /api/calendar/events
 * Retrieve calendar events.
 */
router.get('/events', async (req, res, next) => {
  try {
    const events = await calendarService.getEvents();
    res.status(200).json({
      success: true,
      count: events.length,
      data: events,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/calendar/check-conflicts
 * Detect conflicts against recovery arrival.
 */
router.post('/check-conflicts', async (req, res, next) => {
  try {
    const { arrivalTime, tripId, sessionId } = req.body;
    const result = await calendarService.checkAndNotifyConflicts(arrivalTime, { tripId, sessionId });
    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/calendar/prepare-update
 * Prepare a proposed update without mutating calendar.
 */
router.post('/prepare-update', async (req, res, next) => {
  try {
    const { eventId, proposedStart, proposedEnd } = req.body;
    const proposal = await calendarService.prepareEventUpdate(eventId, proposedStart, proposedEnd);
    res.status(200).json({
      success: true,
      data: proposal,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/calendar/update
 * Apply approved calendar modification.
 */
router.post('/update', async (req, res, next) => {
  try {
    const { eventId, updates, userApproved } = req.body;
    const result = await calendarService.updateEvent(eventId, updates, userApproved);
    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
