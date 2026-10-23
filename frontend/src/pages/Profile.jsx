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
    <div className="p-3 sm:p-6 max-w-xl mx-auto w-full h-full overflow-y-auto no-scrollbar flex flex-col pb-20 lg:pb-6">
      {/* Main Distributed Content Card */}
      <div className="bg-surface-low border border-border-subtle p-4 sm:p-6 rounded-2xl flex flex-col gap-4 sm:gap-5 shadow-sm">
        
        {/* TOP: User Info Header */}
        <div className="flex items-center gap-4 pb-4 sm:pb-5 border-b border-border-subtle shrink-0">
          <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-2xl bg-accent flex items-center justify-center text-white shadow-sm flex-shrink-0">
            <User size={24} className="sm:hidden" />
            <User size={32} className="hidden sm:block" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="space-y-0.5">
              <h2 className="text-xl sm:text-2xl font-bold text-text-primary truncate font-display">{user.name}</h2>
              {rollNo && (
                <p className="text-xs font-medium text-text-secondary">
                  Roll No: <span className="text-text-primary font-mono font-semibold">{rollNo}</span> {degree ? `(${degree})` : ''}
                </p>
              )}
            </div>
            <p className="text-accent font-semibold text-xs bg-accent/10 px-2.5 py-0.5 rounded-full inline-block mt-1.5">
              {getRoleLabel(user.role)}
            </p>
          </div>
        </div>

        {/* MIDDLE: Detailed Info */}
        <div className="flex-1 py-1 sm:py-2">
          <div className={`grid grid-cols-1 gap-3.5 sm:gap-4 ${isAdmin ? '' : 'sm:grid-cols-2'}`}>
            <div className="space-y-1">
              <label className="text-xs font-medium text-text-secondary flex items-center gap-2">
                <Mail size={13} className="text-accent" />
                Email Address
              </label>
              <p className="font-semibold text-sm sm:text-base text-text-primary truncate">{user.email}</p>
            </div>

            {/* Admin has no department, Faculty/Student does */}
            {!isAdmin && (
              <div className="space-y-1">
                <label className="text-xs font-medium text-text-secondary flex items-center gap-2">
                  <Shield size={13} className="text-accent" />
                  Department
                </label>
                <p className="font-semibold text-sm sm:text-base text-text-primary">{deptName || 'General'}</p>
              </div>
            )}

            {/* Only Students have Branch and Year/Section */}
            {isStudent && (
              <>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-text-secondary flex items-center gap-2">
                    <Building size={13} className="text-accent" />
                    Branch / Program
                  </label>
                  <p className="font-semibold text-sm sm:text-base text-text-primary">{branchName || 'Not set'}</p>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-medium text-text-secondary flex items-center gap-2">
                    <BookOpen size={13} className="text-accent" />
                    Semester, Section & Group
                  </label>
                  <p className="font-semibold text-sm sm:text-base text-text-primary">
                    {semNum ? `Semester ${semNum}` : 'No Semester'}
                    {secNum ? ` · Section ${secNum}` : ''}
                    {grpNum ? ` · Group ${grpNum}` : ''}
                  </p>
                </div>
              </>
            )}
          </div>
          <p className="mt-4 flex items-start gap-1.5 text-xs text-text-secondary">
            <Info size={13} className="text-accent shrink-0 mt-0.5" />
            These details come from the institutional directory. Contact the academic office to correct them.
          </p>
        </div>

        {/* BOTTOM: Preferences and Account Actions */}
        <div className="pt-3 sm:pt-4 border-t border-border-subtle shrink-0">
          <button 
            onClick={logout}
            className="w-full flex items-center justify-center gap-2 py-2.5 sm:py-3 rounded-xl bg-red-500/10 text-red-500 hover:text-white hover:bg-red-500 font-semibold text-xs sm:text-sm active:scale-95 transition-all border border-red-500/20"
          >
            <LogOut size={16} />
            Logout Securely
          </button>
        </div>
      </div>
    </div>
  );
}

export default Profile;

