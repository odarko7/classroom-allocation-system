import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { useAutoRefresh } from '../api/useAutoRefresh';
import type { AnalyticsSummary, DashboardCounts } from '../api/types';
import { ErrorBanner, ProgressBar, Spinner } from '../components/Shared';
import { useAuth } from '../auth/AuthContext';

interface NotificationItem {
  id: number;
  title: string;
  message: string | null;
  created_at: string;
}

const VIEWER_LINKS = [
  {
    to: '/allocations',
    title: 'Allocations',
    desc: 'Browse proposed and approved room schedules.',
    icon: 'M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z',
  },
];

export default function DashboardPage() {
  const { user } = useAuth();
  const isViewer = user?.role === 'VIEWER';
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [counts, setCounts] = useState<DashboardCounts | null>(null);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    Promise.all([
      api.get<AnalyticsSummary>('/analytics/summary'),
      api.get<DashboardCounts>('/dashboard'),
      api.get<{ rows: NotificationItem[] }>('/notifications'),
    ])
      .then(([s, c, n]) => {
        setSummary(s);
        setCounts(c);
        setNotifications(n.rows.slice(0, 8));
        setError(null);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load dashboard.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useAutoRefresh(load, 30000);

  if (loading) return <Spinner />;

  const s = summary;

  const firstName = user?.name?.trim().split(/\s+/)[0] ?? 'there';

  const statCards: { label: string; value: string; sub?: string }[] = s
    ? [
        { label: 'Classrooms', value: String(s.totalClassrooms), sub: `${s.availableClassrooms} active` },
        { label: 'Courses', value: String(s.totalCourses) },
        { label: 'Lecturers', value: String(s.totalLecturers) },
        { label: 'Students', value: String(s.totalStudents) },
        { label: 'Allocations', value: String(s.totalAllocations), sub: `${s.approvedAllocations} approved · ${s.proposedAllocations} proposed` },
        { label: 'Conflicts', value: String(s.conflicts) },
      ]
    : [];

  return (
    <div>
      {isViewer ? (
        <div className="welcome-hero">
          <div className="welcome-hero-glow" aria-hidden="true" />
          <h1>Welcome back, {firstName}!</h1>
          <p>Here's a quick overview of the classroom allocation system. Explore the schedules below.</p>
          <div className="welcome-links">
            {VIEWER_LINKS.map((l) => (
              <Link key={l.to} to={l.to} className="welcome-link">
                <span className="welcome-link-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d={l.icon} />
                  </svg>
                </span>
                <span>
                  <strong>{l.title}</strong>
                  <span>{l.desc}</span>
                </span>
              </Link>
            ))}
          </div>
        </div>
      ) : (
        <h1 className="page-title">Dashboard</h1>
      )}
      <ErrorBanner message={error} />
      <div className="grid grid-4">
        {statCards.map((c) => (
          <div className="stat-card" key={c.label}>
            <span className="stat-label">{c.label}</span>
            <span className="stat-value">{c.value}</span>
            {c.sub && <span className="stat-sub">{c.sub}</span>}
          </div>
        ))}
      </div>

      <div className="grid grid-2 mt-16">
        {s && (
          <div className="card">
            <div className="card-header">
              <h3>Allocation Performance</h3>
            </div>
            <div className="field">
              <div className="flex-between">
                <span className="field-label">Allocation success rate</span>
                <span>{s.allocationSuccessRate}%</span>
              </div>
              <ProgressBar value={s.allocationSuccessRate} />
            </div>
            <div className="field">
              <div className="flex-between">
                <span className="field-label">Classroom utilization</span>
                <span>{s.utilizationRate}%</span>
              </div>
              <ProgressBar value={s.utilizationRate} />
            </div>
            <div className="field">
              <div className="flex-between">
                <span className="field-label">Capacity efficiency</span>
                <span>{s.capacityEfficiency}%</span>
              </div>
              <ProgressBar value={s.capacityEfficiency} />
            </div>
            <div className="grid grid-2" style={{ marginTop: 12 }}>
              <div className="stat-card" style={{ border: 'none', boxShadow: 'none', background: 'var(--surface-2)' }}>
                <span className="stat-label">Average allocation score</span>
                <span className="stat-value" style={{ fontSize: 20 }}>
                  {s.averageAllocationScore}
                </span>
              </div>
              <div className="stat-card" style={{ border: 'none', boxShadow: 'none', background: 'var(--surface-2)' }}>
                <span className="stat-label">Peak day</span>
                <span className="stat-value" style={{ fontSize: 20 }}>
                  {s.peakDay}
                </span>
                <span className="stat-sub">Lowest: {s.lowestDay}</span>
              </div>
            </div>
          </div>
        )}

        <div className="card">
          <div className="card-header">
            <h3>Recent Notifications</h3>
          </div>
          {notifications.length === 0 ? (
            <div className="empty">No notifications.</div>
          ) : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {notifications.map((n) => (
                <li key={n.id} style={{ padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{n.title}</div>
                  <div className="text-muted" style={{ fontSize: 12 }}>
                    {n.message ?? ''}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {counts?.semester && (
        <div className="text-muted mt-16" style={{ fontSize: 12 }}>
          Current active semester ID: {counts.semester}
        </div>
      )}
    </div>
  );
}
