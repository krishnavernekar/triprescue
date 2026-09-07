import { useState } from 'react';
import Header from './components/Header';
import Dashboard from './components/Dashboard';

function App() {
  const [debugMode, setDebugMode] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  return (
    <div className="min-h-screen bg-[var(--color-bg)] text-[var(--color-text)] flex flex-col selection:bg-blue-600 selection:text-white">
      <Header
        onCreateTripClick={() => setIsCreateOpen(true)}
        debugMode={debugMode}
        onToggleDebugMode={() => setDebugMode((prev) => !prev)}
      />
      <main className="flex-1">
        <Dashboard
          isCreateOpen={isCreateOpen}
          setIsCreateOpen={setIsCreateOpen}
          debugMode={debugMode}
        />
      </main>
      <footer className="border-t border-[var(--color-surface-light)] py-4 px-6 text-center text-xs text-[var(--color-text-muted)] bg-[var(--color-surface)]">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <p>© 2026 TripRescue • Autonomous Multi-Modal Travel Recovery Agent</p>
          <p className="text-[11px] text-slate-500">
            Deterministic Constraint Verification • Zero Automated Payments • Verified External Handoffs
          </p>
        </div>
      </footer>
    </div>
  );
}

export default App;
