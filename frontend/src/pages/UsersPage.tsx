import { useState, type FormEvent } from 'react';
import { api } from '../api/client';
import { useAsync } from '../api/useAsync';
import type { Department, Role, User } from '../api/types';
import { Badge, ErrorBanner, Field, Modal, Spinner, SuccessBanner, Table } from '../components/Shared';

const ROLES: Role[] = ['SUPER_ADMIN', 'ADMIN', 'HOD', 'LECTURER', 'VIEWER'];
const emptyForm = { name: '', email: '', password: '', role: 'VIEWER' as Role, departmentId: '' };

export default function UsersPage() {
  const { data, loading, error, reload } = useAsync<User[]>(() => api.get('/users'));
  const departments = useAsync<Department[]>(() => api.get('/departments'));

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
      await api.post('/users', {
        name: form.name,
        email: form.email,
        password: form.password,
        role: form.role,
        departmentId: form.departmentId ? Number(form.departmentId) : null,
      });
      setSuccess(`User ${form.email} created.`);
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
        <h1 className="page-title">Users</h1>
        <button className="btn btn-primary" onClick={() => { setForm(emptyForm); setFormError(null); setShowModal(true); }}>
          + New User
        </button>
      </div>
      <ErrorBanner message={error} />
      <SuccessBanner message={success} />

      {loading ? (
        <Spinner />
      ) : (
        <Table<User>
          columns={[
            { key: 'name', header: 'Name', render: (r) => <strong>{r.name}</strong> },
            { key: 'email', header: 'Email' },
            { key: 'role', header: 'Role', render: (r) => <Badge tone="info">{r.role.replace('_', ' ')}</Badge> },
            { key: 'departmentName', header: 'Department', render: (r) => r.departmentName ?? '—' },
            { key: 'isActive', header: 'Status', render: (r) => (r.isActive ? <Badge tone="success">Active</Badge> : <Badge tone="danger">Inactive</Badge>) },
          ]}
          rows={data ?? []}
        />
      )}

      {showModal && (
        <Modal title="New User" onClose={() => setShowModal(false)}>
          <form onSubmit={handleSubmit}>
            <div className="form-grid">
              <Field label="Name" required>
                <input className="input" required value={form.name} onChange={(e) => set('name', e.target.value)} />
              </Field>
              <Field label="Email" required>
                <input className="input" type="email" required value={form.email} onChange={(e) => set('email', e.target.value)} />
              </Field>
              <Field label="Password" required>
                <input className="input" type="password" required minLength={6} value={form.password} onChange={(e) => set('password', e.target.value)} />
              </Field>
              <Field label="Role">
                <select className="select" value={form.role} onChange={(e) => set('role', e.target.value)}>
                  {ROLES.map((r) => (
                    <option key={r}>{r}</option>
                  ))}
                </select>
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
