import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    Youtube,
    Facebook,
    Instagram,
    Loader2,
    RefreshCw,
    LogOut,
    Plug,
    CheckCircle2,
    AlertCircle,
    Clock,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useConfirm } from '../../../components/ui/ConfirmDialog';
import {
    social_service,
    SocialAccount,
    SocialPlatform,
} from '../../../services/social_service';

interface PlatformMeta {
    key: SocialPlatform;
    label: string;
    Icon: React.ComponentType<{ size?: number; className?: string; strokeWidth?: number }>;
    accent: string;       // tailwind color class for the icon background
    iconColor: string;    // tailwind color class for the icon itself
    description: string;
}

const PLATFORMS: PlatformMeta[] = [
    {
        key: 'youtube',
        label: 'YouTube',
        Icon: Youtube,
        accent: 'bg-red-500/10',
        iconColor: 'text-red-500',
        description: 'Upload videos to your YouTube channel. OAuth 2.0 with auto-refresh.',
    },
    {
        key: 'facebook',
        label: 'Facebook Page',
        Icon: Facebook,
        accent: 'bg-blue-500/10',
        iconColor: 'text-blue-500',
        description: 'Publish video posts to a Facebook Page. Connecting also picks up the linked Instagram Business account.',
    },
    {
        key: 'instagram',
        label: 'Instagram',
        Icon: Instagram,
        accent: 'bg-purple-500/10',
        iconColor: 'text-purple-500',
        description: 'Post Reels to your Instagram Business account (uses the linked Facebook Page for auth).',
    },
];

function pad2(n: number) { return String(n).padStart(2, '0'); }

/**
 * Render a token-expiry countdown string. The backend returns
 * `remaining_seconds`; we tick a local timer down so the UI updates
 * every second without re-fetching the API.
 */
function format_remaining(seconds: number | null): string {
    if (seconds == null) return '—';
    if (seconds <= 0) return 'expired';
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    if (days > 0) return `${days}d ${pad2(hours)}:${pad2(mins)}:${pad2(secs)}`;
    return `${pad2(hours)}:${pad2(mins)}:${pad2(secs)}`;
}

const SocialMediaPage: React.FC = () => {
    const confirm = useConfirm();
    const [accounts, set_accounts] = useState<SocialAccount[]>([]);
    const [loading, set_loading] = useState(false);
    const [busy_platform, set_busy_platform] = useState<SocialPlatform | null>(null);
    const [tick, set_tick] = useState(0);   // forces re-render every second for the countdown

    const load = useCallback(async () => {
        set_loading(true);
        try {
            const res = await social_service.list_accounts();
            if (!res.success || !res.data) throw new Error(res.message || 'Failed to load social accounts');
            set_accounts(res.data.accounts ?? []);
        } catch (err: any) {
            toast.error(err?.message || 'Failed to load social accounts');
        } finally {
            set_loading(false);
        }
    }, []);

    useEffect(() => { void load(); }, [load]);

    // Tick once per second for the countdown — cheap because we only
    // bump a number; React reconciles a tiny diff.
    useEffect(() => {
        const id = setInterval(() => set_tick(t => t + 1), 1000);
        return () => clearInterval(id);
    }, []);

    const accounts_by_platform = useMemo(() => {
        const m = new Map<SocialPlatform, SocialAccount[]>();
        for (const a of accounts) {
            const k = a.platform;
            if (!m.has(k)) m.set(k, []);
            m.get(k)!.push(a);
        }
        return m;
    }, [accounts]);

    const open_connect = useCallback(async (platform: SocialPlatform) => {
        set_busy_platform(platform);
        try {
            const res = await social_service.get_connect_url(platform, 'app');
            if (!res.success || !res.data?.url) throw new Error(res.message || 'Failed to start OAuth');
            // Center the popup so the consent screen lands in a sensible spot.
            const w = 520;
            const h = 640;
            const left = window.screenX + (window.outerWidth - w) / 2;
            const top = window.screenY + (window.outerHeight - h) / 2;
            const popup = window.open(
                res.data.url,
                `${platform}_oauth`,
                `width=${w},height=${h},left=${left},top=${top}`,
            );
            if (!popup) {
                toast.error('Popup blocked — allow popups for this site and retry.');
                return;
            }
            // Poll the popup; once it closes (callback fired and ran
            // window.close()), refresh the account list.
            const id = window.setInterval(() => {
                if (popup.closed) {
                    window.clearInterval(id);
                    void load();
                    set_busy_platform(null);
                }
            }, 600);
        } catch (err: any) {
            toast.error(err?.message || 'Failed to start OAuth');
            set_busy_platform(null);
        }
    }, [load]);

    const handle_refresh = useCallback(async (platform: SocialPlatform) => {
        set_busy_platform(platform);
        try {
            const res = await social_service.refresh_token(platform);
            if (!res.success) throw new Error(res.message || 'Refresh failed');
            toast.success(`${platform} token refreshed`);
            await load();
        } catch (err: any) {
            toast.error(err?.message || 'Refresh failed');
        } finally {
            set_busy_platform(null);
        }
    }, [load]);

    const handle_disconnect = useCallback(async (platform: SocialPlatform) => {
        const ok = await confirm({
            title: `Disconnect ${platform}?`,
            message: 'Stored tokens will be removed. You can reconnect at any time.',
            confirm_label: 'Disconnect',
            danger: true,
        });
        if (!ok) return;
        set_busy_platform(platform);
        try {
            const res = await social_service.disconnect(platform);
            if (!res.success) throw new Error(res.message || 'Disconnect failed');
            toast.success(`${platform} disconnected`);
            await load();
        } catch (err: any) {
            toast.error(err?.message || 'Disconnect failed');
        } finally {
            set_busy_platform(null);
        }
    }, [load, confirm]);

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div>
                    <h2 className="text-2xl font-bold text-text-main flex items-center gap-3">
                        <Plug size={24} className="text-brand-emerald" /> Social Accounts
                    </h2>
                    <p className="text-text-muted text-sm">
                        Connect your YouTube, Facebook, and Instagram accounts to publish library videos.
                    </p>
                </div>
                <button
                    onClick={load}
                    disabled={loading}
                    className="flex items-center gap-2 px-3 py-2 rounded-xl border border-border-subtle text-text-muted hover:text-text-main text-xs font-bold disabled:opacity-60 disabled:cursor-not-allowed"
                >
                    <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
                </button>
            </div>

            {loading && accounts.length === 0 ? (
                <div className="flex items-center justify-center py-20 text-text-muted">
                    <Loader2 size={28} className="animate-spin" />
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {PLATFORMS.map(p => (
                        <PlatformCard
                            key={p.key}
                            meta={p}
                            accounts={accounts_by_platform.get(p.key) ?? []}
                            busy={busy_platform === p.key}
                            on_connect={() => open_connect(p.key)}
                            on_refresh={() => handle_refresh(p.key)}
                            on_disconnect={() => handle_disconnect(p.key)}
                            // Re-read remaining_seconds with the current tick so
                            // the countdown updates without a network round-trip.
                            tick={tick}
                        />
                    ))}
                </div>
            )}
        </div>
    );
};

interface CardProps {
    meta: PlatformMeta;
    accounts: SocialAccount[];
    busy: boolean;
    on_connect: () => void;
    on_refresh: () => void;
    on_disconnect: () => void;
    tick: number;
}

const PlatformCard: React.FC<CardProps> = ({ meta, accounts, busy, on_connect, on_refresh, on_disconnect, tick }) => {
    const { Icon, label, accent, iconColor, description, key: platform } = meta;
    const connected = accounts.length > 0;
    const primary = accounts[0] ?? null;

    // Tick the countdown locally — recompute remaining from `expiresAt`
    // each render so the value reflects "now" instead of when we fetched.
    const live_remaining = useMemo(() => {
        if (!primary?.expiresAt) return primary?.remaining_seconds ?? null;
        return Math.max(0, Math.floor((new Date(primary.expiresAt).getTime() - Date.now()) / 1000));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [primary?.expiresAt, tick]);

    const expired = live_remaining != null && live_remaining <= 0;
    const expiring_soon = live_remaining != null && live_remaining > 0 && live_remaining < 5 * 60; // <5min

    // Auto-refresh on render: when the live countdown crosses zero AND the
    // account has a refresh_token AND we aren't already mid-action, fire
    // the refresh once. Re-armed by the `auto_refresh_armed` ref whenever
    // expiresAt changes (i.e. after a successful refresh resets the clock).
    const auto_refresh_armed = useRef(true);
    useEffect(() => { auto_refresh_armed.current = true; }, [primary?.expiresAt]);
    useEffect(() => {
        if (!expired) return;
        if (!primary?.has_refresh_token) return;
        if (busy) return;
        if (!auto_refresh_armed.current) return;
        auto_refresh_armed.current = false;
        on_refresh();
    }, [expired, primary?.has_refresh_token, busy, on_refresh]);

    return (
        <div className="glass-card p-5 flex flex-col gap-4">
            <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0">
                    <div className={`w-12 h-12 rounded-2xl ${accent} ${iconColor} flex items-center justify-center shrink-0`}>
                        <Icon size={24} strokeWidth={1.8} />
                    </div>
                    <div className="min-w-0">
                        <h3 className="text-lg font-bold text-text-main">{label}</h3>
                        <p className="text-[11px] text-text-muted leading-snug">{description}</p>
                    </div>
                </div>
                {connected ? (
                    <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-brand-emerald bg-brand-emerald/10 px-2 py-1 rounded-lg shrink-0">
                        <CheckCircle2 size={11} /> Connected
                    </span>
                ) : (
                    <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-text-muted bg-text-muted/10 px-2 py-1 rounded-lg shrink-0">
                        Not connected
                    </span>
                )}
            </div>

            {connected && primary && (
                <div className="rounded-2xl border border-border-subtle bg-bg-surface p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                        <p className="text-[10px] uppercase font-bold text-text-muted tracking-wider">Account</p>
                        {(() => {
                            // Pick the most specific name for the row's platform —
                            // IG accounts get the @username (account_name) instead of
                            // the FB page they're attached to.
                            const display_name = platform === 'instagram'
                                ? (primary.account_name ? `@${primary.account_name}` : (primary.account_id ?? primary.page_name ?? '—'))
                                : platform === 'youtube'
                                    ? (primary.channel_name ?? primary.account_name ?? '—')
                                    : (primary.page_name ?? primary.account_name ?? '—');
                            return (
                                <p className="text-sm font-semibold text-text-main truncate" title={display_name}>
                                    {display_name}
                                </p>
                            );
                        })()}
                    </div>
                    {platform === 'instagram' && primary.page_name && (
                        <div className="flex items-center justify-between gap-2">
                            <p className="text-[10px] uppercase font-bold text-text-muted tracking-wider">via FB Page</p>
                            <p className="text-[11px] text-text-muted truncate" title={primary.page_name}>
                                {primary.page_name}
                            </p>
                        </div>
                    )}

                    {primary.expiresAt && (
                        <div className="flex items-center justify-between gap-2">
                            <p className="text-[10px] uppercase font-bold text-text-muted tracking-wider flex items-center gap-1">
                                <Clock size={11} /> Token expires in
                            </p>
                            <p className={`text-sm font-mono ${expired ? 'text-red-400 font-bold' : expiring_soon ? 'text-amber-400 font-bold' : 'text-text-main'}`}>
                                {format_remaining(live_remaining)}
                            </p>
                        </div>
                    )}

                    {primary.has_refresh_token && (
                        <p className="text-[10px] text-text-muted/80 flex items-center gap-1">
                            <RefreshCw size={10} /> Auto-refresh enabled
                        </p>
                    )}

                    {accounts.length > 1 && (
                        <p className="text-[10px] text-text-muted">+ {accounts.length - 1} other account{accounts.length - 1 === 1 ? '' : 's'}</p>
                    )}

                    {expired && (
                        <div className="flex items-start gap-1.5 text-[11px] text-red-400">
                            <AlertCircle size={12} className="mt-0.5 shrink-0" />
                            <span>Token expired — click Refresh, or reconnect if refresh fails.</span>
                        </div>
                    )}
                </div>
            )}

            <div className="flex items-center gap-2 mt-auto">
                {connected ? (
                    <>
                        {primary?.has_refresh_token && (
                            <button
                                onClick={on_refresh}
                                disabled={busy}
                                className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border-subtle text-text-muted hover:text-text-main text-xs font-bold disabled:opacity-50"
                                title={platform === 'youtube' ? 'Refresh access token' : 'Re-exchange long-lived token'}
                            >
                                {busy ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                                Refresh
                            </button>
                        )}
                        <button
                            onClick={on_disconnect}
                            disabled={busy}
                            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-red-500/30 text-red-400 hover:bg-red-500/10 text-xs font-bold disabled:opacity-50"
                        >
                            <LogOut size={12} /> Disconnect
                        </button>
                        <button
                            onClick={on_connect}
                            disabled={busy}
                            className="ml-auto flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border-subtle text-text-muted hover:text-text-main text-xs font-bold disabled:opacity-50"
                            title="Add another account"
                        >
                            + Account
                        </button>
                    </>
                ) : (
                    <button
                        onClick={on_connect}
                        disabled={busy}
                        className="btn-primary flex items-center gap-2 px-4 py-2 text-xs disabled:opacity-50"
                        title={`Connect ${label} account`}
                    >
                        {busy ? <Loader2 size={14} className="animate-spin" /> : <Plug size={14} />}
                        Connect
                    </button>
                )}
            </div>
        </div>
    );
};

export default SocialMediaPage;
