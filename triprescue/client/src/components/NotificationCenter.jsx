import { useState, useEffect } from 'react';
import apiService from '../services/api';

export default function NotificationCenter({ tripId, sessionId }) {
  const [notifications, setNotifications] = useState([]);
  const [isOpen, setIsOpen] = useState(false);
  const [calendarConflicts, setCalendarConflicts] = useState([]);
  const [proposedUpdate, setProposedUpdate] = useState(null);
  const [calendarMessage, setCalendarMessage] = useState(null);
  const [loading, setLoading] = useState(false);

  const fetchNotifications = async () => {
    try {
      const res = await apiService.get('/notifications' + (tripId ? `?tripId=${tripId}` : ''));
      if (res && res.data) {
        setNotifications(res.data);
      }
    } catch (e) {
      // Offline fallback / graceful degradation
    }
  };

  const fetchCalendar = async () => {
    try {
      const res = await apiService.get('/calendar/events');
      if (res && res.data) {
        // Find if any events conflict with current notifications
        const conflictNotif = notifications.find((n) => n.type === 'CALENDAR_CONFLICT');
        if (conflictNotif && conflictNotif.metadata?.conflicts) {
          setCalendarConflicts(conflictNotif.metadata.conflicts);
        }
      }
    } catch (e) {}
  };

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 5000);
    return () => clearInterval(interval);
  }, [tripId, sessionId]);

  useEffect(() => {
    fetchCalendar();
  }, [notifications]);

  const unreadCount = notifications.filter((n) => n.status === 'UNREAD').length;

  const handleMarkAsRead = async (id) => {
    try {
      await apiService.patch(`/notifications/${id}/read`, {});
      setNotifications((prev) =>
        prev.map((n) => (n.notificationId === id ? { ...n, status: 'READ' } : n))
      );
    } catch (e) {}
  };

  const handlePrepareCalendarUpdate = async (conflict) => {
    setLoading(true);
    try {
      // Propose moving event 1 hour after recovery arrival
      const arrival = new Date(conflict.recoveryArrival);
      const newStart = new Date(arrival.getTime() + 60 * 60 * 1000).toISOString();
      const newEnd = new Date(arrival.getTime() + 150 * 60 * 1000).toISOString();

      const res = await apiService.post('/calendar/prepare-update', {
        eventId: conflict.eventId,
        proposedStart: newStart,
        proposedEnd: newEnd,
      });

      if (res && res.data) {
        setProposedUpdate(res.data);
        setCalendarMessage(null);
      }
    } catch (e) {
      setCalendarMessage('Failed to prepare update: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleApproveCalendarUpdate = async (approved) => {
    if (!proposedUpdate) return;
    setLoading(true);
    try {
      if (approved) {
        const res = await apiService.post('/calendar/update', {
          eventId: proposedUpdate.eventId,
          updates: proposedUpdate.proposedChange,
          userApproved: true,
        });
        if (res && res.data) {
          setCalendarMessage('✓ Calendar event updated successfully with traveler approval.');
          setProposedUpdate(null);
          setCalendarConflicts((prev) => prev.filter((c) => c.eventId !== proposedUpdate.eventId));
          fetchNotifications();
        }
      } else {
        setCalendarMessage('Calendar update dismissed. Event retained as-is.');
        setProposedUpdate(null);
      }
    } catch (e) {
      setCalendarMessage('Error updating calendar: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative">
      {/* Trigger Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--color-surface)] border border-[var(--color-surface-light)] hover:border-slate-500 text-xs font-semibold text-[var(--color-text)] transition"
        title="Notifications & Calendar"
      >
        <span>🔔</span>
        <span>Alerts</span>
        {unreadCount > 0 && (
          <span className="ml-1 px-1.5 py-0.2 bg-rose-500 text-white rounded-full text-[10px] font-bold">
            {unreadCount}
          </span>
        )}
      </button>

      {/* Drawer Overlay */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-96 max-w-[90vw] bg-[var(--color-surface)] border border-slate-700 rounded-xl shadow-2xl p-4 z-50 text-xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-700 pb-2">
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm text-[var(--color-text)]">Notifications & Calendar</span>
              {unreadCount > 0 && (
                <span className="bg-rose-500/20 text-rose-300 px-1.5 py-0.5 rounded text-[10px] font-mono">
                  {unreadCount} unread
                </span>
              )}
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="text-slate-400 hover:text-white text-base leading-none"
            >
              ✕
            </button>
          </div>

          {/* Calendar Conflicts Section */}
          {calendarConflicts.length > 0 && (
            <div className="p-3 bg-amber-950/40 border border-amber-600/50 rounded-lg space-y-2 text-amber-200">
              <div className="flex items-center justify-between">
                <span className="font-bold flex items-center gap-1.5">
                  <span>📅</span> Calendar Conflict Detected
                </span>
                <span className="text-[10px] bg-amber-500/20 px-1.5 py-0.5 rounded font-mono font-bold">
                  ACTION REQUIRED
                </span>
              </div>

              {calendarConflicts.map((c, i) => (
                <div key={i} className="text-[11px] space-y-1 bg-black/20 p-2 rounded border border-amber-800/40">
                  <p className="font-semibold text-white">{c.eventTitle} ({c.importance})</p>
                  <p className="text-amber-300/80 leading-snug">{c.reason}</p>

                  {!proposedUpdate && (
                    <div className="pt-1 flex gap-2">
                      <button
                        onClick={() => handlePrepareCalendarUpdate(c)}
                        disabled={loading}
                        className="px-2.5 py-1 bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold rounded text-[10px] transition"
                      >
                        Prepare Adjustment
                      </button>
                    </div>
                  )}
                </div>
              ))}

              {/* Proposed Update Proposal Box */}
              {proposedUpdate && (
                <div className="p-2.5 bg-slate-900 border border-emerald-500/50 rounded space-y-2 text-emerald-300">
                  <p className="font-bold text-xs flex items-center gap-1">
                    <span>✏️</span> Proposed Modification (Requires Approval)
                  </p>
                  <p className="text-[11px] text-slate-300">
                    Move <strong className="text-white">{proposedUpdate.currentEvent?.title}</strong> to{' '}
                    <strong className="text-emerald-400">{new Date(proposedUpdate.proposedChange.start).toLocaleTimeString()}</strong>
                  </p>
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      onClick={() => handleApproveCalendarUpdate(true)}
                      disabled={loading}
                      className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded text-[10px] transition"
                    >
                      APPROVE
                    </button>
                    <button
                      onClick={() => handleApproveCalendarUpdate(false)}
                      disabled={loading}
                      className="px-2.5 py-1 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded text-[10px] transition"
                    >
                      KEEP CURRENT EVENT
                    </button>
                  </div>
                </div>
              )}

              {calendarMessage && (
                <p className="text-[10px] font-mono text-emerald-400 mt-1">{calendarMessage}</p>
              )}
            </div>
          )}

          {/* Notifications List */}
          <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
            {notifications.length === 0 ? (
              <p className="text-slate-400 text-center py-4 italic">No notifications yet</p>
            ) : (
              notifications.map((n) => (
                <div
                  key={n.notificationId}
                  className={`p-2.5 rounded-lg border text-[11px] flex flex-col gap-1 transition ${
                    n.status === 'UNREAD'
                      ? 'bg-slate-800/90 border-blue-500/40 text-slate-200'
                      : 'bg-slate-900/40 border-slate-800 text-slate-400'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-[var(--color-text)]">{n.title}</span>
                    <span className="text-[9px] font-mono uppercase bg-slate-800 px-1 py-0.5 rounded text-slate-400">
                      {n.channel}
                    </span>
                  </div>
                  <p className="text-slate-300 leading-snug">{n.message}</p>
                  <div className="flex items-center justify-between pt-1 text-[10px] text-slate-500">
                    <span>{new Date(n.createdAt).toLocaleTimeString()}</span>
                    {n.status === 'UNREAD' && (
                      <button
                        onClick={() => handleMarkAsRead(n.notificationId)}
                        className="text-blue-400 hover:text-blue-300 font-semibold"
                      >
                        Mark read
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
