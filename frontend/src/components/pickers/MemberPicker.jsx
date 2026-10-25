import { useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { adminService } from '../../services/adminService';

/**
 * Member search for Quick Book: queries the server as the admin types, so every active user can be
 * picked — not only the first page the Users tab happened to load (FE-15).
 */
export default function MemberPicker({ initialUsers = [], onPick, compact = false }) {
  const [search, setSearch] = useState('');
  const [results, setResults] = useState(initialUsers);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const term = search.trim();
    if (!term) { setResults(initialUsers); setError(null); return undefined; }
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await adminService.getUsers(1, 20, term);
        if (!cancelled) { setResults(res.data || res); setError(null); }
      } catch {
        if (!cancelled) setError('Search failed — try again');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 250);
    return () => { cancelled = true; clearTimeout(t); };
  }, [search, initialUsers]);

  return (
    <>
      <div className={compact ? 'p-3 border-b border-border' : 'p-3 border-b border-border bg-bg-secondary/30'}>
        <div className="relative">
          <input
            autoFocus
            type="text"
            placeholder="Search members..."
            aria-label="Search members"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-bg-primary border border-border rounded-xl px-3 py-1.5 text-xs font-bold focus:outline-none focus:border-accent pl-8"
          />
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-secondary/40" size={12} />
        </div>
      </div>
      <div className="max-h-[200px] overflow-auto no-scrollbar" aria-busy={loading}>
        {error ? (
          <div role="alert" className="p-4 text-center text-xs text-red-500 font-bold">{error}</div>
        ) : results.length === 0 ? (
          <div className="p-4 text-center text-xs text-text-secondary font-bold capitalize tracking-widest">
            {loading ? 'Searching…' : 'No users found'}
          </div>
        ) : (
          results.map((u) => (
            <button
              type="button"
              key={u.id}
              onClick={() => onPick(u)}
              className="w-full text-left px-4 py-3 hover:bg-bg-secondary focus:bg-bg-secondary focus:outline-none transition-colors flex flex-col gap-0.5"
            >
              <span className="text-sm font-black text-text-primary">{u.name}</span>
              <span className="text-[10px] text-text-secondary opacity-60">{u.email}</span>
            </button>
          ))
        )}
      </div>
    </>
  );
}
