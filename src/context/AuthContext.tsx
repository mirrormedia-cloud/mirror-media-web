/**
 * Auth state — tracks the logged-in user, the JWT, and exposes login/logout.
 *
 * The token lives in localStorage (for cross-tab persistence + survives
 * refresh) and is also mirrored in React state so re-renders fire when it
 * changes. AuthProvider validates the stored token on mount by hitting
 * /api/auth/me — if the call fails, the user is treated as logged out.
 *
 * The 401 interceptor in api_client clears the token + redirects to /login
 * for any failed call, so most expiry handling already happens there. This
 * context just holds the current user info for the rest of the app.
 */

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api_client, AUTH_TOKEN_KEY, set_auth_token, get_auth_token, normalize_envelope } from '../lib/api_client';
import { get_push_token, get_permission } from '../lib/push';
import { register_fcm_token } from '../services/notification_service';

export interface AuthUser {
    id: string;
    email: string;
    username: string;
    email_verified: boolean;
    is_active: boolean;
    createdAt: string | null;
}

/** Free-form per-user UI preferences pulled from /api/profile. The shape
 *  is open so adding a new key in any page doesn't require touching this
 *  context. */
export type UserPreferences = Record<string, any>;

export interface GoogleLoginResult {
    ok: boolean;
    error?: string;
    needsProfile?: {
        verification_id: string;
        first_name: string | null;
        last_name: string | null;
        profile_picture: string | null;
    };
}

interface AuthContextValue {
    user: AuthUser | null;
    /** True while the initial /me call is in flight on app boot. UI should
     *  show a spinner instead of redirecting to /login during this window. */
    loading: boolean;
    /** True once a token exists in localStorage AND /me confirmed it valid. */
    is_authenticated: boolean;
    /** Per-user UI preferences. Populated after login from /api/profile. */
    preferences: UserPreferences;
    login: (email: string, password: string) => Promise<{ ok: boolean; error?: string }>;
    /** Verify a Google OAuth token server-side and log in or return profile-completion data. */
    googleLogin: (token: string, token_type?: 'access_token' | 'id_token') => Promise<GoogleLoginResult>;
    /** Store a JWT and hydrate the user — used after SSO profile completion. */
    loginWithToken: (token: string, user?: AuthUser) => Promise<void>;
    logout: () => void;
    /** Re-fetch the current user — useful after profile updates. */
    refresh_user: () => Promise<void>;
    /** Patch one or more preference keys. Optimistic — updates local state
     *  immediately and PATCHes the backend in the background. Throws if the
     *  call fails so the caller can roll back if it cares. */
    update_preferences: (patch: UserPreferences) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [user, set_user] = useState<AuthUser | null>(null);
    const [loading, set_loading] = useState(true);
    const [preferences, set_preferences] = useState<UserPreferences>({});

    /** Load /api/profile to hydrate per-user UI preferences. Quietly swallows
     *  failures — preferences are non-critical, missing values fall back to
     *  the page-level defaults. */
    const fetch_preferences = useCallback(async () => {
        try {
            const res = await api_client.get('/api/profile/');
            const env = normalize_envelope<{ preferences?: UserPreferences }>(res.data);
            if (env.success && env.data?.preferences) {
                set_preferences(env.data.preferences);
            }
        } catch { /* ignore — defaults stay in effect */ }
    }, []);

    const fetch_me = useCallback(async () => {
        const token = get_auth_token();
        if (!token) {
            set_user(null);
            set_preferences({});
            return;
        }
        try {
            const res = await api_client.get('/api/auth/me');
            const env = normalize_envelope<AuthUser>(res.data);
            if (env.success && env.data) {
                set_user(env.data);
                // Hydrate preferences in parallel with the rest of the boot
                // flow — the user shouldn't see a flash of default settings.
                void fetch_preferences();
            } else {
                set_auth_token(null);
                set_user(null);
                set_preferences({});
            }
        } catch {
            // 401 interceptor already cleared the token + redirected. Just
            // ensure local state matches.
            set_user(null);
            set_preferences({});
        }
    }, [fetch_preferences]);

    useEffect(() => {
        // App boot — confirm any stored token is still valid before rendering
        // the protected tree. Without this, a stale JWT would let a user past
        // the route guard until the first real API call returns 401.
        let cancelled = false;
        (async () => {
            await fetch_me();
            if (!cancelled) set_loading(false);
        })();
        return () => { cancelled = true; };
        // Listen for cross-tab logout — when one tab clears the token, others
        // catch up automatically. Storage event fires on the OTHER tab when
        // localStorage changes in any tab.
    }, [fetch_me]);

    useEffect(() => {
        const onStorage = (e: StorageEvent) => {
            if (e.key === AUTH_TOKEN_KEY && !e.newValue) set_user(null);
        };
        window.addEventListener('storage', onStorage);
        return () => window.removeEventListener('storage', onStorage);
    }, []);

    /**
     * Try to mint a fresh FCM token and POST it to the backend so this new
     * session row gets stamped with one immediately on login. Fire-and-forget;
     * any failure here is non-fatal — the user is logged in regardless, and
     * the NotificationPermissionCard mount-time effect runs as a backup if
     * this fails. Doing it directly from login (rather than relying solely
     * on a component effect) also handles the case where the previous
     * session's token was marked NotRegistered: every login now overwrites
     * with a fresh token instead of inheriting a dead one.
     */
    const register_push_token_after_login = useCallback(async () => {
        try {
            console.log('[push-login] register_push_token_after_login: start');
            // Permission check via the abstraction so the same code works
            // for browser (Notification.permission) AND Capacitor native
            // (PushNotifications.checkPermissions). Returns "default" /
            // "granted" / "denied" identically across both.
            const perm = await get_permission();
            console.log('[push-login] permission =', perm);
            if (perm !== 'granted') {
                console.log('[push-login] bailing: permission not granted yet — user must tap Enable Notifications');
                return;
            }
            const token = await get_push_token();
            console.log('[push-login] get_push_token returned:', token ? `${token.slice(0, 24)}… (len=${token.length})` : 'null');
            if (!token) {
                console.warn('[push-login] bailing: no token (likely HTTP origin, SW issue, or VAPID problem — see [firebase] warnings above)');
                return;
            }
            const res = await register_fcm_token(token, 'granted');
            console.log('[push-login] register_fcm_token response:', res);
        } catch (err) {
            console.warn('[push-login] threw:', err);
        }
    }, []);

    const loginWithToken = useCallback(async (token: string, user?: AuthUser) => {
        set_auth_token(token);
        if (user) {
            set_user(user);
        } else {
            await fetch_me();
        }
        void register_push_token_after_login();
    }, [fetch_me, register_push_token_after_login]);

    const googleLogin = useCallback(async (
        token: string,
        token_type: 'access_token' | 'id_token' = 'access_token',
    ): Promise<GoogleLoginResult> => {
        try {
            const res = await api_client.post('/api/auth/sso/google-token', { token, token_type });
            const env = normalize_envelope<{ type: string; user?: AuthUser; token?: string; details?: any }>(res.data);
            if (!env.success || !env.data) {
                return { ok: false, error: env.message || 'Google sign-in failed' };
            }
            if ((env.data.type === 'login' || env.data.type === 'set_password') && env.data.token) {
                await loginWithToken(env.data.token, env.data.user);
                return { ok: true };
            }
            if (env.data.type === 'register' && env.data.details?.verification_id) {
                return {
                    ok: false,
                    needsProfile: {
                        verification_id: env.data.details.verification_id,
                        first_name: env.data.details.first_name ?? null,
                        last_name: env.data.details.last_name ?? null,
                        profile_picture: env.data.details.profile_picture ?? null,
                    },
                };
            }
            return { ok: false, error: 'Unexpected response from server' };
        } catch (err: any) {
            const msg = err?.envelope?.error?.message ?? err?.message ?? 'Google sign-in failed';
            return { ok: false, error: msg };
        }
    }, [loginWithToken]);

    const login = useCallback(async (email: string, password: string) => {
        try {
            const res = await api_client.post('/api/auth/login', { email, password });
            const env = normalize_envelope<{ token: string; user?: AuthUser }>(res.data);
            if (!env.success || !env.data?.token) {
                return { ok: false, error: env.message || 'Login failed' };
            }
            set_auth_token(env.data.token);
            // Backend may return the user inline; if not, fetch /me to populate.
            if (env.data.user) {
                set_user(env.data.user);
            } else {
                await fetch_me();
            }
            // Fire-and-forget — don't block returning success to the caller.
            // The push token POST needs the JWT in localStorage (already set
            // above), so we're free to kick it off after set_user.
            void register_push_token_after_login();
            return { ok: true };
        } catch (err: any) {
            const msg = err?.envelope?.error?.message ?? err?.message ?? 'Login failed';
            return { ok: false, error: msg };
        }
    }, [fetch_me, register_push_token_after_login]);

    const logout = useCallback(() => {
        set_auth_token(null);
        set_user(null);
        set_preferences({});
        // Best-effort tell the backend so the session row gets invalidated.
        // Don't block the UI on this — the local clear is what matters.
        api_client.post('/api/auth/logout').catch(() => { /* ignore */ });
        if (typeof window !== 'undefined') window.location.href = '/login';
    }, []);

    const update_preferences = useCallback(async (patch: UserPreferences) => {
        // Optimistic local update so the UI reflects the change immediately;
        // PATCH the backend afterwards. If the server rejects, surface the
        // error to the caller — they can roll back if needed.
        set_preferences(prev => ({ ...prev, ...patch }));
        const res = await api_client.patch('/api/profile/preferences', patch);
        const env = normalize_envelope<{ preferences: UserPreferences }>(res.data);
        if (env.success && env.data?.preferences) {
            // Reconcile with the server's view (handles concurrent updates
            // from another tab — server merge wins).
            set_preferences(env.data.preferences);
        }
    }, []);

    const value: AuthContextValue = {
        user,
        loading,
        is_authenticated: !!user,
        preferences,
        login,
        googleLogin,
        loginWithToken,
        logout,
        refresh_user: fetch_me,
        update_preferences,
    };

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export function useAuth(): AuthContextValue {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error('useAuth must be used inside an AuthProvider');
    return ctx;
}
