import { useState } from 'react';
import RecoveryPanel from './RecoveryPanel';
import ReportDisruptionModal from './ReportDisruptionModal';
import AddSegmentModal from './AddSegmentModal';
import InsuranceCompensationPanel from './InsuranceCompensationPanel';
import TripShieldRiskCard from './TripShieldRiskCard';
import MonitoringControl from './MonitoringControl';
import SimulationModal from './SimulationModal';
import { formatDate, formatCurrency, modeIcon, translateDisruption } from '../utils/formatters';

function TripDetail({ trip, onTripUpdated, debugMode }) {
  const [isDisruptionOpen, setIsDisruptionOpen] = useState(false);
  const [isAddSegmentOpen, setIsAddSegmentOpen] = useState(false);
  const [isSimModalOpen, setIsSimModalOpen] = useState(false);
  const [activeToolTab, setActiveToolTab] = useState('risk'); // 'risk' | 'monitoring' | 'insurance' | 'constraints'

  if (!trip) {
    return (
      <div className="bg-[var(--color-surface)] rounded-2xl p-12 border border-[var(--color-surface-light)] text-center space-y-3">
        <span className="text-4xl block">🛫</span>
        <h3 className="text-lg font-bold text-white">Select a Journey</h3>
        <p className="text-xs text-[var(--color-text-muted)] max-w-sm mx-auto">
          Choose an itinerary from the list above or create a new trip to view recovery plans and real-time protection.
        </p>
      </div>
    );
  }

  const obj = trip.recoveryObjective || {};
  const hard = obj.hardConstraints || {};
  const soft = obj.softConstraints || {};
  const session = trip.currentRecoverySessionId && typeof trip.currentRecoverySessionId === 'object'
    ? trip.currentRecoverySessionId
    : null;
  const sessionId = session?._id || (typeof trip.currentRecoverySessionId === 'string' ? trip.currentRecoverySessionId : null);

  const isDisrupted = trip.status === 'DISRUPTED' || Boolean(trip.disruption);
  const hasSelectedPlan = Boolean(session?.selectedPlan);
  const isApproved = session?.selectedPlan?.status === 'APPROVED';

  // Determine current step index for the Stepper (1 to 6)
  let currentStep = 1;
  if (isDisrupted) currentStep = 2;
  if (session?.riskScore) currentStep = 3;
  if (session?.candidatePlans?.length > 0 || hasSelectedPlan) currentStep = 4;
  if (hasSelectedPlan) currentStep = 5;
  if (isApproved) currentStep = 6;

  return (
    <div className="space-y-6">
      {/* 1. Recovery Progress Stepper */}
      <div className="bg-[var(--color-surface)] rounded-2xl p-4 sm:p-5 border border-[var(--color-surface-light)] shadow-sm">
        <p className="text-[10px] font-bold text-[var(--color-text-muted)] uppercase tracking-wider mb-3">
          Journey Recovery Progress
        </p>
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 text-center text-xs">
          {[
            { step: 1, label: 'Trip Itinerary', icon: '✈️' },
            { step: 2, label: 'Disruption Status', icon: isDisrupted ? '⚠️' : '🟢' },
            { step: 3, label: 'Impact Analysis', icon: '🛡️' },
            { step: 4, label: 'Recovery Search', icon: '⚡' },
            { step: 5, label: 'Plan Review', icon: '📋' },
            { step: 6, label: 'Provider Handoff', icon: '🌐' },
          ].map(({ step, label, icon }) => {
            const isCompleted = currentStep > step;
            const isCurrent = currentStep === step;

            return (
              <div
                key={step}
                className={`p-2.5 rounded-xl border flex flex-col items-center justify-between gap-1 transition ${
                  isCurrent
                    ? 'bg-blue-950/60 border-blue-500 text-white ring-1 ring-blue-500/50'
                    : isCompleted
                    ? 'bg-emerald-950/20 border-emerald-500/30 text-emerald-300'
                    : 'bg-[var(--color-bg)] border-[var(--color-surface-light)] text-slate-500 opacity-60'
                }`}
              >
                <div className="flex items-center gap-1">
                  <span>{icon}</span>
                  <span className="font-mono text-[10px] font-bold">
                    {isCompleted ? '✓' : `#${step}`}
                  </span>
                </div>
                <span className="text-[11px] font-semibold leading-tight">{label}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* 2. Disruption Status Hero: "What happened? What is affected? What should I do?" */}
      {isDisrupted ? (
        <div className="bg-gradient-to-br from-red-950/60 via-slate-900 to-slate-950 border-2 border-red-500/60 rounded-2xl p-5 sm:p-6 shadow-xl space-y-4">
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 pb-4 border-b border-red-900/40">
            <div className="flex items-start gap-3.5">
              <div className="w-12 h-12 rounded-2xl bg-red-600/20 border border-red-500/40 flex items-center justify-center text-2xl shrink-0">
                🚨
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs bg-red-500/20 text-red-300 border border-red-500/40 px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider">
                    {translateDisruption(trip.disruption?.type)}
                  </span>
                  <span className="text-xs text-slate-400">
                    Detected {formatDate(trip.disruption?.detectedAt || new Date())}
                  </span>
                </div>
                <h3 className="text-lg sm:text-xl font-black text-white">
                  {trip.disruption?.description || 'A scheduled segment disruption was detected on your journey.'}
                </h3>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <span className="text-xs bg-red-900/30 text-red-400 border border-red-700/50 px-3 py-1 rounded-lg font-mono font-bold">
                RECOVERY REQUIRED
              </span>
            </div>
          </div>

          {/* Three Questions Breakdown */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
            <div className="p-3.5 bg-slate-900/80 rounded-xl border border-red-900/30 space-y-1">
              <span className="text-[10px] font-bold text-red-400 uppercase tracking-wider block">
                1. What happened?
              </span>
              <p className="text-xs text-slate-200 font-medium">
                {trip.disruption?.description || 'Your scheduled leg has been disrupted.'}
              </p>
            </div>

            <div className="p-3.5 bg-slate-900/80 rounded-xl border border-red-900/30 space-y-1">
              <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider block">
                2. What is affected?
              </span>
              <p className="text-xs text-slate-200 font-medium">
                {trip.disruption?.expectedImpact || 'Downstream connection window compressed below safety threshold.'}
              </p>
            </div>

            <div className="p-3.5 bg-slate-900/80 rounded-xl border border-red-900/30 space-y-1">
              <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider block">
                3. What should I do?
              </span>
              <p className="text-xs text-slate-200 font-medium">
                {session?.selectedPlan
                  ? 'Review the recommended multimodal recovery plan below and proceed to booking.'
                  : 'Start autonomous recovery to search alternative flights, trains, and buses.'}
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-emerald-950/20 border border-emerald-500/40 rounded-2xl p-4 sm:p-5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🟢</span>
            <div>
              <h3 className="font-bold text-sm text-emerald-300">All Scheduled Segments On Time</h3>
              <p className="text-xs text-slate-400">
                Continuous dynamic monitoring is active. All connection buffers meet safety thresholds.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setIsDisruptionOpen(true)}
            className="px-3.5 py-2 text-xs font-bold bg-red-600/20 hover:bg-red-600/30 text-red-300 border border-red-500/40 rounded-xl transition shrink-0"
          >
            ⚠️ Report Disruption
          </button>
        </div>
      )}

      {/* 3. Primary Autonomous Recovery Panel */}
      {isDisrupted && (
        <RecoveryPanel
          session={session}
          trip={trip}
          onSessionUpdated={(updatedSession) => {
            onTripUpdated({
              ...trip,
              currentRecoverySessionId: updatedSession,
            });
          }}
          debugMode={debugMode}
        />
      )}

      {/* 4. Journey Overview & Itinerary Details Card */}
      <div className="bg-[var(--color-surface)] rounded-2xl p-5 sm:p-6 border border-[var(--color-surface-light)] shadow-md space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[var(--color-surface-light)]">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-2xl shrink-0">
              🛫
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                  {trip.origin} → {trip.destination}
                </h2>
                <span
                  className={`text-[10px] px-2.5 py-0.5 rounded-full font-bold uppercase border ${
                    isDisrupted
                      ? 'bg-red-500/20 text-red-300 border-red-500/40'
                      : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                  }`}
                >
                  {trip.status}
                </span>
              </div>
              <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                Traveler: <strong className="text-white">{trip.passengerName}</strong> ({trip.passengerCount} {trip.passengerCount === 1 ? 'traveler' : 'travelers'})
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0 flex-wrap">
            <button
              type="button"
              onClick={() => setIsAddSegmentOpen(true)}
              className="px-3.5 py-2 text-xs font-semibold bg-[var(--color-bg)] hover:bg-slate-800 text-slate-200 rounded-xl border border-[var(--color-surface-light)] transition flex items-center gap-1.5"
            >
              <span>+</span> Add Segment
            </button>
            <button
              type="button"
              onClick={() => setIsDisruptionOpen(true)}
              className="px-3.5 py-2 text-xs font-bold bg-red-600 hover:bg-red-500 text-white rounded-xl transition shadow-md shadow-red-950/50 flex items-center gap-1.5"
            >
              <span>⚠️</span> Report Disruption
            </button>
          </div>
        </div>

        {/* Quick Travel Constraints Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div className="p-3 bg-[var(--color-bg)] rounded-xl border border-[var(--color-surface-light)]">
            <span className="text-[10px] font-bold text-[var(--color-text-muted)] uppercase block">
              Departure
            </span>
            <span className="font-semibold text-white text-sm">
              {formatDate(trip.departureTime)}
            </span>
          </div>

          <div className="p-3 bg-[var(--color-bg)] rounded-xl border border-[var(--color-surface-light)]">
            <span className="text-[10px] font-bold text-[var(--color-text-muted)] uppercase block">
              Arrival Deadline
            </span>
            <span className="font-semibold text-amber-400 text-sm">
              {formatDate(trip.arrivalDeadline)}
            </span>
          </div>

          <div className="p-3 bg-[var(--color-bg)] rounded-xl border border-[var(--color-surface-light)]">
            <span className="text-[10px] font-bold text-[var(--color-text-muted)] uppercase block">
              Max Additional Budget
            </span>
            <span className="font-semibold text-emerald-400 text-sm">
              {formatCurrency(trip.maxAdditionalBudget || 0)}
            </span>
          </div>

          <div className="p-3 bg-[var(--color-bg)] rounded-xl border border-[var(--color-surface-light)]">
            <span className="text-[10px] font-bold text-[var(--color-text-muted)] uppercase block">
              Priority
            </span>
            <span className="font-semibold text-blue-400 text-sm capitalize">
              {trip.priority?.replace('_', ' ') || 'Fastest Arrival'}
            </span>
          </div>
        </div>

        {/* Itinerary Segment List */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
              Itinerary Segments ({trip.itinerary?.length || 0})
            </h3>
          </div>

          {trip.itinerary && trip.itinerary.length > 0 ? (
            <div className="space-y-2.5">
              {trip.itinerary.map((seg, idx) => (
                <div
                  key={seg.segmentId || idx}
                  className="bg-[var(--color-bg)] rounded-xl p-3.5 border border-[var(--color-surface-light)] flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs hover:border-slate-600 transition"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-[var(--color-surface)] flex items-center justify-center text-lg shrink-0">
                      {modeIcon(seg.transportMode)}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-white text-sm">
                          {seg.origin?.code || seg.origin} → {seg.destination?.code || seg.destination}
                        </span>
                        <span className="text-[10px] bg-[var(--color-surface)] text-slate-400 px-1.5 py-0.2 rounded uppercase">
                          {seg.transportMode}
                        </span>
                        <span className="text-[10px] text-emerald-400 font-semibold uppercase">
                          {seg.status}
                        </span>
                      </div>
                      <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5">
                        {seg.carrier} {seg.identifier && `• ${seg.identifier}`}
                      </p>
                    </div>
                  </div>

                  <div className="text-left sm:text-right text-xs">
                    <p className="text-slate-200 font-medium">
                      Dep: {formatDate(seg.departure)}
                    </p>
                    <p className="text-slate-400">
                      Arr: {formatDate(seg.arrival)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-6 bg-[var(--color-bg)] rounded-xl border border-dashed border-[var(--color-surface-light)]">
              <p className="text-xs text-[var(--color-text-muted)]">No segments added yet.</p>
              <button
                type="button"
                onClick={() => setIsAddSegmentOpen(true)}
                className="mt-2 text-xs bg-blue-600 hover:bg-blue-500 text-white font-semibold px-3 py-1.5 rounded-lg transition"
              >
                + Add First Segment
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 5. Secondary "More Tools" Workspace (Non-intrusive Tabbed Container) */}
      <div className="bg-[var(--color-surface)] rounded-2xl p-5 sm:p-6 border border-[var(--color-surface-light)] shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[var(--color-surface-light)]">
          <div className="flex items-center gap-2">
            <span className="text-lg">🧰</span>
            <div>
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                Protection Tools & Analysis
              </h3>
              <p className="text-[11px] text-[var(--color-text-muted)]">
                Secondary analysis tools, hypothetical simulations, and compensation drafting
              </p>
            </div>
          </div>

          {/* Secondary Tab Switcher */}
          <div className="flex items-center gap-1 bg-[var(--color-bg)] p-1 rounded-xl border border-[var(--color-surface-light)] overflow-x-auto">
            {[
              { key: 'risk', label: '🛡️ TripShield Risk' },
              { key: 'monitoring', label: '📡 Dynamic Monitoring' },
              { key: 'insurance', label: '📑 Rights & Claims' },
              { key: 'constraints', label: '🔒 Constraints' },
            ].map(({ key, label }) => (
              <button
                key={key}
                type="button"
                onClick={() => setActiveToolTab(key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition ${
                  activeToolTab === key
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Tab Content */}
        {activeToolTab === 'risk' && (
          <TripShieldRiskCard
            riskScore={session?.riskScore}
            disruption={trip.disruption}
          />
        )}

        {activeToolTab === 'monitoring' && sessionId && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs text-slate-300">
                Continuous flight and connection monitoring engine. Detects schedule changes and prevents cascade failures.
              </p>
              <button
                type="button"
                onClick={() => setIsSimModalOpen(true)}
                className="px-3 py-1 bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 border border-purple-500/40 rounded-lg text-xs font-bold transition flex items-center gap-1"
              >
                <span>🔮</span> Run What-If Simulation
              </button>
            </div>
            <MonitoringControl sessionId={sessionId} onSessionUpdated={onTripUpdated} />
          </div>
        )}

        {activeToolTab === 'insurance' && (
          <InsuranceCompensationPanel trip={trip} />
        )}

        {activeToolTab === 'constraints' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div className="p-4 bg-[var(--color-bg)] rounded-xl border border-slate-700 space-y-2">
              <h4 className="font-bold text-white uppercase tracking-wider text-[11px] text-red-400">
                🔒 Strict Hard Constraints (Never Violated)
              </h4>
              <p className="text-slate-300 leading-snug">
                Destination Required: <strong className="text-emerald-400">Yes (Strict)</strong>
              </p>
              <p className="text-slate-300 leading-snug">
                Arrival Deadline: <strong className="text-amber-400">{trip.arrivalDeadline ? formatDate(trip.arrivalDeadline) : 'None'}</strong>
              </p>
              <p className="text-slate-300 leading-snug">
                Max Additional Budget: <strong className="text-emerald-400">{formatCurrency(trip.maxAdditionalBudget || 0)}</strong>
              </p>
              <p className="text-slate-300 leading-snug">
                Passenger Count: <strong className="text-white">{trip.passengerCount || 1}</strong>
              </p>
            </div>

            <div className="p-4 bg-[var(--color-bg)] rounded-xl border border-slate-700 space-y-2">
              <h4 className="font-bold text-white uppercase tracking-wider text-[11px] text-blue-400">
                ⚙️ Soft Constraints & Preferences
              </h4>
              <p className="text-slate-300 leading-snug">
                Preferred Airline: <strong className="text-white">{soft.preferredAirline || 'Any Available'}</strong>
              </p>
              <p className="text-slate-300 leading-snug">
                Preferred Mode: <strong className="text-white capitalize">{soft.preferredTransportMode || 'Multimodal'}</strong>
              </p>
              <p className="text-slate-300 leading-snug">
                Max Allowed Transfers: <strong className="text-white">{soft.maxTransfers !== undefined ? soft.maxTransfers : 1}</strong>
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Modals */}
      <ReportDisruptionModal
        isOpen={isDisruptionOpen}
        onClose={() => setIsDisruptionOpen(false)}
        trip={trip}
        onDisruptionReported={(updatedData) => {
          onTripUpdated(updatedData.trip || updatedData);
        }}
      />

      <AddSegmentModal
        isOpen={isAddSegmentOpen}
        onClose={() => setIsAddSegmentOpen(false)}
        trip={trip}
        onSegmentAdded={(updatedTrip) => {
          onTripUpdated(updatedTrip);
        }}
      />

      <SimulationModal
        isOpen={isSimModalOpen}
        onClose={() => setIsSimModalOpen(false)}
        sessionId={sessionId}
      />
    </div>
  );
}

export default TripDetail;

