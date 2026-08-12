import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { toggleTheme } from '../theme';
import type { Role } from '../api/types';

function NavIcon({ d }: { d: string }) {
  return (
    <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

const NAV_ITEMS: { to: string; label: string; icon: string; end?: boolean; roles?: Role[] }[] = [
  { to: '/', label: 'Dashboard', icon: 'M3 12l9-9 9 9 M5 10v10a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V10', end: true },
  { to: '/classrooms', label: 'Classrooms', icon: 'M3 21h18 M5 21V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16 M9 7h2 M9 11h2 M9 15h2 M15 9h.01 M15 13h.01 M15 17h.01' },
  { to: '/courses', label: 'Courses', icon: 'M4 19.5A2.5 2.5 0 0 1 6.5 17H20 M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z' },
  { to: '/lecturers', label: 'Lecturers', icon: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M23 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75' },
  { to: '/allocations', label: 'Allocations', icon: 'M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z' },
  { to: '/conflicts', label: 'Conflicts', icon: 'M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z M12 9v4 M12 17h.01' },
  { to: '/analytics', label: 'Analytics', icon: 'M3 3v18h18 M7 15l4-5 3 3 5-6' },
  { to: '/reports', label: 'Reports', icon: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M16 13H8 M16 17H8 M10 9H8' },
  { to: '/users', label: 'Users', icon: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M23 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75', roles: ['SUPER_ADMIN', 'ADMIN'] },
  { to: '/audit', label: 'Audit Logs', icon: 'M12 8v4l3 3 M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z', roles: ['SUPER_ADMIN', 'ADMIN'] },
];

const VIEWER_ALLOWED = ['/', '/allocations'];

export function Layout() {
  const { user, logout, hasRole } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const current = NAV_ITEMS.find((item) => (item.end ? location.pathname === item.to : location.pathname.startsWith(item.to)));

  useEffect(() => {
    if (user?.role === 'VIEWER' && location.pathname !== '/' && !VIEWER_ALLOWED.some((p) => (p === '/' ? false : location.pathname.startsWith(p)))) {
      navigate('/', { replace: true });
    }
  }, [user, location.pathname, navigate]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="layout">
      <aside className={`sidebar${sidebarOpen ? ' sidebar-open' : ''}`}>
        <div className="brand">
          <span className="brand-mark">CA</span>
          <div>
            <strong>Classroom</strong>
            <span>Allocation System</span>
          </div>
        </div>
        <nav className="nav">
          {NAV_ITEMS.filter((item) => {
            if (item.roles && !hasRole(...item.roles)) return false;
            if (user?.role === 'VIEWER' && !VIEWER_ALLOWED.includes(item.to)) return false;
            return true;
          }).map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')} onClick={() => setSidebarOpen(false)}>
              <NavIcon d={item.icon} />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>
      </aside>
      {sidebarOpen && <div className="sidebar-backdrop" onClick={() => setSidebarOpen(false)} aria-hidden="true" />}
      <div className="main">
        <header className="topbar">
          <div className="topbar-left">
            <button className="hamburger" onClick={() => setSidebarOpen((v) => !v)} aria-label="Toggle menu">
              <span />
              <span />
              <span />
            </button>
            <div className="topbar-title">{current?.label ?? 'Dashboard'}</div>
          </div>
          <div className="user-box">
            <div className="user-info">
              <span className="user-name">{user?.name}</span>
              <span className="user-role">{user?.role.replace('_', ' ')}</span>
            </div>
            <span className="avatar" title={user?.name}>{user?.name?.trim().charAt(0).toUpperCase() ?? 'U'}</span>
            <button className="theme-toggle" onClick={() => toggleTheme()} aria-label="Toggle dark mode" title="Toggle dark mode">
              <svg className="theme-icon theme-icon-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
              </svg>
              <svg className="theme-icon theme-icon-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="4" />
                <path d="M12 2v2 M12 20v2 M4.93 4.93l1.41 1.41 M17.66 17.66l1.41 1.41 M2 12h2 M20 12h2 M4.93 19.07l1.41-1.41 M17.66 6.34l1.41-1.41" />
              </svg>
            </button>
            <button className="btn btn-ghost logout-btn" onClick={handleLogout}>
              Logout
            </button>
          </div>
        </header>
        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
