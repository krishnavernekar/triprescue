const express = require('express');
const router = express.Router();
const { compensationService } = require('../compensation');

/**
 * POST /api/compensation/check
 * Evaluates disruption facts and generates an editable claim draft.
 */
router.post('/check', async (req, res, next) => {
  try {
    const { tripId, overrideFacts, sessionId } = req.body;
    const result = await compensationService.check(tripId, overrideFacts, sessionId);
    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/compensation/:tripId
 * Retrieve the latest draft compensation case for a trip.
 */
router.get('/:tripId', async (req, res, next) => {
  try {
    const result = await compensationService.getCaseByTripId(req.params.tripId);
    if (!result) {
      return res.status(404).json({ success: false, message: 'No compensation case found for this trip' });
    }
    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
