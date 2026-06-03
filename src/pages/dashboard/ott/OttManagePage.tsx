/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import {
  Building2,
  Settings,
  RefreshCw,
  LayoutGrid,
  History,
  ShieldCheck,
  Terminal,
  ChevronRight,
  Edit2,
  Trash2,
  Play,
  CheckCircle2,
  AlertCircle,
  Database,
  X,
  ArrowRight,
  ArrowLeft,
  Layers,
  Network,
  Loader2,
  Copy,
  Globe,
  FileText,
  Calendar,
  Hash,
  Download,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useOTT } from '../../../context/OTTContext';
import DebugConsole from '../../../components/dashboard/DebugConsole';
import { JsonTreeViewer } from '../../../components/ui/JsonTreeViewer';
import NestedCardRenderer, { ExpandedMap, ChildContext } from '../../../components/dashboard/NestedCardRenderer';
import ApiTreeManagementStep from './steps/ApiTreeManagementStep';
import CardActionsManagerModal from './steps/components/CardActionsManagerModal';
import CaptureVideoModal from './steps/components/CaptureVideoModal';
import CardActionPopup, { CardActionDispatch } from './steps/components/CardActionPopup';
import ApiCardBuilderModal from './steps/components/ApiCardBuilderModal';
import {
  OttPlatformDetail,
  ApiNode,
  BuiltCard,
  ApiCallLog,
  OttCardsResponse,
  CardAction,
  VideoAsset,
} from '../../../types';
import { replaceArrayIndexInPath, getValueByPath } from '../../../utils/apiDataUtils';
import { ott_service, notify_ott_list_updated } from '../../../services/ott_service';
import { useConfirm } from '../../../components/ui/ConfirmDialog';

type TabType = 'overview' | 'cards' | 'api-tree' | 'logs' | 'settings';

interface SelectedItem {
  parent_api_id: string;
  parent_api_name: string;
  card: BuiltCard;
  child_api: ApiNode | null;
  child_response: any;
  child_loading: boolean;
}

const OttManagePage: React.FC = () => {
  const { ott_id } = useParams<{ ott_id: string }>();
  const navigate = useNavigate();
  const { remove_ott, refresh_otts } = useOTT();
  const confirm = useConfirm();

  const [ott, setOtt] = useState<OttPlatformDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error_text, setErrorText] = useState<string | null>(null);

  const [active_tab, setActiveTab] = useState<TabType>('overview');
  const [is_syncing, setIsSyncing] = useState(false);
  const [sync_status, setSyncStatus] = useState({ total: 0, success: 0, failed: 0 });

  const [card_sections, setCardSections] = useState<OttCardsResponse | null>(null);
  const [cards_loading, setCardsLoading] = useState(false);

  const [logs, setLogs] = useState<ApiCallLog[]>([]);
  const [logs_total, setLogsTotal] = useState(0);
  const [logs_loading, setLogsLoading] = useState(false);

  const [selected_item, setSelectedItem] = useState<SelectedItem | null>(null);
  const [actions_manager_for, setActionsManagerFor] = useState<{ api_id: string; response: any } | null>(null);
  const [popup_state, setPopupState] = useState<{
    api_node: ApiNode;
    card: BuiltCard;
    source_response_id: string | null | undefined;
    parent_item_key: string | null | undefined;
    busy_child_id: string | null;
  } | null>(null);
  const [card_builder_for, setCardBuilderFor] = useState<{
    api_node: ApiNode;
    sample_response?: any;
    source_response_id?: string;
  } | null>(null);

  // Per-card capture: opens CaptureVideoModal scoped to a clicked card's raw_item.
  const [per_card_capture, setPerCardCapture] = useState<{
    api_node: ApiNode;
    card: BuiltCard;
    source_response_id: string | null | undefined;
  } | null>(null);

  // Hoisted expansion state — owned by OttManagePage so the popup, action buttons,
  // and the recursive renderer all push into the same map.
  const [expanded_children, setExpandedChildren] = useState<ExpandedMap>({});
  const [busy_action_keys, setBusyActionKeys] = useState<Record<string, boolean>>({});

  const [is_downloading_all, setIsDownloadingAll] = useState(false);
  const [download_all_progress, setDownloadAllProgress] = useState<{ total: number; done: number } | null>(null);
  // Synchronous guard — checked before any async work so rapid double-clicks
  // can't start a second download between React render cycles.
  const download_in_progress = useRef(false);

  // Per-card download state: key = `${api_node_id}:${item_key}`, persisted in localStorage.
  const ls_key = ott_id ? `ott_dl_done:${ott_id}` : null;
  const [card_download_state, setCardDownloadState] = useState<Map<string, 'idle' | 'downloading' | 'done'>>(() => {
    if (!ott_id) return new Map();
    try {
      const raw = localStorage.getItem(`ott_dl_done:${ott_id}`);
      if (!raw) return new Map();
      const keys: string[] = JSON.parse(raw);
      return new Map(keys.map(k => [k, 'done'] as const));
    } catch {
      return new Map();
    }
  });

  // Per-section page navigation state for paginated APIs in the Cards tab.
  // Keyed by api_id. Tracks current page + the next-state hint from the last
  // call so we know whether to show/disable the Next button. We don't load
  // these from the backend on initial mount — first paint shows page 1
  // implicitly (whatever the saved response holds), and only updates after the
  // user clicks Prev/Next at least once.
  interface SectionPageState {
    page_number: number;
    has_next: boolean;
    cursor_value: string | null;
    id_value: string | null;
    offset_value: number | null;
    next_cursor: string | null;
    next_id: string | null;
    next_offset: number | null;
    busy: boolean;
    /** Per-section custom page-size input. Empty = use the configured limit
     *  on the API. Stored as string so partial typing doesn't break. */
    page_size_input: string;
    /** Separate spinner for the "All" button so the Prev/Next pill stays
     *  responsive while a fetch-all-pages run is in flight. */
    loading_all: boolean;
  }
  const [section_pages, setSectionPages] = useState<Record<string, SectionPageState>>({});

  const get_section_state = (api_id: string): SectionPageState =>
    section_pages[api_id] ?? {
      page_number: 1,
      has_next: true, // optimistic — we don't know until first navigation
      cursor_value: null,
      id_value: null,
      offset_value: null,
      next_cursor: null,
      next_id: null,
      next_offset: null,
      busy: false,
      page_size_input: '',
      loading_all: false,
    };

  const set_section_page_size = (api_id: string, value: string) => {
    setSectionPages(prev => ({
      ...prev,
      [api_id]: { ...get_section_state(api_id), page_size_input: value },
    }));
  };

  /** Parse the per-section page-size input. Empty / non-numeric / <1 → undefined
   *  (the call goes out without a limit override and the configured value applies). */
  const resolve_section_runtime_limit = (api_id: string): number | undefined => {
    const trimmed = (section_pages[api_id]?.page_size_input ?? '').trim();
    if (!trimmed) return undefined;
    const n = parseInt(trimmed, 10);
    if (!Number.isFinite(n) || n < 1) return undefined;
    return n;
  };

  const handle_page_navigate = async (api_id: string, direction: 'prev' | 'next') => {
    if (!ott_id) return;
    const node = flat_apis.find(n => n.id === api_id);
    if (!node || !node.pagination_enabled || !node.pagination_type) return;

    const state = get_section_state(api_id);
    const runtime_limit = resolve_section_runtime_limit(api_id);
    // Effective limit drives offset jumps locally — runtime override wins, then
    // configured value, then last-known next_offset hint, then 0.
    const effective_limit = runtime_limit
      ?? ((node.pagination_config?.limit_value as number | undefined))
      ?? state.next_offset
      ?? 0;
    const options: {
      page_number?: number;
      cursor_value?: string;
      id_value?: string;
      offset_value?: number;
      limit_value?: number;
    } = {};
    if (runtime_limit !== undefined) options.limit_value = runtime_limit;

    if (node.pagination_type === 'page_number') {
      const target = direction === 'next' ? state.page_number + 1 : Math.max(1, state.page_number - 1);
      if (target === state.page_number) return;
      options.page_number = target;
    } else if (node.pagination_type === 'offset') {
      if (!effective_limit) {
        toast.error('Set a page size for offset Prev/Next');
        return;
      }
      const current = state.offset_value ?? 0;
      const target = direction === 'next' ? current + effective_limit : Math.max(0, current - effective_limit);
      if (target === current) return;
      options.offset_value = target;
    } else if (node.pagination_type === 'cursor' && direction === 'next' && state.next_cursor) {
      options.cursor_value = state.next_cursor;
    } else if (node.pagination_type === 'id_based' && direction === 'next' && state.next_id) {
      options.id_value = state.next_id;
    } else {
      // Cursor / id-based "previous" isn't supported (these only know forward).
      toast.error('Previous page is not supported for cursor/id-based pagination');
      return;
    }

    setSectionPages(prev => ({ ...prev, [api_id]: { ...state, busy: true } }));
    try {
      const res = await ott_service.call_api_node(ott_id, api_id, options);
      if (!res.success || !res.data) throw new Error(res.message || 'Page fetch failed');
      const ps = res.data.pagination_state;
      const new_state: SectionPageState = {
        page_number: ps?.current_page_number ?? (options.page_number ?? state.page_number),
        cursor_value: ps?.current_cursor ?? null,
        id_value: ps?.current_id ?? null,
        offset_value: ps?.current_offset ?? null,
        next_cursor: ps?.next_cursor ?? null,
        next_id: ps?.next_id ?? null,
        next_offset: ps?.next_offset ?? null,
        has_next: ps?.has_next ?? false,
        busy: false,
        // Preserve user inputs across calls — page-size override stays typed,
        // loading_all is independent of single-page nav.
        page_size_input: state.page_size_input,
        loading_all: state.loading_all,
      };
      setSectionPages(prev => ({ ...prev, [api_id]: new_state }));
      await load_cards();
      const stop = ps?.stop_reason;
      if (direction === 'next' && !new_state.has_next && stop) {
        toast(`Reached the end (${stop})`, { duration: 4000 });
      }
    } catch (err: any) {
      toast.error(err?.message || 'Page fetch failed');
      setSectionPages(prev => ({ ...prev, [api_id]: { ...state, busy: false } }));
    }
  };

  /**
   * "All" button — runs the configured pagination strategy and stores the
   * merged response. After this the section's cards show every item; the
   * page indicator resets since merged response isn't page-based.
   */
  const handle_section_load_all = async (api_id: string) => {
    if (!ott_id) return;
    const node = flat_apis.find(n => n.id === api_id);
    if (!node || !node.pagination_enabled || !node.pagination_type) return;
    const state = get_section_state(api_id);
    const runtime_limit = resolve_section_runtime_limit(api_id);
    setSectionPages(prev => ({ ...prev, [api_id]: { ...state, loading_all: true, busy: true } }));
    try {
      const res = await ott_service.call_api_node(ott_id, api_id, {
        fetch_all_pages: true,
        ...(runtime_limit !== undefined ? { limit_value: runtime_limit } : {}),
      });
      if (!res.success || !res.data) throw new Error(res.message || 'Load all failed');
      // After load-all, single-page nav state is meaningless — merged response
      // has all items and the user typically just scrolls cards.
      setSectionPages(prev => ({
        ...prev,
        [api_id]: {
          ...state,
          page_number: 1,
          offset_value: null,
          cursor_value: null,
          id_value: null,
          next_cursor: null,
          next_id: null,
          next_offset: null,
          has_next: false,
          busy: false,
          loading_all: false,
        },
      }));
      const summary = res.data.pagination
        ? `Loaded ${res.data.pagination.pages_fetched} page(s) — ${res.data.pagination.total_items} item(s)`
        : 'All pages loaded';
      toast.success(summary, { duration: 5000 });
      await load_cards();
    } catch (err: any) {
      toast.error(err?.message || 'Load all failed');
      setSectionPages(prev => ({ ...prev, [api_id]: { ...state, loading_all: false, busy: false } }));
    }
  };

  const load_ott = useCallback(async () => {
    if (!ott_id) return;
    setLoading(true);
    setErrorText(null);
    try {
      const res = await ott_service.get_ott_by_id(ott_id);
      if (!res.success || !res.data) throw new Error(res.message || 'Failed to load OTT');
      setOtt(res.data);
    } catch (err: any) {
      setErrorText(err?.message || 'Failed to load OTT');
      toast.error(err?.message || 'Failed to load OTT');
    } finally {
      setLoading(false);
    }
  }, [ott_id]);

  const load_cards = useCallback(async () => {
    if (!ott_id) return;
    setCardsLoading(true);
    try {
      const res = await ott_service.get_ott_cards(ott_id);
      if (!res.success) throw new Error(res.message || 'Failed to load cards');
      setCardSections(res.data ?? null);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to load cards');
    } finally {
      setCardsLoading(false);
    }
  }, [ott_id]);

  const load_logs = useCallback(async () => {
    if (!ott_id) return;
    setLogsLoading(true);
    try {
      // limit=1 — DebugConsole self-fetches the rows now. We only need the
      // server-side total here to keep the tab badge accurate (it used to
      // show the local array length, which capped at the fetch limit and
      // disagreed with the console's "114 TOTAL LOGS" header).
      const res = await ott_service.get_ott_logs(ott_id, { page: 1, limit: 1 });
      if (!res.success) throw new Error(res.message || 'Failed to load logs');
      setLogs(res.data?.items || []);
      setLogsTotal(res.data?.total || 0);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to load logs');
    } finally {
      setLogsLoading(false);
    }
  }, [ott_id]);

  useEffect(() => {
    load_ott();
  }, [load_ott]);

  useEffect(() => {
    if (active_tab === 'cards' || active_tab === 'overview') load_cards();
    if (active_tab === 'logs') load_logs();
  }, [active_tab, load_cards, load_logs]);

  const stats = useMemo(() => {
    if (!ott) return { total_apis: 0, success_apis: 0, cards_apis: 0 };
    const flat: ApiNode[] = [];
    const visit = (nodes: ApiNode[]) => {
      for (const n of nodes) {
        flat.push(n);
        visit(n.children || []);
      }
    };
    visit(ott.api_tree || []);
    return {
      total_apis: flat.length,
      success_apis: flat.filter(n => n.status === 'success').length,
      cards_apis: flat.filter(n => (n.selected_fields || []).length > 0).length,
    };
  }, [ott]);

  // When checked, sync runs the full pagination loop on every paginated API
  // and stores the merged response. Default false → first-page only, same
  // behaviour as before. Persisted in component state only — not localStorage.
  const [sync_fetch_all_pages, setSyncFetchAllPages] = useState(false);

  const handle_sync = async () => {
    if (!ott_id) return;
    setIsSyncing(true);
    setSyncStatus({ total: 0, success: 0, failed: 0 });
    try {
      const res = await ott_service.sync_ott(ott_id, 'root_only', {
        fetch_all_pages: sync_fetch_all_pages,
      });
      if (!res.success || !res.data) throw new Error(res.message || 'Sync failed');
      const result = res.data;
      setSyncStatus({
        total: result.total,
        success: result.results.filter(r => r.success).length,
        failed: result.results.filter(r => !r.success).length,
      });
      // When fetching all pages, surface the per-API page totals so users see
      // how much was loaded without digging through Debug Console.
      if (sync_fetch_all_pages) {
        const paginated_summary = result.results
          .filter(r => r.pagination)
          .map(r => `${r.name}: ${r.pagination!.pages_fetched}p/${r.pagination!.total_items}items`)
          .join(' · ');
        toast.success(
          paginated_summary
            ? `Sync done — ${paginated_summary}`
            : (res.message || 'Sync completed'),
          { duration: 6000 },
        );
      } else {
        toast.success(res.message || 'Sync completed');
      }
      await Promise.all([load_ott(), load_cards(), load_logs(), refresh_otts()]);
    } catch (err: any) {
      setErrorText(err?.message || 'Sync failed');
      toast.error(err?.message || 'Sync failed');
    } finally {
      setIsSyncing(false);
    }
  };

  const open_detail_drawer = (parent: ApiNode, card: BuiltCard, child?: ApiNode) => {
    setSelectedItem({
      parent_api_id: parent.id,
      parent_api_name: parent.name,
      card,
      child_api: child ?? null,
      child_response: null,
      child_loading: !!child,
    });
  };

  // Flat list of every API node in the tree, plus a parent → children map for fast lookups.
  const flat_apis = useMemo(() => {
    const out: ApiNode[] = [];
    const visit = (nodes: ApiNode[]) => {
      for (const n of nodes) {
        out.push(n);
        if (n.children?.length) visit(n.children);
      }
    };
    if (ott) visit(ott.api_tree || []);
    return out;
  }, [ott]);

  const children_by_parent = useMemo(() => {
    const map = new Map<string, ApiNode[]>();
    for (const n of flat_apis) {
      if (!n.parent_id) continue;
      if (!map.has(n.parent_id)) map.set(n.parent_id, []);
      map.get(n.parent_id)!.push(n);
    }
    return map;
  }, [flat_apis]);

  const open_card_action_popup = (args: {
    api_node: ApiNode;
    card: BuiltCard;
    source_response_id: string | null | undefined;
    parent_item_key: string | null | undefined;
  }) => {
    setPopupState({ ...args, busy_child_id: null });
  };

  const open_card_builder = (args: { api_node: ApiNode; sample_response?: any; source_response_id?: string }) => {
    setCardBuilderFor(args);
  };

  /** Inline-expand a child API call result under the parent card in the renderer. */
  const inline_expand_child = (
    parent_api: ApiNode,
    card: BuiltCard,
    child_api: ApiNode,
    res_data: NonNullable<Awaited<ReturnType<typeof ott_service.call_child_api_from_card>>['data']>,
  ) => {
    const key = `${parent_api.id}__${card.item_key}__${child_api.id}`;
    const ctx: ChildContext = {
      api_node: flat_apis.find(a => a.id === child_api.id) ?? child_api,
      cards: (res_data.cards.cards as BuiltCard[]) ?? [],
      card_enabled: res_data.cards.card_enabled,
      source_response_id: res_data.response_id ?? res_data.source_response_id,
      raw_response: res_data.response,
    };
    setExpandedChildren(prev => ({ ...prev, [key]: ctx }));
  };

  const handle_popup_dispatch = async (intent: CardActionDispatch) => {
    if (!popup_state || !ott_id) return;
    const { api_node, card, source_response_id } = popup_state;

    if (intent.kind === 'capture_videos') {
      setPopupState(null);
      setPerCardCapture({ api_node, card, source_response_id });
      return;
    }

    if (intent.kind === 'configure_card') {
      setPopupState(null);
      open_card_builder({ api_node: intent.child_api });
      return;
    }
    const parent_item_key = popup_state.parent_item_key;

    setPopupState(prev => prev ? { ...prev, busy_child_id: intent.child_api.id } : prev);
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

      // eslint-disable-next-line no-console
      console.log("[FRONTEND CHILD CARD DEBUG]", {
        child_api_id: intent.child_api.id,
        parent_api_id: api_node.id,
        card_index: card.index,
        item_key: card.item_key,
        has_response: Boolean(res.data?.response),
        has_cards: Boolean(res.data?.cards),
        card_enabled: res.data?.cards?.card_enabled,
        cards_count: res.data?.cards?.cards?.length || 0,
      });

      if (!res.success || !res.data) throw new Error(res.message || 'Child API failed');
      toast.success(res.message || 'Child API called');
      load_logs();

      if (intent.kind === 'run_show_cards') {
        // Inline-expand under the parent card. If card_enabled was off, the renderer
        // will show the raw response + a "Create card for this child API" CTA.
        setPopupState(null);
        inline_expand_child(api_node, card, intent.child_api, res.data);
      } else {
        // intent.kind === 'run' — show response in side drawer (intentional: user explicitly
        // chose Run, not Run & Show, so we preserve the JSON-only inspection flow).
        setPopupState(null);
        setSelectedItem({
          parent_api_id: api_node.id,
          parent_api_name: api_node.name,
          card,
          child_api: intent.child_api,
          child_response: res.data.response,
          child_loading: false,
        });
      }
    } catch (err: any) {
      toast.error(err?.message || 'Child API failed');
      setPopupState(prev => prev ? { ...prev, busy_child_id: null } : prev);
    }
  };

  /** Handle a card_action button click (configured via "Manage Card Actions"). */
  const handle_card_action = async (args: {
    api_node: ApiNode;
    card: BuiltCard;
    action: CardAction;
    source_response_id: string | null | undefined;
    parent_item_key: string | null | undefined;
    expansion_key: string;
  }) => {
    const { api_node, card, action, source_response_id, parent_item_key } = args;
    if (!ott_id) return;
    const busy_key = `${action.id}:${card.item_key}`;

    if (action.action_type === 'open_detail') {
      setSelectedItem({
        parent_api_id: api_node.id,
        parent_api_name: api_node.name,
        card,
        child_api: null,
        child_response: null,
        child_loading: false,
      });
      return;
    }

    if (action.action_type === 'copy_value' && action.value_path) {
      const matched = card.fields.find(f => f.path === action.value_path);
      let value: any = matched?.value;
      if (value === undefined) {
        const indexed = replaceArrayIndexInPath(action.value_path, card.index);
        value = getValueByPath(card.raw_item, indexed.split('.').slice(1).join('.') || indexed);
      }
      if (value === undefined || value === null) {
        toast.error('Could not resolve value to copy');
        return;
      }
      try {
        await navigator.clipboard.writeText(String(value));
        toast.success('Copied');
      } catch {
        toast.error('Clipboard not available');
      }
      return;
    }

    if (action.action_type === 'open_url' && action.value_path) {
      const matched = card.fields.find(f => f.path === action.value_path);
      const url = matched?.value;
      if (typeof url !== 'string' || !url) {
        toast.error('Could not resolve URL');
        return;
      }
      window.open(url, '_blank', 'noopener,noreferrer');
      return;
    }

    if (action.action_type === 'call_child_api' && action.child_api_id) {
      const child_api = flat_apis.find(n => n.id === action.child_api_id);
      if (!child_api) {
        toast.error('Child API not found');
        return;
      }

      // open_type === 'page': skip the inline call entirely and navigate to the
      // dedicated cards page. The page handles caching + sub-card rendering.
      if (action.open_type === 'page' && ott_id) {
        const params = new URLSearchParams();
        params.set('card_index', String(card.index));
        if (source_response_id) params.set('source_response_id', source_response_id);
        if (parent_item_key) params.set('parent_item_key', parent_item_key);
        params.set('action_id', action.id);
        navigate(
          `/dashboard/ott/${ott_id}/cards/${api_node.id}/${encodeURIComponent(card.item_key)}/${child_api.id}?${params.toString()}`,
        );
        return;
      }

      setBusyActionKeys(prev => ({ ...prev, [busy_key]: true }));
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

        // eslint-disable-next-line no-console
        console.log("[FRONTEND CHILD CARD DEBUG]", {
          via: "card_action",
          action_id: action.id,
          action_label: action.label,
          open_type: action.open_type,
          child_api_id: child_api.id,
          parent_api_id: api_node.id,
          card_index: card.index,
          item_key: card.item_key,
          has_response: Boolean(res.data?.response),
          has_cards: Boolean(res.data?.cards),
          card_enabled: res.data?.cards?.card_enabled,
          cards_count: res.data?.cards?.cards?.length || 0,
        });

        if (!res.success || !res.data) throw new Error(res.message || 'Child API failed');
        toast.success(res.message || 'Child API called');
        load_logs();

        // open_type drives presentation. Default to inline so action buttons
        // give the user immediate visible cards.
        if (action.open_type === 'drawer' || action.open_type === 'modal') {
          setSelectedItem({
            parent_api_id: api_node.id,
            parent_api_name: api_node.name,
            card,
            child_api,
            child_response: res.data.response,
            child_loading: false,
          });
        } else {
          // 'inline' or 'page' both inline-expand for now.
          inline_expand_child(api_node, card, child_api, res.data);
        }
      } catch (err: any) {
        toast.error(err?.message || 'Child API failed');
      } finally {
        setBusyActionKeys(prev => ({ ...prev, [busy_key]: false }));
      }
    }
  };

  // Legacy card-action dispatcher removed — see open_card_action_popup + handle_popup_dispatch above
  // and the recursive NestedCardRenderer in the cards tab.

  const handle_clear_logs = async () => {
    if (!ott_id) return;
    const ok = await confirm({
      title: 'Clear all logs for this OTT?',
      message: 'Existing log entries will be permanently deleted.',
      confirm_label: 'Clear logs',
      danger: true,
    });
    if (!ok) return;
    try {
      const res = await ott_service.clear_logs(ott_id);
      if (!res.success) throw new Error(res.message || 'Failed to clear logs');
      setLogs([]);
      setLogsTotal(0);
      toast.success(res.message || 'Logs cleared');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to clear logs');
    }
  };

  const handle_download_all = async () => {
    if (!ott_id || download_in_progress.current) return;
    download_in_progress.current = true;

    setIsDownloadingAll(true);
    setDownloadAllProgress({ total: 0, done: 0 });
    try {
      // Step 1: Auto-capture — scan ALL stored root + child API responses for video URLs.
      // New URLs → new OttVideoAsset rows with downloaded_at = null.
      // Existing already-downloaded rows → untouched.
      await ott_service.auto_capture(ott_id);

      // Step 2: Fetch every undownloaded asset (paginate fully, backend caps at 200/page).
      const assets: import('../../../types').VideoAsset[] = [];
      let page = 1;
      while (true) {
        const r = await ott_service.get_video_assets(ott_id, { limit: 200, page });
        if (!r.success || !r.data) throw new Error(r.message || 'Failed to load video assets');
        assets.push(...r.data.items.filter(a =>
          ['mp4', 'webm', 'mov', 'mkv', 'ts'].includes(a.video_type ?? '') && !a.downloaded_at,
        ));
        if (assets.length >= r.data.total || r.data.items.length < 200) break;
        page += 1;
      }

      if (assets.length === 0) {
        toast('All videos have already been downloaded.', { duration: 4000 });
        return;
      }

      setDownloadAllProgress({ total: assets.length, done: 0 });

      // Step 3: Trigger browser downloads sequentially.
      for (let i = 0; i < assets.length; i++) {
        const url = ott_service.get_video_download_url(ott_id, assets[i].id);
        const a = document.createElement('a');
        a.href = url;
        a.download = '';
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setDownloadAllProgress({ total: assets.length, done: i + 1 });
        await new Promise<void>(resolve => setTimeout(resolve, 600));
      }
      toast.success(`Started downloading ${assets.length} video${assets.length === 1 ? '' : 's'}`);
    } catch (err: any) {
      toast.error(err?.message || 'Download all failed');
    } finally {
      download_in_progress.current = false;
      setIsDownloadingAll(false);
      setDownloadAllProgress(null);
    }
  };

  const mark_card_done = (state_key: string) => {
    setCardDownloadState(prev => {
      const next = new Map(prev).set(state_key, 'done');
      if (ls_key) {
        try {
          localStorage.setItem(ls_key, JSON.stringify(
            [...next.entries()].filter(([, v]) => v === 'done').map(([k]) => k),
          ));
        } catch { /* quota — ignore */ }
      }
      return next;
    });
  };

  const handle_download_card = async ({
    card,
    parent_api_id,
    default_child_api_id,
    actions,
  }: {
    card: BuiltCard;
    parent_api_id: string;
    default_child_api_id?: string | null;
    actions: CardAction[];
  }) => {
    if (!ott_id) return;

    // Prefer a child API that already has capture_mapping configured.
    // Fall back to default_child_api_id or the first call_child_api action.
    const has_mapping = (id: string) => {
      const node = flat_apis.find(n => n.id === id);
      const m = (node?.card_config as any)?.capture_mapping;
      return Array.isArray(m?.video_url_paths) && m.video_url_paths.length > 0;
    };

    const candidate_ids: string[] = [
      ...(default_child_api_id ? [default_child_api_id] : []),
      ...actions.filter(a => a.action_type === 'call_child_api' && a.child_api_id).map(a => a.child_api_id!),
      ...flat_apis.filter(n => n.parent_id === parent_api_id).map(n => n.id),
    ];

    const child_api_id =
      candidate_ids.find(has_mapping) ??
      candidate_ids[0] ??
      null;

    if (!child_api_id) {
      toast.error('No child API configured for this card');
      return;
    }

    if (!has_mapping(child_api_id)) {
      toast.error('Configure capture mapping on the episodes API first (open a card → Configure Mapping)');
      return;
    }

    const state_key = `${parent_api_id}:${card.item_key}`;
    setCardDownloadState(prev => new Map(prev).set(state_key, 'downloading'));

    try {
      // Step 1: Fetch all episodes for this card and store the response.
      const child_res = await ott_service.call_child_api_from_card({
        ott_id,
        child_api_id,
        parent_api_id,
        card_index: card.index,
        item_key: card.item_key,
        fetch_all_pages: true,
      });

      if (!child_res.success || !child_res.data) {
        throw new Error(child_res.message || 'Failed to fetch episodes');
      }

      const episode_cards: any[] = child_res.data.cards?.cards ?? [];
      if (episode_cards.length === 0) {
        toast.error('No episodes found for this card');
        setCardDownloadState(prev => new Map(prev).set(state_key, 'idle'));
        return;
      }

      // Step 2: Save all episode cards to library via save_from_cards
      // (uses the child API node's capture_mapping to extract video URLs).
      const card_title = card.fields.find(f => f.display_type === 'title')?.value;
      const card_indices = episode_cards.map((_: any, i: number) => i);
      const save_res = await ott_service.save_cards_to_library(ott_id, {
        api_node_id: child_api_id,
        card_indices,
        source_response_id: child_res.data.response_id ?? undefined,
        parent_item_key: card.item_key,
        parent_title: card_title != null ? String(card_title) : null,
        parent_api_id,
      });

      if (!save_res.success) {
        throw new Error(save_res.message || 'Failed to save episodes to library');
      }

      const { started = 0, already = 0, total = episode_cards.length } = save_res.data ?? {};
      if (started === 0 && already > 0) {
        toast(`All ${total} episodes already saved to library.`);
      } else {
        toast.success(`Saving ${started} episode${started === 1 ? '' : 's'} to library`);
      }
      mark_card_done(state_key);
    } catch (err: any) {
      toast.error(err?.message || 'Download failed');
      setCardDownloadState(prev => new Map(prev).set(state_key, 'idle'));
    }
  };

  const handle_delete = async () => {
    if (!ott_id || !ott) return;
    const ok = await confirm({
      title: 'Permanently delete this OTT?',
      message: 'All API definitions, logs, and saved library files will be lost. This cannot be undone.',
      confirm_label: 'Delete OTT',
      danger: true,
    });
    if (!ok) return;
    try {
      await remove_ott(ott_id);
      toast.success('OTT deleted successfully');
      notify_ott_list_updated();
      navigate('/dashboard/ott/all');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to delete OTT');
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-32 gap-4 text-text-muted">
        <Loader2 size={36} className="animate-spin" />
        <p className="text-sm">Loading OTT…</p>
      </div>
    );
  }

  if (!ott) {
    return (
      <div className="p-12 text-center space-y-4">
        <AlertCircle size={64} className="mx-auto text-brand-orange/50" />
        <h2 className="text-2xl font-bold text-text-main">{error_text || 'OTT not found'}</h2>
        <p className="text-sm text-text-muted">
          {error_text
            ? 'Check that the backend is running on the configured VITE_API_BASE_URL and that this OTT id exists.'
            : `No OTT was returned for id ${ott_id}.`}
        </p>
        <button onClick={() => navigate('/dashboard/ott/all')} className="btn-primary px-8">Back to All OTTs</button>
      </div>
    );
  }

  const cookie_configured = !!ott.cookie_file_name;

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <div className="p-4 rounded-3xl bg-brand-emerald/10 text-brand-emerald shadow-lg shadow-brand-emerald/10">
            <Building2 size={32} />
          </div>
          <div>
            <h1 className="text-3xl font-black text-text-main tracking-tight">{ott.name}</h1>
            <div className="flex items-center gap-3 mt-1">
              <span className="text-sm text-text-muted">{ott.description || 'No description provided'}</span>
              <span className="w-1 h-1 rounded-full bg-border-subtle" />
              <span className="text-xs font-mono text-text-muted uppercase tracking-wider">{ott.base_url || '—'}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {/* Show pagination toggle only when at least one API has it configured —
              otherwise the option is meaningless and clutters the toolbar. */}
          {flat_apis.some(n => n.pagination_enabled && n.pagination_type) && (
            <label
              className={`flex items-center gap-2 px-4 py-3 rounded-2xl bg-bg-card border border-border-subtle cursor-pointer transition-all hover:border-brand-blue/40 ${
                sync_fetch_all_pages ? 'border-brand-blue/50 bg-brand-blue/5' : ''
              }`}
              title="When checked, sync runs the full pagination loop on every paginated API and stores the merged response. Default fetches first page only."
            >
              <input
                type="checkbox"
                checked={sync_fetch_all_pages}
                onChange={(e) => setSyncFetchAllPages(e.target.checked)}
                disabled={is_syncing}
                className="rounded accent-brand-blue"
              />
              <Layers size={14} className={sync_fetch_all_pages ? 'text-brand-blue' : 'text-text-muted'} />
              <span className={`text-xs font-bold ${sync_fetch_all_pages ? 'text-brand-blue' : 'text-text-main'}`}>
                Fetch all pages
              </span>
            </label>
          )}
          <button
            onClick={handle_sync}
            disabled={is_syncing}
            className={`flex items-center gap-2 px-6 py-3 rounded-2xl font-bold transition-all shadow-lg ${
              is_syncing
                ? 'bg-black/10 dark:bg-white/10 text-text-muted cursor-not-allowed'
                : 'bg-bg-card border border-border-subtle text-text-main hover:border-brand-emerald/50 shadow-black/5'
            }`}
          >
            <RefreshCw size={18} className={is_syncing ? 'animate-spin' : ''} />
            {is_syncing ? `Syncing…` : 'Sync Root APIs'}
          </button>
          <button
            onClick={() => navigate(`/dashboard/ott/${ott.id}/quick-flow`)}
            className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-bg-card border border-brand-blue/30 text-brand-blue font-bold hover:bg-brand-blue/10 transition-all shadow-lg shadow-black/5"
            title="Visualise the full API tree as a flow chart"
          >
            <Network size={18} /> Quick Flow
          </button>
        </div>
      </div>

      {error_text && (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-500 max-w-3xl">
          {error_text}
        </div>
      )}

      <div className="flex items-center gap-1 p-1.5 bg-black/5 dark:bg-white/5 rounded-2xl w-fit border border-border-subtle">
        {[
          { id: 'overview', label: 'Overview', icon: <Database size={16} /> },
          { id: 'cards', label: 'Cards View', icon: <LayoutGrid size={16} />, count: stats.cards_apis },
          { id: 'api-tree', label: 'API Tree', icon: <Terminal size={16} /> },
          { id: 'logs', label: 'Call Logs', icon: <History size={16} />, count: logs_total },
          { id: 'settings', label: 'Settings', icon: <Settings size={16} /> },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as TabType)}
            className={`flex items-center gap-2 px-6 py-2.5 rounded-xl font-bold text-sm transition-all relative ${
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

      <AnimatePresence mode="wait">
        <motion.div
          key={active_tab}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.2 }}
        >
          {active_tab === 'overview' && (() => {
            const success_rate = stats.total_apis > 0
              ? Math.round((stats.success_apis / stats.total_apis) * 100)
              : 0;
            const last_synced_rel = (() => {
              if (!ott.lastSyncedAt) return 'Never synced';
              const diff_s = Math.round((Date.now() - new Date(ott.lastSyncedAt).getTime()) / 1000);
              if (!Number.isFinite(diff_s)) return '—';
              if (diff_s < 60) return 'Just now';
              if (diff_s < 3600) return `${Math.floor(diff_s / 60)}m ago`;
              if (diff_s < 86400) return `${Math.floor(diff_s / 3600)}h ago`;
              if (diff_s < 86400 * 7) return `${Math.floor(diff_s / 86400)}d ago`;
              return new Date(ott.lastSyncedAt).toLocaleDateString();
            })();
            const headers_count = Object.keys(ott.headers || {}).length;
            const health_items = [cookie_configured, headers_count > 0, !!ott.base_url].filter(Boolean).length;
            const health_total = 3;
            const accent_palette = [
              { stripe: 'from-brand-emerald to-teal-400', chip: 'bg-brand-emerald/10 text-brand-emerald', glow: 'from-brand-emerald/25', hover_bg: 'hover:bg-brand-emerald/5', hover_border: 'hover:border-brand-emerald/40' },
              { stripe: 'from-brand-blue to-cyan-400', chip: 'bg-brand-blue/10 text-brand-blue', glow: 'from-brand-blue/25', hover_bg: 'hover:bg-brand-blue/5', hover_border: 'hover:border-brand-blue/40' },
              { stripe: 'from-purple-500 to-fuchsia-400', chip: 'bg-purple-500/10 text-purple-400', glow: 'from-purple-500/25', hover_bg: 'hover:bg-purple-500/5', hover_border: 'hover:border-purple-500/40' },
              { stripe: 'from-rose-500 to-pink-400', chip: 'bg-rose-500/10 text-rose-400', glow: 'from-rose-500/25', hover_bg: 'hover:bg-rose-500/5', hover_border: 'hover:border-rose-500/40' },
              { stripe: 'from-amber-400 to-orange-400', chip: 'bg-amber-400/10 text-amber-400', glow: 'from-amber-400/25', hover_bg: 'hover:bg-amber-400/5', hover_border: 'hover:border-amber-400/40' },
            ];
            return (
            <div className="space-y-8">
              {/* Stat cards — each self-contained with its own accent */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                  {
                    label: 'Registered APIs',
                    value: stats.total_apis,
                    sub: `${stats.cards_apis} with card displays`,
                    Icon: Terminal,
                    text: 'text-brand-blue',
                    ring: 'ring-brand-blue/30',
                    grad: 'from-brand-blue to-cyan-400',
                  },
                  {
                    label: 'Successful Calls',
                    value: stats.success_apis,
                    sub: stats.total_apis > 0 ? `${success_rate}% success rate` : 'No calls yet',
                    Icon: CheckCircle2,
                    text: 'text-brand-emerald',
                    ring: 'ring-brand-emerald/30',
                    grad: 'from-brand-emerald to-teal-400',
                  },
                  {
                    label: 'Card Sections',
                    value: card_sections?.sections.length ?? 0,
                    sub: `${(card_sections?.sections ?? []).reduce((acc, s) => acc + s.cards.length, 0)} cards total`,
                    Icon: LayoutGrid,
                    text: 'text-purple-400',
                    ring: 'ring-purple-500/30',
                    grad: 'from-purple-500 to-fuchsia-400',
                  },
                  {
                    label: 'Last Synced',
                    value: last_synced_rel,
                    sub: ott.lastSyncedAt ? new Date(ott.lastSyncedAt).toLocaleString() : 'Run sync to refresh',
                    Icon: RefreshCw,
                    text: 'text-amber-400',
                    ring: 'ring-amber-400/30',
                    grad: 'from-amber-400 to-orange-400',
                  },
                ].map(stat => {
                  const Icon = stat.Icon;
                  return (
                    <div
                      key={stat.label}
                      className={`relative overflow-hidden rounded-2xl border border-border-subtle ring-1 ${stat.ring} bg-bg-card p-5 transition-all hover:-translate-y-0.5 hover:shadow-xl`}
                    >
                      <div className={`absolute -top-10 -right-10 w-32 h-32 rounded-full bg-gradient-to-br ${stat.grad} opacity-20 blur-2xl pointer-events-none`} />
                      <div className={`absolute inset-x-0 -bottom-12 h-24 bg-gradient-to-t ${stat.grad} opacity-[0.06] pointer-events-none`} />
                      <div className="relative flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="text-[10px] font-bold text-text-muted uppercase tracking-widest">{stat.label}</p>
                          <p className={`text-3xl font-black ${stat.text} mt-2 leading-none truncate`}>{stat.value}</p>
                          <p className="text-[10px] text-text-muted mt-2 truncate">{stat.sub}</p>
                        </div>
                        <div className={`shrink-0 w-10 h-10 rounded-xl bg-gradient-to-br ${stat.grad} text-white flex items-center justify-center shadow-lg`}>
                          <Icon size={18} />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                <div className="md:col-span-2 space-y-6">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-lg font-black text-text-main">Configured Displays</h3>
                        <p className="text-xs text-text-muted mt-0.5">Card sections built from your API tree</p>
                      </div>
                      <button
                        onClick={() => setActiveTab('cards')}
                        className="text-xs font-bold text-brand-emerald flex items-center gap-1 hover:underline"
                      >
                        View All Cards <ChevronRight size={14} />
                      </button>
                    </div>
                    <div className="grid grid-cols-1 gap-3">
                      {(card_sections?.sections || []).map((section, idx) => {
                        const accent = accent_palette[idx % accent_palette.length];
                        return (
                          <button
                            key={section.api_id}
                            onClick={() => setActiveTab('cards')}
                            className={`relative overflow-hidden p-5 rounded-2xl bg-bg-card border border-border-subtle ${accent.hover_border} ${accent.hover_bg} hover:shadow-lg hover:shadow-black/5 text-left flex items-center justify-between group transition-all`}
                          >
                            <div className={`absolute -top-8 -right-8 w-32 h-32 rounded-full bg-gradient-to-br ${accent.glow} to-transparent blur-2xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none`} />
                            <div className="relative flex items-center gap-4 min-w-0">
                              <div className={`p-3 rounded-2xl ${accent.chip} shrink-0`}>
                                <LayoutGrid size={22} />
                              </div>
                              <div className="min-w-0">
                                <h4 className="font-bold text-text-main truncate">{section.api_name}</h4>
                                <div className="flex items-center gap-2 mt-1 min-w-0">
                                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${accent.chip} shrink-0`}>
                                    {section.cards.length} {section.cards.length === 1 ? 'card' : 'cards'}
                                  </span>
                                  <span className="text-[10px] text-text-muted font-mono truncate">
                                    {section.list_path || 'root'}
                                  </span>
                                </div>
                              </div>
                            </div>
                            <ChevronRight
                              size={20}
                              className="relative text-text-muted group-hover:translate-x-1 group-hover:text-brand-emerald transition-all shrink-0"
                            />
                          </button>
                        );
                      })}
                      {(!card_sections || card_sections.sections.length === 0) && (
                        <div className="relative overflow-hidden p-12 text-center space-y-5 bg-bg-card rounded-3xl border border-dashed border-border-subtle">
                          <div className="absolute inset-0 bg-gradient-to-br from-brand-emerald/5 via-transparent to-brand-blue/5 pointer-events-none" />
                          <div className="relative w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-brand-emerald to-brand-blue text-white flex items-center justify-center shadow-lg shadow-brand-emerald/20">
                            <LayoutGrid size={28} />
                          </div>
                          <div className="relative space-y-1">
                            <p className="font-black text-text-main">No displays yet</p>
                            <p className="text-xs text-text-muted">Add APIs in the tree and pick fields to build cards.</p>
                          </div>
                          <button
                            onClick={() => setActiveTab('api-tree')}
                            className="relative px-6 py-2.5 rounded-xl bg-gradient-to-r from-brand-emerald to-brand-blue text-white text-xs font-bold hover:shadow-lg hover:shadow-brand-emerald/30 transition-all"
                          >
                            Configure API Tree
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="space-y-6">
                  {/* Health card */}
                  <div className="relative overflow-hidden rounded-3xl bg-bg-card border border-border-subtle p-6">
                    <div className="absolute -top-16 -right-16 w-44 h-44 rounded-full bg-gradient-to-br from-brand-emerald/20 to-brand-blue/15 blur-3xl pointer-events-none" />
                    <div className="relative">
                      <div className="flex items-center justify-between mb-5">
                        <div>
                          <h3 className="text-sm font-black text-text-main uppercase tracking-wider">Config Status</h3>
                          <p className="text-[10px] text-text-muted mt-1">{health_items}/{health_total} checks passing</p>
                        </div>
                        <span className={`flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1 rounded-full ${
                          health_items === health_total
                            ? 'bg-brand-emerald/10 text-brand-emerald'
                            : health_items > 0
                              ? 'bg-amber-400/10 text-amber-400'
                              : 'bg-red-500/10 text-red-400'
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full animate-pulse ${
                            health_items === health_total
                              ? 'bg-brand-emerald'
                              : health_items > 0
                                ? 'bg-amber-400'
                                : 'bg-red-400'
                          }`} />
                          {health_items === health_total ? 'Healthy' : health_items > 0 ? 'Partial' : 'Missing'}
                        </span>
                      </div>
                      <div className="mb-5 h-1 rounded-full bg-bg-surface overflow-hidden">
                        <div
                          className={`h-full transition-all ${
                            health_items === health_total
                              ? 'bg-gradient-to-r from-brand-emerald to-brand-blue'
                              : 'bg-gradient-to-r from-amber-400 to-rose-400'
                          }`}
                          style={{ width: `${(health_items / health_total) * 100}%` }}
                        />
                      </div>
                      <div className="space-y-3">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                              cookie_configured ? 'bg-brand-emerald/10 text-brand-emerald' : 'bg-red-500/10 text-red-400'
                            }`}>
                              <ShieldCheck size={15} />
                            </div>
                            <div className="min-w-0">
                              <p className="text-xs font-bold text-text-main">Cookie File</p>
                              <p className={`text-[10px] truncate ${cookie_configured ? 'text-text-muted font-mono' : 'text-red-400 font-bold'}`}>
                                {cookie_configured ? ott.cookie_file_name : 'Missing — upload required'}
                              </p>
                            </div>
                          </div>
                          {cookie_configured
                            ? <CheckCircle2 size={16} className="text-brand-emerald shrink-0" />
                            : <AlertCircle size={16} className="text-red-400 shrink-0" />}
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-9 h-9 rounded-xl bg-brand-blue/10 text-brand-blue flex items-center justify-center shrink-0">
                              <Terminal size={15} />
                            </div>
                            <div className="min-w-0">
                              <p className="text-xs font-bold text-text-main">Custom Headers</p>
                              <p className="text-[10px] text-text-muted">
                                {headers_count > 0 ? `${headers_count} ${headers_count === 1 ? 'field' : 'fields'} configured` : 'No headers set'}
                              </p>
                            </div>
                          </div>
                          <span className={`text-[10px] font-black px-2 py-1 rounded-lg shrink-0 ${
                            headers_count > 0 ? 'bg-brand-blue/10 text-brand-blue' : 'bg-bg-surface text-text-muted'
                          }`}>
                            {headers_count}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-9 h-9 rounded-xl bg-purple-500/10 text-purple-400 flex items-center justify-center shrink-0">
                              <Globe size={15} />
                            </div>
                            <div className="min-w-0">
                              <p className="text-xs font-bold text-text-main">Base URL</p>
                              <p className="text-[10px] text-text-muted font-mono truncate">
                                {(ott.base_url || '').replace(/^https?:\/\//, '') || '—'}
                              </p>
                            </div>
                          </div>
                          {ott.base_url
                            ? <CheckCircle2 size={16} className="text-brand-emerald shrink-0" />
                            : <AlertCircle size={16} className="text-red-400 shrink-0" />}
                        </div>
                      </div>
                    </div>
                  </div>

                </div>
              </div>

              {/* Quick actions — full-width section */}
              <div className="space-y-3">
                <div className="flex items-end justify-between">
                  <div>
                    <h3 className="text-lg font-black text-text-main">Quick Actions</h3>
                    <p className="text-xs text-text-muted mt-0.5">Common operations for this OTT</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {[
                    {
                      label: 'Edit Details',
                      desc: 'Update name, URL & headers',
                      Icon: Edit2,
                      onClick: () => navigate(`/dashboard/ott/${ott.id}/edit`),
                      tone: 'blue',
                      chip: 'bg-brand-blue/10 text-brand-blue',
                      border: 'hover:border-brand-blue/40',
                      bg: 'hover:bg-brand-blue/5',
                      glow: 'from-brand-blue/20',
                      text: 'text-text-main',
                      stripe: 'from-brand-blue to-cyan-400',
                      disabled: false,
                      spinning: false,
                    },
                    {
                      label: 'Sync Root APIs',
                      desc: is_syncing ? 'Sync in progress…' : 'Refresh all root data',
                      Icon: RefreshCw,
                      onClick: handle_sync,
                      tone: 'emerald',
                      chip: 'bg-brand-emerald/10 text-brand-emerald',
                      border: 'hover:border-brand-emerald/40',
                      bg: 'hover:bg-brand-emerald/5',
                      glow: 'from-brand-emerald/20',
                      text: 'text-text-main',
                      stripe: 'from-brand-emerald to-teal-400',
                      disabled: is_syncing,
                      spinning: is_syncing,
                    },
                    {
                      label: 'Quick Flow',
                      desc: 'Visualise the API tree',
                      Icon: Network,
                      onClick: () => navigate(`/dashboard/ott/${ott.id}/quick-flow`),
                      tone: 'purple',
                      chip: 'bg-purple-500/10 text-purple-400',
                      border: 'hover:border-purple-500/40',
                      bg: 'hover:bg-purple-500/5',
                      glow: 'from-purple-500/20',
                      text: 'text-text-main',
                      stripe: 'from-purple-500 to-fuchsia-400',
                      disabled: false,
                      spinning: false,
                    },
                    {
                      label: 'Delete OTT',
                      desc: 'Permanently remove everything',
                      Icon: Trash2,
                      onClick: handle_delete,
                      tone: 'red',
                      chip: 'bg-red-500/10 text-red-400',
                      border: 'hover:border-red-500/40',
                      bg: 'hover:bg-red-500/5',
                      glow: 'from-red-500/20',
                      text: 'text-red-500',
                      stripe: 'from-red-500 to-rose-400',
                      disabled: false,
                      spinning: false,
                    },
                  ].map(action => {
                    const Icon = action.Icon;
                    return (
                      <button
                        key={action.label}
                        onClick={action.onClick}
                        disabled={action.disabled}
                        className={`relative overflow-hidden rounded-2xl bg-bg-card border border-border-subtle ${action.border} ${action.bg} ${action.text} transition-all group p-5 flex flex-col gap-3 text-left disabled:opacity-60 disabled:hover:border-border-subtle disabled:hover:bg-bg-card`}
                      >
                        <div className={`absolute -top-12 -right-12 w-32 h-32 rounded-full bg-gradient-to-br ${action.glow} to-transparent blur-2xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none`} />
                        <div className="relative flex items-center justify-between">
                          <div className={`w-11 h-11 rounded-xl ${action.chip} flex items-center justify-center group-hover:scale-110 transition-transform`}>
                            <Icon size={18} className={action.spinning ? 'animate-spin' : ''} />
                          </div>
                          <ChevronRight size={16} className="text-text-muted group-hover:translate-x-1 transition-all" />
                        </div>
                        <div className="relative">
                          <p className="text-sm font-bold leading-none">{action.label}</p>
                          <p className="text-[10px] text-text-muted mt-1.5">{action.desc}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
            );
          })()}

          {active_tab === 'cards' && (
            <div className="space-y-12">
              {cards_loading ? (
                <div className="flex items-center justify-center py-20 text-text-muted">
                  <Loader2 size={28} className="animate-spin" />
                </div>
              ) : !card_sections || card_sections.sections.length === 0 ? (
                <div className="p-24 text-center space-y-6 bg-black/5 dark:bg-white/5 rounded-[40px] border border-dashed border-border-subtle">
                  <div className="w-20 h-20 mx-auto rounded-3xl bg-brand-emerald/10 text-brand-emerald flex items-center justify-center">
                    <LayoutGrid size={40} />
                  </div>
                  <div className="max-w-xs mx-auto space-y-2">
                    <h3 className="text-xl font-bold text-text-main">No Cards Yet</h3>
                    <p className="text-sm text-text-muted">Call APIs and pick fields in the API Tree tab.</p>
                  </div>
                  <button
                    onClick={() => setActiveTab('api-tree')}
                    className="px-8 py-3 rounded-xl bg-brand-emerald text-black font-bold"
                  >
                    Configure API Tree
                  </button>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between gap-4">
                    <p className="text-xs text-text-muted">
                      {card_sections.sections.reduce((acc, s) => acc + s.cards.length, 0)} cards across {card_sections.sections.length} section{card_sections.sections.length === 1 ? '' : 's'}
                    </p>
                    <button
                      onClick={handle_download_all}
                      disabled={is_downloading_all}
                      className="flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-xl bg-bg-card border border-border-subtle text-text-main hover:border-brand-blue/50 hover:text-brand-blue transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                      title="Auto-capture & download everything"
                    >
                      {is_downloading_all ? (
                        <>
                          <Loader2 size={14} className="animate-spin" />
                          {download_all_progress && download_all_progress.total > 0
                            ? `${download_all_progress.done}/${download_all_progress.total}`
                            : 'Loading…'}
                        </>
                      ) : (
                        <>
                          <Download size={14} />
                          Download All
                        </>
                      )}
                    </button>
                  </div>
                  {card_sections.sections.map(section => {
                  const section_node = flat_apis.find(n => n.id === section.api_id);
                  const is_paginated = !!section_node?.pagination_enabled && !!section_node?.pagination_type;
                  const page_state = get_section_state(section.api_id);
                  const supports_prev = section_node?.pagination_type === 'page_number' || section_node?.pagination_type === 'offset';
                  const can_prev = supports_prev && (
                    section_node?.pagination_type === 'page_number'
                      ? page_state.page_number > 1
                      : (page_state.offset_value ?? 0) > 0
                  );
                  return (
                    <div key={section.api_id} className="space-y-6">
                      <div className="flex items-center justify-between gap-4 flex-wrap">
                        <div className="flex items-center gap-4">
                          <div className="p-3 rounded-2xl bg-brand-emerald/10 text-brand-emerald">
                            <LayoutGrid size={24} />
                          </div>
                          <div>
                            <h3 className="text-xl font-bold text-text-main flex items-center gap-2">
                              {section.api_name}
                              {is_paginated && (
                                <span className="text-[9px] font-bold text-brand-blue uppercase tracking-widest px-1.5 py-0.5 rounded-full bg-brand-blue/10 border border-brand-blue/20 flex items-center gap-1">
                                  <Layers size={10} /> page {page_state.page_number}
                                </span>
                              )}
                            </h3>
                            <p className="text-xs text-text-muted">
                              {section.cards.length} cards from <span className="font-mono">{section.list_path || 'root'}</span> · {section.actions.length} actions
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          {is_paginated && (
                            <>
                              {/* Page-size pill — same controls as the nested
                                  cards page: typed override + "All" trigger. */}
                              <div className="flex items-center gap-1 p-1 rounded-xl bg-bg-card border border-border-subtle">
                                <span className="text-[10px] uppercase font-bold text-text-muted px-2">size</span>
                                <input
                                  type="number"
                                  min={1}
                                  value={page_state.page_size_input}
                                  onChange={(e) => set_section_page_size(section.api_id, e.target.value)}
                                  placeholder={section_node?.pagination_config?.limit_value !== undefined ? String(section_node.pagination_config.limit_value) : '20'}
                                  disabled={page_state.busy || page_state.loading_all}
                                  className="w-14 bg-black/10 dark:bg-white/10 border border-border-subtle rounded-lg px-2 py-1 text-xs font-mono text-text-main focus:outline-none focus:ring-1 focus:ring-brand-emerald/50 disabled:opacity-50"
                                  title="Per-call page size override (leave blank to use the configured limit)"
                                />
                                <button
                                  type="button"
                                  onClick={() => handle_section_load_all(section.api_id)}
                                  disabled={page_state.busy || page_state.loading_all}
                                  className="px-3 py-1.5 text-xs font-bold rounded-lg text-amber-400 hover:bg-amber-500/10 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
                                  title="Fetch every page using the strategy and merge into one response"
                                >
                                  {page_state.loading_all ? <Loader2 size={12} className="animate-spin" /> : <Layers size={12} />}
                                  All
                                </button>
                              </div>

                              <div className="flex items-center gap-1 p-1 rounded-xl bg-bg-card border border-border-subtle">
                                <button
                                  onClick={() => handle_page_navigate(section.api_id, 'prev')}
                                  disabled={page_state.busy || page_state.loading_all || !can_prev}
                                  className="px-3 py-1.5 text-xs font-bold rounded-lg text-text-main hover:bg-brand-blue/10 hover:text-brand-blue disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
                                  title={supports_prev ? 'Previous page' : 'Previous not supported for this pagination type'}
                                >
                                  {page_state.busy ? <Loader2 size={12} className="animate-spin" /> : <ArrowLeft size={12} />}
                                  Prev
                                </button>
                                <span className="text-[10px] font-mono text-text-muted px-2">
                                  p{page_state.page_number}
                                </span>
                                <button
                                  onClick={() => handle_page_navigate(section.api_id, 'next')}
                                  disabled={page_state.busy || page_state.loading_all || (!page_state.has_next && page_state.page_number > 1)}
                                  className="px-3 py-1.5 text-xs font-bold rounded-lg text-text-main hover:bg-brand-blue/10 hover:text-brand-blue disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
                                  title={!page_state.has_next && page_state.page_number > 1 ? 'No more pages' : 'Next page'}
                                >
                                  Next
                                  {page_state.busy ? <Loader2 size={12} className="animate-spin" /> : <ArrowRight size={12} />}
                                </button>
                              </div>
                            </>
                          )}
                          <button
                            onClick={async () => {
                              if (!ott_id) return;
                              const res = await ott_service.get_api_response(ott_id, section.api_id);
                              const response_data = res.success && res.data ? res.data.response : null;
                              setActionsManagerFor({ api_id: section.api_id, response: response_data });
                            }}
                            className="flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-xl bg-bg-card border border-border-subtle text-text-main hover:border-brand-emerald/50"
                          >
                            <Layers size={14} />
                            Manage Card Actions
                          </button>
                        </div>
                      </div>
                      <NestedCardRenderer
                        ott_id={ott_id ?? ''}
                        api_node={section_node ?? {
                          id: section.api_id,
                          ott_id: ott_id ?? '',
                          parent_id: null,
                          name: section.api_name,
                          endpoint: '',
                          method: 'GET',
                          request_body: null,
                          param_mappings: {},
                          list_path: section.list_path,
                          card_config: section.card_config ?? {},
                          card_enabled: section.card_enabled ?? true,
                          quick_run: section.quick_run ?? false,
                          default_child_api_id: section.default_child_api_id ?? null,
                          default_card_action_id: null,
                          skip_action_modal: false,
                          open_type: section.open_type ?? 'inline',
                          sort_order: 0,
                          status: 'success',
                          last_http_status: null,
                          last_error: null,
                          pagination_enabled: false,
                          pagination_type: null,
                          pagination_config: {},
                          selected_fields: [],
                          latest_response_summary: null,
                          children: [],
                          lastCalledAt: null,
                          lastSyncedAt: null,
                          createdAt: null,
                          updatedAt: null,
                        }}
                        cards={section.cards}
                        actions={section.actions}
                        children_by_parent={children_by_parent}
                        all_apis={flat_apis}
                        expanded={expanded_children}
                        set_expanded={setExpandedChildren}
                        busy_action_keys={busy_action_keys}
                        on_open_popup={open_card_action_popup}
                        on_open_card_builder={open_card_builder}
                        on_card_action={handle_card_action}
                        on_download_card={(card) => handle_download_card({
                          card,
                          parent_api_id: section.api_id,
                          default_child_api_id: section_node?.default_child_api_id ?? section.default_child_api_id,
                          actions: section.actions,
                        })}
                        card_download_states={card_download_state}
                      />
                    </div>
                  );
                })}
                </>
              )}
            </div>
          )}

          {active_tab === 'api-tree' && (
            <div className="bg-bg-card rounded-[40px] border border-border-subtle overflow-hidden shadow-sm">
              <ApiTreeManagementStep
                ott={ott}
                onTreeChanged={async () => { await load_ott(); }}
                onLogsChanged={() => load_logs()}
              />
            </div>
          )}

          {active_tab === 'logs' && (
            logs_loading ? (
              <div className="flex items-center justify-center py-24 text-text-muted">
                <Loader2 size={28} className="animate-spin" />
              </div>
            ) : logs_total === 0 ? (
              // No logs at all — render a centered inline empty state. min-h
              // fills the visible viewport area below the tabs so it sits in
              // the middle of the page instead of hugging the top.
              <div className="flex flex-col items-center justify-center text-text-muted min-h-[60vh]">
                <Terminal size={40} className="mb-4 opacity-30" />
                <p className="text-sm font-semibold">No logs</p>
                <p className="text-[11px] mt-1 opacity-60">Make an API call to see request activity here.</p>
              </div>
            ) : (
              <div className="bg-bg-card rounded-[40px] border border-border-subtle overflow-hidden shadow-sm h-[800px] flex">
                <DebugConsole
                  logs={logs}
                  onClear={handle_clear_logs}
                  ott_id={ott_id}
                  className="w-full h-full border-none"
                />
              </div>
            )
          )}

          {active_tab === 'settings' && (() => {
            const headers_count = Object.keys(ott.headers || {}).length;
            const fmt_date = (d: string | null | undefined) => {
              if (!d) return '—';
              try { return new Date(d).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }); }
              catch { return '—'; }
            };
            const fmt_relative = (d: string | null | undefined) => {
              if (!d) return 'Never';
              try {
                const diff_ms = Date.now() - new Date(d).getTime();
                const mins = Math.round(diff_ms / 60000);
                if (mins < 1) return 'Just now';
                if (mins < 60) return `${mins}m ago`;
                const hrs = Math.round(mins / 60);
                if (hrs < 24) return `${hrs}h ago`;
                const days = Math.round(hrs / 24);
                if (days < 30) return `${days}d ago`;
                return fmt_date(d);
              } catch { return '—'; }
            };
            const stat_cards = [
              { label: 'Registered APIs', value: stats.total_apis, icon: Terminal, icon_cls: 'bg-brand-blue/10 text-brand-blue', hover_bg: 'hover:bg-brand-blue/5', hover_border: 'hover:border-brand-blue/40' },
              { label: 'Card-Enabled', value: stats.cards_apis, icon: LayoutGrid, icon_cls: 'bg-brand-emerald/10 text-brand-emerald', hover_bg: 'hover:bg-brand-emerald/5', hover_border: 'hover:border-brand-emerald/40' },
              { label: 'Custom Headers', value: headers_count, icon: Network, icon_cls: 'bg-purple-500/10 text-purple-400', hover_bg: 'hover:bg-purple-500/5', hover_border: 'hover:border-purple-500/40' },
              { label: 'Total Logs', value: logs_total, icon: History, icon_cls: 'bg-amber-500/10 text-amber-500', hover_bg: 'hover:bg-amber-500/5', hover_border: 'hover:border-amber-500/40' },
            ];

            return (
              <div className="space-y-6 overflow-x-hidden">
                {/* KPI strip — at-a-glance numbers across the full width.
                    Each card tints to its own accent on hover. */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  {stat_cards.map(s => (
                    <div
                      key={s.label}
                      className={`relative p-5 rounded-3xl bg-bg-card border border-border-subtle ${s.hover_border} ${s.hover_bg} transition-colors flex items-center gap-4 overflow-hidden`}
                    >
                      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${s.icon_cls}`}>
                        <s.icon size={22} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-2xl font-bold text-text-main tabular-nums leading-none">{s.value}</p>
                        <p className="text-[10px] uppercase tracking-widest text-text-muted font-bold mt-1.5 truncate">{s.label}</p>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Platform Profile — full width row with header strip + body */}
                <div className="rounded-[32px] bg-bg-card border border-border-subtle overflow-hidden">
                  <div className="p-6 sm:p-8 border-b border-border-subtle bg-gradient-to-br from-brand-emerald/[0.04] via-transparent to-brand-blue/[0.04]">
                    <div className="flex items-start gap-5">
                      <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-3xl bg-gradient-to-br from-brand-emerald to-brand-blue text-white flex items-center justify-center shadow-lg shadow-brand-blue/20 shrink-0 overflow-hidden">
                        {ott.favicon_url ? (
                          <img src={ott.favicon_url} alt={ott.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                        ) : (
                          <Building2 size={32} />
                        )}
                      </div>
                      <div className="flex-1 min-w-0 space-y-2">
                        <div className="flex items-center gap-3 flex-wrap">
                          <h3 className="text-xl sm:text-2xl font-bold text-text-main truncate">{ott.name}</h3>
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
                            ott.status === 'active'
                              ? 'bg-brand-emerald/10 text-brand-emerald border-brand-emerald/20'
                              : 'bg-amber-500/10 text-amber-500 border-amber-500/20'
                          }`}>
                            <CheckCircle2 size={11} />
                            {ott.status || 'active'}
                          </span>
                        </div>
                        <p className="text-sm text-text-muted leading-relaxed line-clamp-2">
                          {ott.description || 'No description provided.'}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="p-6 sm:p-8 space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="p-4 rounded-2xl bg-black/5 dark:bg-white/5 border border-border-subtle space-y-2 min-w-0">
                        <div className="flex items-center gap-2 text-[10px] font-bold text-text-muted uppercase tracking-widest">
                          <Globe size={12} /> Base URL
                        </div>
                        <p className="text-sm font-mono text-text-main break-all">{ott.base_url}</p>
                      </div>
                      <div className="p-4 rounded-2xl bg-black/5 dark:bg-white/5 border border-border-subtle space-y-2 min-w-0">
                        <div className="flex items-center gap-2 text-[10px] font-bold text-text-muted uppercase tracking-widest">
                          <FileText size={12} /> Cookie File
                        </div>
                        {ott.cookie_file_name ? (
                          <p className="text-sm font-mono text-text-main truncate flex items-center gap-2">
                            <ShieldCheck size={14} className="text-brand-emerald shrink-0" />
                            <span className="truncate">{ott.cookie_file_name}</span>
                          </p>
                        ) : (
                          <p className="text-sm text-text-muted/70 italic">Not configured</p>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {[
                        { label: 'Created', value: fmt_date(ott.createdAt), icon: Calendar },
                        { label: 'Last Updated', value: fmt_relative(ott.updatedAt), icon: Edit2 },
                        { label: 'Last Synced', value: fmt_relative(ott.lastSyncedAt), icon: RefreshCw },
                      ].map(t => (
                        <div key={t.label} className="p-3 rounded-xl border border-border-subtle flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-black/5 dark:bg-white/5 text-text-muted flex items-center justify-center shrink-0">
                            <t.icon size={14} />
                          </div>
                          <div className="min-w-0">
                            <p className="text-[9px] font-bold text-text-muted uppercase tracking-widest">{t.label}</p>
                            <p className="text-xs font-bold text-text-main truncate">{t.value}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Two cards side-by-side at md+: Quick Actions | Custom Headers */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Quick Actions — each action is its own visually distinct
                      tile with an accent left bar so they read as discrete
                      buttons rather than a list. */}
                  <div className="rounded-[32px] bg-bg-card border border-border-subtle p-6 space-y-5">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-brand-emerald/10 text-brand-emerald flex items-center justify-center">
                        <Settings size={18} />
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-text-main">Quick Actions</h3>
                        <p className="text-[11px] text-text-muted">Manage platform configuration</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {[
                        {
                          label: 'Edit Configuration',
                          desc: 'Update URL, cookies & headers',
                          icon: Edit2,
                          accent: 'bg-brand-emerald',
                          hover: 'hover:border-brand-emerald/40 hover:bg-brand-emerald/[0.06]',
                          onClick: () => navigate(`/dashboard/ott/${ott.id}/edit`),
                          disabled: false,
                          label_node: null as React.ReactNode,
                        },
                        {
                          label: is_syncing ? 'Syncing…' : 'Sync Root APIs',
                          desc: 'Refresh all root endpoints',
                          icon: RefreshCw,
                          accent: 'bg-brand-blue',
                          hover: 'hover:border-brand-blue/40 hover:bg-brand-blue/[0.06]',
                          onClick: handle_sync,
                          disabled: is_syncing,
                          label_node: null as React.ReactNode,
                        },
                        {
                          label: 'View Quick Flow',
                          desc: 'Visualize the API graph',
                          icon: Network,
                          accent: 'bg-brand-purple',
                          hover: 'hover:border-brand-purple/40 hover:bg-brand-purple/[0.06]',
                          onClick: () => navigate(`/dashboard/ott/${ott.id}/quick-flow`),
                          disabled: false,
                          label_node: null as React.ReactNode,
                        },
                      ].map(a => (
                        <button
                          key={a.label}
                          onClick={a.onClick}
                          disabled={a.disabled}
                          className={`relative text-left p-4 rounded-2xl bg-black/5 dark:bg-white/[0.04] border border-border-subtle ${a.hover} transition-all overflow-hidden flex flex-col gap-3 disabled:opacity-50 disabled:cursor-not-allowed group`}
                        >
                          <span className={`absolute left-0 top-0 bottom-0 w-[3px] ${a.accent} opacity-70 rounded-r`} />
                          <div className="w-9 h-9 rounded-xl bg-black/5 dark:bg-white/5 text-text-main flex items-center justify-center">
                            <a.icon size={16} className={a.label === 'Syncing…' ? 'animate-spin' : ''} />
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-bold text-text-main truncate">{a.label}</p>
                            <p className="text-[10px] text-text-muted mt-0.5 truncate">{a.desc}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Custom Headers preview */}
                  <div className="rounded-[32px] bg-bg-card border border-border-subtle p-6 space-y-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-brand-purple/10 text-brand-purple flex items-center justify-center">
                        <Hash size={18} />
                      </div>
                      <div className="min-w-0">
                        <h3 className="text-sm font-bold text-text-main">Custom Headers</h3>
                        <p className="text-[11px] text-text-muted truncate">
                          {headers_count === 0 ? 'No headers configured' : `${headers_count} header${headers_count === 1 ? '' : 's'} sent on every call`}
                        </p>
                      </div>
                    </div>
                    {headers_count === 0 ? (
                      <p className="text-xs text-text-muted/70 italic">Add headers via Edit Configuration to authenticate or shape upstream requests.</p>
                    ) : (
                      <div className="space-y-1.5 max-h-64 overflow-y-auto overflow-x-hidden pr-1 scrollbar-hide">
                        {Object.entries(ott.headers || {}).slice(0, 12).map(([k, v]) => (
                          <div
                            key={k}
                            className="flex items-center gap-2 p-2 rounded-lg bg-black/5 dark:bg-white/5 border border-border-subtle font-mono text-[11px] min-w-0 w-full"
                            title={`${k}: ${String(v)}`}
                          >
                            <span className="text-brand-emerald font-bold truncate max-w-[40%] min-w-0">{k}</span>
                            <span className="text-text-muted/60 shrink-0">:</span>
                            <span className="text-text-muted truncate flex-1 min-w-0">{String(v)}</span>
                          </div>
                        ))}
                        {headers_count > 12 && (
                          <p className="text-[10px] text-text-muted/60 italic px-2 pt-1">+{headers_count - 12} more — see Edit Configuration</p>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* ── Danger Zone (full width, low-profile) ─────────── */}
                <div className="rounded-[32px] bg-red-500/[0.04] border border-red-500/15 p-6 flex flex-col sm:flex-row sm:items-center gap-4 sm:justify-between">
                  <div className="flex items-start gap-4 min-w-0">
                    <div className="w-11 h-11 rounded-2xl bg-red-500/10 text-red-500 flex items-center justify-center shrink-0">
                      <AlertCircle size={20} />
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-sm font-bold text-red-500">Danger Zone</h3>
                      <p className="text-xs text-text-muted leading-relaxed mt-1">
                        Deleting this OTT permanently removes all API mappings, selected fields, responses, and logs. This cannot be undone.
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={handle_delete}
                    className="shrink-0 inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-red-500 text-white font-bold hover:bg-red-600 transition-colors shadow-lg shadow-red-500/20"
                  >
                    <Trash2 size={16} />
                    Permanently Delete OTT
                  </button>
                </div>
              </div>
            );
          })()}
        </motion.div>
      </AnimatePresence>

      <AnimatePresence>
        {selected_item && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedItem(null)}
              className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-sm m-0"
            />
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed top-0 right-0 h-full w-full max-w-2xl bg-bg-card z-[80] shadow-2xl border-l border-border-subtle flex flex-col"
            >
              <div className="p-6 border-b border-border-subtle flex items-center justify-between bg-black/5 dark:bg-white/5">
                <div className="flex items-center gap-4">
                  <div className="p-2 rounded-xl bg-brand-emerald/10 text-brand-emerald">
                    <LayoutGrid size={20} />
                  </div>
                  <div>
                    <h3 className="font-bold text-text-main">
                      {selected_item.card.fields.find(f => f.display_type === 'title')?.value
                        ? String(selected_item.card.fields.find(f => f.display_type === 'title')?.value)
                        : 'Item Details'}
                    </h3>
                    <p className="text-[10px] text-text-muted uppercase font-bold tracking-widest">
                      Index: {selected_item.card.index} • Key: {selected_item.card.item_key}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedItem(null)}
                  className="p-2 rounded-xl hover:bg-black/5 dark:hover:bg-white/5 text-text-muted transition-colors"
                >
                  <X size={24} />
                </button>
              </div>

              {/* Tightened: was p-8 space-y-12 — too airy on a side drawer.
                  p-5 space-y-6 + min-w-0 keeps long URLs from overflowing the
                  fixed-width drawer. */}
              <div className="flex-1 overflow-y-auto p-5 space-y-6 min-w-0">
                <div className="space-y-3">
                  <h4 className="text-[10px] font-bold text-text-muted uppercase tracking-widest flex items-center gap-2">
                    <Database size={12} /> Item Data Bindings
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {selected_item.card.fields.map(f => (
                      <div key={f.path} className="p-3 rounded-xl bg-bg-main border border-border-subtle space-y-0.5 min-w-0">
                        <span className="text-[9px] font-bold text-text-muted uppercase block truncate">{f.label || f.path}</span>
                        <p className="text-xs font-bold text-text-main line-clamp-1 break-all">
                          {f.value === null || f.value === undefined ? '—' : String(f.value)}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>

                {selected_item.child_api ? (
                  <div className="space-y-3">
                    <h4 className="text-[10px] font-bold text-text-muted uppercase tracking-widest flex items-center gap-2">
                      <Layers size={12} className="text-brand-emerald" /> Child API: {selected_item.child_api.name}
                    </h4>
                    {selected_item.child_loading ? (
                      <div className="flex items-center justify-center py-10 text-text-muted">
                        <Loader2 size={18} className="animate-spin mr-2" />
                        <span className="text-xs">Calling child API…</span>
                      </div>
                    ) : selected_item.child_response ? (
                      // VS Code-style tree view (collapsed arrays by default)
                      // replaces the old read-only textarea — long URLs now
                      // wrap inside the drawer instead of bleeding outside.
                      <JsonTreeViewer
                        data={selected_item.child_response}
                        default_expanded_depth={1}
                        collapse_arrays_by_default
                        max_height={420}
                      />
                    ) : null}
                  </div>
                ) : (
                  <div className="space-y-3">
                    <h4 className="text-[10px] font-bold text-text-muted uppercase tracking-widest flex items-center gap-2">
                      <Layers size={12} className="text-brand-emerald" /> Available Child Actions
                    </h4>
                    {(() => {
                      const children = (ott.api_tree.find(n => n.id === selected_item.parent_api_id)?.children) || [];
                      if (children.length === 0) {
                        return (
                          <div className="p-6 rounded-2xl bg-black/5 dark:bg-white/5 border border-dashed border-border-subtle flex flex-col items-center text-center gap-3">
                            <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center text-text-muted">
                              <Layers size={20} />
                            </div>
                            <p className="text-xs text-text-muted">No child APIs registered for this endpoint yet.</p>
                            <button
                              onClick={() => { setSelectedItem(null); setActiveTab('api-tree'); }}
                              className="text-xs font-bold text-brand-emerald underline"
                            >
                              Add Child API Mapping
                            </button>
                          </div>
                        );
                      }
                      return (
                        <div className="grid grid-cols-1 gap-2">
                          {children.map(child => (
                            <button
                              key={child.id}
                              onClick={async () => {
                                if (!ott_id) return;
                                setSelectedItem(prev => prev && { ...prev, child_api: child, child_response: null, child_loading: true });
                                try {
                                  const res = await ott_service.call_child_api_from_card({
                                    ott_id,
                                    child_api_id: child.id,
                                    parent_api_id: selected_item.parent_api_id,
                                    card_index: selected_item.card.index,
                                    item_key: selected_item.card.item_key,
                                  });
                                  if (!res.success || !res.data) throw new Error(res.message || 'Child API failed');
                                  setSelectedItem(prev => prev && { ...prev, child_response: res.data!.response, child_loading: false });
                                  toast.success(res.message || 'Child API called successfully');
                                  load_logs();
                                } catch (err: any) {
                                  toast.error(err?.message || 'Child API failed');
                                  setSelectedItem(prev => prev && { ...prev, child_response: { error: err?.message || 'Failed' }, child_loading: false });
                                }
                              }}
                              className="p-3 rounded-xl bg-black/5 dark:bg-white/5 border border-border-subtle hover:border-brand-emerald/50 transition-all flex items-center justify-between group"
                            >
                              <div className="flex items-center gap-3 min-w-0">
                                <div className="p-2 rounded-lg bg-brand-emerald/10 text-brand-emerald group-hover:scale-110 transition-transform shrink-0">
                                  <Play size={14} fill="currentColor" />
                                </div>
                                <div className="text-left min-w-0">
                                  <p className="text-sm font-bold text-text-main truncate">{child.name}</p>
                                  <p className="text-[10px] text-text-muted font-mono truncate">{child.endpoint}</p>
                                </div>
                              </div>
                              <ArrowRight size={14} className="text-text-muted group-hover:translate-x-1 transition-transform shrink-0" />
                            </button>
                          ))}
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>

              {/* Compact footer — was p-6 with full-width chunky button.
                  The header X button already closes the drawer; this is just
                  a secondary affordance for users who scroll all the way down. */}
              <div className="px-5 py-3 border-t border-border-subtle bg-black/5 dark:bg-white/5">
                <button
                  onClick={() => setSelectedItem(null)}
                  className="w-full py-2 rounded-lg bg-bg-card border border-border-subtle text-text-main text-sm font-bold hover:bg-black/5 transition-colors"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {actions_manager_for && ott_id && (() => {
        const parent_node = flat_apis.find(n => n.id === actions_manager_for.api_id);
        if (!parent_node) return null;
        return (
          <CardActionsManagerModal
            isOpen={true}
            onClose={() => setActionsManagerFor(null)}
            ott_id={ott_id}
            parent_api={parent_node}
            child_apis={children_by_parent.get(parent_node.id) || []}
            parent_response={actions_manager_for.response}
            onChanged={async () => { await load_cards(); }}
          />
        );
      })()}

      {popup_state && (
        <CardActionPopup
          isOpen={true}
          onClose={() => setPopupState(null)}
          api_node={popup_state.api_node}
          card={popup_state.card}
          child_apis={children_by_parent.get(popup_state.api_node.id) || []}
          on_dispatch={handle_popup_dispatch}
          busy_child_id={popup_state.busy_child_id}
          show_capture_videos={true}
        />
      )}

      {per_card_capture && ott_id && (() => {
        const list_path = per_card_capture.api_node.list_path ?? '';
        const card_index = per_card_capture.card.index;
        const prefix = list_path ? `${list_path}[${card_index}]` : `[${card_index}]`;
        return (
          <CaptureVideoModal
            isOpen={true}
            onClose={() => setPerCardCapture(null)}
            ott_id={ott_id}
            api_node_id={per_card_capture.api_node.id}
            parent_api_id={per_card_capture.api_node.parent_id ?? null}
            source_response_id={per_card_capture.source_response_id ?? null}
            item_key={per_card_capture.card.item_key}
            response={per_card_capture.card.raw_item}
            card_path_prefix={prefix}
            onSaved={async () => { await load_cards(); }}
          />
        );
      })()}

      {card_builder_for && ott_id && (
        <ApiCardBuilderModal
          isOpen={true}
          onClose={() => setCardBuilderFor(null)}
          ott_id={ott_id}
          api_node={card_builder_for.api_node}
          child_apis={children_by_parent.get(card_builder_for.api_node.id) || []}
          {...(card_builder_for.sample_response !== undefined ? { sample_response: card_builder_for.sample_response } : {})}
          {...(card_builder_for.source_response_id ? { source_response_id: card_builder_for.source_response_id } : {})}
          onSaved={async () => { await load_ott(); await load_cards(); }}
        />
      )}
    </div>
  );
};

export default OttManagePage;
