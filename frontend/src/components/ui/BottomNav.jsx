import { Plus } from 'lucide-react';

const BottomNav = ({ currentPage, setCurrentPage, user, tabs = [], pendingTransferCount }) => {

  const isViewer = user?.role === 'VIEWER';
  const useFourCol = isViewer || user?.role === 'admin';

  return (
    <nav className={`fixed bottom-0 left-0 right-0 bg-bg-secondary/90 backdrop-blur-xl border-t border-border px-2 py-2 grid ${useFourCol ? `grid-cols-${tabs.length}` : 'grid-cols-5'} items-center z-40 lg:hidden pb-safe shadow-2xl transition-all duration-300`}>
      {/* For roles with 4 or fewer tabs: Just the tabs linearly */}
      {useFourCol ? (



        tabs.map((tab) => {
          const Icon = tab.icon;
          const { id, label } = tab;
          const isActive = currentPage === id;
          return (
            <button
              key={id}
              onClick={() => setCurrentPage(id)}
              className={`flex flex-col items-center gap-1 transition-all outline-none ${isActive ? 'text-accent scale-105' : 'text-text-secondary'}`}
            >
              <div className={`p-1.5 rounded-xl transition-all ${isActive ? 'bg-accent/10' : ''}`}>
                <Icon size={22} strokeWidth={isActive ? 2.5 : 2} />
              </div>
              <span className="text-[9px] font-black uppercase tracking-widest">{label}</span>
            </button>
          );
        })
      ) : (
        /* For Reps/Faculty/Admin: 5-slot grid with center button */
        <>
          {tabs.slice(0, 2).map((tab) => {
            const Icon = tab.icon;
            const { id, label } = tab;
            const isActive = currentPage === id;
            return (
              <button
                key={id}
                onClick={() => setCurrentPage(id)}
                className={`flex flex-col items-center gap-1 transition-all outline-none ${isActive ? 'text-accent scale-105' : 'text-text-secondary'}`}
              >
                <div className={`p-1.5 rounded-xl transition-all ${isActive ? 'bg-accent/10' : ''} relative`}>
                  <Icon size={22} strokeWidth={isActive ? 2.5 : 2} />
                  {id === 'history' && user?.role !== 'admin' && pendingTransferCount > 0 && (
                    <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white rounded-full flex items-center justify-center text-[7px] font-black border-2 border-bg-secondary animate-pulse">
                      {pendingTransferCount}
                    </span>
                  )}
                </div>
                <span className="text-[9px] font-black uppercase tracking-widest">{label}</span>
              </button>
            );
          })}

          <div className="flex justify-center -mt-10">
            <button 
              onClick={() => setCurrentPage('booking-mobile')}
              className="w-14 h-14 rounded-full flex items-center justify-center shadow-2xl transition-all active:scale-95 border-4 border-bg-secondary bg-accent text-white shadow-accent/30"
            >
              <Plus size={32} strokeWidth={3} />
            </button>
          </div>

          {tabs.slice(2).map((tab) => {
            const Icon = tab.icon;
            const { id, label } = tab;
            const isActive = currentPage === id;
            return (
              <button
                key={id}
                onClick={() => setCurrentPage(id)}
                className={`flex flex-col items-center gap-1 transition-all outline-none ${isActive ? 'text-accent scale-105' : 'text-text-secondary'}`}
              >
                <div className={`p-1.5 rounded-xl transition-all ${isActive ? 'bg-accent/10' : ''}`}>
                  <Icon size={22} strokeWidth={isActive ? 2.5 : 2} />
                </div>
                <span className="text-[9px] font-black uppercase tracking-widest">{label}</span>
              </button>
            );
          })}
        </>
      )}
    </nav>
  );
};

export default BottomNav;

