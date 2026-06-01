/**
 * Header bell — opens a popover with the last N notifications, surfaces
 * the unread count as a badge, and lets the user mark individual or all
 * notifications as read. Reads from /api/notifications/history.
 *
 * Polls every 30s when mounted. Foreground push events would be nicer
 * (firebase.onMessage) but they only fire while a tab has focus AND the
 * SDK is initialised — polling is the lower-effort fallback that covers
 * background → foreground and missed messages.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Bell, BellOff } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext';
import {
    fetch_notification_history,
    mark_notification_read,
    mark_all_read,
    type NotificationItem,
} from '../../services/notification_service';
import { onForegroundMessage } from '../../lib/firebase';

const POLL_MS = 30_000;
const MAX_ITEMS = 20;

function relative_time(iso: string | null): string {
    if (!iso) return '';
    const ts = new Date(iso).getTime();
    if (!Number.isFinite(ts)) return '';
    const delta = Math.max(0, Date.now() - ts);
    if (delta < 60_000) return 'just now';
    if (delta < 60 * 60_000) return `${Math.floor(delta / 60_000)}m ago`;
    if (delta < 24 * 60 * 60_000) return `${Math.floor(delta / 3_600_000)}h ago`;
    return `${Math.floor(delta / 86_400_000)}d ago`;
}

function dot_color(type: NotificationItem['type']): string {
    switch (type) {
        case 'error': return 'bg-red-500';
        case 'warning': return 'bg-amber-400';
        case 'reminder': return 'bg-brand-blue';
        default: return 'bg-text-muted';
    }
}

export const NotificationBell: React.FC = () => {
    const { is_authenticated } = useAuth();
    const navigate = useNavigate();
    const [open, set_open] = useState(false);
    const [items, set_items] = useState<NotificationItem[]>([]);
    const [unread, set_unread] = useState(0);
    const [loading, set_loading] = useState(false);
    const wrap_ref = useRef<HTMLDivElement>(null);

    const refresh = useCallback(async () => {
        if (!is_authenticated) {
            set_items([]);
            set_unread(0);
            return;
        }
        try {
            set_loading(true);
            const env = await fetch_notification_history({ page: 1, page_size: MAX_ITEMS });
            if (env.success && env.data) {
                set_items(env.data.items);
                set_unread(env.data.unread_count);
            }
        } catch { /* silent — bell is best-effort */ }
        finally { set_loading(false); }
    }, [is_authenticated]);

    useEffect(() => {
        if (!is_authenticated) return;
        void refresh();
        const id = window.setInterval(() => { void refresh(); }, POLL_MS);
        return () => window.clearInterval(id);
    }, [is_authenticated, refresh]);

    // Instant update when the notifications page marks items read.
    useEffect(() => {
        if (!is_authenticated) return;
        const handler = () => { void refresh(); };
        window.addEventListener('mmc:notif-count-changed', handler);
        return () => window.removeEventListener('mmc:notif-count-changed', handler);
    }, [is_authenticated, refresh]);

    // Foreground push → refresh the bell AND show a toast. Two delivery
    // channels, dedup'd:
    //   1. Firebase's `onMessage` — fires only when tab has focus; can
    //      drop messages during page navigation / SDK init / visibility
    //      transitions.
    //   2. The SW's own `postMessage` (type "MMC_FCM_PUSH") — fires on
    //      EVERY push that reaches the SW. More reliable but also fires
    //      while the tab is hidden (we suppress the toast then, since the
    //      OS banner is already showing).
    //
    // Dedup window: the last 16 fingerprints (event_type+related_id+title)
    // in a 30-second window are remembered; identical fingerprints inside
    // that window are dropped.
    useEffect(() => {
        if (!is_authenticated) return;

        // Tiny recently-seen ring buffer for dedup. event_type+related_id+
        // title is unique enough for non-test events; for repeat /test-broadcast
        // hits the title is the same but the timestamp differs naturally.
        const recent: Array<{ key: string; at: number }> = [];
        const isDuplicate = (key: string): boolean => {
            const now = Date.now();
            // Drop entries older than 30s.
            while (recent.length && now - recent[0]!.at > 30_000) recent.shift();
            if (recent.some(r => r.key === key)) return true;
            recent.push({ key, at: now });
            if (recent.length > 16) recent.shift();
            return false;
        };

        const handlePayload = (payload: any, source: "onMessage" | "sw") => {
            const data = (payload && payload.data) || {};
            const notif = (payload && payload.notification) || {};
            const title = (data as any).title || notif.title || "Notification";
            const body = (data as any).body || (data as any).message || notif.body || "";
            const type = (data as any).type as string | undefined;
            const fp = `${(data as any).event_type ?? ""}|${(data as any).related_id ?? ""}|${title}|${body}`;
            if (isDuplicate(fp)) return;

            void refresh();

            // If the tab isn't visible, suppress the toast — the OS banner
            // is what the user is looking at. Bell still refreshes so the
            // count is accurate when they come back.
            if (typeof document !== "undefined" && document.hidden) return;

            const message = body ? `${title}\n${body}` : title;
            if (type === "error") toast.error(message, { duration: 6000 });
            else if (type === "warning") toast(message, { icon: "⚠️", duration: 6000 });
            else toast(message, { icon: "🔔", duration: 5000 });
            // Touch source so eslint stops warning about unused parameter
            // (kept for future per-channel branching).
            void source;
        };

        // Channel 1: Firebase's onMessage (foreground-only).
        let fbUnsub: (() => void) | null = null;
        (async () => {
            fbUnsub = await onForegroundMessage((payload) => handlePayload(payload, "onMessage"));
        })();

        // Channel 2: raw SW postMessage. Catches everything Firebase's
        // routing misses. Filters on our own type tag to avoid reacting
        // to Firebase's internal messages.
        const onSwMessage = (e: MessageEvent) => {
            if (e.data && e.data.type === "MMC_FCM_PUSH") {
                handlePayload(e.data.payload, "sw");
            }
        };
        if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
            navigator.serviceWorker.addEventListener("message", onSwMessage);
        }

        return () => {
            fbUnsub?.();
            if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
                navigator.serviceWorker.removeEventListener("message", onSwMessage);
            }
        };
    }, [is_authenticated, refresh]);

    // Close on outside click.
    useEffect(() => {
        if (!open) return;
        const onDoc = (e: MouseEvent) => {
            if (!wrap_ref.current?.contains(e.target as Node)) set_open(false);
        };
        document.addEventListener('mousedown', onDoc);
        return () => document.removeEventListener('mousedown', onDoc);
    }, [open]);

    const handle_item_click = async (item: NotificationItem) => {
        set_open(false);
        if (!item.is_read) {
            // Optimistic — flip locally, then ack the server. If the server
            // call fails we'll re-sync on the next poll.
            set_items(prev => prev.map(i => i.id === item.id ? { ...i, is_read: true } : i));
            set_unread(prev => Math.max(0, prev - 1));
            try { await mark_notification_read(item.id); } catch { /* ignore */ }
        }
        if (item.redirect_url) {
            // redirect_url is always a backend-derived path like /dashboard/...
            // — we strip the origin if it accidentally came through.
            const path = item.redirect_url.startsWith('http')
                ? new URL(item.redirect_url).pathname + new URL(item.redirect_url).search
                : item.redirect_url;
            navigate(path);
        }
    };

    const handle_mark_all = async () => {
        if (unread === 0) return;
        set_items(prev => prev.map(i => ({ ...i, is_read: true })));
        set_unread(0);
        try { await mark_all_read(); } catch { /* ignore */ }
    };

    if (!is_authenticated) return null;

    return (
        <div className="relative" ref={wrap_ref}>
            <button
                type="button"
                onClick={() => set_open(o => !o)}
                className="relative text-text-muted hover:text-text-main transition-colors"
                title={unread > 0 ? `${unread} unread notification${unread !== 1 ? 's' : ''}` : 'Notifications'}
            >
                <Bell size={20} />
                {unread > 0 ? (
                    <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 bg-red-500 rounded-full border-2 border-bg-main text-[9px] font-bold text-white flex items-center justify-center">
                        {unread > 99 ? '99+' : unread}
                    </span>
                ) : null}
            </button>

            {open ? (
                <div className="absolute right-0 top-[120%] z-50 w-[360px] max-w-[90vw] rounded-2xl border border-border-subtle bg-bg-aside shadow-2xl shadow-black/40 backdrop-blur-xl overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-3 border-b border-border-subtle">
                        <p className="text-sm font-bold text-text-main">Notifications</p>
                        <button
                            type="button"
                            onClick={handle_mark_all}
                            disabled={unread === 0}
                            className="text-[11px] font-semibold text-brand-emerald hover:text-brand-emerald/80 disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                            Mark all read
                        </button>
                    </div>
                    <div className="max-h-[380px] overflow-y-auto">
                        {loading && items.length === 0 ? (
                            <div className="px-4 py-8 text-center text-xs text-text-muted">Loading…</div>
                        ) : items.length === 0 ? (
                            <div className="px-4 py-10 text-center">
                                <BellOff size={20} className="mx-auto text-text-muted mb-2" />
                                <p className="text-xs text-text-muted">No notifications yet</p>
                            </div>
                        ) : (
                            <ul className="divide-y divide-border-subtle">
                                {items.map(item => (
                                    <li key={item.id}>
                                        <button
                                            type="button"
                                            onClick={() => void handle_item_click(item)}
                                            className={`w-full text-left px-4 py-3 hover:bg-black/5 dark:hover:bg-white/5 transition-colors ${item.is_read ? '' : 'bg-brand-emerald/5'}`}
                                        >
                                            <div className="flex items-start gap-3">
                                                <span className={`mt-1.5 inline-block w-1.5 h-1.5 rounded-full ${dot_color(item.type)} ${item.is_read ? 'opacity-40' : ''}`} />
                                                <div className="min-w-0 flex-1">
                                                    <p className={`text-xs ${item.is_read ? 'text-text-muted font-medium' : 'text-text-main font-semibold'}`}>{item.title}</p>
                                                    <p className="mt-0.5 text-[11px] leading-snug text-text-muted line-clamp-2">{item.message}</p>
                                                    <p className="mt-1 text-[10px] uppercase tracking-wide text-text-muted/80">{item.module} · {relative_time(item.created_at)}</p>
                                                </div>
                                            </div>
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                    {/* View all link */}
                    <div className="border-t border-border-subtle">
                        <button
                            type="button"
                            onClick={() => { set_open(false); navigate('/dashboard/notifications'); }}
                            className="w-full px-4 py-3 text-xs font-semibold text-brand-blue hover:text-brand-blue/80 hover:bg-black/5 dark:hover:bg-white/5 transition-colors text-center"
                        >
                            View all notifications →
                        </button>
                    </div>
                </div>
            ) : null}
        </div>
    );
};

export default NotificationBell;
