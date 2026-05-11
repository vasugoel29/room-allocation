import React, { useState } from 'react';
import { Shield, X, Send, AlertTriangle } from 'lucide-react';
import { promotionService } from '../../services/promotionService';
import toast from 'react-hot-toast';

function PromotionModal({ onClose }) {
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (reason.length < 10) {
      toast.error('Please provide a more detailed reason (at least 10 characters).');
      return;
    }


    setLoading(true);
    try {
      await promotionService.requestPromotion(reason);
      toast.success('Request submitted successfully! Admin will review it.');
      onClose();
    } catch (err) {
      toast.error(err.message || 'Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
      <div className="bg-bg-primary w-full max-w-md rounded-3xl shadow-2xl border border-border overflow-hidden animate-in fade-in zoom-in duration-200">
        <div className="p-6 border-b border-border flex justify-between items-center bg-bg-secondary/30">
          <div className="flex items-center gap-3">
            <div className="bg-accent/10 p-2 rounded-xl">
              <Shield className="text-accent" size={24} />
            </div>
            <div>
              <h2 className="text-xl font-black text-text-primary">Request Access</h2>
              <p className="text-[10px] text-text-secondary font-bold uppercase tracking-widest">Student Rep Elevation</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-bg-secondary rounded-xl transition-colors">
            <X size={20} className="text-text-secondary" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          <div className="bg-amber-500/10 border border-amber-500/20 p-4 rounded-2xl flex gap-3">
            <AlertTriangle className="text-amber-500 shrink-0" size={20} />
            <p className="text-xs text-amber-700 font-medium leading-relaxed">
              Requesting <span className="font-bold text-amber-900 uppercase">Student Rep</span> access will allow you to book rooms. Please state your department or project context for the admin to review.
            </p>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-black text-text-secondary uppercase tracking-widest px-1">Reason for Request</label>
            <textarea
              required
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g., I need access to book rooms for the GDSC project meetings..."
              className="w-full bg-bg-secondary border border-border rounded-2xl p-4 text-sm focus:outline-none focus:border-accent min-h-[120px] transition-all font-medium placeholder:text-text-secondary/40"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-accent text-white py-4 rounded-2xl font-black flex items-center justify-center gap-2 hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-50 shadow-lg shadow-accent/20"
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                <Send size={18} />
                Submit Request
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}

export default PromotionModal;
