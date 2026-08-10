import { useMemo, useState } from 'react';
import { api } from '../api/client';
import { useAsync } from '../api/useAsync';
import type { Allocation, Department, Paginated, Semester } from '../api/types';
import { ErrorBanner, Pagination, ProgressBar, Spinner, StatusBadge, SuccessBanner, Table } from '../components/Shared';
import { useAuth } from '../auth/AuthContext';

export default function AllocationsPage() {
  const { hasRole } = useAuth();
  const canAct = hasRole('SUPER_ADMIN', 'ADMIN', 'HOD');

  const [semester, setSemester] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [department, setDepartment] = useState('');
  const [course, setCourse] = useState('');
  const [page, setPage] = useState(1);

  const query = useMemo(() => {
    const params = new URLSearchParams({ page: String(page), pageSize: '20' });
    if (semester) params.set('semester', semester);
    if (statusFilter) params.set('status', statusFilter);
    if (department) params.set('department', department);
    if (course) params.set('course', course);
    return params.toString();
  }, [semester, statusFilter, department, course, page]);

  const { data, loading, error, reload } = useAsync<Paginated<Allocation>>(() => api.get(`/allocations?${query}`), [query]);
  const semesters = useAsync<Semester[]>(() => api.get('/semesters'));
  const departments = useAsync<Department[]>(() => api.get('/departments'));

  const [message, setMessage] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [optimizing, setOptimizing] = useState(false);

  const runOptimization = async () => {
    if (!semester) {
      setErrorMsg('Select a semester first to run optimization.');
      return;
    }
    if (!window.confirm('Run optimization for this semester? This will propose new allocations.')) return;
    setOptimizing(true);
    setErrorMsg(null);
    setMessage(null);
    try {
      const result = await api.post<{ message: string; proposed: number; approved: number }>('/allocations/optimize', { semesterId: Number(semester) });
      setMessage(
        `${result.message} — ${result.proposed} proposed, ${result.approved} approved.`,
      );
      reload();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Optimization failed.');
    } finally {
      setOptimizing(false);
    }
  };

  const changeStatus = async (id: number, newStatus: 'APPROVED' | 'REJECTED', label: string) => {
    if (!window.confirm(`${label} allocation #${id}?`)) return;
    setErrorMsg(null);
    try {
      await api.post(`/allocations/${id}/${newStatus.toLowerCase()}`);
      setMessage(`Allocation #${id} ${newStatus.toLowerCase()}.`);
      reload();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Action failed.');
    }
  };

  const deleteAllocation = async (id: number) => {
    if (!window.confirm(`Delete allocation #${id}?`)) return;
    setErrorMsg(null);
    try {
      await api.delete(`/allocations/${id}`);
      setMessage(`Allocation #${id} deleted.`);
      reload();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Delete failed.');
    }
  };

  const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  return (
    <div>
      <div className="flex-between">
        <h1 className="page-title">Allocations</h1>
        {canAct && (
          <button className="btn btn-primary" onClick={runOptimization} disabled={optimizing}>
            {optimizing ? 'Optimizing...' : 'Run Optimization'}
          </button>
        )}
      </div>
      <ErrorBanner message={errorMsg ?? error} />
      <SuccessBanner message={message} />

      <div className="card mb-16">
        <div className="filters">
          <select className="select" value={semester} onChange={(e) => { setSemester(e.target.value); setPage(1); }}>
            <option value="">All semesters</option>
            {semesters.data?.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.status})
              </option>
            ))}
          </select>
          <select className="select" value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}>
            <option value="">All statuses</option>
            <option>APPROVED</option>
            <option>PROPOSED</option>
            <option>REJECTED</option>
          </select>
          <select className="select" value={department} onChange={(e) => { setDepartment(e.target.value); setPage(1); }}>
            <option value="">All departments</option>
            {departments.data?.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
          <input
            className="input"
            placeholder="Search course..."
            value={course}
            onChange={(e) => {
              setCourse(e.target.value);
              setPage(1);
            }}
          />
        </div>
      </div>

      {loading ? (
        <Spinner />
      ) : (
        <>
          <Table<Allocation>
            columns={[
              { key: 'id', header: '#', render: (r) => <span className="mono">#{r.id}</span> },
              { key: 'course_code', header: 'Course', render: (r) => `${r.course_code} — ${r.course_name}` },
              { key: 'group_name', header: 'Group' },
              { key: 'room_code', header: 'Room', render: (r) => <span className="mono">{r.room_code}</span> },
              {
                key: 'time',
                header: 'Slot',
                render: (r) => `${dayNames[r.slot_day] ?? '?'} ${r.slot_start}-${r.slot_end}`,
              },
              { key: 'lecturer_name', header: 'Lecturer', render: (r) => r.lecturer_name ?? '—' },
              {
                key: 'status',
                header: 'Status',
                render: (r) => <StatusBadge status={r.status} />,
              },
              {
                key: 'total_score',
                header: 'Score',
                render: (r) => (r.total_score == null ? '—' : <ProgressBar value={r.total_score} />),
              },
            ]}
            rows={data?.rows ?? []}
            actions={
              canAct
                ? (row) => (
                    <>
                      {row.status !== 'APPROVED' && (
                        <button className="btn btn-sm btn-success" onClick={() => changeStatus(row.id, 'APPROVED', 'Approve')}>
                          Approve
                        </button>
                      )}
                      {row.status !== 'REJECTED' && (
                        <button className="btn btn-sm" onClick={() => changeStatus(row.id, 'REJECTED', 'Reject')}>
                          Reject
                        </button>
                      )}
                      {hasRole('SUPER_ADMIN', 'ADMIN') && (
                        <button className="btn btn-sm btn-danger" onClick={() => deleteAllocation(row.id)}>
                          Delete
                        </button>
                      )}
                    </>
                  )
                : undefined
            }
          />
          <Pagination page={data?.page ?? 1} totalPages={data?.totalPages ?? 1} onChange={setPage} />
        </>
      )}
    </div>
  );
}
