import React, { useMemo, useState } from 'react';
import { ApiNode, OttPlatformDetail } from '../../../../types';
import {
  Plus,
  Settings as SettingsIcon,
  Trash2,
  GitBranch,
  Eye,
  CheckCircle2,
  Zap,
  Loader2,
  Database,
  Layers,
  LayoutGrid,
} from 'lucide-react';
import toast from 'react-hot-toast';
import ApiFormModal, { ApiFormPayload } from './components/ApiFormModal';
import ResponseViewerModal from './components/ResponseViewerModal';
import ApiItemPreview from './components/ApiItemPreview';
import FieldSelectorModal from './components/FieldSelectorModal';
import CardActionsManagerModal from './components/CardActionsManagerModal';
import ApiCardBuilderModal from './components/ApiCardBuilderModal';
import { ott_service } from '../../../../services/ott_service';
import { useConfirm } from '../../../../components/ui/ConfirmDialog';

interface Props {
  ott: OttPlatformDetail;
  onTreeChanged: () => Promise<void> | void;
  onLogsChanged?: () => void;
}

const ApiTreeManagementStep: React.FC<Props> = ({ ott, onTreeChanged, onLogsChanged }) => {
  const confirm = useConfirm();
  const [is_modal_open, setModalOpen] = useState(false);
  const [editing_api, setEditingApi] = useState<ApiNode | null>(null);
  const [selected_parent_id, setSelectedParentId] = useState<string | null>(null);

  const [is_response_open, setResponseOpen] = useState(false);
  const [is_selector_open, setSelectorOpen] = useState(false);
  const [viewing_api, setViewingApi] = useState<ApiNode | null>(null);
  const [viewing_response, setViewingResponse] = useState<any>(null);

  const [actions_manager, setActionsManager] = useState<{ node: ApiNode; response: any } | null>(null);
  const [card_builder_for, setCardBuilderFor] = useState<ApiNode | null>(null);

  const [busy_node_ids, setBusyNodeIds] = useState<Record<string, boolean>>({});
  const [saving_modal, setSavingModal] = useState(false);
  const [saving_fields, setSavingFields] = useState(false);
  const [error_text, setErrorText] = useState<string | null>(null);
  const [preview_token, setPreviewToken] = useState(0);

  const tree = ott.api_tree || [];

  const handle_add_root = () => {
    setEditingApi(null);
    setSelectedParentId(null);
    setModalOpen(true);
  };

  const handle_add_child = (parent_id: string) => {
    setEditingApi(null);
    setSelectedParentId(parent_id);
    setModalOpen(true);
  };

  const handle_edit = (node: ApiNode) => {
    setEditingApi(node);
    setSelectedParentId(node.parent_id);
    setModalOpen(true);
  };

  const handle_save_api = async (payload: ApiFormPayload) => {
    setSavingModal(true);
    setErrorText(null);
    try {
      if (editing_api) {
        const res = await ott_service.update_api_node(ott.id, editing_api.id, {
          parent_id: payload.parent_id ?? null,
          name: payload.name,
          endpoint: payload.endpoint,
          method: payload.method,
          param_mappings: payload.param_mappings,
          ...(payload.request_body !== undefined ? { request_body: payload.request_body } : {}),
          pagination_enabled: payload.pagination_enabled,
          pagination_type: payload.pagination_type,
          pagination_config: payload.pagination_config,
          body_mode: payload.body_mode,
          request_body_config: payload.request_body_config,
        });
        if (!res.success) throw new Error(res.message || 'Failed to update API node');
        toast.success(res.message || 'API node updated');
      } else {
        const create_payload: any = {
          parent_id: payload.parent_id ?? null,
          name: payload.name,
          endpoint: payload.endpoint,
          method: payload.method,
          param_mappings: payload.param_mappings,
          pagination_enabled: payload.pagination_enabled,
          pagination_type: payload.pagination_type,
          pagination_config: payload.pagination_config,
          body_mode: payload.body_mode,
          request_body_config: payload.request_body_config,
        };
        if (payload.request_body !== undefined && payload.request_body !== null) {
          create_payload.request_body = payload.request_body;
        }
        const res = await ott_service.create_api_node(ott.id, create_payload);
        if (!res.success) throw new Error(res.message || 'Failed to create API node');
        toast.success(res.message || 'API added successfully');
      }
      setModalOpen(false);
      await onTreeChanged();
    } catch (err: any) {
      setErrorText(err?.message || 'Failed to save API node');
      toast.error(err?.message || 'Failed to save API node');
    } finally {
      setSavingModal(false);
    }
  };

  const handle_delete = async (node: ApiNode) => {
    const ok = await confirm({
      title: `Delete API "${node.name}"?`,
      message: 'All child APIs and their data will also be removed.',
      confirm_label: 'Delete',
      danger: true,
    });
    if (!ok) return;
    try {
      const res = await ott_service.delete_api_node(ott.id, node.id);
      if (!res.success) throw new Error(res.message || 'Failed to delete API node');
      toast.success(res.message || 'API deleted');
      await onTreeChanged();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to delete API node');
    }
  };

  /**
   * Sample-call a CHILD API. Child APIs can't be called directly from the tree
   * because they need a parent context (a card_index to resolve their endpoint
   * variables against). `sample_call` auto-picks the parent's first card and
   * runs call_from_card under the hood — perfect for testing a child API in
   * isolation or seeding its response so the card builder has fields to show.
   */
  const handle_sample_call = async (node: ApiNode) => {
    setBusyNodeIds(prev => ({ ...prev, [node.id]: true }));
    setErrorText(null);
    try {
      const res = await ott_service.sample_call_api(ott.id, node.id);
      if (!res.success || !res.data) throw new Error(res.message || 'Sample call failed');
      const result = res.data;
      onLogsChanged?.();
      if (!result.success) {
        toast.error(result.error_message || `Sample call failed (HTTP ${result.http_status ?? 'ERR'})`);
      } else {
        toast.success(
          result.source === 'child'
            ? `Called child via parent "${result.parent_api_name ?? '?'}" (first card)`
            : 'API called successfully',
        );
      }
      await onTreeChanged();
      // Open the field picker if no selected_fields yet — same auto-flow as
      // the root Call API button so users can immediately configure cards.
      if (result.success && (node.selected_fields || []).length === 0) {
        setViewingApi({ ...node, status: 'success' });
        setViewingResponse(result.response);
        setSelectorOpen(true);
      }
    } catch (err: any) {
      toast.error(err?.message || 'Sample call failed');
    } finally {
      setBusyNodeIds(prev => ({ ...prev, [node.id]: false }));
    }
  };

  const handle_call = async (node: ApiNode, options: { fetch_all_pages?: boolean } = {}) => {
    setBusyNodeIds(prev => ({ ...prev, [node.id]: true }));
    setErrorText(null);
    try {
      const res = await ott_service.call_api_node(ott.id, node.id, options);
      if (!res.success || !res.data) throw new Error(res.message || 'API call failed');
      const result = res.data;
      onLogsChanged?.();
      if (!result.success) {
        toast.error(result.error_message || `API call failed (HTTP ${result.http_status ?? 'ERR'})`);
      } else if (options.fetch_all_pages && result.pagination) {
        // Surface the pagination summary so the user sees how many pages were
        // fetched and why we stopped (without having to open Debug Console).
        const { pages_fetched, total_items, stop_reason } = result.pagination;
        toast.success(
          `Fetched ${pages_fetched} page(s) — ${total_items} item(s) (stop: ${stop_reason})`,
          { duration: 5000 },
        );
      } else {
        toast.success(res.message || 'API called successfully');
      }
      await onTreeChanged();
      if (result.success && (node.selected_fields || []).length === 0) {
        setViewingApi({ ...node, status: 'success' });
        setViewingResponse(result.response);
        setSelectorOpen(true);
      }
    } catch (err: any) {
      toast.error(err?.message || 'Failed to call API');
    } finally {
      setBusyNodeIds(prev => ({ ...prev, [node.id]: false }));
    }
  };

  const open_response_viewer = async (node: ApiNode) => {
    try {
      const res = await ott_service.get_api_response(ott.id, node.id);
      if (!res.success) throw new Error(res.message || 'Failed to load response');
      setViewingApi(node);
      setViewingResponse(res.data?.response ?? null);
      setResponseOpen(true);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to load response');
    }
  };

  const open_field_selector = async (node: ApiNode) => {
    try {
      const res = await ott_service.get_api_response(ott.id, node.id);
      if (!res.success) throw new Error(res.message || 'Failed to load response');
      setViewingApi(node);
      setViewingResponse(res.data?.response ?? null);
      setSelectorOpen(true);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to load response');
    }
  };

  const handle_save_fields = async (list_path: string, fields: Array<any>) => {
    if (!viewing_api) return;
    setSavingFields(true);
    try {
      const res = await ott_service.save_selected_fields(ott.id, viewing_api.id, {
        list_path,
        selected_fields: fields.map((f, i) => ({
          path: f.path,
          label: f.label,
          display_type: f.display_type,
          sort_order: i + 1,
          is_visible: f.is_visible !== false,
        })),
      });
      if (!res.success) throw new Error(res.message || 'Failed to save selected fields');
      toast.success(res.message || 'Selected fields saved');
      setSelectorOpen(false);
      setPreviewToken(t => t + 1);
      await onTreeChanged();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to save selected fields');
    } finally {
      setSavingFields(false);
    }
  };

  const flat_apis = useMemo(() => {
    const out: ApiNode[] = [];
    const visit = (nodes: ApiNode[]) => {
      for (const n of nodes) {
        out.push(n);
        if (n.children?.length) visit(n.children);
      }
    };
    visit(tree);
    return out;
  }, [tree]);

  const render_tree = (nodes: ApiNode[], depth = 0) => (
    <div className={`space-y-4 ${depth > 0 ? 'ml-10 border-l border-border-subtle pl-6 pt-2 pb-4 relative' : ''}`}>
      {depth > 0 && <div className="absolute top-8 left-0 w-6 h-px bg-border-subtle" />}
      {nodes.map(node => {
        const busy = busy_node_ids[node.id];
        return (
          <div key={node.id} className="space-y-4">
            <div className="glass-card p-4 hover:border-brand-emerald/30 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4 group">
              <div className="flex items-center gap-4">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${
                  node.status === 'success' ? 'bg-emerald-500/10 text-emerald-500 shadow-lg shadow-emerald-500/10' :
                  node.status === 'failed' ? 'bg-red-500/10 text-red-500' :
                  busy ? 'bg-amber-500/10 text-amber-500 animate-pulse' :
                  'bg-black/5 dark:bg-white/5 text-text-muted border border-border-subtle'
                }`}>
                  {node.status === 'success' ? <CheckCircle2 size={20} /> : <SettingsIcon size={20} />}
                </div>
                <div>
                  <h4 className="text-sm font-bold text-text-main flex items-center gap-2 flex-wrap">
                    {node.name}
                    {node.status === 'success' && (
                      <span className="text-[9px] font-bold text-emerald-500 uppercase tracking-widest px-1.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20">
                        Connected
                      </span>
                    )}
                    {node.pagination_enabled && (
                      <span
                        className="text-[9px] font-bold text-brand-blue uppercase tracking-widest px-1.5 py-0.5 rounded-full bg-brand-blue/10 border border-brand-blue/20 flex items-center gap-1"
                        title={`Pagination: ${node.pagination_type}${node.pagination_config?.limit_value ? ` · limit ${node.pagination_config.limit_value}` : ''} · max ${node.pagination_config?.max_pages ?? 50}`}
                      >
                        <Layers size={10} /> {node.pagination_type ?? 'paginated'}
                      </span>
                    )}
                  </h4>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[10px] font-bold text-brand-emerald uppercase px-1.5 py-0.5 rounded bg-brand-emerald/10">
                      {node.method}
                    </span>
                    <span className="text-xs text-text-muted font-mono">{node.endpoint}</span>
                  </div>
                </div>
              </div>

              {/* Action buttons stay visible at all viewport sizes — the
                  hover-to-reveal pattern was hiding important controls (Call
                  API, Create Card, etc.) until users discovered they had to
                  hover. Always-visible is more discoverable. */}
              <div className="flex items-center gap-2 flex-wrap">
                {!node.parent_id && (
                  <button
                    onClick={() => handle_call(node)}
                    disabled={busy}
                    className="btn-primary flex items-center gap-2 px-4 py-2 text-xs shadow-none disabled:opacity-50"
                    title={node.pagination_enabled ? 'Call this API (first page only)' : 'Call this API now'}
                  >
                    {busy ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} fill="currentColor" />}
                    {node.pagination_enabled ? 'Call First Page' : 'Call API'}
                  </button>
                )}
                {!node.parent_id && node.pagination_enabled && node.pagination_type && (
                  <button
                    onClick={() => handle_call(node, { fetch_all_pages: true })}
                    disabled={busy}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-brand-blue/10 text-brand-blue border border-brand-blue/30 hover:bg-brand-blue/20 disabled:opacity-50"
                    title={`Fetch up to ${node.pagination_config?.max_pages ?? 50} pages and merge into one response`}
                  >
                    {busy ? <Loader2 size={14} className="animate-spin" /> : <Layers size={14} />}
                    Call All Pages
                  </button>
                )}

                {/* Child APIs: Sample Call uses the parent's first card to
                    resolve endpoint variables and run call_from_card. */}
                {node.parent_id && (
                  <button
                    onClick={() => handle_sample_call(node)}
                    disabled={busy}
                    className="btn-primary flex items-center gap-2 px-4 py-2 text-xs shadow-none disabled:opacity-50"
                    title="Call this child API using the parent's first card"
                  >
                    {busy ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} fill="currentColor" />}
                    Sample Call
                  </button>
                )}

                {/* Create Card — available on every node, always */}
                <button
                  onClick={() => setCardBuilderFor(node)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                    node.card_enabled
                      ? 'bg-brand-emerald/10 text-brand-emerald border border-brand-emerald/30 hover:bg-brand-emerald/20'
                      : 'bg-brand-emerald text-white shadow-lg shadow-brand-emerald/20 hover:scale-105'
                  }`}
                  title={node.card_enabled ? 'Edit card config' : 'Configure card'}
                >
                  <LayoutGrid size={14} />
                  {node.card_enabled ? 'Edit Card' : 'Create Card'}
                  {node.quick_run && (
                    <span className="text-[8px] font-bold uppercase px-1 py-0.5 rounded bg-amber-500/20 text-amber-600 dark:text-amber-300">quick</span>
                  )}
                </button>

                <button
                  onClick={() => open_field_selector(node)}
                  className="p-2.5 rounded-xl bg-black/5 dark:bg-white/5 text-text-muted hover:text-text-main border border-border-subtle"
                  title="Quick field picker"
                >
                  <Eye size={14} />
                </button>

                <button
                  onClick={() => handle_add_child(node.id)}
                  className="p-2.5 rounded-xl bg-brand-blue/10 text-brand-blue hover:bg-brand-blue/20"
                  title="Add child API"
                >
                  <GitBranch size={14} />
                </button>

                {node.card_enabled && (
                  <button
                    onClick={async () => {
                      const res = await ott_service.get_api_response(ott.id, node.id);
                      const response_data = res.success && res.data ? res.data.response : null;
                      setActionsManager({ node, response: response_data });
                    }}
                    className="p-2.5 rounded-xl bg-black/5 dark:bg-white/5 text-text-muted hover:text-brand-emerald border border-border-subtle"
                    title="Manage card actions"
                  >
                    <Layers size={14} />
                  </button>
                )}

                {!node.parent_id && node.status === 'success' && (
                  <button
                    onClick={() => handle_call(node)}
                    disabled={busy}
                    className="p-2.5 rounded-xl bg-black/5 dark:bg-white/5 text-text-muted hover:text-text-main border border-border-subtle"
                    title="Re-call API"
                  >
                    {busy ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
                  </button>
                )}
                <button
                  onClick={() => open_response_viewer(node)}
                  className="p-2.5 rounded-xl bg-black/5 dark:bg-white/5 text-text-muted hover:text-text-main transition-colors border border-border-subtle"
                  title="View saved response"
                >
                  <Database size={16} />
                </button>
                <button
                  onClick={() => handle_edit(node)}
                  className="p-2.5 rounded-xl bg-black/5 dark:bg-white/5 text-text-muted hover:text-text-main transition-colors border border-border-subtle"
                >
                  <SettingsIcon size={16} />
                </button>
                <button
                  onClick={() => handle_delete(node)}
                  className="p-2.5 rounded-xl bg-black/5 dark:bg-white/5 text-text-muted hover:text-red-500 transition-colors border border-border-subtle"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>

            {(node.selected_fields || []).length > 0 && node.list_path && !node.parent_id && (
              <div className="ml-10">
                <ApiItemPreview
                  api={node}
                  ott_id={ott.id}
                  refresh_token={preview_token}
                />
              </div>
            )}

            {(node.children || []).length > 0 && render_tree(node.children!, depth + 1)}
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="space-y-8 pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 px-6 pt-6">
        <div>
          <h2 className="text-xl font-bold text-text-main uppercase tracking-tight">API Architecture</h2>
          <p className="text-text-muted text-sm text-left">Connect and map your OTT endpoints. Calls hit the backend proxy.</p>
        </div>
        <button
          onClick={handle_add_root}
          className="btn-primary flex items-center justify-center gap-3 px-6 py-3"
        >
          <Plus size={20} />
          Register Entry API
        </button>
      </div>

      {error_text && (
        <div className="mx-6 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-500">
          {error_text}
        </div>
      )}

      <div className="px-6">
        <div className="flex-1 w-full glass-card bg-bg-aside/50 p-8 min-h-[500px] relative overflow-hidden text-left border-border-subtle/50">
          <div className="absolute top-0 right-0 p-8 opacity-5">
            <GitBranch size={200} />
          </div>

          {tree.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center gap-6 mt-16 pb-16">
              <div className="w-24 h-24 rounded-[32px] bg-black/5 dark:bg-white/5 flex items-center justify-center text-text-muted border-2 border-dashed border-border-subtle">
                <Zap size={48} className="opacity-20" />
              </div>
              <div className="text-center max-w-sm">
                <h3 className="text-xl font-bold text-text-main">Blueprint is empty</h3>
                <p className="text-sm text-text-muted mt-2">Register your home or browse API. We'll help you map the response and create child connections.</p>
              </div>
              <button onClick={handle_add_root} className="btn-primary px-10 py-3.5 shadow-xl shadow-brand-emerald/20">Register First API</button>
            </div>
          ) : (
            render_tree(tree)
          )}
        </div>
      </div>

      <ApiFormModal
        isOpen={is_modal_open}
        onClose={() => setModalOpen(false)}
        onSave={handle_save_api}
        editing_api={editing_api}
        initial_parent_id={selected_parent_id}
        available_apis={flat_apis}
        ott_id={ott.id}
        saving={saving_modal}
      />

      <ResponseViewerModal
        isOpen={is_response_open}
        onClose={() => setResponseOpen(false)}
        api_node={viewing_api}
        response={viewing_response}
        onPickFields={() => { setResponseOpen(false); setSelectorOpen(true); }}
      />

      {viewing_api && (
        <FieldSelectorModal
          isOpen={is_selector_open}
          onClose={() => setSelectorOpen(false)}
          api_node={viewing_api}
          response={viewing_response}
          onSave={handle_save_fields}
          saving={saving_fields}
        />
      )}

      {actions_manager && (
        <CardActionsManagerModal
          isOpen={true}
          onClose={() => setActionsManager(null)}
          ott_id={ott.id}
          parent_api={actions_manager.node}
          child_apis={actions_manager.node.children || []}
          parent_response={actions_manager.response}
          onChanged={async () => { setPreviewToken(t => t + 1); await onTreeChanged(); }}
        />
      )}

      {card_builder_for && (
        <ApiCardBuilderModal
          isOpen={true}
          onClose={() => setCardBuilderFor(null)}
          ott_id={ott.id}
          api_node={card_builder_for}
          child_apis={card_builder_for.children || []}
          onSaved={async () => { setPreviewToken(t => t + 1); await onTreeChanged(); }}
        />
      )}
    </div>
  );
};

export default ApiTreeManagementStep;
