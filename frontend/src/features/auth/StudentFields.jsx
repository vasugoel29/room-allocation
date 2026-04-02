import React from "react";
import { BookOpen, Calendar, Hash } from "lucide-react";

function StudentFields({
  branch,
  setBranch,
  year,
  setYear,
  isYearOpen,
  setIsYearOpen,
  section,
  setSection,
  isSectionOpen,
  setIsSectionOpen,
}) {
  return (
    <>
      <div className="space-y-2">
        <label className="text-[10px] font-black text-text-secondary uppercase tracking-[0.1em] px-1">
          Branch
        </label>
        <div className="relative">
          <BookOpen
            size={16}
            className="absolute left-4 top-1/2 -translate-y-1/2 text-text-secondary/40"
          />
          <input
            type="text"
            className="w-full bg-bg-primary border border-border rounded-xl pl-11 pr-4 py-3 text-sm font-bold text-text-primary focus:outline-none focus:border-accent transition-all placeholder:text-text-secondary/30"
            placeholder="e.g. CSE, IT, ECE"
            value={branch}
            onChange={(e) => setBranch(e.target.value)}
            required
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <label className="text-[10px] font-black text-text-secondary uppercase tracking-[0.1em] px-1">
            Year
          </label>
          <div className="relative">
            <div
              className="relative cursor-pointer"
              onClick={() => setIsYearOpen(!isYearOpen)}
            >
              <Calendar
                size={16}
                className="absolute left-4 top-1/2 -translate-y-1/2 text-text-secondary/40 z-10"
              />
              <input
                readOnly
                type="text"
                value={
                  year === 1
                    ? "1st Year"
                    : year === 2
                      ? "2nd Year"
                      : year === 3
                        ? "3rd Year"
                        : "4th Year"
                }
                className="w-full bg-bg-primary border border-border rounded-xl pl-10 pr-8 py-3.5 text-sm font-bold text-text-primary focus:outline-none focus:border-accent transition-all cursor-pointer hover:bg-bg-secondary/30 pointer-events-none"
                required
              />
              <div className="absolute right-4 top-1/2 -translate-y-1/2 text-text-secondary/50">
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 12 12"
                  fill="none"
                  className={`transition-transform duration-200 ${isYearOpen ? "rotate-180" : ""}`}
                >
                  <path
                    d="M2.5 4.5L6 8L9.5 4.5"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
            </div>

            {isYearOpen && (
              <div className="absolute top-full left-0 right-0 mt-2 bg-bg-secondary border border-border rounded-xl shadow-2xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200 ring-1 ring-black/5">
                {[1, 2, 3, 4].map((y) => (
                  <div
                    key={y}
                    onClick={() => {
                      setYear(y);
                      setIsYearOpen(false);
                    }}
                    className={`p-3 cursor-pointer border-b border-border last:border-0 transition-colors flex items-center gap-2 hover:bg-accent/5 ${parseInt(year) === y ? "bg-accent/10 font-bold border-l-4 border-l-accent" : "font-medium"}`}
                  >
                    <span className="text-sm">
                      {y === 1
                        ? "1st Year"
                        : y === 2
                          ? "2nd Year"
                          : y === 3
                            ? "3rd Year"
                            : "4th Year"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-[10px] font-black text-text-secondary uppercase tracking-[0.1em] px-1">
            Section
          </label>
          <div className="relative">
            <div
              className="relative cursor-pointer"
              onClick={() => setIsSectionOpen(!isSectionOpen)}
            >
              <Hash
                size={16}
                className="absolute left-4 top-1/2 -translate-y-1/2 text-text-secondary/40 z-10"
              />
              <input
                readOnly
                type="text"
                value={`Section ${section}`}
                className="w-full bg-bg-primary border border-border rounded-xl pl-10 pr-8 py-3.5 text-sm font-bold text-text-primary focus:outline-none focus:border-accent transition-all cursor-pointer hover:bg-bg-secondary/30 pointer-events-none"
                required
              />
              <div className="absolute right-4 top-1/2 -translate-y-1/2 text-text-secondary/50">
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 12 12"
                  fill="none"
                  className={`transition-transform duration-200 ${isSectionOpen ? "rotate-180" : ""}`}
                >
                  <path
                    d="M2.5 4.5L6 8L9.5 4.5"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
            </div>

            {isSectionOpen && (
              <div className="absolute top-full left-0 right-0 mt-2 bg-bg-secondary border border-border rounded-xl shadow-2xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200 ring-1 ring-black/5">
                {[1, 2, 3].map((s) => (
                  <div
                    key={s}
                    onClick={() => {
                      setSection(s);
                      setIsSectionOpen(false);
                    }}
                    className={`p-3 cursor-pointer border-b border-border last:border-0 transition-colors flex items-center gap-2 hover:bg-accent/5 ${parseInt(section) === s ? "bg-accent/10 font-bold border-l-4 border-l-accent" : "font-medium"}`}
                  >
                    <span className="text-sm">Section {s}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

export default StudentFields;
