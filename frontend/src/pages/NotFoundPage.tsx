import { Link } from 'react-router-dom';

export default function NotFoundPage() {
  return (
    <div className="login-page">
      <div className="card" style={{ textAlign: 'center', maxWidth: 400 }}>
        <h1>404</h1>
        <p className="text-muted">The page you are looking for does not exist.</p>
        <Link className="btn btn-primary" to="/">
          Back to Dashboard
        </Link>
      </div>
    </div>
  );
}
