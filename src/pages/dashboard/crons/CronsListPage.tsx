import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    Activity,
    AlertTriangle,
    CheckCircle2,
    Clock,
    Hash,
    Loader2,
    Play,
    RefreshCw,
    Timer,
    Zap,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { cron_service, CronState } from '../../../services/cron_service';

function format_interval(ms: number): string {
    if (ms < 1000) return `every ${ms} ms`;
    const s = Math.round(ms / 1000);
    if (s < 60) return `every ${s} s`;
    const m = Math.round(s / 60);
    if (m < 60) return `every ${m} min`;
    const h = Math.round(m / 60);
    return `every ${h} h`;
}

function format_relative_future(iso: string | null, now: number): string {
    if (!iso) return '—';
    const t = new Date(iso).getTime();
    const delta_ms = t - now;
    if (delta_ms <= 0) return 'now';
    const s = Math.round(delta_ms / 1000);
    if (s < 60) return `in ${s}s`;
    const m = Math.floor(s / 60);
    const rem_s = s % 60;
    if (m < 60) return rem_s > 0 ? `in ${m}m ${rem_s}s` : `in ${m}m`;
    const h = Math.floor(m / 60);
    return `in ${h}h ${m % 60}m`;
}

function format_relative_past(iso: string | null, now: number): string {
    if (!iso) return 'never';
    const t = new Date(iso).getTime();
    const delta_s = Math.max(0, Math.round((now - t) / 1000));
    if (delta_s < 60) return `${delta_s}s ago`;
    const m = Math.floor(delta_s / 60);
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    return `${h}h ${m % 60}m ago`;
}

function format_absolute(iso: string | null): string {
    if (!iso) return '—';
    try {
        return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch {
        return iso;
    }
}

const CronsListPage: React.FC = () => {
    const [crons, set_crons] = useState<CronState[]>([]);
    const [loading, set_loading] = useState(false);
    const [running_id, set_running_id] = useState<string | null>(null);
    const [now_ms, set_now_ms] = useState<number>(Date.now());

    useEffect(() => {
        const id = setInterval(() => set_now_ms(Date.now()), 1000);
        return () => clearInterval(id);
    }, []);

    const load = useCallback(async () => {
        set_loading(true);
        try {
            const res = await cron_service.list();
            if (!res.success || !res.data) throw new Error(res.message);
            set_crons(res.data.crons);
        } catch (err: any) {
            toast.error(err?.message || 'Failed to load crons');
        } finally {
            set_loading(false);
        }
    }, []);

    useEffect(() => { void load(); }, [load]);


    const handle_run = async (id: string) => {
        set_running_id(id);
        try {
            const res = await cron_service.run(id);
            if (!res.success || !res.data) throw new Error(res.message || 'Run failed');
            set_crons((prev: CronState[]) => prev.map((c: CronState) => c.id === id ? res.data!.state : c));
            toast.success(`Ran ${res.data.id}: ${res.data.summary}`);
        } catch (err: any) {
            toast.error(err?.message || 'Run failed');
        } finally {
            set_running_id(null);
        }
    };

    const stats = useMemo(() => {
        let healthy = 0, errored = 0, never_ran = 0;
        for (const c of crons) {
            if (c.last_run_ok === null) never_ran += 1;
            else if (c.last_run_ok) healthy += 1;
            else errored += 1;
        }
        return { total: crons.length, healthy, errored, never_ran };
    }, [crons]);

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">

            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div>
                    <h2 className="text-2xl font-bold text-text-main flex items-center gap-3">
                        <span className="w-9 h-9 rounded-xl bg-brand-emerald/15 flex items-center justify-center text-brand-emerald shadow-lg shadow-brand-emerald/20">
                            <Activity size={18} />
                        </span>
                        System Crons
                    </h2>
                    <p className="text-text-muted text-sm mt-1">
                        Background workers on fixed intervals —{' '}
                        <span className="text-text-main font-semibold">{stats.total}</span> job{stats.total === 1 ? '' : 's'} registered.
                    </p>
                </div>
                <button
                    onClick={load}
                    disabled={loading}
                    className="flex items-center gap-2 px-3 py-2 rounded-xl border border-border-subtle text-text-muted hover:text-text-main hover:border-brand-emerald/30 text-xs font-bold disabled:opacity-60 transition-all shadow-sm"
                >
                    <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
                </button>
            </div>

            {/* Stat tiles */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <StatTile label="Total"     value={stats.total}     Icon={Hash}         />
                <StatTile label="Healthy"   value={stats.healthy}   Icon={CheckCircle2} accent="emerald" />
                <StatTile label="Errored"   value={stats.errored}   Icon={AlertTriangle} accent="red"   />
                <StatTile label="Never Ran" value={stats.never_ran} Icon={Timer}                         />
            </div>

            {/* Table */}
            {loading && crons.length === 0 ? (
                <div className="flex items-center justify-center py-24 text-text-muted">
                    <Loader2 size={28} className="animate-spin" />
                </div>
            ) : crons.length === 0 ? (
                <div className="p-16 text-center rounded-3xl border border-dashed border-border-subtle bg-bg-surface/20 shadow-lg shadow-black/10 space-y-3">
                    <div className="w-14 h-14 rounded-2xl bg-brand-emerald/10 flex items-center justify-center mx-auto">
                        <Clock size={28} className="text-brand-emerald opacity-60" />
                    </div>
                    <h3 className="text-lg font-bold text-text-main">No crons registered</h3>
                    <p className="text-sm text-text-muted max-w-sm mx-auto">
                        Background workers register at server boot. Restart the backend if this list is empty.
                    </p>
                </div>
            ) : (
                <div className="glass-card overflow-hidden shadow-xl shadow-black/25 ring-1 ring-white/[0.04]">
                    {/* Table header bar */}
                    <div className="px-5 py-3 border-b border-border-subtle bg-bg-surface/50 flex items-center justify-between">
                        <span className="text-[11px] font-semibold text-text-muted">
                            <span className="text-brand-emerald font-bold pe-1">{stats.total}</span> job{stats.total === 1 ? '' : 's'} registered
                        </span>
                        {loading && (
                            <span className="flex items-center gap-1.5 text-[11px] text-text-muted">
                                <Loader2 size={11} className="animate-spin" /> Syncing…
                            </span>
                        )}
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead>
                                <tr className="text-text-muted text-[10px] uppercase tracking-widest border-b border-border-subtle bg-bg-surface/60">
                                    <th className="px-5 py-3.5 font-bold">Job</th>
                                    <th className="px-5 py-3.5 font-bold">Interval</th>
                                    <th className="px-5 py-3.5 font-bold">Last Run</th>
                                    <th className="px-5 py-3.5 font-bold">Next Run</th>
                                    <th className="px-5 py-3.5 font-bold">Status</th>
                                    <th className="px-5 py-3.5 font-bold text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border-subtle/60">
                                {crons.map((c: CronState, idx: number) => {
                                    const running = running_id === c.id || c.is_running;
                                    const stagger = Math.min(idx * 40, 300);
                                    return (
                                        <tr
                                            key={c.id}
                                            className="group hover:bg-brand-emerald/[0.03] transition-colors duration-150 animate-in fade-in slide-in-from-bottom-1 fill-mode-both"
                                            style={{ animationDelay: `${stagger}ms`, animationDuration: '350ms' }}
                                        >
                                            {/* Job */}
                                            <td className="px-5 py-4">
                                                <div className="flex items-start gap-3">
                                                    <span className={`mt-0.5 w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition-colors ${
                                                        running
                                                            ? 'bg-brand-emerald/20 text-brand-emerald'
                                                            : c.last_run_ok === false
                                                                ? 'bg-red-500/10 text-red-400'
                                                                : 'bg-bg-surface text-text-muted'
                                                    }`}>
                                                        {running
                                                            ? <Loader2 size={13} className="animate-spin" />
                                                            : <Zap size={13} />}
                                                    </span>
                                                    <div>
                                                        <p className="text-sm font-semibold text-text-main leading-tight">{c.label}</p>
                                                        <p className="text-[11px] text-text-muted mt-0.5 max-w-xs">{c.description}</p>
                                                    </div>
                                                </div>
                                            </td>

                                            {/* Interval */}
                                            <td className="px-5 py-4">
                                                <span className="inline-flex items-center gap-1 text-xs text-text-muted bg-bg-surface/60 px-2 py-1 rounded-lg ring-1 ring-border-subtle whitespace-nowrap">
                                                    <Clock size={10} className="shrink-0" />
                                                    {format_interval(c.interval_ms)}
                                                </span>
                                            </td>

                                            {/* Last run */}
                                            <td className="px-5 py-4 whitespace-nowrap">
                                                <p className="text-xs font-medium text-text-main">
                                                    {format_relative_past(c.last_run_at, now_ms)}
                                                </p>
                                                <p className="text-[11px] text-text-muted mt-0.5">
                                                    {c.last_run_at ? format_absolute(c.last_run_at) : ''}
                                                    {c.last_run_duration_ms != null ? ` · ${c.last_run_duration_ms}ms` : ''}
                                                </p>
                                            </td>

                                            {/* Next run */}
                                            <td className="px-5 py-4 whitespace-nowrap">
                                                <p className="text-xs font-medium text-brand-emerald">
                                                    {format_relative_future(c.next_run_at, now_ms)}
                                                </p>
                                                <p className="text-[11px] text-text-muted mt-0.5">
                                                    {format_absolute(c.next_run_at)}
                                                </p>
                                            </td>

                                            {/* Status */}
                                            <td className="px-5 py-4">
                                                {running ? (
                                                    <span className="inline-flex items-center gap-1.5 text-[10px] px-2.5 py-1 rounded-full font-bold uppercase tracking-tight bg-brand-emerald/10 text-brand-emerald ring-1 ring-brand-emerald/20">
                                                        <span className="w-1.5 h-1.5 rounded-full bg-brand-emerald animate-pulse" />
                                                        Running
                                                    </span>
                                                ) : c.last_run_ok === null ? (
                                                    <span className="inline-flex items-center gap-1.5 text-[10px] px-2.5 py-1 rounded-full font-bold uppercase tracking-tight bg-text-muted/10 text-text-muted ring-1 ring-text-muted/10">
                                                        Idle
                                                    </span>
                                                ) : c.last_run_ok ? (
                                                    <span className="inline-flex items-center gap-1.5 text-[10px] px-2.5 py-1 rounded-full font-bold uppercase tracking-tight bg-brand-emerald/10 text-brand-emerald ring-1 ring-brand-emerald/20">
                                                        <CheckCircle2 size={11} /> OK
                                                    </span>
                                                ) : (
                                                    <span
                                                        className="inline-flex items-center gap-1.5 text-[10px] px-2.5 py-1 rounded-full font-bold uppercase tracking-tight bg-red-500/10 text-red-400 ring-1 ring-red-400/20 max-w-[18rem] truncate"
                                                        title={c.last_run_summary ?? ''}
                                                    >
                                                        <AlertTriangle size={11} /> Error
                                                    </span>
                                                )}
                                                {c.last_run_summary && c.last_run_ok && (
                                                    <p className="text-[11px] text-text-muted mt-1 truncate max-w-[18rem]" title={c.last_run_summary}>
                                                        {c.last_run_summary}
                                                    </p>
                                                )}
                                            </td>

                                            {/* Actions */}
                                            <td className="px-5 py-4">
                                                <div className="flex items-center gap-1 justify-end">
                                                    <button
                                                        onClick={() => handle_run(c.id)}
                                                        disabled={running}
                                                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-emerald/10 text-brand-emerald hover:bg-brand-emerald/20 hover:shadow-md hover:shadow-brand-emerald/15 text-xs font-bold disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                                                        title="Run this cron now"
                                                    >
                                                        {running
                                                            ? <Loader2 size={12} className="animate-spin" />
                                                            : <Play size={12} />}
                                                        Run now
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
};

// ── Stat tile ────────────────────────────────────────────────────────────────

type Accent = 'emerald' | 'red';

const ACCENT: Record<Accent, { text: string; bg: string; tint: string; shadow_hover: string }> = {
    emerald: { text: 'text-brand-emerald', bg: 'bg-brand-emerald/10', tint: 'from-brand-emerald/[0.07]', shadow_hover: 'hover:shadow-brand-emerald/15' },
    red:     { text: 'text-red-400',       bg: 'bg-red-500/10',       tint: 'from-red-500/[0.07]',       shadow_hover: 'hover:shadow-red-500/15'       },
};

const StatTile: React.FC<{
    label: string;
    value: number;
    Icon: React.ComponentType<{ size?: number; className?: string }>;
    accent?: Accent;
}> = ({ label, value, Icon, accent }) => {
    const a = accent ? ACCENT[accent] : null;
    return (
        <div className={[
            'relative glass-card p-4 overflow-hidden transition-all duration-200',
            'shadow-lg shadow-black/20 hover:shadow-2xl hover:-translate-y-0.5',
            a ? a.shadow_hover : 'hover:shadow-black/30',
        ].join(' ')}>
            {a && <span className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${a.tint} to-transparent`} />}
            <div className="relative flex items-start justify-between gap-2">
                <p className="text-[10px] uppercase font-bold text-text-muted tracking-widest">{label}</p>
                <span className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 ${a ? `${a.bg} ${a.text}` : 'bg-bg-surface text-text-muted'}`}>
                    <Icon size={12} />
                </span>
            </div>
            <p className={`text-2xl font-bold tabular-nums mt-1.5 ${a ? a.text : 'text-text-main'}`}>{value}</p>
        </div>
    );
};

export default CronsListPage;
