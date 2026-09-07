const mongoose = require('mongoose');
const { getProvider } = require('../providers');
const { notificationService } = require('../notifications');
const CompensationCase = require('../models/CompensationCase');
const Trip = require('../models/Trip');

class CompensationService {
  /**
   * Check compensation applicability and generate editable draft claim.
   * @param {string|mongoose.Types.ObjectId} tripId
   * @param {Object} [overrideFacts]
   * @param {string} [sessionId]
   * @returns {Promise<Object>} Compensation case
   */
  async check(tripId, overrideFacts = {}, sessionId = null) {
    let disruptionFacts = {
      delayMinutes: overrideFacts.delayMinutes || 180,
      disruptionType: overrideFacts.disruptionType || 'FLIGHT_DELAYED',
      carrier: overrideFacts.carrier || 'Operating Airline',
      flightNumber: overrideFacts.flightNumber || 'AI 101',
      origin: overrideFacts.origin || 'DEL',
      destination: overrideFacts.destination || 'JAI',
    };

    let passengerInfo = {
      passengerName: overrideFacts.passengerName || 'Traveler',
      pnr: overrideFacts.pnr || 'PNR123',
    };

    if (mongoose.connection.readyState === 1 && tripId) {
      try {
        const trip = await Trip.findById(tripId);
        if (trip) {
          disruptionFacts = {
            delayMinutes: overrideFacts.delayMinutes || trip.disruption?.delayMinutes || 180,
            disruptionType: overrideFacts.disruptionType || trip.disruption?.type || 'FLIGHT_DELAYED',
            carrier: overrideFacts.carrier || trip.itinerary?.[0]?.carrier || 'Airline',
            flightNumber: overrideFacts.flightNumber || trip.itinerary?.[0]?.identifier || 'FL-001',
            origin: overrideFacts.origin || trip.origin || 'DEL',
            destination: overrideFacts.destination || trip.destination || 'JAI',
          };
          passengerInfo = {
            passengerName: trip.passengerName || 'Traveler',
            pnr: overrideFacts.pnr || 'PNR-REC',
          };
        }
      } catch (err) {
        console.warn(`[CompensationService] Trip lookup warning: ${err.message}`);
      }
    }

    const provider = getProvider('compensation');
    const result = await provider.checkCompensation(disruptionFacts, passengerInfo);

    const caseData = {
      caseId: `CMP-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
      tripId: tripId || new mongoose.Types.ObjectId(),
      sessionId: sessionId || null,
      status: result.status,
      framework: result.framework,
      draftClaim: result.draftClaim,
      requestedEvidence: result.requestedEvidence,
      uncertainties: result.uncertainties,
      submitted: false,
      disclaimer: result.disclaimer,
      createdAt: new Date(),
    };

    let persisted = caseData;
    if (mongoose.connection.readyState === 1) {
      try {
        persisted = await CompensationCase.create(caseData);
      } catch (e) {
        console.warn(`[CompensationService] Persistence warning: ${e.message}`);
      }
    }

    // Emit notification
    try {
      await notificationService.emitNotification('COMPENSATION_REVIEW_READY', {
        tripId,
        sessionId,
        title: 'Compensation Review Prepared',
        message: `Draft compensation claim prepared under ${result.framework}. Status: ${result.status}.`,
        metadata: { caseId: persisted.caseId, status: result.status },
      });
    } catch (notifErr) {
      console.warn(`[CompensationService] Notification warning: ${notifErr.message}`);
    }

    return persisted;
  }

  async getCaseByTripId(tripId) {
    if (mongoose.connection.readyState === 1) {
      return await CompensationCase.findOne({ tripId }).sort({ createdAt: -1 }).lean();
    }
    return null;
  }
}

module.exports = new CompensationService();
