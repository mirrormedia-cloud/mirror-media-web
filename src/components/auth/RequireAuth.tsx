/**
 * Route guard. Wraps a tree (typically the dashboard layout) and redirects
 * unauthenticated users to /login. Holds rendering during the initial /me
 * call so a brief render of the protected tree (with a stale-but-valid token
 * about to be rejected) doesn't flash before the redirect.
 *
 * Usage in App.tsx:
 *   <Route path="/dashboard" element={<RequireAuth><DashboardLayout /></RequireAuth>}>
 */

import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

export const RequireAuth: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { is_authenticated, loading } = useAuth();
    const location = useLocation();

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[60vh] gap-3 text-text-muted">
                <Loader2 size={24} className="animate-spin" />
                <span className="text-sm">Verifying session…</span>
            </div>
        );
    }

    if (!is_authenticated) {
        // Preserve the intended URL so /login can bounce back here after
        // a successful login (handled in Login via location.state).
        return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
    }

    return <>{children}</>;
};
