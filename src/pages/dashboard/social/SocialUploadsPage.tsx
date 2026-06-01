/**
 * /dashboard/media-upload — card-based view of every social upload.
 *
 * Each card shows: media title/file, platform, OTT source, status badge,
 * dates, and optionally an expanded detail panel with the full platform
 * response payload and metadata sidebar.
 *
 * All filtering, stats, pagination, and copyright-check logic from the
 * original table-based implementation is preserved exactly — only the
 * upload-row presentation changes (table → glass cards).
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    Youtube,
    Facebook,
    Instagram,
    Loader2,
    RefreshCw,
    AlertTriangle,
    CheckCircle2,
    Clock,
    ExternalLink,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    UploadCloud,
    Search,
    Copy,
    Check,
    Hash,
    Film,
    UserCircle2,
    ShieldAlert,
    Sparkles,
    Globe,
    Tag,
    Link2,
    Activity,
    X,
    Layers,
    Folder,
    Calendar,
    FileText,
    ImageIcon,
    Music,
    ChevronUp,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { social_service, SocialPlatform, SocialUploadRow } from '../../../services/social_service';
import { ThemedDatePicker } from '../../../components/ui/ThemedDatePicker';
import { useOTT } from '../../../context/OTTContext';
import { OttPlatformSummary } from '../../../types';

// ── Constants ─────────────────────────────────────────────────────────

const PLATFORM_META: Record<SocialPlatform, { label: string; Icon: React.ComponentType<{ size?: number; className?: string }>; tone: string; bg: string }> = {
    youtube: { label: 'YouTube', Icon: Youtube, tone: 'text-red-500', bg: 'bg-red-500/10' },
    facebook: { label: 'Facebook', Icon: Facebook, tone: 'text-blue-500', bg: 'bg-blue-500/10' },
    instagram: { label: 'Instagram', Icon: Instagram, tone: 'text-purple-500', bg: 'bg-purple-500/10' },
};

const STATUS_CONFIG: Record<string, { label: string; cls: string; dot: string }> = {
    draft:      { label: 'Draft',      cls: 'bg-zinc-500/15 text-zinc-400 ring-zinc-500/20',          dot: 'bg-zinc-400' },
    scheduled:  { label: 'Scheduled',  cls: 'bg-amber-400/15 text-amber-400 ring-amber-400/20',       dot: 'bg-amber-400' },
    uploading:  { label: 'Processing', cls: 'bg-brand-blue/15 text-brand-blue ring-brand-blue/20',    dot: 'bg-brand-blue' },
    uploaded:   { label: 'Published',  cls: 'bg-brand-emerald/15 text-brand-emerald ring-brand-emerald/20', dot: 'bg-brand-emerald' },
    failed:     { label: 'Failed',     cls: 'bg-red-500/15 text-red-400 ring-red-500/20',             dot: 'bg-red-400' },
    cancelled:  { label: 'Cancelled',  cls: 'bg-zinc-500/15 text-zinc-400 ring-zinc-500/20',          dot: 'bg-zinc-400' },
};

const STATUS_DOT: Record<string, string | undefined> = {
    all: undefined,
    uploaded:  'bg-brand-emerald',
    scheduled: 'bg-amber-400',
    uploading: 'bg-brand-blue',
    failed:    'bg-red-400',
    cancelled: 'bg-zinc-400',
};

const is_copyright_takedown = (u: SocialUploadRow): boolean => {
    const r = u.upload_result as any;
    return !!(r?.copyright_verdict?.has_issue || r?.auto_deleted_at);
};

type PlatformFilter = SocialPlatform | 'all';
type StatusFilter = 'all' | 'uploaded' | 'scheduled' | 'uploading' | 'failed' | 'draft' | 'cancelled';

const PAGE_SIZE = 12;

// ── File type icon ─────────────────────────────────────────────────────

function file_icon(file_name: string | null | undefined): React.ReactNode {
    const ext = (file_name ?? '').split('.').pop()?.toLowerCase() ?? '';
    if (['mp4', 'mov', 'avi', 'mkv', 'webm'].includes(ext)) return <Film size={20} />;
    if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif'].includes(ext)) return <ImageIcon size={20} />;
    if (['mp3', 'aac', 'wav', 'ogg', 'flac'].includes(ext)) return <Music size={20} />;
    return <FileText size={20} />;
}

// ── Main page ──────────────────────────────────────────────────────────

const SocialUploadsPage: React.FC = () => {
    const { otts } = useOTT();
    const ott_map = useMemo(
        () => new Map<string, OttPlatformSummary>(otts.map(o => [o.id, o])),
        [otts],
    );

    const [uploads, set_uploads] = useState<SocialUploadRow[]>([]);
    const [total, set_total] = useState(0);
    const [page, set_page] = useState(1);
    const [loading, set_loading] = useState(false);
    const [checking_copyright, set_checking_copyright] = useState(false);
    const [platform_filter, set_platform_filter] = useState<PlatformFilter>('all');
    const [status_filter, set_status_filter] = useState<StatusFilter>('all');
    const [search, set_search] = useState('');
    const [committed_search, set_committed_search] = useState('');
    const [date_from, set_date_from] = useState('');
    const [date_to, set_date_to] = useState('');
    const [overall_stats, set_overall_stats] = useState<{
        total: number;
        by_status: Record<'draft' | 'scheduled' | 'uploading' | 'uploaded' | 'failed' | 'cancelled', number>;
        by_platform: Record<'youtube' | 'facebook' | 'instagram', number>;
    } | null>(null);
    const [platform_stats, set_platform_stats] = useState<{
        total: number;
        by_platform: Record<'youtube' | 'facebook' | 'instagram', number>;
    } | null>(null);
    const [expanded_id, set_expanded_id] = useState<string | null>(null);

    const load = useCallback(async () => {
        set_loading(true);
        try {
            const [list_res, overall_res, platform_res] = await Promise.all([
                social_service.list_uploads({
                    platform:  platform_filter === 'all' ? undefined : platform_filter,
                    status:    status_filter === 'all' ? undefined : status_filter,
                    search:    committed_search.trim() || undefined,
                    date_from: date_from || undefined,
                    date_to:   date_to   || undefined,
                    page,
                    limit: PAGE_SIZE,
                }),
                social_service.get_upload_stats({
                    platform: platform_filter === 'all' ? undefined : platform_filter,
                }),
                social_service.get_upload_stats({
                    status: status_filter === 'all' ? undefined : status_filter,
                }),
            ]);
            if (!list_res.success || !list_res.data) throw new Error(list_res.message || 'Failed to load uploads');
            set_uploads(list_res.data.uploads);
            set_total(list_res.data.total);
            if (overall_res.success && overall_res.data) set_overall_stats(overall_res.data);
            if (platform_res.success && platform_res.data) {
                set_platform_stats({ total: platform_res.data.total, by_platform: platform_res.data.by_platform });
            }
        } catch (err: any) {
            toast.error(err?.message || 'Failed to load uploads');
        } finally {
            set_loading(false);
        }
    }, [platform_filter, status_filter, committed_search, date_from, date_to, page]);

    useEffect(() => { void load(); }, [load]);

    const change_platform = useCallback((p: PlatformFilter) => { set_platform_filter(p); set_page(1); set_expanded_id(null); }, []);
    const change_status   = useCallback((s: StatusFilter)   => { set_status_filter(s);   set_page(1); set_expanded_id(null); }, []);

    const total_pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    const range_from  = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
    const range_to    = Math.min(page * PAGE_SIZE, total);

    const check_copyright = useCallback(async () => {
        set_checking_copyright(true);
        try {
            const res = await social_service.youtube_copyright_check_now();
            if (!res.success || !res.data) throw new Error(res.message || 'Copyright check failed');
            const { checked, deleted, clean, errors } = res.data;
            if (deleted > 0) {
                toast.error(`Auto-deleted ${deleted} flagged video${deleted === 1 ? '' : 's'} (checked ${checked}, clean ${clean})`);
            } else if (checked === 0) {
                toast(`No YouTube uploads in window to check`);
            } else {
                toast.success(`Checked ${checked} video${checked === 1 ? '' : 's'} — all clean${errors ? `, ${errors} error(s)` : ''}`);
            }
            await load();
        } catch (err: any) {
            toast.error(err?.message || 'Copyright check failed');
        } finally {
            set_checking_copyright(false);
        }
    }, [load]);

    const stats = useMemo(() => ({
        total:     overall_stats?.total ?? 0,
        uploaded:  overall_stats?.by_status.uploaded  ?? 0,
        scheduled: overall_stats?.by_status.scheduled ?? 0,
        uploading: overall_stats?.by_status.uploading ?? 0,
        failed:    overall_stats?.by_status.failed    ?? 0,
        by_platform: {
            youtube:   overall_stats?.by_platform.youtube   ?? 0,
            facebook:  overall_stats?.by_platform.facebook  ?? 0,
            instagram: overall_stats?.by_platform.instagram ?? 0,
        } as Record<SocialPlatform, number>,
    }), [overall_stats]);

    const toggle = (id: string) => set_expanded_id(prev => (prev === id ? null : id));

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">

            {/* ── HEADER ─────────────────────────────────────────────── */}
            <div className="relative overflow-hidden rounded-3xl border border-border-subtle bg-gradient-to-br from-rose-500/10 via-brand-blue/10 to-purple-500/10 px-6 py-5">
                <div className="absolute -top-16 -right-16 w-72 h-72 rounded-full bg-gradient-to-br from-rose-500/20 via-brand-blue/20 to-purple-500/20 blur-3xl pointer-events-none" />
                <div className="relative flex flex-col md:flex-row md:items-end justify-between gap-4">
                    <div className="min-w-0">
                        <div className="inline-flex items-center gap-1.5 mb-2 text-[10px] font-bold uppercase tracking-widest text-text-muted">
                            <UploadCloud size={12} className="text-rose-400" />
                            Media Upload
                        </div>
                        <h2 className="text-2xl md:text-3xl font-bold tracking-tight leading-none">
                            <span className="bg-gradient-to-r from-rose-400 via-brand-blue to-purple-400 bg-clip-text text-transparent">
                                Uploads
                            </span>
                        </h2>
                        <p className="text-text-muted text-sm mt-1.5">
                            Track published media and upload status across YouTube, Facebook, and Instagram.
                        </p>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                        {/* Search */}
                        <div className="relative">
                            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
                            <input
                                type="text"
                                value={search}
                                onChange={e => set_search(e.target.value)}
                                onKeyDown={e => {
                                    if (e.key === 'Enter') { set_committed_search(search); set_page(1); set_expanded_id(null); }
                                }}
                                placeholder="Title… (Enter)"
                                className="input-field text-xs pl-8 pr-3 py-2 w-48"
                            />
                        </div>
                        {/* Date range */}
                        <ThemedDatePicker size="xs" value={date_from} max={date_to || undefined} placeholder="From" className="w-24"
                            onChange={(v: string) => { set_date_from(v); set_page(1); set_expanded_id(null); }} />
                        <span className="text-text-muted text-[10px] shrink-0">→</span>
                        <ThemedDatePicker size="xs" value={date_to} min={date_from || undefined} placeholder="To" className="w-24"
                            onChange={(v: string) => { set_date_to(v); set_page(1); set_expanded_id(null); }} />
                        {(date_from || date_to) && (
                            <button onClick={() => { set_date_from(''); set_date_to(''); set_page(1); set_expanded_id(null); }}
                                className="h-7 w-7 flex items-center justify-center rounded-lg text-text-muted hover:text-red-400 hover:bg-red-400/10 transition-all">
                                <X size={11} />
                            </button>
                        )}
                        {/* Copyright check */}
                        <button onClick={check_copyright} disabled={checking_copyright}
                            title="Run YouTube copyright check"
                            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-amber-400/30 text-amber-400 hover:bg-amber-400/10 text-xs font-bold disabled:opacity-50 transition-all">
                            {checking_copyright ? <Loader2 size={13} className="animate-spin" /> : <ShieldAlert size={13} />}
                            Copyright
                        </button>
                        {/* Refresh */}
                        <button onClick={load} disabled={loading}
                            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border-subtle text-text-muted hover:text-text-main text-xs font-bold disabled:opacity-60 transition-all">
                            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Refresh
                        </button>
                    </div>
                </div>
            </div>

            {/* ── STATUS STAT TILES ──────────────────────────────────── */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <Stat label="Total"     value={stats.total}     Icon={Hash}         active={status_filter === 'all'}       onClick={() => change_status('all')} />
                <Stat label="Published" value={stats.uploaded}  Icon={CheckCircle2} accent="emerald" total={stats.total}  active={status_filter === 'uploaded'}  onClick={() => change_status(status_filter === 'uploaded'  ? 'all' : 'uploaded')} />
                <Stat label="Scheduled" value={stats.scheduled} Icon={Clock}        accent="amber"   total={stats.total}  active={status_filter === 'scheduled'} onClick={() => change_status(status_filter === 'scheduled' ? 'all' : 'scheduled')} />
                <Stat label="Processing" value={stats.uploading} Icon={Loader2}     accent="blue"    total={stats.total} spinning active={status_filter === 'uploading'} onClick={() => change_status(status_filter === 'uploading' ? 'all' : 'uploading')} />
                <Stat label="Failed"    value={stats.failed}    Icon={AlertTriangle} accent="red"    total={stats.total}  active={status_filter === 'failed'}    onClick={() => change_status(status_filter === 'failed'    ? 'all' : 'failed')} />
            </div>

            {/* ── PER-PLATFORM BREAKDOWN ─────────────────────────────── */}
            <div className="grid grid-cols-3 gap-3">
                {(Object.keys(PLATFORM_META) as SocialPlatform[]).map(p => {
                    const meta = PLATFORM_META[p];
                    const is_active = platform_filter === p;
                    const p_total = platform_stats?.total ?? stats.total;
                    const count   = platform_stats?.by_platform[p] ?? stats.by_platform[p];
                    const pct     = p_total > 0 ? Math.round((count / p_total) * 100) : 0;
                    const tint    = p === 'youtube' ? 'from-red-500/[0.08] via-red-500/[0.04]' : p === 'facebook' ? 'from-blue-500/[0.08] via-blue-500/[0.04]' : 'from-purple-500/[0.08] via-purple-500/[0.04]';
                    const bar     = p === 'youtube' ? 'from-red-500 to-rose-400' : p === 'facebook' ? 'from-blue-500 to-cyan-400' : 'from-purple-500 to-pink-400';
                    return (
                        <button key={p} type="button"
                            onClick={() => change_platform(is_active ? 'all' : p)}
                            className={`group relative glass-card p-4 flex items-center gap-4 text-left overflow-hidden bg-gradient-to-br ${tint} to-transparent transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg ${is_active ? 'ring-1 ring-brand-emerald/40 shadow-md shadow-brand-emerald/10' : 'hover:ring-1 hover:ring-border-subtle'}`}
                            title={`Filter to ${meta.label}`}>
                            <div className={`w-11 h-11 rounded-xl bg-bg-surface/80 backdrop-blur-sm flex items-center justify-center shrink-0 transition-transform duration-200 group-hover:scale-110 ${meta.tone}`}>
                                <meta.Icon size={22} />
                            </div>
                            <div className="min-w-0 flex-1">
                                <div className="flex items-baseline justify-between gap-2">
                                    <p className="text-[10px] uppercase font-bold text-text-muted tracking-widest">{meta.label}</p>
                                    <p className="text-[10px] text-text-muted tabular-nums">{pct}%</p>
                                </div>
                                <p className="text-2xl font-bold text-text-main tabular-nums leading-tight mt-0.5">{count}</p>
                                <div className="mt-2 h-1 rounded-full bg-bg-surface/60 overflow-hidden">
                                    <div className={`h-full rounded-full bg-gradient-to-r ${bar} transition-[width] duration-500 ease-out`} style={{ width: `${pct}%` }} />
                                </div>
                            </div>
                        </button>
                    );
                })}
            </div>

            {/* ── FILTER BAR ─────────────────────────────────────────── */}
            <div className="glass-card px-3 py-2 flex items-center gap-0 overflow-x-auto scrollbar-none justify-between">
                <FilterGroup label="Platform" Icon={Globe}>
                    {(['all', 'youtube', 'facebook', 'instagram'] as const).map(k => (
                        <FilterChip key={k} active={platform_filter === k} onClick={() => change_platform(k)}
                            Icon={k === 'all' ? undefined : PLATFORM_META[k].Icon}
                            iconTone={k === 'all' ? undefined : PLATFORM_META[k].tone}>
                            {k === 'all' ? 'All' : PLATFORM_META[k].label}
                        </FilterChip>
                    ))}
                </FilterGroup>
                <span className="h-5 w-px bg-border-subtle mx-3 shrink-0" />
                <FilterGroup label="Status" Icon={Activity}>
                    {(['all', 'uploaded', 'scheduled', 'uploading', 'failed', 'cancelled'] as const).map(k => (
                        <FilterChip key={k} active={status_filter === k} onClick={() => change_status(k)} dotColor={STATUS_DOT[k]}>
                            {k === 'uploaded' ? 'Published' : k}
                        </FilterChip>
                    ))}
                </FilterGroup>
            </div>

            {/* ── CARD GRID ──────────────────────────────────────────── */}
            {loading && uploads.length === 0 ? (
                /* Skeleton loading state */
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {Array.from({ length: 6 }).map((_, i) => <UploadSkeleton key={i} />)}
                </div>
            ) : uploads.length === 0 ? (
                /* Empty state */
                <div className="relative overflow-hidden rounded-3xl border border-dashed border-border-subtle bg-white/5 backdrop-blur-sm p-16 text-center space-y-4">
                    <div className="absolute inset-0 bg-gradient-to-br from-brand-emerald/5 via-brand-blue/5 to-purple-500/5 pointer-events-none rounded-3xl" />
                    <div className="relative mx-auto w-16 h-16 rounded-2xl bg-bg-surface/60 border border-border-subtle flex items-center justify-center">
                        <UploadCloud size={28} className="text-text-muted opacity-60" />
                    </div>
                    <div className="relative">
                        <h3 className="text-lg font-bold text-text-main">No uploads found</h3>
                        <p className="text-sm text-text-muted mt-1">
                            Published and scheduled media will appear here.
                            {(platform_filter !== 'all' || status_filter !== 'all' || committed_search) && ' Try clearing your filters.'}
                        </p>
                    </div>
                    {(platform_filter !== 'all' || status_filter !== 'all' || committed_search) && (
                        <button
                            onClick={() => { change_platform('all'); change_status('all'); set_search(''); set_committed_search(''); }}
                            className="relative inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-border-subtle text-text-muted hover:text-text-main hover:border-brand-emerald/40 text-sm font-bold transition-all">
                            <X size={13} /> Clear filters
                        </button>
                    )}
                </div>
            ) : (
                <>
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                        {uploads.map((u, idx) => (
                            <UploadCard
                                key={u.id}
                                u={u}
                                ott={u.ott_id ? ott_map.get(u.ott_id) ?? null : null}
                                expanded={expanded_id === u.id}
                                on_toggle={() => toggle(u.id)}
                                stagger_ms={Math.min(idx * 40, 320)}
                            />
                        ))}
                    </div>

                    {/* ── PAGINATION ─────────────────────────────────── */}
                    <div className="glass-card flex flex-col sm:flex-row items-center justify-between gap-4 px-5 py-3">
                        <p className="text-[11px] text-text-muted shrink-0">
                            Showing <span className="font-bold text-text-main px-1">{range_from}–{range_to}</span> of{' '}
                            <span className="font-bold text-brand-emerald ps-1">{total}</span>
                        </p>
                        <div className="flex items-center gap-1">
                            <button onClick={() => { set_page(p => Math.max(1, p - 1)); set_expanded_id(null); }}
                                disabled={page <= 1 || loading}
                                className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-bg-surface/60 border border-border-subtle text-text-muted hover:text-brand-emerald hover:border-brand-emerald/40 hover:bg-brand-emerald/5 text-[11px] font-bold transition-all disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:text-text-muted disabled:hover:border-border-subtle disabled:hover:bg-transparent">
                                <ChevronLeft size={12} /> Prev
                            </button>
                            {(() => {
                                const chips: (number | '...')[] = [];
                                if (total_pages <= 7) { for (let i = 1; i <= total_pages; i++) chips.push(i); }
                                else {
                                    chips.push(1);
                                    if (page > 3) chips.push('...');
                                    for (let i = Math.max(2, page - 1); i <= Math.min(total_pages - 1, page + 1); i++) chips.push(i);
                                    if (page < total_pages - 2) chips.push('...');
                                    chips.push(total_pages);
                                }
                                return chips.map((c, i) => c === '...'
                                    ? <span key={`e-${i}`} className="px-1 text-[11px] text-text-muted select-none">…</span>
                                    : <button key={c} onClick={() => { set_page(c as number); set_expanded_id(null); }} disabled={loading}
                                        className={`min-w-[28px] h-7 px-2 rounded-lg text-[11px] font-bold transition-all disabled:cursor-not-allowed ${c === page ? 'bg-brand-emerald text-bg-main shadow-md shadow-brand-emerald/30 scale-105' : 'bg-bg-surface/60 border border-border-subtle text-text-muted hover:text-brand-emerald hover:border-brand-emerald/40 hover:bg-brand-emerald/5'}`}>
                                        {c}
                                    </button>
                                );
                            })()}
                            <button onClick={() => { set_page(p => Math.min(total_pages, p + 1)); set_expanded_id(null); }}
                                disabled={page >= total_pages || loading}
                                className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-bg-surface/60 border border-border-subtle text-text-muted hover:text-brand-emerald hover:border-brand-emerald/40 hover:bg-brand-emerald/5 text-[11px] font-bold transition-all disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:text-text-muted disabled:hover:border-border-subtle disabled:hover:bg-transparent">
                                Next <ChevronRight size={12} />
                            </button>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
};

// ── UploadCard ─────────────────────────────────────────────────────────

const UploadCard: React.FC<{
    u: SocialUploadRow;
    ott: OttPlatformSummary | null;
    expanded: boolean;
    on_toggle: () => void;
    stagger_ms: number;
}> = ({ u, ott, expanded, on_toggle, stagger_ms }) => {
    const p_meta   = PLATFORM_META[u.platform];
    const s_cfg    = STATUS_CONFIG[u.status] ?? STATUS_CONFIG.draft;
    const lib      = u.library_item;
    const sched    = u.schedule_item;
    const is_copy  = is_copyright_takedown(u);
    const title    = lib?.file_name || lib?.title || u.title || '(untitled)';
    const folder   = lib?.parent_title ?? null;
    const sched_label = sched?.title || (sched?.scheduled_at ? new Date(sched.scheduled_at).toLocaleString() : null);
    const sched_batch = sched?.batch_name ?? null;

    return (
        <div
            className={`group relative rounded-2xl border bg-white/[0.04] backdrop-blur-xl overflow-hidden transition-all duration-300 animate-in fade-in slide-in-from-bottom-2 fill-mode-both ${expanded
                ? 'border-brand-emerald/40 shadow-lg shadow-brand-emerald/10'
                : 'border-white/10 hover:border-white/20 hover:shadow-lg hover:-translate-y-0.5'
            }`}
            style={{ animationDelay: `${stagger_ms}ms`, animationDuration: '400ms' }}
        >
            {/* Subtle gradient overlay */}
            <div className={`absolute inset-0 pointer-events-none transition-opacity duration-300 ${expanded ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} bg-gradient-to-br from-brand-emerald/5 via-transparent to-brand-blue/5`} />

            {/* ── TOP ROW: icon + title + status ─────────────────────── */}
            <div className="relative flex items-start gap-3 p-4 pb-3">
                {/* Media type icon */}
                <div className={`shrink-0 w-10 h-10 rounded-xl flex items-center justify-center ${p_meta.bg} ${p_meta.tone}`}>
                    {file_icon(lib?.file_name)}
                </div>

                {/* Title block */}
                <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-text-main truncate leading-snug" title={title}>
                        {title}
                    </p>
                    {lib?.file_name && lib.file_name !== title && (
                        <p className="text-[10px] text-text-muted truncate mt-0.5" title={lib.file_name}>{lib.file_name}</p>
                    )}
                </div>

                {/* Status badge */}
                <span className={`shrink-0 text-[9px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ring-1 ${s_cfg.cls} ${u.status === 'uploading' ? 'animate-pulse' : ''}`}>
                    {s_cfg.label}
                </span>
            </div>

            {/* ── MIDDLE: platform + OTT + folder ────────────────────── */}
            <div className="relative px-4 pb-3 space-y-2">
                {/* Platform chip */}
                <div className="flex items-center gap-2">
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold ${p_meta.bg} ${p_meta.tone}`}>
                        <p_meta.Icon size={11} />
                        {p_meta.label}
                    </span>
                    {u.media_url && (
                        <a href={u.media_url} target="_blank" rel="noreferrer"
                            className="inline-flex items-center gap-1 text-[10px] text-brand-blue hover:underline ml-auto"
                            onClick={e => e.stopPropagation()}>
                            View <ExternalLink size={9} />
                        </a>
                    )}
                </div>

                {/* OTT info */}
                <div className="flex items-start gap-1.5 text-[11px]">
                    <Layers size={11} className="text-text-muted shrink-0 mt-0.5" />
                    <span className="text-text-muted">OTT:</span>
                    {ott ? (
                        <span className="text-text-main font-medium truncate">{ott.name}</span>
                    ) : u.ott_id ? (
                        <span className="text-text-muted font-mono text-[9px] truncate">{u.ott_id.slice(0, 8)}…</span>
                    ) : (
                        <span className="text-text-muted italic">No OTT linked</span>
                    )}
                </div>

                {/* Folder/story */}
                {folder && (
                    <div className="flex items-center gap-1.5 text-[11px]">
                        <Folder size={11} className="text-text-muted shrink-0" />
                        <span className="text-text-muted">Story:</span>
                        <span className="text-text-main font-medium truncate">{folder}</span>
                    </div>
                )}

                {/* Schedule info */}
                {(sched_label || sched_batch) && (
                    <div className="flex items-center gap-1.5 text-[11px]">
                        <Calendar size={11} className="text-text-muted shrink-0" />
                        <span className="text-text-muted">Schedule:</span>
                        <span className="text-text-main font-medium truncate" title={sched_batch ?? sched_label ?? ''}>
                            {sched_label || sched_batch}
                        </span>
                    </div>
                )}
            </div>

            {/* ── DIVIDER + DATES ─────────────────────────────────────── */}
            <div className="border-t border-white/[0.07] mx-4" />
            <div className="relative px-4 py-3 grid grid-cols-2 gap-x-3 gap-y-1 text-[10px]">
                {u.scheduledAt && (
                    <>
                        <span className="text-text-muted">Scheduled</span>
                        <span className="text-text-main tabular-nums">{new Date(u.scheduledAt).toLocaleString()}</span>
                    </>
                )}
                {u.publishedAt && (
                    <>
                        <span className="text-text-muted">Published</span>
                        <span className="text-brand-emerald tabular-nums font-medium">{new Date(u.publishedAt).toLocaleString()}</span>
                    </>
                )}
                {u.createdAt && (
                    <>
                        <span className="text-text-muted">Created</span>
                        <span className="text-text-main tabular-nums">{new Date(u.createdAt).toLocaleString()}</span>
                    </>
                )}
            </div>

            {/* ── ERROR MESSAGE ───────────────────────────────────────── */}
            {u.error_message && (
                <div className="relative mx-4 mb-3 rounded-xl bg-red-500/10 border border-red-500/20 px-3 py-2 flex items-start gap-2">
                    {is_copy ? (
                        <ShieldAlert size={12} className="text-red-400 shrink-0 mt-0.5" />
                    ) : (
                        <AlertTriangle size={12} className="text-red-400 shrink-0 mt-0.5" />
                    )}
                    <p className="text-[10px] text-red-400 line-clamp-2" title={u.error_message}>
                        {is_copy ? 'Copyright takedown' : u.error_message}
                    </p>
                </div>
            )}

            {/* ── EXPAND TOGGLE ───────────────────────────────────────── */}
            <button
                onClick={on_toggle}
                className={`relative w-full flex items-center justify-center gap-1.5 py-2.5 border-t text-[10px] font-bold uppercase tracking-widest transition-all duration-200 ${expanded
                    ? 'border-brand-emerald/30 text-brand-emerald bg-brand-emerald/5'
                    : 'border-white/[0.07] text-text-muted hover:text-brand-emerald hover:bg-brand-emerald/5'
                }`}
            >
                {expanded ? <><ChevronUp size={11} /> Hide details</> : <><ChevronDown size={11} /> Show details</>}
            </button>

            {/* ── DETAIL PANEL (expandable) ───────────────────────────── */}
            <div className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out ${expanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
                <div className="min-h-0 overflow-hidden">
                    <div className={`p-4 pt-3 border-t border-white/[0.07] transition-transform duration-300 ease-out ${expanded ? 'translate-y-0' : '-translate-y-2'}`}>
                        <DetailPanel u={u} />
                    </div>
                </div>
            </div>
        </div>
    );
};

// ── UploadSkeleton ─────────────────────────────────────────────────────

const UploadSkeleton: React.FC = () => (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur-xl overflow-hidden animate-pulse">
        <div className="p-4 pb-3 flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-bg-surface/60" />
            <div className="flex-1 space-y-2">
                <div className="h-3.5 bg-bg-surface/60 rounded-full w-3/4" />
                <div className="h-2.5 bg-bg-surface/40 rounded-full w-1/2" />
            </div>
            <div className="h-4 w-16 bg-bg-surface/60 rounded-full" />
        </div>
        <div className="px-4 pb-3 space-y-2">
            <div className="h-6 bg-bg-surface/40 rounded-lg w-24" />
            <div className="h-2.5 bg-bg-surface/30 rounded-full w-2/3" />
            <div className="h-2.5 bg-bg-surface/30 rounded-full w-1/2" />
        </div>
        <div className="border-t border-white/[0.07] mx-4" />
        <div className="px-4 py-3 grid grid-cols-2 gap-2">
            <div className="h-2 bg-bg-surface/30 rounded-full" />
            <div className="h-2 bg-bg-surface/30 rounded-full" />
            <div className="h-2 bg-bg-surface/30 rounded-full" />
            <div className="h-2 bg-bg-surface/30 rounded-full" />
        </div>
        <div className="border-t border-white/[0.07] h-9" />
    </div>
);

// ── Sub-components (preserved from original) ───────────────────────────

type StatAccent = 'emerald' | 'amber' | 'blue' | 'red';

const Stat: React.FC<{
    label: string; value: number; accent?: StatAccent;
    Icon?: React.ComponentType<{ size?: number; className?: string }>;
    total?: number; spinning?: boolean; onClick?: () => void; active?: boolean;
}> = ({ label, value, accent, Icon, total, spinning, onClick, active }) => {
    const tone  = accent === 'emerald' ? 'text-brand-emerald' : accent === 'amber' ? 'text-amber-400' : accent === 'blue' ? 'text-brand-blue' : accent === 'red' ? 'text-red-400' : 'text-text-main';
    const glow  = accent === 'emerald' ? 'hover:shadow-brand-emerald/20' : accent === 'amber' ? 'hover:shadow-amber-400/20' : accent === 'blue' ? 'hover:shadow-brand-blue/20' : accent === 'red' ? 'hover:shadow-red-500/20' : 'hover:shadow-white/10';
    const tint  = accent === 'emerald' ? 'bg-brand-emerald/10' : accent === 'amber' ? 'bg-amber-400/10' : accent === 'blue' ? 'bg-brand-blue/10' : accent === 'red' ? 'bg-red-500/10' : 'bg-bg-surface/60';
    const pct   = total && total > 0 ? Math.round((value / total) * 100) : null;
    const a_ring = accent === 'emerald' ? 'ring-1 ring-brand-emerald/50 shadow-lg shadow-brand-emerald/25' : accent === 'amber' ? 'ring-1 ring-amber-400/50 shadow-lg shadow-amber-400/25' : accent === 'blue' ? 'ring-1 ring-brand-blue/50 shadow-lg shadow-brand-blue/25' : accent === 'red' ? 'ring-1 ring-red-500/50 shadow-lg shadow-red-500/25' : 'ring-1 ring-text-main/30 shadow-lg shadow-white/10';
    const base  = `relative glass-card p-4 overflow-hidden transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg ${glow} ${active ? a_ring : ''}`;
    const content = (
        <>
            <div className="flex items-start justify-between gap-2">
                <p className="text-[10px] uppercase font-bold text-text-muted tracking-widest">{label}</p>
                {Icon && <span className={`w-6 h-6 rounded-lg flex items-center justify-center ${tint} ${tone}`}><Icon size={12} className={spinning ? 'animate-spin' : ''} /></span>}
            </div>
            <div className="flex items-baseline gap-2 mt-1">
                <p className={`text-2xl font-bold tabular-nums ${tone}`}>{value}</p>
                {pct !== null && <p className="text-[10px] text-text-muted tabular-nums">{pct}%</p>}
            </div>
        </>
    );
    if (onClick) return <button type="button" onClick={onClick} className={`${base} text-left w-full`} aria-pressed={active}>{content}</button>;
    return <div className={base}>{content}</div>;
};

const FilterGroup: React.FC<{ label: string; Icon?: React.ComponentType<{ size?: number; className?: string }>; children: React.ReactNode }> = ({ label, Icon, children }) => (
    <div className="flex items-center gap-2">
        <span className="text-[10px] uppercase font-bold text-text-muted tracking-widest inline-flex items-center gap-1.5">
            {Icon && <Icon size={11} />}{label}
        </span>
        <div className="flex flex-wrap gap-1">{children}</div>
    </div>
);

const FilterChip: React.FC<{
    active: boolean; onClick: () => void; children: React.ReactNode;
    Icon?: React.ComponentType<{ size?: number; className?: string }>;
    iconTone?: string; dotColor?: string;
}> = ({ active, onClick, children, Icon, iconTone, dotColor }) => (
    <button onClick={onClick}
        className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all duration-200 inline-flex items-center gap-1.5 ${active ? 'bg-brand-emerald/15 text-brand-emerald scale-105 ring-1 ring-brand-emerald/30' : 'text-text-muted hover:text-text-main hover:bg-bg-surface/60'}`}>
        {Icon ? <Icon size={11} className={iconTone ?? ''} /> : dotColor ? <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`} /> : null}
        {children}
    </button>
);

// ── DetailPanel (preserved) ────────────────────────────────────────────

const detail_source = (u: SocialUploadRow): 'manual' | 'generated' | 'mixed' | null => {
    const m = (u.metadata as any)?.details_source as string | undefined;
    if (m === 'manual' || m === 'generated' || m === 'mixed') return m;
    if (u.auto_details && u.analysis_result_id) return 'generated';
    return null;
};

const DetailPanel: React.FC<{ u: SocialUploadRow }> = ({ u }) => {
    const has_result    = u.upload_result && Object.keys(u.upload_result).length > 0;
    const source        = detail_source(u);
    const platform_block = u.platform_details?.[u.platform];
    return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
            <div className="space-y-3">
                {(source || platform_block) && (
                    <div className={`relative rounded-xl border overflow-hidden p-4 space-y-3 transition-colors ${source === 'generated' ? 'border-brand-emerald/25 bg-gradient-to-br from-brand-emerald/[0.06] via-brand-emerald/[0.02] to-transparent' : source === 'mixed' ? 'border-amber-400/25 bg-gradient-to-br from-amber-400/[0.06] via-amber-400/[0.02] to-transparent' : 'border-border-subtle bg-bg-surface/40'}`}>
                        {source && source !== 'manual' && (
                            <span className={`pointer-events-none absolute -top-8 -right-8 w-24 h-24 rounded-full blur-2xl ${source === 'generated' ? 'bg-brand-emerald/20' : 'bg-amber-400/20'}`} />
                        )}
                        <div className="relative flex items-center justify-between">
                            <p className="text-[10px] uppercase font-bold tracking-widest inline-flex items-center gap-1.5">
                                <span className={`w-5 h-5 rounded-md flex items-center justify-center ${source === 'generated' ? 'bg-brand-emerald/15 text-brand-emerald' : source === 'mixed' ? 'bg-amber-400/15 text-amber-400' : 'bg-text-muted/15 text-text-muted'}`}>
                                    <Sparkles size={11} className={source === 'generated' ? 'animate-pulse' : ''} />
                                </span>
                                <span className="text-text-main">Generated details</span>
                            </p>
                            {source && (
                                <span className={`text-[9px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ring-1 ${source === 'generated' ? 'bg-brand-emerald/15 text-brand-emerald ring-brand-emerald/30' : source === 'mixed' ? 'bg-amber-400/15 text-amber-400 ring-amber-400/30' : 'bg-text-muted/15 text-text-muted ring-text-muted/30'}`}>{source}</span>
                            )}
                        </div>
                        {platform_block?.title && (
                            <div className="relative rounded-lg bg-bg-main/40 backdrop-blur-sm border border-border-subtle/60 px-3 py-2">
                                <p className="text-[9px] uppercase font-bold text-text-muted tracking-widest">Title</p>
                                <p className="text-sm text-text-main break-words mt-0.5">{platform_block.title}</p>
                            </div>
                        )}
                        {platform_block?.caption && platform_block.caption !== platform_block.description && (
                            <div className="relative rounded-lg bg-bg-main/40 backdrop-blur-sm border border-border-subtle/60 px-3 py-2">
                                <p className="text-[9px] uppercase font-bold text-text-muted tracking-widest">Caption</p>
                                <p className="text-sm text-text-main whitespace-pre-wrap break-words mt-0.5">{platform_block.caption}</p>
                            </div>
                        )}
                    </div>
                )}
                {u.description && (
                    <div className="rounded-xl border border-border-subtle bg-bg-surface/40 p-3">
                        <p className="text-[10px] uppercase font-bold text-text-muted tracking-widest mb-1">Description</p>
                        <p className="text-xs text-text-main whitespace-pre-wrap break-words">{u.description}</p>
                    </div>
                )}
                {(u.tags?.length > 0 || u.hashtags?.length > 0) && (
                    <div className="rounded-xl border border-border-subtle bg-bg-surface/40 p-3 space-y-2">
                        {u.tags?.length > 0 && (
                            <div>
                                <p className="text-[10px] uppercase font-bold text-text-muted tracking-widest mb-1.5 flex items-center gap-1"><Tag size={10} /> Tags</p>
                                <div className="flex flex-wrap gap-1">
                                    {u.tags.map((t, i) => <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-brand-blue/10 text-brand-blue">{t}</span>)}
                                </div>
                            </div>
                        )}
                        {u.hashtags?.length > 0 && (
                            <div>
                                <p className="text-[10px] uppercase font-bold text-text-muted tracking-widest mb-1.5 flex items-center gap-1"><Hash size={10} /> Hashtags</p>
                                <div className="flex flex-wrap gap-1">
                                    {u.hashtags.map((h, i) => <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-brand-emerald/10 text-brand-emerald">#{h.replace(/^#/, '')}</span>)}
                                </div>
                            </div>
                        )}
                    </div>
                )}
                {has_result && <JsonViewer label="Platform response" value={u.upload_result} />}
            </div>
            <MetaSidebar u={u} />
        </div>
    );
};

const MetaSidebar: React.FC<{ u: SocialUploadRow }> = ({ u }) => {
    const lib_label   = u.library_item?.file_name || u.library_item?.title || null;
    const lib_folder  = u.library_item?.parent_title || null;
    const sched_label = u.schedule_item?.title || (u.schedule_item?.scheduled_at ? new Date(u.schedule_item.scheduled_at).toLocaleString() : null);
    const sched_batch = u.schedule_item?.batch_name || null;
    const acct_label  = u.social_account?.channel_name || u.social_account?.account_name || null;
    const platform_meta = u.social_account?.platform ? PLATFORM_META[u.social_account.platform as SocialPlatform] : null;
    const vis_tone    = u.visibility === 'public' ? 'bg-brand-emerald/15 text-brand-emerald ring-brand-emerald/30' : u.visibility === 'unlisted' ? 'bg-amber-400/15 text-amber-400 ring-amber-400/30' : 'bg-text-muted/15 text-text-muted ring-text-muted/30';
    return (
        <div className="relative overflow-hidden rounded-2xl border border-border-subtle bg-gradient-to-br from-bg-surface/80 via-bg-surface/40 to-bg-surface/10">
            <span className="pointer-events-none absolute -top-12 -right-12 w-40 h-40 rounded-full bg-brand-emerald/10 blur-3xl" />
            <span className="pointer-events-none absolute -bottom-16 -left-12 w-44 h-44 rounded-full bg-brand-blue/10 blur-3xl" />
            <div className="relative flex items-center justify-between gap-2 px-4 pt-4 pb-3 border-b border-border-subtle/50">
                <p className="text-[10px] uppercase font-bold text-text-main tracking-widest inline-flex items-center gap-1.5">
                    <span className="w-5 h-5 rounded-md bg-brand-emerald/15 text-brand-emerald flex items-center justify-center"><Sparkles size={11} /></span>
                    Metadata
                </p>
                {u.visibility && (
                    <span className={`text-[9px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ring-1 inline-flex items-center gap-1 ${vis_tone}`}>
                        <Globe size={9} /> {u.visibility}
                    </span>
                )}
            </div>
            <div className="relative p-3 space-y-3">
                <MetaSection title="References" icon={Hash} tone="text-brand-blue">
                    <MetaNamedRow icon={Film} label="Library item" primary={lib_label} secondary={lib_folder} fallback_id={u.library_item_id} tone="text-brand-blue" tint="bg-brand-blue/10" />
                    <MetaNamedRow icon={Clock} label="Schedule slot" primary={sched_label} secondary={sched_batch} fallback_id={u.schedule_item_id} tone="text-amber-400" tint="bg-amber-400/10" />
                </MetaSection>
                <MetaSection title="Account" icon={UserCircle2} tone="text-purple-400">
                    <MetaNamedRow Icon={platform_meta?.Icon} label="Connected as" primary={acct_label} secondary={u.social_account?.platform ? PLATFORM_META[u.social_account.platform as SocialPlatform]?.label ?? null : null} fallback_id={u.social_account_id} tone={platform_meta?.tone} tint="bg-purple-500/10" />
                </MetaSection>
                <MetaSection title="Platform IDs" icon={Film} tone="text-brand-emerald">
                    <MetaRow label="Media id" value={u.platform_media_id} mono copy />
                    <MetaRow label="Post id"   value={u.platform_post_id}  mono copy />
                </MetaSection>
            </div>
        </div>
    );
};

const MetaNamedRow: React.FC<{
    label: string; primary: string | null; secondary?: string | null; fallback_id?: string | null;
    icon?: React.ComponentType<{ size?: number; className?: string }>;
    Icon?: React.ComponentType<{ size?: number; className?: string }>;
    tone?: string; tint?: string;
}> = ({ label, primary, secondary, fallback_id, icon, Icon: IconUpper, tone, tint }) => {
    const Comp  = IconUpper ?? icon;
    const missing = !primary && !!fallback_id;
    return (
        <div className={`group relative rounded-xl px-3 py-2.5 flex items-start gap-3 transition-all duration-200 border border-transparent hover:border-border-subtle/60 hover:bg-bg-main/40 ${missing ? 'opacity-80' : ''}`}>
            {Comp && (
                <span className={`mt-0.5 w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ring-1 ring-inset ring-border-subtle/40 transition-transform duration-200 group-hover:scale-105 ${tint ?? 'bg-bg-main/60'} ${tone ?? 'text-text-muted'}`}><Comp size={14} /></span>
            )}
            <div className="min-w-0 flex-1">
                <p className="text-[9px] uppercase font-bold text-text-muted/80 tracking-widest">{label}</p>
                {primary ? (
                    <p className="text-xs text-text-main font-semibold truncate mt-0.5" title={primary}>{primary}</p>
                ) : fallback_id ? (
                    <p className="text-[10px] font-mono text-text-muted/70 truncate mt-0.5 italic" title={fallback_id}>Missing · {fallback_id.slice(0, 8)}…</p>
                ) : (
                    <p className="text-[11px] text-text-muted mt-0.5">—</p>
                )}
                {secondary && <p className="text-[10px] text-text-muted truncate mt-1" title={secondary}>{secondary}</p>}
            </div>
        </div>
    );
};

const MetaSection: React.FC<{ title: string; icon: React.ComponentType<{ size?: number; className?: string }>; tone?: string; children: React.ReactNode }> = ({ title, icon: Icon, tone, children }) => (
    <div>
        <div className="flex items-center gap-2 px-1 mb-1.5">
            <span className={`w-1 h-3 rounded-full ${tone ? tone.replace('text-', 'bg-') : 'bg-text-muted'}`} />
            <p className={`text-[9px] uppercase font-bold tracking-widest flex items-center gap-1 ${tone ?? 'text-text-muted'}`}><Icon size={10} /> {title}</p>
        </div>
        <div className="space-y-1">{children}</div>
    </div>
);

const MetaRow: React.FC<{ label: string; value: string | null | undefined; mono?: boolean; copy?: boolean; href?: string }> = ({ label, value, mono, copy, href }) => {
    const [copied, set_copied] = useState(false);
    const has_value = !!value;
    const do_copy   = async () => {
        if (!value) return;
        try { await navigator.clipboard.writeText(value); set_copied(true); setTimeout(() => set_copied(false), 1200); } catch { /* noop */ }
    };
    return (
        <div className="group flex items-start gap-2 px-2 py-1 rounded-lg hover:bg-bg-surface/60 transition-colors">
            <div className="min-w-0 flex-1">
                <p className="text-[9px] uppercase font-semibold text-text-muted tracking-wide">{label}</p>
                {has_value ? href ? (
                    <a href={href} target="_blank" rel="noreferrer" className={`text-[11px] ${mono ? 'font-mono' : ''} text-text-main break-all hover:text-brand-blue inline-flex items-center gap-1`} title={value!}>{value} <Link2 size={9} className="inline shrink-0" /></a>
                ) : (
                    <p className={`text-[11px] ${mono ? 'font-mono' : ''} text-text-main break-all`} title={value!}>{value}</p>
                ) : <p className="text-[11px] text-text-muted">—</p>}
            </div>
            {copy && has_value && (
                <button onClick={do_copy} className="opacity-0 group-hover:opacity-100 text-text-muted hover:text-text-main transition-opacity p-1 -mr-1" aria-label="Copy">
                    {copied ? <Check size={11} className="text-brand-emerald" /> : <Copy size={11} />}
                </button>
            )}
        </div>
    );
};

// ── JSON viewer (preserved) ────────────────────────────────────────────

const JsonViewer: React.FC<{ label: string; value: any }> = ({ label, value }) => {
    const [copied, set_copied] = useState(false);
    const json_text = useMemo(() => { try { return JSON.stringify(value, null, 2); } catch { return String(value); } }, [value]);
    const copy = async () => {
        try { await navigator.clipboard.writeText(json_text); set_copied(true); setTimeout(() => set_copied(false), 1500); } catch { toast.error('Copy failed'); }
    };
    return (
        <div className="space-y-1">
            <div className="flex items-center justify-between">
                <p className="text-[10px] uppercase font-bold text-text-muted tracking-widest">{label}</p>
                <button onClick={copy} className="flex items-center gap-1 text-[10px] text-text-muted hover:text-text-main">
                    {copied ? <><Check size={10} /> Copied</> : <><Copy size={10} /> Copy JSON</>}
                </button>
            </div>
            <div className="text-[11px] font-mono bg-black/30 p-3 rounded-xl border border-border-subtle overflow-auto max-h-72">
                <JsonNode value={value} name={null} depth={0} is_last />
            </div>
        </div>
    );
};

const JsonNode: React.FC<{ value: any; name: string | number | null; depth: number; is_last: boolean }> = ({ value, name, depth, is_last }) => {
    const [open, set_open] = useState(depth < 2);
    const key_node = name !== null ? <span className="text-sky-300">{typeof name === 'number' ? name : `"${name}"`}</span> : null;
    const colon    = key_node ? <span className="text-text-muted">: </span> : null;
    const trailing = is_last ? null : <span className="text-text-muted">,</span>;
    if (value === null)           return <Line indent={depth}>{key_node}{colon}<span className="text-rose-400">null</span>{trailing}</Line>;
    if (typeof value === 'boolean') return <Line indent={depth}>{key_node}{colon}<span className="text-rose-400">{String(value)}</span>{trailing}</Line>;
    if (typeof value === 'number')  return <Line indent={depth}>{key_node}{colon}<span className="text-amber-300">{value}</span>{trailing}</Line>;
    if (typeof value === 'string')  return <Line indent={depth}>{key_node}{colon}<span className="text-emerald-300 break-all">"{value}"</span>{trailing}</Line>;
    if (Array.isArray(value)) {
        if (value.length === 0) return <Line indent={depth}>{key_node}{colon}<span className="text-text-muted">[]</span>{trailing}</Line>;
        return (
            <div>
                <Line indent={depth}>
                    <button onClick={() => set_open(o => !o)} className="text-text-muted hover:text-text-main mr-1 inline-flex items-center">{open ? <ChevronDown size={10} /> : <ChevronRight size={10} />}</button>
                    {key_node}{colon}<span className="text-text-muted">[{open ? '' : ` ${value.length} items `}</span>
                    {!open && <span className="text-text-muted">]{trailing}</span>}
                </Line>
                {open && (<>{value.map((v, i) => <JsonNode key={i} value={v} name={i} depth={depth + 1} is_last={i === value.length - 1} />)}<Line indent={depth}><span className="text-text-muted">]</span>{trailing}</Line></>)}
            </div>
        );
    }
    if (typeof value === 'object') {
        const entries = Object.entries(value);
        if (entries.length === 0) return <Line indent={depth}>{key_node}{colon}<span className="text-text-muted">{'{}'}</span>{trailing}</Line>;
        return (
            <div>
                <Line indent={depth}>
                    <button onClick={() => set_open(o => !o)} className="text-text-muted hover:text-text-main mr-1 inline-flex items-center">{open ? <ChevronDown size={10} /> : <ChevronRight size={10} />}</button>
                    {key_node}{colon}<span className="text-text-muted">{'{'}{open ? '' : ` ${entries.length} keys `}</span>
                    {!open && <span className="text-text-muted">{'}'}{trailing}</span>}
                </Line>
                {open && (<>{entries.map(([k, v], i) => <JsonNode key={k} value={v} name={k} depth={depth + 1} is_last={i === entries.length - 1} />)}<Line indent={depth}><span className="text-text-muted">{'}'}</span>{trailing}</Line></>)}
            </div>
        );
    }
    return <Line indent={depth}>{key_node}{colon}<span className="text-text-muted">{String(value)}</span>{trailing}</Line>;
};

const Line: React.FC<{ indent: number; children: React.ReactNode }> = ({ indent, children }) => (
    <div style={{ paddingLeft: `${indent * 14}px` }} className="leading-5 whitespace-pre-wrap">{children}</div>
);

export default SocialUploadsPage;
