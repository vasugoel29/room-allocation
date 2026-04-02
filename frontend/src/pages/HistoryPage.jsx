import HistoryView from '../features/history/HistoryView';

function HistoryPageContent() {
  return <HistoryView />;
}

function HistoryPage({ onBack }) {
  return (
    <div className="flex flex-col h-full w-full bg-bg-primary">
      <div className="p-4 border-b border-border flex items-center gap-4 bg-bg-secondary/30">
        <button onClick={onBack} className="p-2 hover:bg-black/5 rounded-full text-text-secondary">
          <ArrowLeft size={24} />
        </button>
        <h1 className="text-xl font-bold text-text-primary">My Bookings</h1>
      </div>
      <div className="flex-1 overflow-hidden relative">
        <HistoryPageContent />
      </div>
    </div>
  );
}

export default HistoryPage;
