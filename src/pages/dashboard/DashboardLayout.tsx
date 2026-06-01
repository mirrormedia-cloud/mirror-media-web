import React, { useState } from 'react';
import { Sidebar } from '../../components/dashboard/Sidebar';
import { Header } from '../../components/dashboard/Header';
import { Outlet } from 'react-router-dom';
import { UserProfile } from '../../types';

interface DashboardLayoutProps {
    user: UserProfile;
}

export const DashboardLayout: React.FC<DashboardLayoutProps> = ({ user }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex h-screen bg-bg-main transition-colors duration-300">
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* Mobile backdrop */}
      <div
        className={`fixed inset-0 z-30 bg-black/50 backdrop-blur-sm lg:hidden transition-opacity duration-300 ${sidebarOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
        onClick={() => setSidebarOpen(false)}
      />

      <div className="flex-1 flex flex-col min-w-0">
        <Header user={user} onToggleSidebar={() => setSidebarOpen(o => !o)} />
        <main className="flex-1 overflow-y-auto p-8 scroll-smooth">
          <Outlet />
        </main>
      </div>
    </div>
  );
};
