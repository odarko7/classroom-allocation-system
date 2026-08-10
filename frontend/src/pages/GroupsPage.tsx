import { useState, type FormEvent } from 'react';
import { api } from '../api/client';
import { useAsync } from '../api/useAsync';
import type { Course, Lecturer, Paginated, Semester, StudentGroup } from '../api/types';
import { Badge, ErrorBanner, Field, Modal, Spinner, SuccessBanner, Table } from '../components/Shared';
import { useAuth } from '../auth/AuthContext';

const emptyForm = { name: '', courseId: '', lecturerId: '', semesterId: '', studentCount: 0 };

export default function GroupsPage() {
  const { hasRole } = useAuth();
  const canCreate = hasRole('SUPER_ADMIN', 'ADMIN', 'HOD');

  const { data, loading, error, reload } = useAsync<StudentGroup[]>(() => api.get('/groups'));
  const courses = useAsync<Paginated<Course>>(() => api.get('/courses?pageSize=500'));
  const lecturers = useAsync<Lecturer[]>(() => api.get('/lecturers'));
  const semesters = useAsync<Semester[]>(() => api.get('/semesters'));

  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSaving, setFormSaving] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);

  const set = (key: keyof typeof emptyForm, value: unknown) => setForm((f) => ({ ...f, [key]: value }));

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFormSaving(true);
    setFormError(null);
    try {
      const body = {
        name: form.name,
        courseId: Number(form.courseId),
        lecturerId: form.lecturerId ? Number(form.lecturerId) : null,
        semesterId: form.semesterId ? Number(form.semesterId) : null,
        studentCount: Number(form.studentCount),
      };
      await api.post('/student-groups', body);
      setSuccess(`Group ${form.name} created.`);
      setShowModal(false);
      setForm(emptyForm);
      reload();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Save failed.');
    } finally {
      setFormSaving(false);
    }
  };

  return (
    <div>
      <div className="flex-between">
        <h1 className="page-title">Student Groups</h1>
        {canCreate && (
          <button className="btn btn-primary" onClick={() => { setForm(emptyForm); setFormError(null); setShowModal(true); }}>
            + New Group
          </button>
        )}
      </div>
      <ErrorBanner message={error} />
      <SuccessBanner message={success} />

      {loading ? (
        <Spinner />
      ) : (
        <Table<StudentGroup>
          columns={[
            { key: 'name', header: 'Group', render: (r) => <strong>{r.name}</strong> },
            { key: 'course_code', header: 'Course', render: (r) => `${r.course_code} — ${r.course_name}` },
            { key: 'department_name', header: 'Department', render: (r) => r.department_name ?? '—' },
            { key: 'lecturer_name', header: 'Lecturer', render: (r) => r.lecturer_name ?? '—' },
            { key: 'student_count', header: 'Students' },
            {
              key: 'has_allocation',
              header: 'Allocation',
              render: (r) => (r.has_allocation ? <Badge tone="success">Assigned</Badge> : <Badge tone="warning">Unallocated</Badge>),
            },
          ]}
          rows={data ?? []}
        />
      )}

      {showModal && (
        <Modal title="New Student Group" onClose={() => setShowModal(false)}>
          <form onSubmit={handleSubmit}>
            <div className="form-grid">
              <Field label="Group name" required>
                <input className="input" required value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. CS 200 A" />
              </Field>
              <Field label="Course" required>
                <select className="select" required value={form.courseId} onChange={(e) => set('courseId', e.target.value)}>
                  <option value="">Select course</option>
                  {(courses.data?.rows ?? []).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.course_code} — {c.name}
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
              <Field label="Student count">
                <input className="input" type="number" min={0} value={form.studentCount} onChange={(e) => set('studentCount', Number(e.target.value))} />
              </Field>
            </div>
            <ErrorBanner message={formError} />
            <div className="form-actions">
              <button type="button" className="btn" onClick={() => setShowModal(false)}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={formSaving}>
                {formSaving ? 'Saving...' : 'Create'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
