import { useContext } from 'react';
import { AppContext } from '../context/AppContext';
import { User, Mail, Shield, Building, BookOpen, LogOut, Info } from 'lucide-react';
import { getRoleLabel } from '../utils/roleUtils';
import { isAdmin as isAdminUser, teaches } from '../utils/permissions';

/** Read-only: the profile is owned by the institutional directory (college ACL). */
function Profile() {
  const { user, logout } = useContext(AppContext);
  const deptName = user?.academic?.dept || user?.department_name || '';
  const branchName = user?.academic?.branch || user?.branch || '';
  const semNum = user?.academic?.semester ?? user?.semester ?? '';
  const secNum = user?.academic?.section ?? user?.section ?? '';
  const grpNum = user?.academic?.group_no ?? user?.academic?.group ?? user?.group_name ?? '';
  const rollNo = user?.academic?.roll_no || user?.roll_no || '';
  const degree = user?.academic?.degree || user?.degree || '';

  // Display only: which profile details apply to this person.
  const isAdmin = isAdminUser(user);
  const isStudent = !isAdmin && !teaches(user);

  if (!user) return null;

  return (
    <div className="p-3 sm:p-8 max-w-2xl mx-auto w-full h-full overflow-y-auto no-scrollbar flex flex-col pb-28 lg:pb-8">
      {/* Header with Title */}
      <div className="flex justify-between items-center mb-4 sm:mb-8 shrink-0">
        <h1 className="text-2xl sm:text-4xl font-black text-text-primary tracking-tighter capitalize font-display italic">My Profile</h1>
      </div>

      {/* Main Distributed Content Card */}
      <div className="glass p-5 sm:p-10 rounded-[2rem] sm:rounded-[2.5rem] flex flex-col gap-6 sm:gap-8 shadow-xl ring-1 ring-border/20">
        
        {/* TOP: User Info Header */}
        <div className="flex items-center gap-6 pb-6 sm:pb-10 border-b border-border/50 shrink-0">
          <div className="w-16 h-16 sm:w-24 sm:h-24 rounded-[1.5rem] sm:rounded-3xl bg-accent flex items-center justify-center text-white shadow-xl shadow-accent/30 flex-shrink-0 animate-in zoom-in duration-500">
            <User size={32} sm:size={48} strokeWidth={2.5} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="space-y-1">
              <h2 className="text-2xl sm:text-3xl font-black text-text-primary truncate">{user.name}</h2>
              {rollNo && (
                <p className="text-xs font-bold text-text-secondary tracking-wider">
                  Roll No: <span className="text-text-primary font-mono">{rollNo}</span> {degree ? `(${degree})` : ''}
                </p>
              )}
            </div>
            <p className="text-accent font-black capitalize tracking-[0.2em] text-[10px] sm:text-xs bg-accent/10 px-3 py-1 rounded-full inline-block mt-2">
              {getRoleLabel(user.role)}
            </p>
          </div>
        </div>

        {/* MIDDLE: Detailed Info (Grid stretches to fill available height) */}
        <div className="flex-1 py-6 sm:py-10">
          <div className={`grid grid-cols-1 gap-8 sm:gap-10 ${isAdmin ? '' : 'sm:grid-cols-2'}`}>
            <div className="space-y-2">
              <label className="text-[10px] sm:text-xs font-black text-text-secondary capitalize tracking-[0.2em] flex items-center gap-3">
                <Mail size={14} className="text-accent" />
                Email Address
              </label>
              <p className="font-bold text-base sm:text-lg text-text-primary truncate">{user.email}</p>
            </div>

            {/* Admin has no department, Faculty/Student does */}
            {!isAdmin && (
              <div className="space-y-2">
                <label className="text-[10px] sm:text-xs font-black text-text-secondary capitalize tracking-[0.2em] flex items-center gap-3">
                  <Shield size={14} className="text-accent" />
                  Department
                </label>
                <p className="font-bold text-base sm:text-lg text-text-primary">{deptName || 'General'}</p>
              </div>
            )}

            {/* Only Students have Branch and Year/Section */}
            {isStudent && (
              <>
                <div className="space-y-2">
                  <label className="text-[10px] sm:text-xs font-black text-text-secondary capitalize tracking-[0.2em] flex items-center gap-3">
                    <Building size={14} className="text-accent" />
                    Branch / Program
                  </label>
                  <p className="font-bold text-base sm:text-lg text-text-primary">{branchName || 'Not set'}</p>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] sm:text-xs font-black text-text-secondary capitalize tracking-[0.2em] flex items-center gap-3">
                    <BookOpen size={14} className="text-accent" />
                    Semester, Section & Group
                  </label>
                  <p className="font-bold text-base sm:text-lg text-text-primary">
                    {semNum ? `Semester ${semNum}` : 'No Semester'}
                    {secNum ? ` · Section ${secNum}` : ''}
                    {grpNum ? ` · Group ${grpNum}` : ''}
                  </p>
                </div>
              </>
            )}
          </div>
          <p className="mt-8 flex items-start gap-2 text-[11px] sm:text-xs font-bold text-text-secondary">
            <Info size={14} className="text-accent shrink-0 mt-0.5" />
            These details come from the institutional directory. Contact the academic office to correct them.
          </p>
        </div>

        {/* BOTTOM: Preferences and Account Actions */}
        <div className="pt-6 sm:pt-10 border-t border-border/50 shrink-0">
          <button 
            onClick={logout}
            className="w-full flex items-center justify-center gap-4 py-4 sm:py-5 rounded-3xl bg-red-500/10 text-red-600 font-black text-sm sm:text-base hover:bg-red-500/20 active:scale-95 transition-all border border-red-500/20"
          >
            <LogOut size={20} />
            Logout Securely
          </button>
        </div>
      </div>
    </div>
  );
}

export default Profile;

