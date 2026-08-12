import { useEffect } from 'react';
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { setUnauthorizedHandler } from './api/client';
import { Layout } from './components/Layout';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import ClassroomsPage from './pages/ClassroomsPage';
import CoursesPage from './pages/CoursesPage';
import LecturersPage from './pages/LecturersPage';
import AllocationsPage from './pages/AllocationsPage';
import ConflictsPage from './pages/ConflictsPage';
import AnalyticsPage from './pages/AnalyticsPage';
import ReportsPage from './pages/ReportsPage';
import UsersPage from './pages/UsersPage';
import AuditLogsPage from './pages/AuditLogsPage';
import NotFoundPage from './pages/NotFoundPage';

function RequireAuth({ children }: { children: React.ReactNode }) {
  const token = localStorage.getItem('ca_token');
  if (!token) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  const navigate = useNavigate();

  useEffect(() => {
    setUnauthorizedHandler(() => {
      localStorage.removeItem('ca_token');
      localStorage.removeItem('ca_user');
      navigate('/login');
    });
  }, [navigate]);

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="/classrooms" element={<ClassroomsPage />} />
        <Route path="/courses" element={<CoursesPage />} />
        <Route path="/lecturers" element={<LecturersPage />} />
        <Route path="/allocations" element={<AllocationsPage />} />
        <Route path="/conflicts" element={<ConflictsPage />} />
        <Route path="/analytics" element={<AnalyticsPage />} />
        <Route path="/reports" element={<ReportsPage />} />
        <Route path="/users" element={<UsersPage />} />
        <Route path="/audit" element={<AuditLogsPage />} />
      </Route>
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
