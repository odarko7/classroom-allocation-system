import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';
import { useAutoRefresh } from '../api/useAutoRefresh';
import type { NotificationItem, NotificationsResponse } from '../api/types';
import { ErrorBanner, Spinner } from './Shared';

const TYPE_META: Record<string, { label: string; tone: 'success' | 'info' | 'warning' | 'danger' | 'default'; icon: string }> = {
  ALLOCATION_APPROVED: { label: 'Allocation approved', tone: 'success', icon: 'M22 11.08V12a10 10 0 1 1-5.93-9.14 M22 4L12 14.01l-3-3' },
  ALLOCATION_PROPOSED: { label: 'Allocation proposed', tone: 'info', icon: 'M9 11l3 3L22 4 M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11' },
  ALLOCATION_CHANGED: { label: 'Allocation changed', tone: 'warning', icon: 'M23 4v6h-6 M1 20v-6h6 M3.51 9a9 9 0 0 1 14.85-3.36L23 10 M1 14l4.64 4.36A9 9 0 0 0 20.49 15' },
  CONFLICT: { label: 'Conflict', tone: 'danger', icon: 'M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z M12 9v4 M12 17h.01' },
  ROOM_UNAVAILABLE: { label: 'Room unavailable', tone: 'warning', icon: 'M18.36 6.64a9 9 0 1 1-12.73 0 M12 2v10' },
  HIGH_UTILIZATION: { label: 'High utilization', tone: 'warning', icon: 'M22 7L13.5 15.5 8.5 10.5 2 17 M16 7h6v6' },
  OPTIMIZATION_FAILED: { label: 'Optimization failed', tone: 'danger', icon: 'M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z M12 9v4 M12 17h.01' },
};

const DEFAULT_META = { label: 'Notification', tone: 'default' as const, icon: 'M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9 M13.73 21a2 2 0 0 1-3.46 0' };

function timeAgo(iso: string): string {
  const then = new Date(iso.replace(' ', 'T') + 'Z').getTime();
  const diff = Math.max(0, Date.now() - then);
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso.replace(' ', 'T') + 'Z').toLocaleDateString();
}

export default function NotificationCenter() {
  const [rows, setRows] = useState<NotificationItem[]>([]);
  const [unread, setUnread] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api
      .get<NotificationsResponse>('/notifications')
      .then((n) => {
        setRows(n.rows);
        setUnread(n.unread);
        setError(null);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load notifications.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useAutoRefresh(load, 30000);

  const markAllRead = async () => {
    setBusy(true);
    try {
      await api.post('/notifications/read');
      setRows((r) => r.map((n) => ({ ...n, is_read: 1 })));
      setUnread(0);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to mark notifications as read.');
    } finally {
      setBusy(false);
    }
  };

  const clearAll = async () => {
    if (!window.confirm('Clear all notifications? This cannot be undone.')) return;
    setBusy(true);
    try {
      await api.delete('/notifications');
      setRows([]);
      setUnread(0);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to clear notifications.');
    } finally {
      setBusy(false);
    }
  };

  const removeOne = async (id: number) => {
    setRows((r) => r.filter((n) => n.id !== id));
    setUnread((u) => Math.max(0, u - (rows.find((n) => n.id === id)?.is_read === 0 ? 1 : 0)));
    try {
      await api.delete(`/notifications/${id}`);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete notification.');
      load();
    }
  };

  return (
    <div className="card notification-center">
      <div className="card-header">
        <div className="notification-title">
          <h3>Notification Center</h3>
          {unread > 0 && <span className="badge badge-danger notification-unread">{unread} unread</span>}
        </div>
        <div className="notification-actions">
          <button className="btn btn-sm" onClick={markAllRead} disabled={busy || unread === 0}>
            Mark all read
          </button>
          <button className="btn btn-sm btn-danger" onClick={clearAll} disabled={busy || rows.length === 0}>
            Clear all
          </button>
        </div>
      </div>

      <ErrorBanner message={error} />

      {loading ? (
        <Spinner label="Loading notifications..." />
      ) : rows.length === 0 ? (
        <div className="empty">
          <svg className="empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9 M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
          <div>You're all caught up. No notifications.</div>
        </div>
      ) : (
        <ul className="notification-list">
          {rows.map((n) => {
            const meta = TYPE_META[n.type] ?? DEFAULT_META;
            return (
              <li key={n.id} className={`notification-item${n.is_read === 0 ? ' unread' : ''}`}>
                <span className={`notification-icon notification-icon-${meta.tone}`}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d={meta.icon} />
                  </svg>
                </span>
                <div className="notification-body">
                  <div className="notification-head">
                    <span className="notification-label">
                      <span className={`badge badge-${meta.tone}`}>{meta.label}</span>
                      {n.is_read === 0 && <span className="notification-dot" aria-label="Unread" />}
                    </span>
                    <span className="notification-time">{timeAgo(n.created_at)}</span>
                  </div>
                  <div className="notification-title-text">{n.title}</div>
                  {n.message && <div className="notification-message">{n.message}</div>}
                </div>
                <button
                  className="icon-btn notification-delete"
                  onClick={() => removeOne(n.id)}
                  disabled={busy}
                  aria-label="Delete notification"
                  title="Delete notification"
                >
                  &times;
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
