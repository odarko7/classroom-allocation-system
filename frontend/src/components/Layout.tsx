import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import type { Role } from '../api/types';

const NAV_ITEMS: { to: string; label: string; end?: boolean; roles?: Role[] }[] = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/classrooms', label: 'Classrooms' },
  { to: '/courses', label: 'Courses' },
  { to: '/lecturers', label: 'Lecturers' },
  { to: '/groups', label: 'Groups' },
  { to: '/allocations', label: 'Allocations' },
  { to: '/conflicts', label: 'Conflicts' },
  { to: '/timetable', label: 'Timetable' },
  { to: '/analytics', label: 'Analytics' },
  { to: '/reports', label: 'Reports' },
  { to: '/users', label: 'Users', roles: ['SUPER_ADMIN', 'ADMIN'] },
  { to: '/audit', label: 'Audit Logs', roles: ['SUPER_ADMIN', 'ADMIN'] },
];

export function Layout() {
  const { user, logout, hasRole } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">CA</span>
          <div>
            <strong>Classroom</strong>
            <span>Allocation System</span>
          </div>
        </div>
        <nav className="nav">
          {NAV_ITEMS.filter((item) => !item.roles || hasRole(...item.roles)).map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}>
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <div className="main">
        <header className="topbar">
          <div className="topbar-title">Optimal Classroom Allocation</div>
          <div className="user-box">
            <div className="user-info">
              <span className="user-name">{user?.name}</span>
              <span className="user-role">{user?.role.replace('_', ' ')}</span>
            </div>
            <button className="btn btn-ghost" onClick={handleLogout}>
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
