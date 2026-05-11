import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail, ArrowLeft, Send } from 'lucide-react';
import { authService } from '../services/authService';

const ForgotPassword = () => {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!email.toLowerCase().endsWith('@nsut.ac.in')) {
      setError('Only NSUT emails (@nsut.ac.in) are accepted');
      return;
    }

    setLoading(true);
    try {
      await authService.forgotPassword(email);
      setSent(true);
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-surface-lowest p-4 relative overflow-hidden">
      {/* Background Glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-primary-accent/10 blur-[120px] rounded-full"></div>
      
      <div className="relative w-full max-w-sm bg-surface-low rounded-[2.5rem] p-10 shadow-ambient space-y-8 animate-in fade-in zoom-in duration-300">
        <div className="text-center space-y-2">
          <div className="inline-flex mb-4">
            <img src="/pwa-192x192.png" alt="CRAS Logo" className="w-20 h-20 rounded-[1.5rem] shadow-ambient" />
          </div>
          <h2 className="text-2xl font-extrabold text-text-primary tracking-tight uppercase font-display">Reset Password</h2>
          <p className="text-[10px] text-text-secondary font-extrabold uppercase tracking-widest opacity-60 font-display">
            {sent ? 'Check your email inbox' : 'Enter your NSUT email to get a reset link'}
          </p>
        </div>

        {error && (
          <div role="alert" className="p-4 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-500 text-sm animate-in slide-in-from-top-2 font-medium">
            {error}
          </div>
        )}

        {sent ? (
          <div className="space-y-6">
            <div className="p-6 rounded-2xl bg-green-500/10 border border-green-500/20 text-center">
              <Send size={32} className="text-green-500 mx-auto mb-3" />
              <p className="text-sm font-bold text-green-600">
                If an account with <strong>{email}</strong> exists, we've sent a password reset link. Please check your inbox (and spam folder).
              </p>
            </div>
            <p className="text-center text-[10px] text-text-secondary font-extrabold uppercase tracking-widest opacity-60">
              The link expires in 1 hour.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <label className="text-[10px] font-extrabold text-text-secondary uppercase tracking-[0.2em] flex items-center gap-2 font-display">
                <Mail size={14} className="text-primary-accent" />
                Email Address
              </label>
              <input
                type="email"
                className="w-full bg-surface-highest/10 rounded-xl px-4 py-3 text-sm text-text-primary focus:outline-none focus:bg-surface-highest/20 transition-all font-bold placeholder:text-text-secondary/40 font-body"
                placeholder="rollno@nsut.ac.in"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                inputMode="email"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 bg-primary-accent disabled:opacity-50 text-white py-4 rounded-2xl font-extrabold text-[10px] uppercase tracking-widest transition-all shadow-ambient active:scale-[0.98] font-display"
            >
              <Send size={18} />
              {loading ? 'Sending...' : 'Send Reset Link'}
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

export default ForgotPassword;
