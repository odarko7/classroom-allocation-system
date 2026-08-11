import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import { useAsync } from '../api/useAsync';
import { useAutoRefresh } from '../api/useAutoRefresh';
import type { Classroom, Department, Paginated, Semester, StudentGroup, TimetableCell } from '../api/types';
import { ErrorBanner, Modal, Spinner, SuccessBanner } from '../components/Shared';
import { useAuth } from '../auth/AuthContext';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export default function TimetablePage() {
  const { hasRole } = useAuth();
  const canCreate = hasRole('SUPER_ADMIN', 'ADMIN', 'HOD');

  const [searchParams, setSearchParams] = useSearchParams();
  const [semester, setSemester] = useState(searchParams.get('semester') ?? '');
  const [classroom, setClassroom] = useState(searchParams.get('classroom') ?? '');
  const [department, setDepartment] = useState(searchParams.get('department') ?? '');
  const [group, setGroup] = useState(searchParams.get('group') ?? '');

  useEffect(() => {
    const next = new URLSearchParams();
    if (semester) next.set('semester', semester);
    if (classroom) next.set('classroom', classroom);
    if (department) next.set('department', department);
    if (group) next.set('group', group);
    const q = next.toString();
    setSearchParams(q ? `?${q}` : '', { replace: true });
  }, [semester, classroom, department, group, setSearchParams]);

  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (semester) params.set('semester', semester);
    if (classroom) params.set('classroom', classroom);
    if (department) params.set('department', department);
    if (group) params.set('group', group);
    return params.toString();
  }, [semester, classroom, department, group]);

  const { data, loading, error, reload } = useAsync<{ rows: TimetableCell[] }>(() => api.get(`/timetable?${query}`), [query]);
  const semesters = useAsync<Semester[]>(() => api.get('/semesters'));
  const classrooms = useAsync<Paginated<Classroom>>(() => api.get('/classrooms?pageSize=200'));
  const departments = useAsync<Department[]>(() => api.get('/departments'));
  const groups = useAsync<StudentGroup[]>(() => api.get('/student-groups'));

  const rows = data?.rows ?? [];
  const [startTimes, setStartTimes] = useState<string[]>([]);

  useAutoRefresh(reload, 15000);

  const [message, setMessage] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [optimizing, setOptimizing] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const groupsForSemester = useMemo(() => {
    const all = groups.data ?? [];
    if (!semester) return all;
    return all.filter((g) => g.semester_id === Number(semester));
  }, [groups.data, semester]);

  useEffect(() => {
    if (semester && group && !groupsForSemester.some((g) => g.id === Number(group))) {
      setGroup('');
    }
  }, [groupsForSemester, semester, group]);

  useEffect(() => {
    const times = [...new Set(rows.map((r) => r.startTime))].sort();
    setStartTimes(times);
  }, [rows]);

  const semesterLabel = semesters.data?.find((s) => s.id === Number(semester))?.name ?? '';
  const groupLabel = groups.data?.find((g) => g.id === Number(group))?.name ?? '';

  const runOptimization = async () => {
    if (!semester) {
      setErrorMsg('Select a semester first to generate the timetable.');
      return;
    }
    if (!window.confirm('Generate timetable for this semester? This will propose new allocations.')) return;
    setOptimizing(true);
    setErrorMsg(null);
    setMessage(null);
    try {
      const result = await api.post<{ message: string; proposed: number; approved: number }>('/allocations/optimize', {
        semesterId: Number(semester),
      });
      setMessage(`${result.message} — ${result.proposed} proposed, ${result.approved} approved.`);
      reload();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Generation failed.');
    } finally {
      setOptimizing(false);
    }
  };

  const downloadCsv = () => {
    const header = ['Day', 'Start', 'End', 'Course Code', 'Course Name', 'Group', 'Room', 'Lecturer', 'Status'];
    const lines = rows.map((r) => [
      DAYS[r.day],
      r.startTime,
      r.endTime,
      r.courseCode,
      r.courseName,
      r.groupName,
      r.roomCode,
      r.lecturerName ?? '',
      r.status,
    ]);
    const csv = [header, ...lines]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `timetable${semesterLabel ? `-${semesterLabel.replace(/\s+/g, '-').toLowerCase()}` : ''}${groupLabel ? `-${groupLabel.replace(/\s+/g, '-').toLowerCase()}` : ''}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const printTimetable = () => window.print();

  const shareUrl = window.location.href;
  const shareTitle = `Timetable${semesterLabel ? ` - ${semesterLabel}` : ''}${groupLabel ? ` - ${groupLabel}` : ''}`;
  const waLink = `https://wa.me/?text=${encodeURIComponent(`${shareTitle}\n${shareUrl}`)}`;
  const mailLink = `mailto:?subject=${encodeURIComponent(shareTitle)}&body=${encodeURIComponent(`${shareTitle}\n${shareUrl}`)}`;

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setErrorMsg('Could not copy the link automatically. Select it and copy manually.');
    }
  };

  const nativeShare = () => {
    if (!navigator.share) return;
    navigator
      .share({ title: shareTitle, text: shareTitle, url: shareUrl })
      .catch(() => undefined);
  };

  const cellsByDayStart = new Map<string, Map<number, TimetableCell[]>>();
  for (const r of rows) {
    if (!cellsByDayStart.has(r.startTime)) cellsByDayStart.set(r.startTime, new Map());
    if (!cellsByDayStart.get(r.startTime)!.has(r.day)) cellsByDayStart.get(r.startTime)!.set(r.day, []);
    cellsByDayStart.get(r.startTime)!.get(r.day)!.push(r);
  }

  if (loading) return <Spinner />;

  return (
    <div>
      <div className="flex-between">
        <h1 className="page-title">Timetable</h1>
        <div className="toolbar tt-actions">
          {canCreate && (
            <button className="btn btn-primary" onClick={runOptimization} disabled={optimizing}>
              {optimizing ? 'Generating...' : 'Generate Timetable'}
            </button>
          )}
          <button className="btn" onClick={downloadCsv} disabled={rows.length === 0}>
            Download CSV
          </button>
          <button className="btn" onClick={printTimetable} disabled={rows.length === 0}>
            Print / PDF
          </button>
          <button className="btn btn-ghost" onClick={() => setShareOpen(true)} disabled={rows.length === 0}>
            Share
          </button>
        </div>
      </div>
      <ErrorBanner message={errorMsg ?? error} />
      <SuccessBanner message={message} />

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
          <select className="select" value={group} onChange={(e) => setGroup(e.target.value)}>
            <option value="">All student groups</option>
            {groupsForSemester.map((g) => (
              <option key={g.id} value={g.id}>
                {g.course_code} · {g.name}
              </option>
            ))}
          </select>
          <select className="select" value={classroom} onChange={(e) => setClassroom(e.target.value)}>
            <option value="">All classrooms</option>
            {(classrooms.data?.rows ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.room_code}
              </option>
            ))}
          </select>
          <select className="select" value={department} onChange={(e) => setDepartment(e.target.value)}>
            <option value="">All departments</option>
            {departments.data?.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="timetable-print">
        <div className="tt-print-header print-only">
          <h2>{shareTitle}</h2>
          {rows.length > 0 && <p>{rows.length} session{rows.length === 1 ? '' : 's'} scheduled</p>}
        </div>

        {startTimes.length === 0 ? (
          <div className="empty">No allocations match the current filters.</div>
        ) : (
          <div className="tt-grid-wrap">
            <div className="tt-grid">
              <div className="tt-head">Time</div>
              {DAYS.map((d) => (
                <div className="tt-head" key={d}>
                  {d}
                </div>
              ))}
              {startTimes.map((time) => (
                <div style={{ display: 'contents' }} key={time}>
                  <div className="tt-time">{time}</div>
                  {DAYS.map((_, dayIdx) => {
                    const cells = cellsByDayStart.get(time)?.get(dayIdx) ?? [];
                    return (
                      <div className="tt-cell" key={dayIdx}>
                        {cells.map((c) => (
                          <div className="tt-entry" key={c.allocationId}>
                            <div className="course">
                              {c.courseCode} · {c.groupName}
                            </div>
                            <div className="meta">
                              {c.roomCode}
                              {c.lecturerName ? ` · ${c.lecturerName}` : ''}
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {shareOpen && (
        <Modal title="Share timetable" onClose={() => setShareOpen(false)}>
          <p className="share-note">Anyone with this link can view this timetable.</p>
          <div className="share-row">
            <input className="input" readOnly value={shareUrl} onFocus={(e) => e.currentTarget.select()} />
            <button className="btn btn-primary" onClick={copyLink}>
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
          <div className="share-actions">
            <a className="btn" href={waLink} target="_blank" rel="noreferrer">
              WhatsApp
            </a>
            <a className="btn" href={mailLink}>
              Email
            </a>
            {typeof navigator.share === 'function' && (
              <button className="btn" onClick={nativeShare}>
                More...
              </button>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
