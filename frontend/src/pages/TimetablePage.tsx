import { useEffect, useMemo, useState } from 'react';
import { api } from '../api/client';
import { useAsync } from '../api/useAsync';
import type { Classroom, Department, Paginated, Semester, TimetableCell } from '../api/types';
import { ErrorBanner, Spinner } from '../components/Shared';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export default function TimetablePage() {
  const [semester, setSemester] = useState('');
  const [classroom, setClassroom] = useState('');
  const [department, setDepartment] = useState('');

  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (semester) params.set('semester', semester);
    if (classroom) params.set('classroom', classroom);
    if (department) params.set('department', department);
    return params.toString();
  }, [semester, classroom, department]);

  const { data, loading, error } = useAsync<{ rows: TimetableCell[] }>(() => api.get(`/timetable?${query}`), [query]);
  const semesters = useAsync<Semester[]>(() => api.get('/semesters'));
  const classrooms = useAsync<Paginated<Classroom>>(() => api.get('/classrooms?pageSize=200'));
  const departments = useAsync<Department[]>(() => api.get('/departments'));

  const [startTimes, setStartTimes] = useState<string[]>([]);

  const rows = data?.rows ?? [];

  useEffect(() => {
    const times = [...new Set(rows.map((r) => r.startTime))].sort();
    setStartTimes(times);
  }, [rows]);

  if (loading) return <Spinner />;

  const cellsByDayStart = new Map<string, Map<number, TimetableCell[]>>();
  for (const r of rows) {
    if (!cellsByDayStart.has(r.startTime)) cellsByDayStart.set(r.startTime, new Map());
    if (!cellsByDayStart.get(r.startTime)!.has(r.day)) cellsByDayStart.get(r.startTime)!.set(r.day, []);
    cellsByDayStart.get(r.startTime)!.get(r.day)!.push(r);
  }

  return (
    <div>
      <h1 className="page-title">Timetable</h1>
      <ErrorBanner message={error} />

      <div className="card mb-16">
        <div className="filters">
          <select className="select" value={semester} onChange={(e) => setSemester(e.target.value)}>
            <option value="">All semesters</option>
            {semesters.data?.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <select className="select" value={classroom} onChange={(e) => setClassroom(e.target.value)}>
            <option value="">All classrooms</option>
            {(classrooms.data?.rows ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.room_code}
              </option>
            ))}
          </select>
          <select className="select" value={department} onChange={(e) => setDepartment(e.target.value)}>
            <option value="">All departments</option>
            {departments.data?.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {startTimes.length === 0 ? (
        <div className="empty">No allocations match the current filters.</div>
      ) : (
        <div className="tt-grid-wrap">
          <div className="tt-grid">
          <div className="tt-head">Time</div>
          {DAYS.map((d) => (
            <div className="tt-head" key={d}>
              {d}
            </div>
          ))}
          {startTimes.map((time) => (
            <div style={{ display: 'contents' }} key={time}>
              <div className="tt-time">{time}</div>
              {DAYS.map((_, dayIdx) => {
                const cells = cellsByDayStart.get(time)?.get(dayIdx) ?? [];
                return (
                  <div className="tt-cell" key={dayIdx}>
                    {cells.map((c) => (
                      <div className="tt-entry" key={c.allocationId}>
                        <div className="course">
                          {c.courseCode} · {c.groupName}
                        </div>
                        <div className="meta">
                          {c.roomCode}
                          {c.lecturerName ? ` · ${c.lecturerName}` : ''}
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
        </div>
      )}
    </div>
  );
}
