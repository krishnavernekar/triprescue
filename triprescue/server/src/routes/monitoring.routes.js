const express = require('express');
const router = express.Router({ mergeParams: true });
const { monitoringService } = require('../monitoring');

/**
 * POST /api/recovery/:id/monitor/start
 * Start active bounded monitoring.
 */
router.post('/start', async (req, res, next) => {
  try {
    const sessionId = req.params.id;
    const intervalMs = req.body.intervalMs;
    const result = await monitoringService.startMonitoring(sessionId, intervalMs);
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/recovery/:id/monitor/stop
 * Stop monitoring.
 */
router.post('/stop', async (req, res, next) => {
  try {
    const sessionId = req.params.id;
    const result = await monitoringService.stopMonitoring(sessionId);
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/recovery/:id/monitor/pause
 * Pause monitoring.
 */
router.post('/pause', async (req, res, next) => {
  try {
    const sessionId = req.params.id;
    const result = await monitoringService.pauseMonitoring(sessionId);
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/recovery/:id/monitor/status
 * Get current monitoring status and recent observations.
 */
router.get('/status', async (req, res, next) => {
  try {
    const sessionId = req.params.id;
    const result = await monitoringService.getStatus(sessionId);
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/recovery/:id/monitor/check
 * Trigger a single manual check cycle (with optional mock override).
 */
router.post('/check', async (req, res, next) => {
  try {
    const sessionId = req.params.id;
    const mockOverride = req.body.mockOverride || (req.body.eventType ? req.body : null);
    const result = await monitoringService.checkTrip(sessionId, mockOverride);
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
