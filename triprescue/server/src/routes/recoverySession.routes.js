const express = require('express');
const router = express.Router();
const recoverySessionController = require('../controllers/recoverySession.controller');
const agentController = require('../agent/controller');

// Existing endpoint from Phase 1
router.get('/:id', recoverySessionController.getRecoverySessionById);

// Phase 2 Agent recovery endpoints
router.post('/:id/replan', (req, res, next) => agentController.replan(req, res, next));
router.post('/:id/simulate', (req, res, next) => agentController.simulate(req, res, next));
router.get('/:id/events', (req, res, next) => agentController.getEvents(req, res, next));
router.get('/:id/plans', (req, res, next) => agentController.getPlans(req, res, next));

// Phase 5 External Handoff endpoints
router.post('/:id/approve', (req, res, next) => agentController.approveRecovery(req, res, next));
router.post('/:id/handoff', (req, res, next) => agentController.executeRecoveryHandoff(req, res, next));

// Phase 14 Monitoring endpoints: /api/recovery-sessions/:id/monitor/*
const monitoringRoutes = require('./monitoring.routes');
router.use('/:id/monitor', monitoringRoutes);

module.exports = router;
