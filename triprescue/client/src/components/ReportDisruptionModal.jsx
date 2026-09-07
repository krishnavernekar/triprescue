import { useState } from 'react';
import apiService from '../services/api';

function ReportDisruptionModal({ isOpen, onClose, trip, onDisruptionReported }) {
  const [formData, setFormData] = useState({
    type: 'FLIGHT_CANCELLED',
    affectedSegmentId: trip?.itinerary?.[0]?.segmentId || '',
    description: 'Carrier cancelled scheduled flight due to weather and operational constraints',
    expectedImpact: 'Connection in danger of being missed; arrival delayed',
    source: 'USER',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  if (!isOpen || !trip) return null;

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const payload = {
        ...formData,
        detectedAt: new Date().toISOString(),
      };

      const result = await apiService.reportDisruption(trip._id, payload);
      if (result.success) {
        onDisruptionReported(result.data);
        onClose();
      }
    } catch (err) {
      setError(err.message || 'Failed to report disruption');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50 overflow-y-auto">
      <div className="bg-[var(--color-surface)] border border-red-800/40 rounded-xl w-full max-w-lg p-6 shadow-2xl relative my-8">
        <div className="flex items-center justify-between pb-4 border-b border-[var(--color-surface-light)]">
          <div className="flex items-center gap-2">
            <span className="text-2xl">⚠️</span>
            <div>
              <h2 className="text-xl font-bold text-red-400">Report Disruption</h2>
              <p className="text-xs text-[var(--color-text-muted)]">
                Report a delay or cancellation to activate automatic journey recovery
              </p>
            </div>
          </div>
        </div>

        {error && (
          <div className="bg-red-950/50 border border-red-800 text-red-300 text-sm p-3 rounded-md mt-4">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-[var(--color-text-muted)] uppercase mb-1">
              Disruption Type *
            </label>
            <select
              name="type"
              value={formData.type}
              onChange={handleChange}
              className="w-full bg-[var(--color-bg)] border border-[var(--color-surface-light)] rounded-md px-3 py-2 text-sm text-[var(--color-text)] focus:outline-none focus:border-red-500"
            >
              <option value="FLIGHT_CANCELLED">Flight Cancelled</option>
              <option value="FLIGHT_DELAYED">Flight Delayed</option>
              <option value="TRAIN_CANCELLED">Train Cancelled</option>
              <option value="TRAIN_DELAYED">Train Delayed</option>
              <option value="BUS_CANCELLED">Bus Cancelled</option>
              <option value="BUS_DELAYED">Bus Delayed</option>
              <option value="HOTEL_CANCELLED">Hotel Cancelled</option>
              <option value="MISSED_CONNECTION">Missed Connection</option>
              <option value="AIRPORT_DISRUPTION">Airport Disruption</option>
              <option value="WEATHER_DISRUPTION">Weather Disruption</option>
              <option value="OTHER">Other Disruption</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[var(--color-text-muted)] uppercase mb-1">
              Affected Segment
            </label>
            {trip.itinerary && trip.itinerary.length > 0 ? (
              <select
                name="affectedSegmentId"
                value={formData.affectedSegmentId}
                onChange={handleChange}
                className="w-full bg-[var(--color-bg)] border border-[var(--color-surface-light)] rounded-md px-3 py-2 text-sm text-[var(--color-text)] focus:outline-none focus:border-red-500"
              >
                <option value="">-- General Trip Disruption --</option>
                {trip.itinerary.map((seg, idx) => (
                  <option key={seg.segmentId || idx} value={seg.segmentId}>
                    [{seg.transportMode.toUpperCase()}] {seg.origin?.code} → {seg.destination?.code}{' '}
                    ({seg.carrier} {seg.identifier})
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                name="affectedSegmentId"
                value={formData.affectedSegmentId}
                onChange={handleChange}
                placeholder="e.g. SEG-001 (Optional)"
                className="w-full bg-[var(--color-bg)] border border-[var(--color-surface-light)] rounded-md px-3 py-2 text-sm text-[var(--color-text)] focus:outline-none focus:border-red-500"
              />
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-[var(--color-text-muted)] uppercase mb-1">
              Description *
            </label>
            <textarea
              name="description"
              required
              rows="3"
              value={formData.description}
              onChange={handleChange}
              className="w-full bg-[var(--color-bg)] border border-[var(--color-surface-light)] rounded-md px-3 py-2 text-sm text-[var(--color-text)] focus:outline-none focus:border-red-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[var(--color-text-muted)] uppercase mb-1">
              Expected Impact
            </label>
            <input
              type="text"
              name="expectedImpact"
              value={formData.expectedImpact}
              onChange={handleChange}
              placeholder="e.g. Connection window reduced below safety buffer"
              className="w-full bg-[var(--color-bg)] border border-[var(--color-surface-light)] rounded-md px-3 py-2 text-sm text-[var(--color-text)] focus:outline-none focus:border-red-500"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-[var(--color-surface-light)]">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2 text-sm font-semibold bg-red-600 hover:bg-red-500 text-white rounded-md transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {loading ? 'Recording...' : '⚠️ Report Disruption'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default ReportDisruptionModal;
