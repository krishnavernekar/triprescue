import { useState, useEffect } from 'react';
import apiService from '../services/api';

function MonitoringControl({ sessionId, onSessionUpdated }) {
  const [statusData, setStatusData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastResult, setLastResult] = useState(null);

  const fetchStatus = async () => {
    if (!sessionId) return;
    try {
      const res = await apiService.getMonitoringStatus(sessionId);
      if (res.success) {
        setStatusData(res.data);
      }
    } catch (err) {
      // Non-blocking
    }
  };

  useEffect(() => {
    fetchStatus();
  }, [sessionId]);

  const handleCheckNow = async () => {
    if (!sessionId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiService.checkMonitoringNow(sessionId);
      if (res.success) {
        setLastResult(res.data);
        await fetchStatus();
        if (res.data.replanTriggered && onSessionUpdated) {
          // Re-fetch updated recovery session
          const sessionRes = await apiService.getRecoverySession(sessionId);
          if (sessionRes.success) {
            onSessionUpdated(sessionRes.data);
          }
        }
      }
    } catch (err) {
      setError(err.message || 'Check failed');
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = async () => {
    if (!sessionId || !statusData) return;
    setLoading(true);
    setError(null);
    try {
      if (statusData.status === 'ACTIVE') {
        await apiService.pauseMonitoring(sessionId);
      } else {
        await apiService.startMonitoring(sessionId);
      }
      await fetchStatus();
    } catch (err) {
      setError(err.message || 'Action failed');
    } finally {
      setLoading(false);
    }
  };

  const status = statusData?.status || 'STOPPED';
  const isRunning = status === 'ACTIVE';

  return (
    <div className="bg-[var(--color-bg)] rounded-lg p-3.5 border border-emerald-900/30 text-xs mb-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-2.5 border-b border-[var(--color-surface-light)]">
        <div className="flex items-center gap-2">
          <span className="text-sm">📡</span>
          <span className="font-bold text-[var(--color-text)] uppercase tracking-wider text-[11px]">
            Active Trip Monitoring
          </span>
          <span
            className={`px-2 py-0.5 rounded font-mono text-[10px] font-bold ${
              isRunning
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                : status === 'PAUSED'
                ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                : 'bg-slate-700/40 text-slate-400 border border-slate-600/30'
            }`}
          >
            ● {status}
          </span>
          {statusData?.replanCount > 0 && (
            <span className="px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 font-mono text-[10px]">
              Replans: {statusData.replanCount}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleCheckNow}
            disabled={loading}
            className="px-2.5 py-1 text-[11px] font-bold bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/40 rounded transition-colors flex items-center gap-1 disabled:opacity-50"
          >
            <span>⚡</span> {loading ? 'Checking...' : 'Check Now'}
          </button>
          <button
            type="button"
            onClick={handleToggle}
            disabled={loading}
            className="px-2.5 py-1 text-[11px] font-semibold bg-[var(--color-surface-light)] hover:bg-slate-700 text-[var(--color-text-muted)] hover:text-[var(--color-text)] rounded transition-colors disabled:opacity-50"
          >
            {isRunning ? '⏸️ Pause' : '▶️ Resume'}
          </button>
        </div>
      </div>

      {error && (
        <p className="mt-2 text-[11px] text-red-400 bg-red-950/30 p-2 rounded">
          {error}
        </p>
      )}

      {/* Monitoring state details */}
      <div className="mt-2.5 grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px] text-[var(--color-text-muted)]">
        <div>
          <span className="block text-[10px] uppercase font-semibold text-slate-500">Last Checked:</span>
          <span className="font-mono text-[var(--color-text)]">
            {statusData?.lastCheckedAt ? new Date(statusData.lastCheckedAt).toLocaleTimeString() : 'Not yet checked'}
          </span>
        </div>
        <div>
          <span className="block text-[10px] uppercase font-semibold text-slate-500">Last Monitored Event:</span>
          <span className="font-mono text-amber-300">
            {statusData?.lastObservation?.eventType || 'Nominal (No Change)'}
          </span>
        </div>
        <div>
          <span className="block text-[10px] uppercase font-semibold text-slate-500">Autonomous Re-evaluations:</span>
          <span className="font-mono text-emerald-400">
            {statusData?.replanCount || 0} Replans Executed
          </span>
        </div>
      </div>

      {/* Live Check Result Banner */}
      {lastResult && (
        <div className="mt-2.5 pt-2 border-t border-[var(--color-surface-light)] text-[11px]">
          {lastResult.changeDetected ? (
            <div className="p-2 rounded bg-amber-950/20 border border-amber-800/30 text-amber-200">
              <span className="font-bold">⚠️ Event Detected: </span>
              {lastResult.monitoringEvent?.type} ({lastResult.monitoringEvent?.description || 'Schedule variation'})
              {lastResult.replanTriggered && (
                <span className="block text-blue-300 mt-1 font-bold">
                  🔄 Autonomous replan completed successfully.
                </span>
              )}
            </div>
          ) : (
            <div className="text-slate-400">
              ✓ Verified nominal: {lastResult.message}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default MonitoringControl;
