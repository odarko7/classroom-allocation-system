import { useMemo, useState, type FormEvent } from 'react';
import { api } from '../api/client';
import { useAsync } from '../api/useAsync';
import type { Course, Department, Facility, Lecturer, Paginated, RoomType, Semester } from '../api/types';
import { ErrorBanner, Field, Modal, Pagination, Spinner, SuccessBanner, Table, useDebouncedValue } from '../components/Shared';
import { useAuth } from '../auth/AuthContext';

const ROOM_TYPES: RoomType[] = ['Lecture Hall', 'Laboratory', 'Computer Lab', 'Seminar Room', 'Examination Hall', 'Conference Room', 'Studio'];

const emptyForm = {
  courseCode: '',
  name: '',
  departmentId: '',
  lecturerId: '',
  studentCount: 50,
  creditHours: 3,
  requiredRoomType: '',
  semesterId: '',
  description: '',
  requiredFacilities: [] as string[],
};

export default function CoursesPage() {
  const { hasRole } = useAuth();
  const canCreate = hasRole('SUPER_ADMIN', 'ADMIN', 'HOD');

  const [search, setSearch] = useState('');
  const [department, setDepartment] = useState('');
  const [semester, setSemester] = useState('');
  const [page, setPage] = useState(1);
  const debouncedSearch = useDebouncedValue(search);

  const query = useMemo(() => {
    const params = new URLSearchParams({ page: String(page), pageSize: '20' });
    if (debouncedSearch) params.set('search', debouncedSearch);
    if (department) params.set('department', department);
    if (semester) params.set('semester', semester);
    return params.toString();
  }, [debouncedSearch, department, semester, page]);

  const { data, loading, error, reload } = useAsync<Paginated<Course>>(() => api.get(`/courses?${query}`), [query]);
  const departments = useAsync<Department[]>(() => api.get('/departments'));
  const lecturers = useAsync<Lecturer[]>(() => api.get('/lecturers'));
  const semesters = useAsync<Semester[]>(() => api.get('/semesters'));
  const facilities = useAsync<Facility[]>(() => api.get('/facilities'));

  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Course | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSaving, setFormSaving] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setFormError(null);
    setShowModal(true);
  };

  const openEdit = (row: Course) => {
    setEditing(row);
    setForm({
      courseCode: row.course_code,
      name: row.name,
      departmentId: row.department_id ? String(row.department_id) : '',
      lecturerId: row.lecturer_id ? String(row.lecturer_id) : '',
      studentCount: row.student_count,
      creditHours: row.credit_hours,
      requiredRoomType: row.required_room_type ?? '',
      semesterId: row.semester_id ? String(row.semester_id) : '',
      description: row.description ?? '',
      requiredFacilities: row.required_facilities ?? [],
    });
    setFormError(null);
    setShowModal(true);
  };

  const set = (key: keyof typeof emptyForm, value: unknown) => setForm((f) => ({ ...f, [key]: value }));

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFormSaving(true);
    setFormError(null);
    try {
      const body = {
        courseCode: form.courseCode,
        name: form.name,
        departmentId: form.departmentId ? Number(form.departmentId) : null,
        lecturerId: form.lecturerId ? Number(form.lecturerId) : null,
        studentCount: Number(form.studentCount),
        creditHours: Number(form.creditHours),
        requiredRoomType: form.requiredRoomType || null,
        semesterId: form.semesterId ? Number(form.semesterId) : null,
        description: form.description || null,
        requiredFacilities: form.requiredFacilities,
      };
      if (editing) {
        await api.put(`/courses/${editing.id}`, body);
        setSuccess(`Course ${form.courseCode} updated.`);
      } else {
        await api.post('/courses', body);
        setSuccess(`Course ${form.courseCode} created.`);
      }
      setShowModal(false);
      reload();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Save failed.');
    } finally {
      setFormSaving(false);
    }
  };

  const handleDelete = async (row: Course) => {
    if (!window.confirm(`Delete course ${row.course_code}?`)) return;
    try {
      await api.delete(`/courses/${row.id}`);
      setSuccess(`Course ${row.course_code} deleted.`);
      reload();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Delete failed.');
    }
  };

  const facilityNames = (facilities.data ?? []).map((f) => f.name);

  return (
    <div>
      <div className="flex-between">
        <h1 className="page-title">Courses</h1>
        {canCreate && (
          <button className="btn btn-primary" onClick={openCreate}>
            + New Course
          </button>
        )}
      </div>
      <ErrorBanner message={error} />
      <SuccessBanner message={success} />

      <div className="card mb-16">
        <div className="filters">
          <input className="input" placeholder="Search code / name..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
          <select className="select" value={department} onChange={(e) => { setDepartment(e.target.value); setPage(1); }}>
            <option value="">All departments</option>
            {departments.data?.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
          <select className="select" value={semester} onChange={(e) => { setSemester(e.target.value); setPage(1); }}>
            <option value="">All semesters</option>
            {semesters.data?.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <Spinner />
      ) : (
        <>
          <Table<Course>
            columns={[
              { key: 'course_code', header: 'Code', render: (r) => <strong className="mono">{r.course_code}</strong> },
              { key: 'name', header: 'Name' },
              { key: 'department_name', header: 'Department', render: (r) => r.department_name ?? '—' },
              { key: 'lecturer_name', header: 'Lecturer', render: (r) => r.lecturer_name ?? '—' },
              { key: 'student_count', header: 'Students' },
              { key: 'credit_hours', header: 'Credit Hrs' },
              { key: 'required_room_type', header: 'Room Type', render: (r) => r.required_room_type ?? '—' },
            ]}
            rows={data?.rows ?? []}
            actions={
              hasRole('SUPER_ADMIN', 'ADMIN', 'HOD')
                ? (row) => (
                    <>
                      <button className="btn btn-sm" onClick={() => openEdit(row)}>
                        Edit
                      </button>
                      <button className="btn btn-sm btn-danger" onClick={() => handleDelete(row)}>
                        Delete
                      </button>
                    </>
                  )
                : undefined
            }
          />
          <Pagination page={data?.page ?? 1} totalPages={data?.totalPages ?? 1} onChange={setPage} />
        </>
      )}

      {showModal && (
        <Modal title={editing ? `Edit ${editing.course_code}` : 'New Course'} onClose={() => setShowModal(false)}>
          <form onSubmit={handleSubmit}>
            <div className="form-grid">
              <Field label="Course code" required>
                <input className="input" required value={form.courseCode} onChange={(e) => set('courseCode', e.target.value.toUpperCase())} />
              </Field>
              <Field label="Name" required>
                <input className="input" required value={form.name} onChange={(e) => set('name', e.target.value)} />
              </Field>
              <Field label="Department">
                <select className="select" value={form.departmentId} onChange={(e) => set('departmentId', e.target.value)}>
                  <option value="">None</option>
                  {departments.data?.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Lecturer">
                <select className="select" value={form.lecturerId} onChange={(e) => set('lecturerId', e.target.value)}>
                  <option value="">None</option>
                  {lecturers.data?.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Student count">
                <input className="input" type="number" min={1} value={form.studentCount} onChange={(e) => set('studentCount', Number(e.target.value))} />
              </Field>
              <Field label="Credit hours">
                <input className="input" type="number" min={1} max={6} value={form.creditHours} onChange={(e) => set('creditHours', Number(e.target.value))} />
              </Field>
              <Field label="Required room type">
                <select className="select" value={form.requiredRoomType} onChange={(e) => set('requiredRoomType', e.target.value)}>
                  <option value="">Any</option>
                  {ROOM_TYPES.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </Field>
              <Field label="Semester">
                <select className="select" value={form.semesterId} onChange={(e) => set('semesterId', e.target.value)}>
                  <option value="">None</option>
                  {semesters.data?.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Required facilities">
                <select className="select" multiple value={form.requiredFacilities} onChange={(e) => set('requiredFacilities', Array.from(e.target.selectedOptions).map((o) => o.value))}>
                  {facilityNames.map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Description">
                <textarea className="textarea" value={form.description} onChange={(e) => set('description', e.target.value)} />
              </Field>
            </div>
            <ErrorBanner message={formError} />
            <div className="form-actions">
              <button type="button" className="btn" onClick={() => setShowModal(false)}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={formSaving}>
                {formSaving ? 'Saving...' : editing ? 'Update' : 'Create'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
