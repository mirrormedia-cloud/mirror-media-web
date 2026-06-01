/**
 * Dashboard home — real-data command centre.
 *
 * Single API call: GET /api/dashboard/overview returns every section's
 * counts in one shot (already user-scoped server-side via JWT). NO
 * dummy data. NO hardcoded numbers. Empty results render as "0" /
 * "No data yet" empty states.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
    Layers,
    Folder,
    Loader2,
    CalendarClock,
    Send,
    UploadCloud,
    RefreshCw,
    Sparkles,
    Youtube,
    Facebook,
    Instagram,
    AlertTriangle,
    AlertCircle,
    CheckCircle2,
    Clock,
    Plug,
    BarChart3,
    Activity,
    ArrowRight,
    Calendar,
    Plus,
    PlaySquare,
} from 'lucide-react';
import toast from 'react-hot-toast';
import {
    dashboard_service,
    DashboardOverview,
    DashboardActivityItem,
    DashboardFailedItem,
    DashboardUpcomingItem,
    DashboardLibraryStatus,
} from '../../services/dashboard_service';

function fmt(n: number): string {
    if (!Number.isFinite(n)) return '—';
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return String(n);
}

function rel_time(iso: string | null): string {
    if (!iso) return '—';
    const ts = new Date(iso).getTime();
    if (!Number.isFinite(ts)) return '—';
    const diff_s = Math.round((Date.now() - ts) / 1000);
    if (diff_s < 60) return 'just now';
    if (diff_s < 3600) return `${Math.floor(diff_s / 60)}m ago`;
    if (diff_s < 86400) return `${Math.floor(diff_s / 3600)}h ago`;
    if (diff_s < 86400 * 7) return `${Math.floor(diff_s / 86400)}d ago`;
    return new Date(iso).toLocaleDateString();
}

const STATUS_PILL: Record<string, string> = {
    completed: 'bg-brand-emerald/15 text-brand-emerald',
    failed: 'bg-red-500/15 text-red-400',
    scheduled: 'bg-brand-blue/15 text-brand-blue',
    uploaded: 'bg-brand-emerald/15 text-brand-emerald',
    cancelled: 'bg-text-muted/15 text-text-muted',
    draft: 'bg-text-muted/15 text-text-muted',
    uploading: 'bg-brand-blue/15 text-brand-blue',
    processing: 'bg-amber-400/15 text-amber-400',
};

export const Overview: React.FC = () => {
    const [data, set_data] = useState<DashboardOverview | null>(null);
    const [loading, set_loading] = useState(false);

    const load = useCallback(async () => {
        set_loading(true);
        try {
            const res = await dashboard_service.overview();
            if (!res.success || !res.data) throw new Error(res.message || 'Failed to load dashboard');
            set_data(res.data);
        } catch (err: any) {
            toast.error(err?.message || 'Failed to load dashboard');
        } finally {
            set_loading(false);
        }
    }, []);

    useEffect(() => { void load(); }, [load]);

    const summary = data?.summary;
    const library_status = data?.library_status;
    const social_status = data?.social_status;

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* ── HEADER ─────────────────────────────────────────── */}
            <div className="relative overflow-hidden rounded-3xl border border-border-subtle bg-gradient-to-br from-brand-emerald/15 via-brand-blue/15 to-purple-500/15 px-6 py-5">
                <div className="absolute -top-16 -right-16 w-72 h-72 rounded-full bg-gradient-to-br from-brand-emerald/30 via-purple-500/30 to-brand-blue/30 blur-3xl pointer-events-none" />
                <div className="relative flex items-center justify-between gap-4">
                    <div className="min-w-0">
                        <div className="inline-flex items-center gap-1.5 mb-2 text-[10px] font-bold uppercase tracking-widest text-text-muted">
                            <span className="relative flex h-2 w-2">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-emerald opacity-75" />
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-brand-emerald" />
                            </span>
                            Real-time overview
                        </div>
                        <h2 className="text-3xl md:text-[34px] font-bold tracking-tight leading-none">
                            <span className="bg-gradient-to-r from-brand-emerald via-brand-blue to-purple-400 bg-clip-text text-transparent">
                                Dashboard
                            </span>
                        </h2>
                        <p className="text-text-muted text-sm mt-1.5 max-w-[640px]">
                            Real-time overview of OTT, Library, Scheduling, Media Upload, and Platform Analytics.
                        </p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                        {data?.fetched_at && (
                            <span className="text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full border border-brand-emerald/30 bg-brand-emerald/10 text-brand-emerald">
                                Updated · {new Date(data.fetched_at).toLocaleTimeString()}
                            </span>
                        )}
                        <button
                            onClick={load}
                            disabled={loading}
                            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-brand-emerald to-brand-blue text-white text-sm font-bold shadow-lg shadow-brand-emerald/30 hover:shadow-brand-emerald/50 hover:scale-[1.02] transition-all disabled:opacity-60"
                        >
                            {loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                            Refresh
                        </button>
                    </div>
                </div>
            </div>

            {/* ── KPI CARDS (4) ──────────────────────────────────── */}
            {/* Drive Completed / Pending KPIs were removed with the R2
                migration — a library row only exists once R2 finished,
                so there's no in-flight / pending state to surface. */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Kpi
                    label="Total OTTs"
                    value={summary?.total_otts ?? 0}
                    sub={`${summary?.active_otts ?? 0} active`}
                    Icon={Layers}
                    accent="emerald"
                    to="/dashboard/ott/all"
                />
                <Kpi
                    label="Library Files"
                    value={summary?.total_library_items ?? 0}
                    sub={`${summary?.completed_library_items ?? 0} ready`}
                    Icon={Folder}
                    accent="blue"
                    to="/dashboard/library"
                />
                <Kpi
                    label="Today Schedules"
                    value={summary?.today_schedules ?? 0}
                    sub={`${summary?.upcoming_schedules ?? 0} upcoming`}
                    Icon={CalendarClock}
                    accent="purple"
                    to="/dashboard/calendar"
                />
                <Kpi
                    label="Media Upload"
                    value={summary?.social_uploaded ?? 0}
                    sub={`${summary?.social_failed ?? 0} failed`}
                    Icon={UploadCloud}
                    accent="rose"
                    to="/dashboard/media-upload"
                />
            </div>

            {/* ── MAIN GRID: 70/30 split ─────────────────────────── */}
            <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_440px] gap-8 items-start">
                {/* LEFT */}
                <div className="space-y-8">
                    <LibraryProcessingOverview status={library_status} />
                    <SocialPlatformOverview status={social_status} health={data?.system_health} />
                    <RecentActivity items={data?.recent_activity ?? []} />
                </div>

                {/* RIGHT */}
                <div className="space-y-6 xl:sticky xl:top-4 self-start">
                    <QuickActions />
                    <SystemHealth health={data?.system_health} />
                    <NeedsAttention items={data?.recent_failed_items ?? []} />
                    <UpcomingSchedules items={data?.upcoming_schedules ?? []} />
                </div>
            </div>
        </div>
    );
};

// ── KPI ───────────────────────────────────────────────────────────────

const Kpi: React.FC<{
    label: string;
    value: number;
    sub: string;
    Icon: React.ComponentType<{ size?: number; className?: string }>;
    accent: 'emerald' | 'blue' | 'rose' | 'amber' | 'purple' | 'cyan';
    to: string;
}> = ({ label, value, sub, Icon, accent, to }) => {
    const tone_text = accent === 'emerald' ? 'text-brand-emerald'
        : accent === 'blue' ? 'text-brand-blue'
            : accent === 'rose' ? 'text-rose-400'
                : accent === 'amber' ? 'text-amber-400'
                    : accent === 'purple' ? 'text-purple-400'
                        : 'text-cyan-400';
    const ring = accent === 'emerald' ? 'ring-brand-emerald/20'
        : accent === 'blue' ? 'ring-brand-blue/20'
            : accent === 'rose' ? 'ring-rose-500/20'
                : accent === 'amber' ? 'ring-amber-400/20'
                    : accent === 'purple' ? 'ring-purple-500/20'
                        : 'ring-cyan-500/20';
    const grad = accent === 'emerald' ? 'from-brand-emerald/20'
        : accent === 'blue' ? 'from-brand-blue/20'
            : accent === 'rose' ? 'from-rose-500/20'
                : accent === 'amber' ? 'from-amber-400/20'
                    : accent === 'purple' ? 'from-purple-500/20'
                        : 'from-cyan-500/20';
    return (
        <Link to={to} className={`relative overflow-hidden rounded-xl border border-border-subtle ring-1 ${ring} p-3.5 hover:scale-[1.02] hover:shadow-xl transition-all group block`}>
            <div className={`absolute inset-0 bg-gradient-to-br ${grad} via-transparent to-transparent pointer-events-none`} />
            <div className="relative flex items-start gap-2.5">
                <div className={`w-9 h-9 rounded-lg bg-bg-surface flex items-center justify-center shrink-0 ${tone_text}`}>
                    <Icon size={16} />
                </div>
                <div className="min-w-0 flex-1">
                    <p className="text-[10px] uppercase font-bold text-text-muted tracking-widest">{label}</p>
                    <p className="text-2xl font-bold text-text-main leading-none mt-1">{fmt(value)}</p>
                    <p className="text-[10px] text-text-muted mt-1.5 truncate">{sub}</p>
                </div>
            </div>
        </Link>
    );
};

// ── Library processing overview ───────────────────────────────────────

const LibraryProcessingOverview: React.FC<{ status?: DashboardLibraryStatus }> = ({ status }) => {
    // Post-R2: a library row exists only when the upload succeeded, so
    // the in-flight buckets (downloading / pending / uploading_on_drive
    // / ready_for_drive / initiate) are all gone. Only `completed` and
    // `failed` remain. The whole "files in pipeline" framing collapses
    // to a simple completed-vs-failed summary.
    const s = status ?? { completed: 0, failed: 0 };
    const total = s.completed + s.failed;
    const buckets: Array<{ label: string; value: number; tone: string; bar: string }> = [
        { label: 'Completed', value: s.completed, tone: 'text-brand-emerald', bar: 'bg-brand-emerald' },
        { label: 'Failed', value: s.failed, tone: 'text-red-400', bar: 'bg-red-500' },
    ];
    return (
        <div className="rounded-3xl border border-border-subtle bg-bg-card p-7">
            <div className="flex items-center justify-between mb-5">
                <div>
                    <p className="text-xs uppercase font-bold text-text-muted tracking-widest">Library</p>
                    <p className="text-2xl font-bold text-text-main mt-1.5 flex items-center gap-3">
                        {fmt(total)} <span className="text-sm font-normal text-text-muted">files</span>
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    {s.failed > 0 && (
                        <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider px-3 py-1.5 rounded-full bg-red-500/15 text-red-400">
                            <AlertTriangle size={13} /> {s.failed} failed
                        </span>
                    )}
                    <Link to="/dashboard/library" className="text-sm font-semibold text-brand-emerald hover:underline inline-flex items-center gap-1.5">
                        Open Library <ArrowRight size={14} />
                    </Link>
                </div>
            </div>
            {total > 0 && (
                <div className="flex h-3 rounded-full overflow-hidden bg-bg-surface mb-5">
                    {buckets.filter(b => b.value > 0).map(b => (
                        <div key={b.label} className={b.bar} style={{ width: `${(b.value / total) * 100}%` }} title={`${b.label}: ${b.value}`} />
                    ))}
                </div>
            )}
            <div className="grid grid-cols-2 gap-2.5">
                {buckets.map(b => (
                    <div key={b.label} className="rounded-xl bg-bg-surface/50 px-3 py-3 min-w-0">
                        <p className="text-[10px] uppercase font-bold text-text-muted tracking-normal truncate" title={b.label}>{b.label}</p>
                        <p className={`text-2xl font-bold mt-1 ${b.tone}`}>{fmt(b.value)}</p>
                    </div>
                ))}
            </div>
        </div>
    );
};

// ── Social platform overview ─────────────────────────────────────────

const SocialPlatformOverview: React.FC<{
    status?: DashboardOverview['social_status'];
    health?: DashboardOverview['system_health'];
}> = ({ status, health }) => {
    const empty = { uploaded: 0, scheduled: 0, failed: 0 };
    const yt = status?.youtube ?? empty;
    const fb = status?.facebook ?? empty;
    const ig = status?.instagram ?? empty;
    const platforms = [
        { key: 'youtube', label: 'YouTube', Icon: Youtube, tone: 'text-red-500', ring: 'ring-red-500/20', stats: yt },
        { key: 'facebook', label: 'Facebook', Icon: Facebook, tone: 'text-brand-blue', ring: 'ring-brand-blue/20', stats: fb },
        { key: 'instagram', label: 'Instagram', Icon: Instagram, tone: 'text-purple-400', ring: 'ring-purple-500/20', stats: ig },
    ] as const;
    return (
        <div className="rounded-3xl border border-border-subtle bg-bg-card p-7">
            <div className="flex items-center justify-between mb-5">
                <div>
                    <p className="text-xs uppercase font-bold text-text-muted tracking-widest">Social Platforms</p>
                    <p className="text-2xl font-bold text-text-main mt-1.5">Per-platform upload status</p>
                </div>
                <Link to="/dashboard/media-upload" className="text-sm font-semibold text-brand-emerald hover:underline inline-flex items-center gap-1.5">
                    Open Uploads <ArrowRight size={14} />
                </Link>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {platforms.map(p => {
                    const token_status = health?.per_platform_token_status?.[p.key] ?? 'missing';
                    return (
                        <div key={p.key} className={`relative overflow-hidden rounded-2xl border border-border-subtle ring-1 ${p.ring} p-5`}>
                            <div className="flex items-center justify-between mb-4">
                                <div className="flex items-center gap-3 min-w-0">
                                    <div className={`w-12 h-12 rounded-xl bg-bg-surface flex items-center justify-center shrink-0 ${p.tone}`}>
                                        <p.Icon size={22} />
                                    </div>
                                    <p className="text-base font-bold text-text-main truncate">{p.label}</p>
                                </div>
                                {token_status === 'expired' && (
                                    <span className="text-[10px] font-bold uppercase px-2 py-1 rounded-full bg-red-500/15 text-red-400" title="Token expired — reconnect">
                                        Expired
                                    </span>
                                )}
                                {token_status === 'missing' && (
                                    <span className="text-[10px] font-bold uppercase px-2 py-1 rounded-full bg-text-muted/15 text-text-muted">
                                        Not connected
                                    </span>
                                )}
                                {token_status === 'connected' && (
                                    <span className="text-[10px] font-bold uppercase px-2 py-1 rounded-full bg-brand-emerald/15 text-brand-emerald">
                                        Live
                                    </span>
                                )}
                            </div>
                            <div className="grid grid-cols-3 gap-2 pt-4 border-t border-border-subtle/60">
                                <PlatformStat label="Uploaded" value={p.stats.uploaded} tone="text-brand-emerald" />
                                <PlatformStat label="Scheduled" value={p.stats.scheduled} tone="text-brand-blue" />
                                <PlatformStat label="Failed" value={p.stats.failed} tone="text-red-400" />
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

const PlatformStat: React.FC<{ label: string; value: number; tone: string }> = ({ label, value, tone }) => (
    <div className="text-center">
        <p className="text-[10px] uppercase font-semibold text-text-muted tracking-wide">{label}</p>
        <p className={`text-2xl font-bold mt-1 ${tone}`}>{fmt(value)}</p>
    </div>
);

// ── Recent activity feed ─────────────────────────────────────────────

const MODULE_BADGE: Record<string, { label: string; tone: string; Icon: React.ComponentType<{ size?: number; className?: string }> }> = {
    library: { label: 'Library', tone: 'bg-brand-emerald/15 text-brand-emerald', Icon: Folder },
    social: { label: 'Social', tone: 'bg-rose-500/15 text-rose-400', Icon: Send },
    schedule: { label: 'Schedule', tone: 'bg-purple-500/15 text-purple-400', Icon: CalendarClock },
};

const RecentActivity: React.FC<{ items: DashboardActivityItem[] }> = ({ items }) => (
    <div className="rounded-3xl border border-border-subtle bg-bg-card p-7">
        <div className="flex items-center justify-between mb-5">
            <div>
                <p className="text-xs uppercase font-bold text-text-muted tracking-widest">Recent Activity</p>
                <p className="text-2xl font-bold text-text-main mt-1.5 flex items-center gap-2.5">
                    <Activity size={22} className="text-brand-emerald" />
                    Latest changes across modules
                </p>
            </div>
        </div>
        {items.length === 0 ? (
            <div className="py-12 text-center text-text-muted text-base">
                No recent activity yet.
            </div>
        ) : (
            <div className="divide-y divide-border-subtle">
                {items.slice(0, 10).map((it) => {
                    const mod = MODULE_BADGE[it.module] ?? MODULE_BADGE.library;
                    const ModIcon = mod.Icon;
                    return (
                        <div key={`${it.module}-${it.id}`} className="flex items-center gap-4 py-3.5">
                            <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${mod.tone}`}>
                                <ModIcon size={18} />
                            </div>
                            <div className="min-w-0 flex-1">
                                <p className="text-sm font-semibold text-text-main truncate" title={it.title}>{it.title}</p>
                                <p className="text-xs text-text-muted mt-0.5">
                                    {mod.label}{it.meta?.platform ? ` · ${it.meta.platform}` : ''}{it.meta?.platforms?.length ? ` · ${it.meta.platforms.join(', ')}` : ''}
                                </p>
                            </div>
                            {it.status && (
                                <span className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full shrink-0 ${STATUS_PILL[it.status] ?? 'bg-text-muted/15 text-text-muted'}`}>
                                    {it.status.replace(/_/g, ' ')}
                                </span>
                            )}
                            <span className="text-xs text-text-muted whitespace-nowrap shrink-0">{rel_time(it.updatedAt)}</span>
                        </div>
                    );
                })}
            </div>
        )}
    </div>
);

// ── Quick actions ────────────────────────────────────────────────────

const QuickActions: React.FC = () => (
    <div className="rounded-3xl border border-border-subtle bg-bg-card p-6">
        <p className="text-xs uppercase font-bold text-text-muted tracking-widest mb-4 flex items-center gap-2">
            <Sparkles size={14} className="text-brand-emerald" /> Quick Actions
        </p>
        <div className="grid grid-cols-2 gap-2">
            <QuickLink to="/dashboard/ott/register" Icon={Plus} label="Register OTT" tone="text-brand-emerald" />
            <QuickLink to="/dashboard/library" Icon={Folder} label="Library" tone="text-brand-blue" />
            <QuickLink to="/dashboard/calendar" Icon={Calendar} label="Calendar" tone="text-purple-400" />
            <QuickLink to="/dashboard/media-upload" Icon={UploadCloud} label="Media Upload" tone="text-rose-400" />
            <QuickLink to="/dashboard/analytics" Icon={BarChart3} label="Analytics" tone="text-cyan-400" />
            <QuickLink to="/dashboard/social-accounts" Icon={Plug} label="Connect" tone="text-amber-400" />
        </div>
    </div>
);

const QuickLink: React.FC<{ to: string; Icon: React.ComponentType<{ size?: number; className?: string }>; label: string; tone: string }> = ({ to, Icon, label, tone }) => (
    <Link to={to} className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-border-subtle bg-bg-surface/40 hover:bg-bg-surface hover:border-border-subtle/80 transition-colors text-sm text-text-main group min-w-0">
        <Icon size={16} className={`${tone} shrink-0`} />
        <span className="flex-1 font-medium truncate">{label}</span>
    </Link>
);

// ── System health ────────────────────────────────────────────────────

const SystemHealth: React.FC<{ health?: DashboardOverview['system_health'] }> = ({ health }) => {
    const tokens = health?.tokens ?? { connected: 0, expired: 0 };
    // `social_queue` replaced the Drive queue in the R2 cleanup — the
    // library no longer has an in-flight state worth surfacing.
    const social = health?.social_queue ?? { active: 0, failed: 0 };
    return (
        <div className="rounded-3xl border border-border-subtle bg-bg-card p-6">
            <p className="text-xs uppercase font-bold text-text-muted tracking-widest mb-4 flex items-center gap-2">
                <PlaySquare size={14} className="text-brand-emerald" /> System Health
            </p>
            <div className="space-y-2">
                <HealthRow
                    label="Social queue"
                    status={social.active > 0 ? 'active' : social.failed > 0 ? 'attention' : 'ok'}
                    detail={social.active > 0 ? `${social.active} active` : social.failed > 0 ? `${social.failed} failed` : 'idle'}
                />
                <HealthRow
                    label="Platform tokens"
                    status={tokens.expired > 0 ? 'attention' : tokens.connected > 0 ? 'ok' : 'unknown'}
                    detail={tokens.expired > 0 ? `${tokens.expired} expired` : tokens.connected > 0 ? `${tokens.connected} connected` : 'none connected'}
                />
                <HealthRow
                    label="Failed uploads"
                    status={social.failed > 0 ? 'attention' : 'ok'}
                    detail={social.failed > 0 ? `${social.failed} social failed` : 'all clean'}
                />
            </div>
        </div>
    );
};

const HealthRow: React.FC<{ label: string; status: 'ok' | 'active' | 'attention' | 'unknown'; detail: string }> = ({ label, status, detail }) => {
    const dot = status === 'ok' ? 'bg-brand-emerald'
        : status === 'active' ? 'bg-brand-blue'
            : status === 'attention' ? 'bg-red-500'
                : 'bg-text-muted';
    return (
        <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-bg-surface/40">
            <span className={`w-2.5 h-2.5 rounded-full ${dot} shrink-0`} />
            <span className="text-sm font-medium text-text-main flex-1">{label}</span>
            <span className="text-xs text-text-muted">{detail}</span>
        </div>
    );
};

// ── Needs attention (failed items) ───────────────────────────────────

const NeedsAttention: React.FC<{ items: DashboardFailedItem[] }> = ({ items }) => (
    <div className="rounded-3xl border border-border-subtle bg-bg-card p-6">
        <div className="flex items-center justify-between mb-4">
            <p className="text-xs uppercase font-bold text-text-muted tracking-widest flex items-center gap-2">
                <AlertCircle size={14} className="text-red-400" /> Needs Attention
            </p>
            {items.length > 0 && (
                <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-red-500/15 text-red-400">{items.length}</span>
            )}
        </div>
        {items.length === 0 ? (
            <div className="py-8 text-center text-text-muted text-sm flex flex-col items-center gap-3">
                <CheckCircle2 size={28} className="text-brand-emerald" />
                All clean. No failed items.
            </div>
        ) : (
            <div className="space-y-2.5">
                {items.slice(0, 5).map(it => {
                    const mod = MODULE_BADGE[it.module] ?? MODULE_BADGE.library;
                    return (
                        <div key={`${it.module}-${it.id}`} className="rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3">
                            <div className="flex items-start gap-2">
                                <span className={`text-[10px] font-bold uppercase px-2 py-1 rounded-full shrink-0 ${mod.tone}`}>
                                    {mod.label}
                                </span>
                                {it.meta?.platform && (
                                    <span className="text-[10px] font-bold uppercase text-text-muted self-center">{it.meta.platform}</span>
                                )}
                            </div>
                            <p className="text-sm font-semibold text-text-main mt-2 truncate" title={it.title}>{it.title}</p>
                            {it.error_message && (
                                <p className="text-xs text-red-400/80 mt-1 line-clamp-2" title={it.error_message}>{it.error_message}</p>
                            )}
                        </div>
                    );
                })}
                {items.length > 5 && (
                    <Link to="/dashboard/library" className="block text-center text-xs font-semibold text-brand-emerald hover:underline pt-1.5">
                        View all {items.length} failed items →
                    </Link>
                )}
            </div>
        )}
    </div>
);

// ── Upcoming schedules ───────────────────────────────────────────────

const UpcomingSchedules: React.FC<{ items: DashboardUpcomingItem[] }> = ({ items }) => (
    <div className="rounded-3xl border border-border-subtle bg-bg-card p-6">
        <div className="flex items-center justify-between mb-4">
            <p className="text-xs uppercase font-bold text-text-muted tracking-widest flex items-center gap-2">
                <Clock size={14} className="text-brand-blue" /> Upcoming Schedules
            </p>
            <Link to="/dashboard/calendar" className="text-xs font-semibold text-brand-blue hover:underline">View all</Link>
        </div>
        {items.length === 0 ? (
            <div className="py-8 text-center text-text-muted text-sm">No upcoming schedules.</div>
        ) : (
            <div className="space-y-2.5">
                {items.map(it => (
                    <div key={it.id} className="rounded-xl border border-border-subtle bg-bg-surface/40 px-4 py-3">
                        <p className="text-sm font-semibold text-text-main truncate" title={it.title}>{it.title}</p>
                        <div className="flex items-center justify-between mt-2">
                            <p className="text-xs text-text-muted">
                                {it.scheduledAt ? new Date(it.scheduledAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—'}
                            </p>
                            <div className="flex items-center gap-1.5">
                                {it.platforms?.slice(0, 3).map(p => {
                                    const tone = p === 'youtube' ? 'text-red-500' : p === 'facebook' ? 'text-brand-blue' : 'text-purple-400';
                                    const Icon = p === 'youtube' ? Youtube : p === 'facebook' ? Facebook : Instagram;
                                    return <Icon key={p} size={14} className={tone} />;
                                })}
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        )}
    </div>
);

export default Overview;
