/**
 * Analytics — visual, attractive dashboard. NO table, NO row list.
 * Just gradient summary cards + donut + Today panel. Live data from
 * YouTube / Facebook / Instagram platform APIs only; no Library
 * coupling, no DB storage of metrics.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
    BarChart3,
    Youtube,
    Facebook,
    Instagram,
    RefreshCw,
    Loader2,
    AlertTriangle,
    Eye,
    Heart,
    MessageSquare,
    Share2,
    Bookmark,
    TrendingUp,
    Sparkles,
    Calendar,
    Zap,
} from 'lucide-react';
import toast from 'react-hot-toast';
import {
    analytics_service,
    AnalyticsItem,
    AnalyticsPlatform,
    AnalyticsResponse,
    AnalyticsStatus,
    TodayAnalyticsResponse,
} from '../../../services/analytics_service';
import { CommonSearchSelect } from '../../../components/ui/CommonSearchSelect';
import { ThemedDatePicker } from '../../../components/ui/ThemedDatePicker';

// ── Theme map ─────────────────────────────────────────────────────────

const PLATFORM_TONE: Record<AnalyticsItem['platform'] | 'all', { label: string; pill: string; tile: string; Icon: React.ComponentType<{ size?: number; className?: string }> }> = {
    all: { label: 'All Platforms', pill: 'bg-gradient-to-r from-brand-emerald via-purple-500 to-brand-blue text-white', tile: 'text-text-main', Icon: BarChart3 },
    youtube: { label: 'YouTube', pill: 'bg-red-500/15 text-red-400', tile: 'text-red-500', Icon: Youtube },
    facebook: { label: 'Facebook', pill: 'bg-brand-blue/15 text-brand-blue', tile: 'text-brand-blue', Icon: Facebook },
    instagram: { label: 'Instagram', pill: 'bg-purple-500/15 text-purple-400', tile: 'text-purple-400', Icon: Instagram },
};

function fmt(n: number): string {
    if (!Number.isFinite(n)) return '—';
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return String(n);
}

// ── Page ──────────────────────────────────────────────────────────────

const AnalyticsPage: React.FC = () => {
    const [platform, set_platform] = useState<AnalyticsPlatform>('all');
    const [status, set_status] = useState<AnalyticsStatus>('all');
    const [start_date, set_start_date] = useState('');
    const [end_date, set_end_date] = useState('');
    const [data, set_data] = useState<AnalyticsResponse | null>(null);
    const [today_data, set_today_data] = useState<TodayAnalyticsResponse | null>(null);
    const [loading, set_loading] = useState(false);

    const load = useCallback(async (force = false) => {
        set_loading(true);
        try {
            // include_items=false (default) — we don't render rows.
            const params: any = { platform, status };
            if (start_date || end_date) {
                params.date_range = 'custom';
                if (start_date) params.start_date = start_date;
                if (end_date) params.end_date = end_date;
            }
            if (force) params.force_refresh = true;
            const res = await analytics_service.fetch(params);
            if (!res.success || !res.data) throw new Error(res.message || 'Failed to load analytics');
            set_data(res.data);
        } catch (err: any) {
            toast.error(err?.message || 'Failed to load analytics');
        } finally {
            set_loading(false);
        }
    }, [platform, status, start_date, end_date]);

    const load_today = useCallback(async (force = false) => {
        try {
            const params: any = {};
            if (platform !== 'all') params.platform = platform;
            if (force) params.force_refresh = true;
            const res = await analytics_service.fetch_today(params);
            if (!res.success || !res.data) return;
            set_today_data(res.data);
        } catch { /* non-fatal */ }
    }, [platform]);

    useEffect(() => {
        const id = setTimeout(() => { void load(); }, 0);
        return () => clearTimeout(id);
    }, [platform, status, start_date, end_date]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        const id = setTimeout(() => { void load_today(); }, 0);
        return () => clearTimeout(id);
    }, [platform]); // eslint-disable-line react-hooks/exhaustive-deps

    const summary = data?.summary;
    const today_summary = today_data?.today_summary ?? data?.today_summary;
    const errors = data?.errors ?? [];

    return (
        <div className="space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* ── HEADER (compact gradient hero) ─────────────────────── */}
            <div className="relative overflow-hidden rounded-3xl border border-border-subtle bg-gradient-to-br from-red-500/15 via-brand-blue/15 to-purple-500/15 px-6 py-5">
                <div className="absolute -top-16 -right-16 w-72 h-72 rounded-full bg-gradient-to-br from-brand-emerald/40 via-purple-500/40 to-brand-blue/40 blur-3xl pointer-events-none animate-pulse" />
                <div className="absolute -bottom-12 -left-12 w-48 h-48 rounded-full bg-gradient-to-tr from-purple-500/20 to-pink-500/20 blur-3xl pointer-events-none" />
                <div className="relative flex items-center justify-between gap-4">
                    <div className="min-w-0">
                        <div className="inline-flex items-center gap-1.5 mb-2 text-[10px] font-bold uppercase tracking-widest text-text-muted">
                            <span className="relative flex h-2 w-2">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-emerald opacity-75" />
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-brand-emerald" />
                            </span>
                            Live · platform APIs
                        </div>
                        <h2 className="text-3xl md:text-4xl font-bold tracking-tight leading-none">
                            <span className="bg-gradient-to-r from-red-400 via-brand-blue to-purple-400 bg-clip-text text-transparent">
                                Analytics
                            </span>
                        </h2>
                        <p className="text-text-muted text-sm mt-1.5 max-w-[560px]">
                            Live from YouTube, Facebook, and Instagram. Numbers fetch on every load and aren't stored in the database.
                        </p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                        {data?.fetched_at && (
                            <span className={`text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full border ${data.cached
                                ? 'border-amber-400/30 bg-amber-400/10 text-amber-300'
                                : 'border-brand-emerald/30 bg-brand-emerald/10 text-brand-emerald'
                                }`}>
                                {data.cached ? 'Cached' : 'Live'} · {new Date(data.fetched_at).toLocaleTimeString()}
                            </span>
                        )}
                        <button
                            onClick={() => { void load(true); void load_today(true); }}
                            disabled={loading}
                            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-brand-emerald to-brand-blue text-white text-sm font-bold shadow-lg shadow-brand-emerald/30 hover:shadow-brand-emerald/50 hover:scale-[1.02] transition-all disabled:opacity-60"
                        >
                            {loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                            Refresh
                        </button>
                    </div>
                </div>
            </div>

            {/* ── FILTER BAR ──────────────────────────────────────── */}
            <div className="glass-card px-4 py-2.5 flex flex-wrap items-center gap-2 justify-between">
                <div className="flex flex-wrap items-center gap-2 ">
                    {(['all', 'youtube', 'facebook', 'instagram'] as AnalyticsPlatform[]).map(p => {
                        const meta = PLATFORM_TONE[p];
                        const active = platform === p;
                        return (
                            <button
                                key={p}
                                onClick={() => set_platform(p)}
                                {...(p != 'all' && { style: { background: 'transparent', border: 'none', cursor: 'pointer' } })}
                                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all ${active
                                    ? `${meta.pill} shadow-md scale-[1.03]`
                                    : 'text-text-muted hover:text-text-main hover:bg-bg-surface'
                                    }`}
                            >
                                <meta.Icon size={12} className={active ? '' : meta.tile} />
                                {meta.label}
                            </button>
                        );
                    })}
                </div>
                <span className="h-6 w-px bg-border-subtle hidden md:inline-block mx-1" />
                <div className="flex flex-wrap items-center gap-2 ">
                    <div className="w-40">
                        <CommonSearchSelect
                            size="sm"
                            value={status}
                            on_change={(v) => set_status((v ?? 'all') as AnalyticsStatus)}
                            options={[
                                { label: 'All statuses', value: 'all' },
                                { label: 'Published', value: 'published' },
                                { label: 'Scheduled', value: 'scheduled' },
                                { label: 'Failed', value: 'failed' },
                                { label: 'Processing', value: 'processing' },
                                { label: 'Draft', value: 'draft' },
                            ]}
                        />
                    </div>
                    <div className="w-40">
                        <ThemedDatePicker size='sm' value={start_date} onChange={set_start_date} placeholder="Start date" max={end_date || undefined} />
                    </div>
                    <div className="w-40">
                        <ThemedDatePicker size='sm' value={end_date} onChange={set_end_date} placeholder="End date" min={start_date || undefined} />
                    </div>
                    {(start_date || end_date) && (
                        <button onClick={() => { set_start_date(''); set_end_date(''); }} className="text-[11px] text-text-muted hover:text-red-400">
                            Clear
                        </button>
                    )}
                </div>

            </div>

            {/* ── ERROR BANNER ────────────────────────────────────── */}
            {errors.length > 0 && (
                <div className="flex items-start gap-2 px-3 py-2 rounded-xl border border-amber-500/30 bg-amber-500/5 text-[11px] text-amber-300">
                    <AlertTriangle size={12} className="mt-0.5 shrink-0" />
                    <span className="font-bold mr-1">Some platform data could not be loaded:</span>
                    <div className="flex flex-wrap gap-1.5">
                        {errors.map((e, i) => (
                            <span key={i} className="px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/30 text-amber-200">
                                {e.platform} · {e.error_kind}
                            </span>
                        ))}
                    </div>
                </div>
            )}

            {/* ── BODY: 3 hero cards on top, then 6 metric cards + right panel ── */}
            <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_380px] gap-5 items-start">
                {/* LEFT */}
                <div className="space-y-5">
                    {/* Hero stats (3 across) — big atmospheric gradient cards */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <HeroCard
                            label="Total platform videos"
                            value={summary?.total_platform_videos ?? 0}
                            sub={`${summary?.published ?? 0} published · ${summary?.scheduled ?? 0} scheduled · ${summary?.failed ?? 0} failed`}
                            Icon={BarChart3}
                            grad_from="from-brand-emerald/40"
                            grad_to="to-brand-emerald/5"
                            ring="ring-brand-emerald/40"
                            tone="text-brand-emerald"
                        />
                        <HeroCard
                            label="Total engagement"
                            value={summary?.total_engagement ?? 0}
                            sub={`${fmt(summary?.total_likes ?? 0)} likes · ${fmt(summary?.total_comments ?? 0)} comments · ${fmt(summary?.total_shares ?? 0)} shares`}
                            Icon={Sparkles}
                            grad_from="from-purple-500/40"
                            grad_to="to-pink-500/5"
                            ring="ring-purple-500/40"
                            tone="text-purple-400"
                        />
                        <HeroCard
                            label="Views / Plays"
                            value={summary?.total_views ?? 0}
                            sub={`${fmt(summary?.total_reach ?? 0)} reach · ${fmt(summary?.total_impressions ?? 0)} impressions`}
                            Icon={Eye}
                            grad_from="from-brand-blue/40"
                            grad_to="to-cyan-500/5"
                            ring="ring-brand-blue/40"
                            tone="text-brand-blue"
                        />
                    </div>

                    {/* Detail metric cards (6 across — small atmospheric cards) */}
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                        <MetricCard label="Likes / Reactions" value={summary?.total_likes ?? 0} Icon={Heart} grad="from-rose-500/30 to-rose-500/5" ring="ring-rose-500/30" tone="text-rose-400" />
                        <MetricCard label="Comments" value={summary?.total_comments ?? 0} Icon={MessageSquare} grad="from-amber-400/30 to-amber-400/5" ring="ring-amber-400/30" tone="text-amber-400" />
                        <MetricCard label="Shares" value={summary?.total_shares ?? 0} Icon={Share2} grad="from-purple-500/30 to-purple-500/5" ring="ring-purple-500/30" tone="text-purple-400" />
                        <MetricCard label="Saves" value={summary?.total_saves ?? 0} Icon={Bookmark} grad="from-cyan-500/30 to-cyan-500/5" ring="ring-cyan-500/30" tone="text-cyan-400" />
                        <MetricCard label="Reach" value={summary?.total_reach ?? 0} Icon={TrendingUp} grad="from-emerald-500/30 to-teal-500/5" ring="ring-emerald-500/30" tone="text-brand-emerald" />
                        <MetricCard label="Impressions" value={summary?.total_impressions ?? 0} Icon={Zap} grad="from-blue-500/30 to-indigo-500/5" ring="ring-blue-500/30" tone="text-brand-blue" />
                    </div>

                    {/* Per-platform hero strip (only on All view) */}
                    {platform === 'all' && summary && (
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <PlatformHero
                                tone="youtube"
                                videos={summary.youtube_videos}
                                secondary={[
                                    { label: 'Views', value: data?.platform_summary?.youtube?.views ?? 0 },
                                    { label: 'Likes', value: data?.platform_summary?.youtube?.likes ?? 0 },
                                    { label: 'Comments', value: data?.platform_summary?.youtube?.comments_count ?? 0 },
                                ]}
                            />
                            <PlatformHero
                                tone="facebook"
                                videos={summary.facebook_videos}
                                secondary={[
                                    { label: 'Views', value: data?.platform_summary?.facebook?.views ?? 0 },
                                    { label: 'Reactions', value: data?.platform_summary?.facebook?.reactions ?? 0 },
                                    { label: 'Reach', value: data?.platform_summary?.facebook?.reach ?? 0 },
                                ]}
                            />
                            <PlatformHero
                                tone="instagram"
                                videos={summary.instagram_videos}
                                secondary={[
                                    { label: 'Plays', value: data?.platform_summary?.instagram?.plays ?? 0 },
                                    { label: 'Likes', value: data?.platform_summary?.instagram?.likes ?? 0 },
                                    { label: 'Saves', value: data?.platform_summary?.instagram?.saves ?? 0 },
                                ]}
                            />
                        </div>
                    )}
                </div>

                {/* RIGHT: chart + today, sticky */}
                <div className="space-y-4 lg:sticky lg:top-4 self-start">
                    <PlatformDistribution
                        youtube={summary?.youtube_videos ?? 0}
                        facebook={summary?.facebook_videos ?? 0}
                        instagram={summary?.instagram_videos ?? 0}
                    />
                    <TodaySnapshot today={today_summary} />
                </div>
            </div>
        </div>
    );
};

// ── Hero card (big, gradient, glowing) ────────────────────────────────

const HeroCard: React.FC<{
    label: string;
    value: number;
    sub: string;
    Icon: React.ComponentType<{ size?: number; className?: string }>;
    grad_from: string;
    grad_to: string;
    ring: string;
    tone: string;
}> = ({ label, value, sub, Icon, grad_from, grad_to, ring, tone }) => (
    <div className={`relative overflow-hidden rounded-2xl border border-border-subtle ring-1 ${ring} p-5 transition-all hover:scale-[1.01] hover:shadow-2xl group`}>
        {/* Animated gradient wash */}
        <div className={`absolute inset-0 bg-gradient-to-br ${grad_from} via-transparent ${grad_to} pointer-events-none`} />
        {/* Decorative blob in the corner */}
        <div className={`absolute -top-12 -right-12 w-32 h-32 rounded-full ${grad_from.replace('from-', 'bg-').replace('/40', '/20')} blur-2xl pointer-events-none group-hover:opacity-150 transition-opacity`} />
        <div className="relative">
            <div className="flex items-start justify-between">
                <div className={`w-12 h-12 rounded-xl bg-bg-main/60 backdrop-blur flex items-center justify-center ${tone}`}>
                    <Icon size={22} />
                </div>
            </div>
            <p className="text-[10px] uppercase font-bold text-text-muted tracking-widest mt-3">{label}</p>
            <p className="text-4xl font-bold text-text-main leading-none mt-1.5">{fmt(value)}</p>
            <p className="text-[11px] text-text-muted mt-2 leading-relaxed">{sub}</p>
        </div>
    </div>
);

// ── Metric card (smaller, gradient, glowing) ──────────────────────────

const MetricCard: React.FC<{
    label: string;
    value: number;
    Icon: React.ComponentType<{ size?: number; className?: string }>;
    grad: string;
    ring: string;
    tone: string;
}> = ({ label, value, Icon, grad, ring, tone }) => (
    <div className={`relative overflow-hidden rounded-2xl border border-border-subtle ring-1 ${ring} p-4 transition-all hover:scale-[1.02] hover:shadow-xl group`}>
        <div className={`absolute inset-0 bg-gradient-to-br ${grad} pointer-events-none`} />
        <div className="relative flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl bg-bg-main/60 backdrop-blur flex items-center justify-center shrink-0 ${tone}`}>
                <Icon size={18} />
            </div>
            <div className="min-w-0 flex-1">
                <p className="text-[9px] uppercase font-bold text-text-muted tracking-widest">{label}</p>
                <p className="text-2xl font-bold text-text-main leading-none mt-1">{fmt(value)}</p>
            </div>
        </div>
    </div>
);

// ── Per-platform hero card ───────────────────────────────────────────

const PlatformHero: React.FC<{
    tone: AnalyticsItem['platform'];
    videos: number;
    secondary: Array<{ label: string; value: number }>;
}> = ({ tone, videos, secondary }) => {
    const meta = PLATFORM_TONE[tone];
    const gradient = tone === 'youtube' ? 'from-red-500/30 via-red-500/5 to-transparent'
        : tone === 'facebook' ? 'from-brand-blue/30 via-brand-blue/5 to-transparent'
            : 'from-purple-500/30 via-pink-500/10 to-transparent';
    const ring = tone === 'youtube' ? 'ring-red-500/30'
        : tone === 'facebook' ? 'ring-brand-blue/30'
            : 'ring-purple-500/30';
    const blob = tone === 'youtube' ? 'bg-red-500/20'
        : tone === 'facebook' ? 'bg-brand-blue/20'
            : 'bg-purple-500/20';
    return (
        <div className={`relative overflow-hidden rounded-2xl border border-border-subtle ring-1 ${ring} p-5 transition-all hover:scale-[1.01] hover:shadow-xl group`}>
            <div className={`absolute inset-0 bg-gradient-to-br ${gradient} pointer-events-none`} />
            <div className={`absolute -top-12 -right-12 w-32 h-32 rounded-full ${blob} blur-2xl pointer-events-none`} />
            <div className="relative space-y-3">
                <div className="flex items-center gap-3">
                    <div className={`w-12 h-12 rounded-xl bg-bg-main/60 backdrop-blur flex items-center justify-center ${meta.tile}`}>
                        <meta.Icon size={22} />
                    </div>
                    <div>
                        <p className="text-[10px] uppercase font-bold text-text-muted tracking-widest">{meta.label}</p>
                        <p className="text-2xl font-bold text-text-main leading-none mt-0.5">
                            {videos} <span className="text-xs font-normal text-text-muted">videos</span>
                        </p>
                    </div>
                </div>
                <div className="grid grid-cols-3 gap-2 pt-2 border-t border-border-subtle/60">
                    {secondary.map(s => (
                        <div key={s.label} className="text-center">
                            <p className="text-[9px] uppercase font-semibold text-text-muted tracking-wide">{s.label}</p>
                            <p className="text-sm font-bold text-text-main mt-0.5">{fmt(s.value)}</p>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

// ── Platform distribution donut ──────────────────────────────────────

const PlatformDistribution: React.FC<{ youtube: number; facebook: number; instagram: number }> = ({ youtube, facebook, instagram }) => {
    const total = youtube + facebook + instagram;
    const radius = 60;
    const circumference = 2 * Math.PI * radius;
    const yt_len = total > 0 ? (youtube / total) * circumference : 0;
    const fb_len = total > 0 ? (facebook / total) * circumference : 0;
    const ig_len = total > 0 ? (instagram / total) * circumference : 0;

    return (
        <div className="relative overflow-hidden rounded-2xl border border-border-subtle ring-1 ring-border-subtle/60 bg-bg-card p-5">
            <div className="absolute -top-16 -right-16 w-48 h-48 rounded-full bg-gradient-to-br from-red-500/10 via-brand-blue/10 to-purple-500/10 blur-3xl pointer-events-none" />
            <div className="relative">
                <div className="flex items-center justify-between mb-3">
                    <p className="text-[10px] uppercase font-bold text-text-muted tracking-widest flex items-center gap-1.5">
                        <BarChart3 size={11} className="text-brand-emerald" /> Platform Distribution
                    </p>
                    <span className="text-[10px] text-text-muted">Total {total}</span>
                </div>
                {total === 0 ? (
                    <div className="py-12 text-center text-text-muted text-sm">No videos on any connected platform yet.</div>
                ) : (
                    <div className="flex items-center gap-4">
                        <svg viewBox="0 0 160 160" className="w-[140px] h-[140px] shrink-0 -rotate-90 drop-shadow-2xl">
                            <circle cx="80" cy="80" r={radius} fill="none" stroke="currentColor" strokeWidth="20" className="text-bg-surface" />
                            {youtube > 0 && (
                                <circle cx="80" cy="80" r={radius} fill="none" stroke="rgb(239 68 68)" strokeWidth="20"
                                    strokeDasharray={`${yt_len} ${circumference - yt_len}`} strokeDashoffset="0" />
                            )}
                            {facebook > 0 && (
                                <circle cx="80" cy="80" r={radius} fill="none" stroke="rgb(59 130 246)" strokeWidth="20"
                                    strokeDasharray={`${fb_len} ${circumference - fb_len}`} strokeDashoffset={-yt_len} />
                            )}
                            {instagram > 0 && (
                                <circle cx="80" cy="80" r={radius} fill="none" stroke="rgb(168 85 247)" strokeWidth="20"
                                    strokeDasharray={`${ig_len} ${circumference - ig_len}`} strokeDashoffset={-(yt_len + fb_len)} />
                            )}
                            <g transform="rotate(90 80 80)">
                                <text x="80" y="78" textAnchor="middle" dominantBaseline="central"
                                    className="fill-text-main font-bold" style={{ fontSize: '26px' }}>
                                    {total}
                                </text>
                                <text x="80" y="98" textAnchor="middle" dominantBaseline="central"
                                    className="fill-text-muted font-bold uppercase tracking-widest" style={{ fontSize: '8px' }}>
                                    videos
                                </text>
                            </g>
                        </svg>
                        <div className="flex-1 min-w-0 space-y-2">
                            <DonutLegend label="YouTube" count={youtube} total={total} dot="bg-red-500" Icon={Youtube} tone="text-red-500" />
                            <DonutLegend label="Facebook" count={facebook} total={total} dot="bg-brand-blue" Icon={Facebook} tone="text-brand-blue" />
                            <DonutLegend label="Instagram" count={instagram} total={total} dot="bg-purple-500" Icon={Instagram} tone="text-purple-400" />
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

const DonutLegend: React.FC<{ label: string; count: number; total: number; dot: string; Icon: React.ComponentType<{ size?: number; className?: string }>; tone: string }> = ({ label, count, total, dot, Icon, tone }) => {
    const pct = total > 0 ? Math.round((count / total) * 100) : 0;
    return (
        <div className="flex items-center gap-2 text-xs">
            <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${dot}`} />
            <Icon size={13} className={`shrink-0 ${tone}`} />
            <span className="font-bold text-text-main flex-1 truncate">{label}</span>
            <span className="font-mono text-text-main">{count}</span>
            <span className="text-[10px] text-text-muted w-8 text-right">{pct}%</span>
        </div>
    );
};

// ── Today snapshot ───────────────────────────────────────────────────

const TodaySnapshot: React.FC<{ today?: AnalyticsResponse['today_summary'] }> = ({ today }) => {
    const t = today ?? {
        total_platform_videos: 0, youtube_videos: 0, facebook_videos: 0, instagram_videos: 0,
        published: 0, scheduled: 0, failed: 0, processing: 0, draft: 0,
        total_views: 0, total_likes: 0, total_comments: 0, total_shares: 0,
        total_reach: 0, total_impressions: 0, total_saves: 0, total_engagement: 0,
    };
    const tiles = [
        { label: 'Posted', value: t.total_platform_videos, tone: 'text-brand-emerald', bg: 'bg-brand-emerald/10' },
        { label: 'Views', value: t.total_views, tone: 'text-brand-blue', bg: 'bg-brand-blue/10' },
        { label: 'Likes', value: t.total_likes, tone: 'text-rose-400', bg: 'bg-rose-500/10' },
        { label: 'Comments', value: t.total_comments, tone: 'text-amber-400', bg: 'bg-amber-400/10' },
        { label: 'Shares', value: t.total_shares, tone: 'text-purple-400', bg: 'bg-purple-500/10' },
        { label: 'Saves', value: t.total_saves, tone: 'text-cyan-400', bg: 'bg-cyan-500/10' },
    ];
    return (
        <div className="relative overflow-hidden rounded-2xl border border-border-subtle ring-1 ring-brand-blue/30 bg-bg-card p-5">
            <div className="absolute -top-12 -right-12 w-40 h-40 rounded-full bg-brand-blue/15 blur-3xl pointer-events-none" />
            <div className="relative">
                <div className="flex items-center justify-between mb-3">
                    <p className="text-[10px] uppercase font-bold text-text-muted tracking-widest flex items-center gap-1.5">
                        <Calendar size={11} className="text-brand-blue" /> Today
                    </p>
                    <span className="text-[10px] text-text-muted">{new Date().toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                    {tiles.map(tile => (
                        <div key={tile.label} className={`rounded-lg ${tile.bg} px-2.5 py-2`}>
                            <p className="text-[9px] uppercase font-bold text-text-muted tracking-wider">{tile.label}</p>
                            <p className={`text-base font-bold ${tile.tone}`}>{fmt(tile.value)}</p>
                        </div>
                    ))}
                </div>
                <div className="mt-3 pt-3 border-t border-border-subtle/60 grid grid-cols-3 gap-1 text-center text-[11px]">
                    <div>
                        <p className="text-[9px] uppercase text-text-muted tracking-wide">YouTube</p>
                        <p className="text-text-main font-bold">{t.youtube_videos}</p>
                    </div>
                    <div>
                        <p className="text-[9px] uppercase text-text-muted tracking-wide">Facebook</p>
                        <p className="text-text-main font-bold">{t.facebook_videos}</p>
                    </div>
                    <div>
                        <p className="text-[9px] uppercase text-text-muted tracking-wide">Instagram</p>
                        <p className="text-text-main font-bold">{t.instagram_videos}</p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AnalyticsPage;
