import { useState } from 'react';
import apiService from '../services/api';

function CreateTripModal({ isOpen, onClose, onTripCreated }) {
  const [formData, setFormData] = useState({
    passengerName: '',
    passengerCount: 1,
    origin: '',
    destination: '',
    departureTime: '',
    arrivalDeadline: '',
    maxAdditionalBudget: 5000,
    priority: 'arrival_time',
    riskTolerance: 'MEDIUM',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  if (!isOpen) return null;

  const handleChange = (e) => {
    const { name, value, type } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'number' ? (value === '' ? '' : Number(value)) : value,
    }));
  };

  const loadPreset = () => {
    const now = new Date();
    const dep = new Date(now.getTime() + 2 * 60 * 60 * 1000); // 2 hours from now
    const arr = new Date(now.getTime() + 10 * 60 * 60 * 1000); // 10 hours from now

    setFormData({
      passengerName: 'Ananya Sharma',
      passengerCount: 1,
      origin: 'BLR',
      destination: 'JAI',
      departureTime: dep.toISOString().slice(0, 16),
      arrivalDeadline: arr.toISOString().slice(0, 16),
      maxAdditionalBudget: 5000,
      priority: 'arrival_time',
      riskTolerance: 'MEDIUM',
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const payload = {
        ...formData,
        passengerCount: Number(formData.passengerCount),
        maxAdditionalBudget: Number(formData.maxAdditionalBudget),
        departureTime: new Date(formData.departureTime).toISOString(),
        arrivalDeadline: formData.arrivalDeadline
          ? new Date(formData.arrivalDeadline).toISOString()
          : null,
      };

      const result = await apiService.createTrip(payload);
      if (result.success) {
        onTripCreated(result.data);
        onClose();
      }
    } catch (err) {
      setError(err.message || 'Failed to create trip');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50 overflow-y-auto">
      <div className="bg-[var(--color-surface)] border border-[var(--color-surface-light)] rounded-xl w-full max-w-xl p-6 shadow-2xl relative my-8">
        <div className="flex items-center justify-between pb-4 border-b border-[var(--color-surface-light)]">
          <div>
            <h2 className="text-xl font-bold text-[var(--color-text)]">Create New Trip</h2>
            <p className="text-xs text-[var(--color-text-muted)]">
              Enter your journey details and travel preferences
            </p>
          </div>
          <button
            type="button"
            onClick={loadPreset}
            className="text-xs bg-blue-600/30 text-blue-400 hover:bg-blue-600/50 px-3 py-1.5 rounded border border-blue-500/30 transition-colors"
          >
            ⚡ Load Demo Preset (BLR → JAI)
          </button>
        </div>

        {error && (
          <div className="bg-red-950/50 border border-red-800 text-red-300 text-sm p-3 rounded-md mt-4">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-[var(--color-text-muted)] uppercase mb-1">
                Passenger Name *
              </label>
              <input
                type="text"
                name="passengerName"
                required
                value={formData.passengerName}
                onChange={handleChange}
                placeholder="e.g. Krishna"
                className="w-full bg-[var(--color-bg)] border border-[var(--color-surface-light)] rounded-md px-3 py-2 text-sm text-[var(--color-text)] focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[var(--color-text-muted)] uppercase mb-1">
                Passenger Count *
              </label>
              <input
                type="number"
                name="passengerCount"
                min="1"
                required
                value={formData.passengerCount}
                onChange={handleChange}
                className="w-full bg-[var(--color-bg)] border border-[var(--color-surface-light)] rounded-md px-3 py-2 text-sm text-[var(--color-text)] focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-[var(--color-text-muted)] uppercase mb-1">
                Origin *
              </label>
              <input
                type="text"
                name="origin"
                required
                value={formData.origin}
                onChange={handleChange}
                placeholder="e.g. BLR"
                className="w-full bg-[var(--color-bg)] border border-[var(--color-surface-light)] rounded-md px-3 py-2 text-sm text-[var(--color-text)] uppercase focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[var(--color-text-muted)] uppercase mb-1">
                Destination *
              </label>
              <input
                type="text"
                name="destination"
                required
                value={formData.destination}
                onChange={handleChange}
                placeholder="e.g. JAI"
                className="w-full bg-[var(--color-bg)] border border-[var(--color-surface-light)] rounded-md px-3 py-2 text-sm text-[var(--color-text)] uppercase focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-[var(--color-text-muted)] uppercase mb-1">
                Departure Time *
              </label>
              <input
                type="datetime-local"
                name="departureTime"
                required
                value={formData.departureTime}
                onChange={handleChange}
                className="w-full bg-[var(--color-bg)] border border-[var(--color-surface-light)] rounded-md px-3 py-2 text-sm text-[var(--color-text)] focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[var(--color-text-muted)] uppercase mb-1">
                Arrival Deadline (Hard)
              </label>
              <input
                type="datetime-local"
                name="arrivalDeadline"
                value={formData.arrivalDeadline}
                onChange={handleChange}
                className="w-full bg-[var(--color-bg)] border border-[var(--color-surface-light)] rounded-md px-3 py-2 text-sm text-[var(--color-text)] focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-[var(--color-text-muted)] uppercase mb-1">
                Max Budget (₹)
              </label>
              <input
                type="number"
                name="maxAdditionalBudget"
                min="0"
                value={formData.maxAdditionalBudget}
                onChange={handleChange}
                className="w-full bg-[var(--color-bg)] border border-[var(--color-surface-light)] rounded-md px-3 py-2 text-sm text-[var(--color-text)] focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[var(--color-text-muted)] uppercase mb-1">
                Priority
              </label>
              <select
                name="priority"
                value={formData.priority}
                onChange={handleChange}
                className="w-full bg-[var(--color-bg)] border border-[var(--color-surface-light)] rounded-md px-3 py-2 text-sm text-[var(--color-text)] focus:outline-none focus:border-blue-500"
              >
                <option value="arrival_time">Fastest Arrival</option>
                <option value="cost">Lowest Cost</option>
                <option value="reliability">Maximum Reliability</option>
                <option value="transfers">Minimum Transfers</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-[var(--color-text-muted)] uppercase mb-1">
                Risk Tolerance
              </label>
              <select
                name="riskTolerance"
                value={formData.riskTolerance}
                onChange={handleChange}
                className="w-full bg-[var(--color-bg)] border border-[var(--color-surface-light)] rounded-md px-3 py-2 text-sm text-[var(--color-text)] focus:outline-none focus:border-blue-500"
              >
                <option value="LOW">Low Risk</option>
                <option value="MEDIUM">Medium Risk</option>
                <option value="HIGH">High Risk</option>
              </select>
            </div>
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
              {loading ? 'Creating...' : 'Create Trip'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default CreateTripModal;
