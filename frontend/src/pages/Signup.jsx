import React, { useState } from 'react';
import { Mail, Lock, User, UserPlus, ShieldCheck, ArrowLeft, GraduationCap, Building2, Search, Loader2, Sparkles, ChevronRight } from 'lucide-react';
import { authService } from '../services/authService';
import toast from 'react-hot-toast';
import DepartmentSelect from '../features/auth/DepartmentSelect';
import StudentFields from '../features/auth/StudentFields';
import { useDepartments } from '../hooks/useDepartments';

const Signup = ({ onSignupSuccess, onBackToLogin }) => {
  const [step, setStep] = useState(1); // 1: Roll Number, 2: Full Form
  const [rollNo, setRollNo] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [branch, setBranch] = useState('');
  const [year, setYear] = useState(1);
  const [section, setSection] = useState(1);
  const [role, setRole] = useState('VIEWER'); // VIEWER (Student) or FACULTY
  const [departmentName, setDepartmentName] = useState('');
  const { departments } = useDepartments();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  
  // Dropdown states
  const [isDeptOpen, setIsDeptOpen] = useState(false);
  const [isYearOpen, setIsYearOpen] = useState(false);
  const [isSectionOpen, setIsSectionOpen] = useState(false);
  const [isFetching, setIsFetching] = useState(false);

  const handleFetchStudent = async (e) => {
    e?.preventDefault();
    if (!rollNo || rollNo.length < 5) {
      toast.error('Please enter a valid Roll Number');
      return;
    }

    setIsFetching(true);
    setError('');
    
    try {
      const response = await fetch(`https://api.sujal.info/api/nsut/students/${rollNo}`);
      let data = {};
      
      if (response.ok) {
        data = await response.json();
        if (data.name) setName(data.name);
        if (data.branch) setBranch(data.branch);
        if (data.email) setEmail(data.email);
        if (data.year) setYear(parseInt(data.year));
        if (data.section) setSection(parseInt(data.section));
        if (data.department) setDepartmentName(data.department);
        toast.success(`Welcome, ${data.name || 'Student'}! Details loaded.`);
      } else {
        toast.error('Student not found in database. Guessing details from Roll Number...');
      }

      // Fallback: Parse Roll Number for Year and Branch
      const normalizedRoll = rollNo.toUpperCase();
      
      // Email Fallback
      if (!email) setEmail(`${normalizedRoll.toLowerCase()}@nsut.ac.in`);

      // 1. Extract Batch/Year (e.g. 2022, 22)
      const yearMatch = normalizedRoll.match(/(20\d{2})|(\d{2})/);
      if (yearMatch && !data.year) {
        const batch = yearMatch[1] || `20${yearMatch[2]}`;
        const currentYear = new Date().getFullYear();
        const currentMonth = new Date().getMonth(); // 0-indexed
        
        // Simple logic: if March 2026, 2025 batch is 1st year, 2022 batch is 4th year
        // We calculate based on admission year relative to current acad cycle
        let acadYear = currentYear - parseInt(batch);
        if (currentMonth < 6) acadYear += 0; // Feb 2026 is still part of Batch-X cycle
        else acadYear += 1; // July 2026 starts next acad year for Batch-X

        const calculatedYear = Math.max(1, Math.min(4, acadYear + 1));
        setYear(calculatedYear);
      }

      // 2. Extract Branch (common codes)
      const branchMap = {
        'UCM': 'CS',
        'UIT': 'IT',
        'UEC': 'ECE',
        'UMT': 'MAC',
        'UICE': 'ICE',
        'UME': 'ME',
        'UMAM': 'MPAE',
        'UBT': 'BT',
        'BTIT': 'IT',
        'BTCM': 'CS',
        'BTEC': 'ECE'
      };


      for (const [code, name] of Object.entries(branchMap)) {
        if (normalizedRoll.includes(code) && !data.branch) {
          setBranch(name);
          // Auto-select department if possible
          if (name.includes('Information Technology')) setDepartmentName('Information Technology (IT)');
          if (name.includes('Computer Science')) setDepartmentName('Computer Science (CS)');
          break;
        }
      }

      setStep(2);
    } catch (err) {
      console.error('Failed to fetch student data:', err);
      toast.error('Could not reach verification server. Entering manual mode.');
      setStep(2);
    } finally {
      setIsFetching(false);
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
    setStatus(role === 'FACULTY' ? 'Submitting faculty request...' : 'Creating your student profile...');

    const wakeUpTimer = setTimeout(() => {
      setStatus('Server is waking up, please wait...');
    }, 4000);

    try {
      await authService.signup({ 
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
      
      if (role === 'FACULTY') {
        toast.success('Account created! Awaiting administrator approval.', { duration: 5000 });
        onBackToLogin();
      } else {
        toast.success('Welcome! Student account created.');
        onSignupSuccess();
      }
    } catch (err) {
      clearTimeout(wakeUpTimer);
      setError(err.message || 'Connection failed. The server might be deep-sleeping—please try again after a few seconds.');
    } finally {
      setLoading(false);
      setStatus('');
    }
  };

  // If faculty is selected, skip Roll Number step
  React.useEffect(() => {
    if (role === 'FACULTY' && step === 1) {
      setStep(2);
    }
  }, [role, step]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-lowest p-4 relative overflow-hidden">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-primary-accent/10 blur-[120px] rounded-full"></div>
      
      <div className="relative w-full max-w-sm bg-surface-low rounded-[2.5rem] p-8 sm:p-10 shadow-ambient space-y-6 sm:space-y-8 animate-in fade-in zoom-in duration-300">
        <button 
          type="button"
          onClick={step === 2 && role === 'VIEWER' ? () => setStep(1) : onBackToLogin}
          className="absolute top-6 left-6 p-2 hover:bg-bg-primary rounded-full text-text-secondary hover:text-text-primary transition-colors"
        >
          <ArrowLeft size={20} />
        </button>

        <div className="text-center space-y-2 pt-2">
          <div className="inline-flex p-3 bg-primary-accent/10 rounded-2xl text-primary-accent mb-4">
            <UserPlus size={32} />
          </div>
          <h2 className="text-3xl font-extrabold text-text-primary tracking-tight uppercase font-display">Create Account</h2>
          <p className="text-[10px] text-text-secondary font-extrabold uppercase tracking-widest opacity-60 font-display">Join the Room Allocation System</p>
        </div>

        {/* Role Selector */}
        <div className="flex bg-surface-highest/10 p-1 rounded-2xl font-display">
          <button 
            type="button"
            onClick={() => {
              setRole('VIEWER');
              setStep(1);
            }}
            className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-[10px] font-extrabold uppercase transition-all tracking-tight ${role === 'VIEWER' ? 'bg-surface-low text-primary-accent shadow-ambient' : 'text-text-secondary hover:text-text-primary'}`}
          >
            <GraduationCap size={16} /> Student
          </button>
          <button 
            type="button"
            onClick={() => {
              setRole('FACULTY');
              setStep(2);
            }}
            className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-[10px] font-extrabold uppercase transition-all tracking-tight ${role === 'FACULTY' ? 'bg-surface-low text-primary-accent shadow-ambient' : 'text-text-secondary hover:text-text-primary'}`}
          >
            <Building2 size={16} /> Faculty
          </button>
        </div>

        {error && (
          <div role="alert" className="p-4 rounded-2xl bg-error/10 border border-error/20 text-error text-[13px] font-bold">
            {error}
          </div>
        )}

        {step === 1 && role === 'VIEWER' ? (
          /* Step 1: Roll Number Collection */
          <div className="space-y-6 animate-in slide-in-from-right-4 duration-300">
            <div className="space-y-2">
              <label className="text-[10px] font-extrabold text-text-secondary uppercase tracking-[0.2em] px-1 font-display">Roll Number</label>
              <div className="relative group">
                <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-text-secondary/40 group-focus-within:text-primary-accent transition-colors" />
                <input
                  type="text"
                  className="w-full bg-surface-highest/10 rounded-xl pl-11 pr-4 py-4 text-base font-bold text-text-primary focus:outline-none focus:bg-surface-highest/20 transition-all placeholder:text-text-secondary/30 uppercase font-body"
                  placeholder="e.g. 2021UCM2365"
                  value={rollNo}
                  onChange={(e) => setRollNo(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleFetchStudent()}
                  autoFocus
                />
              </div>
              <p className="text-[10px] text-text-secondary px-1 font-medium italic">We'll auto-fill your details using this</p>
            </div>

            <button
              onClick={handleFetchStudent}
              disabled={isFetching || !rollNo}
              className="w-full bg-primary-accent text-white py-5 rounded-2xl font-extrabold uppercase tracking-widest text-[10px] shadow-ambient hover:opacity-90 active:scale-[0.98] transition-all flex items-center justify-center gap-2 font-display"
            >
              {isFetching ? (
                <>
                  <Loader2 size={18} className="animate-spin text-white/80" />
                  Verifying...
                </>
              ) : (
                <>
                  <Sparkles size={18} />
                  Fetch Details
                </>
              )}
            </button>
          </div>
        ) : (
          /* Step 2: Full Form (Manual or Auto-filled) */
          <form onSubmit={handleSubmit} className="space-y-4 animate-in slide-in-from-right-4 duration-300">
            <div className="space-y-2">
              <label className="text-[10px] font-extrabold text-text-secondary uppercase tracking-[0.2em] px-1 font-display">Full Name</label>
              <div className="relative">
                <User size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-text-secondary/40" />
                <input
                  type="text"
                  className="w-full bg-surface-highest/10 rounded-xl pl-11 pr-4 py-3 text-sm font-bold text-text-primary focus:outline-none focus:bg-surface-highest/20 transition-all placeholder:text-text-secondary/40 font-body"
                  placeholder="Enter your name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-extrabold text-text-secondary uppercase tracking-[0.2em] px-1 font-display">Email Address</label>
              <div className="relative">
                <Mail size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-text-secondary/40" />
                <input
                  type="email"
                  className="w-full bg-surface-highest/10 rounded-xl pl-11 pr-4 py-3 text-sm font-bold text-text-primary focus:outline-none focus:bg-surface-highest/20 transition-all placeholder:text-text-secondary/40 font-body"
                  placeholder="rollno@nsut.ac.in"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
            </div>

            <DepartmentSelect
              departments={departments}
              departmentName={departmentName}
              setDepartmentName={setDepartmentName}
              isDeptOpen={isDeptOpen}
              setIsDeptOpen={setIsDeptOpen}
            />

            {role === 'VIEWER' && (
              <StudentFields
                branch={branch}
                setBranch={setBranch}
                year={year}
                setYear={setYear}
                isYearOpen={isYearOpen}
                setIsYearOpen={setIsYearOpen}
                section={section}
                setSection={setSection}
                isSectionOpen={isSectionOpen}
                setIsSectionOpen={setIsSectionOpen}
              />
            )}

            <div className="space-y-2">
              <label className="text-[10px] font-extrabold text-text-secondary uppercase tracking-[0.2em] px-1 font-display">Password</label>
              <div className="relative">
                <Lock size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-text-secondary/40" />
                <input
                  type="password"
                  className="w-full bg-surface-highest/10 rounded-xl pl-11 pr-4 py-3 text-sm font-bold text-text-primary focus:outline-none focus:bg-surface-highest/20 transition-all placeholder:text-text-secondary/40 font-body"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
            </div>

            {role === 'FACULTY' && (
               <div className="p-4 rounded-xl bg-primary-accent/5 flex gap-3 animate-in slide-in-from-top-2 font-display">
                  <ShieldCheck size={20} className="text-primary-accent shrink-0" />
                  <p className="text-[11px] font-extrabold text-primary-accent leading-relaxed uppercase tracking-tight">Account will be activated following administrator verification.</p>
               </div>
            )}

            <div className="flex gap-3 mt-4">
              {role === 'VIEWER' && (
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="p-4 bg-surface-highest/10 rounded-xl text-text-secondary hover:text-text-primary transition-all active:scale-95"
                >
                  <ArrowLeft size={20} />
                </button>
              )}
              <button
                type="submit"
                disabled={loading}
                className="flex-1 bg-primary-accent text-white py-5 rounded-2xl font-extrabold uppercase tracking-widest text-[10px] shadow-ambient hover:opacity-90 active:scale-[0.98] transition-all flex items-center justify-center gap-2 font-display"
              >
                {loading ? (status || 'Creating...') : (role === 'FACULTY' ? 'Request Access' : 'Create Account')}
                {!loading && <ChevronRight size={18} />}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export default Signup;