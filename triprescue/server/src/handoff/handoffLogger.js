/**
 * HandoffLogger — Phase 5 Secure Handoff Audit Logger.
 *
 * Emits handoff events into session.agentEvents while strictly ensuring:
 * - NO API keys or credentials are ever recorded.
 * - NO payment details or card numbers are accepted or stored.
 * - Essential audit trail (planId, provider, timestamp, status) is preserved.
 */

const eventLogger = require('../agent/EventLogger');

class HandoffLogger {
  /**
   * Log an approval event when a traveler confirms intent to continue to provider.
   * @param {Object} session - RecoverySession document
   * @param {string} planId - The recovery plan ID
   * @param {string} provider - Provider/Carrier name
   * @param {Object} [meta={}] - Additional non-sensitive metadata
   */
  logApproval(session, planId, provider, meta = {}) {
    const safeMeta = this._sanitizeMeta({
      planId,
      provider,
      ...meta,
    });

    eventLogger.log(
      session,
      'HANDOFF_APPROVED',
      'Traveler approved external provider handoff for ' + provider + ' (Plan: ' + planId + '). External purchase required.',
      safeMeta,
      session.currentStrategy,
      session.iterationCount
    );
  }

  /**
   * Log an external handoff dispatch event when the validated URL is delivered.
   * @param {Object} session - RecoverySession document
   * @param {string} planId - The recovery plan ID
   * @param {string} provider - Provider/Carrier name
   * @param {string} handoffId - The external handoff record ID
   * @param {Object} [meta={}] - Additional non-sensitive metadata
   */
  logHandoffOpened(session, planId, provider, handoffId, meta = {}) {
    const safeMeta = this._sanitizeMeta({
      planId,
      provider,
      handoffId,
      redirectEvent: 'EXTERNAL_PROVIDER_OPENED',
      ...meta,
    });

    eventLogger.log(
      session,
      'EXTERNAL_HANDOFF',
      'External handoff initiated to ' + provider + '. Redirected user to external portal to complete booking.',
      safeMeta,
      session.currentStrategy,
      session.iterationCount
    );
  }

  /**
   * Log a failed handoff attempt.
   * @param {Object} session - RecoverySession document
   * @param {string} planId - The recovery plan ID
   * @param {string} reason - Reason for failure
   * @param {Object} [meta={}] - Additional non-sensitive metadata
   */
  logFailure(session, planId, reason, meta = {}) {
    const safeMeta = this._sanitizeMeta({
      planId,
      reason,
      ...meta,
    });

    eventLogger.log(
      session,
      'HANDOFF_FAILED',
      'External handoff rejected: ' + reason,
      safeMeta,
      session.currentStrategy,
      session.iterationCount
    );
  }

  /**
   * Sanitize metadata object to strip any accidental secrets or payment fields.
   */
  _sanitizeMeta(meta) {
    if (!meta || typeof meta !== 'object') return {};
    const sanitized = { ...meta };

    const FORBIDDEN_KEYS = [
      'key',
      'apikey',
      'apiKey',
      'token',
      'password',
      'secret',
      'creditCard',
      'cardNumber',
      'cvv',
      'auth',
      'authorization',
    ];

    for (const k of Object.keys(sanitized)) {
      if (FORBIDDEN_KEYS.some((fk) => k.toLowerCase().includes(fk.toLowerCase()))) {
        delete sanitized[k];
      }
    }

    return sanitized;
  }
}

module.exports = new HandoffLogger();
