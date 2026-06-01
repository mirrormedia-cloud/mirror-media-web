import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
    ArrowLeft,
    CalendarDays,
    Clapperboard,
    Loader2,
    Trash2,
    XCircle,
    AlertCircle,
    Send,
    Clock,
    Globe,
    RefreshCw,
    Repeat2,
    LayoutList,
    CheckCircle2,
    Radio,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { calendar_service, ScheduleBatch, ScheduleItem } from '../../../services/calendar_service';
import { frequency_label, platforms_label } from './scheduleMeta';
import { social_service } from '../../../services/social_service';
import { useConfirm } from '../../../components/ui/ConfirmDialog';

const ITEM_STATUS_BADGE: Record<string, string> = {
    draft:     'bg-amber-400/10 text-amber-400 ring-1 ring-amber-400/20',
    scheduled: 'bg-brand-blue/10 text-brand-blue ring-1 ring-brand-blue/20',
    uploading: 'bg-purple-400/10 text-purple-400 ring-1 ring-purple-400/20',
    uploaded:  'bg-brand-emerald/10 text-brand-emerald ring-1 ring-brand-emerald/20',
    failed:    'bg-red-500/10 text-red-400 ring-1 ring-red-400/20',
    cancelled: 'bg-text-muted/10 text-text-muted ring-1 ring-text-muted/20',
};

const ROW_ACCENT: Record<string, string> = {
    draft:     'border-l-amber-400/50',
    scheduled: 'border-l-brand-blue/50',
    uploading: 'border-l-purple-400/50',
    uploaded:  'border-l-brand-emerald/60',
    failed:    'border-l-red-400/50',
    cancelled: 'border-l-transparent',
};

const BATCH_STATUS_BADGE: Record<string, string> = {
    draft:     'bg-amber-400/10 text-amber-400 ring-1 ring-amber-400/25',
    scheduled: 'bg-brand-blue/10 text-brand-blue ring-1 ring-brand-blue/25',
    completed: 'bg-brand-emerald/10 text-brand-emerald ring-1 ring-brand-emerald/25',
    cancelled: 'bg-red-500/10 text-red-400 ring-1 ring-red-400/25',
};

const ScheduleDetailPage: React.FC = () => {
    const { batch_id } = useParams<{ batch_id: string }>();
    const navigate = useNavigate();
    const confirm = useConfirm();
    const [loading, set_loading] = useState(true);
    const [batch, set_batch] = useState<ScheduleBatch | null>(null);
    const [items, set_items] = useState<ScheduleItem[]>([]);
    const [busy, set_busy] = useState(false);
    const [pushing_item_id, set_pushing_item_id] = useState<string | null>(null);

    const push_item_to_social = (item_id: string) => {
        const prev_status = items.find(i => i.id === item_id)?.status ?? null;
        set_pushing_item_id(item_id);
        set_items(prev => prev.map(i => i.id === item_id ? { ...i, status: 'uploading' } : i));
        toast('Push started — uploading in background', { icon: '⏳' });

        void (async () => {
            try {
                const res = await social_service.upload_schedule_item(item_id);
                if (!res.success) throw new Error(res.message || 'Push failed');
                const POLL_MS = 5000;
                const MAX_POLLS = (30 * 60_000) / POLL_MS;
                let polls = 0;
                const interval = window.setInterval(async () => {
                    polls += 1;
                    if (polls > MAX_POLLS) {
                        window.clearInterval(interval);
                        set_pushing_item_id(null);
                        toast.error('Push timed out — check Social Accounts → Recent uploads');
                        return;
                    }
                    try {
                        if (!batch_id) return;
                        const r = await calendar_service.get_upload_schedule(batch_id);
                        if (!r.success || !r.data) return;
                        set_items(r.data.items);
                        set_batch(r.data.batch);
                        const updated = r.data.items.find(i => i.id === item_id);
                        if (updated && updated.status !== 'uploading') {
                            window.clearInterval(interval);
                            set_pushing_item_id(null);
                            if (updated.status === 'uploaded') toast.success('Push completed');
                            else if (updated.status === 'failed') toast.error(updated.error_message || 'Push failed');
                        }
                    } catch { /* next tick retries */ }
                }, POLL_MS);
            } catch (err: any) {
                toast.error(err?.message || 'Push failed');
                if (prev_status) set_items(prev => prev.map(i => i.id === item_id ? { ...i, status: prev_status } : i));
                set_pushing_item_id(null);
            }
        })();
    };

    const load = useCallback(async () => {
        if (!batch_id) return;
        set_loading(true);
        try {
            const res = await calendar_service.get_upload_schedule(batch_id);
            if (!res.success || !res.data) throw new Error(res.message || 'Failed to load schedule');
            set_batch(res.data.batch);
            set_items(res.data.items);
        } catch (err: any) {
            toast.error(err?.message || 'Failed to load schedule');
        } finally {
            set_loading(false);
        }
    }, [batch_id]);

    useEffect(() => { void load(); }, [load]);

    const handle_cancel = async () => {
        if (!batch) return;
        const ok = await confirm({
            title: 'Cancel this schedule?',
            message: 'Pending uploads will be marked cancelled.',
            confirm_label: 'Cancel schedule',
            cancel_label: 'Keep',
            tone: 'warning',
        });
        if (!ok) return;
        set_busy(true);
        try {
            const res = await calendar_service.cancel_upload_schedule(batch.id);
            if (!res.success) throw new Error(res.message);
            toast.success('Schedule cancelled');
            await load();
        } catch (err: any) {
            toast.error(err?.message || 'Cancel failed');
        } finally {
            set_busy(false);
        }
    };

    const handle_delete = async () => {
        if (!batch) return;
        const ok = await confirm({
            title: 'Delete this schedule?',
            message: 'Linked calendar events will be removed. This cannot be undone.',
            confirm_label: 'Delete',
            danger: true,
        });
        if (!ok) return;
        set_busy(true);
        try {
            const res = await calendar_service.delete_upload_schedule(batch.id);
            if (!res.success) throw new Error(res.message);
            toast.success('Schedule deleted');
            navigate('/dashboard/schedules');
        } catch (err: any) {
            toast.error(err?.message || 'Delete failed');
            set_busy(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center py-24 text-text-muted">
                <Loader2 size={28} className="animate-spin" />
            </div>
        );
    }

    if (!batch) {
        return (
            <div className="p-16 text-center rounded-3xl border border-dashed border-border-subtle bg-bg-surface/20 space-y-3">
                <AlertCircle size={36} className="mx-auto text-text-muted opacity-60" />
                <p className="text-text-main font-bold">Schedule not found.</p>
                <button
                    onClick={() => navigate('/dashboard/schedules')}
                    className="px-4 py-2 rounded-xl border border-border-subtle text-xs font-bold text-text-muted hover:text-text-main"
                >
                    Back to schedules
                </button>
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">

            {/* Breadcrumb */}
            <div className="flex items-center gap-2 text-xs text-text-muted">
                <button
                    onClick={() => navigate('/dashboard/schedules')}
                    className="flex items-center gap-1.5 hover:text-brand-emerald transition-colors font-medium"
                >
                    <ArrowLeft size={13} /> Schedules
                </button>
                <span className="text-border-subtle">/</span>
                <span className="text-text-main font-semibold truncate max-w-xs">
                    {batch.name || `Batch ${batch.id.slice(0, 8)}`}
                </span>
            </div>

            {/* Batch header card */}
            <div className="glass-card overflow-hidden shadow-2xl shadow-black/40 ring-1 ring-white/[0.03] hover:shadow-brand-emerald/10 hover:ring-brand-emerald/10 transition-all duration-300">
                <div className="p-5">
                    <div className="flex items-start justify-between gap-4 flex-wrap">
                        <div className="flex items-start gap-4">
                            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-brand-emerald/25 to-brand-emerald/5 flex items-center justify-center text-brand-emerald shadow-lg shadow-brand-emerald/30 ring-1 ring-brand-emerald/20 shrink-0">
                                <CalendarDays size={22} />
                            </div>
                            <div>
                                <div className="flex items-center gap-2 flex-wrap">
                                    <h2 className="text-xl font-bold text-text-main">
                                        {batch.name || `Batch ${batch.id.slice(0, 8)}`}
                                    </h2>
                                    <span className={`text-[10px] px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wide ${BATCH_STATUS_BADGE[batch.status] ?? 'bg-text-muted/10 text-text-muted'}`}>
                                        {batch.status}
                                    </span>
                                </div>
                                {batch.description && (
                                    <p className="text-text-muted text-sm mt-0.5">{batch.description}</p>
                                )}
                            </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-2">
                            <button
                                onClick={load}
                                disabled={loading}
                                className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border-subtle bg-bg-surface/40 text-text-muted hover:text-text-main hover:bg-bg-surface hover:shadow-lg hover:shadow-black/30 hover:-translate-y-0.5 text-xs font-bold transition-all duration-200 disabled:opacity-50"
                            >
                                <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Refresh
                            </button>
                            {batch.status !== 'cancelled' && (
                                <button
                                    onClick={handle_cancel}
                                    disabled={busy}
                                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-amber-500/30 bg-amber-500/5 text-amber-400 hover:bg-amber-500/15 hover:shadow-lg hover:shadow-amber-500/20 hover:-translate-y-0.5 text-xs font-bold transition-all duration-200 disabled:opacity-50"
                                >
                                    <XCircle size={13} /> Cancel
                                </button>
                            )}
                            <button
                                onClick={handle_delete}
                                disabled={busy}
                                className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-red-500/30 bg-red-500/5 text-red-400 hover:bg-red-500/15 hover:shadow-lg hover:shadow-red-500/20 hover:-translate-y-0.5 text-xs font-bold transition-all duration-200 disabled:opacity-50"
                            >
                                {busy ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />} Delete
                            </button>
                        </div>
                    </div>

                    {/* Field grid */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-5">
                        <Field icon={Globe}        label="OTT"          value={batch.ott_name || '—'}                                                              accent="emerald" />
                        <Field icon={Radio}        label="Platforms"    value={platforms_label(batch.platforms)}                                                   accent="blue" />
                        <Field icon={Repeat2}      label="Frequency"    value={frequency_label(batch.frequency)}                                                   accent="amber" />
                        <Field icon={Clock}        label="Times"        value={(batch.upload_times || []).join(', ') || '—'}                                       accent="blue" />
                        <Field icon={LayoutList}   label="Release/day"  value={String(batch.release_count)}                                                        accent="emerald" />
                        <Field icon={CalendarDays} label="Range"        value={`${batch.start_date ?? '—'}${batch.end_date ? ` → ${batch.end_date}` : ''}`}        accent="amber" />
                        <Field icon={CheckCircle2} label="Items"        value={`${batch.items_count ?? 0} total`}                                                  accent="emerald" />
                        <Field icon={Clock}        label="Scheduled"    value={`${batch.scheduled_count ?? 0} slots`}                                              accent="blue" />
                    </div>
                </div>
            </div>

            {/* Items table */}
            <div className="glass-card overflow-hidden shadow-2xl shadow-black/40 ring-1 ring-white/[0.03] hover:shadow-brand-emerald/10 hover:ring-brand-emerald/10 transition-all duration-300">
                <div className="px-5 py-4 border-b border-border-subtle bg-bg-surface/40 flex items-center justify-between">
                    <h3 className="font-bold text-text-main flex items-center gap-2">
                        <LayoutList size={15} className="text-brand-emerald" /> Schedule Items
                    </h3>
                    <span className="text-[11px] text-text-muted px-2 py-0.5 rounded-full bg-bg-surface border border-border-subtle font-medium">
                        {items.length} item{items.length === 1 ? '' : 's'}
                    </span>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="text-text-muted text-[10px] uppercase tracking-widest border-b border-border-subtle bg-bg-surface/60">
                                <th className="px-5 py-3.5 font-bold">Title</th>
                                <th className="px-5 py-3.5 font-bold">Scheduled</th>
                                <th className="px-5 py-3.5 font-bold">Platforms</th>
                                <th className="px-5 py-3.5 font-bold">Status</th>
                                <th className="px-5 py-3.5 font-bold">Result</th>
                                <th className="px-5 py-3.5 font-bold text-right">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border-subtle/60">
                            {items.map((item: ScheduleItem, idx: number) => {
                                const stagger = Math.min(idx * 25, 300);
                                return (
                                    <tr
                                        key={item.id}
                                        className={`group border-l-2 ${ROW_ACCENT[item.status] ?? 'border-l-transparent'} hover:bg-brand-emerald/[0.03] transition-colors duration-150 animate-in fade-in fill-mode-both`}
                                        style={{ animationDelay: `${stagger}ms`, animationDuration: '300ms' }}
                                    >
                                        {/* Title + thumbnail */}
                                        <td className="px-5 py-3.5">
                                            <div className="flex items-center gap-3">
                                                <div className="w-9 h-9 rounded-xl bg-bg-surface border border-border-subtle flex items-center justify-center text-text-muted overflow-hidden shrink-0 shadow-md shadow-black/30 ring-1 ring-white/5">
                                                    {item.library_item?.thumbnail_url ? (
                                                        <img src={item.library_item.thumbnail_url} alt="" className="w-full h-full object-cover" />
                                                    ) : (
                                                        <Clapperboard size={13} />
                                                    )}
                                                </div>
                                                <div className="min-w-0">
                                                    <p className="text-sm font-semibold text-text-main truncate max-w-[200px]">
                                                        {item.title || item.library_item?.title || 'Upload'}
                                                    </p>
                                                    <p className="text-[11px] text-text-muted truncate max-w-[200px]">
                                                        {item.library_item?.file_name || '—'}
                                                    </p>
                                                </div>
                                            </div>
                                        </td>

                                        {/* Scheduled at */}
                                        <td className="px-5 py-3.5 text-xs text-text-muted whitespace-nowrap">
                                            {item.scheduledAt
                                                ? new Date(item.scheduledAt).toLocaleString()
                                                : <span className="text-amber-400 font-bold text-[11px]">Draft</span>}
                                        </td>

                                        {/* Platforms */}
                                        <td className="px-5 py-3.5 text-xs text-text-muted whitespace-nowrap">
                                            {(item.platforms || []).join(', ') || '—'}
                                        </td>

                                        {/* Status */}
                                        <td className="px-5 py-3.5">
                                            <span className={`inline-flex items-center text-[10px] px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wide ${ITEM_STATUS_BADGE[item.status] ?? 'bg-text-muted/10 text-text-muted'}`}>
                                                {item.status === 'uploading' && <Loader2 size={9} className="animate-spin mr-1" />}
                                                {item.status}
                                            </span>
                                        </td>

                                        {/* Result */}
                                        <td className="px-5 py-3.5 text-xs max-w-[180px]">
                                            {item.error_message
                                                ? <span className="text-red-400 line-clamp-2">{item.error_message}</span>
                                                : Object.keys(item.upload_result || {}).length > 0
                                                    ? <span className="text-brand-emerald font-medium">See result</span>
                                                    : <span className="text-text-muted">—</span>}
                                        </td>

                                        {/* Push action */}
                                        <td className="px-5 py-3.5 text-right">
                                            {item.status === 'uploaded' ? (
                                                <span className="inline-flex items-center gap-1 text-[11px] text-brand-emerald font-bold">
                                                    <CheckCircle2 size={11} /> Done
                                                </span>
                                            ) : item.status === 'cancelled' ? (
                                                <span className="text-[11px] text-text-muted">—</span>
                                            ) : (() => {
                                                const in_flight = pushing_item_id === item.id || item.status === 'uploading';
                                                const disabled  = in_flight || !item.library_item_id;
                                                return (
                                                    <button
                                                        type="button"
                                                        disabled={disabled}
                                                        onClick={() => push_item_to_social(item.id)}
                                                        className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-none hover:-translate-y-0.5 ${
                                                            item.status === 'failed'
                                                                ? 'border border-red-400/40 bg-red-400/5 text-red-400 hover:bg-red-400/15 shadow-sm shadow-red-400/10 hover:shadow-md hover:shadow-red-400/30'
                                                                : 'border border-brand-emerald/40 bg-brand-emerald/5 text-brand-emerald hover:bg-brand-emerald/15 shadow-sm shadow-brand-emerald/10 hover:shadow-md hover:shadow-brand-emerald/30'
                                                        }`}
                                                        title={in_flight ? 'Upload in progress' : item.status === 'failed' ? 'Retry' : 'Push to platforms'}
                                                    >
                                                        {in_flight
                                                            ? <><Loader2 size={11} className="animate-spin" /> Uploading</>
                                                            : item.status === 'failed'
                                                                ? <><RefreshCw size={11} /> Retry</>
                                                                : <><Send size={11} /> Push</>}
                                                    </button>
                                                );
                                            })()}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

// ── Sub-components ────────────────────────────────────────────────────────────

const Field: React.FC<{
    label: string;
    value: string;
    icon: React.ComponentType<{ size?: number; className?: string }>;
    accent?: StatAccent;
}> = ({ label, value, icon: Icon, accent }) => {
    const a = accent ? STAT_ACCENT[accent] : null;
    return (
        <div
            className={[
                'relative glass-card p-4 overflow-hidden transition-all duration-200',
                'shadow-lg shadow-black/30 ring-1 ring-white/[0.04]',
                'hover:-translate-y-0.5 hover:shadow-2xl',
                a ? a.shadow : 'hover:shadow-black/40',
            ].join(' ')}
        >
            {a && <span className={`pointer-events-none absolute inset-0 bg-gradient-to-bl ${a.tint} to-transparent`} />}
            <div className="relative flex items-start justify-between gap-2">
                <p className="text-[10px] uppercase font-bold text-text-muted tracking-widest">{label}</p>
                <span className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 ring-1 ring-white/5 ${a ? `${a.bg} ${a.text}` : 'bg-bg-surface text-text-muted'}`}>
                    <Icon size={12} />
                </span>
            </div>
            <p className={`relative text-base font-bold mt-1.5 truncate ${a ? a.text : 'text-text-main'}`} title={value}>{value}</p>
        </div>
    );
};

type StatAccent = 'emerald' | 'blue' | 'amber' | 'red';

const STAT_ACCENT: Record<StatAccent, { text: string; bg: string; tint: string; shadow: string }> = {
    emerald: { text: 'text-brand-emerald', bg: 'bg-brand-emerald/10', tint: 'from-brand-emerald/[0.18]', shadow: 'hover:shadow-brand-emerald/20' },
    blue:    { text: 'text-brand-blue',    bg: 'bg-brand-blue/10',    tint: 'from-brand-blue/[0.18]',    shadow: 'hover:shadow-brand-blue/20'    },
    amber:   { text: 'text-amber-400',     bg: 'bg-amber-400/10',     tint: 'from-amber-400/[0.18]',     shadow: 'hover:shadow-amber-400/20'     },
    red:     { text: 'text-red-400',       bg: 'bg-red-500/10',       tint: 'from-red-500/[0.18]',       shadow: 'hover:shadow-red-500/20'       },
};

export default ScheduleDetailPage;
