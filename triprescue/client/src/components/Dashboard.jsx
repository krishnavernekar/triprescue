import { useState, useEffect } from 'react';
import apiService from '../services/api';
import TripDetail from './TripDetail';
import CreateTripModal from './CreateTripModal';
import { formatDate, formatCurrency } from '../utils/formatters';

function MetricCard({ title, value, subtitle, icon, badge, badgeColor }) {
  return (
    <div className="bg-[var(--color-surface)] rounded-xl p-4 border border-[var(--color-surface-light)] shadow-sm flex flex-col justify-between">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[11px] font-bold text-[var(--color-text-muted)] uppercase tracking-wider">
            {title}
          </p>
          <p className="text-xl sm:text-2xl font-black mt-1 text-[var(--color-text)]">
            {value}
          </p>
        </div>
        <span className="text-2xl">{icon}</span>
      </div>
      {(subtitle || badge) && (
        <div className="flex items-center gap-2 mt-2 pt-2 border-t border-[var(--color-surface-light)]/60 text-[11px] text-[var(--color-text-muted)]">
          {badge && (
            <span className={`px-1.5 py-0.2 rounded font-bold uppercase text-[10px] ${badgeColor || 'bg-blue-500/20 text-blue-300'}`}>
              {badge}
            </span>
          )}
          <span>{subtitle}</span>
        </div>
      )}
    </div>
  );
}

function Dashboard({ isCreateOpen, setIsCreateOpen, debugMode }) {
  const [health, setHealth] = useState(null);
  const [trips, setTrips] = useState([]);
  const [selectedTripId, setSelectedTripId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [seedingDemo, setSeedingDemo] = useState(false);

  const fetchTripsAndHealth = async () => {
    try {
      const [healthData, tripsData] = await Promise.all([
        apiService.getHealth().catch(() => null),
        apiService.getTrips().catch(() => ({ success: true, data: [] })),
      ]);

      setHealth(healthData);
      const tripList = tripsData?.data || [];
      setTrips(tripList);

      if (tripList.length > 0 && !selectedTripId) {
        setSelectedTripId(tripList[0]._id);
      }
      setLoading(false);
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTripsAndHealth();
  }, []);

  const handleTripCreated = (newTrip) => {
    setTrips((prev) => [newTrip, ...prev]);
    setSelectedTripId(newTrip._id);
  };

  const handleTripUpdated = (updatedTrip) => {
    setTrips((prev) => prev.map((t) => (t._id === updatedTrip._id ? updatedTrip : t)));
  };

  const handleSeedDemoTrip = async () => {
    setSeedingDemo(true);
    setError(null);
    try {
      const now = new Date();
      const dep1 = new Date(now.getTime() + 2 * 60 * 60 * 1000);
      const arr1 = new Date(now.getTime() + 4 * 60 * 60 * 1000);
      const dep2 = new Date(now.getTime() + 5 * 60 * 60 * 1000);
      const arr2 = new Date(now.getTime() + 6 * 60 * 60 * 1000);
      const deadline = new Date(now.getTime() + 8 * 60 * 60 * 1000);

      const payload = {
        passengerName: 'Ananya Sharma',
        passengerCount: 1,
        origin: 'BLR',
        destination: 'JAI',
        departureTime: dep1.toISOString(),
        arrivalDeadline: deadline.toISOString(),
        maxAdditionalBudget: 5000,
        priority: 'arrival_time',
        riskTolerance: 'MEDIUM',
        itinerary: [
          {
            segmentId: 'SEG-BLR-DEL',
            transportMode: 'flight',
            origin: { code: 'BLR', type: 'airport' },
            destination: { code: 'DEL', type: 'airport' },
            departure: dep1.toISOString(),
            arrival: arr1.toISOString(),
            carrier: 'Air India',
            identifier: 'AI 506',
            status: 'CONFIRMED',
          },
          {
            segmentId: 'SEG-DEL-JAI',
            transportMode: 'flight',
            origin: { code: 'DEL', type: 'airport' },
            destination: { code: 'JAI', type: 'airport' },
            departure: dep2.toISOString(),
            arrival: arr2.toISOString(),
            carrier: 'IndiGo',
            identifier: '6E 2341',
            status: 'CONFIRMED',
          },
        ],
      };

      const res = await apiService.createTrip(payload);
      if (res.success && res.data) {
        handleTripCreated(res.data);
      }
    } catch (err) {
      setError('Failed to create demo journey: ' + err.message);
    } finally {
      setSeedingDemo(false);
    }
  };

  const selectedTrip = trips.find((t) => t._id === selectedTripId) || trips[0];
  const disruptedCount = trips.filter((t) => t.status === 'DISRUPTED' || t.disruption).length;
  const onTrackCount = trips.filter((t) => t.status === 'ACTIVE' && !t.disruption).length;

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] gap-3 text-[var(--color-text-muted)]">
        <span className="animate-spin text-3xl">🛡️</span>
        <p className="text-sm font-medium">Loading your travel protection dashboard...</p>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6">
      {/* Welcome Banner / Overview */}
      <div className="bg-gradient-to-r from-slate-900 via-[var(--color-surface)] to-slate-900 rounded-2xl p-5 sm:p-6 border border-[var(--color-surface-light)] shadow-lg">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5 max-w-3xl">
            <div className="flex items-center gap-2">
              <span className="text-2xl">🛡️</span>
              <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                TripShield Journey Protection
              </h2>
            </div>
            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
              Autonomous travel recovery agent that detects connection risks before you are stranded, calculates real physical transfer buffers, discovers multimodal alternatives (flight, high-speed rail, bus, hotel), and prepares verified booking handoffs.
            </p>
          </div>

          <div className="flex items-center gap-2.5 shrink-0 flex-wrap">
            <button
              type="button"
              onClick={() => setIsCreateOpen(true)}
              className="px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs sm:text-sm rounded-xl shadow-md shadow-blue-900/40 transition flex items-center gap-2"
            >
              <span>+</span>
              <span>Create New Trip</span>
            </button>
            <button
              type="button"
              onClick={handleSeedDemoTrip}
              disabled={seedingDemo}
              className="px-3.5 py-2.5 bg-[var(--color-surface-light)] hover:bg-slate-700 text-slate-200 font-semibold text-xs rounded-xl border border-slate-600 transition flex items-center gap-1.5 disabled:opacity-50"
            >
              <span>⚡</span>
              <span>{seedingDemo ? 'Loading...' : 'Load Demo Trip (BLR → JAI)'}</span>
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-red-950/50 border border-red-800 text-red-300 text-xs rounded-xl flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-white text-sm">✕</button>
        </div>
      )}

      {/* Summary Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <MetricCard
          title="Monitored Journeys"
          value={trips.length}
          subtitle="Protected Itineraries"
          icon="🗺️"
          badge={trips.length > 0 ? 'Active' : 'Empty'}
          badgeColor="bg-blue-500/20 text-blue-300"
        />
        <MetricCard
          title="On Schedule"
          value={onTrackCount}
          subtitle="Nominal Connection Buffers"
          icon="🟢"
          badge="Nominal"
          badgeColor="bg-emerald-500/20 text-emerald-400"
        />
        <MetricCard
          title="Recovery Attention"
          value={disruptedCount}
          subtitle={disruptedCount > 0 ? 'Action Recommended' : 'Zero Disruptions'}
          icon={disruptedCount > 0 ? '⚠️' : '✅'}
          badge={disruptedCount > 0 ? 'Action Needed' : 'All Clear'}
          badgeColor={disruptedCount > 0 ? 'bg-amber-500/20 text-amber-300' : 'bg-emerald-500/20 text-emerald-300'}
        />
        <MetricCard
          title="Autonomous Engine"
          value={health?.status === 'ok' ? 'Ready' : 'Standby'}
          subtitle="Real-Time Provider Discovery"
          icon="⚡"
          badge="Online"
          badgeColor="bg-purple-500/20 text-purple-300"
        />
      </div>

      {/* Trip Switcher / Carousel */}
      <div className="bg-[var(--color-surface)] rounded-2xl p-4 sm:p-5 border border-[var(--color-surface-light)] shadow-sm space-y-3">
        <div className="flex items-center justify-between pb-2 border-b border-[var(--color-surface-light)]">
          <div className="flex items-center gap-2">
            <span className="text-base">📋</span>
            <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--color-text)]">
              Your Journeys ({trips.length})
            </h3>
          </div>
          <button
            type="button"
            onClick={() => setIsCreateOpen(true)}
            className="text-xs text-blue-400 hover:text-blue-300 font-semibold"
          >
            + Add Another Trip
          </button>
        </div>

        {trips.length > 0 ? (
          <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-thin">
            {trips.map((t) => {
              const isSelected = t._id === selectedTrip?._id;
              const isDisrupted = t.status === 'DISRUPTED' || Boolean(t.disruption);

              return (
                <button
                  key={t._id}
                  type="button"
                  onClick={() => setSelectedTripId(t._id)}
                  className={`p-3.5 rounded-xl text-left transition-all shrink-0 min-w-[240px] border flex flex-col justify-between ${
                    isSelected
                      ? 'bg-blue-950/40 border-blue-500 text-white shadow-lg ring-1 ring-blue-500/50'
                      : 'bg-[var(--color-bg)] border-[var(--color-surface-light)] hover:border-slate-600 text-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-sm text-white">
                      {t.origin} → {t.destination}
                    </span>
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase border ${
                        isDisrupted
                          ? 'bg-red-500/20 text-red-300 border-red-500/40'
                          : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                      }`}
                    >
                      {isDisrupted ? '⚠️ Disruption' : '🟢 On Schedule'}
                    </span>
                  </div>

                  <div className="mt-2 text-xs text-[var(--color-text-muted)] space-y-0.5">
                    <p className="font-medium text-slate-200">{t.passengerName}</p>
                    <p className="text-[11px]">
                      {t.itinerary?.length || 0} segments • Dep: {formatDate(t.departureTime)}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-10 px-4 bg-[var(--color-bg)] rounded-xl border border-dashed border-[var(--color-surface-light)] space-y-3">
            <span className="text-4xl block">🛫</span>
            <div className="space-y-1">
              <h4 className="text-base font-bold text-white">No active trips found</h4>
              <p className="text-xs text-[var(--color-text-muted)] max-w-md mx-auto">
                Create your first itinerary or load our pre-configured demo journey to test autonomous disruption detection and multimodal recovery.
              </p>
            </div>
            <div className="flex justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setIsCreateOpen(true)}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-lg transition"
              >
                + Create New Trip
              </button>
              <button
                type="button"
                onClick={handleSeedDemoTrip}
                disabled={seedingDemo}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs rounded-lg border border-slate-700 transition"
              >
                ⚡ Load Demo Trip (BLR → JAI)
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Authoritative Selected Trip Detail Flow */}
      {selectedTrip && (
        <TripDetail
          trip={selectedTrip}
          onTripUpdated={handleTripUpdated}
          debugMode={debugMode}
        />
      )}

      {/* Developer & Technical Telemetry (Only displayed if debugMode is enabled) */}
      {debugMode && (
        <div className="bg-slate-950 rounded-2xl p-5 border border-purple-800/50 space-y-3 text-xs">
          <div className="flex items-center justify-between pb-2 border-b border-purple-900/50">
            <div className="flex items-center gap-2">
              <span className="text-base">🛠️</span>
              <h4 className="font-bold text-purple-300 uppercase tracking-wider">
                Developer & Telemetry Inspector (Debug Mode Active)
              </h4>
            </div>
            <span className="text-[10px] bg-purple-900/60 text-purple-200 px-2 py-0.5 rounded font-mono">
              SYSTEM DIAGNOSTICS
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-[11px] text-slate-300">
            <div className="p-3 bg-slate-900/80 rounded-lg border border-slate-800 space-y-1">
              <p className="font-bold text-purple-400">Database Connection</p>
              <p>Status: {health?.database?.status || 'Unknown'}</p>
              <p>Uptime: {Math.floor(health?.uptime || 0)}s</p>
            </div>
            <div className="p-3 bg-slate-900/80 rounded-lg border border-slate-800 space-y-1">
              <p className="font-bold text-purple-400">Authoritative Session Reference</p>
              <p className="font-mono text-[10px] text-slate-400">Trip ID: {selectedTrip?._id}</p>
              <p className="font-mono text-[10px] text-slate-400">
                Session ID: {typeof selectedTrip?.currentRecoverySessionId === 'object' ? selectedTrip?.currentRecoverySessionId?._id : selectedTrip?.currentRecoverySessionId || 'None'}
              </p>
            </div>
            <div className="p-3 bg-slate-900/80 rounded-lg border border-slate-800 space-y-1">
              <p className="font-bold text-purple-400">Deterministic Safety Invariants</p>
              <p>• Zero Fake Bookings</p>
              <p>• Verified Domain Whitelist</p>
              <p>• In-Memory Simulation Clones</p>
            </div>
          </div>
        </div>
      )}

      {/* Create Trip Modal */}
      <CreateTripModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onTripCreated={handleTripCreated}
      />
    </div>
  );
}

export default Dashboard;
