import { X } from 'lucide-react';
import { useState } from 'react';
import { promotionService } from '../../services/promotionService';
import toast from 'react-hot-toast';

function AdminPromotionActionModal({ isOpen, onClose, selectedPromotionId, promotionStatus, fetchData }) {
  const [adminComment, setAdminComment] = useState('');

  const submitPromotionAction = async () => {
    try {
      await promotionService.handlePromotion(selectedPromotionId, { 
        status: promotionStatus, 
        admin_comment: adminComment 
      });
      onClose();
      fetchData();
      toast.success(`Request ${promotionStatus.toLowerCase()} successfully`);
      setAdminComment('');
    } catch (err) {
      toast.error(err.message || 'Action failed');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
      <div className="bg-bg-primary w-full max-w-sm rounded-[2rem] shadow-2xl border border-border overflow-hidden animate-in fade-in zoom-in duration-200">
        <div className="p-6 border-b border-border flex justify-between items-center bg-bg-secondary/30">
          <h2 className="text-xl font-black text-text-primary">
            {promotionStatus === 'APPROVED' ? 'Approve Request' : 'Reject Request'}
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-bg-secondary rounded-xl transition-colors">
            <X size={20} className="text-text-secondary" />
          </button>
        </div>
        <div className="p-6 space-y-4">
          <p className="text-sm font-medium text-text-secondary">
            Please provide a reason or comment for this decision (optional).
          </p>
          <textarea
            autoFocus
            className="w-full bg-bg-secondary border border-border rounded-xl px-4 py-3 text-sm font-bold focus:outline-none focus:border-accent min-h-[100px] resize-none"
            placeholder="Type your comment here..."
            value={adminComment}
            onChange={(e) => setAdminComment(e.target.value)}
          />
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-3 border border-border rounded-xl font-bold text-sm hover:bg-bg-secondary transition-all"
            >
              Cancel
            </button>
            <button
              onClick={submitPromotionAction}
              className={`flex-1 px-4 py-3 text-white rounded-xl font-bold text-sm shadow-lg transition-all active:scale-95 ${
                promotionStatus === 'APPROVED' ? 'bg-green-500 shadow-green-500/10' : 'bg-red-500 shadow-red-500/10'
              }`}
            >
              Confirm {promotionStatus === 'APPROVED' ? 'Approval' : 'Rejection'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default AdminPromotionActionModal;
