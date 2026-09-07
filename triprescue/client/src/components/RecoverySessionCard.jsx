function RecoverySessionCard({ session, trip }) {
  if (!session && trip?.status !== 'DISRUPTED') return null;

  const obj = session?.objective || trip?.recoveryObjective;
  const destination = obj?.destination || trip?.destination || 'Destination';
  const deadline = obj?.arrivalDeadline || trip?.arrivalDeadline;
  const budget = obj?.maxAdditionalBudget !== undefined ? obj.maxAdditionalBudget : trip?.maxAdditionalBudget || 0;
  const priority = obj?.priority || trip?.priority || 'arrival_time';
  const status = session?.status || session?.currentStatus || 'READY';

  const formatDeadline = (dl) => {
    if (!dl) return 'End of Day';
    try {
      const d = new Date(dl);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
    } catch {
      return String(dl);
    }
  };

  const formatPriority = (p) => {
    if (p === 'arrival_time') return 'Arrival time';
    if (p === 'cost') return 'Cost';
    if (p === 'reliability') return 'Reliability';
    if (p === 'transfers') return 'Transfers';
    return p;
  };

  return (
    <div className="bg-gradient-to-r from-red-950/40 via-amber-950/30 to-blue-950/30 border-2 border-amber-500/60 rounded-xl p-6 mb-6 shadow-xl relative overflow-hidden">
      {/* Decorative accent */}
      <div className="absolute top-0 right-0 bg-amber-500 text-black text-xs font-black px-4 py-1 rounded-bl-lg tracking-wider uppercase">
        Active Protection Session
      </div>

      <div className="flex items-center gap-3 mb-4">
        <span className="text-3xl animate-pulse">🛡️</span>
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-extrabold text-amber-300 tracking-wide uppercase">
              RECOVERY SESSION CREATED
            </h2>
            <span className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 text-xs px-2.5 py-0.5 rounded-full font-mono font-bold">
              STATUS: {status}
            </span>
          </div>
          <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
            Session ID: {session?._id || trip?.currentRecoverySessionId?._id || trip?.currentRecoverySessionId || 'Active'}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-[var(--color-surface)]/80 p-4 rounded-lg border border-[var(--color-surface-light)] mb-4">
        <div>
          <p className="text-xs text-[var(--color-text-muted)] uppercase tracking-wider">
            Recovery Objective
          </p>
          <p className="text-base font-bold text-[var(--color-text)] mt-1">
            Reach {destination} before {formatDeadline(deadline)}
          </p>
        </div>
        <div>
          <p className="text-xs text-[var(--color-text-muted)] uppercase tracking-wider">
            Budget
          </p>
          <p className="text-base font-bold text-emerald-400 mt-1">
            ₹{budget.toLocaleString('en-IN')}
          </p>
        </div>
        <div>
          <p className="text-xs text-[var(--color-text-muted)] uppercase tracking-wider">
            Priority
          </p>
          <p className="text-base font-bold text-blue-400 mt-1 capitalize">
            {formatPriority(priority)}
          </p>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-emerald-950/30 border border-emerald-500/30 px-4 py-3 rounded-lg">
        <div className="flex items-center gap-2 text-emerald-300 font-semibold text-sm">
          <span>✓</span>
          <span>Trip is ready for autonomous recovery.</span>
        </div>
        <span className="text-xs text-emerald-400 bg-[var(--color-surface)] px-2.5 py-1 rounded border border-emerald-500/30">
          Autonomous Recovery Engine Active
        </span>
      </div>
    </div>
  );
}

export default RecoverySessionCard;
