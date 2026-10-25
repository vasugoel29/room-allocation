import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, Check, X } from 'lucide-react';
import { notificationService } from '../../services/notificationService';

const POLL_MS = 60_000;

const ago = (iso) => {
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return new Date(iso).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short' });
};

/**
 * Header bell with the unread count and an inbox panel. The count is polled every minute and
 * when the tab regains focus; the list loads when the panel opens.
 */
export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const panelRef = useRef(null);
  const buttonRef = useRef(null);
  const navigate = useNavigate();

  const refreshCount = useCallback(async () => {
    try { setUnread(await notificationService.unreadCount()); } catch { /* keep the last count */ }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await notificationService.list({ limit: 20 });
      setItems(res.data);
      setUnread(res.unread);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshCount();
    const t = setInterval(refreshCount, POLL_MS);
    const onFocus = () => refreshCount();
    window.addEventListener('focus', onFocus);
    return () => { clearInterval(t); window.removeEventListener('focus', onFocus); };
  }, [refreshCount]);

  useEffect(() => { if (open) load(); }, [open, load]);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (!panelRef.current?.contains(e.target) && !buttonRef.current?.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => { if (e.key === 'Escape') { setOpen(false); buttonRef.current?.focus(); } };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const openItem = async (n) => {
    if (!n.read_at) {
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x)));
      setUnread((u) => Math.max(0, u - 1));
      notificationService.markRead(n.id).catch(() => refreshCount());
    }
    setOpen(false);
    if (n.link) navigate(n.link);
  };

  const dismiss = async (n) => {
    setItems((prev) => prev.filter((x) => x.id !== n.id));
    if (!n.read_at) setUnread((u) => Math.max(0, u - 1));
    try { await notificationService.dismiss(n.id); } catch (err) { setError(err.message); load(); }
  };

  const readAll = async () => {
    try {
      await notificationService.markAllRead();
      const now = new Date().toISOString();
      setItems((prev) => prev.map((x) => ({ ...x, read_at: x.read_at || now })));
      setUnread(0);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}
        className="relative p-2 rounded-xl text-text-secondary hover:text-text-primary hover:bg-surface-highest/20 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <Bell size={20} />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 bg-red-500 text-white rounded-full text-[10px] font-black flex items-center justify-center" aria-hidden="true">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        <>
          <div 
            className="fixed inset-0 bg-black/40 z-[190]" 
            onClick={() => setOpen(false)} 
            aria-hidden="true" 
          />
          <div
            ref={panelRef}
            role="dialog"
            aria-label="Notifications"
            className="fixed sm:absolute inset-x-3 sm:inset-x-auto top-[3.75rem] sm:top-full sm:right-0 sm:mt-2 sm:w-96 max-h-[70vh] flex flex-col bg-surface-low border border-border-subtle rounded-2xl shadow-2xl z-[200] overflow-hidden animate-in fade-in zoom-in-95 duration-150"
          >
          <div className="flex items-center justify-between px-4 py-3 border-b border-border-subtle">
            <h3 className="text-sm font-black text-text-primary">Notifications</h3>
            {unread > 0 && (
              <button type="button" onClick={readAll} className="text-xs font-bold text-primary hover:underline flex items-center gap-1">
                <Check size={12} /> Mark all read
              </button>
            )}
          </div>
          <div className="overflow-y-auto">
            {error && <div role="alert" className="px-4 py-3 text-xs font-bold text-red-500">{error}</div>}
            {!error && loading && items.length === 0 && <div className="px-4 py-6 text-center text-xs text-text-secondary">Loading…</div>}
            {!error && !loading && items.length === 0 && (
              <div className="px-4 py-8 text-center text-sm text-text-secondary">You&apos;re all caught up.</div>
            )}
            <ul>
              {items.map((n) => (
                <li key={n.id} className={`group flex items-start gap-2 px-4 py-3 border-b border-border/10 ${n.read_at ? '' : 'bg-primary/5'}`}>
                  <button type="button" onClick={() => openItem(n)} className="flex-1 text-left min-w-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-lg">
                    <span className="flex items-center gap-2">
                      {!n.read_at && <span className="w-2 h-2 rounded-full bg-primary shrink-0" aria-label="Unread" />}
                      <span className="text-sm font-bold text-text-primary truncate">{n.title}</span>
                    </span>
                    <span className="block text-xs text-text-secondary mt-0.5 line-clamp-2">{n.body}</span>
                    <span className="block text-[10px] text-text-secondary/70 mt-1">{ago(n.created_at)}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => dismiss(n)}
                    aria-label={`Dismiss: ${n.title}`}
                    className="p-1 rounded-lg text-text-secondary/60 hover:text-text-primary hover:bg-surface-highest/20 opacity-60 group-hover:opacity-100 focus:opacity-100"
                  >
                    <X size={14} />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
        </>
      )}
    </div>
  );
}
