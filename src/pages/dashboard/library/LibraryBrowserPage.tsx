/**
 * Top-level library browser — Windows "This PC" feel:
 *
 *   /dashboard/library                          → grid of OTTs (each = a folder)
 *   /dashboard/library/:ott_id                  → grid of "story" folders
 *                                                  (one per parent show/series
 *                                                   that has saved items)
 *   /dashboard/library/:ott_id/:parent_item_key → file list inside that story
 *
 * The "Ungrouped" pseudo-folder collects items saved before story metadata
 * was captured. Use the URL sentinel `__ungrouped__` to drill into it.
 *
 * Selection semantics + bulk delete are shared across all three views via
 * `useGridSelection` + `SelectionActionBar`. Breadcrumbs + a back button
 * give the user explicit hierarchy controls.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion } from 'motion/react';
import toast from 'react-hot-toast';
import {
    ArrowLeft,
    Loader2,
    Clapperboard,
    Folder,
    FolderOpen,
    FolderPlus,
    Upload,
    UploadCloud,
    FileVideo,
    FileImage,
    FileMusic,
    File as FileIcon,
    Play,
    Download,
    Trash2,
    RefreshCw,
    Copy,
    AlertCircle,
    X,
    Check,
    ChevronLeft,
    ChevronRight,
    Search,
    Filter,
    Edit3,
    Scissors,
    ClipboardPaste,
    ExternalLink as ExternalLinkIcon,
    ArrowDownAZ,
    ArrowUpAZ,
} from 'lucide-react';
import { ott_service } from '../../../services/ott_service';
import {
    local_uploads_service,
    LocalUploadsFolder,
    LocalUploadsBreadcrumb,
} from '../../../services/local_uploads_service';
import {
    set_clipboard,
    clear_clipboard,
    get_clipboard,
    useLocalUploadsClipboard,
    is_cut_folder,
    is_cut_item,
    set_paste_status,
} from '../../../stores/local_uploads_clipboard';
import { set_upload_status, update_upload_progress, bump_upload_done_count } from '../../../stores/upload_status_store';
import { set_delete_status, update_delete_progress } from '../../../stores/delete_status_store';
import { PasteStatusBar } from '../../../components/library/PasteStatusBar';
import { LibraryItem } from '../../../types';
import { useGridSelection } from '../../../hooks/useGridSelection';
import { SelectionActionBar } from '../../../components/ui/SelectionActionBar';
import { LibraryCard } from '../../../components/library/LibraryCard';
import { LibraryStatusPopup } from '../../../components/library/LibraryStatusPopup';
import { CommonSearchSelect } from '../../../components/ui/CommonSearchSelect';
import { ContextMenu, ContextMenuItem } from '../../../components/library/ContextMenu';
import { useConfirm } from '../../../components/ui/ConfirmDialog';
import { useAuth } from '../../../context/AuthContext';
import ScheduleUploadModal from '../schedules/ScheduleUploadModal';
import { calendar_service, LibraryScheduleStatus } from '../../../services/calendar_service';
import SocialUploadModal from '../social/SocialUploadModal';

const LOCAL_UPLOADS_NAME = 'local uploads';
const is_local_uploads_name = (name: string | null | undefined): boolean =>
    (name ?? '').trim().toLowerCase() === LOCAL_UPLOADS_NAME;

/**
 * Local Uploads accepts only image/* and video/* MIME types. Some
 * browsers tag dragged files as "application/octet-stream" — fall back
 * to the extension when the MIME is unhelpful.
 */
const LOCAL_UPLOADS_ALLOWED_EXT = new Set([
    'jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'heic', 'avif', 'tiff', 'tif',
    'mp4', 'webm', 'mov', 'mkv', 'avi', 'm3u8', 'mpd', 'flv', 'wmv', '3gp', 'm4v',
]);
/**
 * Truncate a filename keeping the extension visible.
 *   "very_long_filename_that_goes_on.mp4" → "very_long_filenam….mp4"
 *
 * If the name fits inside `max_len`, returns it unchanged. If there's
 * no extension (or the extension is suspiciously long, e.g. an upstream
 * URL pasted in as a title), falls back to a plain end-truncate.
 */
function truncate_keeping_ext(name: string, max_len = 24): string {
    if (!name) return name;
    if (name.length <= max_len) return name;
    const dot = name.lastIndexOf('.');
    const ext = dot > 0 ? name.slice(dot) : '';
    // Reject "extensions" longer than 8 chars (probably not a real ext).
    if (!ext || ext.length > 8 || ext.length >= max_len - 2) {
        return name.slice(0, max_len - 1) + '…';
    }
    const head_len = Math.max(1, max_len - ext.length - 1); // -1 for the ellipsis
    return name.slice(0, head_len) + '…' + ext;
}

function is_image_or_video(file: File): boolean {
    const m = (file.type || '').toLowerCase();
    if (m.startsWith('image/') || m.startsWith('video/')) return true;
    if (m === '' || m === 'application/octet-stream') {
        const ext = (/\.([a-zA-Z0-9]{1,8})$/.exec(file.name)?.[1] ?? '').toLowerCase();
        return LOCAL_UPLOADS_ALLOWED_EXT.has(ext);
    }
    return false;
}
/**
 * Filters a collected file list down to images/videos only. Returns
 * {accepted, rejected} so the caller can toast the rejected count.
 */
function filter_local_uploads(
    list: Array<{ file: File; relative_path: string | null }>,
): { accepted: Array<{ file: File; relative_path: string | null }>; rejected: string[] } {
    const accepted: Array<{ file: File; relative_path: string | null }> = [];
    const rejected: string[] = [];
    for (const it of list) {
        if (is_image_or_video(it.file)) accepted.push(it);
        else rejected.push(it.file.name);
    }
    return { accepted, rejected };
}

/**
 * Walks a dropped DataTransferItemList and returns a flat list of
 * { file, relative_path } pairs. Handles nested folders via the
 * non-standard `webkitGetAsEntry` API (Chrome / Edge / Safari / Firefox).
 *
 * Falls back to the regular `dataTransfer.files` list if entries aren't
 * available (e.g. very old browsers) — folders won't be expanded but
 * loose files still upload.
 */
async function collect_dropped_files(dt: DataTransfer): Promise<Array<{ file: File; relative_path: string | null }>> {
    const out: Array<{ file: File; relative_path: string | null }> = [];

    // Non-standard but widely supported entry walker.
    const items = dt.items;
    if (items && typeof (items[0] as any)?.webkitGetAsEntry === 'function') {
        const entries: any[] = [];
        for (let i = 0; i < items.length; i++) {
            const it = items[i] as any;
            if (!it || it.kind !== 'file') continue;
            const entry = it.webkitGetAsEntry?.();
            if (entry) entries.push(entry);
        }

        const walk = async (entry: any, prefix: string): Promise<void> => {
            if (!entry) return;
            if (entry.isFile) {
                const file: File = await new Promise((resolve, reject) => entry.file(resolve, reject));
                out.push({
                    file,
                    relative_path: prefix ? `${prefix}/${file.name}` : null,
                });
                return;
            }
            if (entry.isDirectory) {
                const reader = entry.createReader();
                // Chrome's reader returns at most ~100 entries per call —
                // keep reading until empty.
                const all: any[] = [];
                let batch: any[] = [];
                do {
                    batch = await new Promise<any[]>((resolve, reject) => reader.readEntries(resolve, reject));
                    all.push(...batch);
                } while (batch.length > 0);
                const next_prefix = prefix ? `${prefix}/${entry.name}` : entry.name;
                for (const child of all) {
                    await walk(child, next_prefix);
                }
            }
        };

        for (const entry of entries) {
            await walk(entry, '');
        }
        if (out.length > 0) return out;
    }

    // Fallback: flat file list, no folder structure.
    const files = dt.files;
    if (files) {
        for (let i = 0; i < files.length; i++) {
            const f = files.item(i);
            if (f) out.push({ file: f, relative_path: null });
        }
    }
    return out;
}

interface OttSummary {
    id: string;
    name: string;
    favicon_url: string | null;
    counts: {
        total: number;
        folder_count: number;
    };
}

const LibraryBrowserPage: React.FC = () => {
    const { ott_id, story_key } = useParams<{ ott_id?: string; story_key?: string }>();

    // Three views map to three { ott_id?, story_key? } combinations:
    //   no params               → OTT grid
    //   ott_id only             → story folders for that OTT
    //   ott_id + story_key      → file list inside that story folder
    const view: 'otts' | 'stories' | 'files' = !ott_id
        ? 'otts'
        : !story_key
            ? 'stories'
            : 'files';

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {view === 'otts' && <OttGridView />}
            {view === 'stories' && ott_id && <StoryGridView ott_id={ott_id} />}
            {view === 'files' && ott_id && story_key && (
                <FileListView ott_id={ott_id} story_key={story_key} />
            )}
            {/* Persistent paste status bar — visible across folder
                navigation while a move/copy is in flight. */}
            <PasteStatusBar />
        </div>
    );
};

// ── View 1: OTT grid ─────────────────────────────────────────────────────

const OttGridView: React.FC = () => {
    const navigate = useNavigate();
    const confirm = useConfirm();
    const [loading, set_loading] = useState(true);
    const [otts, set_otts] = useState<OttSummary[]>([]);
    const [opened_id, set_opened_id] = useState<string | null>(null);

    const load = useCallback(async () => {
        set_loading(true);
        try {
            const res = await ott_service.list_library_otts();
            if (!res.success || !res.data) throw new Error(res.message || 'Failed to load library');
            set_otts(res.data.otts);
        } catch (err: any) {
            toast.error(err?.message || 'Failed to load library');
        } finally {
            set_loading(false);
        }
    }, []);
    useEffect(() => { load(); }, [load]);

    const ordered_ids = useMemo(() => otts.map(o => o.id), [otts]);
    const selection = useGridSelection({ ordered_ids });
    const [bulk_deleting, set_bulk_deleting] = useState(false);

    // Drop selections that vanished after a refresh.
    useEffect(() => {
        if (selection.selected_count === 0) return;
        const visible = new Set(ordered_ids);
        const next: string[] = [];
        selection.selected_ids.forEach(id => { if (visible.has(id)) next.push(id); });
        if (next.length !== selection.selected_count) selection.set_selected(next);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ordered_ids]);

    const handle_bulk_delete = useCallback(async () => {
        if (selection.selected_count === 0) return;
        const id_set = selection.selected_ids;
        const targets = otts.filter(o => id_set.has(o.id));
        const total_files = targets.reduce((acc, o) => acc + o.counts.total, 0);
        // Singular vs plural copy. The action wipes only library contents
        // (saved files + library rows), NOT the OTT itself — make that
        // crystal clear so the user doesn't think they're deleting the
        // whole platform registration.
        const ott_word = targets.length === 1 ? 'OTT' : 'OTTs';
        const file_word = total_files === 1 ? 'file' : 'files';
        const ok = await confirm({
            title: `Clear library contents?`,
            message: `Clear ${total_files} ${file_word} from ${targets.length} ${ott_word}.\n\nThe OTT registration${targets.length === 1 ? '' : 's'} will NOT be deleted — only saved library files.`,
            confirm_label: 'Clear contents',
            danger: true,
        });
        if (!ok) return;
        set_bulk_deleting(true);
        set_delete_status({
            total: Math.max(total_files, targets.length),
            done: 0,
            label: targets.length === 1 ? targets[0]!.name : `${targets.length} OTTs`,
            started_at: Date.now(),
        });
        try {
            const res = await ott_service.bulk_delete_otts_library_contents(Array.from(id_set));
            if (!res.success || !res.data) throw new Error(res.message || 'Bulk delete failed');
            update_delete_progress(res.data.total_deleted ?? total_files);
            toast.success(`Cleared ${res.data.total_deleted} file${res.data.total_deleted === 1 ? '' : 's'}`);
            selection.clear();
            // Pure state update — drop counts to zero in place. No
            // void load() so the user's scroll position / focus
            // doesn't reset.
            set_otts(prev => prev.map(o => id_set.has(o.id)
                ? { ...o, counts: { total: 0, folder_count: 0 } }
                : o));
        } catch (err: any) {
            toast.error(err?.message || 'Bulk delete failed');
        } finally {
            set_delete_status(null);
            set_bulk_deleting(false);
        }
    }, [otts, selection, load, confirm]);

    // Enter → drill into the single selected OTT. Delete → run the
    // existing bulk-delete confirm flow on whatever's selected.
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            const target = e.target as HTMLElement | null;
            const tag = target?.tagName?.toLowerCase();
            if (tag === 'input' || tag === 'textarea' || target?.isContentEditable) return;
            // Enter (with or without Alt) — drill into the single
            // selected OTT.
            if (e.key === 'Enter' && selection.selected_count === 1) {
                const id = Array.from(selection.selected_ids)[0];
                if (!id) return;
                e.preventDefault();
                navigate(`/dashboard/library/${id}`);
                return;
            }
            if (e.key === 'Delete' && selection.selected_count > 0) {
                e.preventDefault();
                void handle_bulk_delete();
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [navigate, selection.selected_count, selection.selected_ids, handle_bulk_delete]);

    return (
        <>
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div className="flex flex-col gap-2">
                    <h1 className="text-3xl font-black text-text-main tracking-tight flex items-center gap-3">
                        <Clapperboard size={28} className="text-brand-emerald" /> Library
                    </h1>
                    <p className="text-sm text-text-muted">
                        {otts.length} OTT{otts.length === 1 ? '' : 's'} · {otts.reduce((acc, o) => acc + o.counts.folder_count, 0)} stor{otts.reduce((acc, o) => acc + o.counts.folder_count, 0) === 1 ? 'y' : 'ies'}
                    </p>
                </div>
                <button
                    onClick={load}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-bg-card border border-border-subtle text-text-main text-sm font-bold hover:border-brand-emerald/50"
                >
                    <RefreshCw size={16} /> Refresh
                </button>
            </div>

            {loading ? (
                <div className="flex items-center justify-center py-20 text-text-muted">
                    <Loader2 size={28} className="animate-spin" />
                </div>
            ) : otts.length === 0 ? (
                <div className="p-16 text-center bg-black/5 dark:bg-white/5 rounded-3xl border border-dashed border-border-subtle space-y-3">
                    <Clapperboard size={48} className="mx-auto text-text-muted opacity-50" />
                    <h3 className="text-lg font-bold text-text-main">No OTTs registered yet</h3>
                    <p className="text-sm text-text-muted">Register an OTT and save cards into its library to see folders here.</p>
                </div>
            ) : (
                <div
                    className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10 gap-2 select-none"
                    onClick={selection.handle_background_click}
                >
                    {otts.map(ott => {
                        const is_sel = selection.is_selected(ott.id);
                        const is_opened = !is_sel && opened_id === ott.id;
                        return (
                            <button
                                key={ott.id}
                                type="button"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    set_opened_id(null);
                                    selection.handle_item_click(ott.id, e);
                                }}
                                onDoubleClick={(e) => {
                                    e.stopPropagation();
                                    selection.clear();
                                    set_opened_id(ott.id);
                                    navigate(`/dashboard/library/${ott.id}`);
                                }}
                                className={`group relative flex flex-col items-center gap-1 p-3 rounded-xl focus:outline-none transition-colors ${
                                    is_sel
                                        ? 'bg-brand-emerald/20 ring-2 ring-brand-emerald'
                                        : is_opened
                                            ? 'bg-brand-emerald/10'
                                            : 'hover:bg-brand-emerald/10 focus:bg-brand-emerald/15'
                                }`}
                                title={`${ott.name} — ${ott.counts.folder_count} stor${ott.counts.folder_count === 1 ? 'y' : 'ies'} (${ott.counts.total} file${ott.counts.total === 1 ? '' : 's'})`}
                            >
                                <div className="relative">
                                    {/* Favicon overlays the folder icon to show
                                        which OTT this is. Falls back to a plain
                                        amber folder when no favicon is set. */}
                                    <Folder
                                        size={56}
                                        className="text-amber-400 fill-amber-400/30 group-hover:text-amber-300 transition-colors"
                                        strokeWidth={1.5}
                                    />
                                    {ott.favicon_url && (
                                        <img
                                            src={ott.favicon_url}
                                            alt=""
                                            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-[35%] w-5 h-5 rounded bg-white/90 p-0.5 object-contain"
                                            referrerPolicy="no-referrer"
                                            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                                        />
                                    )}
                                    <span className="absolute -bottom-0.5 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-bg-main border border-border-subtle text-[9px] font-bold text-text-main flex items-center justify-center">
                                        {ott.counts.folder_count}
                                    </span>
                                </div>
                                <span
                                    className="text-xs text-text-main text-center w-full line-clamp-2 leading-tight mt-1"
                                    title={ott.name}
                                >
                                    {ott.name}
                                </span>
                            </button>
                        );
                    })}
                </div>
            )}

            <SelectionActionBar
                count={selection.selected_count}
                on_clear={selection.clear}
                on_delete={handle_bulk_delete}
                busy={bulk_deleting}
                label={`${selection.selected_count} ${selection.selected_count === 1 ? 'OTT' : 'OTTs'} selected`}
            />
        </>
    );
};

// ── View 2: Story-folder grid (per-OTT, one folder per parent show) ──────

interface StoryFolder {
    parent_api_id: string | null;
    parent_item_key: string | null;
    title: string;
    item_count: number;
    completed_count: number;
    failed_count: number;
    in_progress_count: number;
    thumbnail_url: string | null;
    latest_at: string | null;
    /** Local-uploads only — the protected "media" folder can't be
     *  deleted from the grid. Other actions (rename/cut/open) are
     *  unaffected. */
    is_default?: boolean;
}

/** Stable URL key for a story folder. The Ungrouped pseudo-folder uses a
 *  literal sentinel since it has no real parent_item_key. */
const story_url_key = (f: StoryFolder): string =>
    f.parent_item_key ?? '__ungrouped__';

const StoryGridView: React.FC<{ ott_id: string }> = ({ ott_id }) => {
    const navigate = useNavigate();
    const confirm = useConfirm();
    const [loading, set_loading] = useState(true);
    const [refreshing, set_refreshing] = useState(false);
    const [ott, set_ott] = useState<OttSummary | null>(null);
    const [folders, set_folders] = useState<StoryFolder[]>([]);
    const [opened_id, set_opened_id] = useState<string | null>(null);
    const [bulk_deleting, set_bulk_deleting] = useState(false);
    // Frontend-only sort by folder title. Pending placeholders always
    // float to the top so the just-created folder stays visible while
    // the user types its name. Persisted in localStorage so the user's
    // choice survives a refresh.
    const [folder_sort_dir, set_folder_sort_dir] = useState<'asc' | 'desc'>(() => {
        const v = typeof window !== 'undefined' ? window.localStorage.getItem('library:folder_sort_dir') : null;
        return v === 'desc' ? 'desc' : 'asc';
    });
    useEffect(() => {
        try { window.localStorage.setItem('library:folder_sort_dir', folder_sort_dir); }
        catch { /* private mode etc. — ignore */ }
    }, [folder_sort_dir]);

    // ── Local Uploads file-manager state ─────────────────────────────
    const is_local = is_local_uploads_name(ott?.name);
    const [menu, set_menu] = useState<{ x: number; y: number; items: ContextMenuItem[] } | null>(null);
    const [rename_target, set_rename_target] = useState<{ key: string; value: string } | null>(null);
    const [drag_over, set_drag_over] = useState(false);
    // The upload progress popup now lives in <GlobalUploadOverlay> and
    // reads from upload_status_store. Local refs only keep the
    // AbortController so the keyboard / progress callbacks can reach it.
    const upload_abort_ref = useRef<AbortController | null>(null);
    const file_input_ref = useRef<HTMLInputElement | null>(null);
    const dir_input_ref = useRef<HTMLInputElement | null>(null);
    // Subscribe to the in-app clipboard so cut tiles re-render with the
    // dimmed style when the user issues Ctrl+X.
    const clipboard = useLocalUploadsClipboard();
    void clipboard; // referenced via is_cut_folder() below

    /**
     * Shared fetch. `mode` decides which spinner to show:
     *   'initial' → the full-page centred loader (data is empty)
     *   'refresh' → the inline spinner inside the Refresh button
     * In both cases the existing `folders` list stays mounted in
     * 'refresh' mode so the user keeps seeing their grid while the
     * network request is in flight.
     */
    const fetch_data = useCallback(async (mode: 'initial' | 'refresh') => {
        if (mode === 'initial') set_loading(true);
        else set_refreshing(true);
        try {
            // Resolve the OTT first — we need to know whether this is the
            // "Local Uploads" pseudo-OTT so we can hit the nested-folder
            // endpoint (which honours parent_folder_key) instead of the
            // legacy aggregator that flattens the whole tree.
            const otts_res = await ott_service.list_library_otts();
            if (!otts_res.success || !otts_res.data) {
                throw new Error(otts_res.message || 'Failed to load library');
            }
            const found = otts_res.data.otts.find(o => o.id === ott_id) ?? null;
            set_ott(found);

            if (is_local_uploads_name(found?.name)) {
                const res = await local_uploads_service.list_folders(ott_id, null, { include_ungrouped: true });
                if (!res.success || !res.data) throw new Error(res.message || 'Failed to load folders');
                // Adapt to the StoryFolder shape the grid expects.
                set_folders(res.data.folders.map(f => ({
                    parent_api_id: null,
                    parent_item_key: f.parent_item_key,
                    title: f.title,
                    item_count: f.item_count,
                    completed_count: 0,
                    failed_count: 0,
                    in_progress_count: 0,
                    thumbnail_url: null,
                    latest_at: f.created_at,
                    is_default: f.is_default ?? false,
                })));
            } else {
                const folders_res = await ott_service.get_library_folders(ott_id);
                if (!folders_res.success || !folders_res.data) {
                    throw new Error(folders_res.message || 'Failed to load folders');
                }
                set_folders(folders_res.data.folders);
            }
        } catch (err: any) {
            toast.error(err?.message || 'Failed to load library');
        } finally {
            if (mode === 'initial') set_loading(false);
            else set_refreshing(false);
        }
    }, [ott_id]);
    const load = useCallback(() => fetch_data('initial'), [fetch_data]);
    const refresh = useCallback(() => fetch_data('refresh'), [fetch_data]);
    useEffect(() => { load(); }, [load]);

    // Sorted view of folders for rendering. Pending placeholders
    // (the just-created "New folder" tile mid-rename) always pin to
    // the top — sorting them away mid-typing would feel jarring.
    const sorted_folders = useMemo(() => {
        const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });
        const next = [...folders];
        next.sort((a, b) => {
            const a_pending = !!a.parent_item_key && a.parent_item_key.startsWith('__pending_');
            const b_pending = !!b.parent_item_key && b.parent_item_key.startsWith('__pending_');
            if (a_pending !== b_pending) return a_pending ? -1 : 1;
            const cmp = collator.compare(a.title ?? '', b.title ?? '');
            return folder_sort_dir === 'asc' ? cmp : -cmp;
        });
        return next;
    }, [folders, folder_sort_dir]);

    const ordered_ids = useMemo(() => sorted_folders.map(story_url_key), [sorted_folders]);
    const selection = useGridSelection({ ordered_ids });

    // Drop selections that vanished after a refresh.
    useEffect(() => {
        if (selection.selected_count === 0) return;
        const visible = new Set(ordered_ids);
        const next: string[] = [];
        selection.selected_ids.forEach(id => { if (visible.has(id)) next.push(id); });
        if (next.length !== selection.selected_count) selection.set_selected(next);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ordered_ids]);

    const handle_bulk_delete = useCallback(async () => {
        if (selection.selected_count === 0) return;
        const id_set = selection.selected_ids;
        // Strip Ungrouped + protected default folders — both are read-only
        // tiles. Counting them in the prompt would mislead ("Delete 3
        // stories?" when only 1 is actually deletable).
        const targets = folders.filter(f =>
            id_set.has(story_url_key(f))
            && !!f.parent_item_key
            && f.is_default !== true);
        if (targets.length === 0) {
            toast.error('Nothing to delete in the current selection');
            return;
        }
        const total_items = targets.reduce((acc, f) => acc + f.item_count, 0);
        const folder_word = targets.length === 1 ? 'story' : 'stories';
        const item_word = total_items === 1 ? 'item' : 'items';
        const ok = await confirm({
            title: `Delete ${targets.length} ${folder_word}?`,
            message: `${total_items} ${item_word} inside will also be removed.`,
            confirm_label: 'Delete',
            danger: true,
        });
        if (!ok) return;
        set_bulk_deleting(true);
        set_delete_status({
            total: Math.max(total_items, targets.length),
            done: 0,
            label: targets.length === 1 ? targets[0]!.title : `${targets.length} folders`,
            started_at: Date.now(),
        });
        try {
            // Local Uploads goes through the recursive folder-delete
            // endpoint (per target) so nested subfolders + their files
            // are also wiped from the DB. The legacy bulk endpoint only
            // deletes direct children and would leave orphaned nested
            // placeholders behind.
            if (is_local) {
                let total_deleted = 0;
                let any_failed = false;
                const deleted_keys = new Set<string>();
                for (const t of targets) {
                    if (!t.parent_item_key) continue;
                    if (t.is_default === true) continue;
                    try {
                        const res = await local_uploads_service.delete_folder(ott_id, t.parent_item_key);
                        if (!res.success) throw new Error(res.message || 'Delete failed');
                        const n = res.data?.deleted ?? t.item_count ?? 1;
                        total_deleted += n;
                        update_delete_progress(n);
                        deleted_keys.add(t.parent_item_key);
                    } catch (err: any) {
                        any_failed = true;
                        toast.error(err?.message || `Failed to delete "${t.title}"`);
                    }
                }
                set_folders(prev => prev.filter(f => !(f.parent_item_key && deleted_keys.has(f.parent_item_key))));
                selection.clear();
                if (!any_failed) toast.success(`Deleted ${total_deleted} item${total_deleted === 1 ? '' : 's'}`);
            } else {
                const res = await ott_service.bulk_delete_library_folders(
                    ott_id,
                    targets.map(f => ({
                        parent_item_key: f.parent_item_key,
                        parent_api_id: f.parent_api_id,
                    })),
                );
                if (!res.success || !res.data) throw new Error(res.message || 'Bulk delete failed');
                update_delete_progress(res.data.total_deleted ?? total_items);
                set_folders(prev => prev.filter(f => !id_set.has(story_url_key(f))));
                selection.clear();
                toast.success(`Deleted ${res.data.total_deleted} item${res.data.total_deleted === 1 ? '' : 's'}`);
            }
            // No void load() — set_folders above already updated the grid.
        } catch (err: any) {
            toast.error(err?.message || 'Bulk delete failed');
        } finally {
            set_delete_status(null);
            set_bulk_deleting(false);
        }
    }, [ott_id, selection, folders, load, confirm, is_local]);

    // ── Local Uploads handlers (no-ops when is_local is false) ──────
    const upload_files_with_paths = useCallback(async (
        files: Array<{ file: File; relative_path: string | null }>,
        target_key: string | null,
        target_title: string | null,
    ) => {
        if (files.length === 0) return;
        const controller = new AbortController();
        upload_abort_ref.current = controller;
        const total_bytes = files.reduce((a, f) => a + f.file.size, 0);
        // Push to the global store so the popup persists across
        // navigation and the X / Cancel buttons can abort from anywhere.
        set_upload_status({
            count: files.length,
            done_count: 0,
            loaded: 0,
            total: total_bytes,
            abort: () => controller.abort(),
            label: target_title ?? undefined,
            started_at: Date.now(),
        });
        try {
            const res = await local_uploads_service.upload_files({
                ott_id,
                files: files.map(f => f.file),
                relative_paths: files.map(f => f.relative_path),
                parent_item_key: target_key,
                parent_title: target_title,
                signal: controller.signal,
                on_progress: (loaded, total) => update_upload_progress(loaded, total),
                on_file_done: () => bump_upload_done_count(),
            });
            if (!res.success || !res.data) throw new Error(res.message || 'Upload failed');
            toast.success(`Uploaded ${res.data.count} file${res.data.count === 1 ? '' : 's'}`);
            // Refresh the top-level folder grid from the server. We
            // can't optimistically merge the response items into
            // `folders` here — the response includes files inside
            // NESTED folders (parent_item_key = nested-folder key)
            // which, if naively grouped, would surface those nested
            // folders as new tiles at the OTT root. Asking the backend
            // for the root-scoped folder list is correct AND cheap
            // (single query, returns counts already aggregated).
            await refresh();
        } catch (err: any) {
            const cancelled = err?.code === 'ERR_CANCELED' || err?.name === 'CanceledError';
            if (!cancelled) toast.error(err?.message || 'Upload failed');
        } finally {
            set_upload_status(null);
            upload_abort_ref.current = null;
        }
    }, [ott_id, refresh]);

    /**
     * Windows-Explorer behaviour: a "New folder" tile + editable
     * label appear in the grid INSTANTLY (no network wait). The
     * actual create_folder API call is deferred until the rename
     * submit, so we can ship the user's chosen name in a single
     * round-trip instead of "create with default → rename" two-step.
     *
     * The optimistic row uses a `__pending_` key sentinel that the
     * rename handler recognises and swaps for the real key returned
     * by the API.
     */
    const create_folder_now = useCallback(() => {
        const taken = new Set(folders.map(f => (f.title ?? '').trim().toLowerCase()));
        let name = 'New folder';
        let i = 2;
        while (taken.has(name.toLowerCase())) {
            name = `New folder (${i++})`;
        }
        const temp_key = `__pending_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const optimistic: StoryFolder = {
            parent_api_id: null,
            parent_item_key: temp_key,
            title: name,
            item_count: 0,
            completed_count: 0,
            failed_count: 0,
            in_progress_count: 0,
            thumbnail_url: null,
            latest_at: new Date().toISOString(),
        };
        set_folders(prev => [optimistic, ...prev]);
        selection.clear();
        set_rename_target({ key: temp_key, value: name });
    }, [folders, selection]);

    const rename_folder_now = useCallback(async (folder: StoryFolder, next_name: string) => {
        if (!folder.parent_item_key) return;
        const trimmed = next_name.trim();

        // Pending optimistic folder — this is the FIRST commit, so
        // call create_folder with the user's chosen name (or default
        // if they didn't change it). Avoids the "create then rename"
        // round-trip and keeps everything to a single API call.
        if (folder.parent_item_key.startsWith('__pending_')) {
            const final_name = trimmed || folder.title || 'New folder';
            const temp_key = folder.parent_item_key;
            // Update the title in state IMMEDIATELY so the tile
            // shows the user's chosen name instead of "New folder"
            // during the brief API call. The `__pending_` key
            // sentinel still drives the spinner badge.
            set_folders(prev => prev.map(f =>
                f.parent_item_key === temp_key
                    ? { ...f, title: final_name }
                    : f,
            ));
            try {
                const res = await local_uploads_service.create_folder(ott_id, final_name);
                if (!res.success || !res.data) throw new Error(res.message || 'Failed to create folder');
                const real_key = res.data.parent_item_key;
                // The backend dedupes case-insensitively against siblings
                // and returns the actual saved title (e.g. "ug copy" if
                // "ug" already existed). Reflect that in the UI so the
                // user sees the real name, not their typed one.
                const real_title = res.data.parent_title ?? final_name;
                set_folders(prev => prev.map(f =>
                    f.parent_item_key === temp_key
                        ? { ...f, parent_item_key: real_key, title: real_title }
                        : f,
                ));
            } catch (err: any) {
                set_folders(prev => prev.filter(f => f.parent_item_key !== temp_key));
                toast.error(err?.message || 'Failed to create folder');
            }
            return;
        }

        if (!trimmed || trimmed === folder.title) return;
        const folder_key = folder.parent_item_key;
        try {
            const res = await local_uploads_service.rename_folder(ott_id, folder_key, trimmed);
            if (!res.success || !res.data) throw new Error(res.message || 'Rename failed');
            // Use the title the backend actually saved (it may have
            // appended " copy" / " copy 2" if the typed name collided
            // with a sibling).
            const real_title = res.data.parent_title ?? trimmed;
            set_folders(prev => prev.map(f =>
                f.parent_item_key === folder_key ? { ...f, title: real_title } : f,
            ));
            toast.success('Folder renamed');
        } catch (err: any) {
            toast.error(err?.message || 'Rename failed');
        }
    }, [ott_id]);

    const delete_folder_now = useCallback(async (folder: StoryFolder) => {
        if (!folder.parent_item_key) return;
        if (folder.is_default === true) {
            toast.error('Default folder cannot be deleted — remove its files instead');
            return;
        }
        const ok = await confirm({
            title: `Delete "${folder.title}"?`,
            message: `${folder.item_count} item${folder.item_count === 1 ? '' : 's'} inside will also be removed.`,
            confirm_label: 'Delete',
            danger: true,
        });
        if (!ok) return;
        const folder_key = folder.parent_item_key;
        set_delete_status({
            total: Math.max(folder.item_count, 1),
            done: 0,
            label: folder.title,
            started_at: Date.now(),
        });
        try {
            const res = await local_uploads_service.delete_folder(ott_id, folder_key);
            if (!res.success) throw new Error(res.message || 'Delete failed');
            update_delete_progress(folder.item_count || 1);
            // Pure state update — drop the folder from the grid.
            set_folders(prev => prev.filter(f => f.parent_item_key !== folder_key));
            selection.clear();
            toast.success('Folder deleted');
        } catch (err: any) {
            toast.error(err?.message || 'Delete failed');
        } finally {
            set_delete_status(null);
        }
    }, [ott_id, selection, confirm]);

    const open_picker = useCallback((kind: 'files' | 'directory') => {
        const input = kind === 'files' ? file_input_ref.current : dir_input_ref.current;
        if (input) {
            input.value = '';
            input.click();
        }
    }, []);

    const handle_picker_files = useCallback(async (e: React.ChangeEvent<HTMLInputElement>, kind: 'files' | 'directory') => {
        const list = e.target.files;
        if (!list || list.length === 0) return;
        const arr: Array<{ file: File; relative_path: string | null }> = [];
        for (let i = 0; i < list.length; i++) {
            const f = list.item(i);
            if (!f) continue;
            const rel = kind === 'directory' ? ((f as any).webkitRelativePath || null) : null;
            arr.push({ file: f, relative_path: rel });
        }
        const { accepted, rejected } = filter_local_uploads(arr);
        if (rejected.length > 0) {
            toast(
                `Skipped ${rejected.length} non-image/video file${rejected.length === 1 ? '' : 's'}`,
                { icon: '⚠️' },
            );
        }
        if (accepted.length === 0) return;
        await upload_files_with_paths(accepted, null, null);
    }, [upload_files_with_paths]);

    const open_background_menu = useCallback((e: React.MouseEvent) => {
        if (!is_local) return;
        e.preventDefault();
        const cb = get_clipboard();
        const can_paste = !!(cb && cb.ott_id === ott_id && (cb.item_ids.length + cb.folder_keys.length) > 0);
        // Local Uploads root is read-only: no New folder / Upload / Paste
        // entries. Move (cut + paste) is only available inside the default
        // "media" folder or any subfolder — pasting at root would put
        // content in a location the user can't upload to anyway.
        // `cb` is intentionally unused at root; suppress the unused-var
        // hint without changing the closure deps.
        void cb; void can_paste;
        set_menu({
            x: e.clientX,
            y: e.clientY,
            items: [
                { label: 'Refresh', icon: RefreshCw, on_click: () => void refresh() },
            ],
        });
    }, [is_local, create_folder_now, open_picker, refresh, ott_id]);

    const open_folder_menu = useCallback((e: React.MouseEvent, folder: StoryFolder) => {
        if (!is_local) return;
        e.preventDefault();
        e.stopPropagation();
        const fid = story_url_key(folder);
        // Mark this folder as selected so cut operates on it.
        if (!selection.is_selected(fid)) {
            selection.handle_item_click(fid, e as any);
        }
        set_menu({
            x: e.clientX,
            y: e.clientY,
            items: [
                { label: 'Open', icon: FolderOpen, on_click: () => navigate(`/dashboard/library/${ott_id}/${fid}`), separator_after: true },
                { label: 'Cut', icon: Scissors, on_click: () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'x', ctrlKey: true })), shortcut: 'Ctrl+X', disabled: !folder.parent_item_key || folder.is_default === true, separator_after: true },
                { label: 'Rename', icon: Edit3, on_click: () => set_rename_target({ key: fid, value: folder.title }), shortcut: 'F2', disabled: !folder.parent_item_key, separator_after: true },
                { label: 'Delete', icon: Trash2, on_click: () => delete_folder_now(folder), danger: true, disabled: !folder.parent_item_key || folder.is_default === true },
            ],
        });
    }, [is_local, navigate, ott_id, delete_folder_now, selection]);

    // Drag & drop on the OTT root. Counter-based to avoid the
    // dragenter-on-child-fires-dragleave-on-parent flicker.
    const drag_counter = useRef(0);
    const drag_carries_files = (e: React.DragEvent): boolean => {
        const types = e.dataTransfer?.types;
        if (!types) return false;
        for (let i = 0; i < types.length; i++) if (types[i] === 'Files') return true;
        return false;
    };
    const handle_drag_enter = useCallback((e: React.DragEvent) => {
        if (!is_local) return;
        if (!drag_carries_files(e)) return;
        e.preventDefault();
        drag_counter.current += 1;
        if (drag_counter.current === 1) set_drag_over(true);
    }, [is_local]);
    const handle_drag_over = useCallback((e: React.DragEvent) => {
        if (!is_local) return;
        if (!drag_carries_files(e)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
    }, [is_local]);
    const handle_drag_leave = useCallback(() => {
        drag_counter.current = Math.max(0, drag_counter.current - 1);
        if (drag_counter.current === 0) set_drag_over(false);
    }, []);
    const handle_drop = useCallback(async (e: React.DragEvent) => {
        if (!is_local) return;
        e.preventDefault();
        drag_counter.current = 0;
        set_drag_over(false);
        // Local Uploads root is read-only — uploads must land inside a
        // folder (the protected "media" default or any user-created
        // subfolder). Surface a hint so the drop doesn't silently fail.
        toast('Drop files inside a folder, not the Local Uploads root', { icon: 'ℹ️' });
    }, [is_local]);

    // Refresh after paste — pulls subfolders + counts from the server
    // since copy/move can affect both the source and destination grids.
    const after_paste_refresh = useCallback(() => {
        void refresh();
    }, [refresh]);

    // Keyboard: Shift+N → new folder, F2 → rename selected, Enter → open,
    // Ctrl+C / Ctrl+X / Ctrl+V → copy / cut / paste.
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            const target = e.target as HTMLElement | null;
            const tag = target?.tagName?.toLowerCase();
            if (tag === 'input' || tag === 'textarea' || target?.isContentEditable) return;

            // Enter → open (works for ALL OTTs, not just Local Uploads).
            if (e.key === 'Enter' && selection.selected_count === 1) {
                const id = Array.from(selection.selected_ids)[0];
                const folder = id ? folders.find(f => story_url_key(f) === id) : null;
                if (folder) {
                    e.preventDefault();
                    navigate(`/dashboard/library/${ott_id}/${story_url_key(folder)}`);
                }
                return;
            }

            if (!is_local) return;

            // Ctrl+X and Ctrl+V are disabled at the Local Uploads root.
            // Move (cut + paste) only operates inside the default "media"
            // folder or any subfolder, where uploads/creations are also
            // allowed. Cutting the protected default folder or pasting
            // back at root would put content in a read-only location.
            if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey
                && (e.key === 'x' || e.key === 'X' || e.key === 'v' || e.key === 'V')) {
                return;
            }

            // Shift+N (new folder) is disabled at the Local Uploads root —
            // folders are only created inside the default "media" folder
            // or any other existing folder via the FileListView.
            if (e.key === 'F2') {
                const id = Array.from(selection.selected_ids)[0];
                if (!id) return;
                const folder = folders.find(f => story_url_key(f) === id);
                if (!folder || !folder.parent_item_key) return;
                e.preventDefault();
                set_rename_target({ key: id, value: folder.title });
                return;
            }
            // Delete — wipe every selected Local Uploads folder. The
            // existing single-folder helper handles the confirm dialog
            // per folder; for multi-select we just loop. Non-Local-
            // Uploads OTTs are unaffected because the guard above
            // already returned.
            if (e.key === 'Delete' && selection.selected_count > 0) {
                e.preventDefault();
                const targets = folders.filter(f =>
                    f.parent_item_key
                    && f.is_default !== true
                    && selection.selected_ids.has(story_url_key(f)));
                if (targets.length === 0) return;
                void (async () => {
                    const ok = await confirm({
                        title: targets.length === 1
                            ? `Delete "${targets[0]!.title}"?`
                            : `Delete ${targets.length} folders?`,
                        message: 'Everything inside will also be removed. This cannot be undone.',
                        confirm_label: 'Delete',
                        danger: true,
                    });
                    if (!ok) return;
                    for (const t of targets) {
                        if (!t.parent_item_key) continue;
                        try {
                            const res = await local_uploads_service.delete_folder(ott_id, t.parent_item_key);
                            if (!res.success) throw new Error(res.message || 'Delete failed');
                            set_folders(prev => prev.filter(f => f.parent_item_key !== t.parent_item_key));
                        } catch (err: any) {
                            toast.error(err?.message || `Failed to delete "${t.title}"`);
                        }
                    }
                    selection.clear();
                })();
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [is_local, create_folder_now, folders, selection, selection.selected_count, selection.selected_ids, navigate, ott_id, after_paste_refresh]);

    return (
        <>
            <Breadcrumbs ott={ott} />
            <Header
                title={ott?.name ?? 'Loading…'}
                subtitle={
                    ott
                        ? `${folders.length} stor${folders.length === 1 ? 'y' : 'ies'} · ${ott.counts.total} saved file${ott.counts.total === 1 ? '' : 's'}`
                        : ''
                }
                back_to="/dashboard/library"
                back_label="Library"
                on_refresh={refresh}
                refreshing={refreshing}
                actions={
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={() => set_folder_sort_dir(d => d === 'asc' ? 'desc' : 'asc')}
                            className="flex items-center gap-1.5 px-2.5 py-2 rounded-xl border border-border-subtle text-text-muted hover:text-text-main hover:border-text-muted/40 text-xs font-bold transition-colors"
                            title={`Sort by name — currently ${folder_sort_dir === 'asc' ? 'A → Z' : 'Z → A'}`}
                        >
                            {folder_sort_dir === 'asc' ? <ArrowDownAZ size={14} /> : <ArrowUpAZ size={14} />}
                            Name
                        </button>
                        {/* Local Uploads root is read-only — uploads must
                            happen inside a folder. The toolbar Upload
                            button only appears for non-local OTTs. */}
                    </div>
                }
            />

            {/* Hidden inputs for the file/folder pickers. */}
            {is_local && (
                <>
                    <input
                        ref={file_input_ref}
                        type="file"
                        multiple
                        accept="image/*,video/*"
                        className="hidden"
                        onChange={(e) => handle_picker_files(e, 'files')}
                    />
                    <input
                        ref={dir_input_ref}
                        type="file"
                        multiple
                        accept="image/*,video/*"
                        {...({ webkitdirectory: '', directory: '' } as any)}
                        className="hidden"
                        onChange={(e) => handle_picker_files(e, 'directory')}
                    />
                </>
            )}

            {loading ? (
                <div className="flex items-center justify-center py-20 text-text-muted">
                    <Loader2 size={28} className="animate-spin" />
                </div>
            ) : folders.length === 0 ? (
                <div
                    // Tall empty / drop zone so a casual drop anywhere
                    // on the page lands inside the target.
                    className={`flex flex-col items-center justify-center gap-3 p-12 text-center rounded-3xl border-2 border-dashed transition-colors min-h-[calc(100vh-280px)] ${
                        drag_over ? 'border-brand-emerald bg-brand-emerald/15 scale-[1.005]' : 'bg-black/5 dark:bg-white/5 border-border-subtle'
                    }`}
                    onContextMenu={open_background_menu}
                    onDragEnter={handle_drag_enter}
                    onDragOver={handle_drag_over}
                    onDragLeave={handle_drag_leave}
                    onDrop={handle_drop}
                >
                    <Folder size={64} className="text-text-muted opacity-40" />
                    <h3 className="text-xl font-bold text-text-main">{is_local ? 'No folders yet' : 'No stories saved yet'}</h3>
                    <p className="text-sm text-text-muted max-w-md">
                        {is_local
                            ? 'Right-click for "New folder", or drag files / folders here to upload.'
                            : 'Save cards from a nested API page to see story folders here.'}
                    </p>
                </div>
            ) : (
                <div
                    className={`relative grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10 auto-rows-min gap-2 min-h-[40vh] rounded-3xl p-2 transition-colors select-none ${
                        drag_over ? 'ring-2 ring-brand-emerald ring-offset-4 ring-offset-bg-main bg-brand-emerald/5' : ''
                    }`}
                    onClick={selection.handle_background_click}
                    onContextMenu={open_background_menu}
                    onDragEnter={handle_drag_enter}
                    onDragOver={handle_drag_over}
                    onDragLeave={handle_drag_leave}
                    onDrop={handle_drop}
                >
                    {drag_over && (
                        <div className="absolute top-3 right-3 z-10 pointer-events-none flex items-center gap-2 px-3 py-1.5 rounded-full bg-brand-emerald text-white text-xs font-bold shadow-lg shadow-brand-emerald/40">
                            <UploadCloud size={14} />
                            Drop to upload
                        </div>
                    )}
                    {sorted_folders.map(folder => {
                        const fid = story_url_key(folder);
                        const is_sel = selection.is_selected(fid);
                        const is_opened = !is_sel && opened_id === fid;
                        const is_renaming = is_local && rename_target?.key === fid;
                        const is_cut = is_local && folder.parent_item_key
                            ? is_cut_folder(ott_id, folder.parent_item_key)
                            : false;
                        const is_pending = !!folder.parent_item_key && folder.parent_item_key.startsWith('__pending_');
                        return (
                            <button
                                key={fid}
                                type="button"
                                onClick={(e) => {
                                    if (is_renaming) { e.stopPropagation(); return; }
                                    e.stopPropagation();
                                    set_opened_id(null);
                                    selection.handle_item_click(fid, e);
                                }}
                                onDoubleClick={(e) => {
                                    if (is_renaming) { e.stopPropagation(); return; }
                                    e.stopPropagation();
                                    selection.clear();
                                    set_opened_id(fid);
                                    navigate(`/dashboard/library/${ott_id}/${fid}`);
                                }}
                                onContextMenu={(e) => open_folder_menu(e, folder)}
                                className={`group relative flex flex-col items-center gap-1 p-3 rounded-xl focus:outline-none transition-colors ${
                                    is_sel
                                        ? 'bg-brand-emerald/20 ring-2 ring-brand-emerald'
                                        : is_opened
                                            ? 'bg-brand-emerald/10'
                                            : 'hover:bg-brand-emerald/10 focus:bg-brand-emerald/15'
                                } ${is_cut ? 'opacity-50' : ''}`}
                                title={`${folder.title} — ${folder.item_count} item${folder.item_count === 1 ? '' : 's'}${is_cut ? ' (cut)' : ''}`}
                            >
                                <div className="relative">
                                    <Folder
                                        size={56}
                                        className="text-amber-400 fill-amber-400/30 group-hover:text-amber-300 transition-colors"
                                        strokeWidth={1.5}
                                    />
                                    <span className="absolute -bottom-0.5 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-bg-main border border-border-subtle text-[9px] font-bold text-text-main flex items-center justify-center">
                                        {folder.item_count}
                                    </span>
                                    {/* Pending badge — folder is being
                                        created on the server. Disappears
                                        when the API responds and the
                                        temp __pending_ key is swapped
                                        for the real one. */}
                                    {is_pending && (
                                        <span className="absolute -top-1 -right-1 w-[18px] h-[18px] rounded-full bg-brand-emerald text-white shadow-lg flex items-center justify-center">
                                            <Loader2 size={10} className="animate-spin" strokeWidth={3} />
                                        </span>
                                    )}
                                </div>
                                {is_renaming ? (
                                    <input
                                        autoFocus
                                        type="text"
                                        value={rename_target!.value}
                                        onFocus={(e) => e.currentTarget.select()}
                                        onChange={(e) => set_rename_target({ key: fid, value: e.target.value })}
                                        onClick={(e) => e.stopPropagation()}
                                        onDoubleClick={(e) => e.stopPropagation()}
                                        onKeyDown={(e) => {
                                            // Stop the event from reaching the
                                            // window-level Enter handler that
                                            // would navigate into the folder
                                            // immediately after rename.
                                            if (e.key === 'Enter') {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                const v = rename_target!.value;
                                                set_rename_target(null);
                                                void rename_folder_now(folder, v);
                                            } else if (e.key === 'Escape') {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                set_rename_target(null);
                                            }
                                        }}
                                        onBlur={() => {
                                            // rename_target is null when blur
                                            // is triggered by Enter/Escape that
                                            // already handled the commit — guard
                                            // against the double-fire.
                                            if (!rename_target) return;
                                            const v = rename_target.value;
                                            set_rename_target(null);
                                            void rename_folder_now(folder, v);
                                        }}
                                        className="w-full mt-1 px-1.5 py-0.5 text-xs text-text-main bg-bg-main border border-brand-emerald rounded outline-none"
                                    />
                                ) : (
                                    <span
                                        className="text-xs text-text-main text-center w-full line-clamp-2 leading-tight mt-1"
                                        // title={folder.title}
                                    >
                                        {folder.title}
                                    </span>
                                )}
                            </button>
                        );
                    })}
                </div>
            )}

            {/* Upload progress popup is rendered globally — see
                GlobalUploadOverlay mounted in App.tsx. */}

            {/* Right-click context menu */}
            {menu && (
                <ContextMenu x={menu.x} y={menu.y} items={menu.items} on_close={() => set_menu(null)} />
            )}

            <SelectionActionBar
                count={selection.selected_count}
                on_clear={selection.clear}
                on_delete={handle_bulk_delete}
                busy={bulk_deleting}
                label={`${selection.selected_count} ${selection.selected_count === 1 ? 'story' : 'stories'} selected`}
            />
        </>
    );
};

// ── View 3: Files inside a story folder ──────────────────────────────────

type SortKey = 'newest' | 'oldest' | 'title_asc' | 'title_desc' | 'size_desc' | 'size_asc' | 'status';
type StatusFilter = '' | 'pending' | 'downloading' | 'converting' | 'completed' | 'failed';

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
    { value: 'oldest', label: 'Oldest first' },
    { value: 'newest', label: 'Newest first' },
    { value: 'title_asc', label: 'Title A → Z' },
    { value: 'title_desc', label: 'Title Z → A' },
    { value: 'size_desc', label: 'File size (largest)' },
    { value: 'size_asc', label: 'File size (smallest)' },
    { value: 'status', label: 'Status' },
];

const FileListView: React.FC<{ ott_id: string; story_key: string }> = ({ ott_id, story_key }) => {
    const navigate = useNavigate();
    const confirm = useConfirm();
    const [loading, set_loading] = useState(true);
    const [refreshing, set_refreshing] = useState(false);
    const [items, set_items] = useState<LibraryItem[]>([]);
    const [total, set_total] = useState(0);
    const [ott_name, set_ott_name] = useState<string | null>(null);
    const [story_title, set_story_title] = useState<string | null>(null);
    const [playing, set_playing] = useState<LibraryItem | null>(null);
    // HLS preview was removed in the R2 migration — playback uses
    // `playing.file_url` directly via a native <video> element.
    // True from the moment the player overlay opens until the media's
    // Arrow-key navigation while the player overlay is open.
    // Esc closes; ←/→ step through the visible `items` array (no wrap).
    useEffect(() => {
        if (!playing) return;
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') { set_playing(null); return; }
            if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
            const idx = items.findIndex(i => i.id === playing.id);
            if (idx === -1) return;
            const next_idx = e.key === 'ArrowRight' ? idx + 1 : idx - 1;
            if (next_idx < 0 || next_idx >= items.length) return;
            e.preventDefault();
            set_playing(items[next_idx] ?? null);
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [playing, items]);
    const [opened_id, set_opened_id] = useState<string | null>(null);
    const [bulk_deleting, set_bulk_deleting] = useState(false);
    const [download_busy, set_download_busy] = useState(false);
    const [download_progress, set_download_progress] = useState<{ done: number; total: number } | null>(null);
    // Status popup — set to a LibraryItem when the user clicks a row that
    // isn't ready (pending / failed / in-progress). The popup shows the
    // status + a Re-upload button.
    const [status_popup_item, set_status_popup_item] = useState<LibraryItem | null>(null);
    const [reupload_busy, set_reupload_busy] = useState(false);
    // `bulk_reupload_busy` / `status_counts` were used by the Drive
    // queue strip which is gone in the R2-only build.

    // ── Cards-mode chrome (search / filter / sort / pagination) ─────────
    // These only have effect when the user flips the file-view toggle OFF.
    // File-view mode ignores them and always pulls the whole folder so it
    // can render the desktop-style icon grid in one shot.
    const [search, set_search] = useState('');
    const [type_filter, set_type_filter] = useState('');
    const [status_filter, set_status_filter] = useState<StatusFilter>('');
    const [sort_by, set_sort_by] = useState<SortKey>('oldest');
    const [page, set_page] = useState(1);
    const [limit, set_limit] = useState(24);
    const [page_jump_input, set_page_jump_input] = useState<string>('');

    // ── View mode (file-icon grid vs detailed cards) ─────────────────────
    // Backed by per-user `preferences.ott_library_view_mode`. Default ON
    // = file-explorer style icons. Toggling resyncs both localStorage
    // (for instant render on next load) and the backend.
    const { preferences, update_preferences } = useAuth();
    const [view_mode, set_view_mode] = useState<'cards' | 'files'>(() => {
        if (typeof window !== 'undefined') {
            const v = window.localStorage.getItem('ott_library_view_mode');
            if (v === 'files' || v === 'cards') return v;
        }
        return 'files';
    });
    useEffect(() => {
        const remote = preferences.ott_library_view_mode;
        if (remote === 'files' || remote === 'cards') {
            set_view_mode(remote);
            if (typeof window !== 'undefined') {
                window.localStorage.setItem('ott_library_view_mode', remote);
            }
        }
    }, [preferences.ott_library_view_mode]);

    const set_view_mode_persisted = useCallback((next: 'cards' | 'files') => {
        set_view_mode(next);
        if (typeof window !== 'undefined') {
            window.localStorage.setItem('ott_library_view_mode', next);
        }
        void update_preferences({ ott_library_view_mode: next }).catch(() => {});
    }, [update_preferences]);

    const is_ungrouped = story_key === '__ungrouped__';

    // Local Uploads is a file-manager experience — the cards view
    // doesn't make sense there. Force "files" regardless of the
    // user's persisted preference for other OTTs.
    const is_local_for_view = is_local_uploads_name(ott_name);
    const effective_view_mode: 'cards' | 'files' = is_local_for_view ? 'files' : view_mode;

    const fetch_data = useCallback(async (mode: 'initial' | 'refresh') => {
        if (mode === 'initial') set_loading(true);
        else set_refreshing(true);
        try {
            const params: any = effective_view_mode === 'files'
                ? { limit: 1000, page: 1, sort_by }
                : {
                    limit,
                    page,
                    sort_by,
                    ...(search ? { search } : {}),
                    ...(type_filter ? { type: type_filter } : {}),
                    ...(status_filter ? { status: status_filter } : {}),
                };
            if (is_ungrouped) params.ungrouped_only = true;
            else params.parent_item_key = story_key;
            const res = await ott_service.get_library_items(ott_id, params);
            if (!res.success || !res.data) throw new Error(res.message || 'Failed to load files');
            set_items(res.data.items);
            set_total(res.data.pagination?.total ?? res.data.items.length);
            const first_with_title = res.data.items.find(i => i.parent_title);
            if (first_with_title?.parent_title) set_story_title(first_with_title.parent_title);

            const ott_res = await ott_service.list_library_otts();
            if (ott_res.success && ott_res.data) {
                const found = ott_res.data.otts.find(o => o.id === ott_id);
                set_ott_name(found?.name ?? null);
            }
        } catch (err: any) {
            toast.error(err?.message || 'Failed to load files');
        } finally {
            if (mode === 'initial') set_loading(false);
            else set_refreshing(false);
        }
    }, [ott_id, story_key, is_ungrouped, effective_view_mode, page, limit, sort_by, search, type_filter, status_filter]);
    const load = useCallback(() => fetch_data('initial'), [fetch_data]);
    const refresh = useCallback(() => fetch_data('refresh'), [fetch_data]);
    useEffect(() => { load(); }, [load]);

    // The "has_in_transit" / status-counts effect was removed in the
    // R2 migration — rows now exist only when the upload succeeded so
    // there's nothing to count beyond `items.length`.

    // Reset page to 1 when any filter changes — same behaviour as the
    // legacy library page so the user doesn't end up looking at "page 5
    // of 1" after narrowing the result set.
    useEffect(() => {
        set_page(1);
    }, [search, type_filter, status_filter, sort_by]);

    // Switching to file view → fetch the whole list (paging doesn't apply).
    // Switching to cards → reset to page 1 so the user lands at the start
    // of the paginated set.
    useEffect(() => {
        set_page(1);
    }, [view_mode]);

    // display_title is computed further down — after the breadcrumbs
    // state is declared in the Local Uploads block. The breadcrumb leaf
    // is the source of truth when items[].parent_title is empty (i.e.
    // a folder with only subfolders, or an empty folder).
    let display_title = is_ungrouped ? 'Ungrouped' : (story_title ?? 'Loading…');

    // Pagination math used by the toolbar below. total comes from the
    // backend; we only render the bar in cards mode.
    const total_pages = Math.max(1, Math.ceil(total / limit));
    const first_visible_item = total === 0 ? 0 : ((page - 1) * limit) + 1;
    const last_visible_item = Math.min(page * limit, total);

    const ordered_ids = useMemo(() => items.map(i => i.id), [items]);
    // Disable the hook's own Ctrl+A / Esc listeners — FileListView owns
    // all keyboard shortcuts so both files and subfolders are handled in
    // one place with no race between two competing window listeners.
    const selection = useGridSelection({ ordered_ids, enabled: false });

    // ── Schedule wizard state ───────────────────────────────────────────
    const [schedule_open, set_schedule_open] = useState(false);
    const [schedule_initial, set_schedule_initial] = useState<LibraryItem[]>([]);
    const [schedule_status, set_schedule_status] = useState<Record<string, LibraryScheduleStatus>>({});

    // ── Social upload modal — single-item push to YouTube/FB/IG ────────
    const [social_open, set_social_open] = useState(false);
    const [social_item, set_social_item] = useState<LibraryItem | null>(null);

    const load_schedule_status = useCallback(async () => {
        try {
            const res = await calendar_service.get_library_schedule_status({ ott_id });
            if (!res.success || !res.data) return;
            const map: Record<string, LibraryScheduleStatus> = {};
            for (const s of res.data.items) {
                map[s.library_item_id] = s;
            }
            set_schedule_status(map);
        } catch {
            // non-blocking — badges just won't render
        }
    }, [ott_id]);
    useEffect(() => { load_schedule_status(); }, [load_schedule_status]);

    const open_schedule_wizard = useCallback(() => {
        const id_set = selection.selected_ids;
        const picked = items.filter(i => id_set.has(i.id));
        if (picked.length === 0) {
            toast.error('Select at least one file');
            return;
        }
        // Post-R2: a library row exists only when R2 finished, so
        // file_url is the readiness signal. The old status check
        // never passed because the column was dropped.
        const not_ready = picked.filter(p => !p.file_url);
        if (not_ready.length > 0) {
            toast.error(`${not_ready.length} file${not_ready.length === 1 ? '' : 's'} have no R2 URL — re-upload them first`);
            return;
        }
        set_schedule_initial(picked);
        set_schedule_open(true);
    }, [items, selection]);

    // Drop selection rows that vanished on refresh.
    useEffect(() => {
        if (selection.selected_count === 0) return;
        const visible = new Set(ordered_ids);
        const next: string[] = [];
        selection.selected_ids.forEach(id => { if (visible.has(id)) next.push(id); });
        if (next.length !== selection.selected_count) selection.set_selected(next);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ordered_ids]);

    const handle_single_delete = async (id: string) => {
        const ok = await confirm({
            title: 'Delete this item?',
            message: 'This cannot be undone.',
            confirm_label: 'Delete',
            danger: true,
        });
        if (!ok) return;
        set_delete_status({ total: 1, done: 0, started_at: Date.now() });
        try {
            const res = await ott_service.delete_library_item(ott_id, id);
            if (!res.success) throw new Error(res.message);
            update_delete_progress(1);
            toast.success('Deleted');
            // Pure state update — drop the row + decrement total so
            // pagination math stays correct without a refetch.
            set_items(prev => prev.filter(i => i.id !== id));
            set_total(prev => Math.max(0, prev - 1));
        } catch (err: any) {
            toast.error(err?.message || 'Failed to delete');
        } finally {
            set_delete_status(null);
        }
    };

    // ── Local Uploads file-manager behavior ───────────────────────────
    const is_local = is_local_uploads_name(ott_name);
    const [menu, set_menu] = useState<{ x: number; y: number; items: ContextMenuItem[] } | null>(null);
    // Two flavours of inline rename — kind disambiguates which list to
    // patch on Enter. Folders use parent_item_key, items use row id.
    const [rename_target, set_rename_target] = useState<{ kind: 'item' | 'folder'; id: string; value: string } | null>(null);
    const [drag_over, set_drag_over] = useState(false);
    const [drag_over_subfolder, set_drag_over_subfolder] = useState<string | null>(null);
    // Upload progress popup is rendered by <GlobalUploadOverlay> in
    // App.tsx, driven by the module-level upload_status_store.
    const [subfolders, set_subfolders] = useState<LocalUploadsFolder[]>([]);
    // Live ref so keyboard handlers always read the latest list without
    // depending on closure staleness — the effect re-registers on every
    // selection change and can capture a stale `subfolders` copy otherwise.
    const subfolders_ref = useRef<LocalUploadsFolder[]>([]);
    useEffect(() => { subfolders_ref.current = subfolders; }, [subfolders]);
    // Frontend-only sort by subfolder title. Pending placeholders pin
    // to the top so the just-created tile stays visible while the user
    // types its name. Persisted via the same localStorage key the root
    // grid uses, so the user's preference applies everywhere.
    const [folder_sort_dir, set_folder_sort_dir] = useState<'asc' | 'desc'>(() => {
        const v = typeof window !== 'undefined' ? window.localStorage.getItem('library:folder_sort_dir') : null;
        return v === 'desc' ? 'desc' : 'asc';
    });
    useEffect(() => {
        try { window.localStorage.setItem('library:folder_sort_dir', folder_sort_dir); }
        catch { /* private mode etc. — ignore */ }
    }, [folder_sort_dir]);
    const sorted_subfolders = useMemo(() => {
        const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });
        const next = [...subfolders];
        next.sort((a, b) => {
            const a_pending = a.parent_item_key.startsWith('__pending_');
            const b_pending = b.parent_item_key.startsWith('__pending_');
            if (a_pending !== b_pending) return a_pending ? -1 : 1;
            const cmp = collator.compare(a.title ?? '', b.title ?? '');
            return folder_sort_dir === 'asc' ? cmp : -cmp;
        });
        return next;
    }, [subfolders, folder_sort_dir]);
    const [breadcrumbs, set_breadcrumbs] = useState<LocalUploadsBreadcrumb[]>([]);
    // Subfolders aren't part of the file `selection` (which is keyed by
    // LibraryItem.id). Track them in a parallel Set so Ctrl+A + bulk
    // operations work uniformly while keeping the existing per-item
    // selection logic untouched. F2 / Enter / Rename use the SINGLE
    // active subfolder (size === 1 sentinel).
    const [selected_subfolder_keys, set_selected_subfolder_keys] = useState<Set<string>>(new Set());
    // AbortController for in-flight upload (Cancel button).
    const upload_abort_ref = useRef<AbortController | null>(null);
    const focused_subfolder_key = selected_subfolder_keys.size === 1
        ? Array.from(selected_subfolder_keys)[0]!
        : null;
    const set_focused_subfolder_key = useCallback((key: string | null) => {
        set_selected_subfolder_keys(key === null ? new Set() : new Set([key]));
    }, []);

    const handle_bulk_download = useCallback(async () => {
        // Show spinner on the button immediately, before any async work.
        set_download_busy(true);
        set_download_progress({ done: 0, total: 0 });

        try {
            const id_set = selection.selected_ids;
            const direct_targets = items.filter((i: LibraryItem) => id_set.has(i.id) && i.file_url);

            // Collect items inside selected subfolders.
            const folder_items: LibraryItem[] = [];
            if (selected_subfolder_keys.size > 0) {
                for (const folder_key of Array.from(selected_subfolder_keys) as string[]) {
                    try {
                        const res = await ott_service.get_library_items(ott_id, { parent_item_key: folder_key, limit: 1000, page: 1 });
                        if (res.success && res.data) {
                            folder_items.push(...res.data.items.filter((i: LibraryItem) => i.file_url));
                        }
                    } catch { /* skip */ }
                }
            }

            const all_targets = [...direct_targets, ...folder_items];
            if (all_targets.length === 0) {
                toast.error('No downloadable files in selection');
                return;
            }

            set_download_progress({ done: 0, total: all_targets.length });
            const tid = toast.loading(`Downloading 1 / ${all_targets.length}…`);
            let failed = 0;
            for (let idx = 0; idx < all_targets.length; idx++) {
                const item = all_targets[idx]!;
                toast.loading(`Downloading ${idx + 1} / ${all_targets.length}…`, { id: tid });
                try {
                    const response = await fetch(item.file_url!);
                    if (!response.ok) throw new Error(`HTTP ${response.status}`);
                    const blob = await response.blob();
                    const obj_url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = obj_url;
                    a.download = item.file_name || item.title || `file_${idx + 1}`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    setTimeout(() => URL.revokeObjectURL(obj_url), 60_000);
                } catch {
                    failed++;
                }
                set_download_progress({ done: idx + 1, total: all_targets.length });
            }
            if (failed === 0) {
                toast.success(
                    all_targets.length === 1
                        ? `Downloaded: ${all_targets[0]!.title || all_targets[0]!.file_name || 'file'}`
                        : `All ${all_targets.length} files downloaded`,
                    { id: tid },
                );
            } else {
                toast.error(`${failed} of ${all_targets.length} file${failed === 1 ? '' : 's'} failed to download`, { id: tid });
            }
        } finally {
            set_download_busy(false);
            set_download_progress(null);
        }
    }, [items, selection, selected_subfolder_keys, ott_id]);

    const handle_bulk_delete = useCallback(async () => {
        const item_ids = Array.from(selection.selected_ids);
        const folder_targets = subfolders.filter(f => selected_subfolder_keys.has(f.parent_item_key));
        const total_targets = item_ids.length + folder_targets.length;
        if (total_targets === 0) return;
        const parts: string[] = [];
        if (folder_targets.length > 0) parts.push(`${folder_targets.length} folder${folder_targets.length === 1 ? '' : 's'}`);
        if (item_ids.length > 0) parts.push(`${item_ids.length} item${item_ids.length === 1 ? '' : 's'}`);
        const ok = await confirm({
            title: total_targets === 1 ? 'Delete this?' : `Delete ${parts.join(' and ')}?`,
            message: folder_targets.length > 0
                ? 'Everything inside the selected folder(s) will also be removed. This cannot be undone.'
                : 'This cannot be undone.',
            confirm_label: 'Delete',
            danger: true,
        });
        if (!ok) return;
        set_bulk_deleting(true);
        const folder_item_count = folder_targets.reduce((acc, f) => acc + Math.max(f.item_count, 1), 0);
        set_delete_status({
            total: Math.max(item_ids.length + folder_item_count, total_targets),
            done: 0,
            label: total_targets === 1
                ? (folder_targets[0]?.title ?? 'file')
                : parts.join(' + '),
            started_at: Date.now(),
        });
        try {
            // Subfolders go through the recursive delete endpoint
            // (per target) — wipes the placeholder, every nested
            // subfolder, and every file inside the subtree on disk +
            // Drive. Pure state update on success: filter the row out
            // of `subfolders`, then drop its key from the selection.
            const deleted_folder_keys = new Set<string>();
            for (const t of folder_targets) {
                try {
                    const res = await local_uploads_service.delete_folder(ott_id, t.parent_item_key);
                    if (!res.success) throw new Error(res.message || 'Delete failed');
                    update_delete_progress(res.data?.deleted ?? Math.max(t.item_count, 1));
                    deleted_folder_keys.add(t.parent_item_key);
                } catch (err: any) {
                    toast.error(err?.message || `Failed to delete "${t.title}"`);
                }
            }
            if (deleted_folder_keys.size > 0) {
                set_subfolders(prev => prev.filter(f => !deleted_folder_keys.has(f.parent_item_key)));
                set_selected_subfolder_keys(prev => {
                    const next = new Set(prev);
                    for (const k of deleted_folder_keys) next.delete(k);
                    return next;
                });
            }
            // Files in the current folder.
            if (item_ids.length > 0) {
                const res = await ott_service.bulk_delete_library_items(ott_id, item_ids);
                if (!res.success || !res.data) throw new Error(res.message || 'Bulk delete failed');
                update_delete_progress(res.data.deleted ?? item_ids.length);
                const deleted_set = new Set(item_ids);
                set_items(prev => prev.filter(i => !deleted_set.has(i.id)));
                set_total(prev => Math.max(0, prev - item_ids.length));
                selection.clear();
                const total = res.data.deleted + deleted_folder_keys.size;
                toast.success(`Deleted ${total} item${total === 1 ? '' : 's'}`);
            } else if (deleted_folder_keys.size > 0) {
                toast.success(`Deleted ${deleted_folder_keys.size} folder${deleted_folder_keys.size === 1 ? '' : 's'}`);
            }
            // No void load() — state already reflects the change.
        } catch (err: any) {
            toast.error(err?.message || 'Bulk delete failed');
        } finally {
            set_delete_status(null);
            set_bulk_deleting(false);
        }
    }, [ott_id, selection, confirm, subfolders, selected_subfolder_keys]);

    const file_input_ref = useRef<HTMLInputElement | null>(null);
    // Subscribe to clipboard so cut tiles re-render dimmed.
    const clipboard = useLocalUploadsClipboard();
    void clipboard; // referenced via is_cut_*

    // Fallback title from breadcrumbs — only kicks in when the items
    // list didn't supply a parent_title (e.g. an empty folder, or a
    // folder containing only subfolders, where get_library_items
    // returns nothing and so `story_title` stays null).
    if (!is_ungrouped && !story_title) {
        const leaf = breadcrumbs[breadcrumbs.length - 1]?.title;
        if (leaf) display_title = leaf;
    }

    const target_parent_key = is_ungrouped ? null : story_key;
    const target_parent_title = is_ungrouped ? null : (story_title ?? null);

    // Pull subfolders + breadcrumbs whenever Local Uploads is active
    // and the current folder changes. Independent of the file fetch so
    // a refresh doesn't have to re-fetch both.
    const fetch_subfolders = useCallback(async () => {
        if (!is_local) {
            set_subfolders([]);
            set_breadcrumbs([]);
            return;
        }
        try {
            const res = await local_uploads_service.list_folders(ott_id, target_parent_key);
            if (res.success && res.data) set_subfolders(res.data.folders);
            if (target_parent_key) {
                const bc_res = await local_uploads_service.folder_breadcrumbs(ott_id, target_parent_key);
                if (bc_res.success && bc_res.data) set_breadcrumbs(bc_res.data.breadcrumbs);
            } else {
                set_breadcrumbs([]);
            }
        } catch {
            // Non-blocking — the file grid still renders without subfolders.
        }
    }, [is_local, ott_id, target_parent_key]);
    useEffect(() => { void fetch_subfolders(); }, [fetch_subfolders]);

    const upload_files_into_folder = useCallback(async (
        files: Array<{ file: File; relative_path: string | null }>,
    ) => {
        if (files.length === 0) return;
        const controller = new AbortController();
        upload_abort_ref.current = controller;
        const total_bytes = files.reduce((a, f) => a + f.file.size, 0);
        set_upload_status({
            count: files.length,
            done_count: 0,
            loaded: 0,
            total: total_bytes,
            abort: () => controller.abort(),
            label: target_parent_title ?? undefined,
            started_at: Date.now(),
        });
        try {
            const res = await local_uploads_service.upload_files({
                ott_id,
                files: files.map(f => f.file),
                relative_paths: files.map(f => f.relative_path),
                parent_item_key: target_parent_key,
                parent_title: target_parent_title,
                signal: controller.signal,
                on_progress: (loaded, total) => update_upload_progress(loaded, total),
                on_file_done: () => bump_upload_done_count(),
            });
            if (!res.success || !res.data) throw new Error(res.message || 'Upload failed');
            // Files directly inside the CURRENT folder go straight
            // into the items grid.
            const same_folder = res.data.items.filter(it => {
                if (is_ungrouped) return !it.parent_item_key;
                return it.parent_item_key === story_key;
            });
            if (same_folder.length > 0) {
                set_items(prev => [...prev, ...same_folder]);
                set_total(prev => prev + same_folder.length);
            }
            // Files that landed in a NEW SUBFOLDER (the user dropped a
            // folder OR uploaded files with relative_paths) won't match
            // the filter above. Refetch subfolders so the brand-new
            // folder tile shows up immediately — without this, the new
            // folder was invisible until a hard refresh.
            const created_outside_current = res.data.items.some(it => {
                if (is_ungrouped) return !!it.parent_item_key;
                return it.parent_item_key !== story_key;
            });
            if (created_outside_current) {
                void fetch_subfolders();
            }
            toast.success(`Uploaded ${res.data.count} file${res.data.count === 1 ? '' : 's'}`);
        } catch (err: any) {
            const cancelled = err?.code === 'ERR_CANCELED' || err?.name === 'CanceledError';
            if (!cancelled) toast.error(err?.message || 'Upload failed');
        } finally {
            set_upload_status(null);
            upload_abort_ref.current = null;
        }
    }, [ott_id, target_parent_key, target_parent_title, is_ungrouped, story_key, fetch_subfolders]);

    const rename_item_now = useCallback(async (item: LibraryItem, next_name: string) => {
        const trimmed = next_name.trim();
        if (!trimmed || trimmed === item.title) return;
        try {
            const res = await local_uploads_service.rename_item(ott_id, item.id, trimmed);
            if (!res.success || !res.data) throw new Error(res.message || 'Rename failed');
            toast.success('Renamed');
            const updated = res.data;
            set_items(prev => prev.map(i => i.id === item.id ? { ...i, title: updated.title } : i));
        } catch (err: any) {
            toast.error(err?.message || 'Rename failed');
        }
    }, [ott_id]);

    const delete_item_now = useCallback(async (item: LibraryItem) => {
        const ok = await confirm({
            title: `Delete "${item.title || item.file_name || 'this item'}"?`,
            message: 'This cannot be undone.',
            confirm_label: 'Delete',
            danger: true,
        });
        if (!ok) return;
        set_delete_status({
            total: 1,
            done: 0,
            label: item.title || item.file_name || undefined,
            started_at: Date.now(),
        });
        try {
            const res = await local_uploads_service.delete_item(ott_id, item.id);
            if (!res.success) throw new Error(res.message || 'Delete failed');
            update_delete_progress(1);
            toast.success('Deleted');
            set_items(prev => prev.filter(i => i.id !== item.id));
        } catch (err: any) {
            toast.error(err?.message || 'Delete failed');
        } finally {
            set_delete_status(null);
        }
    }, [ott_id, confirm]);

    const open_picker = useCallback(() => {
        const input = file_input_ref.current;
        if (input) { input.value = ''; input.click(); }
    }, []);

    const handle_picker_files = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
        const list = e.target.files;
        if (!list || list.length === 0) return;
        const arr: Array<{ file: File; relative_path: string | null }> = [];
        for (let i = 0; i < list.length; i++) {
            const f = list.item(i);
            if (!f) continue;
            arr.push({ file: f, relative_path: null });
        }
        const { accepted, rejected } = filter_local_uploads(arr);
        if (rejected.length > 0) {
            toast(
                `Skipped ${rejected.length} non-image/video file${rejected.length === 1 ? '' : 's'}`,
                { icon: '⚠️' },
            );
        }
        if (accepted.length === 0) return;
        await upload_files_into_folder(accepted);
    }, [upload_files_into_folder]);

    /**
     * Create a subfolder inside the CURRENT folder. Only valid when
     * we're already inside a Local Uploads folder (target_parent_key
     * is non-null) — at OTT root the StoryGridView handles this.
     */
    const create_subfolder_now = useCallback(() => {
        if (!is_local) return;
        const taken = new Set(subfolders.map(f => (f.title ?? '').trim().toLowerCase()));
        let name = 'New folder';
        let i = 2;
        while (taken.has(name.toLowerCase())) {
            name = `New folder (${i++})`;
        }
        // Optimistic: row appears INSTANTLY with the rename input
        // open. The actual create_folder API call is deferred to the
        // rename submit so we get a single round-trip with the
        // user's chosen name.
        const temp_key = `__pending_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const optimistic: LocalUploadsFolder = {
            parent_item_key: temp_key,
            parent_folder_key: target_parent_key,
            title: name,
            item_count: 0,
            subfolder_count: 0,
            file_count: 0,
            created_at: new Date().toISOString(),
        };
        set_subfolders(prev => [optimistic, ...prev]);
        selection.clear();
        set_rename_target({ kind: 'folder', id: temp_key, value: name });
    }, [is_local, subfolders, selection, target_parent_key]);

    const rename_subfolder_now = useCallback(async (folder: LocalUploadsFolder, next_name: string) => {
        const trimmed = next_name.trim();

        // Pending optimistic folder — first commit. Call create_folder
        // with the user's chosen name (or default) and swap the temp
        // key for the real one. Single round-trip instead of
        // create-then-rename.
        if (folder.parent_item_key.startsWith('__pending_')) {
            const final_name = trimmed || folder.title || 'New folder';
            const temp_key = folder.parent_item_key;
            // Update the title in state immediately so the tile
            // doesn't flash "New folder" while the API resolves.
            set_subfolders(prev => prev.map(f =>
                f.parent_item_key === temp_key
                    ? { ...f, title: final_name }
                    : f,
            ));
            try {
                const res = await local_uploads_service.create_folder(ott_id, final_name, target_parent_key);
                if (!res.success || !res.data) throw new Error(res.message || 'Failed to create folder');
                const real_key = res.data.parent_item_key;
                // Backend dedupes against siblings; use the returned
                // title so the tile reflects "ug copy" / "ug copy 2"
                // when the typed name already existed.
                const real_title = res.data.parent_title ?? final_name;
                set_subfolders(prev => prev.map(f =>
                    f.parent_item_key === temp_key
                        ? { ...f, parent_item_key: real_key, title: real_title }
                        : f,
                ));
            } catch (err: any) {
                set_subfolders(prev => prev.filter(f => f.parent_item_key !== temp_key));
                toast.error(err?.message || 'Failed to create folder');
            }
            return;
        }

        if (!trimmed || trimmed === folder.title) return;
        try {
            const res = await local_uploads_service.rename_folder(ott_id, folder.parent_item_key, trimmed);
            if (!res.success || !res.data) throw new Error(res.message || 'Rename failed');
            const real_title = res.data.parent_title ?? trimmed;
            set_subfolders(prev => prev.map(f =>
                f.parent_item_key === folder.parent_item_key ? { ...f, title: real_title } : f,
            ));
            toast.success('Folder renamed');
        } catch (err: any) {
            toast.error(err?.message || 'Rename failed');
        }
    }, [ott_id, target_parent_key]);

    const delete_subfolder_now = useCallback(async (folder: LocalUploadsFolder) => {
        const ok = await confirm({
            title: `Delete "${folder.title}"?`,
            message: 'Everything inside will also be removed. This cannot be undone.',
            confirm_label: 'Delete',
            danger: true,
        });
        if (!ok) return;
        set_delete_status({
            total: Math.max(folder.item_count, 1),
            done: 0,
            label: folder.title,
            started_at: Date.now(),
        });
        try {
            const res = await local_uploads_service.delete_folder(ott_id, folder.parent_item_key);
            if (!res.success) throw new Error(res.message || 'Delete failed');
            update_delete_progress(folder.item_count || 1);
            set_subfolders(prev => prev.filter(f => f.parent_item_key !== folder.parent_item_key));
            toast.success('Folder deleted');
        } catch (err: any) {
            toast.error(err?.message || 'Delete failed');
        } finally {
            set_delete_status(null);
        }
    }, [ott_id, confirm]);

    const open_background_menu = useCallback((e: React.MouseEvent) => {
        if (!is_local) return;
        e.preventDefault();
        const cb = get_clipboard();
        const can_paste = !!(cb && cb.ott_id === ott_id && (cb.item_ids.length + cb.folder_keys.length) > 0);
        set_menu({
            x: e.clientX,
            y: e.clientY,
            items: [
                { label: 'New folder', icon: FolderPlus, on_click: () => void create_subfolder_now(), shortcut: 'Shift+N', separator_after: true },
                { label: 'Upload files…', icon: Upload, on_click: open_picker, separator_after: true },
                {
                    label: cb ? `Paste (move ${cb.count})` : 'Paste',
                    icon: ClipboardPaste,
                    on_click: () => {
                        if (!can_paste) return;
                        // Synthesize a Ctrl+V keypress: same code path,
                        // single source of truth.
                        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'v', ctrlKey: true, bubbles: true }));
                    },
                    disabled: !can_paste,
                    separator_after: true,
                },
                {
                    label: 'Refresh',
                    icon: RefreshCw,
                    on_click: () => {
                        void refresh();
                        void fetch_subfolders();
                    },
                },
            ],
        });
    }, [is_local, open_picker, refresh, create_subfolder_now, ott_id, fetch_subfolders]);

    const open_subfolder_menu = useCallback((e: React.MouseEvent, folder: LocalUploadsFolder) => {
        if (!is_local) return;
        e.preventDefault();
        e.stopPropagation();
        set_menu({
            x: e.clientX,
            y: e.clientY,
            items: [
                { label: 'Open', icon: FolderOpen, on_click: () => navigate(`/dashboard/library/${ott_id}/${folder.parent_item_key}`), separator_after: true },
                { label: 'Cut', icon: Scissors, on_click: () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'x', ctrlKey: true })), shortcut: 'Ctrl+X', separator_after: true },
                { label: 'Rename', icon: Edit3, on_click: () => set_rename_target({ kind: 'folder', id: folder.parent_item_key, value: folder.title }), shortcut: 'F2', separator_after: true },
                { label: 'Delete', icon: Trash2, on_click: () => delete_subfolder_now(folder), danger: true },
            ],
        });
    }, [is_local, ott_id, delete_subfolder_now]);

    const open_item_menu = useCallback((e: React.MouseEvent, item: LibraryItem) => {
        if (!is_local) return;
        e.preventDefault();
        e.stopPropagation();
        // If the right-clicked item isn't currently selected, treat
        // this as a click-then-right-click so cut operates on it.
        if (!selection.is_selected(item.id)) {
            selection.handle_item_click(item.id, e as any);
        }
        set_menu({
            x: e.clientX,
            y: e.clientY,
            items: [
                { label: 'Open', icon: Play, on_click: () => set_playing(item), disabled: !item.file_url, separator_after: true },
                { label: 'Cut', icon: Scissors, on_click: () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'x', ctrlKey: true })), shortcut: 'Ctrl+X', separator_after: true },
                { label: 'Rename', icon: Edit3, on_click: () => set_rename_target({ kind: 'item', id: item.id, value: item.title ?? item.file_name ?? '' }), shortcut: 'F2', separator_after: true },
                { label: 'Delete', icon: Trash2, on_click: () => delete_item_now(item), danger: true },
            ],
        });
    }, [is_local, delete_item_now, selection]);

    // Counter-based drag tracking so the overlay doesn't flicker each
    // time the cursor crosses a child element (every dragenter on a
    // child fires a dragleave on the parent in turn).
    const drag_counter = useRef(0);
    const drag_carries_files = (e: React.DragEvent): boolean => {
        const types = e.dataTransfer?.types;
        if (!types) return false;
        for (let i = 0; i < types.length; i++) if (types[i] === 'Files') return true;
        return false;
    };
    const handle_drag_enter = useCallback((e: React.DragEvent) => {
        if (!is_local) return;
        if (!drag_carries_files(e)) return;
        e.preventDefault();
        drag_counter.current += 1;
        if (drag_counter.current === 1) set_drag_over(true);
    }, [is_local]);
    const handle_drag_over = useCallback((e: React.DragEvent) => {
        if (!is_local) return;
        if (!drag_carries_files(e)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
    }, [is_local]);
    const handle_drag_leave = useCallback(() => {
        drag_counter.current = Math.max(0, drag_counter.current - 1);
        if (drag_counter.current === 0) set_drag_over(false);
    }, []);
    const handle_drop = useCallback(async (e: React.DragEvent) => {
        if (!is_local) return;
        e.preventDefault();
        drag_counter.current = 0;
        set_drag_over(false);
        const collected = await collect_dropped_files(e.dataTransfer);
        if (collected.length === 0) return;
        const { accepted, rejected } = filter_local_uploads(collected);
        if (rejected.length > 0) {
            toast(
                `Skipped ${rejected.length} non-image/video file${rejected.length === 1 ? '' : 's'}`,
                { icon: '⚠️' },
            );
        }
        if (accepted.length === 0) return;
        await upload_files_into_folder(accepted);
    }, [is_local, upload_files_into_folder]);

    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            const target = e.target as HTMLElement | null;
            const tag = target?.tagName?.toLowerCase();
            if (tag === 'input' || tag === 'textarea' || target?.isContentEditable) return;

            // Ctrl+A — select all files AND all subfolders. The
            // useGridSelection hook also calls preventDefault on its
            // own listener, but we call it here too in case the order
            // of listeners reverses on remount — better safe than
            // having the browser's native "Select All Text" leak in
            // and paint the whole page blue.
            if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && (e.key === 'a' || e.key === 'A')) {
                e.preventDefault();
                selection.select_all();
                // Use the live ref — the closure captured at effect-registration
                // time may have a stale `subfolders` copy if the effect re-ran
                // due to a selection change before the subfolder fetch finished.
                const live_subfolders = subfolders_ref.current;
                if (live_subfolders.length > 0) {
                    set_selected_subfolder_keys(new Set(live_subfolders.map(f => f.parent_item_key)));
                }
                return;
            }

            // Esc — clear both files and subfolders (hook's own Esc is disabled).
            if (e.key === 'Escape') {
                selection.clear();
                set_selected_subfolder_keys(new Set());
                return;
            }

            // Enter (with or without Alt) — open the active subfolder
            // OR play the selected item. Alt+Enter is an alias so the
            // user can use either keyboard combo.
            if (e.key === 'Enter') {
                if (focused_subfolder_key) {
                    e.preventDefault();
                    navigate(`/dashboard/library/${ott_id}/${focused_subfolder_key}`);
                    return;
                }
                if (selection.selected_count === 1) {
                    const id = Array.from(selection.selected_ids)[0];
                    const item = id ? items.find(i => i.id === id) : null;
                    if (item) {
                        e.preventDefault();
                        if (item.file_url) set_playing(item);
                        else set_status_popup_item(item);
                    }
                }
                return;
            }

            // Delete — works for ALL OTTs, not just Local Uploads.
            // `handle_bulk_delete` already covers BOTH selected subfolders
            // and selected files inside a single confirm dialog, so we
            // route everything through it. Calling delete_subfolder_now
            // per target here would spawn one popup per item.
            if (e.key === 'Delete') {
                if (selection.selected_count > 0 || (is_local && selected_subfolder_keys.size > 0)) {
                    e.preventDefault();
                    handle_bulk_delete();
                }
                return;
            }

            if (!is_local) return;

            // Ctrl+X — cut file selection + all selected subfolders.
            // NO toast — confirmation is the dimmed tile state.
            if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && (e.key === 'x' || e.key === 'X')) {
                const item_ids: string[] = Array.from(selection.selected_ids);
                const folder_keys: string[] = Array.from(selected_subfolder_keys);
                const total = item_ids.length + folder_keys.length;
                if (total === 0) return;
                e.preventDefault();
                set_clipboard({
                    operation: 'cut',
                    ott_id,
                    source_folder_key: target_parent_key,
                    item_ids,
                    folder_keys,
                    count: total,
                    at: Date.now(),
                });
                return;
            }

            // Ctrl+V — paste (move) into the current folder.
            if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && (e.key === 'v' || e.key === 'V')) {
                const cb = get_clipboard();
                if (!cb || cb.ott_id !== ott_id) return;
                e.preventDefault();
                void (async () => {
                    // Friendly summary — file titles + folder titles,
                    // capped — so the status bar shows what's moving.
                    const item_titles = items.filter(i => cb.item_ids.includes(i.id)).map(i => i.title || i.file_name || 'file');
                    const folder_titles = subfolders.filter(f => cb.folder_keys.includes(f.parent_item_key)).map(f => f.title);
                    const labels = [...folder_titles, ...item_titles];
                    const summary_parts = labels.slice(0, 3);
                    const summary = labels.length > 3
                        ? `${summary_parts.join(', ')} +${labels.length - 3} more`
                        : summary_parts.join(', ') || `${cb.count} item${cb.count === 1 ? '' : 's'}`;
                    set_paste_status({
                        operation: 'move',
                        total: cb.count,
                        summary,
                        target_folder_key: target_parent_key,
                        started_at: Date.now(),
                    });
                    try {
                        const res = await local_uploads_service.paste({
                            ott_id,
                            operation: 'move',
                            item_ids: cb.item_ids,
                            folder_keys: cb.folder_keys,
                            target_folder_key: target_parent_key,
                        });
                        if (!res.success) throw new Error(res.message || 'Move failed');
                        clear_clipboard();
                        selection.clear();
                        set_selected_subfolder_keys(new Set());
                        // Full refetch — the previous partial state update
                        // only handled paste-out-of-current-folder. For
                        // paste-INTO-current-folder, moved items wouldn't
                        // appear without a refetch. Refresh both items
                        // and the subfolder strip so destination + source
                        // views stay consistent in one shot.
                        refresh();
                        void fetch_subfolders();
                    } catch (err: any) {
                        toast.error(err?.message || 'Move failed');
                    } finally {
                        set_paste_status(null);
                    }
                })();
                return;
            }

            if (e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey && (e.key === 'N' || e.key === 'n')) {
                e.preventDefault();
                void create_subfolder_now();
                return;
            }
            if (e.key === 'F2') {
                if (focused_subfolder_key) {
                    const folder = subfolders.find(f => f.parent_item_key === focused_subfolder_key);
                    if (folder) {
                        e.preventDefault();
                        set_rename_target({ kind: 'folder', id: folder.parent_item_key, value: folder.title });
                    }
                    return;
                }
                const id = Array.from(selection.selected_ids)[0];
                if (!id) return;
                const item = items.find(i => i.id === id);
                if (!item) return;
                e.preventDefault();
                set_rename_target({ kind: 'item', id, value: item.title ?? item.file_name ?? '' });
                return;
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
        // create_subfolder_now / delete_subfolder_now / handle_bulk_delete
        // are defined below; they're stable per ott_id so they don't need
        // to be listed in deps. Adding them here would trip
        // use-before-declaration.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [is_local, items, selection.selected_count, selection.selected_ids, focused_subfolder_key, selected_subfolder_keys, subfolders, navigate, ott_id, target_parent_key, refresh, fetch_subfolders]);

    return (
        <>
            <Breadcrumbs
                ott_name={ott_name}
                ott_id={ott_id}
                breadcrumbs={is_local && breadcrumbs.length > 0 ? breadcrumbs : undefined}
                story_label={display_title}
            />
            <Header
                title={display_title}
                subtitle={`${items.length} file${items.length === 1 ? '' : 's'} · ${ott_name ?? '…'}`}
                back_to={`/dashboard/library/${ott_id}`}
                back_label={ott_name ?? 'OTT'}
                on_refresh={() => {
                    // Refresh BOTH items and subfolders. Previously this
                    // only refetched items, so a folder upload (which
                    // creates a new subfolder) stayed invisible after
                    // clicking Refresh — only a hard page reload picked
                    // up the new tile.
                    void refresh();
                    void fetch_subfolders();
                }}
                refreshing={refreshing}
                actions={
                    <div className="flex items-center gap-3">
                        {is_local && (
                            <>
                                <button
                                    type="button"
                                    onClick={() => {
                                        // Single button drives both folder tile
                                        // order AND the items grid. Items
                                        // re-sort in-memory via set_items —
                                        // touching sort_by would trigger a
                                        // server refetch via the fetch_data
                                        // dep array, which is wasteful for a
                                        // pure title sort.
                                        const next_dir = folder_sort_dir === 'asc' ? 'desc' : 'asc';
                                        set_folder_sort_dir(next_dir);
                                        set_items((prev: LibraryItem[]) => {
                                            const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });
                                            const label = (i: LibraryItem) =>
                                                (i.title ?? i.file_name ?? '').toString();
                                            const next = [...prev];
                                            next.sort((a, b) => collator.compare(label(a), label(b)));
                                            if (next_dir === 'desc') next.reverse();
                                            return next;
                                        });
                                    }}
                                    className="flex items-center gap-1.5 px-2.5 py-2 rounded-xl border border-border-subtle text-text-muted hover:text-text-main hover:border-text-muted/40 text-xs font-bold transition-colors"
                                    title={`Sort folders + files by name — currently ${folder_sort_dir === 'asc' ? 'A → Z' : 'Z → A'}`}
                                >
                                    {folder_sort_dir === 'asc' ? <ArrowDownAZ size={14} /> : <ArrowUpAZ size={14} />}
                                    Name
                                </button>
                                <button
                                    type="button"
                                    onClick={open_picker}
                                    className="flex items-center gap-2 px-3 py-2 rounded-xl bg-gradient-to-r from-brand-emerald to-brand-blue text-white text-xs font-bold shadow"
                                >
                                    <Upload size={14} /> Upload files
                                </button>
                            </>
                        )}
                        {/* File-view on/off switch — only relevant for
                            non-Local-Uploads OTTs. Local Uploads is a
                            file-manager experience and the cards view
                            doesn't make sense there, so we pin it to
                            "files" and hide the toggle. */}
                        {!is_local && (
                            <label className="flex items-center gap-2 cursor-pointer select-none">
                                <span className="text-xs font-bold text-text-muted uppercase tracking-wider">File view</span>
                                <button
                                    type="button"
                                    role="switch"
                                    aria-checked={view_mode === 'files'}
                                    onClick={() => {
                                        set_view_mode_persisted(view_mode === 'files' ? 'cards' : 'files');
                                        selection.clear();
                                        set_opened_id(null);
                                    }}
                                    className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full p-0.5 transition-colors ${
                                        view_mode === 'files'
                                            ? 'bg-gradient-to-r from-brand-emerald to-brand-blue'
                                            : 'bg-bg-card border border-border-subtle'
                                    }`}
                                    title={view_mode === 'files' ? 'Showing files only — click to expand to full view' : 'Click to switch to file-only view'}
                                >
                                    <span
                                        className={`inline-block h-6 w-6 rounded-full bg-white shadow-md transition-transform ${
                                            view_mode === 'files' ? 'translate-x-5' : 'translate-x-0'
                                        }`}
                                    />
                                </button>
                            </label>
                        )}
                    </div>
                }
            />

            {is_local && (
                <input
                    ref={file_input_ref}
                    type="file"
                    multiple
                    accept="image/*,video/*"
                    className="hidden"
                    onChange={handle_picker_files}
                />
            )}

            {/* Toolbar — search + filters are cards-only (files mode loads
                the whole folder in one shot, no server-side filtering).
                Sort applies in BOTH modes so the user can re-order the
                file list inside a directory. */}
            <div className="flex flex-wrap gap-3 items-center">
                {effective_view_mode === 'cards' && (
                    <>
                        <div className="relative flex-1 min-w-[220px] max-w-md">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted" size={16} />
                            <input
                                type="text"
                                value={search}
                                onChange={(e) => set_search(e.target.value)}
                                placeholder="Search title, URL, file name..."
                                className="w-full bg-black/5 dark:bg-white/5 border border-border-subtle rounded-2xl pl-12 pr-4 py-2.5 text-sm text-text-main outline-none focus:ring-2 focus:ring-brand-emerald/50"
                            />
                        </div>
                        <div className="flex items-center gap-2 text-xs text-text-muted">
                            <Filter size={14} />
                            <div className="w-44">
                                <CommonSearchSelect
                                    size="sm"
                                    value={status_filter || null}
                                    on_change={(v) => set_status_filter((v ?? '') as StatusFilter)}
                                    is_clearable
                                    placeholder="all statuses"
                                    options={[
                                        { label: 'pending', value: 'pending' },
                                        { label: 'downloading', value: 'downloading' },
                                        { label: 'converting', value: 'converting' },
                                        { label: 'completed', value: 'completed' },
                                        { label: 'failed', value: 'failed' },
                                    ]}
                                />
                            </div>
                            <div className="w-40">
                                <CommonSearchSelect
                                    size="sm"
                                    value={type_filter || null}
                                    on_change={(v) => set_type_filter(v ?? '')}
                                    is_clearable
                                    placeholder="all types"
                                    options={[
                                        { label: 'video', value: 'video' },
                                        { label: 'image', value: 'image' },
                                        { label: 'thumbnail', value: 'thumbnail' },
                                        { label: 'playlist', value: 'playlist' },
                                    ]}
                                />
                            </div>
                        </div>
                    </>
                )}
                <div className="flex items-center gap-2 text-xs text-text-muted ml-auto">
                    <span className="font-bold uppercase tracking-wider">Sort</span>
                    <div className="w-56">
                        <CommonSearchSelect
                            size="sm"
                            value={sort_by}
                            on_change={(v) => set_sort_by((v ?? 'oldest') as SortKey)}
                            options={SORT_OPTIONS.map(o => ({ label: o.label, value: o.value }))}
                            placeholder="Sort by"
                        />
                    </div>
                </div>
            </div>

            {/* Drive queue strip / Re-upload All Issues block were
                removed in the R2 migration — there's no in-flight or
                failed state anymore, so the only useful number was
                the total, which is already shown in the pagination
                bar. */}

            {loading ? (
                <div className="flex items-center justify-center py-20 text-text-muted">
                    <Loader2 size={28} className="animate-spin" />
                </div>
            ) : items.length === 0 && (!is_local || subfolders.length === 0) ? (
                <div
                    // Big drop zone: fills the remaining viewport
                    // height so a casual drop anywhere in the page
                    // lands inside the target. min-h is calc(100vh -
                    // header chrome estimate) so it grows to fill the
                    // page when there's nothing else above.
                    className={`flex flex-col items-center justify-center gap-3 p-12 text-center rounded-3xl border-2 border-dashed transition-colors min-h-[calc(100vh-280px)] ${
                        drag_over ? 'border-brand-emerald bg-brand-emerald/15 scale-[1.005]' : 'bg-black/5 dark:bg-white/5 border-border-subtle'
                    }`}
                    onContextMenu={open_background_menu}
                    onDragEnter={handle_drag_enter}
                    onDragOver={handle_drag_over}
                    onDragLeave={handle_drag_leave}
                    onDrop={handle_drop}
                >
                    <FileIcon size={56} className="text-text-muted opacity-40" />
                    <p className="text-base font-semibold text-text-main">
                        {is_local ? 'No folders or files yet.' : 'No files in this story yet.'}
                    </p>
                    {is_local && (
                        <p className="text-sm text-text-muted max-w-md">
                            Right-click for "New folder", drag files / folders here, or use the buttons above.
                        </p>
                    )}
                </div>
            ) : effective_view_mode === 'cards' ? (
                // Detailed cards — image hero + status + format + icon-only
                // action toolbar. Selection works exactly like the file
                // grid (single click selects, double click opens).
                <div
                    className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5"
                    onClick={selection.handle_background_click}
                >
                    {items.map(item => {
                        const is_sel = selection.is_selected(item.id);
                        const is_opened = !is_sel && opened_id === item.id;
                        return (
                            <div
                                key={item.id}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    set_opened_id(null);
                                    selection.handle_item_click(item.id, e);
                                }}
                                onDoubleClick={(e) => {
                                    e.stopPropagation();
                                    selection.clear();
                                    set_opened_id(item.id);
                                    set_playing(item);
                                }}
                                className={`rounded-3xl transition-shadow ${
                                    is_sel
                                        ? 'ring-2 ring-brand-emerald shadow-lg shadow-brand-emerald/20'
                                        : is_opened
                                            ? 'bg-brand-emerald/10'
                                            : ''
                                }`}
                            >
                                <LibraryCard
                                    item={item}
                                    ott_id={ott_id}
                                    selected={is_sel}
                                    schedule={schedule_status[item.id] ? {
                                        next_scheduledAt: schedule_status[item.id].next_scheduledAt,
                                        platforms: schedule_status[item.id].platforms,
                                    } : null}
                                    on_share_social={() => { set_social_item(item); set_social_open(true); }}
                                    on_play={() => {
                                        if (item.file_url) {
                                            set_playing(item);
                                        } else {
                                            set_status_popup_item(item);
                                        }
                                    }}
                                    on_status_popup={() => set_status_popup_item(item)}
                                    on_delete={() => handle_single_delete(item.id)}
                                    on_retry={async () => {
                                        // Phase-2 reliability flow: use the new /reupload
                                        // endpoint which goes through the concurrent
                                        // queue + lock. Falls back to /retry on legacy
                                        // backends that don't have it yet.
                                        try {
                                            const res = await ott_service.reupload_library_item(ott_id, item.id);
                                            if (!res.success) throw new Error(res.message);
                                            toast.success('Re-upload queued');
                                            void load();
                                        } catch (err: any) {
                                            toast.error(err?.message || 'Re-upload failed');
                                        }
                                    }}
                                    on_copy_path={async () => {
                                        const p = item.file_url ?? item.download_url;
                                        if (!p) return;
                                        try {
                                            await navigator.clipboard.writeText(p);
                                            toast.success('URL copied');
                                        } catch { toast.error('Clipboard not available'); }
                                    }}
                                />
                            </div>
                        );
                    })}
                </div>
            ) : (
                <div
                    className={`relative grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10 auto-rows-min gap-2 min-h-[40vh] rounded-3xl p-2 transition-colors select-none ${
                        drag_over && !drag_over_subfolder
                            ? 'ring-2 ring-brand-emerald ring-offset-4 ring-offset-bg-main bg-brand-emerald/5'
                            : ''
                    }`}
                    onClick={() => {
                        // Background click clears both file selection AND
                        // the active subfolder so the grid behaves as a
                        // single unified selection surface.
                        selection.handle_background_click();
                        set_focused_subfolder_key(null);
                    }}
                    onContextMenu={open_background_menu}
                    onDragEnter={handle_drag_enter}
                    onDragOver={handle_drag_over}
                    onDragLeave={handle_drag_leave}
                    onDrop={handle_drop}
                >
                    {/* Hint pill — floats over the grid corner only while
                        dragging, doesn't block drops (pointer-events-none),
                        and disappears the moment the cursor enters a
                        subfolder tile (which has its own indicator). */}
                    {drag_over && !drag_over_subfolder && (
                        <div className="absolute top-3 right-3 z-10 pointer-events-none flex items-center gap-2 px-3 py-1.5 rounded-full bg-brand-emerald text-white text-xs font-bold shadow-lg shadow-brand-emerald/40">
                            <UploadCloud size={14} />
                            Drop into "{display_title}"
                        </div>
                    )}
                    {/* Subfolders first — rendered as folder tiles, just like
                        the OTT-root grid. Local Uploads only. */}
                    {is_local && sorted_subfolders.map(folder => {
                        const is_renaming = rename_target?.kind === 'folder' && rename_target?.id === folder.parent_item_key;
                        const is_drop = drag_over_subfolder === folder.parent_item_key;
                        const is_focused = selected_subfolder_keys.has(folder.parent_item_key);
                        const is_cut = is_cut_folder(ott_id, folder.parent_item_key);
                        const is_pending = folder.parent_item_key.startsWith('__pending_');
                        return (
                            <button
                                key={`folder:${folder.parent_item_key}`}
                                type="button"
                                onClick={(e) => {
                                    if (is_renaming) { e.stopPropagation(); return; }
                                    e.stopPropagation();
                                    const ctrl = e.ctrlKey || e.metaKey;
                                    if (ctrl) {
                                        // Toggle this folder's selection;
                                        // keep file selection intact.
                                        set_selected_subfolder_keys(prev => {
                                            const next = new Set(prev);
                                            if (next.has(folder.parent_item_key)) next.delete(folder.parent_item_key);
                                            else next.add(folder.parent_item_key);
                                            return next;
                                        });
                                    } else {
                                        selection.clear();
                                        set_selected_subfolder_keys(new Set([folder.parent_item_key]));
                                    }
                                }}
                                onDoubleClick={(e) => {
                                    if (is_renaming) { e.stopPropagation(); return; }
                                    e.stopPropagation();
                                    navigate(`/dashboard/library/${ott_id}/${folder.parent_item_key}`);
                                }}
                                onContextMenu={(e) => {
                                    if (!selected_subfolder_keys.has(folder.parent_item_key)) {
                                        set_selected_subfolder_keys(new Set([folder.parent_item_key]));
                                    }
                                    open_subfolder_menu(e, folder);
                                }}
                                onDragOver={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    e.dataTransfer.dropEffect = 'copy';
                                    set_drag_over_subfolder(folder.parent_item_key);
                                }}
                                onDragLeave={(e) => {
                                    e.stopPropagation();
                                    set_drag_over_subfolder(null);
                                }}
                                onDrop={async (e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    set_drag_over_subfolder(null);
                                    const collected = await collect_dropped_files(e.dataTransfer);
                                    if (collected.length === 0) return;
                                    const { accepted, rejected } = filter_local_uploads(collected);
                                    if (rejected.length > 0) {
                                        toast(
                                            `Skipped ${rejected.length} non-image/video file${rejected.length === 1 ? '' : 's'}`,
                                            { icon: '⚠️' },
                                        );
                                    }
                                    if (accepted.length === 0) return;
                                    const sub_controller = new AbortController();
                                    upload_abort_ref.current = sub_controller;
                                    const total_bytes = accepted.reduce((a, f) => a + f.file.size, 0);
                                    set_upload_status({
                                        count: accepted.length,
                                        done_count: 0,
                                        loaded: 0,
                                        total: total_bytes,
                                        abort: () => sub_controller.abort(),
                                        label: folder.title,
                                        started_at: Date.now(),
                                    });
                                    try {
                                        const res = await local_uploads_service.upload_files({
                                            ott_id,
                                            files: accepted.map(f => f.file),
                                            relative_paths: accepted.map(f => f.relative_path),
                                            parent_item_key: folder.parent_item_key,
                                            parent_title: folder.title,
                                            signal: sub_controller.signal,
                                            on_progress: (loaded, total) => update_upload_progress(loaded, total),
                                            on_file_done: () => bump_upload_done_count(),
                                        });
                                        if (!res.success || !res.data) throw new Error(res.message || 'Upload failed');
                                        toast.success(`Uploaded ${res.data.count} into "${folder.title}"`);
                                        // Bump folder's file_count so the badge updates without a refetch.
                                        set_subfolders(prev => prev.map(sf =>
                                            sf.parent_item_key === folder.parent_item_key
                                                ? { ...sf, file_count: sf.file_count + res.data!.count, item_count: sf.item_count + res.data!.count }
                                                : sf,
                                        ));
                                    } catch (err: any) {
                                        const cancelled = err?.code === 'ERR_CANCELED' || err?.name === 'CanceledError';
                                        if (!cancelled) toast.error(err?.message || 'Upload failed');
                                    } finally {
                                        set_upload_status(null);
                                        upload_abort_ref.current = null;
                                    }
                                }}
                                className={`group relative flex flex-col items-center gap-1 p-3 rounded-xl focus:outline-none transition-colors ${
                                    is_drop ? 'bg-brand-emerald/25 ring-2 ring-brand-emerald'
                                        : is_focused ? 'bg-brand-emerald/20 ring-2 ring-brand-emerald'
                                        : 'hover:bg-brand-emerald/10 focus:bg-brand-emerald/15'
                                } ${is_cut ? 'opacity-50' : ''}`}
                                title={`${folder.title} — ${folder.item_count} item${folder.item_count === 1 ? '' : 's'}${is_cut ? ' (cut)' : ''}`}
                            >
                                <div className="relative">
                                    <Folder size={56} className="text-amber-400 fill-amber-400/30 group-hover:text-amber-300 transition-colors" strokeWidth={1.5} />
                                    <span className="absolute -bottom-0.5 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-bg-main border border-border-subtle text-[9px] font-bold text-text-main flex items-center justify-center">
                                        {folder.item_count}
                                    </span>
                                    {/* Pending badge — folder is being
                                        created on the server. Disappears
                                        when the API responds and the
                                        temp __pending_ key is swapped
                                        for the real one. */}
                                    {is_pending && (
                                        <span className="absolute -top-1 -right-1 w-[18px] h-[18px] rounded-full bg-brand-emerald text-white shadow-lg flex items-center justify-center">
                                            <Loader2 size={10} className="animate-spin" strokeWidth={3} />
                                        </span>
                                    )}
                                </div>
                                {is_renaming ? (
                                    <input
                                        autoFocus
                                        type="text"
                                        value={rename_target!.value}
                                        onFocus={(e) => e.currentTarget.select()}
                                        onChange={(e) => set_rename_target({ kind: 'folder', id: folder.parent_item_key, value: e.target.value })}
                                        onClick={(e) => e.stopPropagation()}
                                        onDoubleClick={(e) => e.stopPropagation()}
                                        onKeyDown={(e) => {
                                            // Stop the event from reaching the
                                            // window-level Enter handler that
                                            // would navigate into the folder
                                            // immediately after rename.
                                            if (e.key === 'Enter') {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                const v = rename_target!.value;
                                                set_rename_target(null);
                                                void rename_subfolder_now(folder, v);
                                            } else if (e.key === 'Escape') {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                set_rename_target(null);
                                            }
                                        }}
                                        onBlur={() => {
                                            // rename_target is null when blur
                                            // is triggered by Enter/Escape that
                                            // already handled the commit — guard
                                            // against the double-fire.
                                            if (!rename_target) return;
                                            const v = rename_target.value;
                                            set_rename_target(null);
                                            void rename_subfolder_now(folder, v);
                                        }}
                                        className="w-full mt-1 px-1.5 py-0.5 text-xs text-text-main bg-bg-main border border-brand-emerald rounded outline-none"
                                    />
                                ) : (
                                    <span className="text-xs text-text-main text-center w-full line-clamp-2 leading-tight mt-1" title={folder.title}>
                                        {folder.title}
                                    </span>
                                )}
                            </button>
                        );
                    })}
                    {items.map(item => {
                        const is_sel = selection.is_selected(item.id);
                        const is_opened = !is_sel && opened_id === item.id;
                        const is_renaming = is_local && rename_target?.kind === 'item' && rename_target?.id === item.id;
                        const is_cut = is_local && is_cut_item(ott_id, item.id);
                        const ext = (item.file_ext || item.original_video_type || item.save_type || '').toLowerCase();
                        // Two visual states for a file tile (post-R2):
                        //   ready    → green when file_url is set.
                        //   failed   → red when a video row somehow has
                        //              no file_url (legacy data).
                        // The "in-flight" / pending state went away with
                        // the Drive flow — a row only exists once R2
                        // confirmed the upload.
                        const is_pending = false;
                        const is_ready = !!item.file_url;
                        const is_failed = !item.file_url && item.save_type === 'video';

                        // Tone priority: failed > ready > save-type tint.
                        const tone = is_failed ? 'text-red-500'
                                   : is_pending ? 'text-amber-400'
                                   : is_ready && item.save_type === 'video' ? 'text-brand-emerald'
                                   : is_ready && (item.save_type === 'image' || item.save_type === 'thumbnail') ? 'text-brand-blue'
                                   : is_ready && item.save_type === 'playlist' ? 'text-amber-400'
                                   : 'text-text-muted';

                        // Failed tiles get a red-tinted SELECTED state so
                        // multi-select for bulk-delete is visually obvious
                        // without losing the "this row is broken" colour.
                        const tile_bg = is_failed
                            ? (is_sel
                                ? 'bg-red-500/20 ring-2 ring-red-500 cursor-pointer'
                                : 'bg-red-500/5 hover:bg-red-500/10 cursor-pointer')
                            : is_pending
                                ? 'opacity-60 cursor-not-allowed'
                                : is_sel
                                    ? 'bg-brand-emerald/20 ring-2 ring-brand-emerald'
                                    : is_opened
                                        ? 'bg-brand-emerald/10'
                                        : 'hover:bg-brand-emerald/10 focus:bg-brand-emerald/15';

                        return (
                            <button
                                key={item.id}
                                type="button"
                                // Only DISABLED for in-transit rows where there's
                                // nothing useful to do. Failed rows must be
                                // clickable so the user can open the popup +
                                // re-upload.
                                disabled={is_pending && !is_renaming}
                                onClick={(e) => {
                                    if (is_renaming) { e.stopPropagation(); return; }
                                    e.stopPropagation();
                                    set_focused_subfolder_key(null);
                                    if (is_pending) return;
                                    // Failed tiles are now SELECTABLE
                                    // (so the user can multi-select and
                                    // bulk-delete them with Delete or
                                    // the action bar). Double-click
                                    // still opens the status popup so
                                    // the existing read-error +
                                    // re-upload flow keeps working.
                                    set_opened_id(null);
                                    selection.handle_item_click(item.id, e);
                                }}
                                onDoubleClick={(e) => {
                                    if (is_renaming) { e.stopPropagation(); return; }
                                    e.stopPropagation();
                                    if (is_pending) return;
                                    if (is_failed || !is_ready) {
                                        set_status_popup_item(item);
                                        return;
                                    }
                                    selection.clear();
                                    set_opened_id(item.id);
                                    set_playing(item);
                                }}
                                onContextMenu={(e) => open_item_menu(e, item)}
                                className={`group relative flex flex-col items-center gap-1 p-3 rounded-xl focus:outline-none transition-colors ${tile_bg} ${is_cut ? 'opacity-50' : ''}`}
                                title={
                                    is_failed
                                        ? `${item.title || item.file_name || 'Untitled'} — failed${item.error_message ? `: ${item.error_message}` : ''} (click to retry)`
                                        : is_pending
                                            ? `${item.title || item.file_name || 'Untitled'} — ${item.status} (${item.progress ?? 0}%)`
                                            : (item.title || item.file_name || 'Untitled')
                                }
                            >
                                {is_pending && (
                                    // No own title — parent <button>
                                    // already shows status + progress in
                                    // its tooltip. Two titles inside one
                                    // tile = the tooltip jumps as the
                                    // cursor moves across child elements.
                                    <span
                                        className="absolute top-1 left-1 flex h-4 w-4 items-center justify-center rounded-full bg-amber-400 text-bg-main shadow"
                                    >
                                        <Loader2 size={10} className="animate-spin" strokeWidth={3} />
                                    </span>
                                )}
                                {is_failed && (
                                    <span
                                        className="absolute top-1 left-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-white shadow"
                                    >
                                        <AlertCircle size={10} strokeWidth={3} />
                                    </span>
                                )}
                                <div className="relative">
                                    {item.save_type === 'video' ? (
                                        <FileVideo size={56} className={tone} strokeWidth={1.5} />
                                    ) : item.save_type === 'image' || item.save_type === 'thumbnail' ? (
                                        <FileImage size={56} className={tone} strokeWidth={1.5} />
                                    ) : item.save_type === 'playlist' ? (
                                        <FileMusic size={56} className={tone} strokeWidth={1.5} />
                                    ) : (
                                        <FileIcon size={56} className={tone} strokeWidth={1.5} />
                                    )}
                                    {ext && (
                                        <span className={`absolute -bottom-0.5 -right-1 px-1.5 h-[18px] rounded-md border text-[9px] font-bold uppercase flex items-center justify-center ${
                                            is_failed
                                                ? 'bg-red-500/15 border-red-500/40 text-red-400'
                                                : is_pending
                                                    ? 'bg-amber-400/15 border-amber-400/40 text-amber-300'
                                                    : 'bg-bg-main border-border-subtle text-text-main'
                                        }`}>
                                            {ext}
                                        </span>
                                    )}
                                </div>
                                {is_renaming ? (
                                    <input
                                        autoFocus
                                        type="text"
                                        value={rename_target!.value}
                                        onFocus={(e) => e.currentTarget.select()}
                                        onChange={(e) => set_rename_target({ kind: 'item', id: item.id, value: e.target.value })}
                                        onClick={(e) => e.stopPropagation()}
                                        onDoubleClick={(e) => e.stopPropagation()}
                                        onKeyDown={(e) => {
                                            // Stop the event from reaching the
                                            // window-level Enter handler that
                                            // would play / open the item right
                                            // after rename.
                                            if (e.key === 'Enter') {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                const v = rename_target!.value;
                                                set_rename_target(null);
                                                void rename_item_now(item, v);
                                            } else if (e.key === 'Escape') {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                set_rename_target(null);
                                            }
                                        }}
                                        onBlur={() => {
                                            // rename_target is null when blur
                                            // is triggered by Enter/Escape that
                                            // already handled the commit — guard
                                            // against the double-fire.
                                            if (!rename_target) return;
                                            const v = rename_target.value;
                                            set_rename_target(null);
                                            void rename_item_now(item, v);
                                        }}
                                        className="w-full mt-1 px-1.5 py-0.5 text-xs text-text-main bg-bg-main border border-brand-emerald rounded outline-none"
                                    />
                                ) : (
                                    <span
                                        // `break-all` lets long names (no
                                        // spaces) wrap mid-word.
                                        // `line-clamp-2` caps at 2 lines.
                                        // The truncate_keeping_ext call
                                        // shortens the source so the
                                        // visible result keeps the
                                        // extension. No `title` here —
                                        // the parent <button> already
                                        // owns the tooltip with richer
                                        // (status-aware) copy; a second
                                        // title on this span would race
                                        // with the button's as the
                                        // cursor moves inside the tile.
                                        className={`text-xs text-center w-full line-clamp-2 break-all leading-tight mt-1 px-0.5 ${
                                            is_failed ? 'text-red-400' : is_pending ? 'text-amber-300' : 'text-text-main'
                                        }`}
                                    >
                                        {truncate_keeping_ext(item.title || item.file_name || 'Untitled', 32)}
                                    </span>
                                )}
                                {/* Always show exact status text under in-flight
                                    and failed tiles. Spec: "show exact status
                                    text on every file card/list row." */}
                                {(is_pending || is_failed) && (
                                    <span className={`text-[9px] uppercase font-bold mt-0.5 tracking-wider ${
                                        is_failed ? 'text-red-400' : 'text-amber-400'
                                    }`}>
                                        {item.status.replace(/_/g, ' ')}
                                        {!is_failed && typeof item.progress === 'number' && item.progress > 0
                                            ? ` ${item.progress}%`
                                            : ''}
                                    </span>
                                )}
                            </button>
                        );
                    })}
                </div>
            )}

            {/* Pagination — cards mode only. File view fits everything in
                one grid so a pager would just be visual noise there. */}
            {effective_view_mode === 'cards' && items.length > 0 && (
                <div className="flex flex-wrap items-center justify-end gap-3 text-xs text-text-muted pt-2">
                    <span>
                        Showing <span className="font-medium text-text-main">{first_visible_item}-{last_visible_item}</span> of <span className="font-medium text-text-main">{total}</span>
                    </span>
                    <label className="flex items-center gap-2">
                        <span>Per page</span>
                        <div className="w-24">
                            <CommonSearchSelect
                                size="sm"
                                value={String(limit)}
                                on_change={(v) => { set_limit(parseInt(v ?? '24', 10)); set_page(1); }}
                                options={[12, 24, 50, 100, 200].map(n => ({ label: String(n), value: String(n) }))}
                            />
                        </div>
                    </label>
                    {total_pages > 1 && (
                        <>
                            <label className="flex items-center gap-2">
                                <span>Page</span>
                                <input
                                    type="number"
                                    min={1}
                                    max={total_pages}
                                    value={page_jump_input || String(page)}
                                    onChange={(e) => set_page_jump_input(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            e.preventDefault();
                                            const n = parseInt(page_jump_input.trim(), 10);
                                            if (Number.isFinite(n) && n >= 1) {
                                                set_page(Math.min(total_pages, n));
                                            }
                                            set_page_jump_input('');
                                        }
                                    }}
                                    onFocus={(e) => e.currentTarget.select()}
                                    onBlur={() => {
                                        if (!page_jump_input) return;
                                        const n = parseInt(page_jump_input.trim(), 10);
                                        if (Number.isFinite(n) && n >= 1) set_page(Math.min(total_pages, n));
                                        set_page_jump_input('');
                                    }}
                                    className="w-14 rounded-xl border border-border-subtle bg-transparent px-2 py-1.5 text-center text-xs font-bold text-text-main outline-none transition-colors hover:border-brand-blue/40 focus:border-brand-blue"
                                    title="Type a page number and press Enter"
                                />
                                <span className="ml-1">of <span className="font-medium text-text-main">{total_pages}</span></span>
                            </label>
                            <div className="flex items-center gap-1">
                                <button
                                    type="button"
                                    onClick={() => set_page(p => Math.max(1, p - 1))}
                                    disabled={page <= 1}
                                    className="flex h-9 items-center gap-1.5 rounded-xl px-3 font-bold text-text-muted transition-colors hover:text-text-main hover:bg-black/5 dark:hover:bg-white/5 disabled:pointer-events-none disabled:opacity-35"
                                >
                                    <ChevronLeft size={15} />
                                    Prev
                                </button>
                                <button
                                    type="button"
                                    onClick={() => set_page(p => Math.min(total_pages, p + 1))}
                                    disabled={page >= total_pages}
                                    className="flex h-9 items-center gap-1.5 rounded-xl px-3 font-bold text-text-muted transition-colors hover:text-text-main hover:bg-black/5 dark:hover:bg-white/5 disabled:pointer-events-none disabled:opacity-35"
                                >
                                    Next
                                    <ChevronRight size={15} />
                                </button>
                            </div>
                        </>
                    )}
                </div>
            )}

            <SelectionActionBar
                count={selection.selected_count + selected_subfolder_keys.size}
                on_clear={() => { selection.clear(); set_selected_subfolder_keys(new Set()); }}
                on_delete={handle_bulk_delete}
                on_download={handle_bulk_download}
                on_schedule={selection.selected_count > 0 ? open_schedule_wizard : undefined}
                busy={bulk_deleting}
                download_busy={download_busy}
                download_progress={download_progress ?? undefined}
                label={
                    selection.selected_count === 0 && selected_subfolder_keys.size > 0
                        ? `${selected_subfolder_keys.size} folder${selected_subfolder_keys.size === 1 ? '' : 's'} selected`
                        : undefined
                }
            />

            <ScheduleUploadModal
                isOpen={schedule_open}
                onClose={() => set_schedule_open(false)}
                initial_items={schedule_initial}
                ott_id={ott_id}
                onSaved={() => {
                    selection.clear();
                    void load_schedule_status();
                }}
            />

            <SocialUploadModal
                isOpen={social_open}
                onClose={() => set_social_open(false)}
                item={social_item}
            />

            <LibraryStatusPopup
                item={status_popup_item}
                busy={reupload_busy}
                onClose={() => set_status_popup_item(null)}
                onReupload={async () => {
                    if (!status_popup_item) return;
                    set_reupload_busy(true);
                    try {
                        const res = await ott_service.reupload_library_item(ott_id, status_popup_item.id);
                        if (!res.success) throw new Error(res.message);
                        toast.success('Re-upload queued');
                        set_status_popup_item(null);
                        void load();
                    } catch (err: any) {
                        toast.error(err?.message || 'Re-upload failed');
                    } finally {
                        set_reupload_busy(false);
                    }
                }}
            />

            {/* Player overlay — natural aspect ratio */}
            {playing && (
                <div
                    className="fixed inset-0 z-[120] flex flex-col items-center justify-center bg-black/85 backdrop-blur-sm p-4 gap-3 m-0"
                    onClick={() => set_playing(null)}
                >
                    <button
                        onClick={() => set_playing(null)}
                        className="absolute top-4 right-4 p-2 rounded-full bg-black/60 text-white/80 hover:text-white hover:bg-black/80 transition-colors"
                        aria-label="Close player"
                    >
                        <X size={22} />
                    </button>
                    {(() => {
                        const idx = items.findIndex((i: LibraryItem) => i.id === playing.id);
                        const prev = idx > 0 ? items[idx - 1] : null;
                        const next = idx >= 0 && idx < items.length - 1 ? items[idx + 1] : null;
                        return (
                            <>
                                <button
                                    onClick={(e: React.MouseEvent) => { e.stopPropagation(); if (prev) set_playing(prev); }}
                                    disabled={!prev}
                                    className="absolute left-4 top-1/2 -translate-y-1/2 p-3 rounded-full bg-black/60 text-white/80 hover:text-white hover:bg-black/80 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                    aria-label="Previous"
                                >
                                    <ChevronLeft size={28} />
                                </button>
                                <button
                                    onClick={(e: React.MouseEvent) => { e.stopPropagation(); if (next) set_playing(next); }}
                                    disabled={!next}
                                    className="absolute right-4 top-1/2 -translate-y-1/2 p-3 rounded-full bg-black/60 text-white/80 hover:text-white hover:bg-black/80 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                    aria-label="Next"
                                >
                                    <ChevronRight size={28} />
                                </button>
                            </>
                        );
                    })()}
                    <div
                        className="flex items-center justify-center max-w-[92vw] max-h-[82vh]"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {(() => {
                            // ── Type dispatch ───────────────────────
                            // Decide which renderer to use BEFORE looking
                            // at URLs. Older code checked drive_video_url
                            // first, so an image's Drive id (which feeds
                            // every URL field) made the <video> branch
                            // win for non-video files. Now we route by
                            // MIME → extension → save_type, then look up
                            // the right URL.
                            const mime = (playing.mime_type ?? '').toLowerCase();
                            const ext = (playing.file_ext ?? playing.original_video_type ?? '').toLowerCase().replace(/^\./, '');
                            // R2 CDN URL is the single source for both
                            // <video> and <img>. Fall back to the
                            // backend stream proxy only for legacy rows
                            // that somehow have no file_url.
                            const stream_url = ott_service.get_library_stream_url(ott_id, playing.id);
                            const image_src = playing.file_url
                                ?? playing.thumbnail_display_url
                                ?? stream_url;
                            const video_src = playing.file_url ?? stream_url;

                            const is_video = mime.startsWith('video/')
                                || playing.save_type === 'video'
                                || /^(mp4|webm|mov|mkv|avi|m3u8|mpd|flv|wmv|3gp)$/.test(ext);
                            const is_image = !is_video && (
                                mime.startsWith('image/')
                                || playing.save_type === 'image'
                                || playing.save_type === 'thumbnail'
                                || /^(jpg|jpeg|png|gif|webp|bmp|svg|heic|avif|tiff?)$/.test(ext)
                            );
                            const is_audio = !is_video && !is_image && (
                                mime.startsWith('audio/')
                                || /^(mp3|wav|ogg|m4a|flac|aac|opus|wma)$/.test(ext)
                            );
                            const is_pdf = mime === 'application/pdf' || ext === 'pdf';
                            const is_text = !is_video && !is_image && !is_audio && !is_pdf && (
                                mime.startsWith('text/')
                                || /^(txt|md|markdown|json|xml|csv|tsv|log|js|jsx|ts|tsx|html|htm|css|scss|sql|yaml|yml|env|sh|py|rb|go|rs|java|c|cpp|h|hpp)$/.test(ext)
                            );

                            if (is_video) {
                                // Native <video> off the R2 CDN URL.
                                // `max-w / max-h + w-auto / h-auto`
                                // preserves the video's natural aspect
                                // ratio — a 9:16 portrait clip stays
                                // tall, a 16:9 stays wide. The wrapper
                                // already bounds the area.
                                return (
                                    <video
                                        src={video_src}
                                        controls
                                        autoPlay
                                        playsInline
                                        poster={playing.thumbnail_display_url ?? undefined}
                                        className="max-w-[92vw] max-h-[82vh] w-auto h-auto rounded-2xl bg-black shadow-2xl"
                                    />
                                );
                            }
                            if (is_image) {
                                return (
                                    <img
                                        src={image_src}
                                        alt={playing.title ?? 'image'}
                                        className="max-w-[92vw] max-h-[82vh] w-auto h-auto rounded-2xl shadow-2xl"
                                    />
                                );
                            }
                            if (is_audio) {
                                return (
                                    <div className="p-6 rounded-2xl bg-bg-card border border-border-subtle min-w-[360px] max-w-[80vw]">
                                        <p className="text-sm font-semibold text-text-main mb-3 truncate" title={playing.title ?? ''}>
                                            {playing.title ?? '(no title)'}
                                        </p>
                                        <audio
                                            controls
                                            autoPlay
                                            src={stream_url}
                                            className="w-full"
                                        />
                                    </div>
                                );
                            }
                            if (is_pdf) {
                                return (
                                    <iframe
                                        src={stream_url}
                                        title={playing.title ?? 'PDF'}
                                        className="w-[92vw] h-[82vh] rounded-2xl bg-white shadow-2xl border-0"
                                    />
                                );
                            }
                            if (is_text) {
                                return (
                                    <iframe
                                        src={stream_url}
                                        title={playing.title ?? 'text'}
                                        className="w-[92vw] h-[82vh] rounded-2xl bg-white shadow-2xl border-0"
                                    />
                                );
                            }
                            // Fallback for unknown types — preview the
                            // source URL (legacy behaviour) or offer a
                            // download. Office docs route here; users can
                            // open them via the "Open" link.
                            const has_source = playing.original_video_url || stream_url;
                            return (
                                <div className="flex flex-col gap-3 items-stretch p-6 rounded-2xl bg-bg-card border border-border-subtle min-w-[360px] max-w-[80vw]">
                                    <p className="text-xs font-bold uppercase tracking-wider text-text-muted">
                                        {ext ? `${ext.toUpperCase()} file` : 'File'}
                                    </p>
                                    <p className="text-sm text-text-main font-semibold truncate" title={playing.title ?? ''}>
                                        {playing.title ?? playing.file_name ?? '(no title)'}
                                    </p>
                                    {playing.original_video_url && (
                                        <p className="text-xs text-text-muted font-mono break-all">{playing.original_video_url}</p>
                                    )}
                                    <div className="flex flex-wrap gap-2 mt-1">
                                        {has_source && (
                                            <a
                                                href={stream_url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-brand-emerald/15 text-brand-emerald text-xs font-bold hover:bg-brand-emerald/25"
                                            >
                                                <ExternalLinkIcon size={14} /> Open in new tab
                                            </a>
                                        )}
                                        <a
                                            href={stream_url}
                                            download={playing.file_name ?? playing.title ?? 'download'}
                                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-brand-blue/15 text-brand-blue text-xs font-bold hover:bg-brand-blue/25"
                                        >
                                            <Download size={14} /> Download
                                        </a>
                                        {playing.original_video_url && (
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    navigator.clipboard.writeText(playing.original_video_url ?? '').then(
                                                        () => toast.success('URL copied'),
                                                        () => toast.error('Clipboard not available'),
                                                    );
                                                }}
                                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-bg-surface text-text-main text-xs font-bold hover:bg-bg-surface/70"
                                            >
                                                <Copy size={14} /> Copy URL
                                            </button>
                                        )}
                                        <button
                                            type="button"
                                            onClick={() => handle_single_delete(playing.id)}
                                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-red-500 text-xs font-bold hover:bg-red-500/10"
                                        >
                                            <Trash2 size={14} /> Delete
                                        </button>
                                    </div>
                                </div>
                            );
                        })()}
                    </div>
                    <p
                        className="text-sm text-white/80 font-medium text-center max-w-[92vw] truncate"
                        onClick={(e) => e.stopPropagation()}
                        title={playing.title ?? ''}
                    >
                        {playing.title ?? '(no title)'}
                    </p>
                </div>
            )}
            {/* Upload progress popup is rendered globally — see
                GlobalUploadOverlay mounted in App.tsx. */}

            {/* Local Uploads — right-click context menu */}
            {is_local && menu && (
                <ContextMenu x={menu.x} y={menu.y} items={menu.items} on_close={() => set_menu(null)} />
            )}

            {/* Suppress unused warnings for helpers that are wired only via the
                 modal — typescript is happy without this no-op. */}
            <div className="hidden">
                <Play size={1} />
                <Download size={1} />
                <RefreshCw size={1} />
                <FolderOpen size={1} />
                <ArrowLeft size={1} />
                <ChevronRight size={1} />
                <motion.div />
            </div>
        </>
    );
};

// ── Shared header (back link + title + refresh) ──────────────────────────

const Header: React.FC<{
    title: string;
    subtitle: string;
    back_to: string;
    back_label: string;
    on_refresh: () => void;
    /** Show a spinner inside the Refresh button while a refresh is
     *  in flight. Click is also disabled to prevent stacked requests. */
    refreshing?: boolean;
    /** Extra controls rendered to the LEFT of the Refresh button. Used by
     *  the file list view to surface the file-view on/off switch. */
    actions?: React.ReactNode;
}> = ({ title, subtitle, back_to, back_label, on_refresh, refreshing, actions }) => {
    const navigate = useNavigate();
    return (
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="flex flex-col gap-2">
                <button
                    onClick={() => navigate(back_to)}
                    className="flex items-center gap-2 text-xs font-bold text-text-muted hover:text-text-main w-fit"
                >
                    <ArrowLeft size={14} /> Back to {back_label}
                </button>
                <h1 className="text-3xl font-black text-text-main tracking-tight flex items-center gap-3">
                    <FolderOpen size={28} className="text-brand-emerald" />
                    <span className="truncate">{title}</span>
                </h1>
                <p className="text-sm text-text-muted">{subtitle}</p>
            </div>
            <div className="flex items-center gap-3">
                {actions}
                <button
                    onClick={on_refresh}
                    disabled={refreshing}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-bg-card border border-border-subtle text-text-main text-sm font-bold hover:border-brand-emerald/50 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                    {refreshing
                        ? <Loader2 size={16} className="animate-spin" />
                        : <RefreshCw size={16} />}
                    {refreshing ? 'Refreshing…' : 'Refresh'}
                </button>
            </div>
        </div>
    );
};

// ── Breadcrumbs ──────────────────────────────────────────────────────────

const Breadcrumbs: React.FC<{
    ott?: OttSummary | null;
    ott_name?: string | null;
    ott_id?: string;
    /** Full nested-folder path for the FileListView. The LAST entry
     *  is the current folder. Earlier entries are clickable parent
     *  folders. When provided, this REPLACES the legacy `story_label`. */
    breadcrumbs?: LocalUploadsBreadcrumb[];
    /** Legacy single-folder label fallback (used by non-Local-Uploads
     *  OTTs which don't have nested folders). */
    story_label?: string | null;
}> = ({ ott, ott_name, ott_id, breadcrumbs, story_label }) => {
    const navigate = useNavigate();
    const ott_label = ott?.name ?? ott_name ?? null;
    const target_ott_id = ott?.id ?? ott_id ?? null;
    // Use the nested breadcrumb chain when supplied; otherwise fall back
    // to the single legacy story_label crumb.
    const crumb_chain: LocalUploadsBreadcrumb[] = breadcrumbs && breadcrumbs.length > 0
        ? breadcrumbs
        : (story_label ? [{ key: '__legacy__', title: story_label }] : []);
    const last_idx = crumb_chain.length - 1;
    return (
        <nav className="flex items-center gap-1.5 text-xs text-text-muted flex-wrap">
            <button
                type="button"
                onClick={() => navigate('/dashboard/library')}
                className="hover:text-text-main font-bold uppercase tracking-wider"
            >
                Library
            </button>
            {ott_label && (
                <>
                    <ChevronRight size={12} className="text-text-muted/60" />
                    <button
                        type="button"
                        onClick={() => target_ott_id && navigate(`/dashboard/library/${target_ott_id}`)}
                        className="hover:text-text-main font-bold uppercase tracking-wider truncate max-w-[40ch]"
                    >
                        {ott_label}
                    </button>
                </>
            )}
            {crumb_chain.map((crumb, idx) => {
                const is_last = idx === last_idx;
                const is_clickable = !is_last && crumb.key !== '__legacy__' && !!target_ott_id;
                return (
                    <React.Fragment key={`${crumb.key}-${idx}`}>
                        <ChevronRight size={12} className="text-text-muted/60" />
                        {is_clickable ? (
                            <button
                                type="button"
                                onClick={() => navigate(`/dashboard/library/${target_ott_id}/${crumb.key}`)}
                                className="hover:text-text-main font-bold uppercase tracking-wider truncate max-w-[40ch]"
                            >
                                {crumb.title}
                            </button>
                        ) : (
                            <span className="font-bold uppercase tracking-wider text-text-main truncate max-w-[40ch]">
                                {crumb.title}
                            </span>
                        )}
                    </React.Fragment>
                );
            })}
        </nav>
    );
};

export default LibraryBrowserPage;
