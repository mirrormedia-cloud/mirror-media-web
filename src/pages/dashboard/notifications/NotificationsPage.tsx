import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    Bell, BellOff, Search, Trash2, CheckCheck, RefreshCw,
    X, AlertCircle, CheckCircle2, Clock, Phone, Settings,
    ExternalLink, AlertTriangle, Info, ChevronLeft,
    Smartphone, Shield, Inbox,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import { useConfirm } from '../../../components/ui/ConfirmDialog';
import { NotificationPermissionCard } from '../../../components/pwa/NotificationPermissionCard';
import { get_profile } from '../../../services/profile_service';
import {
    fetch_notification_history,
    fetch_notification_settings,
    mark_notification_read,
    mark_all_read,
    delete_notification,
    clear_read_notifications,
    update_notification_settings,
    get_notification_status,
    type NotificationItem,
    type NotificationSettings,
    type FetchHistoryOptions,
} from '../../../services/notification_service';

// ─── helpers ──────────────────────────────────────────────────────────────

function relative_time(iso: string | null): string {
    if (!iso) return '';
    const delta = Math.max(0, Date.now() - new Date(iso).getTime());
    if (delta < 60_000) return 'just now';
    if (delta < 3_600_000) return `${Math.floor(delta / 60_000)}m ago`;
    if (delta < 86_400_000) return `${Math.floor(delta / 3_600_000)}h ago`;
    if (delta < 604_800_000) return `${Math.floor(delta / 86_400_000)}d ago`;
    return new Date(iso).toLocaleDateString();
}

function fmt(iso: string | null) {
    if (!iso) return '—';
    return new Date(iso).toLocaleString(undefined, {
        year: 'numeric', month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit',
    });
}

// ─── visual config ─────────────────────────────────────────────────────────

const T_CFG: Record<string, {
    circle: string; icon_text: string; Icon: React.FC<any>;
    glow: string; bar: string; hero: string; badge: string;
}> = {
    error: {
        circle: 'from-red-500/35 to-red-700/15',
        icon_text: 'text-red-400',
        Icon: AlertCircle,
        glow: 'shadow-red-500/25',
        bar: 'bg-red-500',
        hero: 'from-red-950/60 via-red-900/20 to-transparent',
        badge: 'bg-red-500/15 text-red-400 border-red-500/35',
    },
    warning: {
        circle: 'from-amber-500/35 to-orange-600/15',
        icon_text: 'text-amber-400',
        Icon: AlertTriangle,
        glow: 'shadow-amber-500/25',
        bar: 'bg-amber-400',
        hero: 'from-amber-950/60 via-amber-900/20 to-transparent',
        badge: 'bg-amber-500/15 text-amber-400 border-amber-500/35',
    },
    reminder: {
        circle: 'from-blue-500/35 to-sky-600/15',
        icon_text: 'text-blue-400',
        Icon: Clock,
        glow: 'shadow-blue-500/20',
        bar: 'bg-blue-500',
        hero: 'from-blue-950/60 via-blue-900/20 to-transparent',
        badge: 'bg-blue-500/15 text-blue-400 border-blue-500/35',
    },
    info: {
        circle: 'from-slate-500/30 to-slate-700/10',
        icon_text: 'text-slate-400',
        Icon: Info,
        glow: '',
        bar: 'bg-slate-500',
        hero: 'from-slate-900/60 via-slate-800/20 to-transparent',
        badge: 'bg-slate-500/15 text-slate-400 border-slate-500/35',
    },
};

const P_CFG: Record<string, { pill: string; bar: string; dot: string }> = {
    critical: { pill: 'bg-red-500/15 text-red-400 border-red-500/40', bar: 'from-red-500 to-red-400', dot: 'bg-red-500' },
    high: { pill: 'bg-orange-500/15 text-orange-400 border-orange-500/40', bar: 'from-orange-500 to-amber-400', dot: 'bg-orange-400' },
    normal: { pill: 'bg-blue-500/15 text-blue-400 border-blue-500/40', bar: 'from-brand-blue to-sky-400', dot: 'bg-brand-blue' },
    low: { pill: 'bg-white/5 text-text-muted border-white/10', bar: 'from-slate-600 to-slate-500', dot: 'bg-slate-500' },
};

type FilterKey = 'all' | 'unread' | 'read' | 'failed' | 'high_priority' | 'whatsapp' | 'app';
const FILTERS: Array<{ key: FilterKey; label: string }> = [
    { key: 'all', label: 'All' },
    { key: 'unread', label: 'Unread' },
    { key: 'read', label: 'Read' },
    // { key: 'whatsapp', label: 'WhatsApp' },
];

function filter_opts(k: FilterKey): Partial<FetchHistoryOptions> {
    switch (k) {
        case 'unread': return { status: 'unread' };
        case 'read': return { status: 'read' };
        case 'failed': return { status: 'failed' };
        case 'high_priority': return { priority: 'high' };
        case 'whatsapp': return { channel: 'whatsapp' };
        case 'app': return { channel: 'app' };
        default: return {};
    }
}

type RightView = 'placeholder' | 'detail' | 'settings';

// ─── WhatsApp icon ────────────────────────────────────────────────────────

const WhatsAppIcon: React.FC<{ size?: number; className?: string }> = ({ size = 17, className = '' }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className}>
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
);

// ─── GlassToggle ──────────────────────────────────────────────────────────

const GlassToggle: React.FC<{
    on: boolean; onChange: (v: boolean) => void;
    disabled?: boolean; gradient?: string;
}> = ({ on, onChange, disabled, gradient = 'from-brand-emerald to-brand-blue' }) => (
    <button
        type="button"
        onClick={() => !disabled && onChange(!on)}
        disabled={disabled}
        aria-checked={on}
        className={[
            'relative w-12 h-6 rounded-full transition-all duration-300 shrink-0',
            'disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none',
            on ? `bg-gradient-to-r ${gradient} shadow-lg` : 'bg-white/10 border border-white/10',
        ].join(' ')}
    >
        <span className={[
            'absolute top-0.5 h-5 w-5 rounded-full shadow-md transition-all duration-300',
            on ? 'left-[calc(100%-1.375rem)] bg-white' : 'left-0.5 bg-white/60',
        ].join(' ')} />
    </button>
);

// ─── Badge ────────────────────────────────────────────────────────────────

const Chip: React.FC<{ className?: string; children: React.ReactNode }> = ({ className = '', children }) => (
    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full border text-[10px] font-semibold tracking-wide backdrop-blur-sm ${className}`}>
        {children}
    </span>
);

// ─── Placeholder ──────────────────────────────────────────────────────────

const Placeholder: React.FC = () => (
    <div className="flex flex-col items-center justify-center h-full gap-7 px-8 text-center select-none">

        {/* Bell with concentric pulse rings */}
        <div className="relative flex items-center justify-center">
            <div className="absolute w-48 h-48 rounded-full bg-gradient-to-br from-brand-emerald/8 to-brand-blue/8 blur-3xl animate-pulse" />
            <div className="absolute w-36 h-36 rounded-full border border-white/5 animate-ping" style={{ animationDuration: '3.5s' }} />
            <div className="absolute w-28 h-28 rounded-full border border-white/7" />
            <div className="relative w-20 h-20 rounded-full bg-gradient-to-br from-white/8 to-white/2 border border-white/12 backdrop-blur-xl flex items-center justify-center shadow-2xl">
                <Bell size={32} className="text-white/25" strokeWidth={1.5} />
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-gradient-to-br from-brand-emerald to-brand-blue border-2 border-bg-main" />
            </div>
        </div>

        {/* Ghost notification cards */}
        <div className="flex flex-col gap-2 w-full max-w-[230px]">
            {[
                { label: 'Upload complete', offset: '', type: 'from-brand-emerald/30 to-teal-500/10' },
                { label: 'Calendar reminder', offset: 'ml-5', type: 'from-brand-blue/30 to-sky-500/10' },
                { label: 'Platform alert', offset: 'ml-2', type: 'from-amber-500/25 to-orange-500/10' },
            ].map(({ label, offset, type }) => (
                <div key={label} className={`${offset} flex items-center gap-2.5 px-3 py-2.5 rounded-2xl bg-white/3 border border-white/6 backdrop-blur-sm opacity-40`}>
                    <div className={`w-7 h-7 rounded-xl bg-gradient-to-br ${type} shrink-0`} />
                    <div className="flex-1 space-y-1.5">
                        <div className="h-2 rounded-full bg-white/15 w-3/4" />
                        <div className="h-1.5 rounded-full bg-white/8 w-1/2" />
                    </div>
                </div>
            ))}
        </div>

        <div className="space-y-2">
            <p className="text-base font-bold text-text-main">Select a notification</p>
            <p className="text-sm text-text-muted/65 max-w-[240px] leading-relaxed">
                Pick any notification to read its full details, mark it as read, or take action.
            </p>
        </div>
    </div>
);

// ─── Detail Panel ─────────────────────────────────────────────────────────

const DetailPanel: React.FC<{
    item: NotificationItem;
    onMarkRead: (id: string) => void;
    onDelete: (id: string) => void;
    onClose: () => void;
}> = ({ item, onMarkRead, onDelete, onClose }) => {
    const navigate = useNavigate();
    const status = get_notification_status(item);
    const tCfg = T_CFG[item.type] ?? T_CFG.info;
    const pCfg = P_CFG[item.priority ?? 'normal'] ?? P_CFG.normal;
    const { Icon } = tCfg;

    const handle_redirect = async () => {
        if (!item.redirect_url) return;
        // Ensure the notification is marked read before leaving; otherwise when the
        // user comes back (back navigation) it can reappear as unread.
        if (!item.is_read) onMarkRead(item.id);
        const path = item.redirect_url.startsWith('http')
            ? new URL(item.redirect_url).pathname + new URL(item.redirect_url).search
            : item.redirect_url;
        navigate(path);
    };

    return (
        <div className="flex flex-col h-full">

            {/* ── Hero header ── */}
            <div className={`relative px-6 pt-6 pb-5 bg-gradient-to-br ${tCfg.hero} shrink-0 overflow-hidden`}>
                {/* Decorative blobs */}
                <div className="pointer-events-none absolute -top-10 -right-10 w-40 h-40 rounded-full bg-white/3 blur-2xl" />
                <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/8 to-transparent" />

                {/* Mobile close */}
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 p-1.5 rounded-lg text-text-muted hover:text-text-main hover:bg-white/8 transition-colors lg:hidden"
                >
                    <X size={14} />
                </button>

                <div className="flex items-start gap-4 relative">
                    {/* Type icon circle */}
                    <div className={[
                        'shrink-0 w-14 h-14 rounded-2xl flex items-center justify-center',
                        `bg-gradient-to-br ${tCfg.circle}`,
                        'border border-white/12 shadow-2xl',
                        tCfg.glow,
                    ].join(' ')}>
                        <Icon size={26} className={tCfg.icon_text} />
                    </div>

                    <div className="flex-1 min-w-0 pr-6 lg:pr-0">
                        <h2 className="text-base font-bold text-text-main leading-snug">{item.title}</h2>
                        <p className="text-xs text-text-muted mt-0.5 capitalize">{item.module} · {relative_time(item.created_at)}</p>

                        <div className="flex flex-wrap gap-1.5 mt-2.5">
                            <Chip className={tCfg.badge}>{item.type}</Chip>
                            <Chip className={`border ${pCfg.pill}`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${pCfg.dot}`} />
                                {(item.priority ?? 'normal').toUpperCase()}
                            </Chip>
                            {status === 'read' && (
                                <Chip className="bg-brand-emerald/10 text-brand-emerald border-brand-emerald/30">
                                    <CheckCircle2 size={9} /> Read
                                </Chip>
                            )}
                            {status === 'unread' && (
                                <Chip className="bg-brand-blue/10 text-brand-blue border-brand-blue/30">Unread</Chip>
                            )}
                            {status === 'failed' && (
                                <Chip className="bg-red-500/12 text-red-400 border-red-500/30">
                                    <AlertCircle size={9} /> Failed
                                </Chip>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* ── Body ── */}
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

                {/* Message */}
                <div className="rounded-2xl bg-white/3 border border-white/6 p-4">
                    <p className="text-[10px] uppercase tracking-widest font-bold text-text-muted mb-2">Message</p>
                    <p className="text-sm text-text-muted leading-relaxed whitespace-pre-wrap">{item.message}</p>
                </div>

                {/* Meta grid */}
                <div className="grid grid-cols-2 gap-3">
                    {[
                        { label: 'Module', value: <span className="capitalize">{item.module}</span> },
                        { label: 'Channel', value: <span className="capitalize flex items-center gap-1">{item.channel === 'whatsapp' && <Phone size={10} className="text-brand-emerald" />}{item.channel ?? 'app'}</span> },
                        { label: 'Created', value: fmt(item.created_at) },
                        { label: 'Read At', value: fmt(item.read_at) },
                        ...(item.event_type ? [{ label: 'Event Type', value: item.event_type }] : []),
                        ...(item.related_id ? [{ label: 'Related ID', value: <span className="font-mono text-[10px] break-all">{item.related_id}</span> }] : []),
                    ].map(({ label, value }) => (
                        <div key={label} className="rounded-xl bg-white/3 border border-white/5 p-3">
                            <p className="text-[9px] uppercase tracking-widest font-bold text-text-muted mb-1">{label}</p>
                            <p className="text-xs text-text-main leading-snug">{value}</p>
                        </div>
                    ))}
                </div>

                {/* WhatsApp delivery */}
                {(item.channel === 'whatsapp' || item.channel === 'both') && (
                    <div className="rounded-2xl border border-brand-emerald/25 bg-gradient-to-br from-brand-emerald/8 to-teal-500/3 p-4 space-y-2.5">
                        <p className="text-[10px] uppercase tracking-widest font-bold text-brand-emerald flex items-center gap-1.5">
                            <Phone size={10} /> WhatsApp Delivery
                        </p>
                        <div className="flex items-center gap-2.5">
                            <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${item.whatsapp_sent ? 'bg-brand-emerald shadow-lg shadow-brand-emerald/50' : 'bg-text-muted'}`} />
                            <span className="text-sm text-text-main font-medium">
                                {item.whatsapp_status ?? (item.whatsapp_sent ? 'Sent successfully' : 'Not sent')}
                            </span>
                        </div>
                        {item.whatsapp_error && (
                            <p className="text-xs text-red-400 break-all">{item.whatsapp_error}</p>
                        )}
                    </div>
                )}

                {/* Error */}
                {item.error_message && (
                    <div className="rounded-2xl border border-red-500/25 bg-gradient-to-br from-red-500/8 to-red-600/3 p-4 space-y-2">
                        <p className="text-[10px] uppercase tracking-widest font-bold text-red-400 flex items-center gap-1.5">
                            <AlertCircle size={10} /> Error Details
                        </p>
                        <p className="text-xs text-red-300/80 whitespace-pre-wrap break-all leading-relaxed">{item.error_message}</p>
                    </div>
                )}

                {/* Payload */}
                {item.payload && (
                    <div className="space-y-2">
                        <p className="text-[10px] uppercase tracking-widest font-bold text-text-muted">Payload</p>
                        <pre className="text-[10px] font-mono text-text-muted/80 bg-white/3 rounded-2xl p-4 border border-white/5 overflow-auto max-h-44 leading-relaxed">
                            {JSON.stringify(item.payload, null, 2)}
                        </pre>
                    </div>
                )}
            </div>

            {/* ── Action bar ── */}
            <div className="shrink-0 px-6 py-4 border-t border-white/6 flex flex-wrap gap-2 bg-white/2">
                {item.redirect_url && (
                    <button
                        onClick={() => { void handle_redirect(); }}
                        className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-brand-emerald/20 to-brand-blue/20 text-text-main border border-white/10 text-xs font-semibold hover:from-brand-emerald/30 hover:to-brand-blue/30 transition-all"
                    >
                        <ExternalLink size={12} />
                        {item.action_label ?? 'View Details'}
                    </button>
                )}
                {!item.is_read && (
                    <button
                        onClick={() => onMarkRead(item.id)}
                        className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-brand-emerald/10 text-brand-emerald border border-brand-emerald/25 text-xs font-semibold hover:bg-brand-emerald/20 transition-all"
                    >
                        <CheckCircle2 size={12} /> Mark Read
                    </button>
                )}
                <button
                    onClick={() => onDelete(item.id)}
                    className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-red-500/8 text-red-400 border border-red-500/20 text-xs font-semibold hover:bg-red-500/18 transition-all"
                >
                    <Trash2 size={12} /> Delete
                </button>
            </div>
        </div>
    );
};

// ─── Settings Panel ───────────────────────────────────────────────────────

const SettingsPanel: React.FC<{
    settings: NotificationSettings;
    whatsapp_no: string | null;
    onSettingsChange: (s: NotificationSettings) => void;
}> = ({ settings, whatsapp_no, onSettingsChange }) => {
    const navigate = useNavigate();
    const [waEnabled, setWaEnabled] = useState(settings.whatsapp_enabled);
    const [appEnabled, setAppEnabled] = useState(settings.app_notification_enabled);
    const [saving_app, set_saving_app] = useState(false);
    const [saving_wa, set_saving_wa] = useState(false);

    useEffect(() => {
        setWaEnabled(settings.whatsapp_enabled);
        setAppEnabled(settings.app_notification_enabled);
    }, [settings]);

    const toggle_app = async (v: boolean) => {
        setAppEnabled(v);
        set_saving_app(true);
        try {
            const env = await update_notification_settings({ whatsapp_enabled: waEnabled, app_notification_enabled: v });
            if (env.success && env.data) onSettingsChange(env.data);
            else { setAppEnabled(!v); toast.error(env.message || 'Failed'); }
        } catch { setAppEnabled(!v); toast.error('Failed'); }
        finally { set_saving_app(false); }
    };

    const toggle_wa = async (v: boolean) => {
        if (v && !whatsapp_no) {
            toast.error('Add your WhatsApp number in Profile first');
            return;
        }
        setWaEnabled(v);
        set_saving_wa(true);
        try {
            const env = await update_notification_settings({ whatsapp_enabled: v, app_notification_enabled: appEnabled });
            if (env.success && env.data) onSettingsChange(env.data);
            else { setWaEnabled(!v); toast.error(env.message || 'Failed'); }
        } catch { setWaEnabled(!v); toast.error('Failed'); }
        finally { set_saving_wa(false); }
    };

    return (
        <div className="flex flex-col h-full">
            <div className="relative px-6 pt-6 pb-5 bg-gradient-to-br from-brand-blue/10 via-brand-emerald/5 to-transparent shrink-0 overflow-hidden">
                <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/8 to-transparent" />
                <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-brand-blue/30 to-brand-emerald/15 border border-white/12 flex items-center justify-center shadow-xl">
                        <Settings size={24} className="text-brand-blue" />
                    </div>
                    <div>
                        <h2 className="text-base font-bold text-text-main">Notification Settings</h2>
                        <p className="text-xs text-text-muted mt-0.5">Control how you receive alerts</p>
                    </div>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-3">
                <NotificationPermissionCard />

                <div className="rounded-2xl bg-white/3 border border-white/7 p-4 flex items-center justify-between gap-4 hover:bg-white/5 transition-colors">
                    <div className="flex items-center gap-3.5">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand-blue/30 to-sky-500/15 border border-brand-blue/20 flex items-center justify-center shrink-0 shadow-lg shadow-brand-blue/10">
                            <Smartphone size={17} className="text-brand-blue" />
                        </div>
                        <div>
                            <p className="text-sm font-semibold text-text-main">App Notifications</p>
                            <p className="text-[11px] text-text-muted mt-0.5">In-app bell · Browser push</p>
                        </div>
                    </div>
                    <GlassToggle on={appEnabled} onChange={toggle_app} disabled={saving_app} gradient="from-brand-blue to-sky-400" />
                </div>

                <div className="rounded-2xl bg-white/3 border border-white/7 p-4 flex items-center justify-between gap-4 hover:bg-white/5 transition-colors">
                    <div className="flex items-center gap-3.5">
                        <div className={`w-10 h-10 rounded-xl bg-gradient-to-br border flex items-center justify-center shrink-0 shadow-lg ${whatsapp_no ? 'from-brand-emerald/30 to-teal-500/15 border-brand-emerald/20 shadow-brand-emerald/10' : 'from-white/8 to-white/3 border-white/10'}`}>
                            <WhatsAppIcon size={17} className={whatsapp_no ? 'text-[#25D366]' : 'text-text-muted'} />
                        </div>
                        <div>
                            <p className="text-sm font-semibold text-text-main">WhatsApp Notifications</p>
                            {whatsapp_no ? (
                                <p className="text-[11px] text-text-muted mt-0.5">{waEnabled ? 'Enabled' : 'Disabled'}</p>
                            ) : (
                                <button
                                    onClick={() => navigate('/dashboard/profile')}
                                    className="text-[11px] text-brand-blue hover:underline mt-0.5 flex items-center gap-1"
                                >
                                    <ExternalLink size={9} /> Add WhatsApp number in Profile
                                </button>
                            )}
                        </div>
                    </div>
                    <GlassToggle on={waEnabled} onChange={toggle_wa} disabled={!whatsapp_no || saving_wa} gradient="from-brand-emerald to-teal-400" />
                </div>

                <div className="rounded-2xl bg-white/3 border border-white/7 p-4 space-y-3">
                    <div className="flex items-center gap-2">
                        <Shield size={13} className="text-brand-emerald" />
                        <p className="text-[11px] uppercase tracking-widest font-bold text-text-muted">Important events only</p>
                    </div>
                    {[
                        ['Upload failures', 'R2 · Drive · Platform'],
                        ['Platform uploads', 'YouTube · Facebook · Instagram'],
                        ['Calendar reminders', '2d · 1d · 5h · 1h before'],
                        ['Auth events', 'Token expired · Refresh failed'],
                        ['System alerts', 'Critical priority only'],
                    ].map(([title, sub]) => (
                        <div key={title} className="flex items-center gap-3 py-1.5 border-b border-white/4 last:border-0">
                            <span className="w-1.5 h-1.5 rounded-full bg-gradient-to-br from-brand-emerald to-brand-blue shrink-0" />
                            <span className="text-xs text-text-main flex-1">{title}</span>
                            <span className="text-[10px] text-text-muted">{sub}</span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

// ─── List Item ────────────────────────────────────────────────────────────

const ListItem: React.FC<{
    item: NotificationItem;
    selected: boolean;
    onClick: () => void;
    onMarkRead: (e: React.MouseEvent, id: string) => void;
    onDelete: (e: React.MouseEvent, id: string) => void;
}> = ({ item, selected, onClick, onMarkRead, onDelete }) => {
    const status = get_notification_status(item);
    const tCfg = T_CFG[item.type] ?? T_CFG.info;
    const pCfg = P_CFG[item.priority ?? 'normal'] ?? P_CFG.normal;
    const { Icon } = tCfg;
    const is_high = item.priority === 'high' || item.priority === 'critical';

    return (
        <button
            type="button"
            onClick={onClick}
            className={[
                'group w-full text-left px-4 py-4 transition-all duration-200',
                'border-b border-white/4 relative overflow-hidden',
                selected
                    ? 'bg-gradient-to-r from-brand-blue/12 via-brand-blue/6 to-brand-emerald/5'
                    : status === 'unread'
                        ? 'hover:bg-white/5 bg-white/2'
                        : 'hover:bg-white/3',
            ].join(' ')}
        >
            {/* Left accent */}
            {selected
                ? <span className="absolute left-0 top-0 bottom-0 w-[3px] bg-gradient-to-b from-brand-emerald to-brand-blue rounded-r-full" />
                : status === 'unread'
                    ? <span className={`absolute left-0 top-0 bottom-0 w-[2px] ${tCfg.bar}`} />
                    : null}

            <div className="flex items-start gap-3">
                {/* Icon circle */}
                <div className={[
                    'shrink-0 w-10 h-10 rounded-2xl flex items-center justify-center',
                    `bg-gradient-to-br ${tCfg.circle}`,
                    'border border-white/8',
                    status === 'read' ? 'opacity-40' : `shadow-md ${tCfg.glow}`,
                ].join(' ')}>
                    <Icon size={17} className={tCfg.icon_text} />
                </div>

                <div className="flex-1 min-w-0 pr-14">
                    <p className={`text-sm leading-snug truncate ${status === 'unread' ? 'font-semibold text-text-main' : 'font-medium text-text-muted/80'}`}>
                        {item.title}
                    </p>

                    <p className="mt-0.5 text-[11px] leading-snug text-text-muted/60 line-clamp-2">{item.message}</p>

                    <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
                        <span className="text-[10px] text-text-muted/50 capitalize">{item.module}</span>
                        {is_high && (
                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border uppercase ${pCfg.pill}`}>
                                {item.priority}
                            </span>
                        )}
                        {(item.channel === 'whatsapp' || item.channel === 'both') && (
                            <Phone size={9} className="text-brand-emerald" />
                        )}
                        {status === 'failed' && (
                            <span className="text-[9px] font-bold text-red-400 flex items-center gap-0.5">
                                <AlertCircle size={9} /> failed
                            </span>
                        )}
                        {status === 'unread' && (
                            <span className="w-1.5 h-1.5 rounded-full bg-brand-blue shrink-0" />
                        )}
                    </div>
                </div>
            </div>

            {/* Timestamp — top-right, hidden on hover */}
            <span className="absolute top-4 right-4 text-[10px] text-text-muted tabular-nums pointer-events-none group-hover:opacity-0 transition-opacity duration-150">
                {relative_time(item.created_at)}
            </span>

            {/* Actions — top-right, visible only on hover */}
            <div
                className="absolute top-3 right-2 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-150"
                onClick={e => e.stopPropagation()}
            >
                {!item.is_read && (
                    <button onClick={e => onMarkRead(e, item.id)} title="Mark read"
                        className="p-1.5 rounded-lg text-text-muted hover:text-brand-emerald hover:bg-brand-emerald/12 transition-all">
                        <CheckCircle2 size={13} />
                    </button>
                )}
                <button onClick={e => onDelete(e, item.id)} title="Delete"
                    className="p-1.5 rounded-lg text-text-muted hover:text-red-400 hover:bg-red-500/12 transition-all">
                    <Trash2 size={13} />
                </button>
            </div>
        </button>
    );
};

// ─── Main Page ────────────────────────────────────────────────────────────

const POLL_MS = 30_000;
const PAGE_SIZE = 30;

export const NotificationsPage: React.FC = () => {
    const navigate = useNavigate();
    const confirm = useConfirm();
    const [items, set_items] = useState<NotificationItem[]>([]);
    const [total, set_total] = useState(0);
    const [unread_count, set_unread_count] = useState(0);
    const [page, set_page] = useState(1);
    const [loading, set_loading] = useState(false);
    const [active_filter, set_filter] = useState<FilterKey>('all');
    const [search, set_search] = useState('');
    const [search_input, set_search_input] = useState('');
    const [selected, set_selected] = useState<NotificationItem | null>(null);
    const [right_view, set_right_view] = useState<RightView>('placeholder');
    const [settings, set_settings] = useState<NotificationSettings | null>(null);
    const [whatsapp_no, set_whatsapp_no] = useState<string | null>(null);
    const search_timer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const load = useCallback(async (p = 1, reset = false) => {
        set_loading(true);
        try {
            const env = await fetch_notification_history({
                page: p, page_size: PAGE_SIZE,
                ...filter_opts(active_filter),
                ...(search ? { search } : {}),
            });
            if (env.success && env.data) {
                set_items(prev => reset || p === 1 ? env.data!.items : [...prev, ...env.data!.items]);
                set_total(env.data.total);
                set_unread_count(env.data.unread_count);
                set_page(p);
            }
        } catch { /* silent */ }
        finally { set_loading(false); }
    }, [active_filter, search]);

    useEffect(() => {
        void load(1, true);
        const id = window.setInterval(() => void load(1, true), POLL_MS);
        return () => window.clearInterval(id);
    }, [load]);

    useEffect(() => {
        fetch_notification_settings().then(env => {
            if (env.success && env.data) set_settings(env.data);
        }).catch(() => { });
        get_profile().then(env => {
            if (env.success && env.data) set_whatsapp_no(env.data.whatsapp_no);
        }).catch(() => { });
    }, []);

    // Notify bell + sidebar immediately when count changes (they listen for this event).
    useEffect(() => {
        window.dispatchEvent(new CustomEvent('mmc:notif-count-changed'));
    }, [unread_count]);

    const handle_search = (v: string) => {
        set_search_input(v);
        if (search_timer.current) clearTimeout(search_timer.current);
        search_timer.current = setTimeout(() => set_search(v), 400);
    };

    const select_item = (item: NotificationItem) => {
        if (!item.is_read) {
            const now = new Date().toISOString();
            const read_item = { ...item, is_read: true, read_at: now };
            set_selected(read_item);
            set_right_view('detail');
            set_items(prev => prev.map(i => i.id === item.id ? read_item : i));
            set_unread_count(p => Math.max(0, p - 1));
            // Fire-and-forget: UI state is the source of truth for "read" immediately.
            // If the server call fails, we do not revert the UI.
            mark_notification_read(item.id).catch(() => { });
        } else {
            set_selected(item);
            set_right_view('detail');
        }
    };

    const handle_mark_read = async (id: string) => {
        const now = new Date().toISOString();
        set_items(prev => prev.map(i => i.id === id ? { ...i, is_read: true, read_at: now } : i));
        if (selected?.id === id) set_selected(p => p ? { ...p, is_read: true, read_at: now } : null);
        set_unread_count(p => Math.max(0, p - 1));
        // Fire-and-forget: keep UI consistent immediately.
        try { await mark_notification_read(id); } catch { /* ignore */ }
    };

    const handle_delete = async (id: string) => {
        const ok = await confirm({
            title: 'Delete notification',
            message: 'This notification will be permanently removed.',
            confirm_label: 'Delete',
            danger: true,
        });
        if (!ok) return;
        set_items(prev => prev.filter(i => i.id !== id));
        set_total(prev => Math.max(0, prev - 1));
        if (selected?.id === id) { set_selected(null); set_right_view('placeholder'); }
        try {
            const env = await delete_notification(id);
            if (env.success && env.data != null) {
                set_unread_count(env.data.unread_count);
            }
        } catch { toast.error('Failed'); void load(1, true); }
    };

    const handle_mark_all = async () => {
        set_items(prev => prev.map(i => ({ ...i, is_read: true })));
        set_unread_count(0);
        try { await mark_all_read(); toast.success('All notifications marked as read'); }
        catch { toast.error('Failed'); void load(1, true); }
    };

    const handle_clear_read = async () => {
        try {
            const env = await clear_read_notifications();
            if (env.success) { toast.success(env.message); void load(1, true); }
        } catch { toast.error('Failed'); }
    };

    const failed_count = items.filter(i => i.error_message).length;
    const has_more = items.length < total;

    return (
        <div className="-m-8 flex h-[calc(100vh-5rem)] overflow-hidden relative">

            {/* Ambient background blobs */}
            <div className="pointer-events-none absolute inset-0 overflow-hidden">
                <div className="absolute -top-40 -left-40 w-[500px] h-[500px] rounded-full bg-brand-emerald/5 blur-3xl" />
                <div className="absolute -bottom-32 -right-32 w-[400px] h-[400px] rounded-full bg-brand-blue/7 blur-3xl" />
                <div className="absolute top-1/2 left-1/3 w-[300px] h-[300px] rounded-full bg-brand-blue/3 blur-3xl" />
            </div>

            {/* ══════ LEFT PANEL ══════ */}
            <div className={[
                'flex flex-col shrink-0 w-full max-w-[420px]',
                'border-r border-white/6 backdrop-blur-2xl',
                'bg-gradient-to-b from-white/[0.03] to-transparent',
                right_view !== 'placeholder' ? 'hidden lg:flex' : 'flex',
            ].join(' ')}>

                {/* ── Header ── */}
                <div className="px-5 pt-5 pb-3 shrink-0 space-y-4">

                    {/* Top row */}
                    <div className="flex items-center justify-between">
                        <button
                            onClick={() => navigate(-1)}
                            className="flex items-center gap-1.5 text-xs font-semibold text-text-muted hover:text-text-main transition-colors group"
                        >
                            <ChevronLeft size={14} className="group-hover:-translate-x-0.5 transition-transform" />
                            Go Back
                        </button>
                        <div className="flex items-center gap-1">
                            <button
                                onClick={() => { set_right_view(v => v === 'settings' ? 'placeholder' : 'settings'); set_selected(null); }}
                                title="Settings"
                                className={[
                                    'p-2 rounded-xl transition-all text-xs',
                                    right_view === 'settings'
                                        ? 'bg-brand-blue/20 text-brand-blue border border-brand-blue/30'
                                        : 'text-text-muted hover:text-text-main hover:bg-white/6',
                                ].join(' ')}
                            >
                                <Settings size={14} />
                            </button>
                            <button
                                onClick={() => void load(1, true)}
                                disabled={loading}
                                title="Refresh"
                                className="p-2 rounded-xl text-text-muted hover:text-text-main hover:bg-white/6 transition-all disabled:opacity-40"
                            >
                                <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                            </button>
                        </div>
                    </div>

                    {/* Title + subtitle */}
                    <div className="flex items-end justify-between">
                        <div>
                            <h1 className="text-2xl font-extrabold bg-gradient-to-r from-text-main via-text-main to-text-muted bg-clip-text text-transparent tracking-tight">
                                Notifications
                            </h1>
                            <p className="text-[11px] text-text-muted mt-0.5">
                                {unread_count > 0
                                    ? <><span className="text-brand-blue font-bold">{unread_count} unread</span> · {total} total</>
                                    : `${total} total · all caught up`}
                            </p>
                        </div>
                        {unread_count > 0 && (
                            <button
                                onClick={handle_mark_all}
                                className="flex items-center gap-1 text-[11px] font-semibold text-brand-emerald hover:text-brand-emerald/80 transition-colors"
                            >
                                <CheckCheck size={11} /> Mark all read
                            </button>
                        )}
                    </div>

                    {/* Stat cards */}
                    <div className="grid grid-cols-3 gap-2">
                        {[
                            { label: 'Total', value: total, icon: <Inbox size={13} className="text-text-muted" />, bg: 'from-white/5 to-white/2' },
                            { label: 'Unread', value: unread_count, icon: <Bell size={13} className="text-brand-blue" />, bg: 'from-brand-blue/15 to-brand-blue/5', accent: unread_count > 0 },
                            { label: 'Failed', value: failed_count, icon: <AlertCircle size={13} className="text-red-400" />, bg: failed_count > 0 ? 'from-red-500/15 to-red-500/5' : 'from-white/5 to-white/2' },
                        ].map(({ label, value, icon, bg, accent }) => (
                            <div key={label} className={`rounded-2xl bg-gradient-to-br ${bg} border border-white/7 px-3 py-2.5`}>
                                <div className="flex items-center justify-between mb-1">
                                    <p className="text-[9px] uppercase tracking-widest font-bold text-text-muted">{label}</p>
                                    {icon}
                                </div>
                                <p className={`text-xl font-extrabold leading-none ${accent ? 'bg-gradient-to-r from-brand-blue to-brand-emerald bg-clip-text text-transparent' : 'text-text-main'}`}>
                                    {value}
                                </p>
                            </div>
                        ))}
                    </div>

                    {/* Search */}
                    <div className="relative">
                        <Search size={13} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
                        <input
                            type="text"
                            value={search_input}
                            onChange={e => handle_search(e.target.value)}
                            placeholder="Search notifications…"
                            className="w-full pl-9 pr-8 py-2.5 rounded-2xl bg-white/5 border border-white/8 text-sm text-text-main placeholder:text-text-muted/40 focus:outline-none focus:border-brand-blue/40 focus:bg-white/8 transition-all"
                        />
                        {search_input && (
                            <button
                                onClick={() => { set_search_input(''); set_search(''); }}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-main"
                            >
                                <X size={12} />
                            </button>
                        )}
                    </div>

                    {/* Filter chips */}
                    <div className={`grid grid-cols-${FILTERS.length} gap-1.5`}>
                        {FILTERS.map(f => (
                            <button
                                key={f.key}
                                onClick={() => { set_filter(f.key); set_page(1); }}
                                className={[
                                    'px-2 py-2 rounded-xl text-[11px] font-semibold transition-all whitespace-nowrap text-center',
                                    active_filter === f.key
                                        ? 'bg-gradient-to-r from-brand-emerald to-brand-blue text-white shadow-lg shadow-brand-emerald/20 border border-transparent'
                                        : 'bg-white/6 border border-white/8 text-text-muted hover:text-text-main hover:bg-white/10',
                                ].join(' ')}
                            >
                                {f.label}
                            </button>
                        ))}
                    </div>

                    {/* Bulk actions */}
                    <div className="flex items-center justify-between pb-1">
                        <button
                            onClick={handle_clear_read}
                            className="flex items-center gap-1 text-[10px] font-semibold text-text-muted hover:text-red-400 transition-colors"
                        >
                            <Trash2 size={10} /> Clear read
                        </button>
                        <span className="text-[10px] text-text-muted">{items.length} shown</span>
                    </div>
                </div>

                <div className="h-px bg-gradient-to-r from-transparent via-white/8 to-transparent shrink-0" />

                {/* ── List ── */}
                <div className="flex-1 overflow-y-auto">
                    {loading && items.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full gap-3">
                            <RefreshCw size={18} className="animate-spin text-text-muted" />
                            <p className="text-xs text-text-muted">Loading…</p>
                        </div>
                    ) : items.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full gap-3 px-6">
                            <div className="w-14 h-14 rounded-2xl bg-white/4 border border-white/7 flex items-center justify-center">
                                <BellOff size={22} className="text-text-muted opacity-50" />
                            </div>
                            <p className="text-sm text-text-muted text-center font-medium">No notifications found</p>
                            {active_filter !== 'all' && (
                                <button onClick={() => set_filter('all')}
                                    className="text-xs text-brand-blue hover:underline">
                                    Clear filter
                                </button>
                            )}
                        </div>
                    ) : (
                        <>
                            {items.map(item => (
                                <ListItem
                                    key={item.id}
                                    item={item}
                                    selected={selected?.id === item.id}
                                    onClick={() => select_item(item)}
                                    onMarkRead={(e, id) => { e.stopPropagation(); void handle_mark_read(id); }}
                                    onDelete={(e, id) => { e.stopPropagation(); void handle_delete(id); }}
                                />
                            ))}
                            {has_more && (
                                <button
                                    onClick={() => void load(page + 1)}
                                    disabled={loading}
                                    className="w-full py-4 text-xs text-text-muted hover:text-text-main transition-colors disabled:opacity-40 border-t border-white/4"
                                >
                                    {loading ? 'Loading…' : `Load more · ${total - items.length} remaining`}
                                </button>
                            )}
                        </>
                    )}
                </div>
            </div>

            {/* ══════ RIGHT PANEL ══════ */}
            <div className={[
                'flex-1 min-w-0 backdrop-blur-2xl',
                'bg-gradient-to-br from-white/[0.015] via-transparent to-brand-blue/4',
                right_view === 'placeholder' ? 'hidden lg:flex flex-col' : 'flex flex-col',
            ].join(' ')}>

                {/* Mobile back */}
                {right_view !== 'placeholder' && (
                    <div className="lg:hidden px-5 py-3 border-b border-white/5 shrink-0">
                        <button
                            onClick={() => { set_right_view('placeholder'); set_selected(null); }}
                            className="flex items-center gap-1.5 text-xs font-semibold text-text-muted hover:text-text-main transition-colors"
                        >
                            <ChevronLeft size={13} /> Back
                        </button>
                    </div>
                )}

                {right_view === 'detail' && selected && (
                    <DetailPanel
                        item={selected}
                        onMarkRead={handle_mark_read}
                        onDelete={handle_delete}
                        onClose={() => { set_right_view('placeholder'); set_selected(null); }}
                    />
                )}
                {right_view === 'settings' && settings && (
                    <SettingsPanel settings={settings} whatsapp_no={whatsapp_no} onSettingsChange={(s: NotificationSettings) => set_settings(s)} />
                )}
                {right_view === 'placeholder' && <Placeholder />}
            </div>
        </div>
    );
};

export default NotificationsPage;
