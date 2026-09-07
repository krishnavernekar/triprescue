import { useState, useEffect } from 'react';
import apiService from '../services/api';
import { translateDisruption } from '../utils/formatters';

const SAMPLE_POLICIES = {
  comprehensive: `SECTION 4.1 — TRIP DELAY & TRAVEL INCONVENIENCE
The Company shall reimburse the Insured up to INR 15,000 for reasonable additional accommodation, meal, and essential transfer expenses incurred if the Insured's scheduled commercial flight is delayed by more than 2 hours (120 minutes) due to weather, mechanical breakdown, or carrier scheduling disruption.
SECTION 3.2 — TRIP CANCELLATION
In the event of carrier cancellation without 24 hours prior notice, non-refundable accommodation and alternative rerouting transport expenses shall be reimbursed up to the sum insured.`,
  strict: `SECTION 9 — FLIGHT DELAY BENEFIT
Reimbursement for essential meals and transit lodging is strictly limited to delays exceeding 6 hours (360 minutes). No benefit shall be payable for delays under 6 hours or delays arising from government operational restrictions.`,
};

export default function InsuranceCompensationPanel({ trip }) {
  const [activeTab, setActiveTab] = useState('insurance');
  const [policyText, setPolicyText] = useState(SAMPLE_POLICIES.comprehensive);
  const [policyName, setPolicyName] = useState('Comprehensive Travel Guard');
  const [insuranceAnalysis, setInsuranceAnalysis] = useState(null);
  const [compensationCase, setCompensationCase] = useState(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);

  // Load existing analysis if available
  useEffect(() => {
    if (trip?._id) {
      apiService.get(`/insurance/${trip._id}`)
        .then((res) => { if (res && res.data) setInsuranceAnalysis(res.data); })
        .catch(() => {});
      apiService.get(`/compensation/${trip._id}`)
        .then((res) => { if (res && res.data) setCompensationCase(res.data); })
        .catch(() => {});
    }
  }, [trip?._id]);

  const handleAnalyzeInsurance = async () => {
    if (!trip?._id) return;
    setLoading(true);
    setMessage(null);
    try {
      const res = await apiService.post('/insurance/analyze', {
        tripId: trip._id,
        policyText,
        policyName,
      });
      if (res && res.data) {
        setInsuranceAnalysis(res.data);
        setMessage('✓ Policy analysis generated. Review clauses and evidence checklist below.');
      }
    } catch (err) {
      setMessage('Analysis failed: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCheckCompensation = async () => {
    if (!trip?._id) return;
    setLoading(true);
    setMessage(null);
    try {
      const res = await apiService.post('/compensation/check', {
        tripId: trip._id,
        overrideFacts: {
          delayMinutes: trip.disruption?.delayMinutes || 180,
          disruptionType: trip.disruption?.type || 'FLIGHT_DELAYED',
          carrier: trip.itinerary?.[0]?.carrier || 'Airline',
          flightNumber: trip.itinerary?.[0]?.identifier || 'AI 101',
          origin: trip.origin,
          destination: trip.destination,
        },
      });
      if (res && res.data) {
        setCompensationCase(res.data);
        setMessage('✓ Statutory compensation assessment prepared.');
      }
    } catch (err) {
      setMessage('Compensation check failed: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'POTENTIALLY_APPLICABLE':
        return <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 px-2 py-0.5 rounded text-[10px] font-bold font-mono">POTENTIALLY APPLICABLE</span>;
      case 'UNCERTAIN':
        return <span className="bg-amber-500/20 text-amber-300 border border-amber-500/40 px-2 py-0.5 rounded text-[10px] font-bold font-mono">UNCERTAIN</span>;
      default:
        return <span className="bg-slate-700/50 text-slate-300 border border-slate-600 px-2 py-0.5 rounded text-[10px] font-bold font-mono">NOT FOUND</span>;
    }
  };

  return (
    <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-surface-light)] p-5 space-y-4 text-xs">
      {/* Header & Tabs */}
      <div className="flex items-center justify-between border-b border-slate-700 pb-3">
        <div className="flex items-center gap-2">
          <span className="text-base">📑</span>
          <div>
            <h3 className="font-bold text-sm text-[var(--color-text)]">
              Insurance & Compensation Protection
            </h3>
            <p className="text-[11px] text-[var(--color-text-muted)]">
              Prepares evidence checklists and editable claim drafts. No automatic submissions.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1 bg-[var(--color-bg)] p-1 rounded-lg border border-slate-700">
          <button
            onClick={() => setActiveTab('insurance')}
            className={`px-3 py-1 rounded font-semibold transition ${
              activeTab === 'insurance'
                ? 'bg-blue-600 text-white'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            🛡️ Insurance Review
          </button>
          <button
            onClick={() => setActiveTab('compensation')}
            className={`px-3 py-1 rounded font-semibold transition ${
              activeTab === 'compensation'
                ? 'bg-blue-600 text-white'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            ⚖️ Compensation Review
          </button>
        </div>
      </div>

      {message && (
        <div className="p-2.5 rounded bg-blue-950/40 border border-blue-600/50 text-blue-200 text-[11px]">
          {message}
        </div>
      )}

      {/* TAB 1: INSURANCE REVIEW */}
      {activeTab === 'insurance' && (
        <div className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="font-semibold text-slate-300">Policy Document Content / Sample</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => { setPolicyText(SAMPLE_POLICIES.comprehensive); setPolicyName('Comprehensive Travel Guard (2h delay threshold)'); }}
                  className="text-[10px] text-blue-400 hover:underline"
                >
                  Load Comprehensive Sample
                </button>
                <button
                  type="button"
                  onClick={() => { setPolicyText(SAMPLE_POLICIES.strict); setPolicyName('Basic Flight Policy (6h delay threshold)'); }}
                  className="text-[10px] text-blue-400 hover:underline"
                >
                  Load Strict 6h Sample
                </button>
              </div>
            </div>
            <textarea
              rows={4}
              value={policyText}
              onChange={(e) => setPolicyText(e.target.value)}
              className="w-full bg-[var(--color-bg)] border border-slate-700 rounded-lg p-2.5 text-[11px] font-mono text-slate-200 focus:border-blue-500 focus:outline-none"
              placeholder="Paste policy document text here..."
            />
          </div>

          <button
            onClick={handleAnalyzeInsurance}
            disabled={loading}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg text-xs transition"
          >
            {loading ? 'Analyzing...' : 'REVIEW INSURANCE POLICY'}
          </button>

          {/* Analysis Results Display */}
          {insuranceAnalysis && (
            <div className="p-4 bg-[var(--color-bg)] border border-slate-700 rounded-xl space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-sm text-[var(--color-text)]">{insuranceAnalysis.policyName}</h4>
                  <p className="text-[10px] text-slate-400">Analysis ID: {insuranceAnalysis.analysisId}</p>
                </div>
                {getStatusBadge(insuranceAnalysis.status)}
              </div>

              {/* Identified Clauses */}
              <div className="space-y-2">
                <p className="font-bold text-[11px] text-slate-300 uppercase tracking-wider">Identified Policy Clauses ({insuranceAnalysis.relevantClauses?.length || 0})</p>
                {insuranceAnalysis.relevantClauses?.map((clause, idx) => (
                  <div key={idx} className="p-2.5 bg-slate-900/60 border border-slate-800 rounded-lg space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-white">{clause.clauseName}</span>
                      {getStatusBadge(clause.status)}
                    </div>
                    <p className="text-[10px] text-slate-400 font-mono">{clause.sectionReference}</p>
                    <p className="text-[11px] text-slate-300 italic">"{clause.sourceText}"</p>
                    <p className="text-[11px] text-blue-300 font-medium">↳ {clause.applicabilityReason}</p>
                  </div>
                ))}
              </div>

              {/* Evidence Checklist */}
              <div className="space-y-1.5 pt-2 border-t border-slate-800">
                <p className="font-bold text-[11px] text-slate-300 uppercase tracking-wider">Evidence Checklist (Documents to Collect)</p>
                {insuranceAnalysis.evidenceChecklist?.map((item, idx) => (
                  <label key={idx} className="flex items-start gap-2 text-[11px] text-slate-300 cursor-pointer">
                    <input type="checkbox" className="mt-0.5 rounded border-slate-600" />
                    <span>{item}</span>
                  </label>
                ))}
              </div>

              {/* Disclaimer */}
              <div className="p-2.5 bg-slate-900 border border-slate-800 rounded text-[10px] text-slate-400 italic">
                ℹ️ {insuranceAnalysis.disclaimer}
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: COMPENSATION REVIEW */}
      {activeTab === 'compensation' && (
        <div className="space-y-4">
          <div className="p-3 bg-[var(--color-bg)] rounded-lg border border-slate-800 space-y-1 text-[11px]">
            <p className="font-bold text-slate-300">Disruption Facts for Passenger Rights Assessment:</p>
            <p className="text-slate-400">Carrier: <strong className="text-white">{trip?.itinerary?.[0]?.carrier || 'Airline'}</strong> ({trip?.itinerary?.[0]?.identifier || 'Scheduled Flight'})</p>
            <p className="text-slate-400">Route: <strong className="text-white">{trip?.origin} → {trip?.destination}</strong></p>
            <p className="text-slate-400">Disruption: <strong className="text-rose-400">{translateDisruption(trip?.disruption?.type || 'FLIGHT_DELAYED')}</strong> ({trip?.disruption?.delayMinutes || 180} mins)</p>
          </div>

          <button
            onClick={handleCheckCompensation}
            disabled={loading}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-lg text-xs transition"
          >
            {loading ? 'Evaluating...' : 'PREPARE CLAIM DRAFT'}
          </button>

          {/* Compensation Case Display */}
          {compensationCase && (
            <div className="p-4 bg-[var(--color-bg)] border border-slate-700 rounded-xl space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-sm text-[var(--color-text)]">Statutory Compensation Assessment</h4>
                  <p className="text-[10px] text-slate-400">Framework: {compensationCase.framework}</p>
                </div>
                {getStatusBadge(compensationCase.status)}
              </div>

              {/* Supporting Reasons */}
              <div className="space-y-1">
                <p className="font-bold text-[11px] text-slate-300 uppercase tracking-wider">Relevant Rights & Provisions</p>
                {compensationCase.draftClaim?.supportingReasons?.map((r, i) => (
                  <p key={i} className="text-[11px] text-indigo-200">• {r}</p>
                ))}
              </div>

              {/* Uncertainties & Exemptions */}
              {compensationCase.uncertainties?.length > 0 && (
                <div className="p-2.5 bg-amber-950/30 border border-amber-800/40 rounded text-[11px] text-amber-300 space-y-1">
                  <p className="font-bold uppercase text-[10px]">Uncertainties / Potential Carrier Exemptions:</p>
                  {compensationCase.uncertainties.map((u, i) => (
                    <p key={i}>⚠️ {u}</p>
                  ))}
                </div>
              )}

              {/* Editable Claim Draft */}
              <div className="space-y-1.5 pt-2 border-t border-slate-800">
                <p className="font-bold text-[11px] text-slate-300 uppercase tracking-wider">Editable Draft Notice to Carrier</p>
                <textarea
                  rows={6}
                  defaultValue={compensationCase.draftClaim?.editableBody}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-[11px] font-mono text-slate-300 focus:border-indigo-500 focus:outline-none"
                />
                <p className="text-[10px] text-slate-500">You can copy and personalize this draft before sending it to the airline customer relations department.</p>
              </div>

              {/* Disclaimer */}
              <div className="p-2.5 bg-slate-900 border border-slate-800 rounded text-[10px] text-slate-400 italic">
                ℹ️ {compensationCase.disclaimer}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
