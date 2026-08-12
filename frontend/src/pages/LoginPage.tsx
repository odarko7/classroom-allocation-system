import { useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

type Mode = 'login' | 'register' | 'forgot';
type ResetStep = 'request' | 'reset';

const DEMO_ACCOUNTS = [{ label: 'Admin', email: 'admin@example.com', password: 'Admin@123' }];

const FEATURES = [
  { title: 'Smart allocation', desc: 'Auto-assign rooms by capacity, facilities & time' },
  { title: 'Conflict detection', desc: 'Spot scheduling clashes before they happen' },
  { title: 'Live analytics', desc: 'Utilization and demand at a glance' },
];

export default function LoginPage() {
  const { login, register, forgotPassword, resetPassword } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [mode, setMode] = useState<Mode>(() => (searchParams.get('token') ? 'forgot' : 'login'));
  const [resetStep, setResetStep] = useState<ResetStep>(() => (searchParams.get('token') ? 'reset' : 'request'));
  const [name, setName] = useState('');
  const [email, setEmail] = useState(searchParams.get('email') ?? '');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [resetToken, setResetToken] = useState(searchParams.get('token') ?? '');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const switchMode = (next: Mode) => {
    setMode(next);
    setError(null);
    setInfo(null);
    setPassword('');
    setConfirm('');
    if (next === 'forgot') {
      setResetStep('request');
      setResetToken('');
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);

    if (mode === 'forgot' && resetStep === 'request') {
      if (!email.trim()) {
        setError('Enter your account email first.');
        return;
      }
      setLoading(true);
      try {
        const res = await forgotPassword(email.trim());
        if (res.token) {
          setResetToken(res.token);
          setResetStep('reset');
          setInfo(`Reset token generated (valid ${res.expiresInMinutes} minutes). Set a new password below.`);
        } else {
          setInfo(res.message);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Something went wrong.');
      } finally {
        setLoading(false);
      }
      return;
    }

    if (mode === 'forgot' && resetStep === 'reset') {
      if (!resetToken.trim()) {
        setError('Enter the reset token from the email (or generated above).');
        return;
      }
      if (password.length < 6) {
        setError('Password must be at least 6 characters.');
        return;
      }
      if (password !== confirm) {
        setError('Passwords do not match.');
        return;
      }
      setLoading(true);
      try {
        const res = await resetPassword(email.trim(), resetToken.trim(), password);
        setInfo(res.message);
        setMode('login');
        setResetStep('request');
        setPassword('');
        setConfirm('');
        setResetToken('');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Something went wrong.');
      } finally {
        setLoading(false);
      }
      return;
    }

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

  const headTitle =
    mode === 'login' ? (
      <>
        <h2>Welcome back</h2>
        <p className="login-sub">Sign in to continue to your dashboard.</p>
      </>
    ) : mode === 'register' ? (
      <>
        <h2>Create your account</h2>
        <p className="login-sub">Join to view and manage room allocations.</p>
      </>
    ) : resetStep === 'request' ? (
      <>
        <h2>Forgot your password?</h2>
        <p className="login-sub">Enter your email and we'll send you a reset token.</p>
      </>
    ) : (
      <>
        <h2>Set a new password</h2>
        <p className="login-sub">Enter the reset token and choose a new password.</p>
      </>
    );

  const submitLabel =
    mode === 'login'
      ? 'Sign in'
      : mode === 'register'
        ? 'Create account'
        : resetStep === 'request'
          ? 'Send reset token'
          : 'Reset password';

  const submitLoading =
    mode === 'login' ? 'Signing in…' : mode === 'register' ? 'Creating account…' : resetStep === 'request' ? 'Sending…' : 'Resetting…';

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
            {mode === 'forgot' ? (
              <div className="auth-tabs auth-tabs-single">
                <button type="button" className="auth-tab active" onClick={() => switchMode('login')} disabled={loading}>
                  ← Back to sign in
                </button>
              </div>
            ) : (
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
            )}

            <div className="login-card-head">{headTitle}</div>

            {error && <div className="banner error">{error}</div>}
            {info && <div className="banner success">{info}</div>}

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
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </label>

            {mode !== 'forgot' && (
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
            )}

            {mode === 'login' && (
              <div className="forgot-row">
                <button type="button" className="link-btn" onClick={() => switchMode('forgot')} disabled={loading}>
                  Forgot password?
                </button>
              </div>
            )}

            {mode === 'forgot' && resetStep === 'reset' && (
              <>
                <label className="field">
                  <span className="field-label">Reset token</span>
                  <div className="input-wrap">
                    <svg className="input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
                      <path d="M21 3v5h-5" />
                    </svg>
                    <input
                      className="input input-iconed"
                      type="text"
                      required
                      name="resetToken"
                      placeholder="Paste the reset token"
                      value={resetToken}
                      onChange={(e) => setResetToken(e.target.value)}
                    />
                  </div>
                </label>

                <label className="field">
                  <span className="field-label">New password</span>
                  <div className="input-wrap">
                    <svg className="input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                    </svg>
                    <input
                      className="input input-iconed input-with-toggle"
                      type={showPassword ? 'text' : 'password'}
                      required
                      minLength={6}
                      autoComplete="new-password"
                      name="newPassword"
                      placeholder="Enter a new password (min 6 chars)"
                      value={password}
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

                <label className="field">
                  <span className="field-label">Confirm new password</span>
                  <div className="input-wrap">
                    <svg className="input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                    </svg>
                    <input
                      className="input input-iconed input-with-toggle"
                      type={showPassword ? 'text' : 'password'}
                      required
                      minLength={6}
                      autoComplete="new-password"
                      name="confirmNewPassword"
                      placeholder="Re-enter the new password"
                      value={confirm}
                      onChange={(e) => setConfirm(e.target.value)}
                    />
                  </div>
                </label>
              </>
            )}

            <button className="btn btn-primary btn-login" type="submit" disabled={loading}>
              {loading && <span className="spinner spinner-btn" aria-hidden="true" />}
              {loading ? submitLoading : submitLabel}
            </button>

            {mode === 'register' ? (
              <p className="auth-hint">New accounts are created with viewer access. Contact an admin to upgrade your role.</p>
            ) : mode === 'forgot' && resetStep === 'request' ? (
              <p className="auth-hint">No email configured? An admin can generate a reset token from the Users page.</p>
            ) : mode === 'login' ? (
              <div className="login-demo">
                <span className="login-demo-label">Quick demo access</span>
                <div className="login-demo-chips">
                  <button type="button" className="demo-chip" onClick={fillDemo} disabled={loading}>
                    {DEMO_ACCOUNTS[0].label}
                  </button>
                </div>
              </div>
            ) : null}
          </form>
        </div>
      </div>
    </div>
  );
}
