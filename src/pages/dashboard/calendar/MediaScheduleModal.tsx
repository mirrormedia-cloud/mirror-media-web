import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    X,
    Save,
    ArrowLeft,
    Loader2,
    AlertTriangle,
    FileVideo,
    FileImage,
    FileMusic,
    File as FileIcon,
    Clapperboard,
    CheckCircle2,
    Plus,
    Minus,
    Tv,
    UploadCloud,
    FolderOpen,
    Info,
    Trash2,
    ChevronRight,
    GripVertical,
    Pipette,
    Shuffle,
} from 'lucide-react';
import toast from 'react-hot-toast';
import {
    calendar_service,
    SchedulePayload,
    SchedulePreviewItem,
    ScheduleFrequency,
    SupportedPlatform,
} from '../../../services/calendar_service';
import { ott_service } from '../../../services/ott_service';
import { local_uploads_service } from '../../../services/local_uploads_service';
import { CommonSearchSelect, SearchSelectOption } from '../../../components/ui/CommonSearchSelect';
import { ThemedDatePicker } from '../../../components/ui/ThemedDatePicker';
import { ThemedTimePicker } from '../../../components/ui/ThemedTimePicker';
import { LibraryItem } from '../../../types';
import LibraryBrowserPicker from './LibraryBrowserPicker';
import { FREQUENCY_OPTIONS, WEEKDAY_OPTIONS } from '../schedules/scheduleMeta';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    onSaved?: () => void;
}

type PlatformChoice = 'youtube' | 'facebook' | 'instagram' | 'all';

const PLATFORM_OPTIONS: SearchSelectOption[] = [
    { label: 'All', value: 'all' },
    { label: 'YouTube', value: 'youtube' },
    { label: 'Facebook', value: 'facebook' },
    { label: 'Instagram', value: 'instagram' },
];

function handle_platform_multi_change(
    prev: PlatformChoice[],
    next: string[],
): PlatformChoice[] {
    if (next.length === 0) return ['all'];
    const had_all = prev.includes('all');
    const has_all = next.includes('all');
    // User clicked "All" — collapse to just "all"
    if (!had_all && has_all) return ['all'];
    // "All" was selected and user picked a specific platform — drop "all"
    if (had_all && has_all && next.length > 1) return next.filter(v => v !== 'all') as PlatformChoice[];
    return next as PlatformChoice[];
}

const COLOR_OPTIONS: SearchSelectOption[] = [
    { label: 'Random', value: 'random' },
    { label: 'Custom…', value: 'custom' },
    { label: 'Blue', value: 'blue' },
    { label: 'Green', value: 'green' },
    { label: 'Purple', value: 'purple' },
    { label: 'Orange', value: 'orange' },
    { label: 'Red', value: 'red' },
    { label: 'Pink', value: 'pink' },
    { label: 'Cyan', value: 'cyan' },
    { label: 'Gray', value: 'gray' },
];

/** Swatch hex for the named picker options (preview chip beside the
 *  dropdown). Mirrors the borders used in eventTypeMeta.COLOR_HEX. */
const SWATCH_HEX: Record<string, string> = {
    blue: '#3B82F6',
    green: '#10B981',
    purple: '#A855F7',
    orange: '#F97316',
    red: '#EF4444',
    pink: '#EC4899',
    cyan: '#06B6D4',
    gray: '#64748B',
};

function pad2(n: number) { return String(n).padStart(2, '0'); }

// Convert "HH:MM" in the browser's local timezone to "HH:MM" in UTC for storage.
function local_hhmm_to_utc(hhmm: string): string {
    const [h, m] = hhmm.split(':').map(Number);
    const ref = new Date(2000, 0, 1, h!, m!, 0, 0);
    return `${pad2(ref.getUTCHours())}:${pad2(ref.getUTCMinutes())}`;
}

/** "HH:MM" for right now (24-hour clock). Default for the time picker so
 *  the first slot is the current moment, not a hard-coded 10:00. */
function current_time_hhmm(): string {
    const d = new Date();
    return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function date_input(d: Date): string {
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
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
    const ms = b.getTime() - a.getTime();
    return Math.floor(ms / 86_400_000) + 1;
}

function expand_platform(p: PlatformChoice[]): SupportedPlatform[] {
    if (p.includes('all')) return ['youtube', 'facebook', 'instagram'];
    return p as SupportedPlatform[];
}

const MediaScheduleModal: React.FC<Props> = ({ isOpen, onClose, onSaved }) => {
    // ── Selection state ─────────────────────────────────────────────────
    const [library_files, set_library_files] = useState<LibraryItem[]>([]);
    const [local_files, set_local_files] = useState<File[]>([]);
    // Drag-reorder state — drag_id is the file currently being dragged,
    // hover_id is the row the cursor is over (drop target). On drop we
    // splice drag_id into the position of hover_id.
    const [drag_id, set_drag_id] = useState<string | null>(null);
    const [hover_id, set_hover_id] = useState<string | null>(null);

    const reorder_library_file = useCallback((from_id: string, to_id: string) => {
        if (from_id === to_id) return;
        set_library_files(prev => {
            const from = prev.findIndex(f => f.id === from_id);
            const to = prev.findIndex(f => f.id === to_id);
            if (from < 0 || to < 0) return prev;
            const next = prev.slice();
            const [moved] = next.splice(from, 1);
            if (moved) next.splice(to, 0, moved);
            return next;
        });
    }, []);
    const [picker_open, set_picker_open] = useState(false);
    const local_input_ref = useRef<HTMLInputElement | null>(null);
    const [list_expanded, set_list_expanded] = useState(false);

    // ── Form fields ─────────────────────────────────────────────────────
    const [frequency, set_frequency] = useState<ScheduleFrequency>('every_day');
    const [weekdays, set_weekdays] = useState<number[]>([1, 3, 5]);
    const [month_days, set_month_days] = useState<number[]>([1]);
    const [upload_count, set_upload_count] = useState(1);
    const [start_date, set_start_date] = useState(date_input(new Date()));
    const [end_date, set_end_date] = useState('');
    const [platform_choice, set_platform_choice] = useState<PlatformChoice[]>(['all']);
    const [color, set_color] = useState('random');
    const [custom_color, set_custom_color] = useState('#10B981');
    // Default to "now" — picker offers every-minute resolution, so the
    // first row reflects the moment the user opened the modal.
    const [upload_times, set_upload_times] = useState<string[]>([current_time_hhmm()]);

    // ── Upload-all-at-once mode ─────────────────────────────────────────
    const [upload_all_at_once, set_upload_all_at_once] = useState(false);

    // ── Flow state ──────────────────────────────────────────────────────
    const [stage, set_stage] = useState<'form' | 'preview'>('form');
    // Auto Details — when on, missing per-platform fields are filled by
    // a Gemini analysis at fire time (cron). Manual values below win.
    const [auto_details, set_auto_details] = useState(false);
    const [manual_title, set_manual_title] = useState('');
    const [manual_description, set_manual_description] = useState('');
    const [manual_caption, set_manual_caption] = useState('');
    const [manual_tags_csv, set_manual_tags_csv] = useState('');
    const [manual_hashtags_csv, set_manual_hashtags_csv] = useState('');
    const [preview_items, set_preview_items] = useState<SchedulePreviewItem[] | null>(null);
    const [preview_warnings, set_preview_warnings] = useState<string[]>([]);
    const [previewing, set_previewing] = useState(false);
    const [saving, set_saving] = useState(false);

    // Reset on open.
    useEffect(() => {
        if (!isOpen) return;
        set_library_files([]);
        set_local_files([]);
        set_frequency('every_day');
        set_weekdays([1, 3, 5]);
        set_month_days([1]);
        set_upload_count(1);
        set_start_date(date_input(new Date()));
        set_end_date('');
        set_platform_choice(['all']);
        set_color('random');
        set_custom_color('#10B981');
        set_upload_times([current_time_hhmm()]);
        set_upload_all_at_once(false);
        set_stage('form');
        set_preview_items(null);
        set_preview_warnings([]);
        set_list_expanded(false);
        set_auto_details(false);
        set_manual_title('');
        set_manual_description('');
        set_manual_caption('');
        set_manual_tags_csv('');
        set_manual_hashtags_csv('');
    }, [isOpen]);

    // Keep upload_times length in sync with upload_count.
    useEffect(() => {
        set_upload_times(prev => {
            const next = prev.slice(0, upload_count);
            // Newly-added slots default to the current time so the user
            // gets a sensible "now" anchor; they can re-pick per row.
            while (next.length < upload_count) {
                next.push(current_time_hhmm());
            }
            return next;
        });
    }, [upload_count]);

    // ── Derived ─────────────────────────────────────────────────────────
    const locked_ott_id = library_files[0]?.ott_id ?? null;
    const file_count = library_files.length;          // already in library
    const total_picked = file_count + local_files.length;
    // Schedule math uses the total count — local files turn into library
    // items at preview/save time so they count too.
    const required_days = upload_count > 0 ? Math.ceil(total_picked / upload_count) : 0;
    // Only custom_range exposes manual date pickers; every_day / every_week /
    // every_month all auto-anchor on today and run forward.
    const is_custom_range = frequency === 'custom_range';
    const selected_range_days = is_custom_range && start_date && end_date
        ? days_between_inclusive(start_date, end_date)
        : 0;
    const range_too_short = !upload_all_at_once && is_custom_range && total_picked > 0 && selected_range_days > 0 && selected_range_days < required_days;
    const range_too_long = !upload_all_at_once && is_custom_range && total_picked > 0 && selected_range_days > required_days;

    // Source folder, recorded into batch metadata so the schedules detail
    // page can show "Story Folder: …". When picks span multiple folders we
    // tag it as "Mixed" rather than guess.
    const source_folder = useMemo(() => {
        if (library_files.length === 0) return null;
        const keys = new Set(library_files.map(f => f.parent_item_key ?? '__ungrouped__'));
        if (keys.size === 1) {
            const sample = library_files[0];
            return {
                parent_item_key: sample?.parent_item_key ?? null,
                parent_api_id: sample?.parent_api_id ?? null,
                parent_title: sample?.parent_title ?? null,
                multiple: false,
            };
        }
        return { parent_item_key: null, parent_api_id: null, parent_title: 'Mixed folders', multiple: true };
    }, [library_files]);

    // The exact end date that fits file_count / upload_count starting from
    // start_date. Pinning end_date to this value means the user never has
    // to do the math themselves, and we lock the end-date picker to this
    // one value (`min === max`) so extra / short days can't be picked.
    const required_end_date = useMemo(() => {
        if (!is_custom_range || !start_date || required_days <= 0) return '';
        return add_days(start_date, required_days - 1);
    }, [is_custom_range, start_date, required_days]);

    // Keep end_date pinned whenever the required end date changes (start
    // moved, files added/removed, upload_count changed).
    useEffect(() => {
        if (!is_custom_range) {
            if (end_date) set_end_date('');
            return;
        }
        if (required_end_date && end_date !== required_end_date) {
            set_end_date(required_end_date);
        }
    }, [is_custom_range, required_end_date, end_date]);

    if (!isOpen) return null;

    // ── Handlers ────────────────────────────────────────────────────────
    const handle_library_picked = (items: LibraryItem[], _ott_id: string) => {
        // Merge with existing — same OTT only (the picker already enforces
        // this via locked_ott_id, but defensive de-dupe by id).
        set_library_files(prev => {
            const by_id = new Map(prev.map(p => [p.id, p] as const));
            for (const it of items) by_id.set(it.id, it);
            return Array.from(by_id.values());
        });
        set_picker_open(false);
    };

    const remove_library_file = (id: string) => {
        set_library_files(prev => prev.filter(f => f.id !== id));
    };
    const remove_local_file = (idx: number) => {
        set_local_files(prev => prev.filter((_, i) => i !== idx));
    };

    const handle_local_pick = () => {
        local_input_ref.current?.click();
    };

    const on_local_files_changed = (e: React.ChangeEvent<HTMLInputElement>) => {
        const list = e.target.files;
        if (!list || list.length === 0) return;
        const picked: File[] = [];
        for (let i = 0; i < list.length; i += 1) picked.push(list[i] as File);
        set_local_files(prev => [...prev, ...picked]);
        // Reset value so picking the same file again still triggers onChange.
        e.target.value = '';
    };

    const validate = (): string | null => {
        if (file_count === 0 && local_files.length === 0) {
            return 'Pick at least one file (Library or PC)';
        }
        if (upload_all_at_once) {
            const t = upload_times[0] ?? '';
            if (!/^([01]\d|2[0-3]):([0-5]\d)$/.test(t)) return 'Upload time must be HH:MM (24h)';
            return null;
        }
        if (upload_count < 1) return 'Upload count must be at least 1';
        if (upload_times.some(t => !/^([01]\d|2[0-3]):([0-5]\d)$/.test(t))) return 'Upload times must be HH:MM (24h)';
        if (frequency === 'every_week' && weekdays.length === 0) {
            return 'Pick at least one weekday';
        }
        if (frequency === 'every_month' && month_days.length === 0) {
            return 'Pick at least one day of month';
        }
        if (is_custom_range) {
            if (!start_date) return 'Start date is required';
            if (!end_date) return 'End date is required';
            if (end_date < start_date) return 'End date must be on or after start date';
            if (selected_range_days < required_days) {
                return `Selected range is too short. ${total_picked} files with upload count ${upload_count} requires ${required_days} day${required_days === 1 ? '' : 's'}.`;
            }
        }
        return null;
    };

    // Color sent to backend: 'random' / hex (when Custom selected) / named.
    const effective_color = color === 'custom' ? custom_color : color;

    /**
     * Upload any pending local files via the R2 signed-URL flow and
     * merge them into `library_files`. Returns true on success (or when
     * there's nothing to upload). Blocks the action on failure.
     *
     * Pipeline:
     *   1. Resolve the per-user Local Uploads OTT id (`init`).
     *   2. List its root folders and pick the protected "media" default
     *      folder (auto-created by the backend on first list when no
     *      folders exist) — this is where every local upload lives.
     *   3. If the user's selection has a source-folder title, find-or-
     *      create a subfolder under "media" with that name so files for
     *      different sources stay organised ("store this folder wise").
     *   4. Hand the batch to `local_uploads_service.upload_files`, which
     *      runs signed PUT → R2 → complete-upload per file and returns
     *      ready-to-use library rows.
     *
     * The previous multipart endpoint `/api/library/upload_local_files`
     * was removed during the R2 migration — this replaces it.
     */
    const upload_pending_local_files = async (): Promise<boolean> => {
        if (local_files.length === 0) return true;
        try {
            // 1. Local Uploads OTT id.
            const init = await local_uploads_service.init();
            if (!init.success || !init.data?.ott_id) {
                throw new Error(init.message || 'Could not resolve Local Uploads OTT');
            }
            const local_ott_id = init.data.ott_id;

            // 2. Default "media" folder. Backend auto-creates it on the
            //    first list when root is empty + flagged `is_default`.
            const folders_res = await local_uploads_service.list_folders(local_ott_id, null);
            if (!folders_res.success || !folders_res.data) {
                throw new Error(folders_res.message || 'Could not list Local Uploads folders');
            }
            const default_folder = folders_res.data.folders.find(f => f.is_default === true)
                ?? folders_res.data.folders[0];
            if (!default_folder || !default_folder.parent_item_key) {
                throw new Error('Default folder not available — open Library → Local Uploads once to bootstrap it');
            }
            let target_key: string = default_folder.parent_item_key;
            let target_title: string = default_folder.title;

            // 3. Subfolder is ALWAYS created under "media" so a flat
            //    dump of files into the default folder never happens —
            //    every upload is organised under a labelled subfolder.
            //
            //    Naming order of preference:
            //      a. source folder title (picker pinned files from a
            //         specific story folder → use that name).
            //      b. timestamp fallback "Schedule YYYY-MM-DD HH:MM"
            //         so a folder always exists when there's no source
            //         folder context (raw local-PC drops).
            const fallback_schedule_name = (() => {
                const d = new Date();
                const pad = (n: number) => String(n).padStart(2, '0');
                return `Schedule ${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
            })();
            const sub_name = source_folder?.parent_title?.trim()
                || fallback_schedule_name;

            const subs = await local_uploads_service.list_folders(local_ott_id, target_key);
            if (!subs.success || !subs.data) {
                throw new Error(subs.message || 'Could not list "media" subfolders');
            }
            const existing = subs.data.folders.find(
                f => (f.title ?? '').trim().toLowerCase() === sub_name.toLowerCase(),
            );
            if (existing && existing.parent_item_key) {
                target_key = existing.parent_item_key;
                target_title = existing.title;
            } else {
                const created = await local_uploads_service.create_folder(
                    local_ott_id, sub_name, target_key,
                );
                if (!created.success || !created.data) {
                    throw new Error(created.message || `Could not create subfolder "${sub_name}"`);
                }
                target_key = created.data.parent_item_key;
                target_title = created.data.parent_title;
            }

            // 4. Stream each file to R2 via signed URL → create library row.
            const res = await local_uploads_service.upload_files({
                ott_id: local_ott_id,
                files: local_files,
                parent_item_key: target_key,
                parent_title: target_title,
            });
            if (!res.success || !res.data) throw new Error(res.message || 'Upload failed');
            const uploaded = res.data.items;
            if (uploaded.length === 0) throw new Error('No files were saved');

            set_library_files(prev => {
                const by_id = new Map(prev.map(p => [p.id, p] as const));
                for (const it of uploaded) by_id.set(it.id, it);
                return Array.from(by_id.values());
            });
            set_local_files([]);
            toast.success(`Uploaded ${uploaded.length} file${uploaded.length === 1 ? '' : 's'} → ${target_title}`);
            return true;
        } catch (err: any) {
            toast.error(err?.message || 'Upload failed');
            return false;
        }
    };

    const build_payload = (): SchedulePayload | null => {
        if (!locked_ott_id) return null;
        const platforms = expand_platform(platform_choice);

        let eff_frequency: ScheduleFrequency;
        let eff_release_count: number;
        let eff_upload_times: string[];
        let eff_start_date: string;
        let eff_end_date: string | null;
        let eff_weekdays: number[];
        let eff_month_days: number[];

        if (upload_all_at_once) {
            const single_time = upload_times[0] || current_time_hhmm();
            const n = Math.max(1, total_picked);
            eff_frequency = 'every_day';
            eff_release_count = n;
            eff_upload_times = Array.from({ length: n }, () => local_hhmm_to_utc(single_time));
            eff_start_date = start_date || date_input(new Date());
            eff_end_date = eff_start_date;
            eff_weekdays = [];
            eff_month_days = [];
        } else {
            const effective_start = is_custom_range ? start_date : date_input(new Date());
            eff_frequency = frequency;
            eff_release_count = upload_count;
            eff_upload_times = upload_times.map(local_hhmm_to_utc);
            eff_start_date = effective_start;
            eff_end_date = effective_start && required_days > 0
                ? add_days(effective_start, required_days - 1)
                : null;
            eff_weekdays = frequency === 'every_week' ? weekdays : [];
            eff_month_days = frequency === 'every_month' ? month_days : [];
        }

        return {
            ott_id: locked_ott_id,
            library_item_ids: library_files.map(f => f.id),
            scheduled: true,
            platforms,
            frequency: eff_frequency,
            release_count: eff_release_count,
            upload_times: eff_upload_times,
            start_date: eff_start_date,
            end_date: eff_end_date,
            weekdays: eff_weekdays,
            month_days: eff_month_days,
            color: effective_color,
            name: source_folder?.parent_title
                ? `Media: ${source_folder.parent_title}`
                : null,
            description: 'Generated from Calendar → Media',
            metadata: {
                source: 'media_modal',
                parent_item_key: source_folder?.parent_item_key ?? null,
                parent_api_id: source_folder?.parent_api_id ?? null,
                parent_title: source_folder?.parent_title ?? null,
                file_count,
                required_days,
                upload_all_at_once,
                local_files_skipped: local_files.length,
            },
            auto_details,
            manual_details: (auto_details || manual_title.trim()) ? {
                ...(manual_title.trim() ? { title: manual_title.trim() } : {}),
                ...(auto_details && manual_description.trim() ? { description: manual_description.trim() } : {}),
                ...(auto_details && manual_caption.trim() ? { caption: manual_caption.trim() } : {}),
                ...(auto_details && manual_tags_csv.trim() ? { tags: manual_tags_csv.split(',').map(t => t.trim()).filter(Boolean) } : {}),
                ...(auto_details && manual_hashtags_csv.trim() ? { hashtags: manual_hashtags_csv.split(',').map(t => t.trim()).filter(Boolean) } : {}),
            } : undefined,
        };
    };

    const go_preview = async () => {
        const err = validate();
        if (err) { toast.error(err); return; }
        set_previewing(true);
        try {
            // Upload local files first so they have library_item_ids and
            // join the regular schedule flow.
            const ok = await upload_pending_local_files();
            if (!ok) return;
            const payload = build_payload();
            if (!payload) return;
            const res = await calendar_service.preview_upload_schedule(payload);
            if (!res.success || !res.data) throw new Error(res.message || 'Preview failed');
            set_preview_items(res.data.items);
            const warnings = [...(res.data.warnings ?? [])];
            if (range_too_long) {
                const extra = selected_range_days - required_days;
                warnings.push(`Selected range has ${extra} extra day${extra === 1 ? '' : 's'}. Schedule will use only the first ${required_days}.`);
            }
            set_preview_warnings(warnings);
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
        set_saving(true);
        try {
            const ok = await upload_pending_local_files();
            if (!ok) return;
            const payload = build_payload();
            if (!payload) return;
            const res = await calendar_service.create_upload_schedule(payload);
            if (!res.success || !res.data) throw new Error(res.message || 'Save failed');
            toast.success(`Saved — ${res.data.scheduled_count} item(s) on the calendar`);
            for (const w of res.data.warnings ?? []) toast(w, { icon: '⚠️' });
            onSaved?.();
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
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-brand-blue/10 text-brand-blue flex items-center justify-center">
                            <Tv size={20} />
                        </div>
                        <div>
                            <h3 className="text-lg font-bold text-text-main">Schedule Media Upload</h3>
                            <p className="text-[10px] uppercase font-bold text-text-muted tracking-widest mt-0.5">
                                {stage === 'form' ? 'Pick files and upload rules' : 'Review the generated schedule'}
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
                            {/* Source picker */}
                            <section className="space-y-3">
                                <h4 className="text-sm font-bold text-text-main">Source</h4>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                    <button
                                        type="button"
                                        onClick={handle_local_pick}
                                        className="group flex items-center gap-3 p-3 rounded-2xl border border-border-subtle bg-bg-surface hover:border-brand-blue/50 hover:bg-brand-blue/5 transition-colors text-left"
                                    >
                                        <div className="w-10 h-10 rounded-xl bg-brand-blue/10 text-brand-blue flex items-center justify-center shrink-0">
                                            <UploadCloud size={18} />
                                        </div>
                                        <div className="min-w-0">
                                            <p className="text-sm font-bold text-text-main">Select Files</p>
                                            <p className="text-[11px] text-text-muted">Pick videos / images from your PC</p>
                                        </div>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => set_picker_open(true)}
                                        className="group flex items-center gap-3 p-3 rounded-2xl border border-border-subtle bg-bg-surface hover:border-brand-emerald/50 hover:bg-brand-emerald/5 transition-colors text-left"
                                    >
                                        <div className="w-10 h-10 rounded-xl bg-brand-emerald/10 text-brand-emerald flex items-center justify-center shrink-0">
                                            <FolderOpen size={18} />
                                        </div>
                                        <div className="min-w-0">
                                            <p className="text-sm font-bold text-text-main">Choose from Library</p>
                                            <p className="text-[11px] text-text-muted">Browse OTT story folders</p>
                                        </div>
                                    </button>
                                </div>

                                {/* Hidden native file input */}
                                <input
                                    ref={local_input_ref}
                                    type="file"
                                    accept="video/*,image/*"
                                    multiple
                                    className="hidden"
                                    onChange={on_local_files_changed}
                                />

                                {/* Selected items — collapsible drawer */}
                                {(library_files.length > 0 || local_files.length > 0) && (
                                    <div className="space-y-2">
                                        <button
                                            type="button"
                                            onClick={() => set_list_expanded(o => !o)}
                                            className="w-full flex items-center justify-between gap-3 p-3 rounded-2xl bg-bg-surface border border-border-subtle hover:border-brand-emerald/40 transition-colors"
                                        >
                                            <span className="flex items-center gap-2 min-w-0">
                                                <ChevronRight
                                                    size={14}
                                                    className={`text-text-muted shrink-0 transition-transform duration-200 ${list_expanded ? 'rotate-90' : ''}`}
                                                />
                                                <span className="text-sm font-bold text-text-main">
                                                    Selected episodes
                                                </span>
                                                <span className="text-[11px] uppercase font-bold text-text-muted tracking-wider">
                                                    · {total_picked} item{total_picked === 1 ? '' : 's'}
                                                </span>
                                            </span>
                                            <span className="flex items-center gap-2 shrink-0">
                                                <span className="text-[11px] text-text-muted hidden sm:inline">
                                                    {file_count} library{local_files.length > 0 ? ` · ${local_files.length} local` : ''}
                                                </span>
                                                <span
                                                    role="button"
                                                    tabIndex={0}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        set_library_files([]);
                                                        set_local_files([]);
                                                    }}
                                                    onKeyDown={(e) => {
                                                        if (e.key === 'Enter' || e.key === ' ') {
                                                            e.preventDefault();
                                                            e.stopPropagation();
                                                            set_library_files([]);
                                                            set_local_files([]);
                                                        }
                                                    }}
                                                    className="text-[11px] font-bold text-text-muted hover:text-red-400 cursor-pointer"
                                                >
                                                    Clear all
                                                </span>
                                            </span>
                                        </button>

                                        <div
                                            className={`grid transition-[grid-template-rows,opacity] duration-200 ease-out ${
                                                list_expanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0 pointer-events-none'
                                            }`}
                                        >
                                            <div className="min-h-0 overflow-hidden">
                                                {library_files.length > 1 && (
                                                    <p className="px-1 pt-1 pb-1.5 text-[10px] text-text-muted">
                                                        Drag the <GripVertical size={10} className="inline align-text-bottom" /> handle to reorder. Use <code className="font-mono text-amber-400">{`\${number}`}</code> in the Auto Details title to insert each part number (1, 2, 3…).
                                                    </p>
                                                )}
                                                <div className="max-h-72 overflow-y-auto space-y-1 pr-1 pt-1">
                                                    {library_files.map((f, i) => (
                                                        <SelectedRow
                                                            key={f.id}
                                                            kind="library"
                                                            label={f.title || f.file_name || 'Untitled'}
                                                            sublabel={`Library · ${f.parent_title ?? f.parent_item_key ?? 'Ungrouped'}`}
                                                            save_type={f.save_type ?? null}
                                                            ext={(f.file_ext || f.original_video_type || '')}
                                                            order={i + 1}
                                                            draggable={library_files.length > 1}
                                                            is_drop_target={hover_id === f.id && drag_id !== null && drag_id !== f.id}
                                                            onDragStart={() => set_drag_id(f.id)}
                                                            onDragOver={() => set_hover_id(f.id)}
                                                            onDragEnd={() => { set_drag_id(null); set_hover_id(null); }}
                                                            onDrop={() => {
                                                                if (drag_id) reorder_library_file(drag_id, f.id);
                                                                set_drag_id(null);
                                                                set_hover_id(null);
                                                            }}
                                                            onRemove={() => remove_library_file(f.id)}
                                                        />
                                                    ))}
                                                    {local_files.map((f, i) => (
                                                        <SelectedRow
                                                            key={`local-${i}`}
                                                            kind="local"
                                                            label={f.name}
                                                            sublabel={`Local PC · ${(f.size / 1024 / 1024).toFixed(1)} MB · pending upload (Scenario 2)`}
                                                            save_type={(f.type || '').startsWith('video') ? 'video' : (f.type || '').startsWith('image') ? 'image' : null}
                                                            ext={f.name.split('.').pop() ?? ''}
                                                            order={library_files.length + i + 1}
                                                            onRemove={() => remove_local_file(i)}
                                                        />
                                                    ))}
                                                </div>

                                                {local_files.length > 0 && (
                                                    <div className="mt-2 flex items-start gap-2 p-2.5 rounded-xl bg-brand-blue/10 border border-brand-blue/30 text-[11px] text-brand-blue">
                                                        <Info size={12} className="mt-0.5 shrink-0" />
                                                        <span>
                                                            {local_files.length} local file{local_files.length === 1 ? '' : 's'} will upload to the library
                                                            {locked_ott_id ? ' (same OTT as your selection)' : ' under "Local Uploads"'} when you click Preview.
                                                        </span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </section>

                            {/* Upload all at once toggle */}
                            <section>
                                <label className="flex items-center gap-3 p-3 rounded-2xl border border-border-subtle bg-bg-surface cursor-pointer hover:border-brand-blue/40 transition-colors select-none">
                                    <input
                                        type="checkbox"
                                        checked={upload_all_at_once}
                                        onChange={(e) => set_upload_all_at_once(e.target.checked)}
                                        className="accent-brand-emerald w-4 h-4 shrink-0"
                                    />
                                    <span className="flex-1 min-w-0">
                                        <span className="text-xs font-bold text-text-main">Upload all at once</span>
                                        <span className="block text-[11px] text-text-muted mt-0.5">
                                            Schedule all {total_picked || 'selected'} file{total_picked === 1 ? '' : 's'} at the same date &amp; time — hides frequency and count settings
                                        </span>
                                    </span>
                                </label>
                            </section>

                            {/* Upload date + time — shown only in "all at once" mode */}
                            {upload_all_at_once && (
                                <section className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <div className="space-y-2">
                                        <label className="text-[11px] uppercase font-bold text-text-muted tracking-wider">Upload date</label>
                                        <ThemedDatePicker
                                            value={start_date}
                                            onChange={set_start_date}
                                            min={date_input(new Date())}
                                            placeholder="DD-MM-YYYY"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[11px] uppercase font-bold text-text-muted tracking-wider">Upload time</label>
                                        <ThemedTimePicker
                                            value={upload_times[0] ?? current_time_hhmm()}
                                            onChange={(v) => set_upload_times([v])}
                                            minute_step={1}
                                        />
                                    </div>
                                </section>
                            )}

                            {/* Frequency */}
                            {!upload_all_at_once && (
                            <section className="space-y-3">
                                <div className="space-y-2">
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
                                </div>

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
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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
                                                disabled={!start_date || total_picked === 0}
                                            />
                                        </div>
                                    </div>
                                )}
                            </section>
                            )}

                            {/* Knobs row */}
                            <section className={`grid grid-cols-1 gap-3 ${upload_all_at_once ? 'md:grid-cols-2' : 'md:grid-cols-3'}`}>
                                {!upload_all_at_once && (
                                <div className="space-y-2">
                                    <label className="text-[11px] uppercase font-bold text-text-muted tracking-wider">Upload count / day</label>
                                    <div className="flex items-center gap-2">
                                        <button
                                            type="button"
                                            onClick={() => set_upload_count(c => Math.max(1, c - 1))}
                                            className="p-2 rounded-xl border border-border-subtle text-text-muted hover:text-text-main"
                                        >
                                            <Minus size={14} />
                                        </button>
                                        <input
                                            type="number"
                                            min={1}
                                            max={20}
                                            value={upload_count}
                                            onChange={(e) => set_upload_count(Math.max(1, parseInt(e.target.value || '1', 10)))}
                                            className="input-field text-center flex-1 min-w-0"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => set_upload_count(c => Math.min(20, c + 1))}
                                            className="p-2 rounded-xl border border-border-subtle text-text-muted hover:text-text-main"
                                        >
                                            <Plus size={14} />
                                        </button>
                                    </div>
                                </div>
                                )}
                                <div className="space-y-2">
                                    <label className="text-[11px] uppercase font-bold text-text-muted tracking-wider">Platform</label>
                                    <CommonSearchSelect
                                        is_multi
                                        options={PLATFORM_OPTIONS}
                                        value={platform_choice}
                                        on_change={(v) => set_platform_choice(prev => handle_platform_multi_change(prev, v))}
                                    />
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
                                            // Matches the EventModal pattern: a native
                                            // <input type="color"> hidden under a swatch
                                            // tile. No popover, no portal, no nested
                                            // backdrop-filter — clicking opens the OS
                                            // color picker directly.
                                            <label
                                                className="group relative h-9 w-9 rounded-xl border border-border-subtle overflow-hidden shrink-0 cursor-pointer ring-1 ring-inset ring-white/5 hover:ring-2 hover:ring-brand-emerald/50 transition-all shadow-md"
                                                title={`Custom color (${custom_color})`}
                                            >
                                                <input
                                                    type="color"
                                                    value={custom_color}
                                                    onChange={(e) => set_custom_color(e.target.value)}
                                                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                                />
                                                <span
                                                    className="absolute inset-0"
                                                    style={{ backgroundColor: custom_color }}
                                                    aria-hidden="true"
                                                />
                                                <span className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent pointer-events-none" />
                                                <Pipette
                                                    size={11}
                                                    className="absolute bottom-1 right-1 text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)] opacity-80 group-hover:opacity-100 transition-opacity"
                                                />
                                            </label>
                                        ) : color === 'random' ? (
                                            <div
                                                className="relative h-9 w-9 rounded-xl border border-border-subtle shrink-0 overflow-hidden bg-gradient-to-br from-brand-emerald via-purple-500 to-brand-blue ring-1 ring-inset ring-white/10 shadow-md"
                                                title="A different color per upload, picked deterministically"
                                            >
                                                <span className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent pointer-events-none" />
                                                <Shuffle
                                                    size={11}
                                                    className="absolute bottom-1 right-1 text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)]"
                                                />
                                            </div>
                                        ) : (
                                            <div
                                                className="relative h-9 w-9 rounded-xl border border-border-subtle shrink-0 overflow-hidden ring-1 ring-inset ring-white/5 shadow-md"
                                                style={{ backgroundColor: SWATCH_HEX[color] ?? '#475569' }}
                                                title={color}
                                            >
                                                <span className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent pointer-events-none" />
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </section>

                            {/* Schedule times */}
                            {!upload_all_at_once && (
                            <section className="space-y-2">
                                <label className="text-[11px] uppercase font-bold text-text-muted tracking-wider">
                                    Schedule times · {upload_count} per day
                                </label>
                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                    {upload_times.map((t, i) => (
                                        <div key={i} className="space-y-2">
                                            <p className="text-[11px] text-text-muted">
                                                {ordinal(i + 1)} upload time
                                            </p>
                                            <ThemedTimePicker
                                                value={t}
                                                onChange={(v) => set_upload_times(prev => prev.map((x, idx) => idx === i ? v : x))}
                                                minute_step={1}
                                            />
                                        </div>
                                    ))}
                                </div>
                            </section>
                            )}

                            {/* Default title — always visible */}
                            <div className="space-y-1.5">
                                <label className="text-[11px] uppercase font-bold text-text-muted tracking-wider">Title (optional)</label>
                                <input
                                    type="text"
                                    value={manual_title}
                                    onChange={(e) => set_manual_title(e.target.value)}
                                    placeholder="Default title for all uploads — supports ${number}, ${count}"
                                    className="input-field text-xs w-full"
                                />
                            </div>

                            {/* Auto Details — Gemini fills missing fields per platform at fire time. */}
                            <section className="rounded-2xl border border-border-subtle bg-bg-surface/40 p-3 space-y-2">
                                <label className="flex items-start gap-3 cursor-pointer select-none">
                                    <input
                                        type="checkbox"
                                        checked={auto_details}
                                        onChange={(e) => set_auto_details(e.target.checked)}
                                        className="mt-1 accent-brand-emerald w-4 h-4"
                                    />
                                    <span className="flex-1 min-w-0">
                                        <span className="text-xs font-bold text-text-main">
                                            Auto Details from Google Analysis
                                        </span>
                                        <span className="block text-[11px] text-text-muted mt-0.5 leading-relaxed">
                                            If enabled, missing description, caption, tags and hashtags will be generated automatically per platform at upload time. The title above and manually filled fields will not be overwritten.
                                        </span>
                                    </span>
                                </label>
                                {auto_details && (
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pt-1">
                                        <input
                                            type="text"
                                            value={manual_caption}
                                            onChange={(e) => set_manual_caption(e.target.value)}
                                            placeholder="Manual caption (IG/FB)"
                                            className="input-field text-xs"
                                        />
                                        <textarea
                                            value={manual_description}
                                            onChange={(e) => set_manual_description(e.target.value)}
                                            rows={2}
                                            placeholder="Manual description (optional)"
                                            className="input-field text-xs md:col-span-2 resize-none"
                                        />
                                        <input
                                            type="text"
                                            value={manual_tags_csv}
                                            onChange={(e) => set_manual_tags_csv(e.target.value)}
                                            placeholder="Tags (comma-separated, optional)"
                                            className="input-field text-xs"
                                        />
                                        <input
                                            type="text"
                                            value={manual_hashtags_csv}
                                            onChange={(e) => set_manual_hashtags_csv(e.target.value)}
                                            placeholder="Hashtags (comma-separated, optional)"
                                            className="input-field text-xs"
                                        />
                                    </div>
                                )}
                            </section>

                            {/* Validation summary */}
                            {total_picked > 0 && (
                                <div className={`p-3 rounded-2xl border ${
                                    range_too_short
                                        ? 'bg-red-500/10 border-red-500/30 text-red-300'
                                        : range_too_long
                                            ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                                            : 'bg-bg-surface border-border-subtle text-text-muted'
                                }`}>
                                    <p className="text-xs leading-relaxed">
                                        <span className="font-bold">{total_picked}</span> file{total_picked === 1 ? '' : 's'}
                                        {local_files.length > 0 ? ` (${file_count} library + ${local_files.length} local)` : ''} ·
                                        {upload_all_at_once ? (
                                            <> <span className="font-bold text-brand-emerald">all at once</span> · 1 day</>
                                        ) : (
                                            <>{' '}<span className="font-bold">{upload_count}</span> upload{upload_count === 1 ? '' : 's'}/day ·
                                            {' '}<span className="font-bold">{required_days}</span> day{required_days === 1 ? '' : 's'} required
                                            {is_custom_range && start_date && end_date && (
                                                <> · selected <span className="font-bold">{selected_range_days}</span> day{selected_range_days === 1 ? '' : 's'}</>
                                            )}</>
                                        )}
                                    </p>
                                    {range_too_short && (
                                        <p className="text-[11px] mt-1 flex items-start gap-1.5">
                                            <AlertTriangle size={12} className="mt-0.5 shrink-0" />
                                            Selected range is too short. {total_picked} files with upload count {upload_count} requires {required_days} day{required_days === 1 ? '' : 's'}.
                                        </p>
                                    )}
                                    {range_too_long && (
                                        <p className="text-[11px] mt-1 flex items-start gap-1.5">
                                            <AlertTriangle size={12} className="mt-0.5 shrink-0" />
                                            Selected range has extra days. Schedule will use only the first {required_days} day{required_days === 1 ? '' : 's'}.
                                        </p>
                                    )}
                                </div>
                            )}
                        </>
                    ) : (
                        <PreviewView
                            preview={preview_items}
                            warnings={preview_warnings}
                            platforms={expand_platform(platform_choice)}
                            files={library_files}
                            on_reorder={(from_idx, to_idx) => {
                                if (from_idx === to_idx) return;
                                // Reorder the preview rows in-place AND
                                // the source library_files array so the
                                // Save call posts library_item_ids in
                                // the user's chosen order. The slot
                                // date/time at each row index stays
                                // fixed; only the file/title moves.
                                set_preview_items(prev => {
                                    if (!prev) return prev;
                                    const scheduled: SchedulePreviewItem[] = [];
                                    const unscheduled: SchedulePreviewItem[] = [];
                                    for (const p of prev) {
                                        if (p.scheduledAt) scheduled.push(p);
                                        else unscheduled.push(p);
                                    }
                                    if (from_idx < 0 || from_idx >= scheduled.length) return prev;
                                    const safe_to = Math.max(0, Math.min(scheduled.length - 1, to_idx));
                                    const moving_files = scheduled.map(s => ({
                                        library_item_id: s.library_item_id,
                                        title: s.title,
                                    }));
                                    const [picked] = moving_files.splice(from_idx, 1);
                                    if (!picked) return prev;
                                    moving_files.splice(safe_to, 0, picked);
                                    const reordered = scheduled.map((s, i) => ({
                                        ...s,
                                        library_item_id: moving_files[i]!.library_item_id,
                                        title: moving_files[i]!.title,
                                    }));
                                    return [...reordered, ...unscheduled];
                                });
                                set_library_files(prev => {
                                    const safe_to = Math.max(0, Math.min(prev.length - 1, to_idx));
                                    if (from_idx < 0 || from_idx >= prev.length) return prev;
                                    const next = [...prev];
                                    const [picked] = next.splice(from_idx, 1);
                                    if (!picked) return prev;
                                    next.splice(safe_to, 0, picked);
                                    return next;
                                });
                            }}
                        />
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
                        <button
                            type="button"
                            onClick={go_preview}
                            disabled={previewing || range_too_short || total_picked === 0}
                            className="btn-primary flex items-center gap-2 px-5 py-2 text-xs disabled:opacity-50"
                        >
                            {previewing ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                            {local_files.length > 0 ? `Upload ${local_files.length} & Preview` : 'Preview Schedule'}
                        </button>
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

            {/* Library picker overlay */}
            <LibraryBrowserPicker
                isOpen={picker_open}
                onClose={() => set_picker_open(false)}
                initial_selected_ids={library_files.map(f => f.id)}
                locked_ott_id={locked_ott_id}
                onConfirm={handle_library_picked}
            />
        </div>
    );
};

const PreviewView: React.FC<{
    preview: SchedulePreviewItem[] | null;
    warnings: string[];
    platforms: SupportedPlatform[];
    files: LibraryItem[];
    /** Drag-and-drop reorder hook. `from_idx` / `to_idx` are positions
     *  inside the scheduled-rows subset (unscheduled drafts are excluded
     *  because they aren't displayed). Parent reorders both
     *  `preview_items` and the source `library_files` so Save Schedule
     *  posts library_item_ids in the user's new order. */
    on_reorder?: (from_idx: number, to_idx: number) => void;
}> = ({ preview, warnings, platforms, files, on_reorder }) => {
    const [drag_from, set_drag_from] = useState<number | null>(null);
    const [drop_over, set_drop_over] = useState<number | null>(null);

    if (!preview) {
        return (
            <div className="p-8 text-center text-text-muted text-sm">
                <Loader2 className="inline animate-spin mr-2" size={14} /> Generating preview…
            </div>
        );
    }

    const scheduled_rows = preview.filter(r => r.scheduledAt);
    const file_by_id = new Map<string, LibraryItem>(files.map(f => [f.id, f]));

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

            {on_reorder && scheduled_rows.length > 1 && (
                <p className="text-[11px] text-text-muted flex items-center gap-1.5">
                    <GripVertical size={12} className="text-text-muted" />
                    Drag a row to reassign which file fills each slot — slot date/time stays fixed.
                </p>
            )}

            {/* Full-width table. `table-auto` lets Date/Time/Status hug
                their content (no clipped badges) while the File column
                absorbs leftover space via `w-full` on its <col>. Platform
                also gets a flexible minimum so long platform lists
                truncate instead of pushing the badge off the row.

                Two-layer wrap: the outer keeps the rounded clip, the
                inner adds horizontal scroll so super-long file names
                (raw UUIDs etc.) don't overflow the modal silently. */}
            <div className="rounded-2xl border border-border-subtle overflow-hidden">
                <div className="overflow-x-auto">
                <table className="w-full table-auto text-left text-xs">
                    <colgroup>
                        {on_reorder && <col style={{ width: '32px' }} />}
                        <col style={{ width: '1%' }} />
                        <col style={{ width: '1%' }} />
                        <col className="w-full" />
                        <col style={{ width: '1%' }} />
                        <col style={{ width: '1%' }} />
                    </colgroup>
                    <thead>
                        <tr className="text-text-muted text-[10px] uppercase tracking-widest border-b border-border-subtle bg-bg-surface">
                            {on_reorder && <th className="px-3 py-2 font-bold" aria-label="Reorder" />}
                            <th className="px-3 py-2 font-bold whitespace-nowrap">Date</th>
                            <th className="px-3 py-2 font-bold whitespace-nowrap">Time</th>
                            <th className="px-3 py-2 font-bold">File</th>
                            <th className="px-3 py-2 font-bold whitespace-nowrap">Platform</th>
                            <th className="px-3 py-2 font-bold whitespace-nowrap">Status</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border-subtle">
                        {scheduled_rows.map((row, idx) => {
                            const dt = row.scheduledAt ? new Date(row.scheduledAt) : null;
                            const file = file_by_id.get(row.library_item_id);
                            const file_label = row.title || file?.title || file?.file_name || 'Upload';
                            const is_dragging = drag_from === idx;
                            const is_drop_target = drop_over === idx && drag_from !== null && drag_from !== idx;
                            const draggable = !!on_reorder;
                            return (
                                <tr
                                    key={idx}
                                    draggable={draggable}
                                    onDragStart={(e) => {
                                        if (!draggable) return;
                                        set_drag_from(idx);
                                        // Firefox refuses to start drag without data set.
                                        try { e.dataTransfer.setData('text/plain', String(idx)); } catch { /* noop */ }
                                        e.dataTransfer.effectAllowed = 'move';
                                    }}
                                    onDragOver={(e) => {
                                        if (!draggable || drag_from === null) return;
                                        e.preventDefault();
                                        e.dataTransfer.dropEffect = 'move';
                                        if (drop_over !== idx) set_drop_over(idx);
                                    }}
                                    onDragLeave={() => {
                                        if (drop_over === idx) set_drop_over(null);
                                    }}
                                    onDrop={(e) => {
                                        if (!draggable || drag_from === null) return;
                                        e.preventDefault();
                                        if (on_reorder && drag_from !== idx) on_reorder(drag_from, idx);
                                        set_drag_from(null);
                                        set_drop_over(null);
                                    }}
                                    onDragEnd={() => {
                                        set_drag_from(null);
                                        set_drop_over(null);
                                    }}
                                    className={`text-text-main transition-colors ${
                                        is_dragging
                                            ? 'opacity-40'
                                            : is_drop_target
                                                ? 'bg-brand-blue/10 ring-1 ring-brand-blue/30'
                                                : 'hover:bg-bg-surface/40'
                                    } ${draggable ? 'cursor-grab active:cursor-grabbing' : ''}`}
                                >
                                    {draggable && (
                                        <td className="px-3 py-2 text-text-muted/70 align-middle">
                                            <GripVertical size={14} />
                                        </td>
                                    )}
                                    <td className="px-3 py-2 text-text-muted align-middle whitespace-nowrap">{dt ? dt.toLocaleDateString() : '—'}</td>
                                    <td className="px-3 py-2 text-text-muted align-middle whitespace-nowrap">{dt ? `${pad2(dt.getHours())}:${pad2(dt.getMinutes())}` : '—'}</td>
                                    <td className="px-3 py-2 align-middle min-w-0">
                                        <div className="flex items-center gap-2 min-w-0">
                                            <Clapperboard size={12} className="text-brand-blue shrink-0" />
                                            <span className="truncate" title={file_label}>{file_label}</span>
                                        </div>
                                    </td>
                                    <td className="px-3 py-2 text-text-muted align-middle whitespace-nowrap">
                                        {platforms.join(', ')}
                                    </td>
                                    <td className="px-3 py-2 align-middle whitespace-nowrap">
                                        <span className="inline-block text-[10px] px-2 py-0.5 rounded-full font-bold uppercase bg-brand-blue/10 text-brand-blue">
                                            scheduled
                                        </span>
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

function ordinal(n: number): string {
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

/**
 * One row in the "Selected episodes" drawer. Uses the same file-icon
 * vocabulary as the Library page (FileVideo emerald / FileImage blue /
 * FileMusic amber / generic muted) so the drawer reads as a slice of
 * the Library, not its own thing.
 */
const SelectedRow: React.FC<{
    kind: 'library' | 'local';
    label: string;
    sublabel: string;
    save_type: string | null;
    ext: string;
    /** Display order (1-based) — shown as a "Part N" badge. */
    order?: number;
    /** Drag-and-drop hooks. When `draggable` is true, the row is
     *  draggable and the parent handles reorder via these callbacks. */
    draggable?: boolean;
    is_drop_target?: boolean;
    onDragStart?: () => void;
    onDragOver?: (e: React.DragEvent) => void;
    onDragEnd?: () => void;
    onDrop?: () => void;
    onRemove: () => void;
}> = ({ kind, label, sublabel, save_type, ext, order, draggable, is_drop_target, onDragStart, onDragOver, onDragEnd, onDrop, onRemove }) => {
    const Icon = save_type === 'video'
        ? FileVideo
        : save_type === 'image' || save_type === 'thumbnail'
            ? FileImage
            : save_type === 'playlist'
                ? FileMusic
                : FileIcon;
    const tone = save_type === 'video'
        ? 'text-brand-emerald'
        : save_type === 'image' || save_type === 'thumbnail'
            ? 'text-brand-blue'
            : save_type === 'playlist'
                ? 'text-amber-400'
                : 'text-text-muted';
    const ext_label = (ext || '').toUpperCase().replace(/^\./, '');

    return (
        <div
            draggable={draggable}
            onDragStart={onDragStart}
            onDragOver={(e) => { if (draggable) { e.preventDefault(); onDragOver?.(e); } }}
            onDragEnd={onDragEnd}
            onDrop={(e) => { if (draggable) { e.preventDefault(); onDrop?.(); } }}
            className={`flex items-center gap-2 p-2 rounded-xl border transition-colors ${
                kind === 'local' ? 'border-amber-500/30 bg-amber-500/5' : 'border-border-subtle bg-bg-surface'
            } ${is_drop_target ? 'ring-2 ring-brand-emerald/60' : ''} ${draggable ? 'cursor-grab active:cursor-grabbing' : ''}`}
        >
            {draggable && (
                <span className="shrink-0 text-text-muted/60 hover:text-text-muted" title="Drag to reorder">
                    <GripVertical size={14} />
                </span>
            )}
            {typeof order === 'number' && (
                <span className="shrink-0 inline-flex items-center justify-center min-w-[1.5rem] h-5 px-1.5 rounded-md bg-brand-emerald/15 text-brand-emerald text-[10px] font-bold tracking-wider">
                    {order}
                </span>
            )}
            <div className="relative shrink-0">
                <Icon size={28} className={tone} strokeWidth={1.5} />
                {ext_label && (
                    <span className="absolute -bottom-0.5 -right-1 px-1 h-[12px] rounded bg-bg-main border border-border-subtle text-[8px] font-bold uppercase text-text-main flex items-center justify-center">
                        {ext_label}
                    </span>
                )}
            </div>
            <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-text-main truncate">{label}</p>
                <p className={`text-[10px] truncate ${kind === 'local' ? 'text-amber-400/80' : 'text-text-muted'}`}>
                    {sublabel}
                </p>
            </div>
            <button
                type="button"
                onClick={onRemove}
                className="p-1.5 rounded-lg text-text-muted hover:text-red-400 hover:bg-red-500/10 shrink-0"
                title="Remove"
            >
                <Trash2 size={12} />
            </button>
        </div>
    );
};

export default MediaScheduleModal;
