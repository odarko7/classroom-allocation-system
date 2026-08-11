import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

type Mode = 'login' | 'register';

const DEMO_ACCOUNTS = [{ label: 'Admin', email: 'admin@example.com', password: 'Admin@123' }];

const FEATURES = [
  { title: 'Smart allocation', desc: 'Auto-assign rooms by capacity, facilities & time' },
  { title: 'Conflict detection', desc: 'Spot scheduling clashes before they happen' },
  { title: 'Live analytics', desc: 'Utilization and demand at a glance' },
];

export default function LoginPage() {
  const { login, register } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [emailReadOnly, setEmailReadOnly] = useState(true);
  const [passwordReadOnly, setPasswordReadOnly] = useState(true);

  const switchMode = (next: Mode) => {
    setMode(next);
    setError(null);
    setPassword('');
    setConfirm('');
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (mode === 'register' && password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setLoading(true);
    try {
      if (mode === 'register') {
        await register(name.trim(), email, password);
      } else {
        await login(email, password);
      }
      navigate('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  };

  const fillDemo = () => {
    setError(null);
    setEmail(DEMO_ACCOUNTS[0].email);
    setPassword(DEMO_ACCOUNTS[0].password);
  };

  return (
    <div className="login-page">
      <div className="login-shell">
        <aside className="login-brand">
          <div className="login-brand-top">
            <span className="brand-mark login-brand-mark">CA</span>
            <div className="login-brand-name">
              <strong>Classroom</strong>
              <span>Allocation System</span>
            </div>
          </div>
          <div className="login-brand-content">
            <h1>Schedule smarter, not harder.</h1>
            <p>Automate room allocation, eliminate clashes, and keep every lecture on track.</p>
            <ul className="login-features">
              {FEATURES.map((f) => (
                <li key={f.title}>
                  <span className="login-feature-check">✓</span>
                  <div>
                    <strong>{f.title}</strong>
                    <span>{f.desc}</span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
          <p className="login-brand-footer">© 2026 Classroom Allocation System</p>
        </aside>

        <div className="login-panel">
          <div className="login-logo">CA</div>
          <form className="login-card" onSubmit={handleSubmit} autoComplete="off">
            <div className="auth-tabs" role="tablist">
              <button
                type="button"
                role="tab"
                className={`auth-tab${mode === 'login' ? ' active' : ''}`}
                onClick={() => switchMode('login')}
                disabled={loading}
              >
                Sign in
              </button>
              <button
                type="button"
                role="tab"
                className={`auth-tab${mode === 'register' ? ' active' : ''}`}
                onClick={() => switchMode('register')}
                disabled={loading}
              >
                Create account
              </button>
            </div>

            <div className="login-card-head">
              {mode === 'login' ? (
                <>
                  <h2>Welcome back</h2>
                  <p className="login-sub">Sign in to continue to your dashboard.</p>
                </>
              ) : (
                <>
                  <h2>Create your account</h2>
                  <p className="login-sub">Join to view and share timetables.</p>
                </>
              )}
            </div>

            {error && <div className="banner error">{error}</div>}

            {mode === 'register' && (
              <label className="field">
                <span className="field-label">Full name</span>
                <div className="input-wrap">
                  <svg className="input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                  </svg>
                  <input
                    className="input input-iconed"
                    type="text"
                    required
                    autoComplete="name"
                    name="name"
                    placeholder="Enter your full name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
              </label>
            )}

            <label className="field">
              <span className="field-label">Email</span>
              <div className="input-wrap">
                <svg className="input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                  <path d="M22 6l-10 7L2 6" />
                </svg>
                <input
                  className="input input-iconed"
                  type="email"
                  required
                  autoComplete="email"
                  name="email"
                  placeholder="Enter your email"
                  value={email}
                  readOnly={emailReadOnly}
                  onFocus={() => setEmailReadOnly(false)}
                  onMouseDown={() => setEmailReadOnly(false)}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </label>

            <label className="field">
              <span className="field-label">Password</span>
              <div className="input-wrap">
                <svg className="input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
                <input
                  className="input input-iconed input-with-toggle"
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  name="password"
                  placeholder="Enter your password"
                  value={password}
                  readOnly={passwordReadOnly}
                  onFocus={() => setPasswordReadOnly(false)}
                  onMouseDown={() => setPasswordReadOnly(false)}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button type="button" className="input-toggle" onClick={() => setShowPassword((v) => !v)} aria-label={showPassword ? 'Hide password' : 'Show password'}>
                  {showPassword ? (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                      <path d="M1 1l22 22" />
                    </svg>
                  ) : (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>
            </label>

            {mode === 'register' && (
              <label className="field">
                <span className="field-label">Confirm password</span>
                <div className="input-wrap">
                  <svg className="input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                  <input
                    className="input input-iconed input-with-toggle"
                    type={showPassword ? 'text' : 'password'}
                    required
                    autoComplete="new-password"
                    name="confirm"
                    placeholder="Re-enter your password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                  />
                </div>
              </label>
            )}

            <button className="btn btn-primary btn-login" type="submit" disabled={loading}>
              {loading && <span className="spinner spinner-btn" aria-hidden="true" />}
              {loading ? (mode === 'login' ? 'Signing in…' : 'Creating account…') : mode === 'login' ? 'Sign in' : 'Create account'}
            </button>

            {mode === 'register' ? (
              <p className="auth-hint">New accounts are created with viewer access. Contact an admin to upgrade your role.</p>
            ) : (
              <div className="login-demo">
                <span className="login-demo-label">Quick demo access</span>
                <div className="login-demo-chips">
                  <button type="button" className="demo-chip" onClick={fillDemo} disabled={loading}>
                    {DEMO_ACCOUNTS[0].label}
                  </button>
                </div>
              </div>
            )}
          </form>
        </div>
      </div>
    </div>
  );
}
