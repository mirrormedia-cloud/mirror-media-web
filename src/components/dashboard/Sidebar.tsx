import React, { useCallback, useEffect, useState } from 'react';
import {
  LayoutDashboard,
  PlaySquare,
  Film,
  BarChart3,
  Settings,
  LogOut,
  Layers,
  ChevronDown,
  PlusCircle,
  List,
  Folder,
  Video,
  Calendar,
  CalendarClock,
  Plug,
  Activity,
  UploadCloud,
  Bell,
} from 'lucide-react';
import { fetch_unread_count } from '../../services/notification_service';
import { useAuth } from '../../context/AuthContext';
import { useNavigate, useLocation } from 'react-router-dom';
import { useOTT } from '../../context/OTTContext';

interface SidebarItemProps {
  icon: React.ElementType;
  label: string;
  isActive: boolean;
  onClick: () => void;
  isSubItem?: boolean;
  /** Optional favicon URL — rendered as an <img> instead of the lucide icon
   *  when provided. Falls back to the icon if the image fails to load. */
  iconUrl?: string | null;
  /** Unread badge count — shown as a red pill on the right */
  badge?: number;
}

const mainActiveClass = 'border-transparent bg-transparent text-text-main';
const subActiveClass = 'border-transparent bg-transparent text-text-main';
const inactiveClass = 'border-transparent bg-transparent text-text-muted hover:text-text-main';
const gradientTextClass = 'text-[#fffff]';

const SidebarItem: React.FC<SidebarItemProps> = ({ icon: Icon, label, isActive, onClick, isSubItem, iconUrl, badge }) => {
  const [img_failed, setImgFailed] = React.useState(false);
  const size = isSubItem ? 16 : 20;
  return (
    <button
      onClick={onClick}
      aria-current={isActive ? 'page' : undefined}
      className={`w-full flex items-center gap-3 rounded-xl border px-4 py-2.5 transition-all ${isActive
          ? isSubItem ? subActiveClass : mainActiveClass
          : inactiveClass
        } ${isSubItem ? 'pl-10 text-sm' : ''}`}
    >
      {iconUrl && !img_failed ? (
        <img
          src={iconUrl}
          alt=""
          width={size}
          height={size}
          className="rounded object-contain shrink-0"
          referrerPolicy="no-referrer"
          onError={() => setImgFailed(true)}
        />
      ) : (
        <Icon size={size} />
      )}
      <span className={`font-medium truncate flex-1 text-left ${isActive && isSubItem ? gradientTextClass : ''}`}>{label}</span>
      {badge != null && badge > 0 && (
        <span className="ml-auto min-w-[18px] h-[18px] px-1 bg-red-500 rounded-full text-[10px] font-bold text-white flex items-center justify-center shrink-0">
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </button>
  );
};

const SidebarDropdown: React.FC<{
  icon: React.ElementType;
  label: string;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  isActive?: boolean;
}> = ({ icon: Icon, label, isOpen, onToggle, children, isActive }) => (
  <div className="space-y-1">
    <button
      onClick={onToggle}
      aria-expanded={isOpen}
      className={`w-full flex items-center justify-between rounded-xl border px-4 py-2.5 transition-all ${isActive
          ? mainActiveClass
          : isOpen
            ? 'border-transparent bg-transparent text-text-main'
            : inactiveClass
        }`}
    >
      <div className="flex items-center gap-3">
        <Icon size={20} />
        <span className="font-medium">{label}</span>
      </div>
      <ChevronDown size={16} className={`transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`} />
    </button>
    <div
      className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out ${isOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0 pointer-events-none'
        }`}
    >
      <div className="min-h-0 overflow-hidden">
        <div className="space-y-1 pt-1">{children}</div>
      </div>
    </div>
  </div>
);

const SidebarNestedDropdown: React.FC<{
  icon: React.ElementType;
  label: string;
  isOpen: boolean;
  isActive: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  iconUrl?: string | null;
}> = ({ icon: Icon, label, isOpen, isActive, onToggle, children, iconUrl }) => {
  const [img_failed, setImgFailed] = React.useState(false);

  return (
    <div className="ml-2 space-y-1">
      <button
        onClick={onToggle}
        aria-expanded={isOpen}
        className={`w-full flex items-center justify-between gap-3 rounded-xl px-4 py-2.5 pl-6 text-sm transition-all ${isActive
            ? `border ${subActiveClass}`
            : isOpen
              ? 'border border-transparent bg-transparent text-text-main'
              : `border ${inactiveClass}`
          }`}
      >
        <span className="flex min-w-0 items-center gap-3">
          {iconUrl && !img_failed ? (
            <img
              src={iconUrl}
              alt=""
              width={16}
              height={16}
              className="shrink-0 rounded object-contain"
              referrerPolicy="no-referrer"
              onError={() => setImgFailed(true)}
            />
          ) : (
            <Icon size={16} className="shrink-0" />
          )}
          <span className={`truncate font-medium ${isActive ? gradientTextClass : ''}`}>{label}</span>
        </span>
        <ChevronDown size={14} className={`shrink-0 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      <div
        className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out ${isOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0 pointer-events-none'
          }`}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="space-y-1 pl-4 pt-1">{children}</div>
        </div>
      </div>
    </div>
  );
};

type SidebarDropdownGroup = 'ott-management' | 'registered-otts' | null;

const getOpenGroupForPath = (pathname: string): SidebarDropdownGroup => {
  if (pathname === '/dashboard/ott/register' || pathname === '/dashboard/ott/all') {
    return 'ott-management';
  }

  if (/^\/dashboard\/ott\/[^/]+\/(manage|edit|videos|quick-flow|nested|cards)/.test(pathname)) {
    return 'registered-otts';
  }

  return null;
};

const getRegisteredOttIdFromPath = (pathname: string) => {
  const match = pathname.match(/^\/dashboard\/ott\/([^/]+)\/(manage|edit|videos|quick-flow|nested|cards)/);
  return match?.[1] ?? null;
};

interface SidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ isOpen = false, onClose }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { otts } = useOTT();
  const { is_authenticated } = useAuth();
  const activeGroup = getOpenGroupForPath(location.pathname);
  const [openGroup, setOpenGroup] = useState<SidebarDropdownGroup>(() => getOpenGroupForPath(location.pathname));
  const [openRegisteredOttId, setOpenRegisteredOttId] = useState<string | null>(() => getRegisteredOttIdFromPath(location.pathname));
  const [notif_unread, set_notif_unread] = useState(0);

  const poll_unread = useCallback(async () => {
    if (!is_authenticated) return;
    try {
      const env = await fetch_unread_count();
      if (env.success && env.data) set_notif_unread(env.data.count);
    } catch { /* silent */ }
  }, [is_authenticated]);

  // Poll every 30 s + refresh instantly when the notifications page fires the event.
  useEffect(() => {
    if (!is_authenticated) return;
    void poll_unread();
    const id = window.setInterval(poll_unread, 30_000);
    return () => window.clearInterval(id);
  }, [is_authenticated, poll_unread]);

  useEffect(() => {
    const handler = () => { void poll_unread(); };
    window.addEventListener('mmc:notif-count-changed', handler);
    return () => window.removeEventListener('mmc:notif-count-changed', handler);
  }, [poll_unread]);

  const menuItems = [
    { icon: LayoutDashboard, label: 'Overview', path: '/dashboard' },
    { icon: Calendar, label: 'Calendar', path: '/dashboard/calendar' },
    { icon: CalendarClock, label: 'Schedules', path: '/dashboard/schedules' },
    { icon: Plug, label: 'Social Accounts', path: '/dashboard/social-accounts' },
    { icon: UploadCloud, label: 'Media Upload', path: '/dashboard/media-upload' },
    { icon: BarChart3, label: 'Analytics', path: '/dashboard/analytics' },
    { icon: Activity, label: 'Crons', path: '/dashboard/crons' },
  ];

  useEffect(() => {
    setOpenGroup(getOpenGroupForPath(location.pathname));
    setOpenRegisteredOttId(getRegisteredOttIdFromPath(location.pathname));
  }, [location.pathname]);

  const toggleDropdown = (group: Exclude<SidebarDropdownGroup, null>) => {
    setOpenGroup(current => (current === group ? null : group));
  };

  const navigateTo = (path: string, group: SidebarDropdownGroup = null) => {
    setOpenGroup(group);
    onClose?.();
    navigate(path);
  };

  const toggleRegisteredOtt = (ottId: string) => {
    setOpenGroup('registered-otts');
    setOpenRegisteredOttId(current => (current === ottId ? null : ottId));
  };

  const isRegisteredOttPath = (ottId: string) => (
    location.pathname === `/dashboard/ott/${ottId}/manage`
    || location.pathname === `/dashboard/ott/${ottId}/edit`
    || location.pathname === `/dashboard/ott/${ottId}/videos`
    || location.pathname === `/dashboard/ott/${ottId}/quick-flow`
    || location.pathname.startsWith(`/dashboard/ott/${ottId}/nested/`)
    || location.pathname.startsWith(`/dashboard/ott/${ottId}/cards/`)
  );

  return (
    <aside className={`w-72 border-r border-border-subtle flex flex-col p-6 overflow-y-auto bg-bg-aside h-screen scrollbar-hide fixed top-0 left-0 z-40 transition-all duration-300 ease-in-out lg:static lg:translate-x-0 ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}>
      <div className="flex items-center gap-3 mb-10 px-2 cursor-pointer" onClick={() => navigateTo('/dashboard')}>
        {/* SVG logo. The `mirror-logo` class lets global CSS apply a
            theme-tuned filter (slight brightness/saturate drop in light
            mode so the pale gradient stops don't wash out on white). */}
        <img
          src="/logo.png"
          alt="Mirror Media Cloud"
          className="mirror-logo w-12 h-12 shrink-0 object-contain"
        />
        <span className="text-xl font-bold text-text-main tracking-tight whitespace-nowrap">Mirror Media Cloud</span>
      </div>

      <nav className="flex-1 space-y-1">
        <p className="text-[10px] uppercase font-bold text-text-muted tracking-widest mb-3 px-4">Management</p>

        <SidebarDropdown
          icon={Layers}
          label="OTT Management"
          isOpen={openGroup === 'ott-management'}
          onToggle={() => toggleDropdown('ott-management')}
          isActive={activeGroup === 'ott-management'}
        >
          <SidebarItem
            icon={PlusCircle}
            label="New OTT Register"
            isActive={location.pathname === '/dashboard/ott/register'}
            onClick={() => navigateTo('/dashboard/ott/register', 'ott-management')}
            isSubItem
          />
          <SidebarItem
            icon={List}
            label="All OTT's"
            isActive={location.pathname === '/dashboard/ott/all'}
            onClick={() => navigateTo('/dashboard/ott/all', 'ott-management')}
            isSubItem
          />
        </SidebarDropdown>

        {/* Library — single top-level entry. The Library page is now a
            unified browser (OTTs > folders > files), no per-OTT dropdown. */}
        <SidebarItem
          icon={Folder}
          label="Library"
          isActive={location.pathname.startsWith('/dashboard/library')}
          onClick={() => navigateTo('/dashboard/library', null)}
        />

        {(() => {
          const visibleOtts = otts.filter(o => o.name?.trim().toLowerCase() !== 'local uploads');
          if (visibleOtts.length === 0) return null;
          return (
            <SidebarDropdown
              icon={Film}
              label="Registered OTTs"
              isOpen={openGroup === 'registered-otts'}
              onToggle={() => toggleDropdown('registered-otts')}
              isActive={visibleOtts.some(ott => isRegisteredOttPath(ott.id))}
            >
              {visibleOtts.map(ott => (
                <SidebarNestedDropdown
                  key={ott.id}
                  icon={PlaySquare}
                  iconUrl={(ott as any).favicon_url ?? null}
                  label={ott.name}
                  isActive={isRegisteredOttPath(ott.id)}
                  isOpen={openRegisteredOttId === ott.id}
                  onToggle={() => toggleRegisteredOtt(ott.id)}
                >
                  <SidebarItem
                    icon={Settings}
                    label="Manage"
                    isActive={location.pathname === `/dashboard/ott/${ott.id}/manage`}
                    onClick={() => navigateTo(`/dashboard/ott/${ott.id}/manage`, 'registered-otts')}
                    isSubItem
                  />
                  <SidebarItem
                    icon={Video}
                    label="Captured Videos"
                    isActive={location.pathname === `/dashboard/ott/${ott.id}/videos`}
                    onClick={() => navigateTo(`/dashboard/ott/${ott.id}/videos`, 'registered-otts')}
                    isSubItem
                  />
                </SidebarNestedDropdown>
              ))}
            </SidebarDropdown>
          );
        })()}

        <div className="pt-4 mt-4 border-t border-border-subtle">
          <p className="text-[10px] uppercase font-bold text-text-muted tracking-widest mb-3 px-4">Menu</p>
          {menuItems.map((item) => (
            <SidebarItem
              key={item.label}
              icon={item.icon}
              label={item.label}
              isActive={
                item.path === '/dashboard'
                  ? location.pathname === '/dashboard'
                  : location.pathname === item.path || location.pathname.startsWith(`${item.path}/`)
              }
              onClick={() => navigateTo(item.path)}
            />
          ))}
          <SidebarItem
            icon={Bell}
            label="Notifications"
            isActive={location.pathname === '/dashboard/notifications'}
            onClick={() => navigateTo('/dashboard/notifications')}
            badge={notif_unread}
          />
        </div>

      </nav>

      <div className="mt-auto pt-6 border-t border-border-subtle space-y-3">
        <button
          onClick={() => navigateTo('/login')}
          className="w-full flex items-center gap-3 px-4 py-3 text-text-muted hover:text-red-400 transition-colors"
        >
          <LogOut size={20} />
          <span className="font-medium">Logout Admin</span>
        </button>
      </div>
    </aside>
  );
};
