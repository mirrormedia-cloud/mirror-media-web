import React, { useEffect, useMemo, useState } from 'react';
import {
    X,
    Save,
    ArrowLeft,
    ArrowRight,
    Clapperboard,
    FileVideo,
    FileImage,
    Trash2,
    AlertTriangle,
    CalendarDays,
    Loader2,
    Plus,
    Minus,
    CheckCircle2,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { LibraryItem } from '../../../types';
import {
    calendar_service,
    ScheduleFrequency,
    SchedulePayload,
    SchedulePreviewResponse,
    SupportedPlatform,
} from '../../../services/calendar_service';
import { CommonSearchSelect, SearchSelectOption } from '../../../components/ui/CommonSearchSelect';
import { Input } from '../../../components/ui/Input';
import { ThemedDatePicker } from '../../../components/ui/ThemedDatePicker';
import { ThemedTimePicker } from '../../../components/ui/ThemedTimePicker';
import { ThemedColorPicker } from '../../../components/ui/ThemedColorPicker';
import {
    PLATFORM_OPTIONS,
    FREQUENCY_OPTIONS,
    COLOR_OPTIONS,
    WEEKDAY_OPTIONS,
    SWATCH_HEX,
} from './scheduleMeta';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    /** Library items the user selected before opening the wizard. */
    initial_items: LibraryItem[];
    ott_id: string;
    /** Called after a successful save so the parent can refresh / clear selection. */
    onSaved?: (batch_id: string) => void;
}

type Step = 1 | 2 | 3 | 4;

const STEPS: { n: Step; label: string }[] = [
    { n: 1, label: 'Files' },
    { n: 2, label: 'Platforms' },
    { n: 3, label: 'Settings' },
    { n: 4, label: 'Preview' },
];

function pad2(n: number) {
    return String(n).padStart(2, '0');
}

function date_input(d: Date): string {
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function format_iso_local(iso: string | null): string {
    if (!iso) return '—';
    const d = new Date(iso);
    return `${d.toLocaleDateString()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

const ScheduleUploadModal: React.FC<Props> = ({ isOpen, onClose, initial_items, ott_id, onSaved }) => {
    const [step, set_step] = useState<Step>(1);
    const [items, set_items] = useState<LibraryItem[]>([]);
    const [platforms, set_platforms] = useState<SupportedPlatform[]>([]);

    const [scheduled, set_scheduled] = useState(true);
    const [frequency, set_frequency] = useState<ScheduleFrequency>('every_day');
    const [release_count, set_release_count] = useState<number>(1);
    const [upload_times, set_upload_times] = useState<string[]>(['10:00']);
    const [start_date, set_start_date] = useState<string>(date_input(new Date()));
    const [end_date, set_end_date] = useState<string>('');
    const [weekdays, set_weekdays] = useState<number[]>([1, 3, 5]);
    const [month_days, set_month_days] = useState<number[]>([1]);
    const [color, set_color] = useState<string>('random');
    const [custom_color, set_custom_color] = useState<string>('#10B981');
    const [title_prefix, set_title_prefix] = useState<string>('');
    const [description, set_description] = useState<string>('');
    const [tags, set_tags] = useState<string>('');
    const [name, set_name] = useState<string>('');

    const [preview, set_preview] = useState<SchedulePreviewResponse | null>(null);
    const [previewing, set_previewing] = useState(false);
    const [saving, set_saving] = useState(false);

    // Reset wizard state every time it's opened with a fresh selection.
    useEffect(() => {
        if (!isOpen) return;
        set_step(1);
        set_items(initial_items);
        set_platforms([]);
        set_scheduled(true);
        set_frequency('every_day');
        set_release_count(1);
        set_upload_times(['10:00']);
        set_start_date(date_input(new Date()));
        set_end_date('');
        set_weekdays([1, 3, 5]);
        set_month_days([1]);
        set_color('random');
        set_custom_color('#10B981');
        set_title_prefix('');
        set_description('');
        set_tags('');
        set_name('');
        set_preview(null);
    }, [isOpen, initial_items]);

    // Keep upload_times length in sync with release_count.
    useEffect(() => {
        set_upload_times(prev => {
            const next = prev.slice(0, release_count);
            const default_times = ['10:00', '18:00', '14:00', '08:00', '20:00', '12:00'];
            while (next.length < release_count) {
                next.push(default_times[next.length] ?? `${pad2(8 + next.length)}:00`);
            }
            return next;
        });
    }, [release_count]);

    const platform_options = useMemo<SearchSelectOption[]>(
        () => PLATFORM_OPTIONS.map(p => ({ label: p.label, value: p.value })),
        [],
    );

    // Post-R2 readiness: a library row exists only when the R2 upload
    // finished, so file_url is the real signal. The pre-R2 status
    // column was dropped and would always be undefined here.
    const all_completed = items.every(i => !!i.file_url);
    const incomplete_count = items.filter(i => !i.file_url).length;

    if (!isOpen) return null;

    const remove_item = (id: string) => {
        set_items(prev => prev.filter(i => i.id !== id));
    };

    const select_all_platforms = () => {
        set_platforms(PLATFORM_OPTIONS.map(p => p.value));
    };

    const toggle_weekday = (wd: number) => {
        set_weekdays(prev => prev.includes(wd) ? prev.filter(x => x !== wd) : [...prev, wd].sort((a, b) => a - b));
    };
    const toggle_month_day = (d: number) => {
        set_month_days(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d].sort((a, b) => a - b));
    };

    const update_upload_time = (idx: number, val: string) => {
        set_upload_times(prev => prev.map((t, i) => i === idx ? val : t));
    };

    const validate_step = (target: Step): string | null => {
        if (target >= 1 && items.length === 0) return 'Select at least one file';
        if (target >= 1 && !all_completed) return `${incomplete_count} file${incomplete_count === 1 ? '' : 's'} have no R2 URL — re-upload or remove them`;
        if (target >= 2 && platforms.length === 0) return 'Select at least one platform';
        if (target >= 3 && scheduled) {
            if (!start_date) return 'Start date is required';
            if (!frequency) return 'Frequency is required';
            if (upload_times.some(t => !/^([01]\d|2[0-3]):([0-5]\d)$/.test(t))) return 'Upload times must be HH:MM (24h)';
            if (frequency === 'custom_range') {
                if (!end_date) return 'End date is required for Custom Range';
                if (end_date < start_date) return 'End date must be after Start date';
            }
            if (frequency === 'every_week' && weekdays.length === 0) return 'Pick at least one weekday';
            if (frequency === 'every_month' && month_days.length === 0) return 'Pick at least one day of month';
        }
        return null;
    };

    // Resolve color sentinel: 'custom' → custom_color hex, others as-is.
    const effective_color = color === 'custom' ? custom_color : color;

    const build_payload = (): SchedulePayload => ({
        ott_id,
        library_item_ids: items.map(i => i.id),
        scheduled,
        platforms,
        frequency: scheduled ? frequency : null,
        release_count,
        upload_times: scheduled ? upload_times : [],
        start_date: scheduled ? start_date : null,
        end_date: scheduled && (frequency === 'custom_range' || end_date) ? (end_date || null) : null,
        weekdays: scheduled && frequency === 'every_week' ? weekdays : [],
        month_days: scheduled && frequency === 'every_month' ? month_days : [],
        color: effective_color || null,
        title_prefix: title_prefix || null,
        description: description || null,
        tags: tags ? tags.split(',').map(t => t.trim()).filter(Boolean) : [],
        name: name || null,
    });

    const go_next = async () => {
        const err = validate_step(step);
        if (err) { toast.error(err); return; }
        if (step === 3) {
            // Pre-fetch preview before showing step 4.
            set_previewing(true);
            try {
                const res = await calendar_service.preview_upload_schedule(build_payload());
                if (!res.success || !res.data) throw new Error(res.message || 'Preview failed');
                set_preview(res.data);
                set_step(4);
            } catch (e: any) {
                toast.error(e?.message || 'Preview failed');
            } finally {
                set_previewing(false);
            }
            return;
        }
        set_step(s => Math.min(4, (s + 1) as Step));
    };

    const go_back = () => {
        set_step(s => Math.max(1, (s - 1) as Step));
    };

    const handle_save = async () => {
        const err = validate_step(3);
        if (err) { toast.error(err); return; }
        set_saving(true);
        try {
            const res = await calendar_service.create_upload_schedule(build_payload());
            if (!res.success || !res.data) throw new Error(res.message || 'Save failed');
            toast.success(`Schedule saved — ${res.data.scheduled_count} item(s) on the calendar`);
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
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => !saving && onClose()} />
            <div className="relative w-full max-w-3xl bg-bg-main border border-border-subtle rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 max-h-[92vh] flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between p-5 border-b border-border-subtle">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-brand-emerald/10 text-brand-emerald flex items-center justify-center">
                            <CalendarDays size={20} />
                        </div>
                        <div>
                            <h3 className="text-lg font-bold text-text-main">Schedule Upload</h3>
                            <p className="text-[10px] uppercase font-bold text-text-muted tracking-widest mt-0.5">
                                Step {step} of 4 · {STEPS[step - 1]?.label}
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        disabled={saving}
                        className="p-2 rounded-xl hover:bg-black/5 dark:hover:bg-white/5 text-text-muted transition-colors disabled:opacity-50"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Step indicator */}
                <div className="flex items-center px-5 pt-4 gap-2">
                    {STEPS.map((s, idx) => (
                        <React.Fragment key={s.n}>
                            <div className={`flex items-center gap-2 ${step >= s.n ? 'text-text-main' : 'text-text-muted'}`}>
                                <div className={`w-6 h-6 rounded-lg text-[11px] font-bold flex items-center justify-center ${
                                    step > s.n
                                        ? 'bg-brand-emerald text-white'
                                        : step === s.n
                                            ? 'bg-gradient-to-br from-brand-emerald to-brand-blue text-white'
                                            : 'bg-bg-surface border border-border-subtle text-text-muted'
                                }`}>
                                    {step > s.n ? <CheckCircle2 size={12} /> : s.n}
                                </div>
                                <span className="text-xs font-bold hidden sm:inline">{s.label}</span>
                            </div>
                            {idx < STEPS.length - 1 && (
                                <div className={`flex-1 h-px ${step > s.n ? 'bg-brand-emerald/40' : 'bg-border-subtle'}`} />
                            )}
                        </React.Fragment>
                    ))}
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto p-5 space-y-4">
                    {step === 1 && (
                        <Step1Files items={items} onRemove={remove_item} incomplete_count={incomplete_count} />
                    )}
                    {step === 2 && (
                        <Step2Platforms
                            platforms={platforms}
                            on_change={set_platforms}
                            on_select_all={select_all_platforms}
                            options={platform_options}
                        />
                    )}
                    {step === 3 && (
                        <Step3Settings
                            scheduled={scheduled}
                            on_scheduled={set_scheduled}
                            frequency={frequency}
                            on_frequency={set_frequency}
                            release_count={release_count}
                            on_release_count={set_release_count}
                            upload_times={upload_times}
                            on_update_upload_time={update_upload_time}
                            start_date={start_date}
                            on_start_date={set_start_date}
                            end_date={end_date}
                            on_end_date={set_end_date}
                            weekdays={weekdays}
                            on_toggle_weekday={toggle_weekday}
                            month_days={month_days}
                            on_toggle_month_day={toggle_month_day}
                            color={color}
                            on_color={set_color}
                            custom_color={custom_color}
                            on_custom_color={set_custom_color}
                            title_prefix={title_prefix}
                            on_title_prefix={set_title_prefix}
                            description={description}
                            on_description={set_description}
                            tags={tags}
                            on_tags={set_tags}
                            name={name}
                            on_name={set_name}
                        />
                    )}
                    {step === 4 && (
                        <Step4Preview preview={preview} platforms={platforms} />
                    )}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between gap-3 p-5 border-t border-border-subtle">
                    <button
                        type="button"
                        onClick={step === 1 ? onClose : go_back}
                        disabled={saving}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl border border-border-subtle text-text-muted hover:text-text-main text-xs font-bold disabled:opacity-50"
                    >
                        <ArrowLeft size={14} />
                        {step === 1 ? 'Cancel' : 'Back'}
                    </button>

                    {step < 4 ? (
                        <button
                            type="button"
                            onClick={go_next}
                            disabled={previewing}
                            className="btn-primary flex items-center gap-2 px-5 py-2 text-xs"
                        >
                            {previewing ? <Loader2 size={14} className="animate-spin" /> : <ArrowRight size={14} />}
                            Next
                        </button>
                    ) : (
                        <button
                            type="button"
                            onClick={handle_save}
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

// ── Step 1: Selected Files ──────────────────────────────────────────────
const Step1Files: React.FC<{ items: LibraryItem[]; onRemove: (id: string) => void; incomplete_count: number }> = ({
    items, onRemove, incomplete_count,
}) => (
    <div className="space-y-3">
        <div className="flex items-center justify-between">
            <h4 className="text-sm font-bold text-text-main">Selected Files ({items.length})</h4>
            {incomplete_count > 0 && (
                <span className="flex items-center gap-1.5 text-xs text-amber-400 bg-amber-500/10 px-2 py-1 rounded-lg">
                    <AlertTriangle size={12} />
                    {incomplete_count} missing file_url — remove or re-upload
                </span>
            )}
        </div>
        {items.length === 0 ? (
            <div className="p-8 text-center text-text-muted text-sm rounded-2xl border border-dashed border-border-subtle">
                Nothing selected. Close and pick files from the library.
            </div>
        ) : (
            <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                {items.map(item => {
                    const is_video = !!item.local_video_path || (item.save_type ?? '').toLowerCase() === 'video';
                    const Icon = is_video ? FileVideo : FileImage;
                    const not_ready = !item.file_url;
                    return (
                        <div
                            key={item.id}
                            className={`flex items-center gap-3 p-3 rounded-2xl border ${not_ready ? 'border-amber-500/30 bg-amber-500/5' : 'border-border-subtle bg-bg-surface'}`}
                        >
                            <div className="w-10 h-10 rounded-lg bg-black/20 flex items-center justify-center text-text-muted shrink-0 overflow-hidden">
                                {item.local_thumbnail_url || item.local_image_url ? (
                                    <img
                                        src={item.local_thumbnail_url || item.local_image_url || ''}
                                        alt=""
                                        className="w-full h-full object-cover"
                                    />
                                ) : (
                                    <Icon size={18} />
                                )}
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold text-text-main truncate">{item.title || item.file_name || 'Untitled'}</p>
                                <p className="text-[11px] text-text-muted truncate">
                                    {(item.save_type || 'file').toUpperCase()} · {item.status}
                                    {item.parent_title ? ` · ${item.parent_title}` : ''}
                                </p>
                            </div>
                            <button
                                onClick={() => onRemove(item.id)}
                                className="p-2 rounded-xl text-text-muted hover:text-red-400 hover:bg-red-500/10 shrink-0"
                                title="Remove from selection"
                            >
                                <Trash2 size={14} />
                            </button>
                        </div>
                    );
                })}
            </div>
        )}
    </div>
);

// ── Step 2: Platforms ───────────────────────────────────────────────────
const Step2Platforms: React.FC<{
    platforms: SupportedPlatform[];
    on_change: (next: SupportedPlatform[]) => void;
    on_select_all: () => void;
    options: SearchSelectOption[];
}> = ({ platforms, on_change, on_select_all, options }) => (
    <div className="space-y-4">
        <div className="flex items-center justify-between">
            <h4 className="text-sm font-bold text-text-main">Pick Upload Platforms</h4>
            <button
                onClick={on_select_all}
                className="px-3 py-1.5 rounded-xl text-[11px] font-bold text-brand-emerald hover:bg-brand-emerald/10 border border-brand-emerald/30"
            >
                Select all
            </button>
        </div>
        <CommonSearchSelect
            is_multi
            options={options}
            value={platforms as string[]}
            on_change={(v) => on_change((v as string[]).filter(x => x === 'facebook' || x === 'youtube' || x === 'instagram') as SupportedPlatform[])}
            placeholder="Pick platforms…"
        />
        <div className="grid grid-cols-3 gap-2">
            {PLATFORM_OPTIONS.map(p => {
                const sel = platforms.includes(p.value);
                return (
                    <button
                        key={p.value}
                        onClick={() => on_change(sel ? platforms.filter(x => x !== p.value) : [...platforms, p.value])}
                        className={`p-3 rounded-2xl border text-xs font-bold transition-colors ${
                            sel
                                ? 'border-brand-emerald/60 bg-brand-emerald/10 text-brand-emerald'
                                : 'border-border-subtle text-text-muted hover:text-text-main hover:border-text-muted/30'
                        }`}
                    >
                        {p.label}
                    </button>
                );
            })}
        </div>
        <p className="text-[11px] text-text-muted">
            Scenario 2 (auto-upload cron) is not enabled yet — selected platforms are stored on the schedule for future use.
        </p>
    </div>
);

// ── Step 3: Settings ────────────────────────────────────────────────────
interface Step3Props {
    scheduled: boolean;
    on_scheduled: (v: boolean) => void;
    frequency: ScheduleFrequency;
    on_frequency: (v: ScheduleFrequency) => void;
    release_count: number;
    on_release_count: (v: number) => void;
    upload_times: string[];
    on_update_upload_time: (idx: number, v: string) => void;
    start_date: string;
    on_start_date: (v: string) => void;
    end_date: string;
    on_end_date: (v: string) => void;
    weekdays: number[];
    on_toggle_weekday: (wd: number) => void;
    month_days: number[];
    on_toggle_month_day: (d: number) => void;
    color: string;
    on_color: (v: string) => void;
    custom_color: string;
    on_custom_color: (v: string) => void;
    title_prefix: string;
    on_title_prefix: (v: string) => void;
    description: string;
    on_description: (v: string) => void;
    tags: string;
    on_tags: (v: string) => void;
    name: string;
    on_name: (v: string) => void;
}

function ordinal(n: number): string {
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

const Step3Settings: React.FC<Step3Props> = (p) => (
    <div className="space-y-4">
        <Input label="Schedule Name (optional)" value={p.name} onChange={p.on_name} placeholder="e.g. May releases — Series A" />

        <label className="flex items-center gap-2 ml-1 cursor-pointer select-none">
            <input type="checkbox" checked={p.scheduled} onChange={(e) => p.on_scheduled(e.target.checked)} />
            <span className="text-sm text-text-main font-medium">Schedule upload</span>
            <span className="text-[11px] text-text-muted">— off = save as draft</span>
        </label>

        {p.scheduled && (
            <>
                {/* Knobs row — Frequency / Release count / Color (with swatch) */}
                <section className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="space-y-2">
                        <label className="text-[11px] uppercase font-bold text-text-muted tracking-wider">Frequency</label>
                        <CommonSearchSelect
                            options={FREQUENCY_OPTIONS}
                            value={p.frequency}
                            on_change={(v) => p.on_frequency((v || 'every_day') as ScheduleFrequency)}
                        />
                    </div>
                    <div className="space-y-2">
                        <label className="text-[11px] uppercase font-bold text-text-muted tracking-wider">Upload count / day</label>
                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                onClick={() => p.on_release_count(Math.max(1, p.release_count - 1))}
                                className="p-2 rounded-xl border border-border-subtle text-text-muted hover:text-text-main"
                            >
                                <Minus size={14} />
                            </button>
                            <input
                                type="number"
                                min={1}
                                max={20}
                                value={p.release_count}
                                onChange={(e) => p.on_release_count(Math.max(1, parseInt(e.target.value || '1', 10)))}
                                className="input-field text-center flex-1 min-w-0"
                            />
                            <button
                                type="button"
                                onClick={() => p.on_release_count(Math.min(20, p.release_count + 1))}
                                className="p-2 rounded-xl border border-border-subtle text-text-muted hover:text-text-main"
                            >
                                <Plus size={14} />
                            </button>
                        </div>
                    </div>
                    <div className="space-y-2">
                        <label className="text-[11px] uppercase font-bold text-text-muted tracking-wider">Calendar color</label>
                        <div className="flex items-center gap-2">
                            <div className="flex-1 min-w-0">
                                <CommonSearchSelect
                                    options={COLOR_OPTIONS}
                                    value={p.color}
                                    on_change={(v) => p.on_color(v || 'random')}
                                />
                            </div>
                            {p.color === 'custom' ? (
                                <ThemedColorPicker value={p.custom_color} onChange={p.on_custom_color} />
                            ) : p.color === 'random' ? (
                                <div
                                    className="h-9 w-9 rounded-xl border border-border-subtle shrink-0 bg-gradient-to-br from-brand-emerald via-purple-500 to-brand-blue"
                                    title="A different color per upload, picked deterministically"
                                />
                            ) : (
                                <div
                                    className="h-9 w-9 rounded-xl border border-border-subtle shrink-0"
                                    style={{ backgroundColor: SWATCH_HEX[p.color] ?? '#475569' }}
                                    title={p.color}
                                />
                            )}
                        </div>
                    </div>
                </section>

                {/* Schedule times — dynamic, one per release */}
                <section className="space-y-2">
                    <label className="text-[11px] uppercase font-bold text-text-muted tracking-wider">
                        Schedule times · {p.upload_times.length} per day
                    </label>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {p.upload_times.map((t, i) => (
                            <div key={i} className="space-y-2">
                                <p className="text-[11px] text-text-muted">{ordinal(i + 1)} upload time</p>
                                <ThemedTimePicker
                                    value={t}
                                    onChange={(v) => p.on_update_upload_time(i, v)}
                                />
                            </div>
                        ))}
                    </div>
                </section>

                {/* Date window */}
                <section className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="space-y-2">
                        <label className="text-[11px] uppercase font-bold text-text-muted tracking-wider">Start date</label>
                        <ThemedDatePicker value={p.start_date} onChange={p.on_start_date} placeholder="DD-MM-YYYY" />
                    </div>
                    <div className="space-y-2">
                        <label className="text-[11px] uppercase font-bold text-text-muted tracking-wider">
                            End date
                            {p.frequency !== 'custom_range' && (
                                <span className="ml-2 text-text-muted/60 normal-case font-normal">· optional</span>
                            )}
                        </label>
                        <ThemedDatePicker value={p.end_date} onChange={p.on_end_date} min={p.start_date || undefined} placeholder="DD-MM-YYYY" />
                    </div>
                </section>

                {p.frequency === 'every_week' && (
                    <div className="space-y-2">
                        <label className="text-[11px] uppercase font-bold text-text-muted tracking-wider">Weekdays</label>
                        <div className="flex flex-wrap gap-2">
                            {WEEKDAY_OPTIONS.map(wd => {
                                const sel = p.weekdays.includes(wd.value);
                                return (
                                    <button
                                        key={wd.value}
                                        type="button"
                                        onClick={() => p.on_toggle_weekday(wd.value)}
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

                {p.frequency === 'every_month' && (
                    <div className="space-y-2">
                        <label className="text-[11px] uppercase font-bold text-text-muted tracking-wider">Days of month</label>
                        <div className="grid grid-cols-7 sm:grid-cols-10 gap-1">
                            {Array.from({ length: 31 }, (_, i) => i + 1).map(d => {
                                const sel = p.month_days.includes(d);
                                return (
                                    <button
                                        key={d}
                                        type="button"
                                        onClick={() => p.on_toggle_month_day(d)}
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
            </>
        )}

        <Input label="Title prefix (optional)" value={p.title_prefix} onChange={p.on_title_prefix} placeholder="e.g. [PREMIUM]" />
    </div>
);

// ── Step 4: Preview ─────────────────────────────────────────────────────
const Step4Preview: React.FC<{ preview: SchedulePreviewResponse | null; platforms: SupportedPlatform[] }> = ({ preview, platforms }) => {
    if (!preview) {
        return (
            <div className="p-8 text-center text-text-muted text-sm">
                <Loader2 className="inline animate-spin mr-2" size={14} /> Generating preview…
            </div>
        );
    }
    return (
        <div className="space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <PreviewStat label="Files" value={preview.total_files} />
                <PreviewStat label="Slots" value={preview.total_slots} />
                <PreviewStat label="Scheduled" value={preview.scheduled_count} accent="emerald" />
                <PreviewStat label="Unscheduled" value={preview.unscheduled_count} accent={preview.unscheduled_count > 0 ? 'amber' : undefined} />
            </div>
            {preview.warnings.length > 0 && (
                <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/30 space-y-1">
                    {preview.warnings.map((w, i) => (
                        <p key={i} className="flex items-start gap-2 text-xs text-amber-300">
                            <AlertTriangle size={12} className="mt-0.5 shrink-0" />
                            {w}
                        </p>
                    ))}
                </div>
            )}
            <div className="space-y-1.5 max-h-80 overflow-y-auto pr-1">
                {preview.items.map((row, idx) => (
                    <div key={idx} className="flex items-center gap-3 p-2.5 rounded-xl bg-bg-surface border border-border-subtle">
                        <div className="w-9 h-9 rounded-lg bg-brand-blue/10 text-brand-blue flex items-center justify-center shrink-0">
                            <Clapperboard size={14} />
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-text-main truncate">{row.title || 'Upload'}</p>
                            <p className="text-[11px] text-text-muted">
                                {format_iso_local(row.scheduledAt)} · {platforms.join(', ')}
                            </p>
                        </div>
                        {!row.scheduledAt && (
                            <span className="text-[10px] uppercase font-bold text-amber-400 bg-amber-500/10 px-2 py-1 rounded-lg">
                                Draft
                            </span>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
};

const PreviewStat: React.FC<{ label: string; value: number; accent?: 'emerald' | 'amber' }> = ({ label, value, accent }) => {
    const tone = accent === 'emerald'
        ? 'text-brand-emerald'
        : accent === 'amber'
            ? 'text-amber-400'
            : 'text-text-main';
    return (
        <div className="p-3 rounded-2xl bg-bg-surface border border-border-subtle">
            <p className="text-[10px] uppercase font-bold text-text-muted tracking-widest">{label}</p>
            <p className={`text-xl font-bold mt-0.5 ${tone}`}>{value}</p>
        </div>
    );
};

export default ScheduleUploadModal;
