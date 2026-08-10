import { useState } from 'react';
import { api } from '../api/client';
import { useAsync } from '../api/useAsync';
import type { AuditLogRow } from '../api/types';
import { Badge, ErrorBanner, Pagination, Spinner, Table } from '../components/Shared';

interface AuditResponse {
  rows: AuditLogRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export default function AuditLogsPage() {
  const [page, setPage] = useState(1);
  const { data, loading, error } = useAsync<AuditResponse>(() => api.get(`/audit-logs?page=${page}&pageSize=30`), [page]);

  if (loading) return <Spinner />;

  return (
    <div>
      <h1 className="page-title">Audit Logs</h1>
      <ErrorBanner message={error} />
      <Table<AuditLogRow>
        columns={[
          { key: 'id', header: '#', render: (r) => <span className="mono">#{r.id}</span> },
          { key: 'created_at', header: 'Timestamp' },
          { key: 'username', header: 'User', render: (r) => r.username ?? '—' },
          { key: 'action', header: 'Action', render: (r) => <Badge tone="info">{r.action.replace(/_/g, ' ')}</Badge> },
          { key: 'entity_type', header: 'Entity', render: (r) => r.entity_type ?? '—' },
          { key: 'entity_id', header: 'Entity ID', render: (r) => (r.entity_id ? `#${r.entity_id}` : '—') },
        ]}
        rows={data?.rows ?? []}
      />
      <Pagination page={data?.page ?? 1} totalPages={data?.totalPages ?? 1} onChange={setPage} />
    </div>
  );
}
