import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    CalendarDays,
    Loader2,
    Eye,
    XCircle,
    Trash2,
    RefreshCw,
    Pencil,
    Hash,
    Clock,
    FileEdit,
    Ban,
    CheckCircle2,
    ChevronLeft,
    ChevronRight,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { calendar_service, ScheduleBatch, ScheduleItem } from '../../../services/calendar_service';
import { frequency_label, platforms_label } from './scheduleMeta';
import EditDraftModal from './EditDraftModal';
import { useConfirm } from '../../../components/ui/ConfirmDialog';

const LIMIT = 10;

const STATUS_BADGE: Record<string, string> = {
    draft:     'bg-amber-400/10 text-amber-400 ring-1 ring-amber-400/20',
    scheduled: 'bg-brand-blue/10 text-brand-blue ring-1 ring-brand-blue/20',
    completed: 'bg-brand-emerald/10 text-brand-emerald ring-1 ring-brand-emerald/20',
    cancelled: 'bg-red-500/10 text-red-400 ring-1 ring-red-400/20',
};

type OverallCounts = { total: number; scheduled: number; draft: number; cancelled: number; completed: number };

function get_page_chips(current: number, total: number): (number | '...')[] {
    if (total <= 6) return Array.from({ length: total }, (_, i) => i + 1);
    const set = new Set([1, 2, current - 1, current, current + 1, total - 1, total].filter(p => p >= 1 && p <= total));
    const sorted = [...set].sort((a, b) => a - b);
    const chips: (number | '...')[] = [];
    for (let i = 0; i < sorted.length; i++) {
        chips.push(sorted[i]);
        if (i < sorted.length - 1 && sorted[i + 1] - sorted[i] > 1) chips.push('...');
    }
    return chips;
}

const SchedulesListPage: React.FC = () => {
    const confirm = useConfirm();
    const navigate = useNavigate();

    const [loading, set_loading] = useState(false);
    const [batches, set_batches] = useState<ScheduleBatch[]>([]);
    const [total, set_total] = useState(0);
    const [page, set_page] = useState(1);
    const [overall, set_overall] = useState<OverallCounts>({ total: 0, scheduled: 0, draft: 0, cancelled: 0, completed: 0 });
    const [status_filter, set_status_filter] = useState('');
    const [busy_id, set_busy_id] = useState<string | null>(null);

    const [edit_open, set_edit_open] = useState(false);
    const [edit_batch, set_edit_batch] = useState<ScheduleBatch | null>(null);
    const [edit_items, set_edit_items] = useState<ScheduleItem[]>([]);
    const [edit_loading, set_edit_loading] = useState(false);

    /* Load all batches (no filter, large limit) → drives the stat tiles so they
       always reflect the full picture regardless of active filter.       */
    const load_overall = useCallback(async () => {
        try {
            const res = await calendar_service.list_upload_schedules({ limit: 200 });
            if (!res.success || !res.data) return;
            const all = res.data.batches as ScheduleBatch[];
            set_overall({
                total:     res.data.total,  // from API — accurate even beyond 200
                scheduled: all.filter(b => b.status === 'scheduled').length,
                draft:     all.filter(b => b.status === 'draft').length,
                cancelled: all.filter(b => b.status === 'cancelled').length,
                completed: all.filter(b => b.status === 'completed').length,
            });
        } catch { /* silent — tiles fall back to 0 */ }
    }, []);

    /* Load filtered + paginated list → drives the table. */
    const load = useCallback(async () => {
        set_loading(true);
        try {
            const res = await calendar_service.list_upload_schedules({
                status: status_filter || undefined,
                page,
                limit: LIMIT,
            });
            if (!res.success || !res.data) throw new Error(res.message);
            set_batches(res.data.batches);
            set_total(res.data.total);
        } catch (err: any) {
            toast.error(err?.message || 'Failed to load schedules');
        } finally {
            set_loading(false);
        }
    }, [status_filter, page]);

    useEffect(() => { void load_overall(); }, [load_overall]);
    useEffect(() => { void load(); }, [load]);

    const refresh = () => { void load_overall(); void load(); };

    const change_filter = (val: string) => {
        set_status_filter((prev: string) => {
            const next = prev === val ? '' : val;
            set_page(1);
            return next;
        });
    };

    const open_edit = useCallback(async (id: string) => {
        set_edit_loading(true);
        set_busy_id(id);
        try {
            const res = await calendar_service.get_upload_schedule(id);
            if (!res.success || !res.data) throw new Error(res.message);
            set_edit_batch(res.data.batch);
            set_edit_items(res.data.items);
            set_edit_open(true);
        } catch (err: any) {
            toast.error(err?.message || 'Failed to open draft');
        } finally {
            set_edit_loading(false);
            set_busy_id(null);
        }
    }, []);

    const handle_cancel = async (id: string) => {
        const ok = await confirm({
            title: 'Cancel this schedule?',
            message: 'Pending uploads will be marked cancelled.',
            confirm_label: 'Cancel schedule',
            cancel_label: 'Keep',
            tone: 'warning',
        });
        if (!ok) return;
        set_busy_id(id);
        try {
            const res = await calendar_service.cancel_upload_schedule(id);
            if (!res.success) throw new Error(res.message);
            toast.success('Schedule cancelled');
            set_batches((prev: ScheduleBatch[]) => prev.map(b => b.id === id ? { ...b, status: 'cancelled', scheduled_count: 0 } : b));
            void load_overall();
        } catch (err: any) {
            toast.error(err?.message || 'Cancel failed');
        } finally {
            set_busy_id(null);
        }
    };

    const handle_delete = async (id: string) => {
        const ok = await confirm({
            title: 'Delete this schedule?',
            message: 'Linked calendar events will be removed. This cannot be undone.',
            confirm_label: 'Delete',
            danger: true,
        });
        if (!ok) return;
        set_busy_id(id);
        try {
            const res = await calendar_service.delete_upload_schedule(id);
            if (!res.success) throw new Error(res.message);
            toast.success('Schedule deleted');
            set_batches((prev: ScheduleBatch[]) => prev.filter(b => b.id !== id));
            set_total((t: number) => Math.max(0, t - 1));
            void load_overall();
        } catch (err: any) {
            toast.error(err?.message || 'Delete failed');
        } finally {
            set_busy_id(null);
        }
    };

    const total_pages = Math.max(1, Math.ceil(total / LIMIT));
    const showing_from = total === 0 ? 0 : (page - 1) * LIMIT + 1;
    const showing_to   = Math.min(page * LIMIT, total);

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">

            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div>
                    <h2 className="text-2xl font-bold text-text-main flex items-center gap-3">
                        <span className="w-9 h-9 rounded-xl bg-brand-emerald/15 flex items-center justify-center text-brand-emerald shadow-lg shadow-brand-emerald/20">
                            <CalendarDays size={18} />
                        </span>
                        Upload Schedules
                    </h2>
                    <p className="text-text-muted text-sm mt-1">
                        Plans to publish library items on YouTube, Facebook &amp; Instagram —{' '}
                        <span className="text-text-main font-semibold">{overall.total}</span> batch{overall.total === 1 ? '' : 'es'} total.
                    </p>
                </div>
                <button
                    onClick={refresh}
                    disabled={loading}
                    className="flex items-center gap-2 px-3 py-2 rounded-xl border border-border-subtle text-text-muted hover:text-text-main hover:border-brand-emerald/30 text-xs font-bold disabled:opacity-60 transition-all shadow-sm"
                >
                    <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
                </button>
            </div>

            {/* Clickable stat tiles */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <StatTile
                    label="Total" value={overall.total} Icon={Hash}
                    active={status_filter === ''}
                    onClick={() => { set_status_filter(''); set_page(1); }}
                />
                <StatTile
                    label="Scheduled" value={overall.scheduled} Icon={Clock} accent="blue"
                    active={status_filter === 'scheduled'}
                    onClick={() => change_filter('scheduled')}
                />
                <StatTile
                    label="Drafts" value={overall.draft} Icon={FileEdit} accent="amber"
                    active={status_filter === 'draft'}
                    onClick={() => change_filter('draft')}
                />
                <StatTile
                    label="Completed" value={overall.completed} Icon={CheckCircle2} accent="emerald"
                    active={status_filter === 'completed'}
                    onClick={() => change_filter('completed')}
                />
                <StatTile
                    label="Cancelled" value={overall.cancelled} Icon={Ban} accent="red"
                    active={status_filter === 'cancelled'}
                    onClick={() => change_filter('cancelled')}
                />
            </div>

            {/* Table */}
            {loading ? (
                <div className="flex items-center justify-center py-24 text-text-muted">
                    <Loader2 size={28} className="animate-spin" />
                </div>
            ) : batches.length === 0 ? (
                <div className="p-16 text-center rounded-3xl border border-dashed border-border-subtle bg-bg-surface/20 shadow-lg shadow-black/10 space-y-3 mt-8">
                    <div className="w-14 h-14 rounded-2xl bg-brand-emerald/10 flex items-center justify-center mx-auto">
                        <CalendarDays size={28} className="text-brand-emerald opacity-60" />
                    </div>
                    <h3 className="text-lg font-bold text-text-main">
                        {status_filter ? `No ${status_filter} schedules` : 'No schedules yet'}
                    </h3>
                    <p className="text-sm text-text-muted max-w-sm mx-auto">
                        {status_filter
                            ? <button onClick={() => { set_status_filter(''); set_page(1); }} className="text-brand-emerald hover:underline">Clear filter</button>
                            : 'Open Library → select files → click "Schedule Upload" to create your first plan.'}
                    </p>
                </div>
            ) : (
                <div className="glass-card overflow-hidden shadow-xl shadow-black/25 ring-1 ring-white/[0.04] mt-8">
                    {/* Table header bar */}
                    <div className="px-5 py-3 border-b border-border-subtle bg-bg-surface/50 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <span className="text-[11px] font-semibold text-text-muted">
                                Showing{' '}
                                <span className="text-brand-emerald font-bold px-1">{showing_from}–{showing_to}</span>
                                {' '}of{' '}
                                <span className="text-text-main font-bold px-1">{total}</span>
                                {' '}batch{total === 1 ? '' : 'es'}
                            </span>
                            {status_filter && (
                                <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wide ${STATUS_BADGE[status_filter] ?? 'bg-text-muted/10 text-text-muted'}`}>
                                    {status_filter}
                                </span>
                            )}
                        </div>
                        {status_filter && (
                            <button
                                onClick={() => { set_status_filter(''); set_page(1); }}
                                className="text-[11px] text-text-muted hover:text-brand-emerald font-bold transition-colors"
                            >
                                Clear filter
                            </button>
                        )}
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead>
                                <tr className="text-text-muted text-[10px] uppercase tracking-widest border-b border-border-subtle bg-bg-surface/60">
                                    <th className="px-5 py-3.5 font-bold">Name</th>
                                    <th className="px-5 py-3.5 font-bold">OTT</th>
                                    <th className="px-5 py-3.5 font-bold">Platforms</th>
                                    <th className="px-5 py-3.5 font-bold">Frequency</th>
                                    <th className="px-5 py-3.5 font-bold">Items</th>
                                    <th className="px-5 py-3.5 font-bold">Range</th>
                                    <th className="px-5 py-3.5 font-bold">Status</th>
                                    <th className="px-5 py-3.5 font-bold text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border-subtle/60">
                                {batches.map((b: ScheduleBatch, idx: number) => {
                                    const stagger = Math.min(idx * 30, 240);
                                    return (
                                        <tr
                                            key={b.id}
                                            className="group hover:bg-brand-emerald/[0.03] transition-colors duration-150 animate-in fade-in slide-in-from-bottom-1 fill-mode-both"
                                            style={{ animationDelay: `${stagger}ms`, animationDuration: '350ms' }}
                                        >
                                            <td className="px-5 py-4">
                                                <button
                                                    onClick={() => navigate(`/dashboard/schedules/${b.id}`)}
                                                    className="text-sm font-semibold text-text-main hover:text-brand-emerald text-left transition-colors"
                                                >
                                                    {b.name || `Batch ${b.id.slice(0, 8)}`}
                                                </button>
                                                <p className="text-[11px] text-text-muted mt-0.5 truncate max-w-[240px]">
                                                    {b.description || (b.title_prefix ? `Prefix: ${b.title_prefix}` : '—')}
                                                </p>
                                            </td>
                                            <td className="px-5 py-4 text-xs text-text-muted whitespace-nowrap">{b.ott_name || '—'}</td>
                                            <td className="px-5 py-4 text-xs text-text-muted whitespace-nowrap">{platforms_label(b.platforms)}</td>
                                            <td className="px-5 py-4 text-xs text-text-muted whitespace-nowrap">{frequency_label(b.frequency)}</td>
                                            <td className="px-5 py-4 whitespace-nowrap">
                                                <span className="text-sm font-bold text-text-main">{b.items_count ?? '—'}</span>
                                                <span className="text-[11px] text-text-muted ml-1.5">({b.scheduled_count ?? 0} sched)</span>
                                            </td>
                                            <td className="px-5 py-4 text-xs text-text-muted whitespace-nowrap">
                                                {b.start_date || '—'}{b.end_date ? ` → ${b.end_date}` : ''}
                                            </td>
                                            <td className="px-5 py-4">
                                                <span className={`inline-flex items-center text-[10px] px-2.5 py-1 rounded-full font-bold uppercase tracking-wide ${STATUS_BADGE[b.status] ?? 'bg-text-muted/10 text-text-muted'}`}>
                                                    {b.status}
                                                </span>
                                            </td>
                                            <td className="px-5 py-4">
                                                <div className="flex items-center gap-1 justify-end">
                                                    {b.status === 'draft' && (
                                                        <ActionBtn onClick={() => open_edit(b.id)} disabled={busy_id === b.id} tone="blue" title="Edit draft">
                                                            {busy_id === b.id && edit_loading ? <Loader2 size={13} className="animate-spin" /> : <Pencil size={13} />}
                                                        </ActionBtn>
                                                    )}
                                                    <ActionBtn onClick={() => navigate(`/dashboard/schedules/${b.id}`)} tone="emerald" title="View detail">
                                                        <Eye size={13} />
                                                    </ActionBtn>
                                                    {b.status !== 'cancelled' && (
                                                        <ActionBtn onClick={() => handle_cancel(b.id)} disabled={busy_id === b.id} tone="amber" title="Cancel">
                                                            <XCircle size={13} />
                                                        </ActionBtn>
                                                    )}
                                                    <ActionBtn onClick={() => handle_delete(b.id)} disabled={busy_id === b.id} tone="red" title="Delete">
                                                        {busy_id === b.id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                                                    </ActionBtn>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>

                    {/* Pagination */}
                    <div className="px-5 py-3 border-t border-border-subtle bg-bg-surface/40 flex items-center justify-between gap-4">
                        <span className="text-[11px] font-semibold text-text-muted shrink-0">
                            Showing{' '}
                            <span className="text-brand-emerald font-bold px-1">{showing_from}–{showing_to}</span>
                            {' '}of{' '}
                            <span className="text-text-main font-bold ps-1">{total}</span>
                        </span>
                        <div className="flex items-center gap-1">
                            {/* Prev */}
                            <button
                                onClick={() => set_page((p: number) => Math.max(1, p - 1))}
                                disabled={page === 1}
                                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold text-text-muted hover:text-text-main hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                            >
                                <ChevronLeft size={12} /> Prev
                            </button>

                            {/* Page chips */}
                            {get_page_chips(page, total_pages).map((chip, i) =>
                                chip === '...'
                                    ? <span key={`e${i}`} className="w-7 text-center text-[11px] text-text-muted select-none">…</span>
                                    : <button
                                        key={chip}
                                        onClick={() => set_page(chip)}
                                        className={`w-7 h-7 rounded-lg text-[11px] font-bold transition-all ${
                                            chip === page
                                                ? 'bg-brand-emerald text-white shadow-md shadow-brand-emerald/30'
                                                : 'text-text-muted hover:text-text-main hover:bg-white/5'
                                        }`}
                                    >
                                        {chip}
                                    </button>
                            )}

                            {/* Next */}
                            <button
                                onClick={() => set_page((p: number) => Math.min(total_pages, p + 1))}
                                disabled={page === total_pages}
                                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold text-text-muted hover:text-text-main hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                            >
                                Next <ChevronRight size={12} />
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <EditDraftModal
                isOpen={edit_open}
                onClose={() => set_edit_open(false)}
                batch={edit_batch}
                items={edit_items}
                onSaved={() => { void load(); void load_overall(); }}
            />
        </div>
    );
};

// ── Sub-components ────────────────────────────────────────────────────────────

type Accent = 'blue' | 'amber' | 'red' | 'emerald';

const ACCENT_STYLES: Record<Accent, { text: string; bg: string; ring_active: string; shadow_active: string; shadow_hover: string; tint: string }> = {
    emerald: { text: 'text-brand-emerald', bg: 'bg-brand-emerald/10', ring_active: 'ring-brand-emerald/50',  shadow_active: 'shadow-brand-emerald/20', shadow_hover: 'hover:shadow-brand-emerald/15', tint: 'from-brand-emerald/[0.07]' },
    blue:    { text: 'text-brand-blue',    bg: 'bg-brand-blue/10',    ring_active: 'ring-brand-blue/50',     shadow_active: 'shadow-brand-blue/20',    shadow_hover: 'hover:shadow-brand-blue/15',    tint: 'from-brand-blue/[0.07]'    },
    amber:   { text: 'text-amber-400',     bg: 'bg-amber-400/10',     ring_active: 'ring-amber-400/50',      shadow_active: 'shadow-amber-400/20',     shadow_hover: 'hover:shadow-amber-400/15',     tint: 'from-amber-400/[0.07]'     },
    red:     { text: 'text-red-400',       bg: 'bg-red-500/10',       ring_active: 'ring-red-400/50',        shadow_active: 'shadow-red-500/20',       shadow_hover: 'hover:shadow-red-500/15',       tint: 'from-red-500/[0.07]'       },
};

const StatTile: React.FC<{
    label: string;
    value: number;
    Icon: React.ComponentType<{ size?: number; className?: string }>;
    accent?: Accent;
    active: boolean;
    onClick: () => void;
}> = ({ label, value, Icon, accent, active, onClick }) => {
    const a = accent ? ACCENT_STYLES[accent] : null;
    return (
        <button
            type="button"
            onClick={onClick}
            aria-pressed={active}
            className={[
                'relative glass-card p-4 overflow-hidden text-left w-full transition-all duration-200',
                'hover:-translate-y-0.5 hover:shadow-2xl',
                a ? a.shadow_hover : 'hover:shadow-black/30',
                active
                    ? `shadow-xl ${a ? a.shadow_active : 'shadow-white/10'}`
                    : 'hover:ring-1 hover:ring-border-subtle shadow-lg shadow-black/20',
            ].join(' ')}
        >
            {a && <span className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${a.tint} to-transparent`} />}
            <div className="relative flex items-start justify-between gap-2">
                <p className="text-[10px] uppercase font-bold text-text-muted tracking-widest">{label}</p>
                <span className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 ${a ? `${a.bg} ${a.text}` : 'bg-bg-surface text-text-muted'}`}>
                    <Icon size={12} />
                </span>
            </div>
            <p className={`text-2xl font-bold tabular-nums mt-1.5 ${a ? a.text : 'text-text-main'}`}>{value}</p>
        </button>
    );
};

const ACTION_TONE: Record<string, string> = {
    emerald: 'hover:text-brand-emerald hover:bg-brand-emerald/10',
    blue:    'hover:text-brand-blue hover:bg-brand-blue/10',
    amber:   'hover:text-amber-400 hover:bg-amber-400/10',
    red:     'hover:text-red-400 hover:bg-red-500/10',
};

const ActionBtn: React.FC<{
    onClick: () => void;
    disabled?: boolean;
    tone: string;
    title: string;
    children: React.ReactNode;
}> = ({ onClick, disabled, tone, title, children }) => (
    <button
        onClick={onClick}
        disabled={disabled}
        title={title}
        className={`p-1.5 rounded-lg text-text-muted transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed ${ACTION_TONE[tone] ?? ''}`}
    >
        {children}
    </button>
);

export default SchedulesListPage;
