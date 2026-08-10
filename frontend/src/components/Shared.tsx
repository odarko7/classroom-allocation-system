import { useEffect, useState, type ReactNode } from 'react';

export function Spinner({ label = 'Loading...' }: { label?: string }) {
  return (
    <div className="spinner-wrap">
      <span className="spinner" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}

export function ErrorBanner({ message }: { message: string | null }) {
  if (!message) return null;
  return <div className="banner error">{message}</div>;
}

export function SuccessBanner({ message }: { message: string | null }) {
  if (!message) return null;
  return <div className="banner success">{message}</div>;
}

export function Badge({ children, tone = 'default' }: { children: ReactNode; tone?: 'default' | 'success' | 'warning' | 'danger' | 'info' }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

export function StatusBadge({ status }: { status: string }) {
  const tone =
    status === 'APPROVED' || status === 'ACTIVE'
      ? 'success'
      : status === 'REJECTED' || status === 'INACTIVE' || status === 'MAINTENANCE'
        ? 'danger'
        : status === 'PROPOSED' || status === 'PLANNING'
          ? 'warning'
          : 'info';
  return <Badge tone={tone as never}>{status.replace('_', ' ')}</Badge>;
}

export function SeverityBadge({ severity }: { severity: string }) {
  const tone = severity === 'HIGH' ? 'danger' : severity === 'MEDIUM' ? 'warning' : 'info';
  return <Badge tone={tone as never}>{severity}</Badge>;
}

export function Pagination({ page, totalPages, onChange }: { page: number; totalPages: number; onChange: (p: number) => void }) {
  if (totalPages <= 1) return null;
  return (
    <div className="pagination">
      <button disabled={page <= 1} onClick={() => onChange(page - 1)}>
        Prev
      </button>
      <span>
        Page {page} of {totalPages}
      </span>
      <button disabled={page >= totalPages} onClick={() => onChange(page + 1)}>
        Next
      </button>
    </div>
  );
}

export function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{title}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            &times;
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

export function Field({ label, children, required }: { label: string; children: ReactNode; required?: boolean }) {
  return (
    <label className="field">
      <span className="field-label">
        {label}
        {required && <span className="required"> *</span>}
      </span>
      {children}
    </label>
  );
}

export function Table<T extends { id: number }>({
  columns,
  rows,
  empty = 'No records found.',
  actions,
}: {
  columns: { key: string; header: string; render?: (row: T) => ReactNode }[];
  rows: T[];
  empty?: string;
  actions?: (row: T) => ReactNode;
}) {
  if (!rows.length) {
    return (
      <div className="empty">
        <svg className="empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M8 2v4 M16 2v4 M3 10h18 M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" />
          <path d="M9 16l2 2 4-4" />
        </svg>
        <div>{empty}</div>
      </div>
    );
  }
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key}>{c.header}</th>
            ))}
            {actions && <th className="actions-col">Actions</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              {columns.map((c) => (
                <td key={c.key}>{c.render ? c.render(row) : String((row as Record<string, unknown>)[c.key] ?? '')}</td>
              ))}
              {actions && <td className="actions-col">{actions(row)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function formatUtilization(value: number): string {
  return `${value.toFixed(1)}%`;
}

export function ProgressBar({ value }: { value: number }) {
  const clamped = Math.max(0, Math.min(100, value));
  const tone = clamped < 40 ? 'ok' : clamped < 75 ? 'mid' : 'high';
  return (
    <div className="progress">
      <div className={`progress-fill ${tone}`} style={{ width: `${clamped}%` }} />
    </div>
  );
}

export function useDebouncedValue<T>(value: T, delay = 400): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}
