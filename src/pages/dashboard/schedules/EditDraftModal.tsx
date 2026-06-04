/**
 * Continue / edit a draft schedule batch.
 *
 * Drafts already have library_item_ids picked + a chosen OTT — the only
 * thing left is to dial in the settings (frequency, times, dates, color)
 * and either save back as a draft or flip Schedule upload on. Save fires
 * `calendar_service.update_upload_schedule(batch_id, payload)` which
 * wipes + rebuilds items and linked calendar events server-side.
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
    X,
    Save,
    ArrowLeft,
    Loader2,
    AlertTriangle,
    Plus,
    Minus,
    CheckCircle2,
    CalendarDays,
} from 'lucide-react';
import toast from 'react-hot-toast';
import {
    calendar_service,
    ScheduleBatch,
    ScheduleItem,
    ScheduleFrequency,
    SchedulePayload,
    SchedulePreviewItem,
    SupportedPlatform,
} from '../../../services/calendar_service';
import { CommonSearchSelect } from '../../../components/ui/CommonSearchSelect';
import { ThemedDatePicker } from '../../../components/ui/ThemedDatePicker';
import { ThemedTimePicker } from '../../../components/ui/ThemedTimePicker';
import { ThemedColorPicker } from '../../../components/ui/ThemedColorPicker';
import { Input } from '../../../components/ui/Input';
import {
    FREQUENCY_OPTIONS,
    COLOR_OPTIONS,
    WEEKDAY_OPTIONS,
    SWATCH_HEX,
} from './scheduleMeta';

// Multi-select picker — user can pick any combination. The trigger
// collapses to "All" when all three are checked so the chip strip
// doesn't get noisy; partial selections render as a comma-separated
// list of names instead of one-chip-per-value.
const ALL_PLATFORMS: SupportedPlatform[] = ['youtube', 'facebook', 'instagram'];
const PLATFORM_OPTS = [
    { label: 'YouTube', value: 'youtube' },
    { label: 'Facebook', value: 'facebook' },
    { label: 'Instagram', value: 'instagram' },
];

function platform_label(v: string): string {
    return PLATFORM_OPTS.find(p => p.value === v)?.label ?? v;
}

interface Props {
    isOpen: boolean;
    onClose: () => void;
    batch: ScheduleBatch | null;
    items: ScheduleItem[];
    onSaved?: (batch_id: string) => void;
}

function pad2(n: number) { return String(n).padStart(2, '0'); }

function date_input(d: Date): string {
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

// Convert "HH:MM" in UTC to "HH:MM" in the browser's local timezone for display.
function utc_hhmm_to_local(hhmm: string): string {
    const [h, m] = hhmm.split(':').map(Number);
    const ref = new Date(Date.UTC(2000, 0, 1, h!, m!, 0, 0));
    return `${pad2(ref.getHours())}:${pad2(ref.getMinutes())}`;
}

// Convert "HH:MM" in the browser's local timezone to "HH:MM" in UTC for storage.
function local_hhmm_to_utc(hhmm: string): string {
    const [h, m] = hhmm.split(':').map(Number);
    const ref = new Date(2000, 0, 1, h!, m!, 0, 0);
    return `${pad2(ref.getUTCHours())}:${pad2(ref.getUTCMinutes())}`;
}

function add_days(date_str: string, days: number): string {
    const [y, m, d] = date_str.split('-').map(Number);
    const dt = new Date(y!, (m! || 1) - 1, (d! || 1) + days);
    return date_input(dt);
}

function days_between_inclusive(start: string, end: string): number {
    if (!start || !end) return 0;
    const [sy, sm, sd] = start.split('-').map(Number);
    const [ey, em, ed] = end.split('-').map(Number);
    const a = new Date(sy!, (sm! || 1) - 1, sd! || 1);
    const b = new Date(ey!, (em! || 1) - 1, ed! || 1);
    return Math.floor((b.getTime() - a.getTime()) / 86_400_000) + 1;
}

function ordinal(n: number): string {
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

const EditDraftModal: React.FC<Props> = ({ isOpen, onClose, batch, items, onSaved }) => {
    // ── Form state — seeded from the batch on open ──────────────────────
    const [name, set_name] = useState('');
    const [scheduled, set_scheduled] = useState(true);
    const [frequency, set_frequency] = useState<ScheduleFrequency>('every_day');
    const [release_count, set_release_count] = useState(1);
    const [upload_times, set_upload_times] = useState<string[]>(['10:00']);
    const [start_date, set_start_date] = useState('');
    const [end_date, set_end_date] = useState('');
    const [weekdays, set_weekdays] = useState<number[]>([]);
    const [month_days, set_month_days] = useState<number[]>([]);
    const [platforms, set_platforms] = useState<SupportedPlatform[]>(ALL_PLATFORMS);
    const [color, set_color] = useState('random');
    const [custom_color, set_custom_color] = useState('#10B981');
    const [title_prefix, set_title_prefix] = useState('');

    const [stage, set_stage] = useState<'form' | 'preview'>('form');
    const [preview_items, set_preview_items] = useState<SchedulePreviewItem[] | null>(null);
    const [preview_warnings, set_preview_warnings] = useState<string[]>([]);
    const [previewing, set_previewing] = useState(false);
    const [saving, set_saving] = useState(false);

    // Seed every time the modal opens with a fresh batch.
    useEffect(() => {
        if (!isOpen || !batch) return;
        set_name(batch.name ?? '');
        set_scheduled(!!batch.scheduled);
        set_frequency((batch.frequency ?? 'every_day') as ScheduleFrequency);
        set_release_count(Math.max(1, batch.release_count ?? 1));
        const times = batch.upload_times && batch.upload_times.length > 0
            ? batch.upload_times.map(utc_hhmm_to_local)
            : ['10:00'];
        set_upload_times(times);
        set_start_date(batch.start_date ?? date_input(new Date()));
        set_end_date(batch.end_date ?? '');
        set_weekdays(batch.weekdays ?? []);
        set_month_days(batch.month_days ?? []);
        set_platforms(((batch.platforms ?? []) as SupportedPlatform[]).filter(p => ALL_PLATFORMS.includes(p)));
        // Color stored on batch may already be a hex string (Custom case)
        // or one of the named values. Heuristic: if it starts with # treat
        // as Custom + seed the picker value.
        if (batch.color && batch.color.startsWith('#')) {
            set_color('custom');
            set_custom_color(batch.color);
        } else {
            set_color(batch.color ?? 'random');
            set_custom_color('#10B981');
        }
        set_title_prefix(batch.title_prefix ?? '');
        set_stage('form');
        set_preview_items(null);
        set_preview_warnings([]);
    }, [isOpen, batch]);

    // Keep upload_times length aligned with release_count.
    useEffect(() => {
        set_upload_times(prev => {
            const next = prev.slice(0, release_count);
            const defaults = ['10:00', '18:00', '14:00', '08:00', '20:00', '12:00'];
            while (next.length < release_count) {
                next.push(defaults[next.length] ?? `${pad2(8 + next.length)}:00`);
            }
            return next;
        });
    }, [release_count]);

    const file_count = items.length;
    const required_days = release_count > 0 ? Math.ceil(file_count / release_count) : 0;
    const is_custom_range = frequency === 'custom_range';
    const selected_range_days = is_custom_range && start_date && end_date
        ? days_between_inclusive(start_date, end_date)
        : 0;
    const range_too_short = is_custom_range && file_count > 0 && selected_range_days > 0 && selected_range_days < required_days;

    // Auto-compute end_date for custom_range so "extra days" can't be picked.
    const required_end_date = useMemo(() => {
        if (!is_custom_range || !start_date || required_days <= 0) return '';
        return add_days(start_date, required_days - 1);
    }, [is_custom_range, start_date, required_days]);

    useEffect(() => {
        if (!is_custom_range) {
            if (end_date) set_end_date('');
            return;
        }
        if (required_end_date && end_date !== required_end_date) {
            set_end_date(required_end_date);
        }
    }, [is_custom_range, required_end_date, end_date]);

    if (!isOpen || !batch) return null;

    const effective_color = color === 'custom' ? custom_color : color;

    const validate = (): string | null => {
        if (!batch.ott_id) return 'Draft has no OTT — cannot edit';
        if (file_count === 0) return 'Draft has no library items — delete it instead';
        if (platforms.length === 0) return 'Pick at least one platform';
        if (release_count < 1) return 'Upload count must be at least 1';
        if (upload_times.some(t => !/^([01]\d|2[0-3]):([0-5]\d)$/.test(t))) return 'Upload times must be HH:MM (24h)';
        if (scheduled) {
            if (frequency === 'every_week' && weekdays.length === 0) return 'Pick at least one weekday';
            if (frequency === 'every_month' && month_days.length === 0) return 'Pick at least one day of month';
            if (is_custom_range) {
                if (!start_date) return 'Start date is required';
                if (!end_date) return 'End date is required';
                if (end_date < start_date) return 'End date must be on or after start date';
                if (selected_range_days < required_days) {
                    return `Selected range is too short. ${file_count} files with upload count ${release_count} requires ${required_days} day${required_days === 1 ? '' : 's'}.`;
                }
            }
        }
        return null;
    };

    const build_payload = (): SchedulePayload | null => {
        if (!batch.ott_id) return null;
        const effective_start = scheduled
            ? (is_custom_range ? start_date : date_input(new Date()))
            : null;
        const effective_end = scheduled && effective_start && required_days > 0
            ? add_days(effective_start, required_days - 1)
            : null;
        return {
            ott_id: batch.ott_id,
            library_item_ids: items.map(i => i.library_item_id!).filter(Boolean) as string[],
            scheduled,
            platforms,
            frequency: scheduled ? frequency : null,
            release_count,
            upload_times: scheduled ? upload_times.map(local_hhmm_to_utc) : [],
            start_date: effective_start,
            end_date: effective_end,
            weekdays: scheduled && frequency === 'every_week' ? weekdays : [],
            month_days: scheduled && frequency === 'every_month' ? month_days : [],
            color: effective_color || null,
            title_prefix: title_prefix || null,
            description: batch.description ?? null,
            tags: batch.tags ?? [],
            name: name || null,
        };
    };

    const go_preview = async () => {
        const err = validate();
        if (err) { toast.error(err); return; }
        const payload = build_payload();
        if (!payload) return;
        set_previewing(true);
        try {
            const res = await calendar_service.preview_upload_schedule(payload);
            if (!res.success || !res.data) throw new Error(res.message || 'Preview failed');
            set_preview_items(res.data.items);
            set_preview_warnings(res.data.warnings ?? []);
            set_stage('preview');
        } catch (e: any) {
            toast.error(e?.message || 'Preview failed');
        } finally {
            set_previewing(false);
        }
    };

    const go_save = async () => {
        const err = validate();
        if (err) { toast.error(err); return; }
        const payload = build_payload();
        if (!payload) return;
        set_saving(true);
        try {
            const res = await calendar_service.update_upload_schedule(batch.id, payload);
            if (!res.success || !res.data) throw new Error(res.message || 'Save failed');
            toast.success(scheduled ? `Schedule updated — ${res.data.scheduled_count} item(s) on the calendar` : 'Draft saved');
            for (const w of res.data.warnings ?? []) toast(w, { icon: '⚠️' });
            onSaved?.(res.data.batch.id);
            onClose();
        } catch (e: any) {
            toast.error(e?.message || 'Save failed');
        } finally {
            set_saving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => !saving && !previewing && onClose()} />
            <div className="relative w-full max-w-3xl bg-bg-main border border-border-subtle rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 max-h-[92vh] flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between p-5 border-b border-border-subtle">
                    <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center shrink-0">
                            <CalendarDays size={20} />
                        </div>
                        <div className="min-w-0">
                            <h3 className="text-lg font-bold text-text-main truncate">Continue Draft</h3>
                            <p className="text-[10px] uppercase font-bold text-text-muted tracking-widest mt-0.5">
                                {batch.name || `Batch ${batch.id.slice(0, 8)}`} · {file_count} file{file_count === 1 ? '' : 's'}
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        disabled={saving || previewing}
                        className="p-2 rounded-xl hover:bg-black/5 dark:hover:bg-white/5 text-text-muted disabled:opacity-50"
                    >
                        <X size={20} />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-5 space-y-4">
                    {stage === 'form' ? (
                        <>
                            <Input
                                label="Schedule Name (optional)"
                                value={name}
                                onChange={set_name}
                                placeholder="e.g. May releases — Series A"
                            />

                            <label className="flex items-center gap-2 ml-1 cursor-pointer select-none">
                                <input type="checkbox" checked={scheduled} onChange={(e) => set_scheduled(e.target.checked)} />
                                <span className="text-sm text-text-main font-medium">Schedule upload</span>
                                <span className="text-[11px] text-text-muted">— off = keep as draft</span>
                            </label>

                            {scheduled && (
                                <>
                                    <section className="space-y-2">
                                        <label className="text-[11px] uppercase font-bold text-text-muted tracking-wider">
                                            Frequency
                                            {!is_custom_range && (
                                                <span className="ml-2 text-text-muted/60 normal-case font-normal">
                                                    · starts today; no end date needed
                                                </span>
                                            )}
                                        </label>
                                        <CommonSearchSelect
                                            options={FREQUENCY_OPTIONS}
                                            value={frequency}
                                            on_change={(v) => set_frequency((v || 'every_day') as ScheduleFrequency)}
                                        />
                                    </section>

                                    {frequency === 'every_week' && (
                                        <div className="space-y-2">
                                            <label className="text-[11px] uppercase font-bold text-text-muted tracking-wider">Weekdays</label>
                                            <div className="flex flex-wrap gap-2">
                                                {WEEKDAY_OPTIONS.map(wd => {
                                                    const sel = weekdays.includes(wd.value);
                                                    return (
                                                        <button
                                                            key={wd.value}
                                                            type="button"
                                                            onClick={() => set_weekdays(prev => prev.includes(wd.value) ? prev.filter(x => x !== wd.value) : [...prev, wd.value].sort((a, b) => a - b))}
                                                            className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors ${
                                                                sel
                                                                    ? 'border-brand-blue/60 bg-brand-blue/10 text-brand-blue'
                                                                    : 'border-border-subtle text-text-muted hover:text-text-main'
                                                            }`}
                                                        >
                                                            {wd.short}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    )}

                                    {frequency === 'every_month' && (
                                        <div className="space-y-2">
                                            <label className="text-[11px] uppercase font-bold text-text-muted tracking-wider">Days of month</label>
                                            <div className="grid grid-cols-7 sm:grid-cols-10 gap-1">
                                                {Array.from({ length: 31 }, (_, i) => i + 1).map(d => {
                                                    const sel = month_days.includes(d);
                                                    return (
                                                        <button
                                                            key={d}
                                                            type="button"
                                                            onClick={() => set_month_days(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d].sort((a, b) => a - b))}
                                                            className={`py-1.5 rounded-lg text-[11px] font-bold border ${
                                                                sel
                                                                    ? 'border-brand-blue/60 bg-brand-blue/10 text-brand-blue'
                                                                    : 'border-border-subtle text-text-muted hover:text-text-main'
                                                            }`}
                                                        >
                                                            {d}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    )}

                                    {is_custom_range && (
                                        <section className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                            <div className="space-y-2">
                                                <label className="text-[11px] uppercase font-bold text-text-muted tracking-wider">Start date</label>
                                                <ThemedDatePicker
                                                    value={start_date}
                                                    onChange={set_start_date}
                                                    min={date_input(new Date())}
                                                    placeholder="DD-MM-YYYY"
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <label className="text-[11px] uppercase font-bold text-text-muted tracking-wider">
                                                    End date
                                                    {required_end_date && (
                                                        <span className="ml-2 text-text-muted/60 normal-case font-normal">
                                                            · auto · {required_days} day{required_days === 1 ? '' : 's'}
                                                        </span>
                                                    )}
                                                </label>
                                                <ThemedDatePicker
                                                    value={end_date}
                                                    onChange={set_end_date}
                                                    min={required_end_date || start_date || undefined}
                                                    max={required_end_date || undefined}
                                                    placeholder="DD-MM-YYYY"
                                                    disabled={!start_date}
                                                />
                                            </div>
                                        </section>
                                    )}
                                </>
                            )}

                            {/* Knobs row — Upload count / Platform / Color */}
                            <section className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                <div className="space-y-2">
                                    <label className="text-[11px] uppercase font-bold text-text-muted tracking-wider">Upload count / day</label>
                                    <div className="flex items-center gap-2">
                                        <button
                                            type="button"
                                            onClick={() => set_release_count(c => Math.max(1, c - 1))}
                                            className="p-2 rounded-xl border border-border-subtle text-text-muted hover:text-text-main"
                                        >
                                            <Minus size={14} />
                                        </button>
                                        <input
                                            type="number"
                                            min={1}
                                            max={20}
                                            value={release_count}
                                            onChange={(e) => set_release_count(Math.max(1, parseInt(e.target.value || '1', 10)))}
                                            className="input-field text-center flex-1 min-w-0"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => set_release_count(c => Math.min(20, c + 1))}
                                            className="p-2 rounded-xl border border-border-subtle text-text-muted hover:text-text-main"
                                        >
                                            <Plus size={14} />
                                        </button>
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[11px] uppercase font-bold text-text-muted tracking-wider">Platforms</label>
                                    <CommonSearchSelect
                                        is_multi
                                        options={PLATFORM_OPTS}
                                        value={platforms as string[]}
                                        on_change={(v) => set_platforms((v as string[]).filter(x => ALL_PLATFORMS.includes(x as SupportedPlatform)) as SupportedPlatform[])}
                                        placeholder="Pick platforms…"
                                        // Collapse the chip strip — show "All" when 3-of-3 are
                                        // selected, otherwise a single comma-joined string. Way less
                                        // noisy than three chips lined up.
                                        render_value={(_one, all_selected) => {
                                            if (all_selected.length === 0) {
                                                return <span className="text-text-muted/70">Pick platforms…</span>;
                                            }
                                            if (all_selected.length === ALL_PLATFORMS.length) {
                                                return <span className="text-text-main">All</span>;
                                            }
                                            return (
                                                <span className="text-text-main truncate">
                                                    {all_selected.map(o => o.label).join(', ')}
                                                </span>
                                            );
                                        }}
                                    />
                                    {platforms.length > 0 && (
                                        <p className="text-[10px] text-text-muted truncate" title={platforms.map(platform_label).join(', ')}>
                                            Posts to: <span className="text-text-main">{platforms.map(platform_label).join(', ')}</span>
                                        </p>
                                    )}
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[11px] uppercase font-bold text-text-muted tracking-wider">Calendar color</label>
                                    <div className="flex items-center gap-2">
                                        <div className="flex-1 min-w-0">
                                            <CommonSearchSelect
                                                options={COLOR_OPTIONS}
                                                value={color}
                                                on_change={(v) => set_color(v || 'random')}
                                            />
                                        </div>
                                        {color === 'custom' ? (
                                            <ThemedColorPicker value={custom_color} onChange={set_custom_color} />
                                        ) : color === 'random' ? (
                                            <div
                                                className="h-9 w-9 rounded-xl border border-border-subtle shrink-0 bg-gradient-to-br from-brand-emerald via-purple-500 to-brand-blue"
                                                title="A different color per upload"
                                            />
                                        ) : (
                                            <div
                                                className="h-9 w-9 rounded-xl border border-border-subtle shrink-0"
                                                style={{ backgroundColor: SWATCH_HEX[color] ?? '#475569' }}
                                                title={color}
                                            />
                                        )}
                                    </div>
                                </div>
                            </section>

                            {/* Schedule times */}
                            {scheduled && (
                                <section className="space-y-2">
                                    <label className="text-[11px] uppercase font-bold text-text-muted tracking-wider">
                                        Schedule times · {upload_times.length} per day
                                    </label>
                                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                        {upload_times.map((t, i) => (
                                            <div key={i} className="space-y-2">
                                                <p className="text-[11px] text-text-muted">{ordinal(i + 1)} upload time</p>
                                                <ThemedTimePicker
                                                    value={t}
                                                    onChange={(v) => set_upload_times(prev => prev.map((x, idx) => idx === i ? v : x))}
                                                />
                                            </div>
                                        ))}
                                    </div>
                                </section>
                            )}

                            <Input label="Title prefix (optional)" value={title_prefix} onChange={set_title_prefix} placeholder="e.g. [PREMIUM]" />

                            {/* Validation summary */}
                            {file_count > 0 && scheduled && (
                                <div className={`p-3 rounded-2xl border ${
                                    range_too_short
                                        ? 'bg-red-500/10 border-red-500/30 text-red-300'
                                        : 'bg-bg-surface border-border-subtle text-text-muted'
                                }`}>
                                    <p className="text-xs leading-relaxed">
                                        <span className="font-bold">{file_count}</span> file{file_count === 1 ? '' : 's'} ·
                                        {' '}<span className="font-bold">{release_count}</span> upload{release_count === 1 ? '' : 's'}/day ·
                                        {' '}<span className="font-bold">{required_days}</span> day{required_days === 1 ? '' : 's'} required
                                    </p>
                                    {range_too_short && (
                                        <p className="text-[11px] mt-1 flex items-start gap-1.5">
                                            <AlertTriangle size={12} className="mt-0.5 shrink-0" />
                                            Selected range is too short. {file_count} files with upload count {release_count} requires {required_days} day{required_days === 1 ? '' : 's'}.
                                        </p>
                                    )}
                                </div>
                            )}
                        </>
                    ) : (
                        <PreviewView preview={preview_items} warnings={preview_warnings} platforms={platforms} />
                    )}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between gap-3 p-5 border-t border-border-subtle">
                    <button
                        type="button"
                        onClick={stage === 'form' ? onClose : () => set_stage('form')}
                        disabled={saving || previewing}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl border border-border-subtle text-text-muted hover:text-text-main text-xs font-bold disabled:opacity-50"
                    >
                        <ArrowLeft size={14} />
                        {stage === 'form' ? 'Cancel' : 'Back'}
                    </button>
                    {stage === 'form' ? (
                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                onClick={go_save}
                                disabled={saving || range_too_short}
                                className="px-4 py-2 rounded-xl border border-border-subtle text-text-muted hover:text-text-main text-xs font-bold disabled:opacity-50"
                            >
                                {saving ? <Loader2 size={14} className="animate-spin inline" /> : <Save size={14} className="inline mr-1" />}
                                Save Changes
                            </button>
                            {scheduled && (
                                <button
                                    type="button"
                                    onClick={go_preview}
                                    disabled={previewing || range_too_short}
                                    className="btn-primary flex items-center gap-2 px-5 py-2 text-xs disabled:opacity-50"
                                >
                                    {previewing ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                                    Preview
                                </button>
                            )}
                        </div>
                    ) : (
                        <button
                            type="button"
                            onClick={go_save}
                            disabled={saving}
                            className="btn-primary flex items-center gap-2 px-5 py-2 text-xs"
                        >
                            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                            Save Schedule
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

const PreviewView: React.FC<{
    preview: SchedulePreviewItem[] | null;
    warnings: string[];
    platforms: SupportedPlatform[];
}> = ({ preview, warnings, platforms }) => {
    if (!preview) {
        return (
            <div className="p-8 text-center text-text-muted text-sm">
                <Loader2 className="inline animate-spin mr-2" size={14} /> Generating preview…
            </div>
        );
    }
    const scheduled_rows = preview.filter(r => r.scheduledAt);
    return (
        <div className="space-y-3">
            {warnings.length > 0 && (
                <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/30 space-y-1">
                    {warnings.map((w, i) => (
                        <p key={i} className="flex items-start gap-2 text-xs text-amber-300">
                            <AlertTriangle size={12} className="mt-0.5 shrink-0" /> {w}
                        </p>
                    ))}
                </div>
            )}
            <div className="overflow-x-auto rounded-2xl border border-border-subtle">
                {/* Auto-fit columns — table hugs its content, wrapper scrolls
                    horizontally when the row gets wider than the viewport. */}
                <table className="w-auto table-auto text-left text-xs whitespace-nowrap">
                    <thead>
                        <tr className="text-text-muted text-[10px] uppercase tracking-widest border-b border-border-subtle bg-bg-surface">
                            <th className="px-3 py-2 font-bold">Date</th>
                            <th className="px-3 py-2 font-bold">Time</th>
                            <th className="px-3 py-2 font-bold">File</th>
                            <th className="px-3 py-2 font-bold">Platform</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border-subtle">
                        {scheduled_rows.map((row, idx) => {
                            const dt = row.scheduledAt ? new Date(row.scheduledAt) : null;
                            return (
                                <tr key={idx} className="text-text-main">
                                    <td className="px-3 py-2 text-text-muted">{dt ? dt.toLocaleDateString() : '—'}</td>
                                    <td className="px-3 py-2 text-text-muted">{dt ? `${pad2(dt.getHours())}:${pad2(dt.getMinutes())}` : '—'}</td>
                                    <td className="px-3 py-2">{row.title || 'Upload'}</td>
                                    <td className="px-3 py-2 text-text-muted">{platforms.join(', ')}</td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default EditDraftModal;
