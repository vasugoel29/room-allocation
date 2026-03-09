import React, { useState } from 'react';
import { Bug, Send, AlertCircle, CheckCircle2, Terminal, ShieldAlert, History } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../utils/api';

const SEVERITIES = [
  { id: 'low', label: 'Low', color: 'bg-blue-500', icon: <Terminal size={14} /> },
  { id: 'medium', label: 'Medium', color: 'bg-yellow-500', icon: <Bug size={14} /> },
  { id: 'high', label: 'High', color: 'bg-orange-500', icon: <AlertCircle size={14} /> },
  { id: 'critical', label: 'Critical', color: 'bg-red-500', icon: <ShieldAlert size={14} /> },
];

function Bugs() {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [severity, setSeverity] = useState('medium');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title || !description) return toast.error('Please fill in all fields');

    setLoading(true);
    try {
      const res = await api.post('/bugs', { title, description, severity });
      if (res.ok) {
        setSubmitted(true);
        toast.success('Bug report submitted successfully!');
        setTitle('');
        setDescription('');
      } else {
        toast.error('Failed to submit report');
      }
    } catch {
      toast.error('Connection error');
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-4 text-center space-y-6 animate-in fade-in zoom-in duration-500">
        <div className="w-24 h-24 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center text-green-600 dark:text-green-400 shadow-xl shadow-green-500/10">
          <CheckCircle2 size={48} />
        </div>
        <div className="space-y-2 max-w-md">
          <h2 className="text-3xl font-black tracking-tight text-text-primary">Report Received!</h2>
          <p className="text-text-secondary leading-relaxed">
            Thank you for helping us improve. Our engineering team has been notified and will investigate this issue shortly.
          </p>
        </div>
        <button 
          onClick={() => setSubmitted(false)}
          className="px-8 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold transition-all shadow-lg active:scale-95"
        >
          Submit Another Report
        </button>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden max-w-4xl mx-auto w-full p-4 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="space-y-2">
        <div className="flex items-center gap-3 text-indigo-600">
          <Bug size={32} className="stroke-[2.5]" />
          <h1 className="text-4xl font-black tracking-tight text-text-primary">Bug Reporting</h1>
        </div>
        <p className="text-text-secondary text-lg max-w-2xl">
          Found something broken? Help us catch it. Your reports are automatically enriched with diagnostic data via Sentry.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <form onSubmit={handleSubmit} className="md:col-span-2 space-y-6 glass dark:bg-slate-800/50 p-6 sm:p-8 rounded-[2rem] border border-black/5 shadow-xl">
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-black text-text-primary uppercase tracking-widest pl-1">What happened?</label>
              <input 
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Brief summary of the issue..."
                className="w-full bg-bg-primary border border-border rounded-2xl px-5 py-4 text-text-primary focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all shadow-sm"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-black text-text-primary uppercase tracking-widest pl-1">Detailed Description</label>
              <textarea 
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What were you doing? What did you expect vs what actually happened?"
                className="w-full bg-bg-primary border border-border rounded-2xl px-5 py-4 text-text-primary focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all h-32 resize-none shadow-sm"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-black text-text-primary uppercase tracking-widest pl-1">Severity Level</label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {SEVERITIES.map(s => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setSeverity(s.id)}
                    className={`flex items-center justify-center gap-2 py-3 rounded-xl border transition-all text-xs font-bold ${severity === s.id ? `${s.color} text-white border-transparent shadow-lg scale-[1.02]` : 'bg-bg-primary border-border text-text-secondary hover:bg-bg-secondary'}`}
                  >
                    {s.icon}
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <button 
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white py-5 rounded-2xl text-lg font-black transition-all shadow-xl shadow-indigo-600/20 active:scale-[0.98]"
          >
            {loading ? 'Transmitting...' : (
              <>
                <Send size={20} />
                Beam Report to Engineers
              </>
            )}
          </button>
        </form>

        <div className="space-y-6">
          <div className="glass bg-indigo-600 text-white p-6 rounded-[2rem] shadow-xl shadow-indigo-600/20">
            <h3 className="text-xl font-black mb-3 flex items-center gap-2">
              <ShieldAlert size={20} />
              Pro Dev Tip
            </h3>
            <p className="text-indigo-100 text-sm leading-relaxed font-medium">
              We use <span className="text-white font-bold">Sentry</span> to automatically catch runtime crashes. Manual reports help us fix UI glitches and logic errors that don't cause a crash.
            </p>
          </div>

          <div className="glass dark:bg-slate-800/50 p-6 rounded-[2rem] border border-black/5 shadow-lg flex-1">
            <h3 className="text-sm font-black text-text-secondary uppercase tracking-widest mb-4 flex items-center gap-2">
              <History size={16} />
              Recent Diagnostics
            </h3>
            <div className="space-y-4">
               <div className="p-3 bg-bg-secondary/50 rounded-xl border border-border">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-bold text-indigo-600 uppercase">Automatic Trace</span>
                    <span className="text-[10px] text-text-secondary">Ready</span>
                  </div>
                  <p className="text-xs text-text-primary font-medium italic">Sentry Session Active</p>
               </div>
               <div className="p-3 bg-bg-secondary/50 rounded-xl border border-border">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-bold text-green-600 uppercase">Network Status</span>
                    <span className="text-[10px] text-text-secondary">Linked</span>
                  </div>
                  <p className="text-xs text-text-primary font-medium italic">API Heartbeat OK</p>
               </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Bugs;
