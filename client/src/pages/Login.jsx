import React, { useState } from 'react';
import { signInWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '../firebase';

// Gates the doctor dashboard. Deliberately no sign-up form anywhere here —
// the only way to get a valid account is the one-time server-side bootstrap
// (see server/index.js's /setup/create-doctor-user), so a Firebase session
// alone doesn't prove someone is the doctor (see the `doctor` custom claim
// checked by firestore.rules and the server's authMiddleware).
export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setInfo('');
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
    } catch (err) {
      setError('Incorrect email or password.');
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    setError('');
    setInfo('');
    if (!email.trim()) {
      setError('Enter your email above first, then click "Forgot password?"');
      return;
    }
    try {
      await sendPasswordResetEmail(auth, email.trim());
      setInfo('Password reset email sent — check your inbox.');
    } catch (err) {
      setError('Could not send reset email. Check the address and try again.');
    }
  };

  return (
    <div className="d-flex align-items-center justify-content-center" style={{ minHeight: '100vh', background: '#f5f5f5' }}>
      <div className="card shadow-sm" style={{ width: '100%', maxWidth: 380 }}>
        <div className="card-body p-4">
          <h4 className="mb-3 text-center">Dr. SG Majeke — Dashboard</h4>
          <form onSubmit={handleSubmit}>
            <div className="mb-3">
              <label className="form-label">Email</label>
              <input
                type="email"
                className="form-control"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoFocus
              />
            </div>
            <div className="mb-3">
              <label className="form-label">Password</label>
              <input
                type="password"
                className="form-control"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
              />
            </div>
            {error && <div className="alert alert-danger py-2">{error}</div>}
            {info && <div className="alert alert-success py-2">{info}</div>}
            <button type="submit" className="btn btn-primary w-100" disabled={loading}>
              {loading ? 'Signing in…' : 'Sign In'}
            </button>
          </form>
          <button
            type="button"
            className="btn btn-link btn-sm w-100 mt-2"
            onClick={handleForgotPassword}
          >
            Forgot password?
          </button>
        </div>
      </div>
    </div>
  );
}
