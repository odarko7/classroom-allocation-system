import { useMemo, useState, type FormEvent } from 'react';
import { api } from '../api/client';
import { useAsync } from '../api/useAsync';
import type { Classroom, Facility, Paginated, RoomType } from '../api/types';
import { ErrorBanner, Field, Modal, Pagination, Spinner, StatusBadge, SuccessBanner, Table, useDebouncedValue } from '../components/Shared';
import { useAuth } from '../auth/AuthContext';

const ROOM_TYPES: RoomType[] = ['Lecture Hall', 'Laboratory', 'Computer Lab', 'Seminar Room', 'Examination Hall', 'Conference Room', 'Studio'];
const STATUSES = ['ACTIVE', 'MAINTENANCE', 'INACTIVE'];
const BUILDINGS = ['Main Campus', 'Engineering', 'Science', 'Business', 'Medical'];

const emptyForm = {
  roomCode: '',
  name: '',
  building: 'Main Campus',
  floor: 1,
  capacity: 50,
  roomType: 'Lecture Hall' as RoomType,
  status: 'ACTIVE' as Classroom['status'],
  accessibility: 'None',
  description: '',
  facilities: [] as string[],
};

export default function ClassroomsPage() {
  const { hasRole } = useAuth();
  const canManage = hasRole('SUPER_ADMIN', 'ADMIN');

  const [search, setSearch] = useState('');
  const [building, setBuilding] = useState('');
  const [roomType, setRoomType] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const debouncedSearch = useDebouncedValue(search);

  const query = useMemo(() => {
    const params = new URLSearchParams({ page: String(page), pageSize: '20' });
    if (debouncedSearch) params.set('search', debouncedSearch);
    if (building) params.set('building', building);
    if (roomType) params.set('roomType', roomType);
    if (status) params.set('status', status);
    return params.toString();
  }, [debouncedSearch, building, roomType, status, page]);

  const { data, loading, error, reload } = useAsync<Paginated<Classroom>>(() => api.get(`/classrooms?${query}`), [query]);
  const facilitiesData = useAsync<Facility[]>(() => api.get('/facilities'));

  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Classroom | null>(null);
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

  const openEdit = (row: Classroom) => {
    setEditing(row);
    setForm({
      roomCode: row.room_code,
      name: row.name ?? '',
      building: row.building,
      floor: row.floor,
      capacity: row.capacity,
      roomType: row.room_type,
      status: row.status,
      accessibility: row.accessibility ?? 'None',
      description: row.description ?? '',
      facilities: row.facilities ?? [],
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
        roomCode: form.roomCode,
        name: form.name || null,
        building: form.building,
        floor: Number(form.floor),
        capacity: Number(form.capacity),
        roomType: form.roomType,
        status: form.status,
        accessibility: form.accessibility === 'None' ? null : form.accessibility,
        description: form.description || null,
        facilities: form.facilities,
      };
      if (editing) {
        await api.put(`/classrooms/${editing.id}`, body);
        setSuccess(`Classroom ${form.roomCode} updated.`);
      } else {
        await api.post('/classrooms', body);
        setSuccess(`Classroom ${form.roomCode} created.`);
      }
      setShowModal(false);
      reload();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Save failed.');
    } finally {
      setFormSaving(false);
    }
  };

  const handleDelete = async (row: Classroom) => {
    if (!window.confirm(`Delete classroom ${row.room_code}?`)) return;
    try {
      await api.delete(`/classrooms/${row.id}`);
      setSuccess(`Classroom ${row.room_code} deleted.`);
      reload();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Delete failed.');
    }
  };

  const facilityNames = (facilitiesData.data ?? []).map((f) => f.name);

  return (
    <div>
      <div className="flex-between">
        <h1 className="page-title">Classrooms</h1>
        {canManage && (
          <button className="btn btn-primary" onClick={openCreate}>
            + New Classroom
          </button>
        )}
      </div>
      <ErrorBanner message={error} />
      <SuccessBanner message={success} />

      <div className="card mb-16">
        <div className="filters">
          <input className="input" placeholder="Search code / building..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
          <select className="select" value={building} onChange={(e) => { setBuilding(e.target.value); setPage(1); }}>
            <option value="">All buildings</option>
            {BUILDINGS.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
          <select className="select" value={roomType} onChange={(e) => { setRoomType(e.target.value); setPage(1); }}>
            <option value="">All types</option>
            {ROOM_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <select className="select" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
            <option value="">All statuses</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <Spinner />
      ) : (
        <>
          <Table<Classroom>
            columns={[
              { key: 'room_code', header: 'Code', render: (r) => <strong className="mono">{r.room_code}</strong> },
              { key: 'name', header: 'Name', render: (r) => r.name ?? '—' },
              { key: 'building', header: 'Building', render: (r) => `${r.building} (${r.floor})` },
              { key: 'capacity', header: 'Capacity' },
              { key: 'room_type', header: 'Type' },
              {
                key: 'status',
                header: 'Status',
                render: (r) => <StatusBadge status={r.status} />,
              },
              {
                key: 'facilities',
                header: 'Facilities',
                render: (r) => (r.facilities && r.facilities.length ? r.facilities.join(', ') : '—'),
              },
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
        <Modal title={editing ? `Edit ${editing.room_code}` : 'New Classroom'} onClose={() => setShowModal(false)}>
          <form onSubmit={handleSubmit}>
            <div className="form-grid">
              <Field label="Room code" required>
                <input className="input" required value={form.roomCode} onChange={(e) => set('roomCode', e.target.value.toUpperCase())} />
              </Field>
              <Field label="Name">
                <input className="input" value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Optional" />
              </Field>
              <Field label="Building">
                <select className="select" value={form.building} onChange={(e) => set('building', e.target.value)}>
                  {BUILDINGS.map((b) => (
                    <option key={b}>{b}</option>
                  ))}
                </select>
              </Field>
              <Field label="Floor">
                <input className="input" type="number" min={0} value={form.floor} onChange={(e) => set('floor', Number(e.target.value))} />
              </Field>
              <Field label="Capacity" required>
                <input className="input" type="number" min={1} required value={form.capacity} onChange={(e) => set('capacity', Number(e.target.value))} />
              </Field>
              <Field label="Room type">
                <select className="select" value={form.roomType} onChange={(e) => set('roomType', e.target.value)}>
                  {ROOM_TYPES.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </Field>
              <Field label="Status">
                <select className="select" value={form.status} onChange={(e) => set('status', e.target.value)}>
                  {STATUSES.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </Field>
              <Field label="Accessibility">
                <select className="select" value={form.accessibility} onChange={(e) => set('accessibility', e.target.value)}>
                  <option>None</option>
                  <option>Wheelchair</option>
                </select>
              </Field>
              <Field label="Facilities">
                <select className="select" multiple value={form.facilities} onChange={(e) => set('facilities', Array.from(e.target.selectedOptions).map((o) => o.value))}>
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
