import { useMemo, useState } from 'react';
import { jsPDF } from 'jspdf';
import { autoTable } from 'jspdf-autotable';
import { api } from '../api/client';
import { useAsync } from '../api/useAsync';
import { useAutoRefresh } from '../api/useAutoRefresh';
import type { Semester, TimetableAllocation, TimetableResponse } from '../api/types';
import { ErrorBanner, Spinner } from '../components/Shared';

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const WEEK_DAYS = [0, 1, 2, 3, 4];

interface Period {
  start: string;
  end: string;
  label: string;
}

interface Grid {
  periods: Period[];
  cells: TimetableAllocation[][][];
}

function buildGrid(data: TimetableResponse): Grid {
  const periods: Period[] = [];
  const seen = new Set<string>();
  for (const t of data.timeSlots) {
    const key = `${t.start_time}|${t.end_time}`;
    if (seen.has(key)) continue;
    seen.add(key);
    periods.push({
      start: t.start_time,
      end: t.end_time,
      label: t.period_name ?? `${t.start_time} - ${t.end_time}`,
    });
  }
  periods.sort((a, b) => a.start.localeCompare(b.start));
  const cells: TimetableAllocation[][][] = periods.map(() => WEEK_DAYS.map(() => [] as TimetableAllocation[]));
  for (const a of data.allocations) {
    const day = WEEK_DAYS.indexOf(a.slot_day);
    const pIdx = periods.findIndex((p) => p.start === a.slot_start && p.end === a.slot_end);
    if (day === -1 || pIdx === -1) continue;
    cells[pIdx][day].push(a);
  }
  return { periods, cells };
}

function entryText(a: TimetableAllocation): string {
  const lines = [`${a.course_code} - ${a.course_name}`, `${a.room_code}${a.lecturer_name ? ` | ${a.lecturer_name}` : ''}`];
  return lines.join('\n');
}

export default function TimetablePage() {
  const [semester, setSemester] = useState('');
  const semesters = useAsync<Semester[]>(() => api.get('/semesters'));
  const query = semester ? `?semester=${semester}` : '';
  const { data, loading, error, reload } = useAsync<TimetableResponse>(() => api.get(`/timetable${query}`), [query]);

  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  useAutoRefresh(reload, 20000);

  const grid = useMemo(() => (data ? buildGrid(data) : { periods: [] as Period[], cells: [] as TimetableAllocation[][][] }), [data]);

  const handleDownloadPdf = async () => {
    if (!data || !data.allocations.length) {
      setDownloadError('No allocations to export.');
      return;
    }
    setDownloading(true);
    setDownloadError(null);
    try {
      const g = buildGrid(data);
      const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(16);
      doc.text('Class Timetable', 40, 42);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.text(`${data.semester.name} · Monday to Friday`, 40, 58);
      doc.text(`Generated: ${new Date().toLocaleString()}`, 40, 70);

      autoTable(doc, {
        startY: 84,
        head: [['Period', ...DAY_NAMES.slice(0, 5)]],
        body: g.periods.map((p, pIdx) => [
          `${p.label}\n${p.start} - ${p.end}`,
          ...WEEK_DAYS.map((d) => g.cells[pIdx][d].map(entryText).join('\n\n')),
        ]),
        styles: { fontSize: 8, cellPadding: 4, valign: 'top' },
        headStyles: { fillColor: [63, 81, 181], textColor: 255, fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [245, 246, 250] },
        didDrawPage: (tableData) => {
          doc.setFontSize(8);
          doc.setTextColor(120);
          doc.text(`Page ${tableData.pageNumber}`, doc.internal.pageSize.getWidth() - 40, doc.internal.pageSize.getHeight() - 20);
        },
      });

      doc.save(`class-timetable-${data.semester.name.replace(/\s+/g, '-').toLowerCase()}.pdf`);
    } catch (err) {
      setDownloadError(err instanceof Error ? err.message : 'Could not generate the PDF.');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div>
      <div className="flex-between">
        <h1 className="page-title">Class Timetable</h1>
        <div className="flex gap-8">
          <button className="btn" onClick={handleDownloadPdf} disabled={downloading}>
            {downloading ? 'Generating PDF...' : 'Download PDF'}
          </button>
          <select className="select" value={semester} onChange={(e) => setSemester(e.target.value)}>
            <option value="">Active semester</option>
            {semesters.data?.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.status})
              </option>
            ))}
          </select>
        </div>
      </div>
      <ErrorBanner message={downloadError ?? error} />

      {loading ? (
        <Spinner />
      ) : data ? (
        <>
          <p className="text-muted">
            {data.semester.name} · {data.allocations.length} approved allocation{data.allocations.length === 1 ? '' : 's'} · Monday to Friday
          </p>
          <div className="table-wrap">
            <table className="table timetable-table">
              <thead>
                <tr>
                  <th className="timetable-time-col">Period</th>
                  {WEEK_DAYS.map((d) => (
                    <th key={d}>{DAY_NAMES[d]}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {grid.periods.map((p, pIdx) => (
                  <tr key={`${p.start}-${p.end}`}>
                    <td className="timetable-time-cell">
                      <strong>{p.label}</strong>
                      <span>
                        {p.start} - {p.end}
                      </span>
                    </td>
                    {WEEK_DAYS.map((d) => {
                      const entries = grid.cells[pIdx][d];
                      return (
                        <td key={d} className="timetable-cell">
                          {entries.length === 0 ? (
                            <span className="timetable-empty">—</span>
                          ) : (
                            entries.map((a) => (
                              <div key={a.id} className="timetable-entry">
                                <strong>
                                  {a.course_code} — {a.course_name}
                                </strong>
                                <span className="timetable-room">{a.room_code}</span>
                                {a.lecturer_name && <span>{a.lecturer_name}</span>}
                                <span className="text-muted">
                                  {a.group_name}
                                </span>
                              </div>
                            ))
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </div>
  );
}
