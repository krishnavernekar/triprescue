import { useState } from 'react';
import apiService from '../services/api';

function AddSegmentModal({ isOpen, onClose, trip, onSegmentAdded }) {
  const [formData, setFormData] = useState({
    transportMode: 'flight',
    originCode: trip?.origin || 'BLR',
    originType: 'airport',
    destCode: trip?.destination || 'DEL',
    destType: 'airport',
    departure: '',
    arrival: '',
    carrier: 'IndiGo',
    identifier: '6E 2341',
    status: 'CONFIRMED',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  if (!isOpen || !trip) return null;

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleModeChange = (e) => {
    const mode = e.target.value;
    let defCarrier = 'IndiGo';
    let defOriginType = 'airport';
    let defDestType = 'airport';

    if (mode === 'train') {
      defCarrier = 'Indian Railways';
      defOriginType = 'railway_station';
      defDestType = 'railway_station';
    } else if (mode === 'bus') {
      defCarrier = 'KSRTC';
      defOriginType = 'bus_station';
      defDestType = 'bus_station';
    } else if (mode === 'ground') {
      defCarrier = 'Airport Transfer';
      defOriginType = 'airport';
      defDestType = 'hotel';
    } else if (mode === 'hotel') {
      defCarrier = 'Marriott';
      defOriginType = 'hotel';
      defDestType = 'hotel';
    }

    setFormData((prev) => ({
      ...prev,
      transportMode: mode,
      carrier: defCarrier,
      originType: defOriginType,
      destType: defDestType,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const payload = {
        transportMode: formData.transportMode,
        origin: {
          code: formData.originCode.toUpperCase(),
          type: formData.originType,
        },
        destination: {
          code: formData.destCode.toUpperCase(),
          type: formData.destType,
        },
        departure: new Date(formData.departure).toISOString(),
        arrival: new Date(formData.arrival).toISOString(),
        carrier: formData.carrier,
        identifier: formData.identifier,
        status: formData.status,
      };

      const result = await apiService.addSegment(trip._id, payload);
      if (result.success) {
        onSegmentAdded(result.data);
        onClose();
      }
    } catch (err) {
      setError(err.message || 'Failed to add segment');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50 overflow-y-auto">
      <div className="bg-[var(--color-surface)] border border-[var(--color-surface-light)] rounded-xl w-full max-w-lg p-6 shadow-2xl relative my-8">
        <div className="flex items-center justify-between pb-4 border-b border-[var(--color-surface-light)]">
          <div>
            <h2 className="text-xl font-bold text-[var(--color-text)]">Add Itinerary Segment</h2>
            <p className="text-xs text-[var(--color-text-muted)]">
              Support for multimodal segments (flight, train, bus, ground, hotel)
            </p>
          </div>
        </div>

        {error && (
          <div className="bg-red-950/50 border border-red-800 text-red-300 text-sm p-3 rounded-md mt-4">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-[var(--color-text-muted)] uppercase mb-1">
                Transport Mode *
              </label>
              <select
                name="transportMode"
                value={formData.transportMode}
                onChange={handleModeChange}
                className="w-full bg-[var(--color-bg)] border border-[var(--color-surface-light)] rounded-md px-3 py-2 text-sm text-[var(--color-text)] focus:outline-none focus:border-blue-500"
              >
                <option value="flight">✈️ Flight</option>
                <option value="train">🚆 Train</option>
                <option value="bus">🚌 Bus</option>
                <option value="ground">🚗 Ground Transfer</option>
                <option value="hotel">🏨 Hotel</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-[var(--color-text-muted)] uppercase mb-1">
                Carrier / Provider
              </label>
              <input
                type="text"
                name="carrier"
                value={formData.carrier}
                onChange={handleChange}
                placeholder="e.g. IndiGo / Vande Bharat"
                className="w-full bg-[var(--color-bg)] border border-[var(--color-surface-light)] rounded-md px-3 py-2 text-sm text-[var(--color-text)] focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-[var(--color-text-muted)] uppercase mb-1">
                Origin Code *
              </label>
              <input
                type="text"
                name="originCode"
                required
                value={formData.originCode}
                onChange={handleChange}
                placeholder="e.g. BLR"
                className="w-full bg-[var(--color-bg)] border border-[var(--color-surface-light)] rounded-md px-3 py-2 text-sm text-[var(--color-text)] uppercase focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[var(--color-text-muted)] uppercase mb-1">
                Destination Code *
              </label>
              <input
                type="text"
                name="destCode"
                required
                value={formData.destCode}
                onChange={handleChange}
                placeholder="e.g. DEL"
                className="w-full bg-[var(--color-bg)] border border-[var(--color-surface-light)] rounded-md px-3 py-2 text-sm text-[var(--color-text)] uppercase focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-[var(--color-text-muted)] uppercase mb-1">
                Departure *
              </label>
              <input
                type="datetime-local"
                name="departure"
                required
                value={formData.departure}
                onChange={handleChange}
                className="w-full bg-[var(--color-bg)] border border-[var(--color-surface-light)] rounded-md px-3 py-2 text-sm text-[var(--color-text)] focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[var(--color-text-muted)] uppercase mb-1">
                Arrival *
              </label>
              <input
                type="datetime-local"
                name="arrival"
                required
                value={formData.arrival}
                onChange={handleChange}
                className="w-full bg-[var(--color-bg)] border border-[var(--color-surface-light)] rounded-md px-3 py-2 text-sm text-[var(--color-text)] focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[var(--color-text-muted)] uppercase mb-1">
              Identifier (Flight # / Train #)
            </label>
            <input
              type="text"
              name="identifier"
              value={formData.identifier}
              onChange={handleChange}
              placeholder="e.g. 6E 2341"
              className="w-full bg-[var(--color-bg)] border border-[var(--color-surface-light)] rounded-md px-3 py-2 text-sm text-[var(--color-text)] focus:outline-none focus:border-blue-500"
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
              className="px-5 py-2 text-sm font-semibold bg-blue-600 hover:bg-blue-500 text-white rounded-md transition-colors disabled:opacity-50"
            >
              {loading ? 'Adding...' : 'Add Segment'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default AddSegmentModal;
