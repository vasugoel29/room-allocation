import React, { useState } from 'react';
import { Mail, Lock, User, UserPlus, ShieldCheck, ArrowLeft } from 'lucide-react';
import { api } from '../utils/api';

const Signup = ({ onSignupSuccess, onBackToLogin }) => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role] = useState('VIEWER');
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
      setStatus('Server is waking up, please wait...');
    }, 4000);

    try {
      const res = await api.post('/auth/signup', { name, email, password, role });
      clearTimeout(wakeUpTimer);
      
      const data = await res.json();
      if (res.ok) {
        onSignupSuccess();
      } else {
        setError(data.error || 'Signup failed');
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
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-indigo-500/10 blur-[120px] rounded-full"></div>
      
      <div className="relative w-full max-w-sm bg-bg-secondary border border-border rounded-3xl p-10 shadow-2xl space-y-8 animate-in fade-in zoom-in duration-300">
        <button 
          type="button"
          onClick={onBackToLogin}
          className="absolute top-6 left-6 p-2 hover:bg-bg-primary rounded-full text-text-secondary hover:text-text-primary transition-colors"
        >
          <ArrowLeft size={20} />
        </button>

        <div className="text-center space-y-2">
          <div className="inline-flex p-3 bg-accent/10 rounded-2xl text-accent mb-2">
            <UserPlus size={32} />
          </div>
          <h2 className="text-3xl font-bold text-text-primary tracking-tight">Create Account</h2>
          <p className="text-text-secondary text-sm font-medium">Join the Room Allocation System</p>
        </div>

        {error && (
          <div className="p-4 rounded-2xl bg-error/10 border border-error/20 text-error text-sm font-medium">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-semibold text-text-secondary flex items-center gap-2">
              <User size={16} className="text-text-secondary/50" />
              Full Name
            </label>
            <input
              type="text"
              className="w-full bg-bg-primary border border-border rounded-xl px-4 py-3 text-sm text-text-primary focus:outline-none focus:border-accent transition-all placeholder:text-text-secondary/30"
              placeholder="Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

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
              className="w-full bg-bg-primary border border-border rounded-xl px-4 py-3 text-sm text-text-primary focus:outline-none focus:border-accent transition-all placeholder:text-text-secondary/30 font-light"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          {/* Account Type hidden as only VIEWER is available for self-signup */}
          <input type="hidden" value="VIEWER" />
          <div className="p-4 rounded-xl bg-bg-primary border border-border flex items-center gap-3">
            <ShieldCheck size={20} className="text-accent" />
            <div>
              <p className="text-xs font-bold text-text-secondary uppercase tracking-wider">Account Type</p>
              <p className="text-sm font-medium text-text-primary">Viewer (Read Only)</p>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full flex flex-col items-center justify-center gap-1 bg-accent hover:bg-accent-hover disabled:opacity-50 text-white py-4 rounded-xl font-bold transition-all shadow-lg shadow-accent/20 mt-4 active:scale-[0.98]"
          >
            <div className="flex items-center gap-2">
              <UserPlus size={20} />
              {loading ? 'Creating Account...' : 'Create Account'}
            </div>
            {loading && status && (
              <span className="text-[10px] font-medium opacity-80 animate-pulse">{status}</span>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};

export default Signup;