import React, { useState, useEffect, useContext } from 'react';
import { Send, Clock, CheckCircle2, XCircle, AlertCircle, Sparkles, ChevronRight, UserPlus } from 'lucide-react';
import { promotionService } from '../services/promotionService';
import { AppContext } from '../context/AppContext';
import toast from 'react-hot-toast';

const PromotionRequest = () => {
  const { user } = useContext(AppContext);
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [currentRequest, setCurrentRequest] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchStatus = async () => {
    try {
      const data = await promotionService.getMyRequest();
      setCurrentRequest(data);
    } catch (err) {
      console.error('Failed to fetch request status', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!reason.trim()) {
      toast.error('Please provide a reason for your request');
      return;
    }

    setIsSubmitting(true);
    try {
      await promotionService.requestPromotion(reason);
      toast.success('Request submitted successfully!');
      setReason('');
      fetchStatus();
    } catch (err) {
      toast.error(err.message || 'Failed to submit request');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent"></div>
      </div>
    );
  }

  // If already a rep
  if (user?.role === 'STUDENT_REP') {
    return (
      <div className="flex flex-col items-center justify-center h-full max-w-md mx-auto p-6 text-center space-y-6 animate-in fade-in zoom-in duration-500">
        <div className="w-24 h-24 bg-accent/20 text-accent rounded-3xl flex items-center justify-center shadow-2xl shadow-accent/20">
          <Sparkles size={48} />
        </div>
        <div className="space-y-2">
          <h2 className="text-3xl font-black text-text-primary tracking-tight italic uppercase">You are a Rep!</h2>
          <p className="text-sm font-bold text-text-secondary uppercase tracking-widest leading-relaxed">
            Congratulations! You already have Student Representative privileges. You can now book and manage rooms for your class.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full space-y-6 p-5 sm:p-8 overflow-y-auto no-scrollbar">
      <div className="flex flex-col">
        <h1 className="text-2xl font-black text-text-primary tracking-tighter uppercase italic">Representative Request</h1>
        <p className="text-[10px] text-text-secondary font-black uppercase tracking-widest mt-1">Upgrade your account to manage class bookings</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Left: Request Form */}
        <div className="space-y-6">
          <div className="glass rounded-[2rem] p-8 border border-white/10 relative overflow-hidden shadow-2xl">
            <div className="absolute -top-24 -right-24 w-48 h-48 bg-accent/10 rounded-full blur-3xl" />
            
            <div className="relative space-y-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-accent text-white rounded-2xl flex items-center justify-center shadow-xl shadow-accent/20">
                  <UserPlus size={24} />
                </div>
                <div>
                  <h3 className="text-sm font-black text-text-primary uppercase tracking-widest">Apply for Rep Status</h3>
                  <p className="text-[10px] text-text-secondary font-bold uppercase tracking-wider">Help your class find rooms easily</p>
                </div>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-text-secondary uppercase tracking-[0.2em] ml-2">Reason for Request</label>
                  <textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="E.g., I am the official CR for Section IT-2, 3rd Year..."
                    className="w-full bg-bg-primary/50 border border-border rounded-2xl p-4 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-accent/50 min-h-[120px] transition-all"
                    disabled={currentRequest?.status === 'PENDING'}
                  />
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting || currentRequest?.status === 'PENDING'}
                  className="w-full bg-accent text-white font-black py-4 rounded-2xl shadow-lg shadow-accent/20 active:scale-[0.98] transition-all flex items-center justify-center gap-2 text-xs uppercase tracking-widest disabled:opacity-50 disabled:grayscale"
                >
                  {isSubmitting ? 'Submitting...' : currentRequest?.status === 'PENDING' ? 'Request Pending' : 'Submit Request'}
                  <Send size={16} />
                </button>
              </form>
            </div>
          </div>

          <div className="bg-bg-secondary/50 border border-border rounded-2xl p-6 space-y-4">
            <h4 className="text-[10px] font-black text-text-secondary uppercase tracking-[0.2em]">Why become a Rep?</h4>
            <div className="space-y-3">
              {[
                "Book rooms for your entire section",
                "Reschedule or cancel scheduled classes",
                "Help faculty find alternative rooms",
                "Directly manage your group's timetable"
              ].map((benefit, i) => (
                <div key={i} className="flex items-start gap-3">
                  <div className="mt-1 w-4 h-4 rounded-full bg-accent/10 text-accent flex items-center justify-center shrink-0">
                    <CheckCircle2 size={12} />
                  </div>
                  <p className="text-[11px] font-bold text-text-primary leading-tight uppercase tracking-tight">{benefit}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right: Status Tracker */}
        <div className="space-y-6">
          <div className="flex flex-col">
            <h3 className="text-xs font-black text-text-secondary uppercase tracking-[0.2em] ml-2">Current Status</h3>
            <div className="h-px bg-border flex-1 mt-2 mb-4" />
          </div>

          {!currentRequest ? (
            <div className="flex flex-col items-center justify-center py-20 bg-bg-secondary/30 rounded-[2rem] border border-dashed border-border text-center space-y-4">
              <div className="w-16 h-16 bg-bg-primary rounded-3xl flex items-center justify-center text-text-secondary/20 border border-border">
                <AlertCircle size={32} />
              </div>
              <div>
                <p className="text-[10px] font-black text-text-secondary uppercase tracking-widest">No Active Request</p>
                <p className="text-[11px] font-bold text-text-secondary/60 mt-1 max-w-[200px]">Fill out the form to the left to apply for representative status.</p>
              </div>
            </div>
          ) : (
            <div className="glass rounded-[2rem] p-8 border border-white/10 space-y-8 animate-in slide-in-from-right-4 duration-500">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-black text-text-secondary uppercase tracking-widest">Request Status</p>
                  <div className="flex items-center gap-2 mt-2">
                    {currentRequest.status === 'PENDING' && (
                       <>
                         <Clock className="text-amber-500" size={18} />
                         <span className="text-sm font-black text-amber-500 uppercase italic">Pending Review</span>
                       </>
                    )}
                    {currentRequest.status === 'APPROVED' && (
                       <>
                         <CheckCircle2 className="text-green-500" size={18} />
                         <span className="text-sm font-black text-green-500 uppercase italic">Approved</span>
                       </>
                    )}
                    {currentRequest.status === 'REJECTED' && (
                       <>
                         <XCircle className="text-red-500" size={18} />
                         <span className="text-sm font-black text-red-500 uppercase italic">Rejected</span>
                       </>
                    )}
                  </div>
                </div>
                <div className="p-3 bg-bg-primary/50 rounded-2xl border border-border">
                   <Clock size={20} className="text-text-secondary opacity-50" />
                </div>
              </div>

              <div className="space-y-4">
                <div className="space-y-1">
                  <p className="text-[10px] font-black text-text-secondary uppercase tracking-widest ml-1">Your Reason</p>
                  <div className="p-4 bg-bg-primary/30 rounded-2xl border border-border">
                    <p className="text-xs font-medium text-text-primary leading-relaxed italic">"{currentRequest.reason}"</p>
                  </div>
                </div>

                {currentRequest.admin_comment && (
                  <div className="space-y-1">
                    <p className="text-[10px] font-black text-text-secondary uppercase tracking-widest ml-1">Admin Comment</p>
                    <div className="p-4 bg-accent/5 rounded-2xl border border-accent/10">
                      <p className="text-xs font-bold text-accent leading-relaxed italic">{currentRequest.admin_comment}</p>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between pt-4 border-t border-border">
                <p className="text-[9px] font-black text-text-secondary uppercase tracking-widest">
                  Submitted on {new Date(currentRequest.created_at).toLocaleDateString()}
                </p>
                <div className="flex items-center gap-1 text-[9px] font-black text-accent uppercase tracking-widest">
                   Live Tracking <ChevronRight size={10} />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PromotionRequest;
