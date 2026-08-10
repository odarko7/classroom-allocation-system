import { useEffect, useState } from 'react';
import { api } from '../api/client';
import type { AnalyticsSummary, DashboardCounts } from '../api/types';
import { ErrorBanner, ProgressBar, Spinner } from '../components/Shared';

interface NotificationItem {
  id: number;
  title: string;
  message: string | null;
  created_at: string;
}

export default function DashboardPage() {
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [counts, setCounts] = useState<DashboardCounts | null>(null);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get<AnalyticsSummary>('/analytics/summary'),
      api.get<DashboardCounts>('/dashboard'),
      api.get<{ rows: NotificationItem[] }>('/notifications'),
    ])
      .then(([s, c, n]) => {
        setSummary(s);
        setCounts(c);
        setNotifications(n.rows.slice(0, 8));
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load dashboard.'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Spinner />;

  const s = summary;

  const statCards: { label: string; value: string; sub?: string }[] = s
    ? [
        { label: 'Classrooms', value: String(s.totalClassrooms), sub: `${s.availableClassrooms} active` },
        { label: 'Courses', value: String(s.totalCourses) },
        { label: 'Lecturers', value: String(s.totalLecturers) },
        { label: 'Students', value: String(s.totalStudents) },
        { label: 'Allocations', value: String(s.totalAllocations), sub: `${s.approvedAllocations} approved · ${s.proposedAllocations} proposed` },
        { label: 'Conflicts', value: String(s.conflicts) },
        { label: 'Unallocated Groups', value: String(s.unallocatedGroups), sub: `${s.totalGroups} total groups` },
      ]
    : [];

  return (
    <div>
      <h1 className="page-title">Dashboard</h1>
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
              <div className="stat-card" style={{ border: 'none', boxShadow: 'none', background: '#f8fafc' }}>
                <span className="stat-label">Average allocation score</span>
                <span className="stat-value" style={{ fontSize: 20 }}>
                  {s.averageAllocationScore}
                </span>
              </div>
              <div className="stat-card" style={{ border: 'none', boxShadow: 'none', background: '#f8fafc' }}>
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
