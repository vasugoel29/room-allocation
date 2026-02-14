import React, { useState } from 'react';
import { Mail, Lock, User, UserPlus, ShieldCheck, ArrowLeft } from 'lucide-react';
import { api } from '../utils/api';

const Signup = ({ onSignupSuccess, onBackToLogin }) => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('VIEWER');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!email.toLowerCase().endsWith('@nsut.ac.in')) {
      setError('Only NSUT emails (@nsut.ac.in) are accepted');
      return;
    }

    setLoading(true);

    try {
      const res = await api.post('/auth/signup', { name, email, password, role });
      
      const data = await res.json();
      if (res.ok) {
        onSignupSuccess();
      } else {
        setError(data.error || 'Signup failed');
      }
    } catch {
      setError('Connection to server failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg-primary p-4 relative overflow-hidden">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-indigo-500/10 blur-[120px] rounded-full"></div>
      
      <div className="relative w-full max-w-sm glass rounded-3xl p-10 shadow-2xl space-y-8 animate-in fade-in zoom-in duration-300 border border-black/5">
        <button 
          onClick={onBackToLogin}
          className="absolute top-6 left-6 p-2 hover:bg-black/5 rounded-full text-slate-400 hover:text-slate-900 transition-colors"
        >
          <ArrowLeft size={20} />
        </button>

        <div className="text-center space-y-2">
          <div className="inline-flex p-3 bg-indigo-50 rounded-2xl text-indigo-600 mb-2">
            <UserPlus size={32} />
          </div>
          <h2 className="text-3xl font-bold text-slate-900 tracking-tight">Create Account</h2>
          <p className="text-slate-500 text-sm">Join the Room Allocation System</p>
        </div>

        {error && (
          <div className="p-4 rounded-2xl bg-red-50 border border-red-100 text-red-600 text-sm font-medium">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
              <User size={16} className="text-slate-400" />
              Full Name
            </label>
            <input
              type="text"
              className="w-full bg-black/5 border border-black/5 rounded-xl px-4 py-3 text-sm text-slate-900 focus:outline-none focus:border-indigo-500 transition-all placeholder:text-slate-400"
              placeholder="Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
              <Mail size={16} className="text-slate-400" />
              Email Address
            </label>
            <input
              type="email"
              className="w-full bg-black/5 border border-black/5 rounded-xl px-4 py-3 text-sm text-slate-900 focus:outline-none focus:border-indigo-500 transition-all placeholder:text-slate-400"
              placeholder="rollno@nsut.ac.in"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
              <Lock size={16} className="text-slate-400" />
              Password
            </label>
            <input
              type="password"
              className="w-full bg-black/5 border border-black/5 rounded-xl px-4 py-3 text-sm text-slate-900 focus:outline-none focus:border-indigo-500 transition-all placeholder:text-slate-400 font-light"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
              <ShieldCheck size={16} className="text-slate-400" />
              Account Type
            </label>
            <div className="relative">
              <select 
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="w-full bg-black/5 border border-black/5 rounded-xl px-4 py-3 text-sm text-slate-900 focus:outline-none focus:border-indigo-500 transition-all appearance-none pr-10"
              >
                <option value="VIEWER" className="bg-white">Viewer (Read Only)</option>
                <option value="STUDENT_REP" className="bg-white">Student Representative (Can Book)</option>
              </select>
              <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2.5 4.5L6 8L9.5 4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white py-4 rounded-xl font-bold transition-all shadow-lg shadow-indigo-600/20 mt-4 active:scale-[0.98]"
          >
            {loading ? 'Creating Account...' : (
              <>
                <UserPlus size={20} />
                Create Account
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};

export default Signup;