import React, { useEffect, useRef, useState } from 'react';
import { Search, Sun, Moon, UserCircle, LogOut, User, Menu } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { useNavigate } from 'react-router-dom';
import { UserProfile } from '../../types';
import { NotificationBell } from './NotificationBell';

interface HeaderProps {
    user: UserProfile;
    onToggleSidebar?: () => void;
}

export const Header: React.FC<HeaderProps> = ({ user, onToggleSidebar }) => {
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [dropdown_open, set_dropdown_open] = useState(false);
  const dropdown_ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!dropdown_open) return;
    const handler = (e: MouseEvent) => {
      if (!dropdown_ref.current?.contains(e.target as Node)) set_dropdown_open(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [dropdown_open]);

  const go = (path: string) => {
    set_dropdown_open(false);
    navigate(path);
  };

  return (
    <header className="h-20 border-b border-border-subtle flex items-center justify-between px-4 lg:px-8 bg-bg-main/50 backdrop-blur-md sticky top-0 z-50">
      <div className="flex items-center gap-3">
        <button
          onClick={onToggleSidebar}
          className="lg:hidden p-2 rounded-xl text-text-muted hover:text-text-main hover:bg-white/5 transition-all"
          aria-label="Toggle sidebar"
        >
          <Menu size={22} />
        </button>
        <div className="relative w-64 sm:w-96 max-w-full">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted" size={18} />
          <input
            type="text"
            placeholder="Search assets, users, or reports..."
            className="w-full bg-black/5 dark:bg-white/5 border border-border-subtle rounded-full py-2.5 pl-12 pr-4 text-sm text-text-main focus:outline-none focus:ring-2 focus:ring-brand-emerald/20 transition-all shadow-sm shadow-black/5"
          />
        </div>
      </div>

      <div className="flex items-center gap-6">
        <button
          onClick={toggleTheme}
          className="p-2.5 rounded-xl bg-black/5 dark:bg-white/5 text-text-muted hover:text-brand-emerald transition-all border border-border-subtle"
          title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
        >
          {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
        </button>

        <NotificationBell />
        <div className="h-8 w-[1px] bg-border-subtle" />

        {/* Avatar + dropdown */}
        <div className="relative" ref={dropdown_ref}>
          <button
            onClick={() => set_dropdown_open(o => !o)}
            className="flex items-center gap-3 group"
          >
            <div className="text-right hidden sm:block">
              <p className="text-sm font-bold text-text-main">
                {user.firstName} {user.lastName}
              </p>
              <p className="text-[10px] text-text-muted uppercase font-semibold">Super Admin</p>
            </div>
            <div className={`w-10 h-10 rounded-xl overflow-hidden ring-2 transition-all bg-white/5 flex items-center justify-center ${dropdown_open ? 'ring-brand-emerald/50' : 'ring-transparent group-hover:ring-brand-emerald/50'}`}>
              {user.avatar
                ? <img src={user.avatar} alt="User" className="w-full h-full object-cover" />
                : <UserCircle size={28} className="text-text-muted" />}
            </div>
          </button>

          {/* Dropdown */}
          {dropdown_open && (
            <div className="absolute right-0 top-[calc(100%+10px)] w-44 rounded-2xl border border-white/8 bg-bg-aside backdrop-blur-xl shadow-2xl shadow-black/40 overflow-hidden z-[200]">
              <button
                onClick={() => go('/dashboard/profile')}
                className="w-full flex items-center gap-3 px-4 py-3 text-sm text-text-main hover:bg-white/6 transition-colors"
              >
                <User size={15} className="text-text-muted shrink-0" />
                Profile
              </button>
              <div className="h-px bg-white/6 mx-3" />
              <button
                onClick={() => go('/login')}
                className="w-full flex items-center gap-3 px-4 py-3 text-sm text-red-400 hover:bg-white/6 transition-colors"
              >
                <LogOut size={15} className="shrink-0" />
                Logout
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
