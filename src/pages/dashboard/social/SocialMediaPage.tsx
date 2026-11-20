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
    X,
    KeyRound,
    AtSign,
} from 'lucide-react';

const TelegramIcon: React.FC<{ size?: number; className?: string }> = ({ size = 24, className }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className}>
        <path d="M9.78 18.65l.28-4.23 7.68-6.92c.34-.31-.07-.46-.52-.19L7.74 13.3 3.64 12c-.88-.25-.89-.86.2-1.3l15.97-6.16c.73-.33 1.43.18 1.15 1.3l-2.72 12.81c-.19.91-.74 1.13-1.5.71L12.6 16.3l-1.99 1.93c-.23.23-.42.42-.83.42z" />
    </svg>
);

const TikTokIcon: React.FC<{ size?: number; className?: string }> = ({ size = 24, className }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className}>
        <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.32 6.32 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.69a8.18 8.18 0 0 0 4.78 1.52V6.75a4.85 4.85 0 0 1-1.01-.06z" />
    </svg>
);
import toast from 'react-hot-toast';
import { useConfirm } from '../../../components/ui/ConfirmDialog';
import { usePlatformAccess } from '../../../lib/platform_access';
import { Input } from '../../../components/ui/Input';
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
    {
        key: 'tiktok',
        label: 'TikTok',
        Icon: TikTokIcon,
        accent: 'bg-neutral-500/10',
        iconColor: 'text-neutral-100',
        description: 'Upload videos to TikTok via the Content Posting API. Requires a TikTok Developer App.',
    },
    {
        key: 'telegram',
        label: 'Telegram',
        Icon: TelegramIcon,
        accent: 'bg-sky-500/10',
        iconColor: 'text-sky-400',
        description: 'Post videos to a Telegram channel through your own bot (admin with "Post Messages" permission).',
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
    const access = usePlatformAccess();
    const [accounts, set_accounts] = useState<SocialAccount[]>([]);
    const [loading, set_loading] = useState(false);
    const [busy_platform, set_busy_platform] = useState<SocialPlatform | null>(null);
    const [tick, set_tick] = useState(0);   // forces re-render every second for the countdown
    const [telegram_open, set_telegram_open] = useState(false);

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
        // Telegram has no OAuth popup — collect bot token + channel instead.
        if (platform === 'telegram') {
            set_telegram_open(true);
            return;
        }
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
                        Connect your YouTube, Facebook, Instagram, TikTok, and Telegram accounts to publish library videos.
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
                            coming_soon={!access.is_allowed(p.key)}
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

            <TelegramConnectModal
                isOpen={telegram_open}
                onClose={() => set_telegram_open(false)}
                onConnected={() => { set_telegram_open(false); void load(); }}
            />
        </div>
    );
};

// ── Telegram connect modal ──────────────────────────────────────────────

const TelegramConnectModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    onConnected: () => void;
}> = ({ isOpen, onClose, onConnected }) => {
    const [bot_token, set_bot_token] = useState('');
    const [channel, set_channel] = useState('');
    const [show_token, set_show_token] = useState(false);
    const [submitting, set_submitting] = useState(false);
    const [error_msg, set_error_msg] = useState<string | null>(null);

    // Reset on open. Hooks stay above the early return.
    useEffect(() => {
        if (!isOpen) return;
        set_bot_token('');
        set_channel('');
        set_show_token(false);
        set_submitting(false);
        set_error_msg(null);
    }, [isOpen]);

    if (!isOpen) return null;

    const handle_submit = async () => {
        const token = bot_token.trim();
        const ch = channel.trim();
        if (!token) { set_error_msg('Bot token is required'); return; }
        if (!/^\d+:[A-Za-z0-9_-]{20,}$/.test(token)) { set_error_msg('Bot token looks invalid — format is 123456:ABC…'); return; }
        if (!ch) { set_error_msg('Channel username is required'); return; }
        set_submitting(true);
        set_error_msg(null);
        try {
            const res = await social_service.connect_telegram({
                telegram_bot_token: token,
                telegram_channel_username: ch,
            });
            if (!res.success) throw new Error(res.message || 'Verification failed');
            toast.success(`Telegram connected${res.data?.account_name ? ` — ${res.data.account_name}` : ''}`);
            onConnected();
        } catch (err: any) {
            const msg = err?.response?.data?.error?.message || err?.response?.data?.message || err?.message || 'Verification failed';
            set_error_msg(msg);
        } finally {
            set_submitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => !submitting && onClose()} />
            <div className="relative w-full max-w-md bg-bg-main border border-border-subtle rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                <div className="flex items-center justify-between p-5 border-b border-border-subtle">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-sky-500/10 text-sky-400 flex items-center justify-center">
                            <TelegramIcon size={20} />
                        </div>
                        <div>
                            <h3 className="text-lg font-bold text-text-main">Connect Telegram</h3>
                            <p className="text-[11px] text-text-muted">We verify the bot can post to your channel.</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        disabled={submitting}
                        className="p-2 rounded-xl hover:bg-black/5 dark:hover:bg-white/5 text-text-muted disabled:opacity-50"
                    >
                        <X size={20} />
                    </button>
                </div>

                <form
                    className="p-5 space-y-4"
                    onSubmit={(e) => { e.preventDefault(); void handle_submit(); }}
                >
                    <ol className="text-[11px] text-text-muted space-y-1 list-decimal list-inside rounded-2xl border border-border-subtle bg-bg-surface p-3">
                        <li>Create a bot with <span className="font-mono text-text-main">@BotFather</span> and copy its token.</li>
                        <li>Add the bot to your channel as an <b>admin</b> with “Post Messages”.</li>
                        <li>Enter the token and channel username below.</li>
                    </ol>

                    <Input
                        label="Bot token"
                        type={show_token ? 'text' : 'password'}
                        placeholder="123456789:AAH…"
                        icon={KeyRound}
                        value={bot_token}
                        onChange={(v) => { set_bot_token(v); set_error_msg(null); }}
                        togglePassword={() => set_show_token(s => !s)}
                        showPassword={show_token}
                    />
                    <Input
                        label="Channel username"
                        placeholder="@mychannel or https://t.me/mychannel"
                        icon={AtSign}
                        value={channel}
                        onChange={(v) => { set_channel(v); set_error_msg(null); }}
                    />

                    {error_msg && (
                        <div className="flex items-start gap-1.5 text-[12px] text-red-400">
                            <AlertCircle size={13} className="mt-0.5 shrink-0" />
                            <span>{error_msg}</span>
                        </div>
                    )}

                    <div className="flex items-center justify-end gap-2 pt-1">
                        <button
                            type="button"
                            onClick={onClose}
                            disabled={submitting}
                            className="px-4 py-2 rounded-xl border border-border-subtle text-text-muted hover:text-text-main text-xs font-bold disabled:opacity-50"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={submitting}
                            className="btn-primary flex items-center gap-2 px-4 py-2 text-xs disabled:opacity-50"
                        >
                            {submitting ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                            {submitting ? 'Verifying…' : 'Verify & Connect'}
                        </button>
                    </div>
                </form>
            </div>
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
    /** Review accounts: platform is shown but cannot be connected yet. */
    coming_soon?: boolean;
}

const PlatformCard: React.FC<CardProps> = ({ meta, accounts, busy, on_connect, on_refresh, on_disconnect, tick, coming_soon = false }) => {
    const { Icon, label, accent, iconColor, description, key: platform } = meta;
    const connected = !coming_soon && accounts.length > 0;
    const primary = connected ? accounts[0] ?? null : null;

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
                                    : platform === 'tiktok'
                                        ? (primary.account_name ?? primary.account_id ?? '—')
                                        : platform === 'telegram'
                                            ? (primary.channel_name ?? primary.account_name ?? primary.account_id ?? '—')
                                            : (primary.page_name ?? primary.account_name ?? '—');
                            return (
                                <p className="text-sm font-semibold text-text-main truncate" title={display_name}>
                                    {display_name}
                                </p>
                            );
                        })()}
                    </div>
                    {platform === 'telegram' && primary.metadata?.bot_username && (
                        <div className="flex items-center justify-between gap-2">
                            <p className="text-[10px] uppercase font-bold text-text-muted tracking-wider">via Bot</p>
                            <p className="text-[11px] text-text-muted truncate">@{primary.metadata.bot_username}</p>
                        </div>
                    )}
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
                {coming_soon ? (
                    <span className="flex items-center gap-2 px-4 py-2 rounded-xl border border-border-subtle text-text-muted text-xs font-bold cursor-not-allowed">
                        <Clock size={14} /> Coming soon
                    </span>
                ) : connected ? (
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
