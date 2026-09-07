import { useState } from 'react';
import apiService from '../services/api';

function SimulationModal({ isOpen, onClose, sessionId }) {
  const [delayMinutes, setDelayMinutes] = useState(60);
  const [disruptionType, setDisruptionType] = useState('FLIGHT_DELAYED');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  if (!isOpen || !sessionId) return null;

  const handleSimulate = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await apiService.simulateRecovery(sessionId, {
        type: disruptionType,
        delayMinutes: disruptionType === 'BUDGET_CHANGE' ? 0 : Number(delayMinutes),
        additionalBudget: disruptionType === 'BUDGET_CHANGE' ? Number(delayMinutes * 50) : 0,
      });

      if (response.success) {
        setResult(response.data);
      }
    } catch (err) {
      setError(err.message || 'Simulation failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50 overflow-y-auto">
      <div className="bg-[var(--color-surface)] border border-purple-500/40 rounded-xl w-full max-w-xl p-6 shadow-2xl relative my-8">
        <div className="flex items-center justify-between pb-4 border-b border-[var(--color-surface-light)]">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🔮</span>
            <div>
              <h3 className="text-lg font-bold text-purple-400">What-If Recovery Simulator</h3>
              <p className="text-xs text-[var(--color-text-muted)]">
                Simulate hypothetical cascade delays without modifying the active trip state
              </p>
            </div>
          </div>
        </div>

        {error && (
          <div className="bg-red-950/50 border border-red-800 text-red-300 text-xs p-3 rounded-md mt-4">
            {error}
          </div>
        )}

        <div className="mt-4 space-y-4 text-xs">
          <div>
            <label className="block text-xs font-semibold text-[var(--color-text-muted)] uppercase mb-1">
              Hypothetical Disruption Event
            </label>
            <select
              value={disruptionType}
              onChange={(e) => setDisruptionType(e.target.value)}
              className="w-full bg-[var(--color-bg)] border border-[var(--color-surface-light)] rounded-md px-3 py-2 text-xs text-[var(--color-text)] focus:outline-none focus:border-purple-500"
            >
              <option value="FLIGHT_DELAYED">Additional Flight Delay</option>
              <option value="TRAIN_DELAYED">Additional Train Delay</option>
              <option value="FLIGHT_CANCELLED">Flight / Segment Cancellation</option>
              <option value="MISSED_CONNECTION">Missed Transfer Window</option>
              <option value="BUDGET_CHANGE">Budget Increase Simulation</option>
            </select>
          </div>

          {disruptionType === 'BUDGET_CHANGE' ? (
            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="text-xs font-semibold text-[var(--color-text-muted)] uppercase">
                  Additional Budget (INR)
                </label>
                <span className="font-bold text-purple-400 font-mono">+₹{delayMinutes * 50}</span>
              </div>
              <input
                type="range"
                min="1000"
                max="10000"
                step="1000"
                value={delayMinutes * 50}
                onChange={(e) => setDelayMinutes(Math.round(e.target.value / 50))}
                className="w-full accent-purple-500 cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-[var(--color-text-muted)] mt-1">
                <span>+₹1,000</span>
                <span>+₹3,000</span>
                <span>+₹5,000</span>
                <span>+₹10,000</span>
              </div>
            </div>
          ) : disruptionType !== 'FLIGHT_CANCELLED' ? (
            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="text-xs font-semibold text-[var(--color-text-muted)] uppercase">
                  Additional Delay
                </label>
                <span className="font-bold text-purple-400 font-mono">+{delayMinutes} minutes</span>
              </div>
              <input
                type="range"
                min="15"
                max="180"
                step="15"
                value={delayMinutes}
                onChange={(e) => setDelayMinutes(e.target.value)}
                className="w-full accent-purple-500 cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-[var(--color-text-muted)] mt-1">
                <span>+15m</span>
                <span>+60m</span>
                <span>+120m</span>
                <span>+180m</span>
              </div>
            </div>
          ) : (
            <div className="p-3 bg-red-950/20 border border-red-800/40 rounded text-xs text-red-300">
              ⚠️ Simulating immediate segment cancellation. Downstream connections will be severed to evaluate alternative multimodal recovery feasibility.
            </div>
          )}

          <button
            type="button"
            onClick={handleSimulate}
            disabled={loading}
            className="w-full py-2.5 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-lg text-xs transition-colors shadow-lg shadow-purple-900/40 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading ? 'Simulating...' : '⚡ Run What-If Simulation'}
          </button>

          {/* SIMULATION RESULTS */}
          {result && (
            <div className="mt-4 p-4 rounded-lg bg-[var(--color-bg)] border border-purple-500/30 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] bg-purple-500/20 text-purple-300 px-2 py-0.5 rounded font-mono font-bold">
                  SIMULATION RESULT (ID: {result.simulationId})
                </span>
                <span className="text-[10px] text-emerald-400 font-semibold">
                  Original State Preserved
                </span>
              </div>

              <div className="p-2.5 bg-purple-950/20 border border-purple-800/30 rounded text-[11px] text-purple-200">
                🔮 <strong>SIMULATION ONLY</strong>: Real trip state and active recovery plan remain completely untouched in database.
              </div>

              <p className="text-xs text-[var(--color-text)] font-semibold">
                {result.summary}
              </p>

              {/* Simulated Risk */}
              <div className="p-3 bg-[var(--color-surface)] rounded border border-[var(--color-surface-light)] flex items-center justify-between">
                <div>
                  <p className="text-[10px] text-[var(--color-text-muted)] uppercase">Simulated Risk</p>
                  <p className="text-sm font-black text-amber-400">
                    {result.simulatedRisk?.score}/100 ({result.simulatedRisk?.level})
                  </p>
                </div>
                <div className="text-right text-[11px] text-[var(--color-text-muted)]">
                  <p>Broken Connections: <span className="font-bold text-red-400">{result.impactReport?.brokenConnections?.length || 0}</span></p>
                  <p>Deadline Conflict: <span className="font-bold text-amber-400">{result.impactReport?.deadlineConflict ? 'YES' : 'NO'}</span></p>
                </div>
              </div>

              {/* Predicted Recommendation */}
              {result.predictedOutcome?.recommendation && (
                <div className="p-2.5 bg-blue-950/30 border border-blue-800/40 rounded text-[11px] text-blue-200">
                  <span className="font-bold uppercase tracking-wide text-blue-400 block mb-0.5">Predicted Outcome:</span>
                  {result.predictedOutcome.recommendation}
                </div>
              )}

              {/* Broken Connections details */}
              {result.impactReport?.brokenConnections?.length > 0 && (
                <div className="space-y-1">
                  <span className="text-[10px] uppercase font-bold text-red-400">Broken Connections:</span>
                  {result.impactReport.brokenConnections.map((bc, idx) => (
                    <p key={idx} className="text-[11px] text-red-300/90 leading-tight">
                      • {typeof bc === 'string' ? bc : bc.description}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 pt-4 border-t border-[var(--color-surface-light)] mt-4">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export default SimulationModal;
