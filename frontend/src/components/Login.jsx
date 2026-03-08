import React, { useState, useContext } from 'react';
import { Mail, Lock, LogIn, ShieldCheck } from 'lucide-react';
import { api } from '../utils/api';
import { AppContext } from '../context/AppContext';
import { useNotification } from '../context/NotificationContext';

const Login = ({ onShowSignup }) => {
  const { setUser } = useContext(AppContext);
  const { showNotification } = useNotification();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [showForgotSuccess, setShowForgotSuccess] = useState(false);

  const handleForgotPassword = async () => {
    const loginEmail = window.prompt("Enter your Login NSUT email ID:");
    if (!loginEmail) return;
    if (!loginEmail.toLowerCase().endsWith('@nsut.ac.in')) {
      showNotification('Only NSUT emails (@nsut.ac.in) are supported.', 'error');
      return;
    }

    const recoveryEmail = window.prompt("Enter the NSUT email ID where the password should be sent:");
    if (!recoveryEmail) return;
    if (!recoveryEmail.toLowerCase().endsWith('@nsut.ac.in')) {
      showNotification('Only NSUT emails (@nsut.ac.in) are supported.', 'error');
      return;
    }

    setLoading(true);
    setStatus('Sending recovery request...');
    try {
      const res = await api.post('/auth/forgot-password', { loginEmail, recoveryEmail });
      if (res.ok) {
        setShowForgotSuccess(true);
        setTimeout(() => setShowForgotSuccess(false), 8000);
      } else {
        const data = await res.json();
        showNotification(data.error || 'Failed to send recovery request', 'error');
      }
    } catch {
      showNotification('Connection failed. Please try again.', 'error');
    } finally {
      setLoading(false);
      setStatus('');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!email.toLowerCase().endsWith('@nsut.ac.in')) {
      setError('Only NSUT emails (@nsut.ac.in) are accepted');
      return;
    }

    setLoading(true);
    setStatus('Contacting server...');

    const wakeUpTimer = setTimeout(() => {
      setStatus('Server is waking up...');
    }, 4000);

    try {
      const res = await api.post('/auth/login', { email, password });
      clearTimeout(wakeUpTimer);
      
      const data = await res.json();
      if (res.ok && data.token) {
        localStorage.setItem('token', data.token);
        localStorage.setItem('user', JSON.stringify(data.user));
        setUser(data.user);
      } else {
        setError(data.error || 'Invalid credentials');
      }
    } catch {
      clearTimeout(wakeUpTimer);
      setError('Connection failed. The server might be deep-sleeping—please try again after a few seconds.');
    } finally {
      setLoading(false);
      setStatus('');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg-primary p-4 relative overflow-hidden">
      {/* Background Glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-indigo-500/10 blur-[120px] rounded-full"></div>
      
      <div className="relative w-full max-w-sm bg-bg-secondary border border-border rounded-3xl p-10 shadow-2xl space-y-8 animate-in fade-in zoom-in duration-300">
        <div className="text-center space-y-2">
          <div className="inline-flex p-3 bg-accent/10 rounded-2xl text-accent mb-2">
            <ShieldCheck size={32} />
          </div>
          <h2 className="text-3xl font-bold text-text-primary tracking-tight">Welcome Back</h2>
          <p className="text-text-secondary text-sm font-medium">Sign in to manage your bookings</p>
        </div>

        {error && (
          <div className="p-4 rounded-2xl bg-error/10 border border-error/20 text-error text-sm animate-in slide-in-from-top-2 font-medium">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <label className="text-sm font-semibold text-text-secondary flex items-center gap-2">
              <Mail size={16} className="text-text-secondary/50" />
              Email Address
            </label>
            <input
              type="email"
              className="w-full bg-bg-primary border border-border rounded-xl px-4 py-3 text-sm text-text-primary focus:outline-none focus:border-accent transition-all placeholder:text-text-secondary/30"
              placeholder="rollno@nsut.ac.in"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-semibold text-text-secondary flex items-center gap-2">
              <Lock size={16} className="text-text-secondary/50" />
              Password
            </label>
            <input
              type="password"
              className="w-full bg-bg-primary border border-border rounded-xl px-4 py-3 text-sm text-text-primary focus:outline-none focus:border-accent transition-all placeholder:text-text-secondary/30"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <div className="flex flex-col gap-4">
            <button
              type="submit"
              disabled={loading}
              className="w-full flex flex-col items-center justify-center gap-1 bg-accent hover:bg-accent-hover disabled:opacity-50 text-white py-4 rounded-xl font-bold transition-all shadow-lg shadow-accent/20 active:scale-[0.98]"
            >
              <div className="flex items-center gap-2">
                <LogIn size={20} />
                {loading ? 'Authenticating...' : 'Sign In'}
              </div>
              {loading && status && (
                <span className="text-[10px] font-medium opacity-80 animate-pulse">{status}</span>
              )}
            </button>

            <button
              type="button"
              onClick={handleForgotPassword}
              className="text-sm font-bold text-text-secondary hover:text-accent transition-colors"
            >
              Forgot Password?
            </button>
          </div>
        </form>

        {showForgotSuccess && (
          <div className="p-4 rounded-2xl bg-success/10 border border-success/20 text-success text-xs font-medium animate-in fade-in slide-in-from-top-1">
            Recovery request sent! Support will email the password to your recovery address.
          </div>
        )}

        <div className="text-center pt-4">
          <p className="text-sm text-text-secondary font-medium">
            Don't have an account?{' '}
            <button 
              onClick={onShowSignup}
              className="text-accent hover:text-accent-hover font-bold transition-colors underline underline-offset-4"
            >
              Sign up
            </button>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;
