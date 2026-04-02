import React, { useState, useContext } from 'react';
import { AppContext } from '../context/AppContext';
import { User, Mail, Shield, Building, BookOpen, Edit2, Save, X, LogOut, Sun, Moon } from 'lucide-react';
import { authService } from '../services/authService';
import toast from 'react-hot-toast';
import { getRoleLabel } from '../utils/roleUtils';
import CustomSelect from '../components/ui/CustomSelect';

function Profile() {
  const { user, setUser, logout, theme, setTheme, departments } = useContext(AppContext);
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState({
    name: user?.name || '',
    branch: user?.branch || '',
    year: user?.year || '',
    section: user?.section || '',
    departmentName: user?.department_name || '',
  });
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      const updatedUser = await authService.updateUser(user.id, formData);
      setUser(prev => ({ 
        ...prev, 
        ...updatedUser,
        department_name: formData.departmentName
      }));
      setIsEditing(false);
      toast.success('Profile updated successfully!');
    } catch (err) {
      toast.error(err.message || 'Failed to update profile');
    } finally {
      setLoading(false);
    }
  };

  if (!user) return null;

  const departmentOptions = departments.map(d => ({ value: d.name, label: d.name }));

  return (
    <div className="p-4 sm:p-8 max-w-2xl mx-auto w-full h-full overflow-hidden flex flex-col no-scrollbar pb-2 lg:pb-8">
      {/* Header with Title */}
      <div className="flex justify-between items-center mb-6 sm:mb-10 shrink-0">
        <h1 className="text-3xl sm:text-4xl font-black text-text-primary tracking-tighter">My Profile</h1>
        {!isEditing ? (
          <button 
            onClick={() => setIsEditing(true)}
            className="flex items-center gap-2 bg-accent text-white px-4 py-2 rounded-xl font-bold text-sm shadow-lg shadow-accent/20 active:scale-95 transition-all"
          >
            <Edit2 size={16} />
            Edit Profile
          </button>
        ) : (
          <div className="flex gap-2">
            <button 
              onClick={() => setIsEditing(false)}
              className="p-2 bg-bg-secondary border border-border rounded-xl text-text-secondary hover:text-text-primary transition-all"
            >
              <X size={20} />
            </button>
            <button 
              onClick={handleSave}
              disabled={loading}
              className="flex items-center gap-2 bg-accent text-white px-4 py-2 rounded-xl font-bold text-sm shadow-lg shadow-accent/20 active:scale-95 transition-all"
            >
              <Save size={16} />
              {loading ? '...' : 'Save'}
            </button>
          </div>
        )}
      </div>

      {/* Main Distributed Content Card */}
      <div className="glass p-6 sm:p-10 rounded-[2.5rem] border border-border/50 flex-1 flex flex-col justify-between overflow-hidden shadow-2xl">
        
        {/* TOP: User Info Header */}
        <div className="flex items-center gap-6 pb-6 sm:pb-10 border-b border-border/50 shrink-0">
          <div className="w-16 h-16 sm:w-24 sm:h-24 rounded-[1.5rem] sm:rounded-3xl bg-accent flex items-center justify-center text-white shadow-xl shadow-accent/30 flex-shrink-0 animate-in zoom-in duration-500">
            <User size={32} sm:size={48} strokeWidth={2.5} />
          </div>
          <div className="min-w-0 flex-1">
            {isEditing ? (
              <input 
                name="name"
                value={formData.name}
                onChange={handleChange}
                placeholder="Full Name"
                className="text-2xl sm:text-3xl font-black text-text-primary bg-bg-primary border border-border rounded-xl px-3 py-2 focus:outline-none focus:border-accent w-full"
              />
            ) : (
              <h2 className="text-2xl sm:text-3xl font-black text-text-primary truncate">{user.name}</h2>
            )}
            <p className="text-accent font-black uppercase tracking-[0.2em] text-[10px] sm:text-xs bg-accent/10 px-3 py-1 rounded-full inline-block mt-2">
              {getRoleLabel(user.role)}
            </p>
          </div>
        </div>

        {/* MIDDLE: Detailed Info (Grid stretches to fill available height) */}
        <div className="flex-1 py-6 sm:py-10">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 sm:gap-10">
            <div className="space-y-2">
              <label className="text-[10px] sm:text-xs font-black text-text-secondary uppercase tracking-[0.2em] flex items-center gap-3">
                <Mail size={14} className="text-accent" />
                Email Address
              </label>
              <p className="font-bold text-base sm:text-lg text-text-primary truncate">{user.email}</p>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] sm:text-xs font-black text-text-secondary uppercase tracking-[0.2em] flex items-center gap-3">
                <Shield size={14} className="text-accent" />
                Department
              </label>
              {isEditing ? (
                <CustomSelect 
                  value={formData.departmentName}
                  onChange={(val) => setFormData(prev => ({ ...prev, departmentName: val }))}
                  options={departmentOptions}
                  placeholder="Select Department"
                />
              ) : (
                <p className="font-bold text-base sm:text-lg text-text-primary">{user.department_name || 'General'}</p>
              )}
            </div>

            <div className="space-y-2">
              <label className="text-[10px] sm:text-xs font-black text-text-secondary uppercase tracking-[0.2em] flex items-center gap-3">
                <Building size={14} className="text-accent" />
                Branch / Program
              </label>
              {isEditing ? (
                <input 
                  name="branch"
                  value={formData.branch}
                  onChange={handleChange}
                  placeholder="Branch"
                  className="w-full bg-bg-primary border border-border rounded-xl px-3 py-2.5 text-sm sm:text-base font-bold focus:outline-none focus:border-accent"
                />
              ) : (
                <p className="font-bold text-base sm:text-lg text-text-primary">{user.branch || 'Not set'}</p>
              )}
            </div>

            <div className="space-y-2">
              <label className="text-[10px] sm:text-xs font-black text-text-secondary uppercase tracking-[0.2em] flex items-center gap-3">
                <BookOpen size={14} className="text-accent" />
                Year & Section
              </label>
              <div className="flex gap-3">
                {isEditing ? (
                  <>
                    <input 
                      name="year"
                      value={formData.year}
                      onChange={handleChange}
                      placeholder="Year"
                      className="w-20 bg-bg-primary border border-border rounded-xl px-3 py-2.5 text-sm sm:text-base font-bold focus:outline-none focus:border-accent"
                    />
                    <input 
                      name="section"
                      value={formData.section}
                      onChange={handleChange}
                      placeholder="Sec"
                      className="w-20 bg-bg-primary border border-border rounded-xl px-3 py-2.5 text-sm sm:text-base font-bold focus:outline-none focus:border-accent"
                    />
                  </>
                ) : (
                  <p className="font-bold text-base sm:text-lg text-text-primary">
                    {user.year ? `Year ${user.year}` : ''} {user.section ? `Section ${user.section}` : 'Not set'}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* BOTTOM: Preferences and Account Actions */}
        <div className="pt-6 sm:pt-10 border-t border-border/50 space-y-6 sm:space-y-8 shrink-0">
          <div className="flex items-center justify-between pl-6 pr-4 py-3 sm:py-4 bg-bg-secondary/50 rounded-2xl sm:rounded-full border border-border/50 group">
            <div className="flex flex-col">
              <p className="text-sm sm:text-base font-black text-text-primary uppercase tracking-widest">Theme Mode</p>
              <p className="text-[10px] sm:text-xs text-text-secondary font-bold">Switch Appearance</p>
            </div>
            <button 
              onClick={() => setTheme(prev => prev === 'light' ? 'dark' : 'light')}
              className={`w-24 sm:w-28 h-10 rounded-full relative transition-all duration-300 ${theme === 'dark' ? 'bg-accent/20' : 'bg-slate-200/50'}`}
              aria-label="Toggle Theme"
            >
              <div className="absolute inset-0 flex items-center justify-between px-3">
                <Sun size={18} className={`text-amber-500 transition-all ${theme === 'light' ? 'scale-100' : 'scale-0 opacity-0'}`} />
                <Moon size={18} className={`text-accent transition-all ${theme === 'dark' ? 'scale-100' : 'scale-0 opacity-0'}`} />
              </div>
              <div className={`absolute top-0 h-full aspect-square rounded-full bg-white shadow-xl flex items-center justify-center transition-all ${theme === 'dark' ? 'left-0' : 'left-14 sm:left-18'}`} />
            </button>
          </div>

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
