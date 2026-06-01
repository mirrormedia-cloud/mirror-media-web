import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import toast from 'react-hot-toast';
import {
  X,
  Loader2,
  Layers,
  Save,
  Hash,
  Search,
  CheckCircle2,
  AlertCircle,
  Eye,
  EyeOff,
  Trash2,
  Type,
  Image as ImageIcon,
  Tag,
  Info,
  ChevronDown,
  Zap,
  ZapOff,
  Play,
} from 'lucide-react';
import {
  ApiNode,
  CardOpenTypeExtended,
  DisplayType,
  CardDisplayConfig,
} from '../../../../../types';
import { ott_service } from '../../../../../services/ott_service';
import { CommonSearchSelect } from '../../../../../components/ui/CommonSearchSelect';
import {
  findArrayPaths,
  extract_paths_with_arrays,
  getValueByPath,
  detectDisplayType,
} from '../../../../../utils/apiDataUtils';

interface DraftField {
  path: string;
  label: string;
  display_type: DisplayType;
  sort_order: number;
  is_visible: boolean;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  ott_id: string;
  api_node: ApiNode;
  child_apis: ApiNode[];
  /** Optional pre-fetched response (e.g. from a child item context). If omitted, the modal pulls the latest saved response for this api. */
  sample_response?: any;
  /** Optional source_response_id when building cards from a child item response. */
  source_response_id?: string;
  onSaved?: () => void | Promise<void>;
}

const DISPLAY_OPTIONS: { type: DisplayType; label: string; icon: React.ReactNode }[] = [
  { type: 'title', label: 'Title', icon: <Type size={14} /> },
  { type: 'subtitle', label: 'Subtitle', icon: <Info size={14} /> },
  { type: 'description', label: 'Desc', icon: <Info size={14} /> },
  { type: 'image', label: 'Image', icon: <ImageIcon size={14} /> },
  { type: 'badge', label: 'Badge', icon: <Tag size={14} /> },
  { type: 'text', label: 'Text', icon: <Type size={14} /> },
  { type: 'hidden_id', label: 'ID', icon: <EyeOff size={14} /> },
];

const OPEN_TYPE_OPTIONS: CardOpenTypeExtended[] = ['inline', 'drawer', 'modal', 'page'];

const ApiCardBuilderModal: React.FC<Props> = ({
  isOpen,
  onClose,
  ott_id,
  api_node,
  child_apis,
  sample_response,
  onSaved,
}) => {
  const [loading, set_loading] = useState(false);
  const [saving, set_saving] = useState(false);
  const [response, set_response] = useState<any>(sample_response ?? null);
  const [no_response, set_no_response] = useState(false);
  const [calling_api, set_calling_api] = useState(false);

  const [list_path, set_list_path] = useState<string>(api_node.list_path || '');
  const [fields, set_fields] = useState<DraftField[]>([]);
  const [search_term, set_search_term] = useState('');
  // Live preview toggle. Default off so the modal opens compact; user clicks
  // the eye button in the header to peek how the card will render with the
  // currently-picked fields. Skips when no fields are selected (nothing to show).
  const [show_preview, set_show_preview] = useState(false);

  const [card_enabled, set_card_enabled] = useState<boolean>(api_node.card_enabled ?? false);
  const [quick_run, set_quick_run] = useState<boolean>(api_node.quick_run ?? false);
  const [skip_action_modal, set_skip_action_modal] = useState<boolean>(api_node.skip_action_modal ?? false);
  const [default_child_api_id, set_default_child_api_id] = useState<string>(api_node.default_child_api_id ?? '');
  const [open_type, set_open_type] = useState<CardOpenTypeExtended>(api_node.open_type ?? 'inline');
  const [display, set_display] = useState<CardDisplayConfig>({
    layout: api_node.card_config?.layout ?? 'grid',
    show_labels: api_node.card_config?.show_labels ?? true,
    image_fit: api_node.card_config?.image_fit ?? 'cover',
    card_size: api_node.card_config?.card_size ?? 'medium',
  });

  // ── Load existing config + response on open ────────────────────────────
  useEffect(() => {
    if (!isOpen) return;
    set_search_term('');
    set_no_response(false);
    set_loading(true);
    Promise.all([
      ott_service.get_api_card_config(ott_id, api_node.id),
      sample_response !== undefined
        ? Promise.resolve({ success: true, data: { response: sample_response } } as any)
        : ott_service.get_api_response(ott_id, api_node.id),
    ])
      .then(([config_res, response_res]) => {
        if (config_res.success && config_res.data) {
          const c = config_res.data;
          set_list_path(c.list_path || api_node.list_path || '');
          set_card_enabled(c.card_enabled);
          set_quick_run(c.quick_run);
          set_skip_action_modal(c.skip_action_modal ?? false);
          set_default_child_api_id(c.default_child_api_id ?? '');
          set_open_type((c.open_type as CardOpenTypeExtended) ?? 'inline');
          set_display({
            layout: c.card_config?.layout ?? 'grid',
            show_labels: c.card_config?.show_labels ?? true,
            image_fit: c.card_config?.image_fit ?? 'cover',
            card_size: c.card_config?.card_size ?? 'medium',
          });
          set_fields(
            (c.selected_fields || []).map((f, i) => ({
              path: f.path,
              label: f.label ?? f.path.split('.').pop() ?? f.path,
              display_type: f.display_type,
              sort_order: f.sort_order ?? i,
              is_visible: f.is_visible ?? true,
            })),
          );
        }
        const fetched_response = (response_res as any)?.data?.response ?? null;
        if (fetched_response === null || fetched_response === undefined) {
          set_no_response(true);
          set_response(null);
        } else {
          set_response(fetched_response);
        }
      })
      .catch(() => set_no_response(true))
      .finally(() => set_loading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, api_node.id, ott_id]);

  // ── Derived helpers ────────────────────────────────────────────────────
  const array_paths = useMemo(() => {
    if (!response) return [];
    const paths = findArrayPaths(response);
    return paths.length > 0 ? paths : [''];
  }, [response]);

  useEffect(() => {
    if (response && array_paths.length > 0 && !list_path) {
      set_list_path(array_paths[0]);
    }
  }, [response, array_paths, list_path]);

  const sample_item = useMemo(() => {
    if (!response) return null;
    const arr = list_path ? getValueByPath(response, list_path) : response;
    if (Array.isArray(arr) && arr.length > 0) return arr[0];
    return null;
  }, [response, list_path]);

  const all_paths = useMemo(() => {
    if (!sample_item) return [];
    // extract_paths_with_arrays recurses INTO nested arrays using `[0]` template
    // indices, so users can pick `episodes[0].title` or `sources[0].file` — not
    // just flat keys. Without this, anything inside a nested array was hidden
    // and the user couldn't select fields like `shows[0].episodes[0].title`.
    const inner = extract_paths_with_arrays(sample_item);
    const prefix = list_path ? `${list_path}[0]` : '[0]';
    // Inner paths that start with `[` (sample_item is itself an array of arrays)
    // need to be concatenated without a `.` separator — `shows[0][0]`, not
    // `shows[0].[0]`. Common case is dot-joined.
    return inner.map((p: string) => p.startsWith('[') ? `${prefix}${p}` : `${prefix}.${p}`);
  }, [sample_item, list_path]);

  const filtered_paths = useMemo(() => {
    const term = search_term.toLowerCase();
    const matches = search_term
      ? all_paths.filter(p => p.toLowerCase().includes(term))
      : all_paths;
    // Sort selected fields to the top — previously the user had to scroll past
    // dozens of unselected paths to find what they'd already picked. We use a
    // Set for O(1) lookup and a stable partition so unselected paths keep
    // their original (response) order.
    const selected_set = new Set(fields.map(f => f.path));
    const selected_first: string[] = [];
    const rest: string[] = [];
    for (const p of matches) {
      if (selected_set.has(p)) selected_first.push(p);
      else rest.push(p);
    }
    return [...selected_first, ...rest];
  }, [all_paths, search_term, fields]);

  // ── Field manipulation ─────────────────────────────────────────────────
  const toggle_field = (path: string) => {
    const exists = fields.find(f => f.path === path);
    if (exists) {
      set_fields(prev => prev.filter(f => f.path !== path));
      return;
    }
    const last_segment = path.split('.').pop() || path;
    const sample_value = getValueByPath(response, path.replace(/\[0\]/g, '[0]'));
    const display_type = detectDisplayType(last_segment, sample_value);
    set_fields(prev => [
      ...prev,
      {
        path,
        label: last_segment,
        display_type,
        sort_order: prev.length,
        is_visible: true,
      },
    ]);
  };

  const update_field = (path: string, patch: Partial<DraftField>) => {
    set_fields(prev => prev.map(f => f.path === path ? { ...f, ...patch } : f));
  };

  const remove_field = (path: string) => {
    set_fields(prev => prev.filter(f => f.path !== path));
  };

  const move_field = (path: string, direction: 'up' | 'down') => {
    set_fields(prev => {
      const sorted = [...prev].sort((a, b) => a.sort_order - b.sort_order);
      const idx = sorted.findIndex(f => f.path === path);
      if (idx === -1) return prev;
      const target = direction === 'up' ? idx - 1 : idx + 1;
      if (target < 0 || target >= sorted.length) return prev;
      [sorted[idx], sorted[target]] = [sorted[target], sorted[idx]];
      return sorted.map((f, i) => ({ ...f, sort_order: i }));
    });
  };

  // ── Call API now (when no response) ────────────────────────────────────
  // For root APIs this is a direct call. For child APIs sample_call walks the
  // parent's saved response, takes index 0, and runs call_from_card so we get a
  // sample without the user having to navigate elsewhere first.
  const handle_call_api_now = async () => {
    set_calling_api(true);
    try {
      const res = await ott_service.sample_call_api(ott_id, api_node.id);
      if (!res.success || !res.data) throw new Error(res.message || 'Sample call failed');
      if (res.data.success === false) {
        throw new Error(res.data.error_message || `Sample call failed (HTTP ${res.data.http_status ?? 'ERR'})`);
      }
      set_response(res.data.response);
      set_no_response(false);
      toast.success(
        res.data.source === 'child'
          ? `Sampled via parent ${res.data.parent_api_name ?? ''} — pick fields below`
          : 'API called — pick fields below',
      );
    } catch (err: any) {
      toast.error(err?.message || 'Failed to call API');
    } finally {
      set_calling_api(false);
    }
  };

  // ── Call All Pages (when loaded response is single-page) ──────────────
  // Re-runs the configured pagination loop and replaces the saved response
  // with a merged version covering every page up to max_pages. The card
  // builder then auto-picks up the merged response on the next render.
  const handle_call_all_pages = async () => {
    set_calling_api(true);
    try {
      const res = await ott_service.call_api_node(ott_id, api_node.id, { fetch_all_pages: true });
      if (!res.success || !res.data) throw new Error(res.message || 'Call failed');
      if (!res.data.success) {
        throw new Error(res.data.error_message || `Call failed (HTTP ${res.data.http_status ?? 'ERR'})`);
      }
      set_response(res.data.response);
      const summary = res.data.pagination
        ? `Loaded ${res.data.pagination.pages_fetched} page(s) — ${res.data.pagination.total_items} item(s)`
        : 'API called';
      toast.success(summary);
    } catch (err: any) {
      toast.error(err?.message || 'Call all pages failed');
    } finally {
      set_calling_api(false);
    }
  };

  // ── Detect partial pagination ─────────────────────────────────────────
  // When an API has pagination configured but the loaded response was fetched
  // as a single page (no pagination_meta stamp), the user is configuring cards
  // on incomplete data. Show a warning so they can decide to load all pages
  // first. Skipped for child APIs — those use call_from_card per-card and the
  // single-card flow is the expected one.
  const partial_pagination = !!(
    api_node.pagination_enabled
    && api_node.pagination_type
    && !api_node.parent_id
    && response
    && !response?.pagination_meta?.pages_fetched
  );

  // ── Save ───────────────────────────────────────────────────────────────
  const handle_save = async () => {
    if (!list_path && (!array_paths.length || array_paths[0] !== '')) {
      toast.error('Select a list path');
      return;
    }
    if (fields.length === 0) {
      toast.error('Pick at least one field');
      return;
    }
    if (quick_run && !default_child_api_id) {
      toast.error('Pick a default child API for quick_run mode');
      return;
    }
    set_saving(true);
    try {
      const ordered = [...fields].sort((a, b) => a.sort_order - b.sort_order).map((f, i) => ({
        path: f.path,
        label: f.label,
        display_type: f.display_type,
        sort_order: i + 1,
        is_visible: f.is_visible !== false,
      }));
      const res = await ott_service.save_api_card_config(ott_id, api_node.id, {
        card_enabled,
        list_path,
        quick_run,
        skip_action_modal,
        default_child_api_id: default_child_api_id || null,
        open_type,
        card_config: display,
        selected_fields: ordered,
      });
      if (!res.success) throw new Error(res.message || 'Failed to save card config');
      toast.success(res.message || 'Card config saved');
      await onSaved?.();
      onClose();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to save card config');
    } finally {
      set_saving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
      />

      <motion.div
        initial={{ scale: 0.96, opacity: 0, y: 16 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        className="relative w-full max-w-6xl max-h-[92vh] bg-bg-card border border-border-subtle rounded-3xl shadow-2xl flex flex-col overflow-hidden"
      >
        <div className="p-6 border-b border-border-subtle flex items-center justify-between bg-black/5 dark:bg-white/5">
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-2xl bg-brand-emerald/10 text-brand-emerald">
              <Layers size={24} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-text-main">Create Card</h2>
              <p className="text-xs text-text-muted">{api_node.name} <span className="font-mono">· {api_node.endpoint}</span></p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Toggle the live preview card. Disabled when no fields are
                selected — there'd be nothing to render. */}
            <button
              type="button"
              onClick={() => set_show_preview(v => !v)}
              disabled={fields.length === 0 || !response}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition-all ${
                show_preview
                  ? 'bg-brand-emerald/15 text-brand-emerald border-brand-emerald/40'
                  : 'bg-bg-card text-text-muted border-border-subtle hover:text-text-main'
              } disabled:opacity-40 disabled:cursor-not-allowed`}
              title={fields.length === 0 ? 'Select fields to preview' : (show_preview ? 'Hide preview' : 'Show live preview')}
            >
              {show_preview ? <EyeOff size={12} /> : <Eye size={12} />}
              Preview
            </button>
            <button onClick={onClose} className="p-2 rounded-xl hover:bg-black/5 dark:hover:bg-white/5 text-text-muted">
              <X size={24} />
            </button>
          </div>
        </div>

        {/* Paginated-but-only-page-1 warning. Sits above the main content so
            it's seen before the user picks fields. */}
        {partial_pagination && !loading && !no_response && (
          <div className="px-6 py-3 border-b border-amber-500/20 bg-amber-500/5 flex items-start gap-3">
            <AlertCircle size={16} className="text-amber-500 mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-amber-600 dark:text-amber-300">
                This API is paginated — only the first page is loaded.
              </p>
              <p className="text-[11px] text-text-muted mt-0.5">
                Cards will be built from page 1 only. Click <span className="font-bold">Call All Pages</span> to fetch every page (up to <span className="font-mono">{api_node.pagination_config?.max_pages ?? 50}</span>) and merge them, then build cards on the complete set.
              </p>
            </div>
            <button
              onClick={handle_call_all_pages}
              disabled={calling_api}
              className="shrink-0 px-3 py-1.5 rounded-xl bg-brand-blue/10 text-brand-blue border border-brand-blue/30 text-xs font-bold flex items-center gap-1.5 hover:bg-brand-blue/20 disabled:opacity-50"
            >
              {calling_api ? <Loader2 size={12} className="animate-spin" /> : <Layers size={12} />}
              Call All Pages
            </button>
          </div>
        )}

        <div className="flex-1 overflow-hidden flex relative">
          {/* Live preview — floats over the right column. Re-uses the user's
              picked display_types to render a realistic card from the FIRST
              item of the response. Auto-hides when no fields are selected so
              an empty preview never confuses the user. */}
          {show_preview && fields.length > 0 && response && (
            <div className="absolute top-4 right-4 z-10 w-[260px] pointer-events-auto">
              <PreviewCard fields={fields} response={response} display={display} />
            </div>
          )}
          {loading ? (
            <div className="flex-1 flex items-center justify-center text-text-muted">
              <Loader2 size={28} className="animate-spin" />
            </div>
          ) : no_response ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-6 p-12 text-center">
              <AlertCircle size={48} className="text-amber-500" />
              <div className="space-y-1">
                <h3 className="text-lg font-bold text-text-main">No saved response</h3>
                <p className="text-sm text-text-muted max-w-md">
                  {api_node.parent_id
                    ? "This is a child API — clicking 'Sample Call' will run the parent's first card and use that response as the sample."
                    : 'Please call this API first before creating cards.'}
                </p>
              </div>
              <button
                onClick={handle_call_api_now}
                disabled={calling_api}
                className="btn-primary px-8 py-3 flex items-center gap-2 disabled:opacity-50"
              >
                {calling_api ? <Loader2 size={18} className="animate-spin" /> : <Play size={18} />}
                {api_node.parent_id ? 'Sample Call' : 'Call API Now'}
              </button>
            </div>
          ) : (
            <>
              {/* Left: field picker */}
              <div className="w-1/2 border-r border-border-subtle flex flex-col bg-black/5 dark:bg-white/5 overflow-hidden">
                <div className="p-6 space-y-4">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-text-muted uppercase tracking-wider flex items-center gap-2">
                      <Hash size={14} /> List path
                    </label>
                    <CommonSearchSelect
                      size="md"
                      value={list_path}
                      on_change={(v) => set_list_path(v ?? '')}
                      options={array_paths.map(p => ({
                        label: p || 'Root (top-level array)',
                        value: p,
                      }))}
                      placeholder="Pick a list path..."
                      search_placeholder="Search array paths..."
                      empty_message="No array paths in response"
                    />
                  </div>

                  <div className="relative">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted" size={18} />
                    <input
                      type="text"
                      placeholder="Search fields..."
                      value={search_term}
                      onChange={(e) => set_search_term(e.target.value)}
                      className="w-full bg-black/10 dark:bg-white/10 border-none rounded-xl pl-12 pr-4 py-3 text-sm text-text-main outline-none focus:ring-2 focus:ring-brand-emerald/50"
                    />
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto p-2 space-y-1">
                  {!sample_item && (
                    <p className="text-center text-xs text-text-muted py-12">No sample under <span className="font-mono">{list_path || 'root'}</span></p>
                  )}
                  {sample_item && filtered_paths.map(path => {
                    const is_selected = fields.some(f => f.path === path);
                    const value = getValueByPath(response, path.replace(/\[0\]/g, '[0]'));
                    return (
                      <button
                        key={path}
                        onClick={() => toggle_field(path)}
                        className={`w-full text-left p-3 rounded-xl flex items-center justify-between transition-all ${
                          is_selected ? 'bg-brand-emerald/10 text-brand-emerald border border-brand-emerald/20' : 'hover:bg-black/5 dark:hover:bg-white/5 text-text-muted border border-transparent'
                        }`}
                      >
                        <div className="flex items-center gap-3 overflow-hidden">
                          <div className={`p-1.5 rounded-lg ${is_selected ? 'bg-brand-emerald/20' : 'bg-black/10 dark:bg-white/10'}`}>
                            {is_selected ? <CheckCircle2 size={14} /> : <div className="w-[14px] h-[14px]" />}
                          </div>
                          <div className="flex flex-col min-w-0">
                            <span className={`text-xs font-mono truncate ${is_selected ? 'text-brand-emerald font-bold' : 'text-text-main'}`}>{path}</span>
                            <span className="text-[10px] text-text-muted truncate opacity-80">
                              {typeof value === 'string' ? value : JSON.stringify(value).slice(0, 40)}
                            </span>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Right: selected fields + settings */}
              <div className="w-1/2 flex flex-col bg-bg-main overflow-hidden">
                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                  <div>
                    <h3 className="text-sm font-bold text-text-main flex items-center gap-2 mb-3">
                      Selected fields <span className="px-2 py-0.5 rounded-full bg-brand-emerald/10 text-brand-emerald text-[10px]">{fields.length}</span>
                    </h3>
                    {fields.length === 0 ? (
                      <p className="text-xs text-text-muted">Pick fields from the left.</p>
                    ) : (
                      <div className="space-y-3">
                        {[...fields].sort((a, b) => a.sort_order - b.sort_order).map((field, idx, arr) => (
                          <div key={field.path} className="p-3 rounded-2xl bg-bg-card border border-border-subtle space-y-3">
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2 flex-1 min-w-0">
                                <div className="flex flex-col gap-0.5">
                                  <button
                                    onClick={() => move_field(field.path, 'up')}
                                    disabled={idx === 0}
                                    className="p-0.5 hover:text-brand-emerald disabled:opacity-20"
                                  >
                                    <ChevronDown className="rotate-180" size={12} />
                                  </button>
                                  <button
                                    onClick={() => move_field(field.path, 'down')}
                                    disabled={idx === arr.length - 1}
                                    className="p-0.5 hover:text-brand-emerald disabled:opacity-20"
                                  >
                                    <ChevronDown size={12} />
                                  </button>
                                </div>
                                <div className="flex flex-col min-w-0">
                                  <input
                                    value={field.label}
                                    onChange={(e) => update_field(field.path, { label: e.target.value })}
                                    className="bg-transparent border-none p-0 text-sm font-bold text-text-main focus:ring-0 w-full"
                                  />
                                  <span className="text-[10px] text-text-muted font-mono truncate">{field.path}</span>
                                </div>
                              </div>
                              <button
                                onClick={() => remove_field(field.path)}
                                className="p-1.5 rounded-lg text-text-muted hover:text-red-500 hover:bg-red-500/10"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                            <div className="grid grid-cols-7 gap-1">
                              {DISPLAY_OPTIONS.map(opt => (
                                <button
                                  key={opt.type}
                                  onClick={() => update_field(field.path, { display_type: opt.type })}
                                  title={opt.label}
                                  className={`flex flex-col items-center gap-0.5 p-1.5 rounded-lg border transition-all ${
                                    field.display_type === opt.type
                                      ? 'bg-black/90 dark:bg-white text-bg-main border-transparent'
                                      : 'bg-black/5 dark:bg-white/5 text-text-muted border-border-subtle hover:border-brand-emerald/50'
                                  }`}
                                >
                                  {opt.icon}
                                  <span className="text-[8px] font-bold uppercase">{opt.label}</span>
                                </button>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="border-t border-border-subtle pt-6 space-y-4">
                    <h3 className="text-sm font-bold text-text-main">Card behaviour</h3>

                    <label className="flex items-center justify-between gap-3 p-3 rounded-2xl bg-black/5 dark:bg-white/5 border border-border-subtle">
                      <div className="flex items-center gap-3">
                        <CheckCircle2 size={16} className={card_enabled ? 'text-brand-emerald' : 'text-text-muted'} />
                        <div>
                          <p className="text-sm font-bold text-text-main">Card enabled</p>
                          <p className="text-[10px] text-text-muted">Cards only render when enabled.</p>
                        </div>
                      </div>
                      <input
                        type="checkbox"
                        checked={card_enabled}
                        onChange={(e) => set_card_enabled(e.target.checked)}
                      />
                    </label>

                    <label className="flex items-center justify-between gap-3 p-3 rounded-2xl bg-black/5 dark:bg-white/5 border border-border-subtle">
                      <div className="flex items-center gap-3">
                        {quick_run ? <Zap size={16} className="text-amber-500" /> : <ZapOff size={16} className="text-text-muted" />}
                        <div>
                          <p className="text-sm font-bold text-text-main">Quick run</p>
                          <p className="text-[10px] text-text-muted">Click card → directly call default child API.</p>
                        </div>
                      </div>
                      <input
                        type="checkbox"
                        checked={quick_run}
                        onChange={(e) => set_quick_run(e.target.checked)}
                      />
                    </label>

                    <label className="flex items-center justify-between gap-3 p-3 rounded-2xl bg-black/5 dark:bg-white/5 border border-border-subtle">
                      <div className="flex items-center gap-3">
                        <Zap size={16} className={skip_action_modal ? 'text-brand-blue' : 'text-text-muted'} />
                        <div>
                          <p className="text-sm font-bold text-text-main">Skip action popup</p>
                          <p className="text-[10px] text-text-muted">
                            Card click runs the default child API directly. With <span className="font-mono">open_type=page</span> it navigates to the dedicated cards page; otherwise it inlines under the card.
                          </p>
                        </div>
                      </div>
                      <input
                        type="checkbox"
                        checked={skip_action_modal}
                        onChange={(e) => set_skip_action_modal(e.target.checked)}
                      />
                    </label>

                    <div className="space-y-2">
                      <label className="text-xs font-bold text-text-muted uppercase tracking-wider ml-1 block">Default child API</label>
                      <CommonSearchSelect
                        size="md"
                        value={default_child_api_id || null}
                        on_change={(v) => set_default_child_api_id(v ?? '')}
                        is_clearable
                        options={child_apis.map(c => ({
                          label: c.name,
                          value: c.id,
                          description: c.endpoint,
                        }))}
                        placeholder="— None —"
                        search_placeholder="Search child APIs..."
                        empty_message="No child APIs configured"
                      />
                      {child_apis.length === 0 && (
                        <p className="text-[11px] text-amber-500">No child APIs found. Create one with this API as parent first.</p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs font-bold text-text-muted uppercase tracking-wider ml-1 block">Open type</label>
                      <CommonSearchSelect
                        size="md"
                        value={open_type}
                        on_change={(v) => set_open_type((v ?? 'inline') as CardOpenTypeExtended)}
                        options={OPEN_TYPE_OPTIONS.map(o => ({ label: o, value: o }))}
                        placeholder="inline"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <label className="text-xs font-bold text-text-muted uppercase tracking-wider ml-1 block">Layout</label>
                        <CommonSearchSelect
                          size="md"
                          value={display.layout || 'grid'}
                          on_change={(v) => set_display(d => ({ ...d, layout: (v ?? 'grid') as any }))}
                          options={[
                            { label: 'grid', value: 'grid' },
                            { label: 'list', value: 'list' },
                            { label: 'table', value: 'table' },
                          ]}
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-bold text-text-muted uppercase tracking-wider ml-1 block">Card size</label>
                        <CommonSearchSelect
                          size="md"
                          value={display.card_size || 'medium'}
                          on_change={(v) => set_display(d => ({ ...d, card_size: (v ?? 'medium') as any }))}
                          options={[
                            { label: 'small', value: 'small' },
                            { label: 'medium', value: 'medium' },
                            { label: 'large', value: 'large' },
                          ]}
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-bold text-text-muted uppercase tracking-wider ml-1 block">Image fit</label>
                        <CommonSearchSelect
                          size="md"
                          value={display.image_fit || 'cover'}
                          on_change={(v) => set_display(d => ({ ...d, image_fit: (v ?? 'cover') as any }))}
                          options={[
                            { label: 'cover', value: 'cover' },
                            { label: 'contain', value: 'contain' },
                          ]}
                        />
                      </div>
                      <label className="flex items-center gap-2 mt-6 text-sm text-text-main">
                        <input
                          type="checkbox"
                          checked={display.show_labels !== false}
                          onChange={(e) => set_display(d => ({ ...d, show_labels: e.target.checked }))}
                        />
                        Show labels
                      </label>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        <div className="p-6 border-t border-border-subtle bg-black/5 dark:bg-white/5 flex justify-between items-center">
          <p className="text-xs text-text-muted">
            {fields.length} fields under <span className="font-mono">{list_path || 'root'}</span>
          </p>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-6 py-2.5 rounded-xl border border-border-subtle text-text-main font-bold hover:bg-black/5"
            >
              Cancel
            </button>
            <button
              onClick={handle_save}
              disabled={saving || no_response}
              className="btn-primary px-8 py-2.5 flex items-center gap-2 disabled:opacity-50"
            >
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              Save card
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

/**
 * Floating live-preview of the card. Reads the FIRST item out of the
 * response (using list_path) and renders the user's selected fields by their
 * display_type so they can see the real card shape before saving.
 *
 * Path lookup mirrors the runtime: `[0]` template indices in selected paths
 * map onto card_index 0 here. Hidden_id fields and is_visible=false fields
 * are skipped. If a field doesn't resolve to a value we just leave the slot
 * empty rather than fall back to placeholder text — keeps it honest.
 */
const PreviewCard: React.FC<{
  fields: DraftField[];
  response: any;
  display: CardDisplayConfig;
}> = ({ fields, response, display }) => {
  const visible = fields.filter(f => f.is_visible !== false && f.display_type !== 'hidden_id');
  const get = (path: string): any => {
    // Paths are stored like "shows[0].title". They already include the [0]
    // template — getValueByPath handles the bracket → numeric conversion.
    return getValueByPath(response, path);
  };

  const title = visible.find(f => f.display_type === 'title');
  const subtitle = visible.find(f => f.display_type === 'subtitle');
  const desc = visible.find(f => f.display_type === 'description');
  const image = visible.find(f => f.display_type === 'image');
  const badges = visible.filter(f => f.display_type === 'badge');
  const texts = visible.filter(f => f.display_type === 'text');

  const image_value = image ? get(image.path) : null;
  const has_image = typeof image_value === 'string' && image_value.length > 0;
  const fit_class = display.image_fit === 'contain' ? 'object-contain' : 'object-cover';

  return (
    // Distinct background so the preview pops against the modal body (which
    // is also bg-bg-card and was making the preview blend in). Uses bg-bg-main
    // (the page background — solid #0A0C10 on dark) plus a soft emerald wash
    // and a brand-tinted border so it visually reads as "interactive output".
    <div className="rounded-2xl bg-gradient-to-br from-bg-main via-bg-main to-brand-emerald/10 border border-brand-emerald/30 shadow-2xl shadow-brand-emerald/20 overflow-hidden">
      <div className="px-3 py-2 border-b border-brand-emerald/20 bg-gradient-to-r from-brand-emerald/15 to-brand-blue/10 flex items-center justify-between">
        <p className="text-[9px] font-bold uppercase tracking-widest text-brand-emerald">Live Preview</p>
        <p className="text-[9px] text-text-muted">first item · index 0</p>
      </div>

      {has_image && (
        <div className="aspect-video bg-black/20 relative">
          <img
            src={String(image_value)}
            alt={title ? String(get(title.path) ?? '') : 'preview'}
            className={`w-full h-full ${fit_class}`}
            referrerPolicy="no-referrer"
          />
          {badges.length > 0 && (
            <div className="absolute top-2 left-2 flex flex-wrap gap-1">
              {badges.map(b => {
                const v = get(b.path);
                if (v === null || v === undefined || v === '') return null;
                return (
                  <span key={b.path} className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-black/70 text-white">
                    {String(v)}
                  </span>
                );
              })}
            </div>
          )}
        </div>
      )}

      <div className="p-3 space-y-1.5">
        {title && (() => {
          const v = get(title.path);
          return v ? <h4 className="text-sm font-bold text-text-main line-clamp-2">{String(v)}</h4> : null;
        })()}
        {subtitle && (() => {
          const v = get(subtitle.path);
          return v ? <p className="text-xs text-text-main line-clamp-1">{String(v)}</p> : null;
        })()}
        {!has_image && badges.length > 0 && (
          <div className="flex flex-wrap gap-1 pt-1">
            {badges.map(b => {
              const v = get(b.path);
              if (v === null || v === undefined || v === '') return null;
              return (
                <span key={b.path} className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-brand-blue/15 text-brand-blue border border-brand-blue/30">
                  {String(v)}
                </span>
              );
            })}
          </div>
        )}
        {desc && (() => {
          const v = get(desc.path);
          return v ? <p className="text-[11px] text-text-muted line-clamp-2">{String(v)}</p> : null;
        })()}
        {texts.length > 0 && (
          <div className="space-y-0.5 pt-1 border-t border-border-subtle/50">
            {texts.map(t => {
              const v = get(t.path);
              if (v === null || v === undefined || v === '') return null;
              return (
                <div key={t.path} className="flex items-baseline gap-2 text-[10px]">
                  <span className="text-text-muted shrink-0">{t.label || t.path.split('.').pop()}</span>
                  <span className="text-text-main truncate">{String(v)}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default ApiCardBuilderModal;
