const express = require('express');
const router = express.Router();
const tripController = require('../controllers/trip.controller');
const agentController = require('../agent/controller');

router.post('/', tripController.createTrip);
router.get('/', tripController.getAllTrips);
router.get('/:id', tripController.getTripById);
router.patch('/:id', tripController.patchTrip);
router.put('/:id', tripController.updateTrip);
router.delete('/:id', tripController.deleteTrip);
router.post('/:id/segments', tripController.addSegment);
router.post('/:id/disruption', tripController.reportDisruption);
router.post('/:id/recovery-session', tripController.createRecoverySession);

// Phase 2 Agent Recovery start endpoint
router.post('/:id/recovery/start', agentController.startRecovery);

module.exports = router;
