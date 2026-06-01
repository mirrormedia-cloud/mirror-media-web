import React, { useEffect, useState } from 'react';
import { Bell, BellOff, BellRing } from 'lucide-react';
import toast from 'react-hot-toast';
import {
    is_native,
    is_push_supported,
    get_permission,
    request_permission,
    get_push_token,
    get_device_type,
    type PushPermission,
} from '../../lib/push';
import { register_fcm_token, update_permission_state } from '../../services/notification_service';
import { useAuth } from '../../context/AuthContext';

interface NotificationPermissionCardProps {
    className?: string;
    /** Compact pill variant for header rails. */
    compact?: boolean;
}

/**
 * Asks the user to enable push notifications and registers the resulting
 * FCM token with the backend. Routes through the lib/push abstraction so
 * the same component works in both browser/PWA (Web Push) and Capacitor
 * (native FCM SDK).
 */
export const NotificationPermissionCard: React.FC<NotificationPermissionCardProps> = ({
    className = '',
    compact = false,
}) => {
    const { is_authenticated } = useAuth();
    // null → still detecting. true/false → final answer.
    const [push_supported, set_push_supported] = useState<boolean | null>(null);
    const [permission, set_permission] = useState<PushPermission>('default');
    const [pending, set_pending] = useState(false);

    // One-shot support detection on mount. Capacitor short-circuits to true;
    // web does the messaging-SDK + service-worker + isSupported checks.
    useEffect(() => {
        let cancelled = false;
        (async () => {
            const ok = await is_push_supported();
            const perm = await get_permission();
            if (cancelled) return;
            set_push_supported(ok);
            set_permission(perm);
        })();
        return () => { cancelled = true; };
    }, []);

    // Web only: permission can change from browser Settings while the tab
    // is open. Native iOS/Android don't fire similar events, so this is a
    // no-op there (but harmless — Capacitor's window has no 'focus' event
    // tied to OS permission changes anyway).
    useEffect(() => {
        if (is_native()) return;
        const sync = async () => {
            const perm = await get_permission();
            set_permission(perm);
        };
        window.addEventListener('focus', sync);
        return () => window.removeEventListener('focus', sync);
    }, []);

    // Auto-register a fresh push token whenever the user is authenticated
    // AND OS permission is already granted. Catches "logged in from a new
    // session on a device that previously enabled push" — the new session
    // row in the DB needs the token without forcing the user to re-tap.
    useEffect(() => {
        if (!is_authenticated) return;
        if (permission !== 'granted') return;
        if (push_supported === false) return;

        let cancelled = false;
        (async () => {
            console.log('[push-card] mount effect: minting token (auth + granted + supported)');
            const token = await get_push_token();
            if (cancelled) {
                console.log('[push-card] cancelled before register');
                return;
            }
            console.log('[push-card] get_push_token returned:', token ? `${token.slice(0, 24)}… (len=${token.length})` : 'null');
            if (!token) {
                console.warn('[push-card] no token — check [firebase] warnings (HTTP origin? SW conflict? VAPID?)');
                return;
            }
            try {
                const res = await register_fcm_token(token, 'granted');
                console.log('[push-card] register_fcm_token response:', res);
            } catch (err) {
                console.warn('[push-card] register_fcm_token threw:', err);
            }
        })();
        return () => { cancelled = true; };
    }, [is_authenticated, permission, push_supported]);

    if (push_supported === false) return null;
    // While still detecting on web, render nothing — saves a flash of the
    // "Enable" pill that immediately disappears if FCM is unsupported.
    if (push_supported === null) return null;

    const handle_click = async () => {
        if (permission === 'granted' || pending) return;
        set_pending(true);
        try {
            const result = await request_permission();
            set_permission(result);
            if (result === 'granted') {
                // Mint a fresh token (web or native — abstraction routes)
                // and POST it up. Failures here are non-fatal — the OS bit
                // is set either way; the auto-register effect retries on
                // the next mount if the POST didn't go through.
                const token = await get_push_token();
                if (token && is_authenticated) {
                    try {
                        await register_fcm_token(token, 'granted');
                        toast.success(
                            is_native()
                                ? `Notifications enabled (${get_device_type()})`
                                : 'Notifications enabled'
                        );
                    } catch {
                        toast.success('Notifications enabled (token sync deferred)');
                    }
                } else {
                    toast.success('Notifications enabled');
                }
            } else if (result === 'denied') {
                // Tell the backend the user said no — keeps push fanout from
                // wasting a slot on this device.
                if (is_authenticated) {
                    try { await update_permission_state('denied'); } catch { /* ignore */ }
                }
                toast(
                    is_native()
                        ? 'Notifications blocked. Allow them in Settings → Apps → Mirror Cloud → Notifications.'
                        : 'Notifications blocked. Enable from your browser settings.',
                    { icon: '⚠️' }
                );
            }
        } finally {
            set_pending(false);
        }
    };

    const granted = permission === 'granted';
    const denied = permission === 'denied';

    if (compact) {
        return (
            <button
                type="button"
                onClick={handle_click}
                disabled={granted || pending}
                title={
                    granted ? 'Notifications enabled'
                        : denied ? 'Notifications blocked in browser settings'
                        : 'Enable error notifications'
                }
                className={`flex items-center gap-2 rounded-full border border-border-subtle bg-black/5 px-3 py-1.5 text-xs font-semibold text-text-main transition-all dark:bg-white/5 ${granted ? 'opacity-70' : 'hover:bg-black/10 dark:hover:bg-white/10'} ${className}`}
            >
                {granted ? <BellRing size={14} className="text-brand-emerald" />
                    : denied ? <BellOff size={14} className="text-amber-400" />
                    : <Bell size={14} />}
                <span className="hidden sm:inline">
                    {granted ? 'Notifications on' : denied ? 'Notifications blocked' : 'Enable notifications'}
                </span>
            </button>
        );
    }

    return (
        <div className={`rounded-2xl border border-border-subtle bg-bg-surface/60 p-4 ${className}`}>
            <div className="flex items-start gap-3">
                <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${granted ? 'bg-brand-emerald/15 text-brand-emerald' : 'bg-gradient-to-br from-brand-blue/15 to-brand-emerald/15 text-text-main'}`}>
                    {granted ? <BellRing size={18} /> : denied ? <BellOff size={18} /> : <Bell size={18} />}
                </span>
                <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-text-main">Enable Error Notifications</p>
                    <p className="mt-0.5 text-[11px] leading-snug text-text-muted">
                        {granted
                            ? 'Notifications are on. You\'ll get alerts for upload failures and scheduled job issues.'
                            : denied
                            ? 'Notifications are blocked. Allow them from your browser site settings to receive alerts.'
                            : 'Get alerts for upload failures, scheduled job issues, and platform errors.'}
                    </p>
                </div>
            </div>
            {!granted && !denied ? (
                <button
                    type="button"
                    onClick={handle_click}
                    disabled={pending}
                    className="mt-3 w-full rounded-xl bg-gradient-to-br from-brand-blue to-brand-emerald px-4 py-2 text-xs font-semibold text-white shadow-md shadow-brand-emerald/20 transition-all hover:brightness-110 disabled:opacity-60"
                >
                    {pending ? 'Requesting…' : 'Enable Notifications'}
                </button>
            ) : null}
        </div>
    );
};

export default NotificationPermissionCard;
