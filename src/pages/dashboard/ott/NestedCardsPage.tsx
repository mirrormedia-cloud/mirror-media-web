/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom';
import { motion } from 'motion/react';
import toast from 'react-hot-toast';
import {
  ChevronRight,
  ArrowLeft,
  RefreshCw,
  Loader2,
  AlertCircle,
  LayoutGrid,
  Code,
  Layers,
  History,
  Settings,
  Video,
  Copy,
  Trash2,
  Download,
  ExternalLink,
  Save,
  Folder,
  CheckSquare,
  X,
  Check,
} from 'lucide-react';
import { ott_service } from '../../../services/ott_service';
import {
  ApiNode,
  BuiltCard,
  NestedCardsPageResponse,
  CapturedVideoSummary,
  ApiCallLog,
} from '../../../types';
import NestedCardRenderer, { ExpandedMap, ChildContext } from '../../../components/dashboard/NestedCardRenderer';
import ApiCardBuilderModal from './steps/components/ApiCardBuilderModal';
import CaptureVideoModal from './steps/components/CaptureVideoModal';
import CardActionsManagerModal from './steps/components/CardActionsManagerModal';
import CardActionPopup, { CardActionDispatch } from './steps/components/CardActionPopup';
import DebugConsole from '../../../components/dashboard/DebugConsole';
import { JsonTreeViewer } from '../../../components/ui/JsonTreeViewer';
import { useGridSelection } from '../../../hooks/useGridSelection';
import { SelectionActionBar } from '../../../components/ui/SelectionActionBar';
import { useConfirm } from '../../../components/ui/ConfirmDialog';

type TabType = 'cards' | 'response' | 'videos' | 'logs' | 'settings';

const NestedCardsPage: React.FC = () => {
  const { ott_id, parent_api_id, item_key, child_api_id } = useParams<{
    ott_id: string;
    parent_api_id: string;
    item_key: string;
    child_api_id: string;
  }>();
  const [search_params] = useSearchParams();
  const navigate = useNavigate();
  const confirm = useConfirm();

  const card_index = useMemo(() => {
    const v = search_params.get('card_index');
    return v ? Math.max(0, parseInt(v, 10) || 0) : 0;
  }, [search_params]);
  const source_response_id_q = search_params.get('source_response_id') || undefined;
  const parent_item_key_q = search_params.get('parent_item_key') || undefined;
  const action_id_q = search_params.get('action_id') || undefined;
  const decoded_item_key = item_key ? decodeURIComponent(item_key) : '';

  const [data, set_data] = useState<NestedCardsPageResponse | null>(null);
  const [loading, set_loading] = useState(true);
  const [syncing, set_syncing] = useState(false);
  const [error_text, set_error_text] = useState<string | null>(null);
  const [active_tab, set_active_tab] = useState<TabType>('cards');

  const [logs, set_logs] = useState<ApiCallLog[]>([]);
  const [logs_loading, set_logs_loading] = useState(false);

  const [card_builder_open, set_card_builder_open] = useState(false);
  const [actions_manager_open, set_actions_manager_open] = useState(false);
  const [capture_modal_open, set_capture_modal_open] = useState(false);

  const [all_apis, set_all_apis] = useState<ApiNode[]>([]);

  const [expanded_children, set_expanded_children] = useState<ExpandedMap>({});
  const [busy_action_keys, set_busy_action_keys] = useState<Record<string, boolean>>({});

  // Card-action popup (gear icon + skip-modal off + click → opens this)
  const [popup_state, set_popup_state] = useState<{
    api_node: ApiNode;
    card: BuiltCard;
    source_response_id: string | null | undefined;
    parent_item_key: string | null | undefined;
    busy_child_id: string | null;
  } | null>(null);

  // Per-card capture: when set, opens CaptureVideoModal scoped to this card's raw_item.
  const [per_card_capture, set_per_card_capture] = useState<{
    api_node: ApiNode;
    card: BuiltCard;
    source_response_id: string | null | undefined;
  } | null>(null);

  // Drawer for "Run" results when the user picks Run instead of Run & Show.
  const [drawer_state, set_drawer_state] = useState<{
    card: BuiltCard;
    child_api: ApiNode;
    child_response: any;
    child_loading: boolean;
  } | null>(null);

  // ── Capture mapping (persisted on api_node.card_config.capture_mapping) ─
  const [capture_mapping, set_capture_mapping] = useState<import('../../../types').CaptureMapping | null>(null);
  const [mapping_modal_open, set_mapping_modal_open] = useState(false);

  // ── Per-card library save state ────────────────────────────────────────
  const [selected_card_indices, set_selected_card_indices] = useState<Set<number>>(new Set());
  const [saving_card_indices, set_saving_card_indices] = useState<Set<number>>(new Set());
  const [saved_to_library_indices, set_saved_to_library_indices] = useState<Set<number>>(new Set());
  // Cards normally render without a checkbox so the grid stays clean. The
  // user clicks "Select Videos" to enter selection mode — only then do we
  // pass on_toggle_card_select down (which is what makes the checkbox
  // appear inside NestedCardRenderer).
  const [selection_mode, set_selection_mode] = useState(false);

  // ── Pagination state for the child API (Prev/Next buttons) ────────────
  // Tracks which page is currently loaded + the next-state hint from the
  // backend so we can disable Next when no more pages exist. We start
  // optimistically (page 1, has_next true) since the URL params don't tell
  // us what page the saved response actually represents.
  const [child_page_state, set_child_page_state] = useState<{
    page_number: number;
    cursor_value: string | null;
    id_value: string | null;
    offset_value: number | null;
    next_cursor: string | null;
    next_id: string | null;
    next_offset: number | null;
    has_next: boolean;
    total_pages: number | null;
    total_items: number | null;
    busy: boolean;
  }>({
    page_number: 1,
    cursor_value: null,
    id_value: null,
    offset_value: null,
    next_cursor: null,
    next_id: null,
    next_offset: null,
    has_next: true,
    total_pages: null,
    total_items: null,
    busy: false,
  });

  // Per-call page size override. null = use the value configured on the API
  // (pagination_config.limit_value). Stored as a string so the input field
  // can carry partial typing — coerced to number when the call fires.
  const [page_size_input, set_page_size_input] = useState<string>('');
  const [loading_all, set_loading_all] = useState(false);
  // Flips true after Select-All merges every page into one response. While
  // active, Prev/Next are disabled (there's no "current page" anymore — the
  // tab shows the merged set). The size input stays enabled so typing a new
  // size + Enter resets the view to page 1 at that limit (clears this flag).
  const [all_loaded, set_all_loaded] = useState(false);
  // Local "jump to page" input — a string so the field can hold partial typing.
  const [page_jump_input, set_page_jump_input] = useState<string>('');

  // ── Loaders ────────────────────────────────────────────────────────────
  const load = useCallback(async (force_sync = false) => {
    if (!ott_id || !parent_api_id || !item_key || !child_api_id) return;
    if (force_sync) set_syncing(true); else set_loading(true);
    set_error_text(null);
    try {
      const args: Parameters<typeof ott_service.get_nested_cards_page>[0] = {
        ott_id,
        parent_api_id,
        item_key: decoded_item_key,
        child_api_id,
        card_index,
      };
      if (source_response_id_q) args.source_response_id = source_response_id_q;
      if (parent_item_key_q !== undefined) args.parent_item_key = parent_item_key_q;
      if (action_id_q) args.action_id = action_id_q;
      if (force_sync) args.force_sync = true;
      const res = await ott_service.get_nested_cards_page(args);
      if (!res.success || !res.data) throw new Error(res.message || 'Failed to load nested cards');
      set_data(res.data);
    } catch (err: any) {
      set_error_text(err?.message || 'Failed to load nested cards');
      toast.error(err?.message || 'Failed to load nested cards');
    } finally {
      set_loading(false);
      set_syncing(false);
    }
  }, [ott_id, parent_api_id, child_api_id, decoded_item_key, item_key, card_index, source_response_id_q, parent_item_key_q, action_id_q]);

  useEffect(() => { load(false); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [load]);

  // Load the capture mapping for the current child API (if configured).
  useEffect(() => {
    if (!ott_id || !child_api_id) return;
    let cancelled = false;
    ott_service.get_capture_mapping(ott_id, child_api_id)
      .then(res => {
        if (cancelled || !res.success || !res.data) return;
        set_capture_mapping(res.data.mapping ?? null);
      })
      .catch(() => { /* ignore */ });
    return () => { cancelled = true; };
  }, [ott_id, child_api_id]);

  // Load which cards are already in the library (so the per-card icon
  // shows ✓ and the Save button hides). We reuse the URL → library_item
  // mapping by computing each card's URL via capture_mapping locally.
  //
  // Also re-runs on window/tab focus so that if the user navigates to
  // Library, deletes an item, and comes back, the per-card "saved"
  // marker syncs and Save becomes available again. Without this the
  // card stays stuck as "saved" until full reload.
  const refresh_saved_indices = useCallback(async (): Promise<void> => {
    if (!ott_id || !data || !capture_mapping || data.cards_data.cards.length === 0) return;
    try {
      const res = await ott_service.get_library_items(ott_id, { limit: 200 });
      if (!res.success || !res.data) return;
      const saved_urls = new Set(res.data.items.map(i => i.original_video_url ?? '').filter(Boolean));
      const indices = new Set<number>();
      for (const card of data.cards_data.cards) {
        for (const raw_path of capture_mapping.video_url_paths) {
          const idx_path = raw_path.replace(/\[0\]/g, `[${card.index}]`);
          const value = (() => {
            if (!data.child_response) return undefined;
            const parts = idx_path.replace(/\[(\d+)\]/g, '.$1').split('.').filter(Boolean);
            let cur: any = data.child_response;
            for (const p of parts) {
              if (cur === null || cur === undefined) return undefined;
              cur = cur[p];
            }
            return cur;
          })();
          if (typeof value === 'string' && saved_urls.has(value)) {
            indices.add(card.index);
            break;
          }
        }
      }
      set_saved_to_library_indices(indices);
    } catch { /* ignore */ }
  }, [ott_id, data, capture_mapping]);

  useEffect(() => {
    if (!ott_id) return;
    set_saved_to_library_indices(new Set());
    void refresh_saved_indices();
  }, [ott_id, refresh_saved_indices]);

  // Re-sync when the user returns to this tab — typically after
  // deleting items in /dashboard/library and coming back.
  useEffect(() => {
    const on_focus = () => { void refresh_saved_indices(); };
    const on_visible = () => { if (document.visibilityState === 'visible') void refresh_saved_indices(); };
    window.addEventListener('focus', on_focus);
    document.addEventListener('visibilitychange', on_visible);
    return () => {
      window.removeEventListener('focus', on_focus);
      document.removeEventListener('visibilitychange', on_visible);
    };
  }, [refresh_saved_indices]);

  // Fetch all APIs once for child_apis lookups + recursive expansion.
  useEffect(() => {
    if (!ott_id) return;
    let cancelled = false;
    ott_service.get_ott_apis(ott_id)
      .then(res => {
        if (cancelled || !res.success || !res.data) return;
        const flat: ApiNode[] = [];
        const visit = (nodes: ApiNode[]) => {
          for (const n of nodes) {
            flat.push(n);
            if (n.children?.length) visit(n.children);
          }
        };
        visit(res.data.api_tree || []);
        set_all_apis(flat);
      })
      .catch(() => { /* ignore */ });
    return () => { cancelled = true; };
  }, [ott_id]);

  const children_by_parent = useMemo(() => {
    const map = new Map<string, ApiNode[]>();
    for (const n of all_apis) {
      if (!n.parent_id) continue;
      if (!map.has(n.parent_id)) map.set(n.parent_id, []);
      map.get(n.parent_id)!.push(n);
    }
    return map;
  }, [all_apis]);

  const child_api_full = useMemo(
    () => all_apis.find(a => a.id === child_api_id) ?? null,
    [all_apis, child_api_id],
  );

  const grandchild_apis = useMemo(
    () => (child_api_id ? (children_by_parent.get(child_api_id) || []) : []),
    [children_by_parent, child_api_id],
  );

  const load_logs = useCallback(async () => {
    if (!ott_id) return;
    set_logs_loading(true);
    try {
      const res = await ott_service.get_ott_logs(ott_id, { page: 1, limit: 50, ...(child_api_id ? { api_id: child_api_id } : {}) });
      if (res.success && res.data) set_logs(res.data.items);
    } catch { /* ignore */ } finally { set_logs_loading(false); }
  }, [ott_id, child_api_id]);

  useEffect(() => {
    if (active_tab === 'logs') load_logs();
  }, [active_tab, load_logs]);

  /**
   * Resolve the runtime page-size override. Empty input → use whatever the API
   * has configured (no override sent). Non-numeric / <1 → ignored. Tracked in
   * one place so prev/next/load-all all use the same value the user typed.
   */
  const resolve_runtime_limit = (): number | undefined => {
    const trimmed = page_size_input.trim();
    if (!trimmed) return undefined;
    const n = parseInt(trimmed, 10);
    if (!Number.isFinite(n) || n < 1) return undefined;
    return n;
  };

  // ── Child API page navigation (Prev/Next on this nested page) ────────
  const handle_child_page_navigate = async (direction: 'prev' | 'next') => {
    if (!ott_id || !parent_api_id || !child_api_id || !child_api_full) return;
    if (!child_api_full.pagination_enabled || !child_api_full.pagination_type) return;

    const state = child_page_state;
    const runtime_limit = resolve_runtime_limit();
    // Effective limit drives offset jumps locally; falls back to whatever
    // the API was configured with so non-overriding navigations still work.
    const effective_limit = runtime_limit
      ?? ((child_api_full.pagination_config?.limit_value as number | undefined) ?? 0);
    const options: {
      page_number?: number;
      cursor_value?: string;
      id_value?: string;
      offset_value?: number;
      limit_value?: number;
    } = {};
    if (runtime_limit !== undefined) options.limit_value = runtime_limit;

    if (child_api_full.pagination_type === 'page_number') {
      const target = direction === 'next' ? state.page_number + 1 : Math.max(1, state.page_number - 1);
      if (target === state.page_number) return;
      options.page_number = target;
    } else if (child_api_full.pagination_type === 'offset') {
      if (!effective_limit) {
        toast.error('Set a page size (limit_value) for offset Prev/Next');
        return;
      }
      const current = state.offset_value ?? 0;
      const target = direction === 'next' ? current + effective_limit : Math.max(0, current - effective_limit);
      if (target === current) return;
      options.offset_value = target;
    } else if (child_api_full.pagination_type === 'cursor' && direction === 'next' && state.next_cursor) {
      options.cursor_value = state.next_cursor;
    } else if (child_api_full.pagination_type === 'id_based' && direction === 'next' && state.next_id) {
      options.id_value = state.next_id;
    } else {
      toast.error('Previous page is not supported for cursor/id-based pagination');
      return;
    }

    // Manual Prev/Next implies we're back to single-page navigation, not
    // the merged view from Select-All.
    set_all_loaded(false);
    set_child_page_state(prev => ({ ...prev, busy: true }));
    try {
      const res = await ott_service.call_child_api_from_card({
        ott_id,
        child_api_id,
        parent_api_id,
        card_index,
        item_key: decoded_item_key,
        ...(parent_item_key_q !== undefined ? { parent_item_key: parent_item_key_q } : {}),
        ...(source_response_id_q ? { source_response_id: source_response_id_q } : {}),
        ...options,
      });
      if (!res.success || !res.data) throw new Error(res.message || 'Page fetch failed');
      const ps = res.data.pagination_state;
      set_child_page_state({
        page_number: ps?.current_page_number ?? (options.page_number ?? state.page_number),
        cursor_value: ps?.current_cursor ?? null,
        id_value: ps?.current_id ?? null,
        offset_value: ps?.current_offset ?? null,
        next_cursor: ps?.next_cursor ?? null,
        next_id: ps?.next_id ?? null,
        next_offset: ps?.next_offset ?? null,
        has_next: ps?.has_next ?? false,
        total_pages: ps?.total_pages ?? null,
        total_items: ps?.total_items ?? null,
        busy: false,
      });
      // Reload the nested cards page so the cards rebuild from the freshly-saved response.
      await load(false);
      if (direction === 'next' && ps && !ps.has_next && ps.stop_reason) {
        toast(`Reached the end (${ps.stop_reason})`, { duration: 4000 });
      }
    } catch (err: any) {
      toast.error(err?.message || 'Page fetch failed');
      set_child_page_state(prev => ({ ...prev, busy: false }));
    }
  };

  /**
   * Apply the page-size input by re-fetching from page 1 with the new limit.
   * Triggered on Enter / blur from the size input, so users get immediate
   * feedback instead of having to also click Prev/Next.
   */
  const handle_apply_page_size = async () => {
    if (!ott_id || !parent_api_id || !child_api_id || !child_api_full) return;
    if (!child_api_full.pagination_enabled || !child_api_full.pagination_type) return;
    if (child_page_state.busy || loading_all) return;

    const runtime_limit = resolve_runtime_limit();
    // Nothing to apply — input cleared. Don't fire a redundant call.
    if (runtime_limit === undefined) return;

    const options: {
      page_number?: number;
      offset_value?: number;
      limit_value: number;
    } = { limit_value: runtime_limit };

    // Reset to the start of the result set: page 1 / offset 0.
    if (child_api_full.pagination_type === 'page_number') options.page_number = 1;
    else if (child_api_full.pagination_type === 'offset') options.offset_value = 0;

    // Typing a size + Enter exits all-loaded mode — we're going back to a
    // single page (page 1) at the new limit.
    set_all_loaded(false);
    set_child_page_state(prev => ({ ...prev, busy: true }));
    try {
      const res = await ott_service.call_child_api_from_card({
        ott_id,
        child_api_id,
        parent_api_id,
        card_index,
        item_key: decoded_item_key,
        ...(parent_item_key_q !== undefined ? { parent_item_key: parent_item_key_q } : {}),
        ...(source_response_id_q ? { source_response_id: source_response_id_q } : {}),
        ...options,
      });
      if (!res.success || !res.data) throw new Error(res.message || 'Apply size failed');
      const ps = res.data.pagination_state;
      set_child_page_state({
        page_number: ps?.current_page_number ?? 1,
        cursor_value: ps?.current_cursor ?? null,
        id_value: ps?.current_id ?? null,
        offset_value: ps?.current_offset ?? 0,
        next_cursor: ps?.next_cursor ?? null,
        next_id: ps?.next_id ?? null,
        next_offset: ps?.next_offset ?? null,
        has_next: ps?.has_next ?? false,
        total_pages: ps?.total_pages ?? null,
        total_items: ps?.total_items ?? null,
        busy: false,
      });
      await load(false);
    } catch (err: any) {
      toast.error(err?.message || 'Apply size failed');
      set_child_page_state(prev => ({ ...prev, busy: false }));
    }
  };

  /**
   * Jump directly to an arbitrary page. Only meaningful for `page_number` and
   * `offset` strategies (cursor / id_based have no addressable page index, so
   * the input is hidden for those). For offset, page N → offset = (N-1) * limit.
   */
  const handle_jump_to_page = async () => {
    if (!ott_id || !parent_api_id || !child_api_id || !child_api_full) return;
    if (!child_api_full.pagination_enabled || !child_api_full.pagination_type) return;
    if (child_page_state.busy || loading_all) return;

    const trimmed = page_jump_input.trim();
    if (!trimmed) return;
    const target_page = parseInt(trimmed, 10);
    if (!Number.isFinite(target_page) || target_page < 1) {
      toast.error('Enter a page number ≥ 1');
      return;
    }
    // No-op if we're already on this page (and not in all-loaded mode).
    if (!all_loaded && target_page === child_page_state.page_number) return;

    const runtime_limit = resolve_runtime_limit();
    const effective_limit = runtime_limit
      ?? ((child_api_full.pagination_config?.limit_value as number | undefined) ?? 0);

    const options: { page_number?: number; offset_value?: number; limit_value?: number } = {};
    if (runtime_limit !== undefined) options.limit_value = runtime_limit;

    if (child_api_full.pagination_type === 'page_number') {
      options.page_number = target_page;
    } else if (child_api_full.pagination_type === 'offset') {
      if (!effective_limit) {
        toast.error('Set a page size to jump to a page on offset pagination');
        return;
      }
      options.offset_value = (target_page - 1) * effective_limit;
    } else {
      toast.error('Page jump not supported for cursor/id-based pagination');
      return;
    }

    set_all_loaded(false);
    set_child_page_state(prev => ({ ...prev, busy: true }));
    try {
      const res = await ott_service.call_child_api_from_card({
        ott_id,
        child_api_id,
        parent_api_id,
        card_index,
        item_key: decoded_item_key,
        ...(parent_item_key_q !== undefined ? { parent_item_key: parent_item_key_q } : {}),
        ...(source_response_id_q ? { source_response_id: source_response_id_q } : {}),
        ...options,
      });
      if (!res.success || !res.data) throw new Error(res.message || 'Jump failed');
      const ps = res.data.pagination_state;
      set_child_page_state({
        page_number: ps?.current_page_number ?? target_page,
        cursor_value: ps?.current_cursor ?? null,
        id_value: ps?.current_id ?? null,
        offset_value: ps?.current_offset ?? null,
        next_cursor: ps?.next_cursor ?? null,
        next_id: ps?.next_id ?? null,
        next_offset: ps?.next_offset ?? null,
        has_next: ps?.has_next ?? false,
        total_pages: ps?.total_pages ?? null,
        total_items: ps?.total_items ?? null,
        busy: false,
      });
      set_page_jump_input('');
      await load(false);
    } catch (err: any) {
      toast.error(err?.message || 'Jump failed');
      set_child_page_state(prev => ({ ...prev, busy: false }));
    }
  };

  /**
   * "Select All" — fetch every page using the configured strategy and store
   * the merged response. After this runs, the cards tab shows everything in
   * one shot. Honours the runtime page-size override if the user typed one
   * (passed as limit_value so each page upstream is fetched at that size).
   */
  const handle_load_all_pages = async () => {
    if (!ott_id || !parent_api_id || !child_api_id || !child_api_full) return;
    if (!child_api_full.pagination_enabled || !child_api_full.pagination_type) return;
    set_loading_all(true);
    set_child_page_state(prev => ({ ...prev, busy: true }));
    try {
      const runtime_limit = resolve_runtime_limit();
      set_all_loaded(true);
      const res = await ott_service.call_child_api_from_card({
        ott_id,
        child_api_id,
        parent_api_id,
        card_index,
        item_key: decoded_item_key,
        ...(parent_item_key_q !== undefined ? { parent_item_key: parent_item_key_q } : {}),
        ...(source_response_id_q ? { source_response_id: source_response_id_q } : {}),
        fetch_all_pages: true,
        ...(runtime_limit !== undefined ? { limit_value: runtime_limit } : {}),
      });
      if (!res.success || !res.data) throw new Error(res.message || 'Load all failed');
      // After load-all the saved response is the merged set; reset the
      // single-page nav state so the UI stops trying to track "current page".
      set_child_page_state(prev => ({
        ...prev,
        page_number: 1,
        offset_value: null,
        cursor_value: null,
        id_value: null,
        next_cursor: null,
        next_id: null,
        next_offset: null,
        has_next: false,
        busy: false,
      }));
      const summary = res.data.pagination
        ? `Loaded ${res.data.pagination.pages_fetched} page(s) — ${res.data.pagination.total_items} item(s)`
        : 'All pages loaded';
      toast.success(summary, { duration: 5000 });
      await load(false);
    } catch (err: any) {
      toast.error(err?.message || 'Load all failed');
      set_child_page_state(prev => ({ ...prev, busy: false }));
    } finally {
      set_loading_all(false);
    }
  };

  // ── Action / nested handlers ───────────────────────────────────────────
  const open_card_action_popup = (args: {
    api_node: ApiNode;
    card: BuiltCard;
    source_response_id: string | null | undefined;
    parent_item_key: string | null | undefined;
  }) => {
    set_popup_state({ ...args, busy_child_id: null });
  };

  const open_card_builder_for = (_args: { api_node: ApiNode; sample_response?: any; source_response_id?: string }) => {
    set_card_builder_open(true);
  };

  /** Handle the user's choice in CardActionPopup. Mirrors OttManagePage's dispatch. */
  const handle_popup_dispatch = async (intent: CardActionDispatch) => {
    if (!popup_state || !ott_id) return;
    const { api_node, card, source_response_id, parent_item_key } = popup_state;

    if (intent.kind === 'capture_videos') {
      set_popup_state(null);
      set_per_card_capture({ api_node, card, source_response_id });
      return;
    }

    if (intent.kind === 'configure_card') {
      set_popup_state(null);
      open_card_builder_for({ api_node: intent.child_api });
      return;
    }

    set_popup_state(prev => prev ? { ...prev, busy_child_id: intent.child_api.id } : prev);
    try {
      const res = await ott_service.call_child_api_from_card({
        ott_id,
        child_api_id: intent.child_api.id,
        parent_api_id: api_node.id,
        card_index: card.index,
        item_key: card.item_key,
        parent_item_key: parent_item_key ?? undefined,
        source_response_id: source_response_id ?? undefined,
      });
      if (!res.success || !res.data) throw new Error(res.message || 'Child API failed');
      toast.success(res.message || 'Child API called');

      if (intent.kind === 'run_show_cards') {
        // Inline-expand under the parent card via the hoisted expanded map.
        set_popup_state(null);
        const child_node = all_apis.find(n => n.id === intent.child_api.id) ?? intent.child_api;
        const ctx: ChildContext = {
          api_node: child_node,
          cards: (res.data.cards.cards as BuiltCard[]) ?? [],
          card_enabled: res.data.cards.card_enabled,
          source_response_id: res.data.response_id ?? res.data.source_response_id,
          raw_response: res.data.response,
        };
        set_expanded_children(prev => ({
          ...prev,
          [`${api_node.id}__${card.item_key}__${child_node.id}`]: ctx,
        }));
      } else {
        // intent.kind === 'run' — show the response in a side drawer.
        set_popup_state(null);
        set_drawer_state({
          card,
          child_api: intent.child_api,
          child_response: res.data.response,
          child_loading: false,
        });
      }
    } catch (err: any) {
      toast.error(err?.message || 'Child API failed');
      set_popup_state(prev => prev ? { ...prev, busy_child_id: null } : prev);
    }
  };

  // ── Library save handlers ──────────────────────────────────────────────
  const toggle_card_select = (card: BuiltCard) => {
    set_selected_card_indices(prev => {
      const n = new Set(prev);
      if (n.has(card.index)) n.delete(card.index); else n.add(card.index);
      return n;
    });
  };

  const save_indices_to_library = async (indices: number[]) => {
    if (!ott_id || !child_api_id || indices.length === 0) return;
    if (!capture_mapping) {
      toast.error('Configure capture mapping first');
      return;
    }
    set_saving_card_indices(prev => {
      const n = new Set(prev);
      for (const i of indices) n.add(i);
      return n;
    });
    try {
      // Pull the parent show/series context off the in-memory parent_card so
      // the library can group every card from the same parent into one
      // folder. Title falls back to the parent's item_key when the parent
      // doesn't expose a `display_type === "title"` field.
      const parent_title_field = data?.parent_card?.fields.find(f => f.display_type === 'title')?.value;
      const parent_title = parent_title_field !== undefined && parent_title_field !== null
        ? String(parent_title_field)
        : (data?.parent_card?.item_key ?? null);
      const parent_item_key = data?.parent_card?.item_key ?? decoded_item_key ?? null;

      const res = await ott_service.save_cards_to_library(ott_id, {
        api_node_id: child_api_id,
        source_response_id: data?.source_response_id ?? null,
        card_indices: indices,
        parent_item_key,
        parent_title,
        ...(parent_api_id ? { parent_api_id } : {}),
      });
      if (!res.success || !res.data) throw new Error(res.message || 'Save failed');
      const { started, already, no_url } = res.data;
      if (started > 0) {
        toast.success(`${started} card${started === 1 ? '' : 's'} sent to Library${already > 0 ? ` (${already} already saved)` : ''}`);
      } else if (already > 0) {
        toast(`Already in Library — ${already} card${already === 1 ? '' : 's'}`);
      } else if (no_url > 0) {
        toast.error(`No URLs found in ${no_url} card${no_url === 1 ? '' : 's'}. Check the mapping.`);
      }
      // Mark them as saved so the per-card icon flips to ✓
      set_saved_to_library_indices(prev => {
        const n = new Set(prev);
        for (const i of indices) n.add(i);
        return n;
      });
      set_selected_card_indices(new Set());
    } catch (err: any) {
      toast.error(err?.message || 'Save failed');
    } finally {
      set_saving_card_indices(prev => {
        const n = new Set(prev);
        for (const i of indices) n.delete(i);
        return n;
      });
    }
  };

  const save_one_card_to_library = (card: BuiltCard) => save_indices_to_library([card.index]);
  const save_selected_to_library = () => save_indices_to_library(Array.from(selected_card_indices));
  const save_all_visible_to_library = () => {
    if (!data) return;
    const all_unsaved = data.cards_data.cards
      .map(c => c.index)
      .filter(i => !saved_to_library_indices.has(i));
    save_indices_to_library(all_unsaved);
  };

  const handle_card_action = async (args: {
    api_node: ApiNode;
    card: any;
    action: any;
    source_response_id: string | null | undefined;
    parent_item_key: string | null | undefined;
    expansion_key: string;
  }) => {
    const { api_node, card, action, source_response_id, parent_item_key } = args;
    if (!ott_id) return;
    const busy_key = `${action.id}:${card.item_key}`;

    if (action.action_type === 'open_url' && action.value_path) {
      const matched = card.fields.find((f: any) => f.path === action.value_path);
      const url = matched?.value;
      if (typeof url !== 'string' || !url) { toast.error('Could not resolve URL'); return; }
      window.open(url, '_blank', 'noopener,noreferrer');
      return;
    }

    if (action.action_type === 'copy_value' && action.value_path) {
      const matched = card.fields.find((f: any) => f.path === action.value_path);
      const value = matched?.value;
      if (value === undefined || value === null) { toast.error('Could not resolve value'); return; }
      try {
        await navigator.clipboard.writeText(String(value));
        toast.success('Copied');
      } catch {
        toast.error('Clipboard not available');
      }
      return;
    }

    if (action.action_type === 'call_child_api' && action.child_api_id) {
      // open_type=page: navigate deeper via the same nested route.
      if (action.open_type === 'page') {
        const params = new URLSearchParams();
        params.set('card_index', String(card.index));
        if (source_response_id) params.set('source_response_id', source_response_id);
        params.set('parent_item_key', card.item_key);
        params.set('action_id', action.id);
        navigate(
          `/dashboard/ott/${ott_id}/cards/${api_node.id}/${encodeURIComponent(card.item_key)}/${action.child_api_id}?${params.toString()}`,
        );
        return;
      }

      // Otherwise inline-expand under the parent card.
      const child_api = all_apis.find(n => n.id === action.child_api_id);
      if (!child_api) { toast.error('Child API not found'); return; }
      set_busy_action_keys(prev => ({ ...prev, [busy_key]: true }));
      try {
        const res = await ott_service.call_child_api_from_card({
          ott_id,
          child_api_id: child_api.id,
          parent_api_id: api_node.id,
          card_index: card.index,
          item_key: card.item_key,
          parent_item_key: parent_item_key ?? undefined,
          source_response_id: source_response_id ?? undefined,
        });
        if (!res.success || !res.data) throw new Error(res.message || 'Child API failed');
        toast.success(res.message || 'Child API called');
        const ctx: ChildContext = {
          api_node: child_api,
          cards: (res.data.cards.cards as any[]) ?? [],
          card_enabled: res.data.cards.card_enabled,
          source_response_id: res.data.response_id ?? res.data.source_response_id,
          raw_response: res.data.response,
        };
        set_expanded_children(prev => ({ ...prev, [`${api_node.id}__${card.item_key}__${child_api.id}`]: ctx }));
      } catch (err: any) {
        toast.error(err?.message || 'Child API failed');
      } finally {
        set_busy_action_keys(prev => ({ ...prev, [busy_key]: false }));
      }
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-32 gap-4 text-text-muted">
        <Loader2 size={36} className="animate-spin" />
        <p className="text-sm">Loading nested cards…</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-12 text-center space-y-4">
        <AlertCircle size={64} className="mx-auto text-brand-orange/50" />
        <h2 className="text-2xl font-bold text-text-main">{error_text || 'Nested cards not available'}</h2>
        <button onClick={() => navigate(`/dashboard/ott/${ott_id}/manage`)} className="btn-primary px-8">
          Back to OTT
        </button>
      </div>
    );
  }

  const cards_data = data.cards_data;
  const has_cards = cards_data.card_enabled && cards_data.cards.length > 0;

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      {/* Header — Back link + breadcrumb + title row, with the action toolbar
          on its own line below on narrow screens. The endpoint info is now
          presented as method-badge + resolved-endpoint primary + original-
          template subtle, instead of one long monospace blob. */}
      <div className="space-y-3">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1.5 text-[11px] font-bold text-text-muted hover:text-text-main transition-colors w-fit"
        >
          <ArrowLeft size={12} /> Back
        </button>
        <nav className="flex items-center gap-1.5 text-[11px] text-text-muted flex-wrap">
          <Link to={`/dashboard/ott/${ott_id}/manage`} className="hover:text-text-main transition-colors">OTT</Link>
          <ChevronRight size={11} />
          <span className="text-text-main font-medium">{data.parent_api.name}</span>
          {data.breadcrumb.map((b, i) => (
            <React.Fragment key={`${b.api_id}-${i}`}>
              <ChevronRight size={11} />
              <span className="font-mono text-text-muted">{b.item_key}</span>
            </React.Fragment>
          ))}
          <ChevronRight size={11} />
          <span className="text-brand-emerald font-medium">{data.child_api.name}</span>
        </nav>

        <div className="flex flex-col xl:flex-row xl:items-start justify-between gap-4">
          <div className="space-y-2 min-w-0 flex-1 my-2">
            <div className="flex items-center gap-3 flex-wrap mb-3">
              <h1 className="text-xl font-bold text-text-main tracking-tight">
                {data.parent_card?.fields.find(f => f.display_type === 'title')?.value
                  ? String(data.parent_card.fields.find(f => f.display_type === 'title')?.value)
                  : decoded_item_key}
              </h1>
              <span
                className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider ${data.cached ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30' : 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'}`}
              >
                {data.cached ? 'Cached' : 'Fresh'}
              </span>
              <span className="text-[10px] font-mono text-text-muted">depth {data.depth}</span>
            </div>

            {/* Endpoint pill — method as colored badge, resolved endpoint as
                the primary value, original template (with <slug>) as a
                smaller dimmed line for reference. */}
            <div className="flex flex-col gap-1 max-w-full">
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className={`shrink-0 text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${
                    data.child_api.method === 'GET' ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30' :
                    data.child_api.method === 'POST' ? 'bg-brand-blue/15 text-brand-blue border border-brand-blue/30' :
                    data.child_api.method === 'DELETE' ? 'bg-red-500/15 text-red-400 border border-red-500/30' :
                    'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                  }`}
                >
                  {data.child_api.method}
                </span>
                <span
                  className="text-xs font-mono text-text-main truncate"
                  title={data.child_resolved_endpoint ?? data.child_api.endpoint}
                >
                  {data.child_resolved_endpoint || data.child_api.endpoint}
                </span>
              </div>
              {data.child_resolved_endpoint && (
                <p
                  className="text-[10px] font-mono text-text-muted/70 truncate ml-7"
                  title={data.child_api.endpoint}
                >
                  template: {data.child_api.endpoint}
                </p>
              )}
            </div>
          </div>

          {/* Action toolbar. Primary action ("Capture Video URLs") stays
              prominent in brand blue. Secondary actions are compact pills
              with smaller padding so the row doesn't dominate the page. */}
          <div className="flex items-center gap-2 flex-wrap shrink-0">
            <button
              onClick={() => load(true)}
              disabled={syncing}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-bg-card border border-border-subtle text-text-main text-xs font-bold hover:border-brand-emerald/50 disabled:opacity-50"
              title="Re-fetch the child API response"
            >
              <RefreshCw size={13} className={syncing ? 'animate-spin' : ''} />
              {syncing ? 'Syncing…' : 'Sync'}
            </button>
            <button
              onClick={() => set_card_builder_open(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-bg-card border border-border-subtle text-text-main text-xs font-bold hover:border-brand-emerald/50"
            >
              <Layers size={13} />
              {child_api_full?.card_enabled ? 'Edit Card' : 'Create Card'}
            </button>
            <button
              onClick={() => set_mapping_modal_open(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-bg-card border border-border-subtle text-text-main text-xs font-bold hover:border-brand-emerald/50"
            >
              <Save size={13} />
              {capture_mapping ? 'Edit Mapping' : 'Configure Mapping'}
            </button>
            <button
              onClick={() => navigate(`/dashboard/ott/${ott_id}/library`)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-bg-card border border-border-subtle text-text-main text-xs font-bold hover:border-brand-emerald/50"
              title="Open the local library"
            >
              <Folder size={13} />
              Library
            </button>
            <button
              onClick={() => set_capture_modal_open(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-brand-blue text-white text-xs font-bold hover:scale-105 transition-transform shadow-md shadow-brand-blue/20"
            >
              <Video size={13} />
              Capture Video URLs
            </button>
          </div>
        </div>
      </div>

      {/* Bulk save toolbar — only when a mapping is configured.
          Two modes:
          - Default: shows "Select Videos" + "Save All Visible". Cards stay
            clean (no checkboxes overlapping the artwork).
          - Selection: shows "Select All", count, "Cancel", "Save Selected".
            Checkboxes appear on every card via on_toggle_card_select. */}
      {capture_mapping && cards_data.cards.length > 0 && (
        <div className="flex items-center justify-between gap-3 p-4 rounded-2xl bg-brand-emerald/5 border border-brand-emerald/20 flex-wrap">
          <p className="text-sm text-text-main">
            {selection_mode ? (
              selected_card_indices.size > 0
                ? <><span className="font-bold">{selected_card_indices.size}</span> selected</>
                : <span className="text-text-muted">Click a card to select it.</span>
            ) : (
              <span className="text-text-muted">Save all visible cards or pick specific ones to save.</span>
            )}
            {saved_to_library_indices.size > 0 && (
              <span className="ml-2 text-text-muted">· {saved_to_library_indices.size} already in library</span>
            )}
          </p>
          <div className="flex items-center gap-2 flex-wrap">
            {selection_mode ? (
              <>
                {(() => {
                  // "Select All" toggles between selecting every visible card
                  // and clearing the selection (so the same button does both).
                  const all_selected = selected_card_indices.size === cards_data.cards.length;
                  return (
                    <button
                      onClick={() => {
                        if (all_selected) set_selected_card_indices(new Set());
                        else set_selected_card_indices(new Set(cards_data.cards.map(c => c.index)));
                      }}
                      className="px-3 py-2 text-xs font-bold rounded-xl bg-bg-card border border-border-subtle text-text-main hover:border-brand-emerald/50 flex items-center gap-2"
                    >
                      <CheckSquare size={12} />
                      {all_selected ? 'Deselect All' : 'Select All'}
                    </button>
                  );
                })()}
                <button
                  onClick={() => {
                    set_selection_mode(false);
                    set_selected_card_indices(new Set());
                  }}
                  className="px-3 py-2 text-xs font-bold rounded-xl text-text-muted hover:text-text-main hover:bg-black/5 dark:hover:bg-white/5 flex items-center gap-1"
                >
                  <X size={12} /> Cancel
                </button>
                <button
                  onClick={save_selected_to_library}
                  disabled={selected_card_indices.size === 0 || saving_card_indices.size > 0}
                  className="btn-primary px-5 py-2 text-xs flex items-center gap-2 disabled:opacity-50"
                >
                  {saving_card_indices.size > 0 ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                  Save Selected ({selected_card_indices.size})
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => set_selection_mode(true)}
                  className="px-3 py-2 text-xs font-bold rounded-xl bg-bg-card border border-border-subtle text-text-main hover:border-brand-emerald/50 flex items-center gap-2"
                >
                  <CheckSquare size={12} />
                  Select Videos
                </button>
                <button
                  onClick={save_all_visible_to_library}
                  disabled={saving_card_indices.size > 0}
                  className="btn-primary px-5 py-2 text-xs flex items-center gap-2 disabled:opacity-50"
                >
                  {saving_card_indices.size > 0 ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                  Save All Visible ({cards_data.cards.length - saved_to_library_indices.size})
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Parent context card. Redesigned for readability:
            - Image fields (KEY_ART, thumbnail, etc.) render as a real thumbnail
              instead of a truncated URL, so users can see what they're working
              on at a glance.
            - Labels converted from raw_path (KEY_ART → "Key art") for friendlier
              scanning. Uppercase ALL_CAPS reads like shouting.
            - Value styling depends on type: numbers in mono, URLs as muted
              monospace links, long strings clamped to 2 lines.
            - Each field is its own padded sub-card for visual rhythm — the
              previous design crammed labels and values on top of each other. */}
      {data.parent_card && <ParentContextCard card={data.parent_card} />}

      {error_text && (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-500">
          {error_text}
        </div>
      )}

      {/* Tabs row — tabs on the left, child-API Prev/Next pill on the right.
          The pill is only rendered when the child has pagination_enabled, so
          the row collapses cleanly to just the tabs on non-paginated child APIs. */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-1 p-1.5 bg-black/5 dark:bg-white/5 rounded-2xl w-fit border border-border-subtle">
          {[
            { id: 'cards', label: 'Cards', icon: <LayoutGrid size={16} />, count: cards_data.cards.length },
            { id: 'response', label: 'Response JSON', icon: <Code size={16} /> },
            { id: 'videos', label: 'Captured Videos', icon: <Video size={16} />, count: data.captured_videos.length },
            { id: 'logs', label: 'Logs', icon: <History size={16} /> },
            { id: 'settings', label: 'Settings', icon: <Settings size={16} /> },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => set_active_tab(tab.id as TabType)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-xs transition-all ${
                active_tab === tab.id
                  ? 'bg-bg-card shadow-lg shadow-black/5 text-text-main'
                  : 'text-text-muted hover:text-text-main'
              }`}
            >
              {tab.icon}
              {tab.label}
              {tab.count !== undefined && tab.count > 0 && (
                <span className={`px-1.5 py-0.5 rounded-md text-[10px] ${active_tab === tab.id ? 'bg-brand-emerald/10 text-brand-emerald' : 'bg-black/10 dark:bg-white/10'}`}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {child_api_full?.pagination_enabled && child_api_full?.pagination_type && (() => {
          const supports_prev = child_api_full.pagination_type === 'page_number' || child_api_full.pagination_type === 'offset';
          const can_prev = supports_prev && !all_loaded && (
            child_api_full.pagination_type === 'page_number'
              ? child_page_state.page_number > 1
              : (child_page_state.offset_value ?? 0) > 0
          );
          // Next is disabled when: actively busy, mid-load-all, in all-loaded
          // mode (everything merged, nav doesn't apply), backend told us
          // there are no more pages, or we've already reached total_pages.
          // The previous `page_number > 1` guard was letting Next stay
          // clickable on page 1 even when backend already reported
          // `has_next: false`.
          const at_last_page = child_page_state.total_pages !== null
            && child_page_state.page_number >= child_page_state.total_pages;
          const can_next = !all_loaded && child_page_state.has_next && !at_last_page;
          const configured_limit = child_api_full.pagination_config?.limit_value as number | undefined;
          const can_jump = child_api_full.pagination_type === 'page_number'
            || child_api_full.pagination_type === 'offset';
          return (
            <div className="flex items-center gap-2 flex-wrap">
              {/* Page size override — empty input falls back to the configured
                  limit_value, so the placeholder shows that as a hint. Pressing
                  Enter (or blurring with a value) re-fetches from page 1 at
                  the new size; the input stays enabled even after Select-All
                  so the user can type a size to break out of all-loaded mode. */}
              <div className="flex items-center gap-1 p-1 rounded-2xl bg-bg-card border border-border-subtle">
                <span className="text-[10px] uppercase font-bold text-text-muted px-2">size</span>
                <input
                  type="number"
                  min={1}
                  value={page_size_input}
                  onChange={(e) => set_page_size_input(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      void handle_apply_page_size();
                    }
                  }}
                  onBlur={() => { void handle_apply_page_size(); }}
                  placeholder={configured_limit !== undefined ? String(configured_limit) : '20'}
                  disabled={child_page_state.busy || loading_all}
                  className="w-16 bg-black/10 dark:bg-white/10 border border-border-subtle rounded-lg px-2 py-1 text-center text-xs font-mono text-text-main focus:outline-none focus:ring-1 focus:ring-brand-emerald/50 disabled:opacity-50"
                  title="Per-call page size override — Enter to apply (leave blank to use the configured limit)"
                />
                <button
                  type="button"
                  onClick={handle_load_all_pages}
                  disabled={child_page_state.busy || loading_all}
                  className={`px-3 py-1.5 text-xs font-bold rounded-lg disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1 ${all_loaded ? 'text-amber-300 bg-amber-500/15' : 'text-amber-400 hover:bg-amber-500/10'}`}
                  title="Fetch every page using the strategy and merge into one response"
                >
                  {loading_all ? <Loader2 size={12} className="animate-spin" /> : <Layers size={12} />}
                  All
                </button>
              </div>

              <div className="flex items-center gap-1 p-1 rounded-2xl bg-bg-card border border-border-subtle">
                <button
                  onClick={() => handle_child_page_navigate('prev')}
                  disabled={child_page_state.busy || loading_all || !can_prev}
                  className="px-3 py-1.5 text-xs font-bold rounded-lg text-text-main hover:bg-brand-blue/10 hover:text-brand-blue disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
                  title={all_loaded ? 'All pages loaded — change size to paginate again' : (supports_prev ? 'Previous page' : 'Previous not supported for cursor/id-based pagination')}
                >
                  {child_page_state.busy ? <Loader2 size={12} className="animate-spin" /> : <ArrowLeft size={12} />}
                  Prev
                </button>
                <span className="text-[10px] font-mono text-text-muted px-2 flex items-center gap-1">
                  <Layers size={10} className="text-brand-blue" />
                  {all_loaded ? (
                    <span>all</span>
                  ) : can_jump ? (
                    <>
                      <span>p</span>
                      <input
                        type="number"
                        min={1}
                        {...(child_page_state.total_pages ? { max: child_page_state.total_pages } : {})}
                        value={page_jump_input || String(child_page_state.page_number)}
                        onChange={(e) => set_page_jump_input(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            void handle_jump_to_page();
                          }
                        }}
                        onFocus={(e) => e.currentTarget.select()}
                        onBlur={() => { if (page_jump_input) void handle_jump_to_page(); }}
                        disabled={child_page_state.busy || loading_all}
                        className="w-10 bg-black/10 dark:bg-white/10 border border-border-subtle rounded px-1 py-0.5 text-center text-[10px] font-mono text-text-main focus:outline-none focus:ring-1 focus:ring-brand-emerald/50 disabled:opacity-50"
                        title="Type a page number and press Enter to jump"
                      />
                      {child_page_state.total_pages !== null && (
                        <span className="text-text-muted/70">/ {child_page_state.total_pages}</span>
                      )}
                    </>
                  ) : (
                    <span>p{child_page_state.page_number}</span>
                  )}
                  {!all_loaded && child_page_state.total_items !== null && (
                    <span className="text-text-muted/60 ml-1">· {child_page_state.total_items} items</span>
                  )}
                </span>
                <button
                  onClick={() => handle_child_page_navigate('next')}
                  disabled={child_page_state.busy || loading_all || !can_next}
                  className="px-3 py-1.5 text-xs font-bold rounded-lg text-text-main hover:bg-brand-blue/10 hover:text-brand-blue disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
                  title={all_loaded ? 'All pages loaded — change size to paginate again' : (!child_page_state.has_next ? 'No more pages' : 'Next page')}
                >
                  Next
                  {child_page_state.busy ? <Loader2 size={12} className="animate-spin" /> : <ChevronRight size={12} />}
                </button>
              </div>
            </div>
          );
        })()}
      </div>

      {/* Tab content */}
      {active_tab === 'cards' && (
        <div className="space-y-4">
          {!has_cards ? (
            <div className="p-12 text-center bg-black/5 dark:bg-white/5 rounded-3xl border border-dashed border-border-subtle space-y-4">
              <Layers size={48} className="mx-auto text-text-muted opacity-50" />
              <h3 className="text-lg font-bold text-text-main">No cards configured for this API</h3>
              <p className="text-sm text-text-muted max-w-md mx-auto">
                The child API was called and a response is available. Configure cards to display the items.
              </p>
              <button onClick={() => set_card_builder_open(true)} className="btn-primary px-8 py-3">
                Create Card for this API
              </button>
            </div>
          ) : (
            child_api_full && (
              <NestedCardRenderer
                ott_id={ott_id ?? ''}
                api_node={child_api_full}
                cards={cards_data.cards}
                actions={cards_data.actions}
                children_by_parent={children_by_parent}
                all_apis={all_apis}
                source_response_id={data.source_response_id}
                parent_item_key={decoded_item_key}
                expanded={expanded_children}
                set_expanded={set_expanded_children}
                busy_action_keys={busy_action_keys}
                on_open_popup={open_card_action_popup}
                on_open_card_builder={open_card_builder_for}
                on_card_action={handle_card_action}
                {...(selection_mode ? { on_toggle_card_select: toggle_card_select } : {})}
                selected_card_indices={selected_card_indices}
                {...(capture_mapping ? { on_save_card_to_library: save_one_card_to_library } : {})}
                saving_card_indices={saving_card_indices}
                saved_to_library_indices={saved_to_library_indices}
              />
            )
          )}
        </div>
      )}

      {active_tab === 'response' && (
        <div className="bg-bg-card rounded-3xl border border-border-subtle p-6 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 text-xs text-text-muted">
              <span className="font-bold uppercase tracking-widest">HTTP {data.child_http_status ?? '?'}</span>
              <span className={data.child_call_success ? 'text-emerald-500' : 'text-red-500'}>
                {data.child_call_success ? 'success' : 'failed'}
              </span>
              {data.child_log_id && <span className="font-mono">log {data.child_log_id.slice(0, 8)}</span>}
            </div>
            <button
              onClick={() => navigator.clipboard.writeText(JSON.stringify(data.child_response, null, 2))}
              className="text-[10px] font-bold text-brand-emerald hover:underline flex items-center gap-1"
            >
              <Copy size={12} /> Copy JSON
            </button>
          </div>
          <JsonTreeViewer
            data={data.child_response}
            max_height={600}
            default_expanded_depth={1}
          />
        </div>
      )}

      {active_tab === 'videos' && (
        <CapturedVideosTab
          ott_id={ott_id ?? ''}
          videos={data.captured_videos}
          onChanged={() => load(false)}
        />
      )}

      {active_tab === 'logs' && (
        <div className="bg-bg-card rounded-[40px] border border-border-subtle overflow-hidden shadow-sm h-[700px] flex">
          {logs_loading ? (
            <div className="w-full flex items-center justify-center text-text-muted">
              <Loader2 size={28} className="animate-spin" />
            </div>
          ) : (
            <DebugConsole
              logs={logs}
              ott_id={ott_id}
              onClear={async () => {
                if (!ott_id) return;
                const ok = await confirm({
                  title: 'Clear logs for this OTT?',
                  message: 'Existing log entries will be permanently deleted.',
                  confirm_label: 'Clear logs',
                  danger: true,
                });
                if (!ok) return;
                await ott_service.clear_logs(ott_id);
                set_logs([]);
              }}
              className="w-full h-full border-none"
            />
          )}
        </div>
      )}

      {active_tab === 'settings' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="p-6 rounded-3xl bg-bg-card border border-border-subtle space-y-4">
            <h3 className="text-sm font-bold text-text-main">Card configuration</h3>
            <p className="text-xs text-text-muted">
              Manage <span className="font-mono">{data.child_api.name}</span>'s card builder, card actions, and quick-run settings.
            </p>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => set_card_builder_open(true)}
                className="px-4 py-2 rounded-xl bg-brand-emerald text-white font-bold text-sm hover:scale-105 transition-transform flex items-center gap-2 w-fit"
              >
                <Layers size={14} /> Open Card Builder
              </button>
              <button
                onClick={() => set_actions_manager_open(true)}
                className="px-4 py-2 rounded-xl bg-bg-main border border-border-subtle text-text-main font-bold text-sm hover:border-brand-emerald/50 flex items-center gap-2 w-fit"
              >
                <Settings size={14} /> Manage Card Actions
              </button>
            </div>
          </div>
        </div>
      )}

      {child_api_full && card_builder_open && ott_id && (
        <ApiCardBuilderModal
          isOpen={true}
          onClose={() => set_card_builder_open(false)}
          ott_id={ott_id}
          api_node={child_api_full}
          child_apis={grandchild_apis}
          {...(data.child_response !== undefined ? { sample_response: data.child_response } : {})}
          {...(data.source_response_id ? { source_response_id: data.source_response_id } : {})}
          onSaved={async () => { await load(false); }}
        />
      )}

      {child_api_full && actions_manager_open && ott_id && (
        <CardActionsManagerModal
          isOpen={true}
          onClose={() => set_actions_manager_open(false)}
          ott_id={ott_id}
          parent_api={child_api_full}
          child_apis={grandchild_apis}
          parent_response={data.child_response}
          onChanged={async () => { await load(false); }}
        />
      )}

      {capture_modal_open && ott_id && (
        <CaptureVideoModal
          isOpen={true}
          onClose={() => set_capture_modal_open(false)}
          ott_id={ott_id}
          api_node_id={data.child_api.id}
          parent_api_id={data.parent_api.id}
          source_response_id={data.source_response_id}
          item_key={decoded_item_key}
          response={data.child_response}
          onSaved={async () => { await load(false); }}
        />
      )}

      {/* Card-action popup: opened by gear icon or by card click when skip_action_modal=false. */}
      {popup_state && (
        <CardActionPopup
          isOpen={true}
          onClose={() => set_popup_state(null)}
          api_node={popup_state.api_node}
          card={popup_state.card}
          child_apis={(children_by_parent.get(popup_state.api_node.id) || [])}
          on_dispatch={handle_popup_dispatch}
          busy_child_id={popup_state.busy_child_id}
          show_capture_videos={true}
        />
      )}

      {/* Capture mapping editor: persists URL/title/thumbnail paths on the api_node so any
          card can be saved straight to the library without re-picking paths every time. */}
      {mapping_modal_open && ott_id && (
        <CaptureVideoModal
          isOpen={true}
          onClose={() => set_mapping_modal_open(false)}
          ott_id={ott_id}
          api_node_id={data.child_api.id}
          parent_api_id={data.parent_api.id}
          source_response_id={data.source_response_id}
          item_key={decoded_item_key}
          response={data.child_response}
          save_as_mapping={true}
          {...(capture_mapping ? { initial_mapping: capture_mapping } : {})}
          onSaved={async () => {
            // Refresh the local mapping after saving.
            if (!ott_id || !child_api_id) return;
            const res = await ott_service.get_capture_mapping(ott_id, child_api_id);
            if (res.success && res.data) set_capture_mapping(res.data.mapping ?? null);
          }}
        />
      )}

      {/* Per-card capture: opens CaptureVideoModal scoped to the clicked card's raw_item.
          The card_path_prefix tells the modal that picked paths must be prefixed so they
          resolve against the FULL saved response on the backend. */}
      {per_card_capture && ott_id && (() => {
        const list_path = per_card_capture.api_node.list_path ?? '';
        const card_index = per_card_capture.card.index;
        const prefix = list_path ? `${list_path}[${card_index}]` : `[${card_index}]`;
        return (
          <CaptureVideoModal
            isOpen={true}
            onClose={() => set_per_card_capture(null)}
            ott_id={ott_id}
            api_node_id={per_card_capture.api_node.id}
            parent_api_id={data.parent_api.id}
            source_response_id={per_card_capture.source_response_id ?? null}
            item_key={per_card_capture.card.item_key}
            response={per_card_capture.card.raw_item}
            card_path_prefix={prefix}
            onSaved={async () => { await load(false); }}
          />
        );
      })()}

      {/* "Run" drawer for popup → Run results. */}
      {drawer_state && (
        <div
          className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center p-4"
          onClick={() => set_drawer_state(null)}
        >
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
          <div
            className="relative w-full max-w-3xl max-h-[85vh] bg-bg-card border border-border-subtle rounded-3xl shadow-2xl flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 border-b border-border-subtle flex items-center justify-between bg-black/5 dark:bg-white/5">
              <div>
                <h3 className="font-bold text-text-main">{drawer_state.child_api.name}</h3>
                <p className="text-[10px] text-text-muted uppercase font-bold tracking-widest">
                  ran on card · index {drawer_state.card.index} · key {drawer_state.card.item_key}
                </p>
              </div>
              <button
                onClick={() => set_drawer_state(null)}
                className="text-xs font-bold text-text-muted hover:text-text-main"
              >
                Close
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              <textarea
                readOnly
                value={JSON.stringify(drawer_state.child_response, null, 2)}
                className="w-full h-[60vh] bg-black/90 text-brand-emerald p-6 rounded-2xl font-mono text-[10px] outline-none border border-border-subtle"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ── Parent-item context card ─────────────────────────────────────────────
/**
 * Renders the "Selected parent item" panel above the cards tabs. Converts
 * raw `KEY_ART` style labels into friendly Title-case, detects image URLs
 * and renders them as a 96px thumbnail row above the rest of the fields,
 * and uses different value styling per detected type so URLs/numbers/long
 * strings each get appropriate treatment.
 */
const ParentContextCard: React.FC<{ card: BuiltCard }> = ({ card }) => {
  const fields = card.fields.slice(0, 12);

  // Pull out image-type fields (display_type='image' OR a URL whose extension
  // looks like an image) — these render as thumbnails on top instead of as
  // truncated URL strings in the grid.
  const is_image_url = (v: any): v is string =>
    typeof v === 'string' && /^https?:\/\/.+\.(jpe?g|png|webp|gif|svg|avif)/i.test(v);

  const image_fields = fields.filter(
    f => f.display_type === 'image' || is_image_url(f.value),
  );
  const text_fields = fields.filter(f => !image_fields.includes(f));

  return (
    <div className="p-4 rounded-2xl bg-bg-card border border-border-subtle space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-[10px] font-bold text-text-muted uppercase tracking-widest">Selected parent item</h3>
        <span className="text-[10px] text-text-muted font-mono">
          index {card.index} · key {card.item_key}
        </span>
      </div>

      <div className="flex items-stretch gap-3">
        {image_fields.length > 0 && (
          <>
            <div className="shrink-0 flex items-stretch gap-3">
              {image_fields.map(f => (
                <div key={f.path} className="shrink-0 flex flex-col items-center gap-1">
                  <img
                    src={String(f.value)}
                    alt={f.label || f.path}
                    className="w-20 h-20 rounded-xl object-cover bg-black/30 border border-border-subtle"
                    referrerPolicy="no-referrer"
                  />
                  <p className="text-[9px] text-text-muted text-center truncate max-w-[5rem]" title={f.label || f.path}>
                    {pretty_label(f.label || f.path)}
                  </p>
                </div>
              ))}
            </div>
            <div className="w-px self-stretch bg-border-subtle shrink-0" aria-hidden="true" />
          </>
        )}
        {text_fields.length > 0 && (
          <div className="flex-1 min-w-0 flex items-stretch gap-3">
            {text_fields.map(f => (
              <div key={f.path} className="flex-1 min-w-0">
                <FieldCell f={f} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

/** Convert a raw key like `KEY_ART` / `duration_s` / `n_episodes` into a
 *  human-readable label: "Key Art" / "Duration s" / "N episodes". Strips
 *  bracket notation and dots from full paths so `shows[0].title` becomes
 *  "title". */
function pretty_label(raw: string): string {
  if (!raw) return '';
  // Take the last segment of a path (`shows[0].meta_data.title` → `title`).
  const tail = raw.replace(/\[\d+\]/g, '').split('.').pop() || raw;
  return tail
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/(^|\s)\S/g, c => c.toUpperCase());
}

const FieldCell: React.FC<{ f: { path: string; label: string | null; value: any } }> = ({ f }) => {
  const v = f.value;
  const empty = v === null || v === undefined || v === '';
  const is_url = typeof v === 'string' && /^https?:\/\//i.test(v);
  const is_number = typeof v === 'number' || (typeof v === 'string' && /^\d+(\.\d+)?$/.test(v));
  const is_bool = typeof v === 'boolean';

  return (
    <div className="space-y-1 min-w-0 h-full p-2 rounded-lg bg-bg-main border border-white/15">
      <p className="text-[9px] font-medium text-text-muted/80 truncate" title={f.path}>
        {pretty_label(f.label || f.path)}
      </p>
      {empty ? (
        <p className="text-xs text-text-muted/50 italic">—</p>
      ) : is_url ? (
        <a
          href={String(v)}
          target="_blank"
          rel="noreferrer"
          className="text-xs text-brand-emerald hover:underline truncate block font-mono"
          title={String(v)}
        >
          {String(v)}
        </a>
      ) : is_number ? (
        <p className="text-sm font-mono font-semibold text-text-main">{String(v)}</p>
      ) : is_bool ? (
        <p className={`text-xs font-bold uppercase ${v ? 'text-emerald-400' : 'text-text-muted'}`}>{String(v)}</p>
      ) : (
        <p className="text-xs text-text-main line-clamp-2 break-words" title={String(v)}>{String(v)}</p>
      )}
    </div>
  );
};

// ── Inline tab component for captured videos ─────────────────────────────
const CapturedVideosTab: React.FC<{
  ott_id: string;
  videos: CapturedVideoSummary[];
  onChanged: () => void | Promise<void>;
}> = ({ ott_id, videos, onChanged }) => {
  // Multi-select wired the same way as the library page.
  const ordered_video_ids: string[] = useMemo(() => videos.map(v => v.id), [videos]);
  const selection = useGridSelection({ ordered_ids: ordered_video_ids });
  const [bulk_deleting, set_bulk_deleting] = useState(false);
  const confirm = useConfirm();

  // Drop selections that vanished after the parent refreshed the list.
  useEffect(() => {
    if (selection.selected_count === 0) return;
    const visible = new Set(ordered_video_ids);
    const next: string[] = [];
    selection.selected_ids.forEach(id => { if (visible.has(id)) next.push(id); });
    if (next.length !== selection.selected_count) selection.set_selected(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ordered_video_ids]);

  const handle_delete = async (id: string) => {
    const ok = await confirm({
      title: 'Delete this item?',
      message: 'This cannot be undone.',
      confirm_label: 'Delete',
      danger: true,
    });
    if (!ok) return;
    try {
      const res = await ott_service.delete_video_asset(ott_id, id);
      if (!res.success) throw new Error(res.message);
      toast.success('Deleted');
      await onChanged();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to delete');
    }
  };

  const handle_bulk_delete = async () => {
    const ids = Array.from(selection.selected_ids);
    if (ids.length === 0) return;
    const ok = await confirm({
      title: ids.length === 1 ? 'Delete this item?' : `Delete ${ids.length} items?`,
      message: 'This cannot be undone.',
      confirm_label: 'Delete',
      danger: true,
    });
    if (!ok) return;
    set_bulk_deleting(true);
    try {
      const res = await ott_service.bulk_delete_video_assets(ott_id, ids);
      if (!res.success || !res.data) throw new Error(res.message || 'Bulk delete failed');
      toast.success(`Deleted ${res.data.deleted} item${res.data.deleted === 1 ? '' : 's'}`);
      selection.clear();
      await onChanged();
    } catch (err: any) {
      toast.error(err?.message || 'Bulk delete failed');
    } finally {
      set_bulk_deleting(false);
    }
  };

  const handle_copy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success('URL copied');
    } catch { toast.error('Clipboard not available'); }
  };

  if (videos.length === 0) {
    return (
      <div className="p-12 text-center bg-black/5 dark:bg-white/5 rounded-3xl border border-dashed border-border-subtle space-y-3">
        <Video size={48} className="mx-auto text-text-muted opacity-50" />
        <p className="text-sm font-bold text-text-main">No videos captured for this child API yet.</p>
        <p className="text-xs text-text-muted">Use the "Capture Video URLs" button above.</p>
      </div>
    );
  }

  return (
    <>
      <div
        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
        onClick={selection.handle_background_click}
      >
        {videos.map(v => {
          const is_playlist = v.video_type === 'm3u8' || v.video_type === 'mpd';
          const is_sel = selection.is_selected(v.id);
          return (
            <motion.div
              key={v.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              onClick={(e) => {
                e.stopPropagation();
                selection.handle_item_click(v.id, e);
              }}
              onDoubleClick={(e) => {
                e.stopPropagation();
                handle_copy(v.video_url);
              }}
              className={`relative rounded-3xl bg-bg-card border overflow-hidden flex flex-col cursor-pointer transition-shadow ${
                is_sel
                  ? 'border-brand-emerald ring-2 ring-brand-emerald shadow-lg shadow-brand-emerald/20'
                  : 'border-border-subtle'
              }`}
            >
              {is_sel && (
                <span className="absolute top-2 left-2 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-brand-emerald text-white shadow-md">
                  <Check size={14} strokeWidth={3} />
                </span>
              )}
              <div className="aspect-video bg-black/20 relative">
                {v.thumbnail ? (
                  <img src={v.thumbnail} alt={v.title ?? 'video'} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-text-muted">
                    <Video size={32} />
                  </div>
                )}
                <span className="absolute top-2 right-2 text-[10px] font-bold uppercase px-2 py-0.5 rounded-lg bg-black/60 text-white tracking-wider">
                  {v.video_type ?? 'unknown'}
                </span>
              </div>
              <div className="p-4 flex-1 flex flex-col gap-2">
                <p className="text-sm font-bold text-text-main line-clamp-1">{v.title ?? '(no title)'}</p>
                {v.quality && <p className="text-[10px] text-text-muted">Quality: {v.quality}</p>}
                <p className="text-[10px] text-text-muted font-mono break-all line-clamp-2">{v.video_url}</p>
              </div>
              <div
                className="p-3 border-t border-border-subtle flex items-center justify-between gap-2"
                // Action toolbar shouldn't trigger selection clicks bubbling
                // up — copy/delete/download are independent of the row's
                // selection state.
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  onClick={() => handle_copy(v.video_url)}
                  className="flex items-center gap-1 text-[10px] font-bold text-text-muted hover:text-brand-emerald"
                >
                  <Copy size={12} /> Copy URL
                </button>
                {is_playlist ? (
                  <a
                    href={ott_service.get_video_download_url(ott_id, v.id, 'playlist')}
                    className="flex items-center gap-1 text-[10px] font-bold text-brand-blue hover:underline"
                  >
                    <ExternalLink size={12} /> Playlist
                  </a>
                ) : (
                  <a
                    href={ott_service.get_video_download_url(ott_id, v.id)}
                    className="flex items-center gap-1 text-[10px] font-bold text-brand-emerald hover:underline"
                  >
                    <Download size={12} /> Download
                  </a>
                )}
                <button
                  onClick={() => handle_delete(v.id)}
                  className="flex items-center gap-1 text-[10px] font-bold text-text-muted hover:text-red-500"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            </motion.div>
          );
        })}
      </div>

      <SelectionActionBar
        count={selection.selected_count}
        on_clear={selection.clear}
        on_delete={handle_bulk_delete}
        busy={bulk_deleting}
      />
    </>
  );
};

export default NestedCardsPage;
