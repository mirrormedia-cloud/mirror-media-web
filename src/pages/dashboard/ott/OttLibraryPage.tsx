/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'motion/react';
import toast from 'react-hot-toast';
import {
  ArrowLeft,
  Loader2,
  Search,
  Clapperboard,
  Play,
  Download,
  Trash2,
  RefreshCw,
  Copy,
  Filter,
  AlertCircle,
  Image as ImageIcon,
  X,
  Folder,
  FolderOpen,
  ChevronLeft,
  ChevronRight,
  FileVideo,
  FileImage,
  File as FileIcon,
} from 'lucide-react';
import { ott_service } from '../../../services/ott_service';
import { LibraryItem, LibraryItemStatus } from '../../../types';
import { CommonSearchSelect } from '../../../components/ui/CommonSearchSelect';
import { useAuth } from '../../../context/AuthContext';
import { useConfirm } from '../../../components/ui/ConfirmDialog';
import { useGridSelection } from '../../../hooks/useGridSelection';
import { SelectionActionBar } from '../../../components/ui/SelectionActionBar';
import { Check } from 'lucide-react';
import { LibraryCard } from '../../../components/library/LibraryCard';
// HLS preview was removed in the R2 migration.

type StatusFilter = '' | LibraryItemStatus;
type SortKey =
  | 'newest'
  | 'oldest'
  | 'title_asc'
  | 'title_desc'
  | 'size_desc'
  | 'size_asc'
  | 'status';

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'title_asc', label: 'Title A → Z' },
  { value: 'title_desc', label: 'Title Z → A' },
  { value: 'size_desc', label: 'File size (largest)' },
  { value: 'size_asc', label: 'File size (smallest)' },
  { value: 'status', label: 'Status' },
];

const TABS = [
  { id: 'all', label: 'All', filter: { status: '' as StatusFilter, type: '' } },
  { id: 'videos', label: 'Videos', filter: { status: 'completed' as StatusFilter, type: 'video' } },
  { id: 'failed', label: 'Failed', filter: { status: 'failed' as StatusFilter, type: '' } },
  { id: 'processing', label: 'Processing', filter: { status: 'downloading' as StatusFilter, type: '' } },
];

type LibraryFolder = {
  parent_api_id: string | null;
  parent_item_key: string | null;
  title: string;
  item_count: number;
  completed_count: number;
  failed_count: number;
  in_progress_count: number;
  thumbnail_url: string | null;
  latest_at: string | null;
};

const OttLibraryPage: React.FC = () => {
  const { ott_id } = useParams<{ ott_id: string }>();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const [search_params, set_search_params] = useSearchParams();

  // ── Folder routing ────────────────────────────────────────────────────
  // No `?folder=` → folder grid view. With `?folder=<key>` (and optionally
  // `&parent_api_id=<uuid>`) → item view scoped to that folder. The
  // sentinel `?folder=__ungrouped__` means "show legacy items that have no
  // parent_item_key" so users can still triage them.
  const folder_key = search_params.get('folder');
  const folder_parent_api_id = search_params.get('parent_api_id');
  const is_ungrouped_view = folder_key === '__ungrouped__';
  const in_folder_view = folder_key !== null;

  const [folders, set_folders] = useState<LibraryFolder[]>([]);
  const [folders_loading, set_folders_loading] = useState(false);
  const [active_folder_title, set_active_folder_title] = useState<string | null>(null);

  const [items, set_items] = useState<LibraryItem[]>([]);
  const [total, set_total] = useState(0);
  const [status_counts, set_status_counts] = useState<{
    all: number;
    completed: number;
    failed: number;
    in_progress: number;
  } | null>(null);
  const [page, set_page] = useState(1);
  const [limit, set_limit] = useState(24);
  const [loading, set_loading] = useState(true);
  // "files" view = Windows-Explorer-style icon grid (file-type icon + name).
  // "cards" view = the existing detailed card layout. Persisted to
  // localStorage so the user's preference sticks across reloads.
  // ── View mode (cards vs file-explorer) ───────────────────────────────
  // Backed by per-user `preferences.ott_library_view_mode` on the server.
  // Local state holds the optimistic value while in flight; localStorage
  // acts as a synchronous cache so the page doesn't flicker on first
  // render before /api/profile responds.
  const { preferences, update_preferences } = useAuth();
  const [view_mode, set_view_mode] = useState<'cards' | 'files'>(() => {
    if (typeof window !== 'undefined') {
      const v = window.localStorage.getItem('ott_library_view_mode');
      if (v === 'files' || v === 'cards') return v;
    }
    // Default ON = file-explorer view. Users can flip to detailed cards
    // (with search/filters/sort) via the switch in the header.
    return 'files';
  });
  // When the server's preference loads (or changes from another tab), pull
  // it into local state — but ignore stale loads if the user has already
  // toggled here. Comparing with the cached localStorage value keeps the
  // local choice winning until the user changes it again.
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
    // Fire-and-forget — local state already shows the new value. If the
    // PATCH fails the next /me will re-sync, so we don't roll back here.
    void update_preferences({ ott_library_view_mode: next }).catch(() => {});
    // Toggling the view is a context switch — drop any in-flight
    // selection + the just-opened highlight so the new view starts clean.
    selection.clear();
    set_opened_item_id(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [update_preferences]);

  const [search, set_search] = useState('');
  const [status_filter, set_status_filter] = useState<StatusFilter>('');
  const [type_filter, set_type_filter] = useState('');
  const [sort_by, set_sort_by] = useState<SortKey>('oldest');
  const [active_tab, set_active_tab] = useState('all');

  const [playing, set_playing] = useState<LibraryItem | null>(null);
  // HLS preview was removed in the R2 migration — playback uses
  // `playing.file_url` directly via a native <video> element.

  // Esc closes, ←/→ step through the visible items list. Skips when
  // focus is in an input so user typing isn't hijacked. Listener
  // re-binds whenever the row changes so the keyboard always works
  // against the latest list.
  useEffect(() => {
    if (!playing) return;
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
      if (e.key === 'Escape') { set_playing(null); return; }
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      const idx = items.findIndex(i => i.id === playing.id);
      if (idx < 0) return;
      const next_idx = e.key === 'ArrowLeft' ? idx - 1 : idx + 1;
      if (next_idx < 0 || next_idx >= items.length) return;
      set_playing(items[next_idx] ?? null);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [playing, items]);
  // Last item the user double-clicked to open. Renders with only a subtle
  // background tint (no check chip, no ring) so the "I just opened this"
  // state is visually distinct from "this is selected". Cleared on any
  // single click since that's a new selection action.
  const [opened_item_id, set_opened_item_id] = useState<string | null>(null);
  // Local input state for the "Page X" jump field. Kept as a string so the
  // user can blank it / type partial values; coerced + validated on Enter.
  const [page_jump_input, set_page_jump_input] = useState<string>('');

  const load_folders = useCallback(async () => {
    if (!ott_id) return;
    set_folders_loading(true);
    try {
      const res = await ott_service.get_library_folders(ott_id);
      if (!res.success || !res.data) throw new Error(res.message || 'Failed to load folders');
      set_folders(res.data.folders);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to load folders');
    } finally {
      set_folders_loading(false);
    }
  }, [ott_id]);

  const load = useCallback(async () => {
    if (!ott_id || !in_folder_view) return;
    set_loading(true);
    try {
      // File view = "show everything in this folder". We send a high limit
      // and force page 1 so the whole grid renders at once. The cards view
      // keeps its user-controlled pagination.
      const effective_limit = view_mode === 'files' ? 1000 : limit;
      const effective_page = view_mode === 'files' ? 1 : page;
      const params: any = { page: effective_page, limit: effective_limit, sort_by };
      if (search) params.search = search;
      if (status_filter) params.status = status_filter;
      if (type_filter) params.type = type_filter;
      // Folder scoping. The `__ungrouped__` sentinel maps to the backend's
      // `ungrouped_only=true` filter rather than a literal parent_item_key.
      if (is_ungrouped_view) {
        params.ungrouped_only = true;
      } else if (folder_key) {
        params.parent_item_key = folder_key;
        if (folder_parent_api_id) params.parent_api_id = folder_parent_api_id;
      }
      const res = await ott_service.get_library_items(ott_id, params);
      if (!res.success || !res.data) throw new Error(res.message || 'Failed to load library');
      set_items(res.data.items);
      set_total(res.data.pagination.total);
      // Tab badges read from these. Backend computes them ignoring the
      // active status filter so switching tabs doesn't zero out the others.
      if (res.data.status_counts) {
        set_status_counts({
          all: res.data.status_counts.all,
          completed: res.data.status_counts.completed,
          failed: res.data.status_counts.failed,
          in_progress: res.data.status_counts.in_progress,
        });
      }
      // Capture the folder title from the first item that has a parent_title
      // set, so the page header can render it (e.g. "Library / 5star ka
      // Billionaire Naukar"). When we entered the folder via a click we
      // already have it from the folder card, but a deep link via URL
      // wouldn't, hence this fallback.
      if (!active_folder_title) {
        const first = res.data.items.find(i => i.parent_title);
        if (first?.parent_title) set_active_folder_title(first.parent_title);
      }
    } catch (err: any) {
      toast.error(err?.message || 'Failed to load library');
    } finally {
      set_loading(false);
    }
  }, [ott_id, page, limit, search, status_filter, type_filter, sort_by, in_folder_view, folder_key, folder_parent_api_id, is_ungrouped_view, active_folder_title, view_mode]);

  useEffect(() => {
    if (in_folder_view) load();
    else load_folders();
  }, [in_folder_view, load, load_folders]);

  useEffect(() => {
    set_page(1);
  }, [folder_key, folder_parent_api_id]);

  // Reset folder-only state when leaving the folder view.
  useEffect(() => {
    if (!in_folder_view) {
      set_active_folder_title(null);
      set_page(1);
      set_search('');
      set_status_filter('');
      set_type_filter('');
      set_active_tab('all');
    }
  }, [in_folder_view]);

  // ── Multi-select for items (inside a folder) ─────────────────────────
  // Operates on the currently rendered `items` list — Ctrl+A selects only
  // visible items, Shift-range follows the current sorted/filtered order.
  const ordered_item_ids = useMemo(() => items.map(i => i.id), [items]);
  const selection = useGridSelection({
    ordered_ids: ordered_item_ids,
    enabled: in_folder_view,
  });
  const [bulk_deleting, set_bulk_deleting] = useState(false);

  // ── Multi-select for the folder grid (root view) ─────────────────────
  // Each folder's stable id is `parent_api_id::parent_item_key` (matches
  // the React `key` used in the grid). The "Ungrouped" pseudo-folder uses
  // the literal `__ungrouped__` placeholder.
  const folder_id_for = (f: LibraryFolder): string =>
    `${f.parent_api_id ?? 'na'}::${f.parent_item_key ?? '__ungrouped__'}`;
  const ordered_folder_ids = useMemo(() => folders.map(folder_id_for), [folders]);
  const folder_selection = useGridSelection({
    ordered_ids: ordered_folder_ids,
    enabled: !in_folder_view,
  });
  const [folder_bulk_deleting, set_folder_bulk_deleting] = useState(false);

  // Drop folder selections that vanished after a refresh.
  useEffect(() => {
    if (folder_selection.selected_count === 0) return;
    const visible = new Set(ordered_folder_ids);
    const next: string[] = [];
    folder_selection.selected_ids.forEach(id => { if (visible.has(id)) next.push(id); });
    if (next.length !== folder_selection.selected_count) folder_selection.set_selected(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ordered_folder_ids]);

  const handle_folder_bulk_delete = useCallback(async () => {
    if (!ott_id || folder_selection.selected_count === 0) return;
    // Map selected folder ids back to their { parent_item_key, parent_api_id }
    // payloads. Total item count powers the confirm copy so the user knows
    // exactly how many videos disappear when they confirm.
    const id_set = folder_selection.selected_ids;
    const targets = folders.filter(f => id_set.has(folder_id_for(f)));
    const total_items = targets.reduce((acc, f) => acc + f.item_count, 0);
    const folder_word = targets.length === 1 ? 'folder' : 'folders';
    const item_word = total_items === 1 ? 'item' : 'items';
    const ok = await confirm({
      title: `Delete ${targets.length} ${folder_word}?`,
      message: `${total_items} ${item_word} inside will also be removed.`,
      confirm_label: 'Delete',
      danger: true,
    });
    if (!ok) return;
    set_folder_bulk_deleting(true);
    try {
      const res = await ott_service.bulk_delete_library_folders(
        ott_id,
        targets.map(f => ({
          parent_item_key: f.parent_item_key,
          parent_api_id: f.parent_api_id,
        })),
      );
      if (!res.success || !res.data) throw new Error(res.message || 'Bulk delete failed');
      // Optimistic UI: drop the deleted folders from local state. Refetch
      // in the background to reconcile counts.
      set_folders(prev => prev.filter(f => !id_set.has(folder_id_for(f))));
      folder_selection.clear();
      toast.success(`Deleted ${res.data.total_deleted} item${res.data.total_deleted === 1 ? '' : 's'}`);
      void load_folders();
    } catch (err: any) {
      toast.error(err?.message || 'Bulk delete failed');
    } finally {
      set_folder_bulk_deleting(false);
    }
  }, [ott_id, folder_selection, folders, load_folders]);

  // Drop selections that no longer exist after a refresh / page change.
  // Without this the action bar would show a count for deleted rows.
  useEffect(() => {
    if (selection.selected_count === 0) return;
    const visible = new Set(ordered_item_ids);
    const next: string[] = [];
    selection.selected_ids.forEach(id => { if (visible.has(id)) next.push(id); });
    if (next.length !== selection.selected_count) selection.set_selected(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ordered_item_ids]);

  /**
   * Click handler for an item tile. Wraps the selection hook's click so we
   * can also clear the "just-opened" highlight on every click — a fresh
   * click is a new intent, the previous open marker shouldn't linger.
   */
  const handle_item_tile_click = useCallback((id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    set_opened_item_id(null);
    selection.handle_item_click(id, e);
  }, [selection]);

  /**
   * Double-click handler. Clears any selection (per user spec — opening
   * shouldn't leave check marks behind), marks this item as the
   * just-opened one, and triggers the open. The opened item shows only a
   * subtle background tint with no ring or check chip.
   */
  const handle_item_tile_dblclick = useCallback((item: LibraryItem, e: React.MouseEvent) => {
    e.stopPropagation();
    selection.clear();
    set_opened_item_id(item.id);
    set_playing(item);
  }, [selection]);

  const handle_bulk_delete = useCallback(async () => {
    if (!ott_id || selection.selected_count === 0) return;
    const ids = Array.from(selection.selected_ids);
    const ok = await confirm({
      title: ids.length === 1 ? 'Delete this item?' : `Delete ${ids.length} items?`,
      message: 'This cannot be undone.',
      confirm_label: 'Delete',
      danger: true,
    });
    if (!ok) return;
    set_bulk_deleting(true);
    try {
      const res = await ott_service.bulk_delete_library_items(ott_id, ids);
      if (!res.success || !res.data) throw new Error(res.message || 'Bulk delete failed');
      const { deleted } = res.data;
      // Optimistic UI: drop the deleted rows from local state immediately
      // so the user sees the result without waiting for the next fetch.
      const deleted_set = new Set(ids);
      set_items(prev => prev.filter(i => !deleted_set.has(i.id)));
      set_total(t => Math.max(0, t - deleted));
      selection.clear();
      toast.success(`Deleted ${deleted} item${deleted === 1 ? '' : 's'}`);
      // Refresh in the background so server-truth (counts, pagination)
      // stays in sync.
      void load();
    } catch (err: any) {
      toast.error(err?.message || 'Bulk delete failed');
    } finally {
      set_bulk_deleting(false);
    }
  }, [ott_id, selection, load]);

  const open_folder = (folder: LibraryFolder) => {
    const next = new URLSearchParams(search_params);
    next.set('folder', folder.parent_item_key ?? '__ungrouped__');
    if (folder.parent_api_id) next.set('parent_api_id', folder.parent_api_id);
    else next.delete('parent_api_id');
    set_search_params(next);
    set_active_folder_title(folder.title);
  };

  const back_to_folders = () => {
    const next = new URLSearchParams(search_params);
    next.delete('folder');
    next.delete('parent_api_id');
    set_search_params(next);
  };

  const apply_tab = (tab_id: string) => {
    set_active_tab(tab_id);
    const tab = TABS.find(t => t.id === tab_id);
    if (!tab) return;
    set_status_filter(tab.filter.status);
    set_type_filter(tab.filter.type);
    set_page(1);
  };

  const handle_delete = async (id: string) => {
    if (!ott_id) return;
    const ok = await confirm({
      title: 'Delete this saved item?',
      message: 'Local files will be removed. This cannot be undone.',
      confirm_label: 'Delete',
      danger: true,
    });
    if (!ok) return;
    try {
      const res = await ott_service.delete_library_item(ott_id, id);
      if (!res.success) throw new Error(res.message);
      toast.success('Deleted');
      await load();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to delete');
    }
  };

  const handle_retry = async (id: string) => {
    if (!ott_id) return;
    try {
      const res = await ott_service.retry_library_item(ott_id, id);
      if (!res.success) throw new Error(res.message);
      toast.success('Retry started');
      await load();
    } catch (err: any) {
      toast.error(err?.message || 'Retry failed');
    }
  };

  const handle_copy_path = async (rel: string | null) => {
    if (!rel) return;
    try {
      await navigator.clipboard.writeText(rel);
      toast.success('Path copied');
    } catch { toast.error('Clipboard not available'); }
  };

  // HLS handlers removed in the R2 migration.

  const total_pages = Math.max(1, Math.ceil(total / limit));
  const first_visible_item = total === 0 ? 0 : ((page - 1) * limit) + 1;
  const last_visible_item = Math.min(page * limit, total);

  // Tab badges. Prefer the backend-computed status_counts so changing the
  // active tab doesn't zero out the other counts (the API already excludes
  // the status filter when computing them). Fall back to a quick local
  // calculation only on the very first render before the response arrives.
  const counts = useMemo(() => {
    if (status_counts) {
      return {
        all: status_counts.all,
        processing: status_counts.in_progress,
        failed: status_counts.failed,
        videos: status_counts.completed,
      };
    }
    // Post-R2: no `status` column. A row exists only when R2 finished,
    // so the "ready" set = rows with file_url. Processing/failed buckets
    // collapse to 0 (the pipeline either succeeds and inserts, or fails
    // and inserts nothing).
    return {
      all: total,
      processing: 0,
      failed: items.filter(i => !i.file_url).length,
      videos: items.filter(i => !!i.file_url).length,
    };
  }, [items, total, status_counts]);

  // Sort is applied server-side via the `sort_by` query param — items arrive already
  // ordered across the entire paginated result, not just the current page.

  // Total saved across the whole library (independent of folder filter) so
  // the header subtitle is meaningful in both views. Computed from folder
  // sums when we have them; falls back to the current `total` otherwise.
  const total_across_library = folders.length > 0
    ? folders.reduce((acc, f) => acc + f.item_count, 0)
    : total;

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex flex-col gap-2">
          {in_folder_view ? (
            <button
              onClick={back_to_folders}
              className="flex items-center gap-2 text-xs font-bold text-text-muted hover:text-text-main w-fit"
            >
              <ArrowLeft size={14} /> Back to folders
            </button>
          ) : (
            <button
              onClick={() => navigate(`/dashboard/ott/${ott_id}/manage`)}
              className="flex items-center gap-2 text-xs font-bold text-text-muted hover:text-text-main w-fit"
            >
              <ArrowLeft size={14} /> Back to OTT
            </button>
          )}
          <h1 className="text-3xl font-black text-text-main tracking-tight flex items-center gap-3">
            {in_folder_view ? (
              <>
                <FolderOpen size={28} className="text-brand-emerald" />
                <span className="truncate" title={active_folder_title ?? folder_key ?? ''}>
                  {is_ungrouped_view ? 'Ungrouped' : (active_folder_title ?? folder_key ?? 'Folder')}
                </span>
              </>
            ) : (
              <>
                <Clapperboard size={28} className="text-brand-emerald" /> Local Library
              </>
            )}
          </h1>
          <p className="text-sm text-text-muted">
            {in_folder_view ? (
              <>
                {total} item{total === 1 ? '' : 's'} in this folder.
              </>
            ) : (
              <>
                {folders.length} folder{folders.length === 1 ? '' : 's'} · {total_across_library} saved item{total_across_library === 1 ? '' : 's'}.
              </>
            )}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* File-view on/off switch — only meaningful inside a folder.
              Default ON ("files" mode) gives a clean Windows-Explorer-style
              grid; flipping it OFF reveals the full chrome (tabs, filters,
              sort, detailed cards). Persisted to localStorage. */}
          {in_folder_view && (
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <span className="text-xs font-bold text-text-muted uppercase tracking-wider">File view</span>
              <button
                type="button"
                role="switch"
                aria-checked={view_mode === 'files'}
                onClick={() => {
                  const next = view_mode === 'files' ? 'cards' : 'files';
                  set_view_mode_persisted(next);
                }}
                // h-7 w-12 + p-0.5 (= 2px inner padding) gives the knob a
                // 2px gap from the track edge on every side so the white
                // circle never touches the border. Knob is h-6 w-6 (24px),
                // track is 28px tall = 24 + 2*2.
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
          <button
            onClick={() => (in_folder_view ? load() : load_folders())}
            className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-bg-card border border-border-subtle text-text-main text-sm font-bold hover:border-brand-emerald/50"
          >
            <RefreshCw size={16} /> Refresh
          </button>
        </div>
      </div>

      {/* Folder grid — default view. Each card opens the folder via URL
          param so back/forward buttons work and the URL is shareable. */}
      {!in_folder_view && (
        folders_loading ? (
          <div className="flex items-center justify-center py-20 text-text-muted">
            <Loader2 size={28} className="animate-spin" />
          </div>
        ) : folders.length === 0 ? (
          <div className="p-16 text-center bg-black/5 dark:bg-white/5 rounded-3xl border border-dashed border-border-subtle space-y-3">
            <Clapperboard size={48} className="mx-auto text-text-muted opacity-50" />
            <h3 className="text-lg font-bold text-text-main">Library is empty</h3>
            <p className="text-sm text-text-muted">
              Save cards from the <span className="font-bold">Cards</span> tab on a nested API page and they'll appear here grouped by show.
            </p>
          </div>
        ) : (
          // File-explorer style grid: just a folder icon + name + item count,
          // tightly packed like Windows "This PC". The detailed status badges
          // live inside the folder once opened — keep this view scannable.
          //
          // Selection semantics match the in-folder grid: single click selects,
          // double-click opens the folder, Ctrl/Shift modifiers extend the
          // selection. Background click clears.
          <div
            className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10 gap-2"
            onClick={folder_selection.handle_background_click}
          >
            {folders.map(folder => {
              const fid = folder_id_for(folder);
              const is_sel = folder_selection.is_selected(fid);
              return (
                <button
                  key={fid}
                  onClick={(e) => {
                    e.stopPropagation();
                    folder_selection.handle_item_click(fid, e);
                  }}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    // Opening a folder navigates away — clear the
                    // selection first so we don't ship a stale check chip
                    // through the route change.
                    folder_selection.clear();
                    open_folder(folder);
                  }}
                  className={`group relative flex flex-col items-center gap-1 p-3 rounded-xl focus:outline-none transition-colors ${
                    is_sel
                      ? 'bg-brand-emerald/20 ring-2 ring-brand-emerald'
                      : 'hover:bg-brand-emerald/10 focus:bg-brand-emerald/15'
                  }`}
                  title={`${folder.title} — ${folder.item_count} item${folder.item_count === 1 ? '' : 's'}`}
                >
                  {is_sel && (
                    <span className="absolute top-1 left-1 flex h-4 w-4 items-center justify-center rounded-full bg-brand-emerald text-white shadow">
                      <Check size={10} strokeWidth={3} />
                    </span>
                  )}
                  <div className="relative">
                    <Folder
                      size={56}
                      className="text-amber-400 fill-amber-400/30 group-hover:text-amber-300 transition-colors"
                      strokeWidth={1.5}
                    />
                    {/* Item count chip on the folder corner — keeps the visual
                        density low while still giving the at-a-glance number. */}
                    <span className="absolute -bottom-0.5 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-bg-main border border-border-subtle text-[9px] font-bold text-text-main flex items-center justify-center">
                      {folder.item_count}
                    </span>
                  </div>
                  <span
                    className="text-xs text-text-main text-center w-full line-clamp-2 leading-tight mt-1"
                    title={folder.title}
                  >
                    {folder.title}
                  </span>
                </button>
              );
            })}
          </div>
        )
      )}

      {/* Folder selection action bar — only at the root grid (not in a
          folder, where the item-level bar is rendered instead). */}
      {!in_folder_view && (
        <SelectionActionBar
          count={folder_selection.selected_count}
          on_clear={folder_selection.clear}
          on_delete={handle_folder_bulk_delete}
          busy={folder_bulk_deleting}
          label={`${folder_selection.selected_count} ${folder_selection.selected_count === 1 ? 'folder' : 'folders'} selected`}
        />
      )}

      {/* Tabs + filters + sort — only shown inside a folder AND only in
          "cards" mode. File-view mode hides all of this for a clean,
          file-explorer-like experience (just back button, header, files). */}
      {in_folder_view && <>
      {view_mode === 'cards' && <>
      <div className="flex items-center gap-1 p-1.5 bg-black/5 dark:bg-white/5 rounded-2xl w-fit border border-border-subtle">
        {TABS.map(tab => {
          const count = tab.id === 'all' ? counts.all
            : tab.id === 'failed' ? counts.failed
              : tab.id === 'processing' ? counts.processing
                : tab.id === 'videos' ? counts.videos
                  : undefined;
          return (
            <button
              key={tab.id}
              onClick={() => apply_tab(tab.id)}
              className={`flex items-center gap-2 px-5 py-2 rounded-xl font-bold text-xs transition-all ${active_tab === tab.id ? 'bg-bg-card shadow-sm text-text-main' : 'text-text-muted hover:text-text-main'
                }`}
            >
              {tab.label}
              {count !== undefined && count > 0 && (
                <span className="px-1.5 py-0.5 rounded-md text-[10px] bg-brand-emerald/10 text-brand-emerald">{count}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted" size={16} />
          <input
            type="text"
            value={search}
            onChange={(e) => { set_search(e.target.value); set_page(1); }}
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
              on_change={(v) => { set_status_filter((v ?? '') as StatusFilter); set_page(1); }}
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
              on_change={(v) => { set_type_filter(v ?? ''); set_page(1); }}
              is_clearable
              placeholder="all types"
              options={[
                { label: 'video', value: 'video' },
                { label: 'image', value: 'image' },
                { label: 'thumbnail', value: 'thumbnail' },
              ]}
            />
          </div>
        </div>

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
      </>}

      {loading ? (
        <div className="flex items-center justify-center py-20 text-text-muted">
          <Loader2 size={28} className="animate-spin" />
        </div>
      ) : items.length === 0 ? (
        <div className="p-16 text-center bg-black/5 dark:bg-white/5 rounded-3xl border border-dashed border-border-subtle space-y-3">
          <Clapperboard size={48} className="mx-auto text-text-muted opacity-50" />
          <h3 className="text-lg font-bold text-text-main">Library is empty</h3>
          <p className="text-sm text-text-muted">
            From the <span className="font-bold">Captured Videos</span> page, click "Save to Local Library".
          </p>
          <button
            onClick={() => navigate(`/dashboard/ott/${ott_id}/videos`)}
            className="btn-primary px-6 py-2"
          >
            Open Captured Videos
          </button>
        </div>
      ) : (() => {
        // ── Reusable pagination + view-mode toolbar ──────────────────────
        // Rendered both at the top (sticky, so the user can change pages
        // without scrolling all the way down) and at the bottom (legacy
        // position, kept for users who scroll past the list).
        // Apply the jump-to-page input — clamps to [1, total_pages] and
        // shows a brief toast on invalid values so the user knows why
        // nothing happened. Called from Enter / blur on the input.
        const apply_page_jump = () => {
          const trimmed = page_jump_input.trim();
          if (!trimmed) return;
          const n = parseInt(trimmed, 10);
          if (!Number.isFinite(n) || n < 1) {
            toast.error('Enter a page number ≥ 1');
            set_page_jump_input('');
            return;
          }
          const clamped = Math.min(total_pages, n);
          if (clamped !== page) set_page(clamped);
          set_page_jump_input('');
        };

        // Right-aligned controls only — no surrounding background or border.
        // Layout: showing-count · per-page (CommonSearchSelect) · jump-to-page
        // input · prev / next. Page-number buttons removed; the jump input
        // takes their place for direct navigation.
        const pagination_bar = (
          <div className="flex flex-wrap items-center justify-end gap-3 text-xs text-text-muted">
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
                        apply_page_jump();
                      }
                    }}
                    onFocus={(e) => e.currentTarget.select()}
                    onBlur={() => { if (page_jump_input) apply_page_jump(); }}
                    className="w-14 rounded-xl border border-border-subtle bg-transparent px-2 py-1.5 text-center text-xs font-bold text-text-main outline-none transition-colors hover:border-brand-blue/40 focus:border-brand-blue"
                    title="Type a page number and press Enter"
                  />
                  <span className="ml-1">of <span className="font-medium text-text-main ps-1">{total_pages}</span></span>
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
        );

        // ── File-explorer view: 64px file-type icon + name (truncated) ───
        // Pick the icon by save_type so videos/images get the right glyph.
        // Color matches the existing status palette so an at-a-glance scan
        // tells the user which files are still pending vs. complete.
        const file_icon_for = (item: LibraryItem) => {
          // Tint by R2 readiness: emerald when the row has a file_url,
          // muted otherwise. The pre-R2 status palette doesn't apply
          // anymore — there are no intermediate states.
          const status_tint = item.file_url ? 'text-brand-emerald' : 'text-text-muted';
          if (item.save_type === 'image') return <FileImage size={56} className={`${status_tint} fill-current/10`} strokeWidth={1.5} />;
          if (item.save_type === 'thumbnail') return <FileImage size={56} className={`${status_tint} fill-current/10`} strokeWidth={1.5} />;
          if (item.save_type === 'video') return <FileVideo size={56} className={`${status_tint} fill-current/10`} strokeWidth={1.5} />;
          return <FileIcon size={56} className={`${status_tint} fill-current/10`} strokeWidth={1.5} />;
        };
        // Display extension as a tiny corner badge (mp4, m3u8, jpg…). Falls
        // back to original_video_type for rows that haven't been processed.
        const file_ext_for = (item: LibraryItem): string =>
          (item.file_ext || item.original_video_type || item.save_type || '').toLowerCase();

        const items_view = view_mode === 'files' ? (
          // File view — real file-explorer feel. Always renders the
          // file-type icon (no thumbnail preview), with the extension as a
          // corner badge. The user explicitly wanted icons over thumbnails
          // here so the grid scans like Windows Explorer's icon view.
          // The wrapper handles "click empty area to clear selection" — any
          // click that bubbles up here without being stopped by a tile
          // counts as background.
          <div
            className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10 gap-2"
            onClick={selection.handle_background_click}
          >
            {items.map(item => {
              const is_sel = selection.is_selected(item.id);
              const is_opened = !is_sel && opened_item_id === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={(e) => handle_item_tile_click(item.id, e)}
                  onDoubleClick={(e) => handle_item_tile_dblclick(item, e)}
                  className={`group relative flex flex-col items-center gap-1 p-3 rounded-xl focus:outline-none transition-colors ${
                    is_sel
                      ? 'bg-brand-emerald/20 ring-2 ring-brand-emerald'
                      : is_opened
                        ? 'bg-brand-emerald/10'
                        : 'hover:bg-brand-emerald/10 focus:bg-brand-emerald/15'
                  }`}
                  title={item.title || item.file_name || 'Untitled'}
                >
                  {/* Selected check chip — top-left, only when selected.
                      The opened state intentionally has no chip / no ring
                      so it reads as "this is what you just opened" rather
                      than "this is part of the selection". */}
                  {is_sel && (
                    <span className="absolute top-1 left-1 flex h-4 w-4 items-center justify-center rounded-full bg-brand-emerald text-white shadow">
                      <Check size={10} strokeWidth={3} />
                    </span>
                  )}
                  <div className="relative">
                    {file_icon_for(item)}
                    {file_ext_for(item) && (
                      <span className="absolute -bottom-0.5 -right-1 px-1.5 h-[18px] rounded-md bg-bg-main border border-border-subtle text-[9px] font-bold uppercase text-text-main flex items-center justify-center">
                        {file_ext_for(item)}
                      </span>
                    )}
                  </div>
                  <span
                    className="text-xs text-text-main text-center w-full line-clamp-2 leading-tight mt-1"
                    title={item.title || item.file_name || 'Untitled'}
                  >
                    {item.title || item.file_name || 'Untitled'}
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <div
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5"
            onClick={selection.handle_background_click}
          >
            {items.map(item => {
              const is_sel = selection.is_selected(item.id);
              const is_opened = !is_sel && opened_item_id === item.id;
              return (
                <div
                  key={item.id}
                  onClick={(e) => handle_item_tile_click(item.id, e)}
                  onDoubleClick={(e) => handle_item_tile_dblclick(item, e)}
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
                    ott_id={ott_id ?? ''}
                    selected={is_sel}
                    on_play={() => set_playing(item)}
                    on_delete={() => handle_delete(item.id)}
                    on_retry={() => handle_retry(item.id)}
                    on_copy_path={() => handle_copy_path(item.file_url ?? item.download_url)}
                  />
                </div>
              );
            })}
          </div>
        );

        return <>
          {items_view}

          {/* Bottom-right pagination — single toolbar below the grid.
              Cards mode only; file view shows everything on one page so a
              pagination bar would be redundant. */}
          {view_mode === 'cards' && (
            <div className="pt-2">
              {pagination_bar}
            </div>
          )}
        </>;
      })()}
      </>}

      {/* Floating bottom-center selection bar — only inside a folder, only
          when at least one item is selected. Bulk delete confirms with
          singular vs plural copy based on count. */}
      {in_folder_view && (
        <SelectionActionBar
          count={selection.selected_count}
          on_clear={selection.clear}
          on_delete={handle_bulk_delete}
          busy={bulk_deleting}
        />
      )}

      {/* Player overlay — sized to the media's NATURAL aspect ratio.
          Outer flex centers the content; inner uses max-w/max-h vw/vh so the
          <video>/<img> never stretches past the viewport, but also never
          balloons past its real dimensions (object-contain preserves ratio).
          A thin caption bar sits below as a separate row so it doesn't
          compete with the media for vertical space. */}
      {playing && (() => {
        // Locate the playing row in the visible items array so we can
        // step ←/→ to its neighbours.
        const cur_idx = items.findIndex(i => i.id === playing.id);
        const prev_item = cur_idx > 0 ? items[cur_idx - 1] : null;
        const next_item = cur_idx >= 0 && cur_idx < items.length - 1 ? items[cur_idx + 1] : null;
        const is_video_kind = !!playing.file_url && (
          playing.file_type === 'video'
          || playing.file_type === 'playlist'
          || (playing.mime_type ?? '').startsWith('video/')
        );
        return (
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

            {/* Prev / Next — disabled at the ends of the list. */}
            <button
              onClick={(e: React.MouseEvent) => { e.stopPropagation(); if (prev_item) set_playing(prev_item); }}
              disabled={!prev_item}
              className="absolute left-4 top-1/2 -translate-y-1/2 p-3 rounded-full bg-black/60 text-white/80 hover:text-white hover:bg-black/80 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              aria-label="Previous file"
            >
              <ChevronLeft size={28} />
            </button>
            <button
              onClick={(e: React.MouseEvent) => { e.stopPropagation(); if (next_item) set_playing(next_item); }}
              disabled={!next_item}
              className="absolute right-4 top-1/2 -translate-y-1/2 p-3 rounded-full bg-black/60 text-white/80 hover:text-white hover:bg-black/80 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              aria-label="Next file"
            >
              <ChevronRight size={28} />
            </button>

            <div
              className="flex items-center justify-center max-w-[92vw] max-h-[82vh]"
              onClick={(e) => e.stopPropagation()}
            >
              {is_video_kind && playing.file_url ? (
                /*
                 * `max-w / max-h + w-auto / h-auto` keeps the media at
                 * its NATURAL aspect ratio: a 9:16 portrait file stays
                 * tall, a 16:9 stays wide. Hard-coded `w-[92vw] h-[82vh]`
                 * (the old behaviour) stretched everything to a wide
                 * rectangle and lost the original framing.
                 */
                <video
                  // Keyed on the row id so changing prev/next forces a
                  // full reload of the element (otherwise the same
                  // <video> keeps the old src buffered in some
                  // browsers).
                  key={playing.id}
                  src={playing.file_url}
                  controls
                  autoPlay
                  playsInline
                  poster={playing.thumbnail_display_url ?? undefined}
                  className="max-w-[92vw] max-h-[82vh] w-auto h-auto rounded-2xl bg-black shadow-2xl"
                />
              ) : playing.file_url ? (
                <img
                  key={playing.id}
                  src={playing.file_url}
                  alt={playing.title ?? 'image'}
                  className="max-w-[92vw] max-h-[82vh] w-auto h-auto rounded-2xl shadow-2xl"
                />
              ) : (
                <p className="text-white text-sm">No streamable file.</p>
              )}
            </div>

            <p
              className="text-sm text-white/80 font-medium text-center max-w-[92vw] truncate"
              onClick={(e) => e.stopPropagation()}
              title={playing.title ?? ''}
            >
              {playing.title ?? '(no title)'}
              {items.length > 0 && cur_idx >= 0 && (
                <span className="ml-2 text-white/40 text-[11px] font-normal">
                  ({cur_idx + 1} / {items.length})
                </span>
              )}
            </p>
          </div>
        );
      })()}
    </div>
  );
};

// LibraryCard moved to ../../../components/library/LibraryCard.tsx so
// LibraryBrowserPage can reuse the same design.

export default OttLibraryPage;
