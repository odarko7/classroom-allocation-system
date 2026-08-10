import { useState } from 'react';
import { api, downloadCsv } from '../api/client';
import { useAsync } from '../api/useAsync';
import type { ReportInfo, Semester } from '../api/types';
import { Badge, ErrorBanner, Spinner } from '../components/Shared';

const REPORT_LABELS: Record<string, string> = {
  'classroom-utilization': 'Classroom Utilization',
  allocations: 'Allocations',
  conflicts: 'Conflicts',
  departments: 'Departments',
  'lecturer-timetable': 'Lecturer Timetable',
  'course-timetable': 'Course Timetable',
  'underutilized-rooms': 'Underutilized Rooms',
  'overutilized-rooms': 'Overutilized Rooms',
  optimization: 'Optimization Summary',
};

export default function ReportsPage() {
  const [semester, setSemester] = useState('');
  const query = semester ? `?semester=${semester}` : '';

  const names = useAsync<string[]>(() => api.get('/reports'));
  const semesters = useAsync<Semester[]>(() => api.get('/semesters'));
  const [preview, setPreview] = useState<ReportInfo | null>(null);
  const [previewName, setPreviewName] = useState('');
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const previewReport = async (name: string) => {
    setLoadingPreview(true);
    setError(null);
    try {
      const result = await api.get<ReportInfo>(`/reports/${name}/preview${query}`);
      setPreview(result);
      setPreviewName(name);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load preview.');
    } finally {
      setLoadingPreview(false);
    }
  };

  const download = (name: string) => {
    downloadCsv(`/reports/${name}${query}`).catch((err) => setError(err instanceof Error ? err.message : 'Download failed.'));
  };

  return (
    <div>
      <h1 className="page-title">Reports</h1>
      <ErrorBanner message={error} />

      <div className="card mb-16">
        <div className="filters">
          <select className="select" value={semester} onChange={(e) => setSemester(e.target.value)}>
            <option value="">Latest semester</option>
            {semesters.data?.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {names.loading ? (
        <Spinner />
      ) : (
        <div className="grid grid-3">
          {(names.data ?? []).map((name) => (
            <div className="card" key={name}>
              <div className="flex-between mb-16">
                <strong>{REPORT_LABELS[name] ?? name}</strong>
                <Badge tone="info">{name}</Badge>
              </div>
              <div className="flex gap-8">
                <button className="btn btn-sm" onClick={() => previewReport(name)}>
                  Preview
                </button>
                <button className="btn btn-sm btn-primary" onClick={() => download(name)}>
                  Download CSV
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {loadingPreview && <Spinner />}

      {preview && !loadingPreview && (
        <div className="card mt-16">
          <div className="card-header">
            <h3>
              Preview: {REPORT_LABELS[previewName] ?? previewName}
              <span className="text-muted"> ({preview.rowCount} rows)</span>
            </h3>
            <button className="btn btn-sm" onClick={() => setPreview(null)}>
              Close
            </button>
          </div>
          {preview.preview.length === 0 ? (
            <div className="empty">No data.</div>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    {preview.headers.map((h, i) => (
                      <th key={i}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.preview.map((row, i) => (
                    <tr key={i}>
                      {preview.headers.map((_, j) => (
                        <td key={j}>{String(row[j] ?? '')}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
