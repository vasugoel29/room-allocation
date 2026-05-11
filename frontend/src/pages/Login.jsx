import React, { useState, useContext } from 'react';
import { Link } from 'react-router-dom';
import { Mail, Lock, LogIn, ChevronRight, UserPlus, Info, ShieldCheck } from 'lucide-react';
import { authService } from '../services/authService';
import { AppContext } from '../context/AppContext';


const Login = () => {
  const { setUser } = useContext(AppContext);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');




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
      const data = await authService.login(email, password);
      clearTimeout(wakeUpTimer);
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
      setUser(data.user);
    } catch (err) {
      clearTimeout(wakeUpTimer);
      setError(err.message || 'Connection failed. The server might be deep-sleeping—please try again after a few seconds.');
    } finally {
      setLoading(false);
      setStatus('');
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
          <h2 className="text-3xl font-extrabold text-text-primary tracking-tight uppercase font-display">Welcome Back</h2>
          <p className="text-[10px] text-text-secondary font-extrabold uppercase tracking-widest opacity-60 font-display">Sign in to manage your bookings</p>
        </div>

        {error && (
          <div id="login-error" role="alert" className="p-4 rounded-2xl bg-error/10 border border-error/20 text-error text-sm animate-in slide-in-from-top-2 font-medium">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <label htmlFor="email" className="text-[10px] font-extrabold text-text-secondary uppercase tracking-[0.2em] flex items-center gap-2 font-display">
              <Mail size={14} className="text-primary-accent" />
              Email Address
            </label>
            <input
              id="email"
              type="email"
              className="w-full bg-surface-highest/10 rounded-xl px-4 py-3 text-sm text-text-primary focus:outline-none focus:bg-surface-highest/20 transition-all font-bold placeholder:text-text-secondary/40 font-body"
              placeholder="rollno@nsut.ac.in"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              inputMode="email"
              aria-invalid={error ? 'true' : 'false'}
              aria-describedby={error ? 'login-error' : undefined}
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="password" className="text-[10px] font-extrabold text-text-secondary uppercase tracking-[0.2em] flex items-center gap-2 font-display">
              <Lock size={14} className="text-primary-accent" />
              Password
            </label>
            <input
              id="password"
              type="password"
              className="w-full bg-surface-highest/10 rounded-xl px-4 py-3 text-sm text-text-primary focus:outline-none focus:bg-surface-highest/20 transition-all font-bold placeholder:text-text-secondary/40 font-body"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSubmit(e)}
              required
              autoComplete="current-password"
            />
          </div>

          <div className="text-right">
            <Link 
              to="/forgot-password"
              className="text-[10px] text-primary-accent font-extrabold uppercase tracking-widest opacity-70 hover:opacity-100 transition-opacity"
            >
              Forgot Password?
            </Link>
          </div>

          <div className="flex flex-col gap-4">
            <button
              type="submit"
              disabled={loading}
              className="w-full flex flex-col items-center justify-center gap-1 bg-primary-accent disabled:opacity-50 text-white py-5 rounded-2xl font-extrabold text-[10px] uppercase tracking-widest transition-all shadow-ambient active:scale-[0.98] font-display"
            >
              <div className="flex items-center gap-2">
                <LogIn size={20} />
                {loading ? 'Authenticating...' : 'Sign In'}
              </div>
              {loading && status && (
                <span aria-live="polite" className="text-[10px] font-medium opacity-80 animate-pulse">{status}</span>
              )}
            </button>

          </div>
        </form>

      </div>
    </div>
  );
};

export default Login;
