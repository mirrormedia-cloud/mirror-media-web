/**
 * Library browser as a popup, used by the Media schedule modal as the
 * "Choose from Library" entry point.
 *
 * Mirrors the look + drill-down of /dashboard/library (OTTs grid → story
 * folders grid → file grid) with Windows-Explorer semantics: single click
 * selects (Ctrl=toggle, Shift=range, Ctrl+A=all visible, Esc=clear),
 * double click opens. Folders open the next view; files open a preview
 * overlay (video / image / source URL fallback).
 *
 * All picks must come from a single OTT because the schedule batch is
 * OTT-scoped — the picker locks to the parent's OTT when set.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    X,
    ArrowLeft,
    Folder,
    FolderOpen,
    FileVideo,
    FileImage,
    FileMusic,
    File as FileIcon,
    Loader2,
    Check,
    Clapperboard,
    CheckCircle2,
    Copy,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { ott_service } from '../../../services/ott_service';
import { local_uploads_service, LocalUploadsBreadcrumb } from '../../../services/local_uploads_service';
import { LibraryItem } from '../../../types';
import { useGridSelection } from '../../../hooks/useGridSelection';

const LOCAL_UPLOADS_NAME = 'local uploads';
const is_local_uploads_name = (name: string | null | undefined): boolean =>
    (name ?? '').trim().toLowerCase() === LOCAL_UPLOADS_NAME;

interface OttSummary {
    id: string;
    name: string;
    favicon_url: string | null;
    counts: {
        total: number;
        folder_count: number;
    };
}

interface FolderSummary {
    parent_api_id: string | null;
    parent_item_key: string | null;
    title: string;
    item_count: number;
    completed_count: number;
    failed_count: number;
    in_progress_count: number;
    thumbnail_url: string | null;
}

interface Props {
    isOpen: boolean;
    onClose: () => void;
    initial_selected_ids: string[];
    /** When set, the OTT picker is skipped; user starts inside this OTT
     *  and can't switch. */
    locked_ott_id?: string | null;
    onConfirm: (items: LibraryItem[], ott_id: string) => void;
}

type View = 'otts' | 'stories' | 'files';

const LibraryBrowserPicker: React.FC<Props> = ({
    isOpen,
    onClose,
    initial_selected_ids,
    locked_ott_id = null,
    onConfirm,
}) => {
    const [view, set_view] = useState<View>('otts');
    const [ott_id, set_ott_id] = useState<string | null>(locked_ott_id);
    const [ott_name, set_ott_name] = useState<string | null>(null);
    const [story_key, set_story_key] = useState<string | null>(null);
    const [story_title, set_story_title] = useState<string | null>(null);

    const [otts, set_otts] = useState<OttSummary[]>([]);
    const [folders, set_folders] = useState<FolderSummary[]>([]);
    const [files, set_files] = useState<LibraryItem[]>([]);
    const [loading, set_loading] = useState(false);

    // ── Local Uploads nested navigation ──────────────────────────────
    // For Local Uploads the legacy "flat folders" endpoint can't
    // distinguish root vs nested folders, so we use the dedicated
    // nested-aware endpoint and track the current drill-down level.
    //   null  → at OTT root
    //   <key> → inside that folder (showing ITS direct subfolders
    //           + files in the same view).
    const is_local = is_local_uploads_name(ott_name);
    const [local_parent_key, set_local_parent_key] = useState<string | null>(null);
    const [local_breadcrumbs, set_local_breadcrumbs] = useState<LocalUploadsBreadcrumb[]>([]);

    // Carry picks across folder navigations within the same OTT — the grid
    // selection only knows about visible ids, so we track the full set
    // separately keyed by id → LibraryItem.
    const [picked, set_picked] = useState<Map<string, LibraryItem>>(new Map());

    // Preview state (video / image / source-URL) on double-click.
    const [previewing, set_previewing] = useState<LibraryItem | null>(null);

    // Visual highlight for OTT / folder cards. Explorer convention:
    // single click highlights, double click opens. Folders aren't part of
    // the schedule selection — this is just visual feedback.
    const [highlighted_ott_id, set_highlighted_ott_id] = useState<string | null>(null);
    const [highlighted_folder_key, set_highlighted_folder_key] = useState<string | null>(null);

    // Reset every time the popup opens.
    useEffect(() => {
        if (!isOpen) return;
        set_view(locked_ott_id ? 'stories' : 'otts');
        set_ott_id(locked_ott_id);
        set_ott_name(null);
        set_story_key(null);
        set_story_title(null);
        set_picked(new Map());
        set_previewing(null);
        set_highlighted_ott_id(null);
        set_highlighted_folder_key(null);
        set_local_parent_key(null);
        set_local_breadcrumbs([]);
    }, [isOpen, locked_ott_id]);

    // Reset Local Uploads drill-state whenever the user switches OTT.
    useEffect(() => {
        set_local_parent_key(null);
        set_local_breadcrumbs([]);
    }, [ott_id]);

    // Load OTTs.
    useEffect(() => {
        if (!isOpen || view !== 'otts') return;
        let mounted = true;
        (async () => {
            set_loading(true);
            try {
                const res = await ott_service.list_library_otts();
                if (!res.success || !res.data) throw new Error(res.message);
                if (mounted) set_otts(res.data.otts);
            } catch (err: any) {
                toast.error(err?.message || 'Failed to load OTTs');
            } finally {
                if (mounted) set_loading(false);
            }
        })();
        return () => { mounted = false; };
    }, [isOpen, view]);

    // Load folders.
    //
    // Local Uploads supports a true folder tree, so we use the
    // nested-aware endpoint scoped to `local_parent_key` and also
    // load any files at that same level so the user can pick
    // freely while drilling. Non-Local-Uploads OTTs keep the
    // legacy flat list behaviour.
    useEffect(() => {
        if (!isOpen || view !== 'stories' || !ott_id) return;
        let mounted = true;
        (async () => {
            set_loading(true);
            try {
                // Resolve OTT name first — we need it to detect
                // Local Uploads. Without it, is_local is false on
                // the very first effect tick and we'd hit the
                // legacy endpoint by mistake.
                let resolved_name = ott_name;
                if (!resolved_name) {
                    const ott_res = await ott_service.list_library_otts();
                    if (ott_res.success && ott_res.data) {
                        const found = ott_res.data.otts.find(o => o.id === ott_id);
                        resolved_name = found?.name ?? null;
                        if (mounted && resolved_name) set_ott_name(resolved_name);
                    }
                }
                const local_mode = is_local_uploads_name(resolved_name);

                if (local_mode) {
                    // Subfolders at current level + files at current
                    // level (so user can pick straight from any depth).
                    const [folders_res, files_res] = await Promise.all([
                        local_uploads_service.list_folders(ott_id, local_parent_key),
                        ott_service.get_library_items(ott_id, {
                            // Filter to files at this exact level.
                            // For root (local_parent_key === null)
                            // pass `ungrouped_only` so we don't
                            // accidentally pull every nested file.
                            ...(local_parent_key
                                ? { parent_item_key: local_parent_key }
                                : { ungrouped_only: true }),
                            sort_by: 'oldest',
                            limit: 1000,
                            page: 1,
                        }),
                    ]);
                    if (!folders_res.success || !folders_res.data) {
                        throw new Error(folders_res.message || 'Failed to load folders');
                    }
                    if (!mounted) return;
                    // Map the nested-folder response to the
                    // FolderSummary shape the existing render uses.
                    // `completed_count` stays as file_count because the
                    // "Add Folder (N files)" button only adds direct
                    // files at this level (no recursion into subfolders).
                    // The folder tile renders `item_count` for its badge
                    // so the displayed total matches the main library
                    // page (files + nested subfolders).
                    const mapped: FolderSummary[] = folders_res.data.folders.map(f => ({
                        parent_api_id: null,
                        parent_item_key: f.parent_item_key,
                        title: f.title,
                        item_count: f.item_count,
                        completed_count: f.file_count,
                        failed_count: 0,
                        in_progress_count: Math.max(0, f.item_count - f.file_count),
                        thumbnail_url: null,
                    }));
                    set_folders(mapped);
                    if (files_res.success && files_res.data) {
                        set_files(files_res.data.items);
                    } else {
                        set_files([]);
                    }
                    // Breadcrumbs — only fetched when inside a
                    // specific folder; at root there's nothing to
                    // walk.
                    if (local_parent_key) {
                        const bc_res = await local_uploads_service.folder_breadcrumbs(
                            ott_id,
                            local_parent_key,
                        );
                        if (mounted && bc_res.success && bc_res.data) {
                            set_local_breadcrumbs(bc_res.data.breadcrumbs);
                        }
                    } else {
                        set_local_breadcrumbs([]);
                    }
                } else {
                    const res = await ott_service.get_library_folders(ott_id);
                    if (!res.success || !res.data) throw new Error(res.message);
                    if (mounted) set_folders((res.data.folders as FolderSummary[]).filter(f => f.parent_item_key));
                    set_files([]); // legacy view shows files in the drilled-in `files` view
                }
            } catch (err: any) {
                toast.error(err?.message || 'Failed to load folders');
            } finally {
                if (mounted) set_loading(false);
            }
        })();
        return () => { mounted = false; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen, view, ott_id, local_parent_key]);

    // Load files.
    useEffect(() => {
        if (!isOpen || view !== 'files' || !ott_id || !story_key) return;
        let mounted = true;
        (async () => {
            set_loading(true);
            try {
                const res = await ott_service.get_library_items(ott_id, {
                    parent_item_key: story_key,
                    sort_by: 'oldest',
                    limit: 1000,
                    page: 1,
                });
                if (!res.success || !res.data) throw new Error(res.message);
                if (mounted) {
                    set_files(res.data.items);
                    const first_with_title = res.data.items.find(i => i.parent_title);
                    if (first_with_title?.parent_title) set_story_title(first_with_title.parent_title);
                }
            } catch (err: any) {
                toast.error(err?.message || 'Failed to load files');
            } finally {
                if (mounted) set_loading(false);
            }
        })();
        return () => { mounted = false; };
    }, [isOpen, view, ott_id, story_key]);

    // ── Navigation ─────────────────────────────────────────────────────
    const open_ott = useCallback((o: OttSummary) => {
        set_ott_id(o.id);
        set_ott_name(o.name);
        set_view('stories');
    }, []);

    // Folder highlight and file picks are mutually exclusive — "Add Folder"
    // and "Add Files" are different actions, so selecting one clears the
    // other. Without this you can end up with the folder-bulk-mode footer
    // ("Folder selected: ... 0 completed files will be added") AND a file
    // marked with the check icon at the same time, which is contradictory.
    const highlight_folder_exclusive = useCallback((key: string | null) => {
        set_highlighted_folder_key(key);
        if (key) {
            set_picked(new Map());
            selection.clear();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    const clear_folder_highlight_for_file_pick = useCallback(() => {
        set_highlighted_folder_key(null);
    }, []);

    const open_folder = useCallback((f: FolderSummary) => {
        // Local Uploads → drill in place (refetch subfolders + files
        // at this new level). Other OTTs → keep the legacy
        // stories→files transition.
        if (is_local) {
            set_local_parent_key(f.parent_item_key);
            set_highlighted_folder_key(null);
            return;
        }
        set_story_key(f.parent_item_key);
        set_story_title(f.title);
        set_view('files');
    }, [is_local]);

    const go_back = useCallback(() => {
        // Local Uploads in nested folder → pop one level up.
        if (is_local && view === 'stories' && local_parent_key) {
            const parent_trail = local_breadcrumbs.slice(0, -1);
            const new_key = parent_trail.length > 0
                ? parent_trail[parent_trail.length - 1]!.key
                : null;
            set_local_parent_key(new_key);
            set_highlighted_folder_key(null);
            return;
        }
        if (view === 'files') {
            set_view('stories');
            set_story_key(null);
            set_files([]);
        } else if (view === 'stories' && !locked_ott_id) {
            set_view('otts');
            set_ott_id(null);
            set_ott_name(null);
            set_folders([]);
            set_files([]);
        }
    }, [view, locked_ott_id, is_local, local_parent_key, local_breadcrumbs]);

    // ── Selection (Explorer semantics) ─────────────────────────────────
    // Only the file view supports multi-select; the visible ordered ids
    // are the eligible (completed) files in render order. The hook handles
    // Ctrl+A, Shift-range, Ctrl-toggle, and Esc-clear automatically.
    // Post-R2: rows exist only when the R2 upload succeeded, so the
    // readiness check is `file_url`, not the dropped `status` column.
    // Without this, eligible_files was always empty → the parent's
    // `picked` map never received the selected file → "Add 0 Files"
    // stayed disabled even after the user clicked something.
    const eligible_files = useMemo(() => files.filter(f => !!f.file_url), [files]);
    const ordered_ids = useMemo(() => eligible_files.map(f => f.id), [eligible_files]);

    const selection = useGridSelection({
        ordered_ids,
        // Selection is also enabled in the stories view for Local
        // Uploads, where files live alongside folders inline.
        enabled: isOpen && !previewing && (view === 'files' || (is_local && view === 'stories')),
    });

    // Pre-seed selection with the parent's existing picks the first time
    // the user lands on the files view AND they overlap with what's loaded.
    useEffect(() => {
        if (!isOpen) return;
        const in_pick_view = view === 'files' || (is_local && view === 'stories');
        if (!in_pick_view || files.length === 0) return;
        const seed_ids = initial_selected_ids.filter(id => files.some(f => f.id === id));
        if (seed_ids.length === 0) return;
        if (selection.selected_count === 0) selection.set_selected(seed_ids);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen, view, files, is_local]);

    // Push the current visible selection into the cross-folder `picked`
    // map. Items that are no longer visible stay picked unless explicitly
    // removed — Explorer-style selection on the visible set, additive
    // across folder navigation.
    useEffect(() => {
        // Both legacy files view and Local Uploads' inline files in
        // the stories view participate in selection.
        if (view !== 'files' && !(is_local && view === 'stories')) return;
        set_picked(prev => {
            const next = new Map(prev);
            // Add anything newly selected.
            for (const f of eligible_files) {
                if (selection.selected_ids.has(f.id)) next.set(f.id, f);
            }
            // Remove anything that's currently visible but unselected (the
            // user un-picked it). Items from other folders aren't visible
            // here, so they stay.
            for (const f of eligible_files) {
                if (!selection.selected_ids.has(f.id)) next.delete(f.id);
            }
            return next;
        });
    }, [selection.selected_ids, eligible_files, view]);

    const clear_all_picks = useCallback(() => {
        set_picked(new Map());
        selection.clear();
    }, [selection]);

    const open_preview = useCallback((item: LibraryItem) => {
        set_previewing(item);
    }, []);

    // ── Toolbar handlers (file view) ───────────────────────────────────
    const select_all_visible = useCallback(() => {
        selection.select_all();
    }, [selection]);

    // ── Folder single-select bulk-add mode ─────────────────────────────
    // Single-click on a folder highlights it. While in stories view with
    // exactly one folder highlighted, the footer switches to "Add all N
    // completed files from <folder>" — confirm fetches the folder's files
    // and emits them as the selection. Double-click still drills into
    // file-level multi-select.
    const highlighted_folder = useMemo(
        () => folders.find(f => f.parent_item_key === highlighted_folder_key) ?? null,
        [folders, highlighted_folder_key],
    );
    const [bulk_loading, set_bulk_loading] = useState(false);

    const confirm_bulk_folder = useCallback(async () => {
        if (!ott_id || !highlighted_folder?.parent_item_key) return;
        set_bulk_loading(true);
        try {
            const res = await ott_service.get_library_items(ott_id, {
                parent_item_key: highlighted_folder.parent_item_key,
                sort_by: 'oldest',
                limit: 1000,
                page: 1,
            });
            if (!res.success || !res.data) throw new Error(res.message || 'Failed to load files');
            const ready = res.data.items.filter(i => !!i.file_url);
            if (ready.length === 0) {
                toast.error('No files with an R2 URL in this folder');
                return;
            }
            onConfirm(ready, ott_id);
        } catch (err: any) {
            toast.error(err?.message || 'Failed to add folder');
        } finally {
            set_bulk_loading(false);
        }
    }, [ott_id, highlighted_folder, onConfirm]);

    if (!isOpen) return null;

    const total_picked = picked.size;
    const folder_bulk_mode = view === 'stories' && !!highlighted_folder;

    const handle_done = () => {
        if (folder_bulk_mode) {
            void confirm_bulk_folder();
            return;
        }
        if (total_picked === 0) {
            toast.error('Pick at least one file');
            return;
        }
        if (!ott_id) return;
        onConfirm(Array.from(picked.values()), ott_id);
    };

    return (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
            <div className="relative w-full max-w-6xl bg-bg-main border border-border-subtle rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 max-h-[90vh] flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-border-subtle">
                    <div className="flex items-center gap-3 min-w-0">
                        <div className="w-9 h-9 rounded-xl bg-brand-emerald/10 text-brand-emerald flex items-center justify-center shrink-0">
                            <Clapperboard size={18} />
                        </div>
                        <div className="min-w-0">
                            <h3 className="text-base font-bold text-text-main truncate">Choose from Library</h3>
                            <Breadcrumbs
                                view={view}
                                ott_name={ott_name}
                                story_title={story_title || story_key}
                                local_breadcrumbs={is_local ? local_breadcrumbs : []}
                                on_local_crumb={(key: string | null) => {
                                    set_local_parent_key(key);
                                    set_highlighted_folder_key(null);
                                }}
                                onRoot={() => {
                                    if (!locked_ott_id) {
                                        set_view('otts'); set_ott_id(null); set_ott_name(null);
                                        set_local_parent_key(null); set_local_breadcrumbs([]);
                                    }
                                }}
                                onOtt={() => {
                                    set_view('stories'); set_story_key(null); set_story_title(null);
                                    if (is_local) { set_local_parent_key(null); set_local_breadcrumbs([]); }
                                }}
                                locked={!!locked_ott_id}
                            />
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 rounded-xl hover:bg-black/5 dark:hover:bg-white/5 text-text-muted"
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* Toolbar */}
                <div className="flex items-center justify-between gap-2 px-4 py-2 border-b border-border-subtle">
                    <button
                        type="button"
                        onClick={go_back}
                        disabled={
                            view === 'otts'
                            || (view === 'stories' && !!locked_ott_id && !(is_local && local_parent_key))
                        }
                        className="flex items-center gap-1.5 text-xs font-bold text-text-muted hover:text-text-main disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                        <ArrowLeft size={14} /> Back
                    </button>
                    <div className="flex items-center gap-2">
                        {view === 'files' ? (
                            <span className="text-[11px] text-text-muted hidden sm:inline">
                                Click to select · Ctrl/Shift for multi · Double-click to preview
                            </span>
                        ) : view === 'stories' ? (
                            <span className="text-[11px] text-text-muted hidden sm:inline">
                                Click to add whole folder · Double-click to pick files inside
                            </span>
                        ) : (
                            <span className="text-[11px] text-text-muted hidden sm:inline">
                                Click to highlight · Double-click to open
                            </span>
                        )}
                        {view === 'files' && eligible_files.length > 0 && (
                            <>
                                <button
                                    onClick={select_all_visible}
                                    className="text-[11px] font-bold text-brand-emerald hover:underline"
                                    title="Select all visible (Ctrl+A)"
                                >
                                    Select all
                                </button>
                                <span className="h-3 w-px bg-border-subtle" />
                            </>
                        )}
                        {total_picked > 0 && (
                            <button
                                onClick={clear_all_picks}
                                className="text-[11px] font-bold text-text-muted hover:text-red-400"
                                title="Clear (Esc)"
                            >
                                Clear ({total_picked})
                            </button>
                        )}
                    </div>
                </div>

                {/* Body */}
                <div
                    className="flex-1 overflow-y-auto p-4"
                    onClick={
                        view === 'files'
                            ? selection.handle_background_click
                            : view === 'otts'
                                ? () => set_highlighted_ott_id(null)
                                : () => set_highlighted_folder_key(null)
                    }
                >
                    {loading ? (
                        <div className="flex items-center justify-center py-20 text-text-muted">
                            <Loader2 size={24} className="animate-spin" />
                        </div>
                    ) : view === 'otts' ? (
                        <OttsView
                            otts={otts}
                            highlighted_id={highlighted_ott_id}
                            on_highlight={set_highlighted_ott_id}
                            on_open={open_ott}
                        />
                    ) : view === 'stories' ? (
                        is_local ? (
                            // Combined view: subfolders (drill-down)
                            // + files (selectable) live in ONE grid so
                            // 3 folders + 3 files flow as a single
                            // continuous row, matching the main Library
                            // page's local-uploads layout.
                            folders.length === 0 && files.length === 0 ? (
                                <EmptyState icon={<Folder size={36} />} text="No folders or files here." />
                            ) : (
                                <CombinedFolderFileGrid
                                    folders={folders}
                                    files={files}
                                    highlighted_folder_key={highlighted_folder_key}
                                    on_highlight_folder={highlight_folder_exclusive}
                                    on_open_folder={open_folder}
                                    selection={selection}
                                    on_preview_file={open_preview}
                                    on_file_select_intent={clear_folder_highlight_for_file_pick}
                                />
                            )
                        ) : (
                            <FoldersView
                                folders={folders}
                                highlighted_key={highlighted_folder_key}
                                on_highlight={set_highlighted_folder_key}
                                on_open={open_folder}
                            />
                        )
                    ) : (
                        <FilesView
                            files={files}
                            selection={selection}
                            on_preview={open_preview}
                        />
                    )}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between gap-3 p-4 border-t border-border-subtle">
                    <p className="text-xs text-text-muted">
                        {folder_bulk_mode
                            ? `Folder selected: ${highlighted_folder?.title || highlighted_folder?.parent_item_key} · ${highlighted_folder?.completed_count ?? 0} completed file${(highlighted_folder?.completed_count ?? 0) === 1 ? '' : 's'} will be added`
                            : total_picked > 0
                                ? `${total_picked} file${total_picked === 1 ? '' : 's'} ready`
                                : view === 'stories'
                                    ? 'Click a folder to add all its files, or double-click to pick files inside'
                                    : 'Browse to a folder, then pick files'}
                    </p>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={onClose}
                            className="px-3 py-2 rounded-xl border border-border-subtle text-text-muted hover:text-text-main text-xs font-bold"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handle_done}
                            disabled={
                                bulk_loading
                                || (folder_bulk_mode
                                    ? (highlighted_folder?.completed_count ?? 0) === 0
                                    : total_picked === 0)
                            }
                            className="btn-primary flex items-center gap-2 px-4 py-2 text-xs disabled:opacity-50"
                        >
                            {bulk_loading ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                            {folder_bulk_mode
                                ? `Add Folder (${highlighted_folder?.completed_count ?? 0} file${(highlighted_folder?.completed_count ?? 0) === 1 ? '' : 's'})`
                                : `Add ${total_picked} File${total_picked === 1 ? '' : 's'}`}
                        </button>
                    </div>
                </div>
            </div>

            {/* File preview overlay (double-click) */}
            {previewing && ott_id && (
                <PreviewOverlay
                    item={previewing}
                    ott_id={ott_id}
                    onClose={() => set_previewing(null)}
                />
            )}
        </div>
    );
};

// ── Sub-views ───────────────────────────────────────────────────────────

const Breadcrumbs: React.FC<{
    view: View;
    ott_name: string | null;
    story_title: string | null;
    /** Nested Local-Uploads chain (root → leaf). Empty when at root
     *  or for non-Local OTTs. The LAST entry is the current folder. */
    local_breadcrumbs: LocalUploadsBreadcrumb[];
    /** Click handler when the user picks an earlier crumb in the
     *  chain. Pass null to jump back to root. */
    on_local_crumb: (key: string | null) => void;
    onRoot: () => void;
    onOtt: () => void;
    locked: boolean;
}> = ({ view, ott_name, story_title, local_breadcrumbs, on_local_crumb, onRoot, onOtt, locked }) => (
    <p className="text-[11px] text-text-muted truncate">
        <button
            onClick={onRoot}
            disabled={locked}
            className="hover:text-text-main disabled:cursor-default"
        >
            Library
        </button>
        {ott_name && (
            <>
                {' › '}
                <button onClick={onOtt} className="hover:text-text-main">{ott_name}</button>
            </>
        )}
        {local_breadcrumbs.length > 0 && local_breadcrumbs.map((crumb: LocalUploadsBreadcrumb, idx: number) => {
            const is_last = idx === local_breadcrumbs.length - 1;
            return (
                <React.Fragment key={`${crumb.key}-${idx}`}>
                    {' › '}
                    {is_last ? (
                        <span className="text-text-main">{crumb.title}</span>
                    ) : (
                        <button
                            onClick={() => on_local_crumb(crumb.key)}
                            className="hover:text-text-main"
                        >
                            {crumb.title}
                        </button>
                    )}
                </React.Fragment>
            );
        })}
        {view === 'files' && story_title && local_breadcrumbs.length === 0 && (
            <>{' › '}<span className="text-text-main">{story_title}</span></>
        )}
    </p>
);

const OttsView: React.FC<{
    otts: OttSummary[];
    highlighted_id: string | null;
    on_highlight: (id: string | null) => void;
    on_open: (o: OttSummary) => void;
}> = ({ otts, highlighted_id, on_highlight, on_open }) => {
    if (otts.length === 0) {
        return <EmptyState icon={<Clapperboard size={36} />} text="No OTTs with library files yet." />;
    }
    return (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(96px,1fr))] gap-2">
            {otts.map(o => {
                const is_hi = highlighted_id === o.id;
                return (
                    <button
                        key={o.id}
                        type="button"
                        onClick={(e) => { e.stopPropagation(); on_highlight(o.id); }}
                        onDoubleClick={(e) => { e.stopPropagation(); on_highlight(null); on_open(o); }}
                        className={`group flex flex-col items-center gap-1 p-3 rounded-xl focus:outline-none transition-colors ${
                            is_hi
                                ? 'bg-brand-emerald/20 ring-2 ring-brand-emerald'
                                : 'hover:bg-brand-emerald/10 focus:bg-brand-emerald/15'
                        }`}
                        title={`${o.name} — ${o.counts.folder_count} folders (double-click to open)`}
                    >
                        <div className="relative">
                            <Folder
                                size={48}
                                className="text-amber-400 fill-amber-400/30 group-hover:text-amber-300"
                                strokeWidth={1.5}
                            />
                            {o.favicon_url && (
                                <img
                                    src={o.favicon_url}
                                    alt=""
                                    className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-[35%] w-4 h-4 rounded bg-white/90 p-0.5 object-contain"
                                    referrerPolicy="no-referrer"
                                    onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                                />
                            )}
                            <span className="absolute -bottom-0.5 -right-1 min-w-[16px] h-[16px] px-1 rounded-full bg-bg-main border border-border-subtle text-[9px] font-bold text-text-main flex items-center justify-center">
                                {o.counts.folder_count}
                            </span>
                        </div>
                        <span className="text-xs text-text-main text-center w-full line-clamp-2 leading-tight mt-1">
                            {o.name}
                        </span>
                    </button>
                );
            })}
        </div>
    );
};

// Shared grid template — `auto-fill` packs as many ~96px-min cards as the
// container can fit, so a single row of 6 items fills the modal instead of
// breaking into multiple short rows. Inline style is used instead of an
// arbitrary Tailwind class because the comma-laden `repeat(...)` value
// isn't always picked up by Tailwind's class scanner.
const GRID_STYLE: React.CSSProperties = {
    gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))',
};

const FolderTile: React.FC<{
    folder: FolderSummary;
    is_highlighted: boolean;
    on_highlight: (key: string | null) => void;
    on_open: (f: FolderSummary) => void;
}> = ({ folder: f, is_highlighted: is_hi, on_highlight, on_open }) => (
    <button
        type="button"
        onClick={(e) => { e.stopPropagation(); on_highlight(f.parent_item_key); }}
        onDoubleClick={(e) => { e.stopPropagation(); on_highlight(null); on_open(f); }}
        className={`group relative flex flex-col items-center gap-1 p-3 rounded-xl focus:outline-none transition-colors ${
            is_hi
                ? 'bg-brand-emerald/20 ring-2 ring-brand-emerald'
                : 'hover:bg-brand-emerald/10 focus:bg-brand-emerald/15'
        }`}
        title={`${f.title} — ${f.completed_count}/${f.item_count} ready (double-click to open)`}
    >
        {is_hi && (
            <span className="absolute top-1 left-1 z-10 flex h-4 w-4 items-center justify-center rounded-full bg-brand-emerald text-white shadow">
                <Check size={10} strokeWidth={3} />
            </span>
        )}
        <div className="relative">
            <Folder
                size={48}
                className="text-amber-300 fill-amber-300/25 group-hover:text-amber-200"
                strokeWidth={1.5}
            />
            {f.thumbnail_url ? (
                <img
                    src={f.thumbnail_url}
                    alt=""
                    className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-[40%] w-5 h-5 rounded object-cover"
                    referrerPolicy="no-referrer"
                    onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                />
            ) : null}
            <span className="absolute -bottom-0.5 -right-1 min-w-[16px] h-[16px] px-1 rounded-full bg-bg-main border border-border-subtle text-[9px] font-bold text-text-main flex items-center justify-center">
                {f.item_count}
            </span>
        </div>
        <span className="text-xs text-text-main text-center w-full line-clamp-2 leading-tight mt-1">
            {f.title || f.parent_item_key}
        </span>
    </button>
);

const FileTile: React.FC<{
    file: LibraryItem;
    is_selected: boolean;
    on_click: (id: string, e: React.MouseEvent) => void;
    on_preview: (i: LibraryItem) => void;
    on_select_intent?: () => void;
}> = ({ file: f, is_selected: is_sel, on_click, on_preview, on_select_intent }) => {
    const ready = !!f.file_url;
    const ext = (f.file_ext || f.original_video_type || '').toUpperCase();
    return (
        <button
            type="button"
            onClick={(e) => {
                e.stopPropagation();
                if (!ready) {
                    toast.error('This file has no R2 URL yet — re-upload to make it schedulable');
                    return;
                }
                on_select_intent?.();
                on_click(f.id, e);
            }}
            onDoubleClick={(e) => {
                e.stopPropagation();
                on_preview(f);
            }}
            className={`group relative flex flex-col items-center gap-1 p-3 rounded-xl focus:outline-none transition-colors ${
                is_sel
                    ? 'bg-brand-emerald/20 ring-2 ring-brand-emerald'
                    : ready
                        ? 'hover:bg-brand-emerald/10 focus:bg-brand-emerald/15'
                        : 'opacity-50 cursor-not-allowed'
            }`}
            title={`${f.title || f.file_name || 'Untitled'}${ready ? '' : ' — no file_url'} (double-click to preview)`}
        >
            {is_sel && (
                <span className="absolute top-1 left-1 z-10 flex h-4 w-4 items-center justify-center rounded-full bg-brand-emerald text-white shadow">
                    <Check size={10} strokeWidth={3} />
                </span>
            )}
            <div className="relative">
                {f.save_type === 'video' ? (
                    <FileVideo size={48} className="text-brand-emerald" strokeWidth={1.5} />
                ) : f.save_type === 'image' || f.save_type === 'thumbnail' ? (
                    <FileImage size={48} className="text-brand-blue" strokeWidth={1.5} />
                ) : f.save_type === 'playlist' ? (
                    <FileMusic size={48} className="text-amber-400" strokeWidth={1.5} />
                ) : (
                    <FileIcon size={48} className="text-text-muted" strokeWidth={1.5} />
                )}
                {ext && (
                    <span className="absolute -bottom-0.5 -right-1 px-1.5 h-[16px] rounded-md bg-bg-main border border-border-subtle text-[9px] font-bold uppercase text-text-main flex items-center justify-center">
                        {ext}
                    </span>
                )}
            </div>
            <span className="text-[11px] text-text-main text-center w-full line-clamp-2 leading-tight mt-1">
                {f.title || f.file_name || 'Untitled'}
            </span>
            {!ready && (
                <span className="text-[9px] uppercase font-bold text-amber-400">No file</span>
            )}
        </button>
    );
};

const FoldersView: React.FC<{
    folders: FolderSummary[];
    highlighted_key: string | null;
    on_highlight: (key: string | null) => void;
    on_open: (f: FolderSummary) => void;
}> = ({ folders, highlighted_key, on_highlight, on_open }) => {
    if (folders.length === 0) {
        return <EmptyState icon={<Folder size={36} />} text="This OTT has no story folders yet." />;
    }
    return (
        <div className="grid gap-2" style={GRID_STYLE}>
            {folders.map(f => (
                <FolderTile
                    key={f.parent_item_key}
                    folder={f}
                    is_highlighted={highlighted_key === f.parent_item_key}
                    on_highlight={on_highlight}
                    on_open={on_open}
                />
            ))}
        </div>
    );
};

interface FilesViewProps {
    files: LibraryItem[];
    selection: ReturnType<typeof useGridSelection>;
    on_preview: (i: LibraryItem) => void;
    /** Fired when the user is about to pick a file. Lets the parent clear
     *  any active folder highlight so "Add Folder" and "Add Files" modes
     *  stay mutually exclusive. */
    on_select_intent?: () => void;
}

const FilesView: React.FC<FilesViewProps> = ({ files, selection, on_preview, on_select_intent }) => {
    if (files.length === 0) {
        return <EmptyState icon={<FolderOpen size={36} />} text="This folder is empty." />;
    }
    return (
        <div className="grid gap-2" style={GRID_STYLE}>
            {files.map(f => (
                <FileTile
                    key={f.id}
                    file={f}
                    is_selected={selection.is_selected(f.id)}
                    on_click={selection.handle_item_click}
                    on_preview={on_preview}
                    on_select_intent={on_select_intent}
                />
            ))}
        </div>
    );
};

/** Combined folders + files in a single grid — matches the main Library
 *  page so 3 folders + 3 files flow as one continuous row of 6 instead
 *  of breaking into two short stacked rows. */
const CombinedFolderFileGrid: React.FC<{
    folders: FolderSummary[];
    files: LibraryItem[];
    highlighted_folder_key: string | null;
    on_highlight_folder: (key: string | null) => void;
    on_open_folder: (f: FolderSummary) => void;
    selection: ReturnType<typeof useGridSelection>;
    on_preview_file: (i: LibraryItem) => void;
    on_file_select_intent?: () => void;
}> = ({
    folders,
    files,
    highlighted_folder_key,
    on_highlight_folder,
    on_open_folder,
    selection,
    on_preview_file,
    on_file_select_intent,
}) => (
    <div className="grid gap-2" style={GRID_STYLE}>
        {folders.map(f => (
            <FolderTile
                key={`folder:${f.parent_item_key}`}
                folder={f}
                is_highlighted={highlighted_folder_key === f.parent_item_key}
                on_highlight={on_highlight_folder}
                on_open={on_open_folder}
            />
        ))}
        {files.map(f => (
            <FileTile
                key={`file:${f.id}`}
                file={f}
                is_selected={selection.is_selected(f.id)}
                on_click={selection.handle_item_click}
                on_preview={on_preview_file}
                on_select_intent={on_file_select_intent}
            />
        ))}
    </div>
);

// ── Preview overlay (matches the Library page's player) ────────────────

const PreviewOverlay: React.FC<{ item: LibraryItem; ott_id: string; onClose: () => void }> = ({ item, ott_id, onClose }) => {
    // Esc closes — we install a window listener while mounted.
    const close_ref = useRef(onClose);
    close_ref.current = onClose;
    useEffect(() => {
        const on_key = (e: KeyboardEvent) => {
            if (e.key === 'Escape') close_ref.current();
        };
        window.addEventListener('keydown', on_key);
        return () => window.removeEventListener('keydown', on_key);
    }, []);

    return (
        <div
            className="fixed inset-0 z-[200] flex flex-col items-center justify-center bg-black/85 backdrop-blur-sm p-4 gap-3"
            onClick={onClose}
        >
            <button
                onClick={onClose}
                className="absolute top-4 right-4 p-2 rounded-full bg-black/60 text-white/80 hover:text-white hover:bg-black/80 transition-colors"
                aria-label="Close preview"
            >
                <X size={22} />
            </button>
            <div
                className="flex items-center justify-center max-w-[92vw] max-h-[82vh]"
                onClick={(e) => e.stopPropagation()}
            >
                {(() => {
                    const is_video = item.save_type === 'video'
                        || item.save_type === 'playlist'
                        || (item.mime_type ?? '').toLowerCase().startsWith('video/');
                    const is_image = !is_video && (
                        item.save_type === 'image'
                        || item.save_type === 'thumbnail'
                        || (item.mime_type ?? '').toLowerCase().startsWith('image/')
                    );
                    if (is_video && item.file_url) {
                        return (
                            <iframe
                                src={item.playback_url ?? item.stream_url ?? ott_service.get_library_stream_url(ott_id, item.id)}
                                title={item.title ?? 'video'}
                                allow="autoplay; encrypted-media"
                                allowFullScreen
                                className="w-[92vw] h-[82vh] rounded-2xl bg-black shadow-2xl border-0"
                            />
                        );
                    }
                    const image_src = is_image ? (item.file_url ?? item.thumbnail_display_url) : item.thumbnail_display_url;
                    if (image_src) {
                        return (
                            <img
                                src={image_src}
                                alt={item.title ?? 'image'}
                                className="max-w-[92vw] max-h-[82vh] w-auto h-auto rounded-2xl shadow-2xl"
                            />
                        );
                    }
                    return null;
                })()}
                {!item.file_url && item.original_video_url ? (
                    <div className="flex flex-col gap-3 items-stretch p-6 rounded-2xl bg-bg-card border border-border-subtle min-w-[320px] max-w-[80vw]">
                        <p className="text-xs font-bold uppercase tracking-wider text-text-muted">Source URL</p>
                        <p className="text-sm text-text-main font-mono break-all">{item.original_video_url}</p>
                        <button
                            type="button"
                            onClick={() => {
                                navigator.clipboard.writeText(item.original_video_url ?? '').then(
                                    () => toast.success('URL copied'),
                                    () => toast.error('Clipboard not available'),
                                );
                            }}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-brand-emerald/15 text-brand-emerald text-xs font-bold hover:bg-brand-emerald/25 self-start"
                        >
                            <Copy size={12} /> Copy URL
                        </button>
                    </div>
                ) : (
                    ''
                )}
            </div>
            <p className="text-xs text-white/70 max-w-[80vw] truncate text-center">
                {item.title || item.file_name || 'Untitled'}
            </p>
        </div>
    );
};

const EmptyState: React.FC<{ icon: React.ReactNode; text: string }> = ({ icon, text }) => (
    <div className="flex flex-col items-center justify-center py-16 text-text-muted gap-3">
        <div className="opacity-50">{icon}</div>
        <p className="text-sm">{text}</p>
    </div>
);

export default LibraryBrowserPicker;
