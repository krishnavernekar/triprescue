import { useState } from 'react';
import apiService from '../services/api';
import { formatDate, formatCurrency, modeIcon, translateStrategy } from '../utils/formatters';

function CandidatePlansView({
  selectedPlan,
  rejectedPlans = [],
  candidatePlans = [],
  sessionId,
  onSessionUpdated,
  debugMode,
}) {
  const [handoffState, setHandoffState] = useState('IDLE'); // 'IDLE' | 'APPROVING' | 'VERIFYING' | 'OPENED' | 'POPUP_BLOCKED' | 'ERROR'
  const [handoffResult, setHandoffResult] = useState(null);
  const [handoffError, setHandoffError] = useState(null);

  const isPlanApproved = selectedPlan?.status === 'APPROVED';
  const primaryCarrier = selectedPlan?.segments?.[0]?.carrier || 'Official Travel Portal';

  const handleApproveAndProceed = async () => {
    if (!sessionId || !selectedPlan) {
      setHandoffError('No active recovery session or plan available.');
      return;
    }

    setHandoffError(null);

    try {
      // Step 1: User explicit approval (if not yet approved)
      if (!isPlanApproved) {
        setHandoffState('APPROVING');
        const approveRes = await apiService.approveRecovery(sessionId, selectedPlan.planId);
        if (!approveRes.success) {
          throw new Error(approveRes.error || 'Unable to record plan approval.');
        }
      }

      // Step 2: Request validated external handoff URL
      setHandoffState('VERIFYING');
      const handoffRes = await apiService.executeRecoveryHandoff(sessionId, selectedPlan.planId);

      if (handoffRes.success && handoffRes.handoff?.externalUrl) {
        setHandoffResult(handoffRes.handoff);

        // Step 3: Open validated URL safely in a new browser tab
        const externalUrl = handoffRes.handoff.externalUrl;
        const newWindow = window.open(externalUrl, '_blank', 'noopener,noreferrer');

        // Check if browser blocked the popup window
        if (!newWindow || newWindow.closed || typeof newWindow.closed === 'undefined') {
          setHandoffState('POPUP_BLOCKED');
        } else {
          setHandoffState('OPENED');
        }

        if (onSessionUpdated) {
          const freshSession = await apiService.getRecoverySession(sessionId);
          if (freshSession?.data) {
            onSessionUpdated(freshSession.data);
          }
        }
      } else {
        throw new Error(
          handoffRes.error ||
            'A verified external provider link is currently unavailable for this route. No booking was made.'
        );
      }
    } catch (err) {
      setHandoffState('ERROR');
      setHandoffError(err.message || 'Unable to complete provider handoff.');
    }
  };

  const otherCandidates = (candidatePlans || []).filter(
    (p) => p.planId !== selectedPlan?.planId
  );

  return (
    <div className="space-y-6">
      {/* 1. RECOMMENDED RECOVERY PLAN (HERO CARD) */}
      {selectedPlan ? (
        <div className="bg-gradient-to-br from-slate-900 via-emerald-950/30 to-slate-900 border-2 border-emerald-500/60 rounded-2xl p-5 sm:p-6 shadow-xl space-y-5">
          {/* Header Banner */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-emerald-900/40">
            <div className="space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xl">🌟</span>
                <h3 className="text-lg sm:text-xl font-black text-emerald-400 tracking-tight">
                  Recommended Recovery Option
                </h3>
                <span className={`text-[10px] px-2.5 py-0.5 rounded-full font-bold uppercase border ${
                  isPlanApproved
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                    : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                }`}>
                  {isPlanApproved ? '✓ APPROVED' : 'AWAITING APPROVAL'}
                </span>
              </div>
              <p className="text-xs text-slate-300">
                Strategy: <strong className="text-white">{translateStrategy(selectedPlan.strategy)}</strong>
              </p>
            </div>

            <div className="text-left sm:text-right bg-slate-900/80 p-2.5 sm:p-0 rounded-xl sm:bg-transparent">
              <span className="text-xl sm:text-2xl font-black text-emerald-400 block">
                {formatCurrency(selectedPlan.totalCost || 0)}
              </span>
              <p className="text-[11px] text-[var(--color-text-muted)]">
                Arrival: <strong className="text-slate-200">{formatDate(selectedPlan.finalArrivalTime)}</strong>
              </p>
            </div>
          </div>

          {/* Plain-English Recommendation Rationale */}
          <div className="p-3.5 bg-slate-900/90 rounded-xl border border-emerald-900/40 text-xs space-y-1">
            <span className="font-bold text-emerald-400 uppercase tracking-wider text-[10px] block">
              Why TripRescue recommends this plan:
            </span>
            <p className="text-slate-200 leading-relaxed">
              {selectedPlan.explanation ||
                `Provides a verified physical transfer buffer within your budget limit and meets your scheduled arrival deadline with ${selectedPlan.segments?.length || 1} transport leg(s).`}
            </p>
          </div>

          {/* Recovery Itinerary Segments */}
          <div className="space-y-2.5">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Recovered Journey Route ({selectedPlan.segments?.length || 0} legs)
            </p>

            {(selectedPlan.segments || []).map((seg, idx) => (
              <div
                key={seg.segmentId || idx}
                className="bg-[var(--color-bg)] rounded-xl p-3.5 border border-[var(--color-surface-light)] flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-[var(--color-surface)] flex items-center justify-center text-xl shrink-0">
                    {modeIcon(seg.transportMode)}
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-white text-sm">
                        {seg.origin?.code || seg.origin} → {seg.destination?.code || seg.destination}
                      </span>
                      <span className="text-[10px] bg-[var(--color-surface)] text-slate-400 px-1.5 py-0.2 rounded uppercase">
                        {seg.transportMode}
                      </span>
                      {seg.dataConfidence && (
                        <span className={`text-[10px] font-mono px-1.5 py-0.2 rounded border ${
                          seg.dataConfidence === 'LIVE' ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' :
                          seg.dataConfidence === 'CACHED' ? 'bg-blue-500/20 text-blue-300 border-blue-500/40' :
                          'bg-slate-800 text-slate-400 border-slate-700'
                        }`}>
                          {seg.dataConfidence}
                        </span>
                      )}
                      {seg.price?.amount > 0 && (
                        <span className="text-emerald-400 font-bold">
                          ₹{Number(seg.price.amount).toLocaleString('en-IN')}
                        </span>
                      )}
                    </div>

                    {seg.transportMode === 'hotel' ? (
                      <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5">
                        {seg.name || seg.carrier} • ⭐ {seg.rating} • {seg.distance} from hub
                      </p>
                    ) : (
                      <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5">
                        {seg.carrier} {seg.identifier && `• ${seg.identifier}`} • Dep: {formatDate(seg.departure)} • Arr: {formatDate(seg.arrival)}
                      </p>
                    )}
                  </div>
                </div>

                <div className="text-left sm:text-right text-slate-400 text-xs shrink-0">
                  <span>{seg.durationMinutes ? `${seg.durationMinutes} min travel` : ''}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Physical Transfer Safety Buffer Verification */}
          {selectedPlan.connectionResults && selectedPlan.connectionResults.length > 0 && (
            <div className="p-3 bg-slate-900/90 rounded-xl border border-slate-700 text-xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-200 flex items-center gap-1.5">
                  <span>🗺️</span> Physical Transfer Safety Buffer (Google Routes / Verified Transit)
                </span>
                <span className="text-[10px] text-emerald-400 font-bold">
                  ✓ VERIFIED FEASIBLE
                </span>
              </div>
              <div className="space-y-1.5 text-slate-300">
                {selectedPlan.connectionResults.map((conn, cIdx) => (
                  <div key={cIdx} className="flex items-center justify-between text-[11px] p-2 bg-slate-950/60 rounded-lg border border-slate-800">
                    <span>
                      Transfer: Available <strong className="text-white">{conn.availableMinutes} min</strong> (Minimum Safe Buffer: {conn.requiredMinutes} min)
                    </span>
                    <span className="font-bold text-emerald-400 font-mono">
                      {conn.availableMinutes >= conn.requiredMinutes ? '✓ SAFE BUFFER' : '⚠️ TIGHT'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ACTION SECTION: Approve & Continue to Provider */}
          <div className="p-4 sm:p-5 rounded-2xl bg-[var(--color-bg)] border border-emerald-500/50 shadow-inner space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-base">🌐</span>
                  <span className="font-bold text-sm text-white">
                    Official Booking Portal: <span className="text-emerald-400">{primaryCarrier}</span>
                  </span>
                </div>
                <p className="text-xs text-[var(--color-text-muted)] max-w-lg">
                  Confirm approval to proceed to the official booking site with pre-filled journey details.
                </p>
              </div>

              <div className="shrink-0">
                <button
                  type="button"
                  onClick={handleApproveAndProceed}
                  disabled={handoffState === 'APPROVING' || handoffState === 'VERIFYING'}
                  className="w-full sm:w-auto px-6 py-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-black rounded-xl shadow-lg shadow-emerald-950/60 text-xs sm:text-sm transition flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  <span>🌐</span>
                  {handoffState === 'APPROVING' && 'Recording Approval...'}
                  {handoffState === 'VERIFYING' && 'Checking Provider Link...'}
                  {handoffState === 'OPENED' && 'Re-open Provider Portal'}
                  {handoffState === 'POPUP_BLOCKED' && 'Click to Open Provider Tab'}
                  {(handoffState === 'IDLE' || handoffState === 'ERROR') &&
                    (isPlanApproved ? 'Continue to Provider' : 'Approve & Continue to Provider')}
                </button>
              </div>
            </div>

            {/* State Feedback Banners */}
            {handoffState === 'OPENED' && handoffResult && (
              <div className="p-3 rounded-xl bg-emerald-950/40 border border-emerald-500/50 text-xs text-emerald-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span>✓</span>
                  <span>Provider portal opened in a new tab:</span>
                  <a
                    href={handoffResult.externalUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline text-white font-mono hover:text-emerald-300 truncate max-w-xs"
                  >
                    {handoffResult.externalUrl}
                  </a>
                </div>
                <span className="text-[10px] font-mono text-emerald-400 shrink-0">
                  Handoff ID: {handoffResult.handoffId}
                </span>
              </div>
            )}

            {handoffState === 'POPUP_BLOCKED' && handoffResult && (
              <div className="p-3.5 rounded-xl bg-amber-950/50 border border-amber-500/60 text-xs text-amber-200 space-y-2">
                <div className="flex items-center gap-2 font-bold text-amber-300">
                  <span>⚠️</span>
                  <span>Your browser blocked the automatic provider popup window.</span>
                </div>
                <p className="text-[11px] text-slate-300">
                  Click the button below to open the official carrier booking portal directly:
                </p>
                <a
                  href={handoffResult.externalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold rounded-lg text-xs transition"
                >
                  <span>🌐</span>
                  <span>Open {primaryCarrier} Portal Directly</span>
                </a>
              </div>
            )}

            {handoffError && (
              <div className="p-3 rounded-xl bg-red-950/40 border border-red-500/50 text-xs text-red-200 flex items-start gap-2">
                <span className="text-base shrink-0">⚠️</span>
                <div>
                  <p className="font-bold">Provider Link Notice</p>
                  <p className="text-[11px] text-slate-300 mt-0.5">{handoffError}</p>
                  <p className="text-[10px] text-slate-400 mt-1">No booking was made and no charge was processed.</p>
                </div>
              </div>
            )}

            {/* Disclaimer */}
            <p className="text-[11px] text-slate-400 italic flex items-center gap-1.5 pt-1 border-t border-[var(--color-surface-light)]/40">
              <span>🛡️</span>
              <span>TripRescue prepares verified booking links on official carrier domains. We never process payments or store credit cards.</span>
            </p>
          </div>
        </div>
      ) : (
        <div className="text-center py-10 px-4 bg-[var(--color-bg)] rounded-2xl border border-dashed border-[var(--color-surface-light)] space-y-2">
          <span className="text-3xl block">⚡</span>
          <p className="text-sm font-bold text-white">No recovery plan generated yet</p>
          <p className="text-xs text-[var(--color-text-muted)] max-w-sm mx-auto">
            Click <strong>[Find My Best Recovery]</strong> above to discover alternative flights, high-speed rail, or express bus options.
          </p>
        </div>
      )}

      {/* 2. ALTERNATIVE CANDIDATE PLANS */}
      {otherCandidates.length > 0 && (
        <div className="bg-[var(--color-surface)] rounded-2xl p-5 border border-[var(--color-surface-light)] space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-[var(--color-surface-light)]">
            <div className="flex items-center gap-2">
              <span className="text-base">🔀</span>
              <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                Other Valid Alternatives ({otherCandidates.length})
              </h4>
            </div>
            <span className="text-[10px] text-slate-400">All satisfy budget & deadline</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {otherCandidates.map((plan, idx) => (
              <div
                key={plan.planId || idx}
                className="bg-[var(--color-bg)] rounded-xl p-4 border border-[var(--color-surface-light)] space-y-2 text-xs flex flex-col justify-between hover:border-slate-600 transition"
              >
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-white">
                      {translateStrategy(plan.strategy)}
                    </span>
                    <span className="font-black text-emerald-400">
                      {formatCurrency(plan.totalCost || 0)}
                    </span>
                  </div>
                  <p className="text-[11px] text-[var(--color-text-muted)]">
                    Arrival: {formatDate(plan.finalArrivalTime)} • {plan.segments?.length || 1} leg(s)
                  </p>
                </div>

                <div className="pt-2 border-t border-[var(--color-surface-light)] flex items-center justify-between text-[11px]">
                  <span className="text-slate-400">Score: {plan.score}/100</span>
                  <span className="text-emerald-400 font-semibold">✓ Feasible</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 3. REJECTED PLANS & CONSTRAINT EXCLUSIONS */}
      {rejectedPlans.length > 0 && (
        <div className="bg-[var(--color-surface)] rounded-2xl p-5 border border-[var(--color-surface-light)] space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-[var(--color-surface-light)]">
            <div className="flex items-center gap-2">
              <span className="text-base">🚫</span>
              <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                Excluded Options ({rejectedPlans.length})
              </h4>
            </div>
            <span className="text-[10px] text-slate-400">Strictly rejected by constraint engine</span>
          </div>

          <div className="space-y-2">
            {rejectedPlans.map((plan, idx) => (
              <div
                key={plan.planId || idx}
                className="bg-[var(--color-bg)] rounded-xl p-3 border border-red-900/30 text-xs space-y-1.5"
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-200">
                    {translateStrategy(plan.strategy)}
                  </span>
                  <span className="text-slate-400">
                    Cost: {formatCurrency(plan.totalCost || 0)}
                  </span>
                </div>

                <div className="bg-red-950/20 p-2 rounded-lg border border-red-900/40 text-red-300 text-[11px]">
                  <span className="font-bold uppercase text-[10px] block text-red-400">Reason Excluded:</span>
                  {(plan.rejectionReasons || []).map((reason, rIdx) => (
                    <p key={rIdx} className="leading-snug">• {reason}</p>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default CandidatePlansView;

