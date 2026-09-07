const CompensationProvider = require('./CompensationProvider');

/**
 * MockCompensationProvider — Phase 12 Lightweight Compensation Analyzer.
 * Analyzes disruption facts against applicable passenger rights guidelines
 * (e.g. DGCA CAR / EU261) and prepares an editable draft claim.
 */
class MockCompensationProvider extends CompensationProvider {
  constructor() {
    super('MockCompensationProvider');
  }

  /**
   * Deterministically analyze compensation eligibility facts and generate claim draft.
   * @param {Object} disruptionFacts - { carrier, flightNumber, origin, destination, disruptionType, delayMinutes }
   * @param {Object} passengerInfo - { passengerName, pnr, email }
   * @returns {Promise<Object>} Structured compensation analysis
   */
  async checkCompensation(disruptionFacts = {}, passengerInfo = {}) {
    const delayMinutes = Number(disruptionFacts.delayMinutes) || 0;
    const disruptionType = (disruptionFacts.disruptionType || '').toUpperCase();
    const carrier = disruptionFacts.carrier || 'Operating Airline';
    const flightNumber = disruptionFacts.flightNumber || 'Scheduled Flight';
    const origin = (disruptionFacts.origin || 'Origin Hub').toUpperCase();
    const destination = (disruptionFacts.destination || 'Destination Hub').toUpperCase();
    const passengerName = passengerInfo.passengerName || 'Traveler';

    let status = 'NOT_FOUND';
    const supportingReasons = [];
    const uncertainties = [];
    const requestedEvidence = [
      'Original airline e-ticket receipt & PNR confirmation',
      'Boarding pass for original scheduled flight',
      'Written carrier notice stating reason for delay or cancellation',
      'Proof of actual arrival timestamp at final destination',
    ];

    // Determine relevant statutory framework
    const isDomesticIndia = ['DEL', 'BLR', 'BOM', 'JAI', 'MAA', 'CCU', 'HYD', 'AMD', 'PNQ'].includes(origin) &&
                            ['DEL', 'BLR', 'BOM', 'JAI', 'MAA', 'CCU', 'HYD', 'AMD', 'PNQ'].includes(destination);
    const framework = isDomesticIndia
      ? 'DGCA Civil Aviation Requirements (CAR) Section 3, Series M, Part IV'
      : 'EU261/2004 or Relevant Bilateral Passenger Charter';

    // Evaluation Logic
    if (disruptionType.includes('CANCEL')) {
      status = 'POTENTIALLY_APPLICABLE';
      supportingReasons.push(`Flight cancellation occurred without statutory advance notice under ${framework}.`);
      supportingReasons.push('Passenger is entitled to either full refund or alternate travel arrangements, plus compensation if caused by carrier controllable factors.');
      uncertainties.push('Carrier may claim extraordinary circumstances (e.g. weather, ATC restrictions, safety hazards) which exempt cash compensation.');
    } else if (delayMinutes >= 180) {
      status = 'POTENTIALLY_APPLICABLE';
      supportingReasons.push(`Excessive delay of ${delayMinutes} minutes meets or exceeds statutory delay threshold under ${framework}.`);
      supportingReasons.push('Passenger is entitled to meals/refreshments during waiting time and compensation review if delay is within carrier operational control.');
      uncertainties.push('Exemptions apply if delay was triggered by airspace congestion, weather, or security directives.');
    } else if (delayMinutes >= 60) {
      status = 'UNCERTAIN';
      supportingReasons.push(`Recorded delay of ${delayMinutes} minutes entitles passenger to basic care/refreshments if block time exceeded thresholds.`);
      uncertainties.push(`Delay (${delayMinutes}m) is below the primary statutory cash compensation threshold (typically >= 180m).`);
    } else {
      status = 'NOT_FOUND';
      supportingReasons.push('Disruption facts do not indicate actionable statutory delay or carrier cancellation.');
      uncertainties.push('Minor schedule variation does not meet legal compensation thresholds.');
    }

    // Prepare Editable Draft Claim
    const draftClaim = {
      claimType: 'AIRLINE_COMPENSATION',
      passengerName,
      carrier,
      flightNumber,
      route: `${origin} → ${destination}`,
      disruptionType: disruptionType || 'SCHEDULE_DISRUPTION',
      delayMinutes,
      framework,
      summary: status === 'POTENTIALLY_APPLICABLE'
        ? `Draft claim for disruption on flight ${flightNumber} (${origin} to ${destination}) operated by ${carrier} due to ${disruptionType} resulting in a ${delayMinutes}-minute delay.`
        : 'Informational draft for carrier consideration.',
      supportingReasons,
      requestedEvidence,
      uncertainties,
      editableBody: `To: Customer Relations & Claims, ${carrier}\n\nRe: Formal Claim for Passenger Compensation — Flight ${flightNumber}\n\nDear Customer Relations,\n\nI am writing to formally request statutory assistance and compensation regarding flight ${flightNumber} scheduled from ${origin} to ${destination} for passenger ${passengerName}.\n\nThe flight suffered a ${disruptionType} causing a delay of approximately ${delayMinutes} minutes. Under ${framework}, passengers are entitled to statutory compensation and reimbursement of essential disruption expenses when disruptions arise from carrier operational circumstances.\n\nAttached please find the relevant flight documentation and expense receipts for your prompt review.\n\nSincerely,\n${passengerName}`,
      submitted: false,
    };

    return {
      provider: this.name,
      status,
      framework,
      draftClaim,
      requestedEvidence,
      uncertainties,
      disclaimer: 'This is an informational preparation draft aid, not legal advice or a guarantee of legal eligibility. No claim is filed automatically.',
    };
  }
}

module.exports = MockCompensationProvider;
