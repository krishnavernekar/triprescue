const express = require('express');
const router = express.Router();
const { insuranceService } = require('../insurance');

/**
 * POST /api/insurance/analyze
 * Analyzes policy text against disruption facts.
 */
router.post('/analyze', async (req, res, next) => {
  try {
    const { tripId, policyText, policyName, sessionId } = req.body;
    const analysis = await insuranceService.analyze(tripId, policyText, policyName, sessionId);
    res.status(200).json({
      success: true,
      data: analysis,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/insurance/:tripId
 * Retrieve the latest policy analysis for a trip.
 */
router.get('/:tripId', async (req, res, next) => {
  try {
    const analysis = await insuranceService.getAnalysisByTripId(req.params.tripId);
    if (!analysis) {
      return res.status(404).json({ success: false, message: 'No insurance analysis found for this trip' });
    }
    res.status(200).json({
      success: true,
      data: analysis,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
