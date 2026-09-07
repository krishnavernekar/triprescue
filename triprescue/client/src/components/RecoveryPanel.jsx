import { useState } from 'react';
import AgentTimeline from './AgentTimeline';
import CandidatePlansView from './CandidatePlansView';
import apiService from '../services/api';
import { translateStrategy } from '../utils/formatters';

function RecoveryPanel({ session, trip, onSessionUpdated, debugMode }) {
  const [activeTab, setActiveTab] = useState('plans'); // 'plans' | 'timeline' | 'cascade'
  const [running, setRunning] = useState(false);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);

  const sessionId = session?._id || trip?.currentRecoverySessionId?._id || trip?.currentRecoverySessionId;
  const currentStatus = session?.status || 'READY';
  const currentStrategy = session?.currentStrategy || 'DIRECT_FLIGHT';
  const selectedPlan = session?.selectedPlan || null;
  const rejectedPlans = session?.rejectedPlans || [];
  const candidatePlans = session?.candidatePlans || [];
  const events = session?.agentEvents || [];
  const downstreamImpacts = session?.downstreamImpacts || [];

  const handleStartRecovery = async () => {
    setRunning(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const res = await apiService.startRecovery(trip._id, { maxIterations: 10 });
      if (res.success) {
        onSessionUpdated(res.data);
        setSuccessMessage('✓ Autonomous recovery completed. Recommended plan evaluated and ready for review.');
      } else {
        throw new Error(res.error || 'Failed to generate recovery plan');
      }
    } catch (err) {
      setError(err.message || 'Recovery search failed. Check network or constraints.');
    } finally {
      setRunning(false);
    }
  };

  const handleReplan = async () => {
    if (!sessionId) return;
    setRunning(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const res = await apiService.replanRecovery(sessionId, { resetAttempted: true });
      if (res.success) {
        onSessionUpdated(res.data);
        setSuccessMessage('✓ Re-evaluated recovery options against current availability.');
      } else {
        throw new Error(res.error || 'Replanning failed');
      }
    } catch (err) {
      setError(err.message || 'Replanning failed. Check constraints.');
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="bg-[var(--color-surface)] rounded-2xl border border-[var(--color-surface-light)] p-5 sm:p-6 shadow-xl space-y-5">
      {/* Top Header & Autonomous Controls */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-[var(--color-surface-light)]">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5 flex-wrap">
            <span className="text-xl">⚡</span>
            <h3 className="text-lg font-black text-white tracking-tight">
              Autonomous Recovery Search
            </h3>
            <span className={`text-[10px] px-2.5 py-0.5 rounded-full font-bold uppercase border ${
              currentStatus === 'APPROVED' ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' :
              currentStatus === 'PLAN_SELECTED' ? 'bg-blue-500/20 text-blue-300 border-blue-500/40' :
              currentStatus === 'READY' ? 'bg-amber-500/20 text-amber-300 border-amber-500/40' :
              'bg-slate-700/50 text-slate-300 border-slate-600'
            }`}>
              {currentStatus === 'READY' ? 'Ready to Recover' :
               currentStatus === 'PLAN_SELECTED' ? 'Plan Ready for Review' :
               currentStatus === 'APPROVED' ? 'Plan Approved' : currentStatus}
            </span>
          </div>
          <p className="text-xs text-[var(--color-text-muted)]">
            Primary Strategy: <strong className="text-blue-300">{translateStrategy(currentStrategy)}</strong>
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 shrink-0">
          {currentStatus === 'READY' || !selectedPlan ? (
            <div className="space-y-1 text-right sm:text-right">
              <button
                type="button"
                onClick={handleStartRecovery}
                disabled={running}
                className="w-full sm:w-auto px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-black text-xs sm:text-sm rounded-xl shadow-lg shadow-blue-900/50 transition flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <span>⚡</span>
                <span>{running ? 'Finding Best Recovery...' : 'Find My Best Recovery'}</span>
              </button>
              <p className="text-[10px] text-[var(--color-text-muted)] hidden sm:block">
                Evaluates flight, train, bus, and hotel alternatives
              </p>
            </div>
          ) : (
            <button
              type="button"
              onClick={handleReplan}
              disabled={running}
              className="px-4 py-2 text-xs font-bold bg-[var(--color-bg)] hover:bg-slate-800 text-slate-200 border border-[var(--color-surface-light)] rounded-xl transition flex items-center justify-center gap-1.5 disabled:opacity-50"
            >
              <span>🔄</span>
              <span>{running ? 'Re-evaluating...' : 'Re-run Recovery Search'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Explanatory helper caption */}
      <div className="p-3 bg-blue-950/20 border border-blue-900/40 rounded-xl text-xs text-blue-200 leading-relaxed flex items-start gap-2.5">
        <span className="text-base shrink-0 mt-0.5">ℹ️</span>
        <div>
          <p className="font-semibold text-white">How TripRescue Recovery Works:</p>
          <p className="text-[11px] text-blue-200/90 mt-0.5">
            TripRescue searches live and verified travel corridors, evaluates physical transfer buffers (via Google Routes), filters options against your hard budget and arrival deadline, and presents Pareto-ranked recovery choices with zero automated bookings.
          </p>
        </div>
      </div>

      {successMessage && (
        <div className="p-3 bg-emerald-950/40 border border-emerald-500/50 text-emerald-300 text-xs rounded-xl flex items-center justify-between">
          <span>{successMessage}</span>
          <button onClick={() => setSuccessMessage(null)} className="text-emerald-400 hover:text-white">✕</button>
        </div>
      )}

      {error && (
        <div className="p-3 bg-red-950/50 border border-red-800 text-red-300 text-xs rounded-xl flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-white">✕</button>
        </div>
      )}

      {/* Tabs Navigation */}
      <div className="flex gap-2 border-b border-[var(--color-surface-light)] pb-2">
        <button
          type="button"
          onClick={() => setActiveTab('plans')}
          className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition ${
            activeTab === 'plans'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-[var(--color-text-muted)] hover:text-white'
          }`}
        >
          Recovery Plans ({candidatePlans.length > 0 ? candidatePlans.length : selectedPlan ? 1 : 0})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('timeline')}
          className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
            activeTab === 'timeline'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-[var(--color-text-muted)] hover:text-white'
          }`}
        >
          <span>Decision Log</span>
          {events.length > 0 && (
            <span className="text-[10px] bg-blue-900/60 text-blue-200 px-1.5 py-0.2 rounded-full font-mono">
              {events.length}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('cascade')}
          className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
            activeTab === 'cascade'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-[var(--color-text-muted)] hover:text-white'
          }`}
        >
          <span>Downstream Cascade</span>
          {downstreamImpacts.length > 0 && (
            <span className="text-[10px] bg-amber-900/60 text-amber-200 px-1.5 py-0.2 rounded-full font-mono">
              {downstreamImpacts.length}
            </span>
          )}
        </button>
      </div>

      {/* Tab Content */}
      <div>
        {activeTab === 'plans' && (
          <CandidatePlansView
            selectedPlan={selectedPlan}
            rejectedPlans={rejectedPlans}
            candidatePlans={candidatePlans}
            sessionId={sessionId}
            onSessionUpdated={onSessionUpdated}
            debugMode={debugMode}
          />
        )}

        {activeTab === 'timeline' && (
          <AgentTimeline events={events} />
        )}

        {activeTab === 'cascade' && (
          <div className="space-y-2.5">
            {downstreamImpacts.length > 0 ? (
              downstreamImpacts.map((imp, idx) => (
                <div
                  key={idx}
                  className="bg-[var(--color-bg)] p-3.5 rounded-xl border border-[var(--color-surface-light)] flex items-start justify-between text-xs gap-3"
                >
                  <div className="space-y-1">
                    <span className="text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded font-mono font-bold uppercase">
                      {imp.impactType}
                    </span>
                    <p className="text-white font-semibold">
                      {imp.description}
                    </p>
                    <p className="text-[11px] text-[var(--color-text-muted)]">
                      Impacted Segment: <strong className="text-slate-300">{imp.affectedSegmentId}</strong>
                    </p>
                  </div>
                  <span className={`text-[10px] px-2.5 py-0.5 rounded-full uppercase font-bold border ${
                    imp.severityLevel === 'CRITICAL' ? 'bg-red-500/20 text-red-300 border-red-500/40' :
                    imp.severityLevel === 'HIGH' ? 'bg-amber-500/20 text-amber-300 border-amber-500/40' :
                    'bg-blue-500/20 text-blue-300 border-blue-500/40'
                  }`}>
                    {imp.severityLevel}
                  </span>
                </div>
              ))
            ) : (
              <div className="text-center py-8 text-xs text-[var(--color-text-muted)] bg-[var(--color-bg)] rounded-xl border border-[var(--color-surface-light)]">
                No active downstream impact nodes detected.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default RecoveryPanel;

