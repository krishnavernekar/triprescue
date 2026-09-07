const mongoose = require('mongoose');
const { getProvider } = require('../providers');
const { notificationService } = require('../notifications');
const InsuranceAnalysis = require('../models/InsuranceAnalysis');
const Trip = require('../models/Trip');

class InsuranceService {
  /**
   * Lightweight text extraction and sanitization from policy input.
   * Treats all policy text as untrusted data.
   * @param {string|Object} input
   * @returns {string} Plain text
   */
  extractText(input) {
    if (!input) {
      throw new Error('Policy input is required');
    }

    let text = '';
    if (typeof input === 'string') {
      text = input;
    } else if (typeof input === 'object' && input.policyText) {
      text = String(input.policyText);
    } else if (typeof input === 'object' && input.content) {
      text = String(input.content);
    } else {
      throw new Error('Unsupported policy document payload format');
    }

    const trimmed = text.trim();
    if (trimmed.length === 0) {
      throw new Error('Extracted policy text is empty');
    }

    // Enforce 1MB payload limit for security
    if (trimmed.length > 1024 * 1024) {
      throw new Error('Policy document exceeds maximum allowable size (1MB)');
    }

    // Strip non-printable ASCII control characters (prompt injection / binary safety)
    return trimmed.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
  }

  /**
   * Analyze policy text against trip disruption facts.
   * @param {string|mongoose.Types.ObjectId} tripId
   * @param {string|Object} policyInput
   * @param {string} [policyName]
   * @param {string} [sessionId]
   * @returns {Promise<Object>} Insurance analysis
   */
  async analyze(tripId, policyInput, policyName = 'Travel Protection Policy', sessionId = null) {
    const policyText = this.extractText(policyInput);

    let disruptionFacts = { delayMinutes: 0, disruptionType: 'SCHEDULE_DISRUPTION', carrier: 'Carrier' };

    if (mongoose.connection.readyState === 1 && tripId) {
      try {
        const trip = await Trip.findById(tripId);
        if (trip) {
          disruptionFacts = {
            delayMinutes: trip.disruption?.delayMinutes || 180,
            disruptionType: trip.disruption?.type || 'FLIGHT_DELAYED',
            carrier: trip.itinerary?.[0]?.carrier || 'Airline',
            flightNumber: trip.itinerary?.[0]?.identifier || '',
            origin: trip.origin,
            destination: trip.destination,
          };
        }
      } catch (err) {
        console.warn(`[InsuranceService] Trip lookup warning: ${err.message}`);
      }
    }

    const provider = getProvider('insurance');
    const result = await provider.analyzePolicy(policyText, disruptionFacts);

    const recordData = {
      analysisId: `INS-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
      tripId: tripId || new mongoose.Types.ObjectId(),
      sessionId: sessionId || null,
      policyName: policyName || 'Uploaded Travel Policy',
      status: result.status,
      disruptionFacts,
      relevantClauses: result.relevantClauses,
      evidenceChecklist: result.evidenceChecklist,
      uncertainties: result.uncertainties,
      disclaimer: result.disclaimer,
      createdAt: new Date(),
    };

    let persisted = recordData;
    if (mongoose.connection.readyState === 1) {
      try {
        persisted = await InsuranceAnalysis.create(recordData);
      } catch (e) {
        console.warn(`[InsuranceService] Persistence warning: ${e.message}`);
      }
    }

    // Emit notification
    try {
      await notificationService.emitNotification('INSURANCE_REVIEW_READY', {
        tripId,
        sessionId,
        title: 'Insurance Policy Review Ready',
        message: `Identified ${result.relevantClauses?.length || 0} potentially relevant clause(s) for your disruption. Status: ${result.status}.`,
        metadata: { analysisId: persisted.analysisId, status: result.status },
      });
    } catch (notifErr) {
      console.warn(`[InsuranceService] Notification warning: ${notifErr.message}`);
    }

    return persisted;
  }

  async getAnalysisByTripId(tripId) {
    if (mongoose.connection.readyState === 1) {
      return await InsuranceAnalysis.findOne({ tripId }).sort({ createdAt: -1 }).lean();
    }
    return null;
  }
}

module.exports = new InsuranceService();
