import { useState } from 'react';
import { api } from '../api/client';
import { useAsync } from '../api/useAsync';
import type { AnalyticsSummary, BuildingUtilizationRow, ClassroomUsageRow, DepartmentDemandRow, Semester, TimeDemandRow } from '../api/types';
import { ErrorBanner, ProgressBar, Spinner } from '../components/Shared';

interface RoomAnalytics {
  classroom: { id: number; room_code: string; usage: ClassroomUsageRow | undefined } & Record<string, unknown>;
  courses: unknown[];
}

export default function AnalyticsPage() {
  const [semester, setSemester] = useState('');
  const query = semester ? `?semester=${semester}` : '';

  const semesters = useAsync<Semester[]>(() => api.get('/semesters'));
  const summary = useAsync<AnalyticsSummary>(() => api.get(`/analytics/summary${query}`), [query]);
  const usage = useAsync<{ semester: number | null; usage: ClassroomUsageRow[] }>(() => api.get(`/analytics/utilization${query}`), [query]);
  const buildings = useAsync<{ semester: number | null; buildings: BuildingUtilizationRow[] }>(() => api.get(`/analytics/buildings${query}`), [query]);
  const departments = useAsync<{ semester: number | null; departments: DepartmentDemandRow[] }>(() => api.get(`/analytics/departments${query}`), [query]);
  const timeDemand = useAsync<{ semester: number | null; demand: TimeDemandRow[] }>(() => api.get(`/analytics/time-demand${query}`), [query]);
  const capacity = useAsync<{ semester: number | null; capacityEfficiency: number }>(() => api.get(`/analytics/capacity${query}`), [query]);
  const conflictRate = useAsync<{ semester: number | null; conflictRate: number; conflicts: number }>(() => api.get(`/analytics/conflict-rate${query}`), [query]);

  const [selectedRoom, setSelectedRoom] = useState<number | null>(null);
  const room = useAsync<RoomAnalytics>(() => api.get(`/analytics/classrooms/${selectedRoom}${query}`), [selectedRoom, query]);

  const s = summary.data;
  const loading = summary.loading;

  if (loading) return <Spinner />;

  return (
    <div>
      <h1 className="page-title">Analytics</h1>
      <ErrorBanner message={summary.error ?? usage.error ?? buildings.error ?? departments.error ?? timeDemand.error} />

      <div className="card mb-16">
        <div className="filters">
          <select className="select" value={semester} onChange={(e) => setSemester(e.target.value)}>
            <option value="">Latest semester</option>
            {semesters.data?.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {s && (
        <div className="grid grid-4 mb-16">
          <div className="stat-card">
            <span className="stat-label">Utilization rate</span>
            <span className="stat-value">{s.utilizationRate}%</span>
          </div>
          <div className="stat-card">
            <span className="stat-label">Capacity efficiency</span>
            <span className="stat-value">{capacity.data?.capacityEfficiency ?? s.capacityEfficiency}%</span>
          </div>
          <div className="stat-card">
            <span className="stat-label">Conflict rate</span>
            <span className="stat-value">{conflictRate.data?.conflictRate ?? 0}%</span>
            <span className="stat-sub">{conflictRate.data?.conflicts ?? 0} conflicts</span>
          </div>
          <div className="stat-card">
            <span className="stat-label">Avg allocation score</span>
            <span className="stat-value">{s.averageAllocationScore}</span>
          </div>
          <div className="stat-card">
            <span className="stat-label">Peak day</span>
            <span className="stat-value" style={{ fontSize: 20 }}>
              {s.peakDay}
            </span>
          </div>
          <div className="stat-card">
            <span className="stat-label">Peak period</span>
            <span className="stat-value" style={{ fontSize: 20 }}>
              {s.peakPeriod}
            </span>
          </div>
        </div>
      )}

      <div className="grid grid-2">
        <div className="card">
          <div className="card-header">
            <h3>Classroom Utilization</h3>
          </div>
          <div className="table-wrap" style={{ maxHeight: 420, overflowY: 'auto' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Room</th>
                  <th>Building</th>
                  <th>Utilization</th>
                  <th>Bookings</th>
                </tr>
              </thead>
              <tbody>
                {(usage.data?.usage ?? []).slice(0, 30).map((u) => (
                  <tr key={u.classroomId} onClick={() => setSelectedRoom(u.classroomId)} style={{ cursor: 'pointer' }}>
                    <td className="mono">{u.roomCode}</td>
                    <td>{u.building}</td>
                    <td>
                      <div className="flex gap-8">
                        <ProgressBar value={u.utilization} />
                        <span>{u.utilization}%</span>
                      </div>
                    </td>
                    <td>{u.bookings}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h3>Building Utilization</h3>
          </div>
          {(buildings.data?.buildings ?? []).map((b) => (
            <div className="field" key={b.building}>
              <div className="flex-between">
                <span className="field-label">
                  {b.building} <span className="text-muted">({b.classrooms} rooms)</span>
                </span>
                <span>{b.utilization}%</span>
              </div>
              <ProgressBar value={b.utilization} />
            </div>
          ))}
          {(buildings.data?.buildings ?? []).length === 0 && <div className="empty">No data.</div>}
        </div>

        <div className="card">
          <div className="card-header">
            <h3>Department Demand</h3>
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Department</th>
                  <th>Allocations</th>
                  <th>Students</th>
                  <th>Avg score</th>
                </tr>
              </thead>
              <tbody>
                {(departments.data?.departments ?? []).map((d) => (
                  <tr key={d.department_id}>
                    <td>{d.department}</td>
                    <td>{d.allocations}</td>
                    <td>{d.students}</td>
                    <td>{d.average_score == null ? '—' : d.average_score.toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h3>Time-Slot Demand</h3>
          </div>
          <div className="table-wrap" style={{ maxHeight: 420, overflowY: 'auto' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Slot</th>
                  <th>Bookings</th>
                </tr>
              </thead>
              <tbody>
                {(timeDemand.data?.demand ?? []).map((t, i) => (
                  <tr key={i}>
                    <td>{t.label}</td>
                    <td>{t.bookings}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {room.loading ? (
        <Spinner />
      ) : selectedRoom && room.data ? (
        <div className="card mt-16">
          <div className="card-header">
            <h3>Room Detail — {room.data.classroom.room_code}</h3>
            <button className="btn btn-sm" onClick={() => setSelectedRoom(null)}>
              Close
            </button>
          </div>
          {room.data.classroom.usage && (
            <div className="grid grid-4 mb-16">
              <div className="stat-card">
                <span className="stat-label">Utilization</span>
                <span className="stat-value">{room.data.classroom.usage.utilization}%</span>
              </div>
              <div className="stat-card">
                <span className="stat-label">Hours used</span>
                <span className="stat-value">{room.data.classroom.usage.usedHours}</span>
              </div>
              <div className="stat-card">
                <span className="stat-label">Bookings</span>
                <span className="stat-value">{room.data.classroom.usage.bookings}</span>
              </div>
              <div className="stat-card">
                <span className="stat-label">Students served</span>
                <span className="stat-value">{room.data.classroom.usage.studentsServed}</span>
              </div>
            </div>
          )}
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Day</th>
                  <th>Time</th>
                  <th>Course</th>
                  <th>Group</th>
                  <th>Lecturer</th>
                </tr>
              </thead>
              <tbody>
                {room.data.courses.length === 0 ? (
                  <tr>
                    <td colSpan={5}>No bookings.</td>
                  </tr>
                ) : (
                  (room.data.courses as { day: number; start_time: string; end_time: string; course_code: string; course_name: string; group_name: string; lecturer_name: string | null }[]).map((c, i) => (
                    <tr key={i}>
                      <td>{['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][c.day] ?? c.day}</td>
                      <td>
                        {c.start_time}-{c.end_time}
                      </td>
                      <td>
                        {c.course_code} — {c.course_name}
                      </td>
                      <td>{c.group_name}</td>
                      <td>{c.lecturer_name ?? '—'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}
