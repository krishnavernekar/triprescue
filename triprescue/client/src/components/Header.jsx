import { useState, useEffect } from 'react';
import apiService from '../services/api';
import NotificationCenter from './NotificationCenter';

function Header({ onCreateTripClick, debugMode, onToggleDebugMode }) {
  const [health, setHealth] = useState(null);

  useEffect(() => {
    apiService
      .getHealth()
      .then(setHealth)
      .catch(() => setHealth(null));
  }, []);

  return (
    <header className="bg-[var(--color-surface)] border-b border-[var(--color-surface-light)] px-4 sm:px-6 py-3.5 sticky top-0 z-40 shadow-sm">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
        {/* Brand */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-xl shadow-md shadow-blue-900/30">
            🛡️
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg sm:text-xl font-black text-[var(--color-text)] tracking-tight">
                TripRescue
              </h1>
              <span className="text-[10px] bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider hidden sm:inline-block">
                Autonomous Protection
              </span>
            </div>
            <p className="text-xs text-[var(--color-text-muted)] leading-tight hidden xs:block">
              Protect your journey when plans change
            </p>
          </div>
        </div>

        {/* Actions & Status */}
        <div className="flex items-center gap-2 sm:gap-3">
          {onCreateTripClick && (
            <button
              type="button"
              onClick={onCreateTripClick}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-lg shadow-sm transition flex items-center gap-1.5 shrink-0"
            >
              <span>+</span>
              <span className="hidden sm:inline">New Trip</span>
            </button>
          )}

          <NotificationCenter />

          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[var(--color-bg)] border border-[var(--color-surface-light)]">
            <span
              className={`w-2 h-2 rounded-full ${
                health?.status === 'ok' ? 'bg-emerald-400 animate-pulse' : 'bg-rose-500'
              }`}
            />
            <span className="text-[11px] font-medium text-[var(--color-text-muted)] hidden md:inline">
              {health?.status === 'ok' ? 'System Active' : 'Offline'}
            </span>
          </div>

          {onToggleDebugMode && (
            <button
              type="button"
              onClick={onToggleDebugMode}
              title="Toggle Developer & Technical Diagnostics"
              className={`px-2 py-1 rounded text-[10px] font-mono font-bold uppercase border transition ${
                debugMode
                  ? 'bg-purple-950/60 text-purple-300 border-purple-500/60'
                  : 'bg-[var(--color-bg)] text-slate-400 border-[var(--color-surface-light)] hover:text-slate-200'
              }`}
            >
              {debugMode ? '🛠️ Debug: ON' : '🛠️ Debug'}
            </button>
          )}
        </div>
      </div>
    </header>
  );
}

export default Header;

