function TripShieldRiskCard({ riskScore, disruption }) {
  const score = riskScore?.score !== undefined ? riskScore.score : 50;
  const level = riskScore?.level || (score >= 70 ? 'HIGH' : score >= 40 ? 'MEDIUM' : 'LOW');
  const reasons = riskScore?.reasons || [];

  const getLevelConfig = (lvl) => {
    switch (lvl) {
      case 'CRITICAL':
        return {
          title: 'CRITICAL RISK',
          headline: 'Your journey connection is currently broken and requires immediate recovery.',
          text: 'text-rose-400',
          bg: 'bg-rose-500/20',
          border: 'border-rose-500/50',
          bar: 'bg-rose-500',
        };
      case 'HIGH':
        return {
          title: 'HIGH RISK',
          headline: 'High probability of missing downstream connections due to transfer buffer compression.',
          text: 'text-amber-400',
          bg: 'bg-amber-500/20',
          border: 'border-amber-500/50',
          bar: 'bg-amber-500',
        };
      case 'MEDIUM':
        return {
          title: 'MEDIUM RISK',
          headline: 'Your current journey has an active delay requiring connection buffer monitoring.',
          text: 'text-yellow-400',
          bg: 'bg-yellow-500/20',
          border: 'border-yellow-500/50',
          bar: 'bg-yellow-500',
        };
      default:
        return {
          title: 'LOW RISK',
          headline: 'All journey segments and transfer buffers are operating within nominal safety thresholds.',
          text: 'text-emerald-400',
          bg: 'bg-emerald-500/20',
          border: 'border-emerald-500/50',
          bar: 'bg-emerald-500',
        };
    }
  };

  const config = getLevelConfig(level);

  return (
    <div className={`p-5 rounded-2xl border ${config.border} bg-[var(--color-surface)] shadow-md space-y-4`}>
      {/* Risk Summary Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[var(--color-surface-light)]">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[var(--color-bg)] flex items-center justify-center text-xl shrink-0">
            🛡️
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="text-sm font-black text-white uppercase tracking-wider">
                TripShield Vulnerability Assessment
              </h4>
              <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase border ${config.bg} ${config.text} ${config.border}`}>
                {config.title}
              </span>
            </div>
            <p className="text-xs text-slate-300 mt-0.5 font-medium leading-relaxed">
              {config.headline}
            </p>
          </div>
        </div>

        <div className="text-left sm:text-right shrink-0">
          <p className="text-xs font-mono font-bold text-slate-400">
            TripShield Score: <strong className={`text-sm ${config.text}`}>{score}</strong> / 100
          </p>
        </div>
      </div>

      {/* Visual Risk Gauge */}
      <div className="w-full h-2 bg-[var(--color-bg)] rounded-full overflow-hidden border border-[var(--color-surface-light)]">
        <div
          className={`h-full transition-all duration-500 rounded-full ${config.bar}`}
          style={{ width: `${Math.min(100, Math.max(5, score))}%` }}
        />
      </div>

      {/* Transparent Evaluation Reasons */}
      <div className="bg-[var(--color-bg)] rounded-xl p-4 border border-[var(--color-surface-light)] space-y-2 text-xs">
        <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
          Why was this risk level assigned?
        </p>

        {reasons.length > 0 ? (
          <ul className="space-y-1.5 text-slate-200">
            {reasons.map((r, idx) => (
              <li key={idx} className="flex items-start gap-2 text-[11px] leading-snug">
                <span className="text-amber-400 shrink-0">•</span>
                <span>{r}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-slate-400">
            ✓ No acute risk factors or broken connections currently triggered.
          </p>
        )}

        {/* Collapsible Technical Factor Breakdown (Closed by default) */}
        {riskScore?.factors && (
          <details className="mt-2 pt-2 border-t border-[var(--color-surface-light)] group">
            <summary className="text-[10px] font-mono font-semibold text-slate-400 cursor-pointer hover:text-white uppercase flex items-center justify-between">
              <span>View Technical Diagnostic Breakdown</span>
              <span className="text-blue-400 group-open:rotate-180 transition-transform">▼</span>
            </summary>

            <div className="pt-2 flex flex-wrap gap-2 text-[10px] font-mono text-slate-400">
              <span className="bg-[var(--color-surface)] px-2.5 py-1 rounded-lg border border-[var(--color-surface-light)]">
                Severity: <strong className="text-slate-200">{riskScore.factors.disruptionSeverity || 'LOW'}</strong>
              </span>
              {riskScore.factors.transferBufferMarginMinutes !== null && (
                <span className="bg-[var(--color-surface)] px-2.5 py-1 rounded-lg border border-[var(--color-surface-light)]">
                  Buffer Margin: <strong className="text-slate-200">{riskScore.factors.transferBufferMarginMinutes} min</strong>
                </span>
              )}
              {riskScore.factors.alternativePlanCount !== undefined && (
                <span className="bg-[var(--color-surface)] px-2.5 py-1 rounded-lg border border-[var(--color-surface-light)]">
                  Feasible Alternatives: <strong className="text-slate-200">{riskScore.factors.alternativePlanCount}</strong>
                </span>
              )}
              {riskScore.factors.budgetUtilizationRatio > 0 && (
                <span className="bg-[var(--color-surface)] px-2.5 py-1 rounded-lg border border-[var(--color-surface-light)]">
                  Budget Utilization: <strong className="text-slate-200">{Math.round(riskScore.factors.budgetUtilizationRatio * 100)}%</strong>
                </span>
              )}
            </div>
          </details>
        )}
      </div>
    </div>
  );
}

export default TripShieldRiskCard;

