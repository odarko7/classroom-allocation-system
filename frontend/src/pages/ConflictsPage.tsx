import { useMemo, useState } from 'react';
import { api } from '../api/client';
import { useAsync } from '../api/useAsync';
import type { Conflict, Semester } from '../api/types';
import { Badge, ErrorBanner, SeverityBadge, Spinner, Table } from '../components/Shared';

export default function ConflictsPage() {
  const [semester, setSemester] = useState('');
  const query = useMemo(() => (semester ? `?semester=${semester}` : ''), [semester]);

  const { data, loading, error } = useAsync<Conflict[]>(() => api.get(`/conflicts${query}`), [query]);
  const semesters = useAsync<Semester[]>(() => api.get('/semesters'));

  const resolved = (data ?? []).filter((c) => c.resolved);
  const unresolved = (data ?? []).filter((c) => !c.resolved);

  return (
    <div>
      <h1 className="page-title">Conflicts</h1>
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
          <span className="text-muted">
            {unresolved.length} unresolved · {resolved.length} resolved
          </span>
        </div>
      </div>

      {loading ? (
        <Spinner />
      ) : (
        <>
          <h3>Unresolved</h3>
          <Table<Conflict>
            columns={[
              { key: 'id', header: '#', render: (r) => <span className="mono">#{r.id}</span> },
              { key: 'allocation_id', header: 'Allocation', render: (r) => <span className="mono">#{r.allocation_id}</span> },
              { key: 'conflict_type', header: 'Type', render: (r) => <Badge tone="danger">{r.conflict_type.replace(/_/g, ' ')}</Badge> },
              { key: 'description', header: 'Description' },
              { key: 'severity', header: 'Severity', render: (r) => <SeverityBadge severity={r.severity} /> },
            ]}
            rows={unresolved}
            empty="No unresolved conflicts."
          />

          <h3 className="mt-16">Resolved</h3>
          <Table<Conflict>
            columns={[
              { key: 'id', header: '#', render: (r) => <span className="mono">#{r.id}</span> },
              { key: 'allocation_id', header: 'Allocation', render: (r) => <span className="mono">#{r.allocation_id}</span> },
              { key: 'conflict_type', header: 'Type' },
              { key: 'description', header: 'Description' },
              { key: 'severity', header: 'Severity', render: (r) => <SeverityBadge severity={r.severity} /> },
            ]}
            rows={resolved}
            empty="No resolved conflicts."
          />
        </>
      )}
    </div>
  );
}
