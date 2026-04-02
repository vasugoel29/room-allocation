import React, { useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { Lock, CheckCircle, ArrowLeft, ShieldCheck } from 'lucide-react';
import { authService } from '../services/authService';

const ResetPassword = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);
    try {
      await authService.resetPassword(token, password);
      setSuccess(true);
    } catch (err) {
      setError(err.message || 'Failed to reset password. The link may have expired.');
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-surface-lowest p-4 relative overflow-hidden">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-red-500/10 blur-[120px] rounded-full"></div>
        <div className="relative w-full max-w-sm bg-surface-low rounded-[2.5rem] p-10 shadow-ambient space-y-6 text-center">
          <div className="text-red-500 text-4xl mb-4">⚠️</div>
          <h2 className="text-xl font-extrabold text-text-primary uppercase font-display">Invalid Reset Link</h2>
          <p className="text-sm text-text-secondary">This password reset link is missing or malformed. Please request a new one.</p>
          <Link
            to="/forgot-password"
            className="inline-flex items-center gap-2 text-primary-accent text-[10px] font-extrabold uppercase tracking-widest"
          >
            <ArrowLeft size={14} /> Request New Link
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-surface-lowest p-4 relative overflow-hidden">
      {/* Background Glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-primary-accent/10 blur-[120px] rounded-full"></div>
      
      <div className="relative w-full max-w-sm bg-surface-low rounded-[2.5rem] p-10 shadow-ambient space-y-8 animate-in fade-in zoom-in duration-300">
        <div className="text-center space-y-2">
          <div className="inline-flex mb-4">
            <img src="/pwa-192x192.png" alt="CRAS Logo" className="w-20 h-20 rounded-[1.5rem] shadow-ambient" />
          </div>
          <h2 className="text-2xl font-extrabold text-text-primary tracking-tight uppercase font-display">New Password</h2>
          <p className="text-[10px] text-text-secondary font-extrabold uppercase tracking-widest opacity-60 font-display">
            {success ? 'Password updated successfully' : 'Choose a strong new password'}
          </p>
        </div>

        {error && (
          <div role="alert" className="p-4 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-500 text-sm animate-in slide-in-from-top-2 font-medium">
            {error}
          </div>
        )}

        {success ? (
          <div className="space-y-6">
            <div className="p-6 rounded-2xl bg-green-500/10 border border-green-500/20 text-center">
              <CheckCircle size={32} className="text-green-500 mx-auto mb-3" />
              <p className="text-sm font-bold text-green-600">
                Your password has been reset. You can now log in with your new credentials.
              </p>
            </div>
            <Link
              to="/"
              className="w-full flex items-center justify-center gap-2 bg-primary-accent text-white py-4 rounded-2xl font-extrabold text-[10px] uppercase tracking-widest transition-all shadow-ambient active:scale-[0.98] font-display"
            >
              <ShieldCheck size={18} />
              Go to Login
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <label className="text-[10px] font-extrabold text-text-secondary uppercase tracking-[0.2em] flex items-center gap-2 font-display">
                <Lock size={14} className="text-primary-accent" />
                New Password
              </label>
              <input
                type="password"
                className="w-full bg-surface-highest/10 rounded-xl px-4 py-3 text-sm text-text-primary focus:outline-none focus:bg-surface-highest/20 transition-all font-bold placeholder:text-text-secondary/40 font-body"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                autoComplete="new-password"
              />
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-extrabold text-text-secondary uppercase tracking-[0.2em] flex items-center gap-2 font-display">
                <Lock size={14} className="text-primary-accent" />
                Confirm Password
              </label>
              <input
                type="password"
                className="w-full bg-surface-highest/10 rounded-xl px-4 py-3 text-sm text-text-primary focus:outline-none focus:bg-surface-highest/20 transition-all font-bold placeholder:text-text-secondary/40 font-body"
                placeholder="••••••••"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={6}
                autoComplete="new-password"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 bg-primary-accent disabled:opacity-50 text-white py-4 rounded-2xl font-extrabold text-[10px] uppercase tracking-widest transition-all shadow-ambient active:scale-[0.98] font-display"
            >
              <ShieldCheck size={18} />
              {loading ? 'Resetting...' : 'Reset Password'}
            </button>
          </form>
        )}

        <div className="text-center pt-2 font-display">
          <Link
            to="/"
            className="text-[10px] text-primary-accent font-extrabold uppercase tracking-widest opacity-80 hover:opacity-100 transition-opacity flex items-center justify-center gap-2"
          >
            <ArrowLeft size={14} />
            Back to Login
          </Link>
        </div>
      </div>
    </div>
  );
};

export default ResetPassword;
