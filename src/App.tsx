/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/auth/Login';
import ForgotPassword from './pages/auth/ForgotPassword';
import VerifyOTP from './pages/auth/VerifyOTP';
import ResetPassword from './pages/auth/ResetPassword';
import CompleteProfile from './pages/auth/CompleteProfile';
import { DashboardLayout } from './pages/dashboard/DashboardLayout';
import { Overview } from './pages/dashboard/Overview';
import RegisterOTT from './pages/dashboard/ott/RegisterOTT';
import AllOTTs from './pages/dashboard/ott/AllOTTs';
import OTTDetail from './pages/dashboard/ott/OTTDetail';
import OttManagePage from './pages/dashboard/ott/OttManagePage';
import NestedCardPage from './pages/dashboard/ott/NestedCardPage';
import NestedCardsPage from './pages/dashboard/ott/NestedCardsPage';
import CapturedVideosPage from './pages/dashboard/ott/CapturedVideosPage';
import OttLibraryPage from './pages/dashboard/ott/OttLibraryPage';
import LibraryBrowserPage from './pages/dashboard/library/LibraryBrowserPage';
import QuickFlowPage from './pages/dashboard/ott/QuickFlowPage';
import CalendarPage from './pages/dashboard/calendar/CalendarPage';
import SchedulesListPage from './pages/dashboard/schedules/SchedulesListPage';
import ScheduleDetailPage from './pages/dashboard/schedules/ScheduleDetailPage';
import CronsListPage from './pages/dashboard/crons/CronsListPage';
import SocialMediaPage from './pages/dashboard/social/SocialMediaPage';
import SocialUploadsPage from './pages/dashboard/social/SocialUploadsPage';
import AnalyticsPage from './pages/dashboard/analytics/AnalyticsPage';
import NotificationsPage from './pages/dashboard/notifications/NotificationsPage';
import ProfilePage from './pages/dashboard/profile/ProfilePage';
import AutomationPage from './pages/dashboard/automation/AutomationPage';
import AutomationBuilderPage from './pages/dashboard/automation/AutomationBuilderPage';
import { AuthProvider, useAuth } from './context/AuthContext';
import { get_profile } from './services/profile_service';
import { RequireAuth } from './components/auth/RequireAuth';
import { ConfirmProvider } from './components/ui/ConfirmDialog';
import { AutoTooltipMount } from './components/ui/AutoTooltipMount';
import { GlobalUploadOverlay } from './components/library/GlobalUploadOverlay';
import { GlobalDeleteOverlay } from './components/library/GlobalDeleteOverlay';
import { UserProfile } from './types';

// Inner component that has access to AuthContext (BrowserRouter must wrap
// AuthProvider, but useAuth must be called from a child).
function DashboardLayoutAuthed() {
  const { user } = useAuth();
  const [profile_data, set_profile_data] = useState<UserProfile>({
    firstName: 'Unknown',
    lastName: '',
    avatar: null,
    email: user?.email ?? '',
  });

  const fetch_profile = useCallback(async () => {
    try {
      const env = await get_profile();
      if (env.success && env.data) {
        const d = env.data;
        set_profile_data({
          firstName: d.first_name || d.username || 'Unknown',
          lastName: d.last_name || '',
          avatar: d.profile_picture ? `${d.profile_picture}?t=${Date.now()}` : null,
          email: d.email,
        });
      }
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    void fetch_profile();
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { avatar?: string } | undefined;
      if (detail?.avatar) {
        // Avatar-only update — apply immediately without a round-trip.
        set_profile_data(prev => ({ ...prev, avatar: detail.avatar! }));
      } else {
        void fetch_profile();
      }
    };
    window.addEventListener('mmc:profile-updated', handler);
    return () => window.removeEventListener('mmc:profile-updated', handler);
  }, [fetch_profile]);

  return <DashboardLayout user={profile_data} />;
}

export default function App() {
  return (
    <GoogleOAuthProvider clientId={import.meta.env.VITE_GOOGLE_CLIENT_ID ?? ''}>
    <BrowserRouter>
      <AuthProvider>
        <ConfirmProvider>
        <Routes>
          {/* Auth Routes — public */}
          <Route path="/login" element={<Login />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/verify-otp" element={<VerifyOTP />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/complete-profile" element={<CompleteProfile />} />

          {/* Dashboard Routes — protected. RequireAuth holds rendering during
              the boot /me check, then redirects unauthenticated users to /login. */}
          <Route
            path="/dashboard"
            element={
              <RequireAuth>
                <DashboardLayoutAuthed />
              </RequireAuth>
            }
          >
          <Route index element={<Overview />} />
          <Route path="contents" element={<div className="text-text-main p-8 glass-card">Contents Management (Coming Soon)</div>} />
          <Route path="categories" element={<div className="text-text-main p-8 glass-card">Categories Management (Coming Soon)</div>} />
          <Route path="users" element={<div className="text-text-main p-8 glass-card">Users Management (Coming Soon)</div>} />
          <Route path="analytics" element={<AnalyticsPage />} />
          <Route path="banners" element={<div className="text-text-main p-8 glass-card">Banner Management (Coming Soon)</div>} />
          <Route path="settings" element={<div className="text-text-main p-8 glass-card">Platform Settings (Coming Soon)</div>} />

          {/* OTT Management */}
          <Route path="ott/register" element={<RegisterOTT />} />
          <Route path="ott/all" element={<AllOTTs />} />
          <Route path="ott/detail/:ott_id" element={<OTTDetail />} />
          <Route path="ott/:ott_id/manage" element={<OttManagePage />} />
          <Route path="ott/:ott_id/edit" element={<RegisterOTT isEdit={true} />} />
          <Route
            path="ott/:ott_id/nested/:parent_api_id/:item_key/:child_api_id"
            element={<NestedCardPage />}
          />
          <Route
            path="ott/:ott_id/cards/:parent_api_id/:item_key/:child_api_id"
            element={<NestedCardsPage />}
          />
          <Route path="ott/:ott_id/videos" element={<CapturedVideosPage />} />
          <Route path="ott/:ott_id/library" element={<OttLibraryPage />} />
          <Route path="ott/:ott_id/quick-flow" element={<QuickFlowPage />} />
          {/* Unified library browser — Windows-Explorer-style hierarchy:
              Library > OTT > Story folder (parent_item_key). Replaces the
              old per-OTT dropdown in the sidebar with a single entry. */}
          <Route path="library" element={<LibraryBrowserPage />} />
          <Route path="library/:ott_id" element={<LibraryBrowserPage />} />
          <Route path="library/:ott_id/:story_key" element={<LibraryBrowserPage />} />

          {/* Calendar — full-screen scheduling view */}
          <Route path="calendar" element={<CalendarPage />} />

          {/* Upload schedules — batches created from the library wizard */}
          <Route path="schedules" element={<SchedulesListPage />} />
          <Route path="schedules/:batch_id" element={<ScheduleDetailPage />} />

          {/* System crons — background workers (intervals + run-now). */}
          <Route path="crons" element={<CronsListPage />} />

          {/* Social media accounts (YouTube / Facebook / Instagram) */}
          <Route path="social-accounts" element={<SocialMediaPage />} />
          <Route path="media-upload" element={<SocialUploadsPage />} />

          {/* Automation (keyword-based comment → DM rules) */}
          <Route path="automation" element={<AutomationPage />} />
          <Route path="automation/new" element={<AutomationBuilderPage />} />
          <Route path="automation/:id/edit" element={<AutomationBuilderPage />} />

          {/* Notifications */}
          <Route path="notifications" element={<NotificationsPage />} />
          {/* Profile */}
          <Route path="profile" element={<ProfilePage />} />
        </Route>

          {/* Fallback */}
          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
        {/* Sticky upload progress popup — survives route changes so a
            long upload stays visible even if the user navigates away
            from the library page. Reads from the module-level upload
            status store. */}
        <GlobalUploadOverlay />
        {/* Same pattern for bulk deletes (DB + Drive can take a while). */}
        <GlobalDeleteOverlay />
        {/* Themes any native `title="…"` attribute anywhere in the app
            with the system-themed bubble. New code can also use the
            explicit <Tooltip> wrapper for richer (React-node) content. */}
        <AutoTooltipMount />
        </ConfirmProvider>
      </AuthProvider>
    </BrowserRouter>
    </GoogleOAuthProvider>
  );
}
