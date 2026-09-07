const InsuranceProvider = require('./InsuranceProvider');

/**
 * MockInsuranceProvider — Phase 12 Lightweight Policy Analyzer.
 * Deterministically analyzes policy text against disruption facts
 * without guaranteeing coverage or submitting external claims.
 */
class MockInsuranceProvider extends InsuranceProvider {
  constructor() {
    super('MockInsuranceProvider');
  }

  /**
   * Deterministically analyze policy text against disruption facts.
   * @param {string} policyText - Raw policy document text (treated strictly as untrusted data)
   * @param {Object} disruptionFacts - { delayMinutes, disruptionType, carrier, totalCost }
   * @returns {Promise<Object>} Analysis result
   */
  async analyzePolicy(policyText, disruptionFacts = {}) {
    if (!policyText || typeof policyText !== 'string' || policyText.trim().length === 0) {
      throw new Error('Policy text is required for analysis');
    }

    // Security: sanitize and isolate untrusted document content
    const sanitizedText = policyText
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
      .toLowerCase();

    const delayMinutes = Number(disruptionFacts.delayMinutes) || 0;
    const disruptionType = (disruptionFacts.disruptionType || '').toUpperCase();

    const relevantClauses = [];
    const uncertainties = [];

    // 1. Check for Trip Delay Clause
    if (sanitizedText.includes('delay') || sanitizedText.includes('delayed') || sanitizedText.includes('late')) {
      // Determine threshold from text if present, default to 180 min (3 hours)
      let thresholdMinutes = 180;
      if (sanitizedText.includes('6 hours') || sanitizedText.includes('360 minutes')) {
        thresholdMinutes = 360;
      } else if (sanitizedText.includes('4 hours') || sanitizedText.includes('240 minutes')) {
        thresholdMinutes = 240;
      } else if (sanitizedText.includes('2 hours') || sanitizedText.includes('120 minutes')) {
        thresholdMinutes = 120;
      }

      let clauseStatus = 'NOT_FOUND';
      let reason = '';

      if (delayMinutes >= thresholdMinutes) {
        clauseStatus = 'POTENTIALLY_APPLICABLE';
        reason = `Recorded disruption delay (${delayMinutes} mins) meets or exceeds policy threshold (${thresholdMinutes} mins).`;
      } else if (delayMinutes > 0 && delayMinutes < thresholdMinutes) {
        clauseStatus = 'UNCERTAIN';
        reason = `Recorded disruption delay (${delayMinutes} mins) is below the stated threshold (${thresholdMinutes} mins). Ancillary costs may be reviewable.`;
        uncertainties.push(`Delay (${delayMinutes}m) is under the ${thresholdMinutes}m policy threshold.`);
      } else {
        clauseStatus = 'UNCERTAIN';
        reason = 'Trip delay clause detected in policy, but exact delay minutes are unconfirmed in disruption record.';
        uncertainties.push('Disruption delay duration could not be conclusively verified against policy threshold.');
      }

      relevantClauses.push({
        clauseName: 'Trip Delay / Schedule Disruption',
        sectionReference: 'Section 4.1 — Travel Inconvenience Benefits',
        sourceText: 'Policy provides coverage for reasonable additional expenses resulting from qualifying carrier delays.',
        applicabilityReason: reason,
        status: clauseStatus,
      });
    }

    // 2. Check for Trip Cancellation Clause
    if (sanitizedText.includes('cancellation') || sanitizedText.includes('cancelled') || sanitizedText.includes('canceled')) {
      let clauseStatus = 'UNCERTAIN';
      let reason = '';

      if (disruptionType.includes('CANCEL')) {
        clauseStatus = 'POTENTIALLY_APPLICABLE';
        reason = 'Disruption type involves carrier cancellation which aligns with policy cancellation benefits.';
      } else {
        clauseStatus = 'NOT_FOUND';
        reason = 'Cancellation clause present in policy, but disruption was not a carrier cancellation.';
      }

      relevantClauses.push({
        clauseName: 'Trip Cancellation / Interruption',
        sectionReference: 'Section 3.2 — Carrier Cancellation Provisions',
        sourceText: 'Reimbursement of non-refundable accommodation and rerouting expenses in event of complete flight cancellation.',
        applicabilityReason: reason,
        status: clauseStatus,
      });
    }

    // 3. Check for Emergency Accommodation / Meals Clause
    if (sanitizedText.includes('hotel') || sanitizedText.includes('accommodation') || sanitizedText.includes('meal') || sanitizedText.includes('expense')) {
      const applies = disruptionType.includes('CANCEL') || delayMinutes >= 240;
      relevantClauses.push({
        clauseName: 'Emergency Accommodation & Meals',
        sectionReference: 'Section 4.3 — Subsistence & Transit Hotel Benefit',
        sourceText: 'Covers essential hotel accommodation and meal expenses incurred during unexpected transit layovers.',
        applicabilityReason: applies
          ? 'Overnight transit layover or severe delay indicates potential relevance of subsistence benefits.'
          : 'Clause identified; applicability depends on receipts and carrier refusal to provide amenities.',
        status: applies ? 'POTENTIALLY_APPLICABLE' : 'UNCERTAIN',
      });
    }

    // Overall Status Determination
    let overallStatus = 'NOT_FOUND';
    if (relevantClauses.some((c) => c.status === 'POTENTIALLY_APPLICABLE')) {
      overallStatus = 'POTENTIALLY_APPLICABLE';
    } else if (relevantClauses.some((c) => c.status === 'UNCERTAIN')) {
      overallStatus = 'UNCERTAIN';
    }

    // Generate Tailored Evidence Checklist
    const evidenceChecklist = [
      'Original booking confirmation & e-ticket itinerary (PNR receipt)',
      'Official carrier disruption certificate or written delay confirmation',
      'Original boarding passes for scheduled and rerouted segments',
    ];

    if (sanitizedText.includes('hotel') || sanitizedText.includes('expense') || relevantClauses.some((c) => c.clauseName.includes('Accommodation'))) {
      evidenceChecklist.push('Itemized hotel receipt showing check-in/out timestamps and payment method');
      evidenceChecklist.push('Itemized receipts for essential food and local ground transfers');
    }

    return {
      provider: this.name,
      status: overallStatus,
      relevantClauses,
      evidenceChecklist,
      uncertainties,
      disclaimer: 'This is a draft preparation aid, not a guarantee of coverage or legal eligibility. TripRescue does not file claims or submit documents automatically.',
    };
  }
}

module.exports = MockInsuranceProvider;
