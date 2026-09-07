const express = require('express');
const router = express.Router();
const agentController = require('../agent/controller');

// Phase 5 API specifications: POST /api/recovery/:id/approve & POST /api/recovery/:id/handoff
router.post('/:id/approve', (req, res, next) => agentController.approveRecovery(req, res, next));
router.post('/:id/handoff', (req, res, next) => agentController.executeRecoveryHandoff(req, res, next));

// Phase 13 What-if Simulation API alias: POST /api/recovery/:id/simulate
router.post('/:id/simulate', (req, res, next) => agentController.simulate(req, res, next));

// Phase 14 Monitoring endpoints: /api/recovery/:id/monitor/*
const monitoringRoutes = require('./monitoring.routes');
router.use('/:id/monitor', monitoringRoutes);

module.exports = router;
