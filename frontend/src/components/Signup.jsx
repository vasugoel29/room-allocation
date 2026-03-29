import React, { useState, useEffect } from 'react';
import { Mail, Lock, User, UserPlus, ShieldCheck, ArrowLeft, GraduationCap, Building2 } from 'lucide-react';
import { api } from '../utils/api';

const Signup = ({ onSignupSuccess, onBackToLogin }) => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [branch, setBranch] = useState('');
  const [year, setYear] = useState(1);
  const [section, setSection] = useState(1);
  const [role, setRole] = useState('VIEWER'); // VIEWER (Student) or FACULTY
  const [departmentName, setDepartmentName] = useState('');
  const [departments, setDepartments] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');

  useEffect(() => {
    const fetchDepartments = async () => {
      try {
        const res = await api.get('/departments');
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data)) {
            setDepartments(data);
          } else {
            console.error('Expected array for departments, got:', data);
          }
        }
      } catch (err) {
        console.error('Failed to fetch departments', err);
      }
    };
    fetchDepartments();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!email.toLowerCase().endsWith('@nsut.ac.in')) {
      setError('Only NSUT emails (@nsut.ac.in) are accepted');
      return;
    }

    setLoading(true);
    setStatus(role === 'FACULTY' ? 'Submitting faculty request...' : 'Creating your student profile...');

    const wakeUpTimer = setTimeout(() => {
      setStatus('Server is waking up, please wait...');
    }, 4000);

    try {
      const res = await api.post('/auth/signup', { 
        name, 
        email, 
        password, 
        role,
        branch: role === 'VIEWER' ? branch : null,
        year: role === 'VIEWER' ? parseInt(year) : null,
        section: role === 'VIEWER' ? parseInt(section) : null,
        departmentName
      });
      clearTimeout(wakeUpTimer);
      
      const data = await res.json();
      if (res.ok) {
        if (role === 'FACULTY') {
          alert('Account created! Please wait for administrator approval before logging in.');
          onBackToLogin();
        } else {
          onSignupSuccess();
        }
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
      
      <div className="relative w-full max-w-sm bg-bg-secondary border border-border rounded-3xl p-8 sm:p-10 shadow-2xl space-y-6 sm:space-y-8 animate-in fade-in zoom-in duration-300">
        <button 
          type="button"
          onClick={onBackToLogin}
          className="absolute top-6 left-6 p-2 hover:bg-bg-primary rounded-full text-text-secondary hover:text-text-primary transition-colors"
        >
          <ArrowLeft size={20} />
        </button>

        <div className="text-center space-y-2 pt-2">
          <div className="inline-flex p-3 bg-accent/10 rounded-2xl text-accent mb-2">
            <UserPlus size={32} />
          </div>
          <h2 className="text-3xl font-bold text-text-primary tracking-tight">Create Account</h2>
          <p className="text-text-secondary text-sm font-medium">Join the Room Allocation System</p>
        </div>

        {/* Role Selector */}
        <div className="flex bg-bg-primary p-1 rounded-2xl border border-border">
          <button 
            type="button"
            onClick={() => setRole('VIEWER')}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-black transition-all ${role === 'VIEWER' ? 'bg-bg-secondary text-accent shadow-sm border border-border' : 'text-text-secondary hover:text-text-primary'}`}
          >
            <GraduationCap size={16} /> Student
          </button>
          <button 
            type="button"
            onClick={() => setRole('FACULTY')}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-black transition-all ${role === 'FACULTY' ? 'bg-bg-secondary text-accent shadow-sm border border-border' : 'text-text-secondary hover:text-text-primary'}`}
          >
            <Building2 size={16} /> Faculty
          </button>
        </div>

        {error && (
          <div role="alert" className="p-4 rounded-2xl bg-error/10 border border-error/20 text-error text-[13px] font-bold">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label className="text-[10px] font-black text-text-secondary uppercase tracking-[0.1em] px-1">Full Name</label>
            <div className="relative">
              <User size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-text-secondary/40" />
              <input
                type="text"
                className="w-full bg-bg-primary border border-border rounded-xl pl-11 pr-4 py-3 text-sm font-bold text-text-primary focus:outline-none focus:border-accent transition-all placeholder:text-text-secondary/30"
                placeholder="Enter your name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black text-text-secondary uppercase tracking-[0.1em] px-1">Email Address</label>
            <div className="relative">
              <Mail size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-text-secondary/40" />
              <input
                type="email"
                className="w-full bg-bg-primary border border-border rounded-xl pl-11 pr-4 py-3 text-sm font-bold text-text-primary focus:outline-none focus:border-accent transition-all placeholder:text-text-secondary/30"
                placeholder="rollno@nsut.ac.in"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
          </div>

          {/* Department Dropdown (For both) */}
          <div className="space-y-2">
            <label className="text-[10px] font-black text-text-secondary uppercase tracking-[0.1em] px-1">Department</label>
            <div className="relative">
              <Building2 size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-text-secondary/40" />
              <input
                list="dept-list"
                className="w-full bg-bg-primary border border-border rounded-xl pl-11 pr-4 py-3 text-sm font-bold text-text-primary focus:outline-none focus:border-accent transition-all placeholder:text-text-secondary/30"
                placeholder="Select or type department"
                value={departmentName}
                onChange={(e) => setDepartmentName(e.target.value)}
                required
              />
              <datalist id="dept-list">
                {departments.map((d, i) => <option key={d.id || i} value={d.name} />)}
              </datalist>
            </div>
          </div>

          {role === 'VIEWER' && (
            <>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-text-secondary uppercase tracking-[0.1em] px-1">Branch</label>
                <input
                  type="text"
                  className="w-full bg-bg-primary border border-border rounded-xl px-4 py-3 text-sm font-bold text-text-primary focus:outline-none focus:border-accent transition-all placeholder:text-text-secondary/30"
                  placeholder="e.g. CSE, IT, ECE"
                  value={branch}
                  onChange={(e) => setBranch(e.target.value)}
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-text-secondary uppercase tracking-[0.1em] px-1">Year</label>
                  <select
                    className="w-full bg-bg-primary border border-border rounded-xl px-4 py-3 text-sm font-bold text-text-primary focus:outline-none focus:border-accent transition-all"
                    value={year}
                    onChange={(e) => setYear(e.target.value)}
                    required
                  >
                    {[1, 2, 3, 4].map(y => (
                      <option key={y} value={y}>{y} Year</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-text-secondary uppercase tracking-[0.1em] px-1">Section</label>
                  <select
                    className="w-full bg-bg-primary border border-border rounded-xl px-4 py-3 text-sm font-bold text-text-primary focus:outline-none focus:border-accent transition-all"
                    value={section}
                    onChange={(e) => setSection(e.target.value)}
                    required
                  >
                    {[1, 2, 3, 4, 5, 6].map(s => (
                      <option key={s} value={s}>Section {s}</option>
                    ))}
                  </select>
                </div>
              </div>
            </>
          )}

          <div className="space-y-2">
            <label className="text-[10px] font-black text-text-secondary uppercase tracking-[0.1em] px-1">Password</label>
            <div className="relative">
              <Lock size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-text-secondary/40" />
              <input
                type="password"
                className="w-full bg-bg-primary border border-border rounded-xl pl-11 pr-4 py-3 text-sm font-bold text-text-primary focus:outline-none focus:border-accent transition-all placeholder:text-text-secondary/30"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
          </div>

          {role === 'FACULTY' && (
             <div className="p-4 rounded-xl bg-accent/5 border border-accent/20 flex gap-3 animate-in slide-in-from-top-2">
                <ShieldCheck size={20} className="text-accent shrink-0" />
                <p className="text-[11px] font-bold text-accent leading-relaxed">Account will be activated following administrator verification.</p>
             </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-accent text-white py-4 rounded-xl font-black shadow-lg shadow-accent/20 hover:opacity-90 active:scale-[0.98] transition-all mt-4"
          >
            {loading ? (status || 'Creating account...') : (role === 'FACULTY' ? 'Request Faculty Access' : 'Create Student Account')}
          </button>
        </form>
      </div>
    </div>
  );
};

export default Signup;