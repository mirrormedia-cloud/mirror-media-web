/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
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
  Eye,
  History,
  Database,
  Copy,
  X,
} from 'lucide-react';
import { ott_service } from '../../../services/ott_service';
import {
  BuiltCard,
  CardAction,
  NestedDataResponse,
  ApiNode,
} from '../../../types';
import SelectedCardsView from '../../../components/dashboard/SelectedCardsView';
import FieldSelectorModal from './steps/components/FieldSelectorModal';
import CardActionsManagerModal from './steps/components/CardActionsManagerModal';
import { replaceArrayIndexInPath } from '../../../utils/apiDataUtils';

type TabType = 'cards' | 'response' | 'actions';

interface DrawerState {
  card: BuiltCard;
  child_response: any;
  child_loading: boolean;
}

const NestedCardPage: React.FC = () => {
  const { ott_id, parent_api_id, item_key, child_api_id } = useParams<{
    ott_id: string;
    parent_api_id: string;
    item_key: string;
    child_api_id: string;
  }>();
  const [search_params] = useSearchParams();
  const navigate = useNavigate();

  const card_index = useMemo(() => {
    const v = search_params.get('card_index');
    return v ? Math.max(0, parseInt(v, 10) || 0) : 0;
  }, [search_params]);
  const source_response_id = search_params.get('source_response_id') || undefined;
  const parent_item_key_param = search_params.get('parent_item_key') || undefined;
  const decoded_item_key = item_key ? decodeURIComponent(item_key) : '';

  const [data, set_data] = useState<NestedDataResponse | null>(null);
  const [loading, set_loading] = useState(true);
  const [syncing, set_syncing] = useState(false);
  const [error_text, set_error_text] = useState<string | null>(null);
  const [active_tab, set_active_tab] = useState<TabType>('cards');
  const [grandchild_apis, set_grandchild_apis] = useState<ApiNode[]>([]);

  const [active_keys, set_active_keys] = useState<Record<string, boolean>>({});
  const [drawer, set_drawer] = useState<DrawerState | null>(null);
  const [selector_open, set_selector_open] = useState(false);
  const [actions_manager_open, set_actions_manager_open] = useState(false);
  const [saving_fields, set_saving_fields] = useState(false);

  const load = useCallback(async (force_sync = false) => {
    if (!ott_id || !parent_api_id || !item_key || !child_api_id) return;
    if (force_sync) set_syncing(true); else set_loading(true);
    set_error_text(null);
    try {
      const res = await ott_service.get_nested_data({
        ott_id,
        parent_api_id,
        item_key: decoded_item_key,
        child_api_id,
        card_index,
        source_response_id,
        parent_item_key: parent_item_key_param,
        force_sync,
      });
      if (!res.success || !res.data) throw new Error(res.message || 'Failed to load nested data');
      set_data(res.data);
    } catch (err: any) {
      set_error_text(err?.message || 'Failed to load nested data');
      toast.error(err?.message || 'Failed to load nested data');
    } finally {
      set_loading(false);
      set_syncing(false);
    }
  }, [ott_id, parent_api_id, child_api_id, decoded_item_key, item_key, card_index, source_response_id, parent_item_key_param]);

  useEffect(() => { load(false); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [load]);

  useEffect(() => {
    if (!ott_id || !child_api_id) return;
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
        set_grandchild_apis(flat.filter(n => n.parent_id === child_api_id));
      })
      .catch(() => { /* ignore — manager will just have empty child dropdown */ });
    return () => { cancelled = true; };
  }, [ott_id, child_api_id]);

  const child_api_node: ApiNode | null = useMemo(() => {
    if (!data) return null;
    const c = data.child_api;
    return {
      id: c.id,
      ott_id: ott_id ?? '',
      parent_id: parent_api_id ?? null,
      name: c.name,
      endpoint: c.endpoint,
      method: c.method as ApiNode['method'],
      request_body: null,
      param_mappings: c.param_mappings || {},
      list_path: c.list_path,
      card_config: {},
      sort_order: 0,
      status: c.status as ApiNode['status'],
      last_http_status: c.last_http_status,
      last_error: c.last_error,
      selected_fields: [],
      latest_response_summary: null,
      children: [],
      lastCalledAt: c.lastCalledAt,
      lastSyncedAt: null,
      createdAt: null,
      updatedAt: null,
    };
  }, [data, ott_id, parent_api_id]);

  const dispatch_action = async (action: CardAction, card: BuiltCard) => {
    if (!data || !ott_id) return;
    const action_key = `${action.id}:${card.item_key}`;

    if (action.action_type === 'open_detail') {
      set_drawer({ card, child_response: null, child_loading: false });
      return;
    }

    if (action.action_type === 'copy_value' && action.value_path) {
      const matched = card.fields.find(f => f.path === action.value_path);
      let value: any = matched?.value;
      if (value === undefined) {
        const indexed = replaceArrayIndexInPath(action.value_path, card.index);
        value = card.raw_item ? get_nested_value(card.raw_item, indexed) : undefined;
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
      // open_type=page: navigate to next nested level using current child as parent.
      if (action.open_type === 'page') {
        const params = new URLSearchParams();
        params.set('card_index', String(card.index));
        if (data.source_response_id) params.set('source_response_id', data.source_response_id);
        params.set('parent_item_key', decoded_item_key);
        navigate(
          `/dashboard/ott/${ott_id}/nested/${data.child_api.id}/${encodeURIComponent(card.item_key)}/${action.child_api_id}?${params.toString()}`,
        );
        return;
      }

      // open_type=drawer or modal: call inline and show in drawer.
      set_drawer({ card, child_response: null, child_loading: true });
      set_active_keys(prev => ({ ...prev, [action_key]: true }));
      try {
        const res = await ott_service.call_child_api_from_card({
          ott_id,
          child_api_id: action.child_api_id,
          parent_api_id: data.child_api.id,
          card_index: card.index,
          item_key: card.item_key,
          parent_item_key: decoded_item_key,
          source_response_id: data.source_response_id ?? undefined,
        });
        if (!res.success || !res.data) throw new Error(res.message || 'Child API failed');
        toast.success(res.message || 'Child API called successfully');
        set_drawer({ card, child_response: res.data.response, child_loading: false });
      } catch (err: any) {
        toast.error(err?.message || 'Child API failed');
        set_drawer({ card, child_response: { error: err?.message || 'Failed' }, child_loading: false });
      } finally {
        set_active_keys(prev => ({ ...prev, [action_key]: false }));
      }
    }
  };

  const handle_card_click = (card: BuiltCard) => {
    if (!data) return;
    const default_id = data.default_card_click_action_id;
    const default_action = default_id ? data.child_actions.find(a => a.id === default_id) : null;
    if (default_action) dispatch_action(default_action, card);
    else set_drawer({ card, child_response: null, child_loading: false });
  };

  const handle_save_fields = async (list_path: string, fields: any[]) => {
    if (!ott_id || !child_api_id) return;
    set_saving_fields(true);
    try {
      const res = await ott_service.save_selected_fields(ott_id, child_api_id, {
        list_path,
        selected_fields: fields.map((f, i) => ({
          path: f.path,
          label: f.label,
          display_type: f.display_type,
          sort_order: i + 1,
          is_visible: f.is_visible !== false,
        })),
      });
      if (!res.success) throw new Error(res.message || 'Failed to save fields');
      toast.success(res.message || 'Fields saved');
      set_selector_open(false);
      await load(false);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to save fields');
    } finally {
      set_saving_fields(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-32 gap-4 text-text-muted">
        <Loader2 size={36} className="animate-spin" />
        <p className="text-sm">Loading nested data…</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-12 text-center space-y-4">
        <AlertCircle size={64} className="mx-auto text-brand-orange/50" />
        <h2 className="text-2xl font-bold text-text-main">{error_text || 'Nested data not available'}</h2>
        <button onClick={() => navigate(`/dashboard/ott/${ott_id}/manage`)} className="btn-primary px-8">
          Back to OTT
        </button>
      </div>
    );
  }

  const breadcrumb_entries = data.breadcrumb || [];
  const has_list_path = !!data.child_api.list_path;
  const has_fields = data.child_cards.length > 0;
  const child_api_for_modal = child_api_node ? {
    ...child_api_node,
    list_path: data.child_api.list_path,
    selected_fields: [],
  } as ApiNode : null;

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex flex-col gap-2">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-2 text-xs font-bold text-text-muted hover:text-text-main transition-colors w-fit"
          >
            <ArrowLeft size={14} /> Back
          </button>
          <nav className="flex items-center gap-2 text-xs text-text-muted flex-wrap">
            <Link to={`/dashboard/ott/${ott_id}/manage`} className="hover:text-text-main">OTT</Link>
            <ChevronRight size={12} />
            <span className="text-text-main font-bold">{data.parent_api.name}</span>
            {breadcrumb_entries.map((b, i) => (
              <React.Fragment key={`${b.api_id}-${i}`}>
                <ChevronRight size={12} />
                <span className="font-mono">{b.item_key}</span>
              </React.Fragment>
            ))}
            <ChevronRight size={12} />
            <span className="text-brand-emerald font-bold">{data.child_api.name}</span>
          </nav>
          <h1 className="text-2xl font-black text-text-main tracking-tight">
            {data.parent_card?.fields.find(f => f.display_type === 'title')?.value
              ? String(data.parent_card.fields.find(f => f.display_type === 'title')?.value)
              : decoded_item_key}
          </h1>
          <div className="flex items-center gap-3 text-xs text-text-muted">
            <span className="font-mono">{data.child_api.method} {data.child_api.endpoint}</span>
            {data.child_resolved_endpoint && (
              <span className="text-brand-emerald">→ {data.child_resolved_endpoint}</span>
            )}
            <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${data.cached ? 'bg-amber-500/10 text-amber-500' : 'bg-emerald-500/10 text-emerald-500'}`}>
              {data.cached ? 'Cached' : 'Fresh'}
            </span>
            <span className="text-text-muted">depth {data.depth}</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => load(true)}
            disabled={syncing}
            className="flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-bg-card border border-border-subtle text-text-main font-bold hover:border-brand-emerald/50 disabled:opacity-50"
          >
            <RefreshCw size={16} className={syncing ? 'animate-spin' : ''} />
            {syncing ? 'Syncing…' : 'Sync'}
          </button>
        </div>
      </div>

      {/* Parent context card */}
      {data.parent_card && (
        <div className="p-6 rounded-3xl bg-bg-card border border-border-subtle space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-text-muted uppercase tracking-widest">Selected parent item</h3>
            <span className="text-[10px] text-text-muted">index {data.parent_card.index} · key {data.parent_card.item_key}</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {data.parent_card.fields.slice(0, 8).map(f => (
              <div key={f.path} className="space-y-0.5">
                <p className="text-[9px] font-bold text-text-muted uppercase">{f.label || f.path}</p>
                <p className="text-xs font-bold text-text-main truncate">{f.value === null || f.value === undefined ? '—' : String(f.value)}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {error_text && (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-500">
          {error_text}
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-1 p-1.5 bg-black/5 dark:bg-white/5 rounded-2xl w-fit border border-border-subtle">
        {[
          { id: 'cards', label: 'Cards', icon: <LayoutGrid size={16} />, count: data.child_cards.length },
          { id: 'response', label: 'Response JSON', icon: <Code size={16} /> },
          { id: 'actions', label: 'Actions', icon: <Layers size={16} />, count: data.child_actions.length },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => set_active_tab(tab.id as TabType)}
            className={`flex items-center gap-2 px-5 py-2 rounded-xl font-bold text-sm transition-all ${
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

      {/* Tab content */}
      {active_tab === 'cards' && (
        <div className="space-y-6">
          {!has_list_path || !has_fields ? (
            <div className="p-12 text-center space-y-4 bg-black/5 dark:bg-white/5 rounded-3xl border border-dashed border-border-subtle">
              <Eye size={48} className="mx-auto text-text-muted opacity-50" />
              <h3 className="text-lg font-bold text-text-main">
                {!has_list_path ? 'Choose a list path for this child API' : 'No fields selected'}
              </h3>
              <p className="text-sm text-text-muted max-w-md mx-auto">
                The child API returned a response but no fields are configured yet. Pick a <span className="font-mono">list_path</span> and the fields you want shown.
              </p>
              <button
                onClick={() => set_selector_open(true)}
                className="btn-primary px-8 py-3"
              >
                Choose Fields
              </button>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-end gap-2">
                <button
                  onClick={() => set_selector_open(true)}
                  className="text-xs font-bold text-text-main bg-bg-card border border-border-subtle rounded-xl px-3 py-1.5 hover:border-brand-emerald/50"
                >
                  Edit Fields
                </button>
                <button
                  onClick={() => set_actions_manager_open(true)}
                  className="text-xs font-bold text-text-main bg-bg-card border border-border-subtle rounded-xl px-3 py-1.5 hover:border-brand-emerald/50"
                >
                  Manage Card Actions
                </button>
              </div>
              <SelectedCardsView
                cards={data.child_cards}
                actions={data.child_actions}
                default_card_click_action_id={data.default_card_click_action_id}
                active_keys={active_keys}
                on_action={dispatch_action}
                on_card_click={handle_card_click}
              />
            </>
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
          <textarea
            readOnly
            value={JSON.stringify(data.child_response, null, 2)}
            className="w-full h-[600px] bg-black/90 text-brand-emerald p-6 rounded-2xl font-mono text-[10px] outline-none border border-border-subtle"
          />
        </div>
      )}

      {active_tab === 'actions' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-text-muted">
              Configure the buttons that appear on each card from <span className="font-mono">{data.child_api.name}</span>.
            </p>
            <button
              onClick={() => set_actions_manager_open(true)}
              className="btn-primary px-5 py-2 text-sm"
            >
              Open Card Actions Manager
            </button>
          </div>
          <div className="bg-bg-card rounded-3xl border border-border-subtle p-6">
            {data.child_actions.length === 0 ? (
              <p className="text-sm text-text-muted">No actions configured. Click the button above to add one.</p>
            ) : (
              <div className="space-y-2">
                {data.child_actions.map(a => (
                  <div key={a.id} className="flex items-center justify-between gap-4 p-3 rounded-xl bg-black/5 dark:bg-white/5 border border-border-subtle">
                    <div>
                      <p className="text-sm font-bold text-text-main">{a.label}</p>
                      <p className="text-[10px] text-text-muted font-mono">
                        {a.action_type}{a.open_type ? ` · ${a.open_type}` : ''}
                      </p>
                    </div>
                    <span className="text-[10px] uppercase font-bold text-text-muted">{a.button_style}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Detail drawer for inline (drawer/modal) actions */}
      <AnimatePresence>
        {drawer && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => set_drawer(null)}
              className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed top-0 right-0 h-full w-full max-w-2xl bg-bg-card z-[80] shadow-2xl border-l border-border-subtle flex flex-col"
            >
              <div className="p-6 border-b border-border-subtle flex items-center justify-between bg-black/5 dark:bg-white/5">
                <div>
                  <h3 className="font-bold text-text-main">
                    {drawer.card.fields.find(f => f.display_type === 'title')?.value
                      ? String(drawer.card.fields.find(f => f.display_type === 'title')?.value)
                      : 'Item details'}
                  </h3>
                  <p className="text-[10px] text-text-muted uppercase font-bold tracking-widest">
                    index {drawer.card.index} · key {drawer.card.item_key}
                  </p>
                </div>
                <button
                  onClick={() => set_drawer(null)}
                  className="p-2 rounded-xl hover:bg-black/5 dark:hover:bg-white/5 text-text-muted"
                >
                  <X size={24} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-8 space-y-8">
                <div className="space-y-3">
                  <h4 className="text-xs font-bold text-text-muted uppercase tracking-widest flex items-center gap-2">
                    <Database size={14} /> Bindings
                  </h4>
                  <div className="grid grid-cols-2 gap-3">
                    {drawer.card.fields.map(f => (
                      <div key={f.path} className="p-4 rounded-2xl bg-bg-main border border-border-subtle">
                        <p className="text-[9px] font-bold text-text-muted uppercase">{f.label || f.path}</p>
                        <p className="text-xs font-bold text-text-main truncate">
                          {f.value === null || f.value === undefined ? '—' : String(f.value)}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>

                {drawer.child_loading && (
                  <div className="flex items-center justify-center py-12 text-text-muted">
                    <Loader2 size={24} className="animate-spin mr-3" />
                    Calling child API…
                  </div>
                )}

                {drawer.child_response !== null && !drawer.child_loading && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <h5 className="text-[10px] font-bold text-text-muted uppercase">Response</h5>
                      <button
                        onClick={() => navigator.clipboard.writeText(JSON.stringify(drawer.child_response, null, 2))}
                        className="text-[10px] font-bold text-brand-emerald hover:underline flex items-center gap-1"
                      >
                        <Copy size={12} /> Copy
                      </button>
                    </div>
                    <textarea
                      readOnly
                      value={JSON.stringify(drawer.child_response, null, 2)}
                      className="w-full h-[400px] bg-black/90 text-brand-emerald p-6 rounded-2xl font-mono text-[10px] outline-none border border-border-subtle"
                    />
                  </div>
                )}

                <div className="space-y-3">
                  <h4 className="text-xs font-bold text-text-muted uppercase tracking-widest">Raw item</h4>
                  <textarea
                    readOnly
                    value={JSON.stringify(drawer.card.raw_item, null, 2)}
                    className="w-full h-[300px] bg-black/90 text-brand-emerald p-6 rounded-2xl font-mono text-[10px] outline-none border border-border-subtle"
                  />
                </div>
              </div>

              <div className="p-6 border-t border-border-subtle bg-black/5 dark:bg-white/5">
                <button
                  onClick={() => set_drawer(null)}
                  className="w-full py-3 rounded-xl bg-bg-card border border-border-subtle text-text-main font-bold hover:bg-black/5"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Field selector for the child API */}
      {selector_open && child_api_for_modal && (
        <FieldSelectorModal
          isOpen={true}
          onClose={() => set_selector_open(false)}
          api_node={child_api_for_modal}
          response={data.child_response}
          onSave={handle_save_fields}
          saving={saving_fields}
        />
      )}

      {/* Card actions manager for the child API */}
      {actions_manager_open && child_api_for_modal && (
        <CardActionsManagerModal
          isOpen={true}
          onClose={() => set_actions_manager_open(false)}
          ott_id={ott_id ?? ''}
          parent_api={child_api_for_modal}
          child_apis={grandchild_apis}
          parent_response={data.child_response}
          onChanged={async () => { await load(false); }}
        />
      )}
    </div>
  );
};

function get_nested_value(obj: any, path: string): any {
  if (obj === null || obj === undefined || !path) return undefined;
  const parts = path.replace(/\[(\d+)\]/g, ".$1").split(".").filter(Boolean);
  let current: any = obj;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    current = current[part];
  }
  return current;
}

export default NestedCardPage;
