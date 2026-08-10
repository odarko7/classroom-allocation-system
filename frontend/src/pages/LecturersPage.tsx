import { useMemo, useState, type FormEvent } from 'react';
import { api } from '../api/client';
import { useAsync } from '../api/useAsync';
import type { Department, Lecturer, Paginated } from '../api/types';
import { Badge, ErrorBanner, Field, Modal, Pagination, Spinner, SuccessBanner, Table, useDebouncedValue } from '../components/Shared';
import { useAuth } from '../auth/AuthContext';

const emptyForm = {
  staffNo: '',
  name: '',
  email: '',
  phone: '',
  departmentId: '',
  title: '',
};

export default function LecturersPage() {
  const { hasRole } = useAuth();
  const canManage = hasRole('SUPER_ADMIN', 'ADMIN');

  const [search, setSearch] = useState('');
  const [department, setDepartment] = useState('');
  const [page, setPage] = useState(1);
  const debouncedSearch = useDebouncedValue(search);

  const query = useMemo(() => {
    const params = new URLSearchParams({ page: String(page), pageSize: '20' });
    if (debouncedSearch) params.set('search', debouncedSearch);
    if (department) params.set('department', department);
    return params.toString();
  }, [debouncedSearch, department, page]);

  const { data, loading, error, reload } = useAsync<Paginated<Lecturer>>(() => api.get(`/lecturers?${query}`), [query]);
  const departments = useAsync<Department[]>(() => api.get('/departments'));

  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Lecturer | null>(null);
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

  const openEdit = (row: Lecturer) => {
    setEditing(row);
    setForm({
      staffNo: row.staff_no,
      name: row.name,
      email: row.email ?? '',
      phone: row.phone ?? '',
      departmentId: row.department_id ? String(row.department_id) : '',
      title: row.title ?? '',
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
        staffNo: form.staffNo,
        name: form.name,
        email: form.email || null,
        phone: form.phone || null,
        departmentId: form.departmentId ? Number(form.departmentId) : null,
        title: form.title || null,
      };
      if (editing) {
        await api.put(`/lecturers/${editing.id}`, { ...body, isActive: editing.is_active });
        setSuccess(`Lecturer ${form.name} updated.`);
      } else {
        await api.post('/lecturers', body);
        setSuccess(`Lecturer ${form.name} created.`);
      }
      setShowModal(false);
      reload();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Save failed.');
    } finally {
      setFormSaving(false);
    }
  };

  const handleDelete = async (row: Lecturer) => {
    if (!window.confirm(`Delete lecturer ${row.name}?`)) return;
    try {
      await api.delete(`/lecturers/${row.id}`);
      setSuccess(`Lecturer ${row.name} deleted.`);
      reload();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Delete failed.');
    }
  };

  return (
    <div>
      <div className="flex-between">
        <h1 className="page-title">Lecturers</h1>
        {canManage && (
          <button className="btn btn-primary" onClick={openCreate}>
            + New Lecturer
          </button>
        )}
      </div>
      <ErrorBanner message={error} />
      <SuccessBanner message={success} />

      <div className="card mb-16">
        <div className="filters">
          <input className="input" placeholder="Search name / staff no / email..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
          <select className="select" value={department} onChange={(e) => { setDepartment(e.target.value); setPage(1); }}>
            <option value="">All departments</option>
            {departments.data?.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <Spinner />
      ) : (
        <>
          <Table<Lecturer>
            columns={[
              { key: 'staff_no', header: 'Staff No', render: (r) => <span className="mono">{r.staff_no}</span> },
              { key: 'name', header: 'Name', render: (r) => <strong>{r.name}</strong> },
              { key: 'title', header: 'Title', render: (r) => r.title ?? '—' },
              { key: 'department_name', header: 'Department', render: (r) => r.department_name ?? '—' },
              { key: 'email', header: 'Email', render: (r) => r.email ?? '—' },
              { key: 'phone', header: 'Phone', render: (r) => r.phone ?? '—' },
              { key: 'is_active', header: 'Active', render: (r) => (r.is_active ? <Badge tone="success">Active</Badge> : <Badge tone="danger">Inactive</Badge>) },
            ]}
            rows={data?.rows ?? []}
            actions={
              canManage
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
        <Modal title={editing ? `Edit ${editing.name}` : 'New Lecturer'} onClose={() => setShowModal(false)}>
          <form onSubmit={handleSubmit}>
            <div className="form-grid">
              <Field label="Staff number" required>
                <input className="input" required value={form.staffNo} onChange={(e) => set('staffNo', e.target.value.toUpperCase())} />
              </Field>
              <Field label="Name" required>
                <input className="input" required value={form.name} onChange={(e) => set('name', e.target.value)} />
              </Field>
              <Field label="Title">
                <input className="input" value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="Dr., Prof., Mr., Ms." />
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
              <Field label="Email">
                <input className="input" type="email" value={form.email} onChange={(e) => set('email', e.target.value)} />
              </Field>
              <Field label="Phone">
                <input className="input" value={form.phone} onChange={(e) => set('phone', e.target.value)} />
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
