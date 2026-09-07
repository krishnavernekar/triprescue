function getEventBadge(type) {
  switch (type) {
    case 'OBSERVATION_CREATED':
      return { label: 'OBSERVE', bg: 'bg-blue-500/20 text-blue-400 border-blue-500/40', icon: '👁️' };
    case 'STRATEGY_SELECTED':
      return { label: 'STRATEGY', bg: 'bg-purple-500/20 text-purple-400 border-purple-500/40', icon: '🎯' };
    case 'DECISION_MADE':
      return { label: 'DECIDE', bg: 'bg-indigo-500/20 text-indigo-400 border-indigo-500/40', icon: '🧠' };
    case 'TOOL_STARTED':
    case 'TOOL_COMPLETED':
      return { label: 'ACT', bg: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/40', icon: '⚡' };
    case 'TOOL_FAILED':
      return { label: 'TOOL ERROR', bg: 'bg-red-500/20 text-red-400 border-red-500/40', icon: '⚡' };
    case 'FALLBACK_TRIGGERED':
      return { label: 'FALLBACK', bg: 'bg-amber-500/20 text-amber-300 border-amber-500/40', icon: '🔀' };
    case 'PROVIDER_SWITCHED':
      return { label: 'SWITCH', bg: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40', icon: '🔁' };
    case 'PLAN_CREATED':
      return { label: 'PLAN', bg: 'bg-teal-500/20 text-teal-400 border-teal-500/40', icon: '📦' };
    case 'PLAN_EVALUATED':
      return { label: 'EVALUATE', bg: 'bg-amber-500/20 text-amber-400 border-amber-500/40', icon: '⚖️' };
    case 'PLAN_REJECTED':
      return { label: 'REJECTED', bg: 'bg-rose-500/20 text-rose-400 border-rose-500/40', icon: '❌' };
    case 'FAILURE_DETECTED':
      return { label: 'FAILURE', bg: 'bg-red-500/20 text-red-400 border-red-500/40', icon: '⚠️' };
    case 'ADAPTATION_TRIGGERED':
      return { label: 'ADAPT', bg: 'bg-orange-500/20 text-orange-400 border-orange-500/40', icon: '🔄' };
    case 'RISK_UPDATED':
      return { label: 'TRIPSHIELD', bg: 'bg-amber-500/20 text-amber-300 border-amber-500/40', icon: '🛡️' };
    case 'PLAN_VERIFIED':
      return { label: 'VERIFIED', bg: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40', icon: '✓' };
    case 'RECOVERY_PLAN_READY':
      return { label: 'PLAN READY', bg: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40', icon: '📋' };
    case 'AWAITING_APPROVAL':
      return { label: 'APPROVAL REQ', bg: 'bg-amber-500/20 text-amber-300 border-amber-500/40', icon: '⏳' };
    case 'RECOVERY_COMPLETED':
      return { label: 'COMPLETED', bg: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40', icon: '🎉' };
    case 'RECOVERY_STARTED':
      return { label: 'START', bg: 'bg-blue-600/30 text-blue-300 border-blue-500/50', icon: '🚀' };
    case 'IMPACT_DETECTED':
      return { label: 'CASCADE', bg: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/40', icon: '🌊' };
    case 'LLM_STARTED':
      return { label: 'AI REASONING', bg: 'bg-violet-500/20 text-violet-300 border-violet-500/40', icon: '🤖' };
    case 'LLM_COMPLETED':
      return { label: 'AI EVALUATED', bg: 'bg-violet-500/20 text-violet-400 border-violet-500/40', icon: '✨' };
    case 'LLM_FAILED':
      return { label: 'AI UNAVAILABLE', bg: 'bg-rose-500/20 text-rose-400 border-rose-500/40', icon: '🚨' };
    case 'LLM_FALLBACK':
      return { label: 'RULE FALLBACK', bg: 'bg-amber-500/20 text-amber-300 border-amber-500/40', icon: '🔁' };
    case 'LLM_DECISION':
      return { label: 'AI DECISION', bg: 'bg-purple-500/20 text-purple-300 border-purple-500/40', icon: '💡' };
    case 'LLM_DECISION_REJECTED':
      return { label: 'REJECTED BY SAFETY GUARD', bg: 'bg-rose-500/20 text-rose-400 border-rose-500/40', icon: '🛡️' };
    case 'HANDOFF_APPROVED':
      return { label: 'APPROVED', bg: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40', icon: '🤝' };
    case 'EXTERNAL_HANDOFF':
      return { label: 'HANDOFF', bg: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40', icon: '🌐' };
    case 'HANDOFF_FAILED':
      return { label: 'HANDOFF REJECTED', bg: 'bg-rose-500/20 text-rose-300 border-rose-500/40', icon: '⚠️' };
    default:
      return { label: type?.replace('_', ' ') || 'EVENT', bg: 'bg-slate-700/50 text-slate-300 border-slate-600', icon: '•' };
  }
}

function formatTime(isoString) {
  if (!isoString) return '';
  try {
    const d = new Date(isoString);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  } catch {
    return '';
  }
}

function AgentTimeline({ events = [] }) {
  if (!events || events.length === 0) {
    return (
      <div className="text-center py-8 text-[var(--color-text-muted)] text-xs">
        No recovery timeline events recorded yet. Click [Find My Best Recovery] to search alternative options.
      </div>
    );
  }

  return (
    <div className="space-y-2.5 max-h-96 overflow-y-auto pr-1">
      {events.map((evt, idx) => {
        const badge = getEventBadge(evt.type);

        return (
          <div
            key={evt.eventId || idx}
            className="flex items-start gap-3 p-2.5 rounded-lg bg-[var(--color-bg)] border border-[var(--color-surface-light)] hover:border-slate-600 transition-colors text-xs font-mono"
          >
            <span className="text-base shrink-0 select-none mt-0.5">{badge.icon}</span>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-bold border tracking-wider uppercase ${badge.bg}`}
                >
                  [{badge.label}]
                </span>

                {evt.strategy && (
                  <span className="text-[10px] bg-[var(--color-surface)] text-[var(--color-text-muted)] px-1.5 py-0.5 rounded border border-[var(--color-surface-light)]">
                    {evt.strategy}
                  </span>
                )}

                {evt.iteration > 0 && (
                  <span className="text-[10px] text-slate-400">
                    Step #{evt.iteration}
                  </span>
                )}

                <span className="text-[10px] text-slate-500 ml-auto font-sans">
                  {formatTime(evt.timestamp)}
                </span>
              </div>

              <p className="text-[var(--color-text)] font-sans text-xs leading-relaxed">
                {evt.message}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default AgentTimeline;
