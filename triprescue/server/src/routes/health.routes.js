const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const config = require('../config/environment');

router.get('/', (req, res) => {
  const healthcheck = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: config.nodeEnv,
    demoMode: config.demoMode,
    database: {
      status: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    },
    providers: config.providers,
    version: '1.0.0',
  };

  res.json(healthcheck);
});

module.exports = router;
