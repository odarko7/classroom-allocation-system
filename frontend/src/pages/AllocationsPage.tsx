import { useMemo, useState, type FormEvent } from 'react';
import { api } from '../api/client';
import { useAsync } from '../api/useAsync';
import { useAutoRefresh } from '../api/useAutoRefresh';
import type {
  Allocation, ConfirmRecommendationResponse, Course, Department, Lecturer, Paginated, RecommendationResult, Semester, TimeSlot,
} from '../api/types';
import { ErrorBanner, Field, Modal, Pagination, ProgressBar, Spinner, StatusBadge, SuccessBanner, Table } from '../components/Shared';
import { useAuth } from '../auth/AuthContext';

const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

interface SetupForm {
  courseId: string;
  studentCount: number;
  lecturerId: string;
  semesterId: string;
  timeSlotId: string;
}

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

  useAutoRefresh(reload, 20000);

  const [message, setMessage] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // ---- Interactive optimization setup ----
  const [showSetup, setShowSetup] = useState(false);
  const [setupStep, setSetupStep] = useState<'form' | 'result'>('form');
  const [showDetails, setShowDetails] = useState(false);
  const [setupForm, setSetupForm] = useState<SetupForm>({ courseId: '', studentCount: 0, lecturerId: '', semesterId: '', timeSlotId: '' });
  const [recommendation, setRecommendation] = useState<RecommendationResult | null>(null);
  const [optimizing, setOptimizing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [setupError, setSetupError] = useState<string | null>(null);
  const [bulkOptimizing, setBulkOptimizing] = useState(false);

  const allCourses = useAsync<Paginated<Course>>(() => api.get('/courses?pageSize=1000'), []);
  const allLecturers = useAsync<Paginated<Lecturer>>(() => api.get('/lecturers?pageSize=1000'), []);
  const timeSlots = useAsync<TimeSlot[]>(() => api.get('/timeslots'));

  const courses = allCourses.data?.rows ?? [];
  const lecturers = (allLecturers.data?.rows ?? []).filter((l) => l.is_active === 1);

  const openSetup = () => {
    const active = (semesters.data ?? []).find((s) => s.status === 'ACTIVE');
    const defaultSemester = active ? String(active.id) : (semesters.data ?? [])[0] ? String((semesters.data ?? [])[0].id) : '';
    setSetupForm({ courseId: '', studentCount: 0, lecturerId: '', semesterId: defaultSemester, timeSlotId: '' });
    setRecommendation(null);
    setSetupError(null);
    setShowDetails(false);
    setSetupStep('form');
    setShowSetup(true);
  };

  const setForm = (key: keyof SetupForm, value: unknown) => setSetupForm((f) => ({ ...f, [key]: value }));

  const handleCourseChange = (courseId: string) => {
    const selected = courses.find((c) => String(c.id) === courseId);
    setForm('courseId', courseId);
    setForm('studentCount', selected?.student_count ?? 0);
    setForm('lecturerId', selected?.lecturer_id ? String(selected.lecturer_id) : '');
  };

  const handleOptimize = async (e: FormEvent) => {
    e.preventDefault();
    if (!setupForm.courseId) {
      setSetupError('Select a course to optimize.');
      return;
    }
    if (!setupForm.lecturerId) {
      setSetupError('Select the lecturer who will teach this course.');
      return;
    }
    if (!setupForm.studentCount || setupForm.studentCount <= 0) {
      setSetupError('Enter the number of students taking the course.');
      return;
    }
    if (!setupForm.semesterId) {
      setSetupError('Select a semester.');
      return;
    }
    setOptimizing(true);
    setSetupError(null);
    setShowDetails(false);
    try {
      const result = await api.post<RecommendationResult>('/allocations/recommend', {
        courseId: Number(setupForm.courseId),
        studentCount: Number(setupForm.studentCount),
        lecturerId: Number(setupForm.lecturerId),
        semesterId: Number(setupForm.semesterId),
        timeSlotId: setupForm.timeSlotId ? Number(setupForm.timeSlotId) : null,
      });
      setRecommendation(result);
      setSetupStep('result');
    } catch (err) {
      setSetupError(err instanceof Error ? err.message : 'Optimization failed.');
    } finally {
      setOptimizing(false);
    }
  };

  const handleConfirm = async () => {
    const best = recommendation?.best;
    if (!recommendation || !best) return;
    if (!window.confirm(`Confirm and save this allocation as PROPOSED?\n${recommendation.courseCode} -> ${best.roomCode} (${best.capacity})`)) return;
    setConfirming(true);
    setSetupError(null);
    try {
      const result = await api.post<ConfirmRecommendationResponse>('/allocations/recommend/confirm', {
        courseId: recommendation.courseId,
        studentCount: recommendation.studentCount,
        lecturerId: recommendation.lecturerId,
        semesterId: recommendation.semesterId,
        classroomId: best.classroomId,
        timeSlotId: best.timeSlotId,
      });
      setShowSetup(false);
      setMessage(result.message);
      reload();
    } catch (err) {
      setSetupError(err instanceof Error ? err.message : 'Could not save the allocation.');
    } finally {
      setConfirming(false);
    }
  };

  const handleBulkOptimize = async () => {
    const semesterId = setupForm.semesterId;
    if (!semesterId) {
      setSetupError('Select a semester to run the automatic optimizer.');
      return;
    }
    if (!window.confirm('Run the automatic optimizer for the entire semester? This will propose new allocations for every course.')) return;
    setBulkOptimizing(true);
    setSetupError(null);
    try {
      const result = await api.post<{ message: string; after: { averageScore: number } }>('/allocations/optimize', { semesterId: Number(semesterId) });
      setShowSetup(false);
      setMessage(result.message);
      reload();
    } catch (err) {
      setSetupError(err instanceof Error ? err.message : 'Optimization failed.');
    } finally {
      setBulkOptimizing(false);
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

  return (
    <div>
      <div className="flex-between">
        <h1 className="page-title">Allocations</h1>
        {canAct && (
          <button className="btn btn-primary" onClick={openSetup}>
            Run Optimization
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

      {showSetup && (
        <Modal title="Optimization Setup" onClose={() => setShowSetup(false)}>
          {setupStep === 'form' ? (
            <form onSubmit={handleOptimize}>
              <p className="text-muted" style={{ marginTop: 0 }}>
                Choose a course and let the system recommend the most suitable classroom based on capacity, facilities and availability.
              </p>
              <div className="form-grid">
                <Field label="Semester" required>
                  <select className="select" value={setupForm.semesterId} onChange={(e) => setForm('semesterId', e.target.value)}>
                    <option value="">Select semester</option>
                    {semesters.data?.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.status})
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Course" required>
                  <select className="select" value={setupForm.courseId} onChange={(e) => handleCourseChange(e.target.value)}>
                    <option value="">Select course</option>
                    {courses.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.course_code} — {c.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Number of students" required>
                  <input
                    className="input"
                    type="number"
                    min={1}
                    value={setupForm.studentCount}
                    onChange={(e) => setForm('studentCount', Number(e.target.value))}
                  />
                </Field>
                <Field label="Lecturer" required>
                  <select className="select" value={setupForm.lecturerId} onChange={(e) => setForm('lecturerId', e.target.value)}>
                    <option value="">Select lecturer</option>
                    {lecturers.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Time slot">
                  <select className="select" value={setupForm.timeSlotId} onChange={(e) => setForm('timeSlotId', e.target.value)}>
                    <option value="">Automatic (best available)</option>
                    {timeSlots.data?.map((t) => (
                      <option key={t.id} value={t.id}>
                        {dayNames[t.day] ?? t.day} {t.start_time}-{t.end_time}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              <ErrorBanner message={setupError} />
              <div className="form-actions">
                <button type="button" className="btn" onClick={() => setShowSetup(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={optimizing}>
                  {optimizing ? 'Optimizing...' : 'Optimize'}
                </button>
              </div>
              <div style={{ marginTop: 12, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
                <button type="button" className="btn btn-sm" onClick={handleBulkOptimize} disabled={bulkOptimizing}>
                  {bulkOptimizing ? 'Optimizing semester...' : 'Run automatic optimizer for the entire semester'}
                </button>
              </div>
            </form>
          ) : (
            recommendation && (
              <div>
                <p className="text-muted" style={{ marginTop: 0 }}>
                  Preview only — nothing is saved yet.
                </p>
                {recommendation.success && recommendation.best ? (
                  <>
                    <div className="table-wrap">
                      <table className="table">
                        <thead>
                          <tr>
                            <th>Course</th>
                            <th>Students</th>
                            <th>Lecturer</th>
                            <th>Recommended Classroom</th>
                            <th>Capacity</th>
                            <th>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr>
                            <td>
                              <strong>{recommendation.courseCode}</strong> — {recommendation.courseName}
                            </td>
                            <td>{recommendation.studentCount}</td>
                            <td>{recommendation.lecturerName}</td>
                            <td>
                              <span className="mono">{recommendation.best.roomCode}</span>
                            </td>
                            <td>{recommendation.best.capacity}</td>
                            <td>
                              <span className="badge badge-info">RECOMMENDED</span>
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                    <p className="text-muted">
                      Suggested time slot: <strong>{recommendation.best.timeSlotLabel}</strong> · Building {recommendation.best.building} (floor {recommendation.best.floor}) · Room type {recommendation.best.roomType}.
                    </p>
                    {recommendation.requiredFacilities.length > 0 && (
                      <p className="text-muted">
                        Required facilities satisfied: {recommendation.requiredFacilities.join(', ')}.
                      </p>
                    )}
                    {showDetails && (
                      <div className="card" style={{ padding: 12, marginTop: 8 }}>
                        <h4>Review — candidate classrooms</h4>
                        {recommendation.suitable.map((r) => (
                          <div key={r.classroomId} className="flex-between" style={{ padding: '6px 0', borderBottom: '1px solid var(--border-soft)' }}>
                            <div>
                              <span className="mono">{r.roomCode}</span> · capacity {r.capacity} · {r.timeSlotLabel}
                            </div>
                            <div className="text-muted">score {r.score}</div>
                          </div>
                        ))}
                        {recommendation.rejected.length > 0 && (
                          <>
                            <h4 style={{ marginBottom: 4 }}>Rejected classrooms</h4>
                            {recommendation.rejected.map((r, i) => (
                              <div key={`${r.roomCode}-${i}`} className="text-muted" style={{ padding: '4px 0' }}>
                                <span className="mono">{r.roomCode}</span>: {r.reasons.join('; ')}
                              </div>
                            ))}
                          </>
                        )}
                      </div>
                    )}
                    <ErrorBanner message={setupError} />
                    <div className="form-actions">
                      <button type="button" className="btn" onClick={() => setShowDetails((d) => !d)}>
                        {showDetails ? 'Hide review' : 'Review'}
                      </button>
                      <button
                        type="button"
                        className="btn"
                        onClick={() => {
                          setSetupStep('form');
                          setSetupError(null);
                        }}
                      >
                        Optimize Again
                      </button>
                      <button type="button" className="btn btn-primary" onClick={handleConfirm} disabled={confirming}>
                        {confirming ? 'Saving...' : 'Confirm & Save'}
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="banner error">
                      <strong>No suitable allocation found.</strong>
                    </div>
                    {recommendation.reasons.map((r, i) => (
                      <p key={i} className="text-muted">
                        {r}
                      </p>
                    ))}
                    {recommendation.rejected.length > 0 && (
                      <div className="card" style={{ padding: 12 }}>
                        <h4 style={{ marginTop: 0 }}>Why these classrooms were rejected</h4>
                        {recommendation.rejected.map((r, i) => (
                          <div key={`${r.roomCode}-${i}`} className="text-muted" style={{ padding: '4px 0' }}>
                            <span className="mono">{r.roomCode}</span> (capacity {r.capacity}): {r.reasons.join('; ')}
                          </div>
                        ))}
                      </div>
                    )}
                    <ErrorBanner message={setupError} />
                    <div className="form-actions">
                      <button type="button" className="btn" onClick={() => { setSetupStep('form'); setSetupError(null); }}>
                        Optimize Again
                      </button>
                    </div>
                  </>
                )}
              </div>
            )
          )}
        </Modal>
      )}
    </div>
  );
}
