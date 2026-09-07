/**
 * ExternalHandoffService — Phase 5 Core Handoff Orchestrator.
 *
 * Sequence of events enforced:
 *   Plan Selected
 *         ↓
 *   Plan Validated (Status: SELECTED or VALID, Freshness: FRESH, Constraints: Passed)
 *         ↓
 *   Handoff Available
 *         ↓
 *   User Approval Required (POST /api/recovery/:id/approve)
 *         ↓
 *   User Approves
 *         ↓
 *   Handoff Validated Again
 *         ↓
 *   External Link Opened (POST /api/recovery/:id/handoff)
 *         ↓
 *   Handoff Logged
 *         ↓
 *   User completes purchase externally on provider website
 *
 * STRICT BOUNDARIES:
 * - NO payment processing.
 * - NO automatic ticket purchase or booking.
 * - NO arbitrary client redirects.
 * - ONLY validated plans and authorized provider domains are handed off.
 */

const ExternalHandoff = require('../models/ExternalHandoff');
const RecoverySession = require('../models/RecoverySession');
const deeplinkValidator = require('./deeplinkValidator');
const handoffLogger = require('./handoffLogger');
const dataFreshnessValidator = require('../evaluation/DataFreshnessValidator');
const constraintValidator = require('../evaluation/ConstraintValidator');
const stateManager = require('../agent/StateManager');

class ExternalHandoffService {
  /**
   * Validate that a recovery plan qualifies for external handoff.
   * @param {Object} plan - RecoveryPlan object
   * @param {Object} session - RecoverySession document
   * @returns {{ valid: boolean, error?: string, externalUrl?: string, provider?: string }}
   */
  validatePlanForHandoff(plan, session) {
    if (!plan) {
      return { valid: false, error: 'No recovery plan provided for handoff' };
    }

    // 1. Plan Status Gating
    const currentStatus = (plan.status || '').toUpperCase();

    // Block rejected, invalid, or expired plans
    if (['INVALID', 'REJECTED', 'EXPIRED', 'STALE'].includes(currentStatus)) {
      return {
        valid: false,
        error: 'Plan is ' + currentStatus + '; cannot hand off an invalid, rejected, or expired plan',
      };
    }

    const allowedStatuses = ['SELECTED', 'VALID', 'PLAN_READY', 'AWAITING_APPROVAL'];
    if (!allowedStatuses.includes(currentStatus) && session?.status !== 'AWAITING_APPROVAL' && session?.status !== 'PLAN_READY') {
      return {
        valid: false,
        error: 'Plan with status "' + currentStatus + '" cannot be handed off. Must be VALID or SELECTED.',
      };
    }

    // 2. Data Freshness Check (re-validate data freshness before handoff)
    const freshness = dataFreshnessValidator.evaluatePlanFreshness(plan);
    if (freshness.status === 'STALE') {
      return {
        valid: false,
        error: 'Plan schedule data is STALE. Revalidation required before handoff can proceed.',
      };
    }

    // 3. Hard Constraints Check (if objective is available)
    if (session?.objective) {
      const constraintCheck = constraintValidator.validate(plan, session.objective);
      if (!constraintCheck.valid) {
        return {
          valid: false,
          error: 'Plan violates hard constraints: ' + (constraintCheck.reasons || []).join('; '),
        };
      }
    }

    // 4. External Handoff Structure Check
    const handoffMeta = (plan.externalHandoffs && plan.externalHandoffs[0]) || null;
    const provider = handoffMeta?.provider || plan.segments?.[0]?.carrier || 'Carrier';
    const config = require('../config/environment');
    let externalUrl = (handoffMeta && handoffMeta.url) ? handoffMeta.url : null;

    // If no explicit deeplink exists, construct authorized carrier booking URL
    if (!externalUrl) {
      const normCarrier = provider.toLowerCase();
      const identifier = plan.segments?.[0]?.identifier || '';
      if (normCarrier.includes('indigo') || normCarrier === '6e') {
        externalUrl = `https://www.goindigo.in/booking?flight=${encodeURIComponent(identifier)}`;
      } else if (normCarrier.includes('air india express') || normCarrier === 'ix') {
        externalUrl = `https://express.airindia.com/booking?flight=${encodeURIComponent(identifier)}`;
      } else if (normCarrier.includes('air india') || normCarrier === 'ai') {
        externalUrl = `https://www.airindia.com/booking?flight=${encodeURIComponent(identifier)}`;
      } else if (normCarrier.includes('vistara') || normCarrier === 'uk') {
        externalUrl = `https://www.airvistara.com/booking?flight=${encodeURIComponent(identifier)}`;
      } else if (normCarrier.includes('spicejet') || normCarrier === 'sg') {
        externalUrl = `https://www.spicejet.com/booking?flight=${encodeURIComponent(identifier)}`;
      } else if (normCarrier.includes('akasa') || normCarrier === 'qp') {
        externalUrl = `https://www.akasaair.com/booking?flight=${encodeURIComponent(identifier)}`;
      } else if (normCarrier.includes('alliance') || normCarrier === '9i') {
        externalUrl = `https://www.allianceair.in/booking?flight=${encodeURIComponent(identifier)}`;
      } else if (normCarrier.includes('virgin') || normCarrier === 'vs') {
        externalUrl = `https://www.virginatlantic.com/flights?flight=${encodeURIComponent(identifier)}`;
      } else if (normCarrier.includes('emirates') || normCarrier === 'ek') {
        externalUrl = `https://www.emirates.com/flights?flight=${encodeURIComponent(identifier)}`;
      } else if (normCarrier.includes('qatar') || normCarrier === 'qr') {
        externalUrl = `https://www.qatarairways.com/flights?flight=${encodeURIComponent(identifier)}`;
      } else if (normCarrier.includes('british airways') || normCarrier === 'ba') {
        externalUrl = `https://www.britishairways.com/flights?flight=${encodeURIComponent(identifier)}`;
      } else if (normCarrier.includes('singapore') || normCarrier === 'sq') {
        externalUrl = `https://www.singaporeair.com/flights?flight=${encodeURIComponent(identifier)}`;
      } else if (normCarrier.includes('lufthansa') || normCarrier === 'lh') {
        externalUrl = `https://www.lufthansa.com/flights?flight=${encodeURIComponent(identifier)}`;
      } else if (normCarrier.includes('etihad') || normCarrier === 'ey') {
        externalUrl = `https://www.etihad.com/flights?flight=${encodeURIComponent(identifier)}`;
      } else if (normCarrier.includes('rail') || normCarrier.includes('irctc') || normCarrier.includes('train')) {
        externalUrl = `https://www.irctc.co.in/nget/train-search`;
      } else if (normCarrier.includes('ksrtc')) {
        externalUrl = `https://www.ksrtc.in/oprs-web/guest/home.do`;
      } else if (normCarrier.includes('bus') || normCarrier.includes('redbus')) {
        externalUrl = `https://www.redbus.in/bus-tickets`;
      } else if (normCarrier.includes('marriott') || normCarrier.includes('hotel')) {
        externalUrl = `https://www.marriott.com`;
      } else {
        externalUrl = null;
      }
    }

    if (!externalUrl) {
      return {
        valid: false,
        error: 'Provider link unavailable. We could not find a verified provider link for this option. No booking was made.',
        provider,
      };
    }

    // 5. Deeplink URL & Domain Allowlist Validation
    const urlValidation = deeplinkValidator.validate(externalUrl, provider);
    if (!urlValidation.valid) {
      return {
        valid: false,
        error: 'Deeplink validation failed: ' + urlValidation.error,
        provider,
      };
    }

    return {
      valid: true,
      externalUrl: urlValidation.normalizedUrl,
      provider,
    };
  }

  /**
   * Find or create an ExternalHandoff record for a plan.
   * @param {Object} session - RecoverySession document
   * @param {Object} plan - RecoveryPlan object
   * @returns {Promise<Object>} ExternalHandoff document
   */
  async getOrCreateHandoff(session, plan) {
    const planId = plan.planId;
    let handoff = await ExternalHandoff.findOne({ sessionId: session._id, planId });

    const validation = this.validatePlanForHandoff(plan, session);
    const provider = validation.provider || plan.segments?.[0]?.carrier || 'Carrier';
    const externalUrl = validation.externalUrl || null;

    if (!handoff) {
      handoff = new ExternalHandoff({
        sessionId: session._id,
        planId,
        provider,
        providerType: plan.segments?.[0]?.transportMode || 'flight',
        externalUrl,
        status: validation.valid ? 'AVAILABLE' : 'INVALID',
        metadata: {
          strategy: plan.strategy,
          totalCost: plan.totalCost,
          currency: plan.currency || 'INR',
          transferCount: plan.transferCount,
        },
      });
      await handoff.save();
    } else {
      if (validation.valid && handoff.status === 'INVALID') {
        handoff.status = 'AVAILABLE';
      }
      handoff.externalUrl = externalUrl;
      await handoff.save();
    }

    return handoff;
  }

  /**
   * Step 1: User approves the external handoff.
   * @param {string} sessionId - RecoverySession ID
   * @param {string} [planId] - Specific plan ID (optional, defaults to selectedPlan)
   * @returns {Promise<{ success: boolean, handoff: Object, message: string }>}
   */
  async approveHandoff(sessionId, planId = null) {
    const session = await stateManager.loadSession(sessionId);
    const targetPlan = (planId && (session.candidatePlans || []).find((p) => p.planId === planId)) ||
      session.selectedPlan;

    if (!targetPlan) {
      throw new Error('No valid recovery plan found in session to approve');
    }

    // Validate plan readiness
    const valResult = this.validatePlanForHandoff(targetPlan, session);
    if (!valResult.valid) {
      handoffLogger.logFailure(session, targetPlan.planId, valResult.error);
      await stateManager.saveSession(session);
      const err = new Error(valResult.error);
      err.statusCode = 400;
      throw err;
    }

    const handoff = await this.getOrCreateHandoff(session, targetPlan);
    handoff.status = 'APPROVED';
    handoff.approvedAt = new Date();
    await handoff.save();

    // Log approval event
    handoffLogger.logApproval(session, targetPlan.planId, handoff.provider, {
      handoffId: handoff.handoffId,
    });
    await stateManager.saveSession(session);

    return {
      success: true,
      handoff: {
        handoffId: handoff.handoffId,
        planId: handoff.planId,
        provider: handoff.provider,
        status: handoff.status,
        approvedAt: handoff.approvedAt,
      },
      message: 'Traveler approval recorded. External purchase must be completed on provider website.',
    };
  }

  /**
   * Step 2: Execute handoff and return safe validated external link.
   * Enforces: Plan must be approved first!
   * @param {string} sessionId - RecoverySession ID
   * @param {string} [planId] - Specific plan ID
   * @returns {Promise<{ success: boolean, handoff: Object, message: string }>}
   */
  async executeHandoff(sessionId, planId = null) {
    const session = await stateManager.loadSession(sessionId);
    const targetPlan = (planId && (session.candidatePlans || []).find((p) => p.planId === planId)) ||
      session.selectedPlan;

    if (!targetPlan) {
      throw new Error('No selected recovery plan available for handoff');
    }

    // Re-validate plan before handoff
    const valResult = this.validatePlanForHandoff(targetPlan, session);
    if (!valResult.valid) {
      handoffLogger.logFailure(session, targetPlan.planId, valResult.error);
      await stateManager.saveSession(session);
      const err = new Error(valResult.error);
      err.statusCode = 400;
      throw err;
    }

    const handoff = await this.getOrCreateHandoff(session, targetPlan);

    // Enforce approval sequence
    if (handoff.status !== 'APPROVED') {
      const err = new Error('Handoff requires explicit user approval before external link can be opened');
      err.statusCode = 403;
      throw err;
    }

    // Update status to OPENED
    handoff.status = 'OPENED';
    handoff.openedAt = new Date();
    await handoff.save();

    // Log redirection event
    handoffLogger.logHandoffOpened(session, targetPlan.planId, handoff.provider, handoff.handoffId);
    await stateManager.saveSession(session);

    return {
      success: true,
      handoff: {
        handoffId: handoff.handoffId,
        planId: handoff.planId,
        provider: handoff.provider,
        providerType: handoff.providerType,
        externalUrl: handoff.externalUrl,
        status: handoff.status,
        approvedAt: handoff.approvedAt,
        openedAt: handoff.openedAt,
      },
      message: 'External provider link validated and authorized. Complete purchase on provider portal.',
    };
  }
}

module.exports = new ExternalHandoffService();
