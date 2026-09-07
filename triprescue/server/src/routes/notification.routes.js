const express = require('express');
const router = express.Router();
const { notificationService } = require('../notifications');

/**
 * GET /api/notifications
 * List active notifications.
 */
router.get('/', async (req, res, next) => {
  try {
    const filter = {};
    if (req.query.tripId) filter.tripId = req.query.tripId;
    if (req.query.sessionId) filter.sessionId = req.query.sessionId;
    if (req.query.status) filter.status = req.query.status;

    const notifications = await notificationService.getNotifications(filter);
    res.status(200).json({
      success: true,
      count: notifications.length,
      data: notifications,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/notifications/stream
 * Server-Sent Events stream for real-time notifications.
 */
router.get('/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  // Send initial keepalive
  res.write('event: connected\ndata: {}\n\n');

  notificationService.addStreamClient(res);

  req.on('close', () => {
    notificationService.removeStreamClient(res);
  });
});

/**
 * PATCH /api/notifications/:id/read
 * Mark notification as read.
 */
router.patch('/:id/read', async (req, res, next) => {
  try {
    const updated = await notificationService.markAsRead(req.params.id);
    if (!updated) {
      return res.status(404).json({ success: false, message: 'Notification not found' });
    }
    res.status(200).json({
      success: true,
      data: updated,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
