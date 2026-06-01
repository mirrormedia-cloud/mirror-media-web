import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import toast from 'react-hot-toast';
import {
  X,
  Plus,
  Trash2,
  ChevronDown,
  Loader2,
  Layers,
  Eye,
  Play,
  List,
  RefreshCw,
  Copy,
  ExternalLink,
  Save,
  ChevronUp,
} from 'lucide-react';
import {
  ApiNode,
  CardAction,
  CardActionType,
  CardButtonStyle,
  CardOpenType,
  CreateCardActionPayload,
} from '../../../../../types';
import { ott_service } from '../../../../../services/ott_service';
import { CommonSearchSelect } from '../../../../../components/ui/CommonSearchSelect';
import { useConfirm } from '../../../../../components/ui/ConfirmDialog';
import {
  extract_field_paths_from_list_response,
} from '../../../../../utils/apiDataUtils';

const ACTION_TYPE_OPTIONS: { value: CardActionType; label: string }[] = [
  { value: 'open_detail', label: 'Open Detail Drawer' },
  { value: 'call_child_api', label: 'Call Child API' },
  { value: 'open_url', label: 'Open URL' },
  { value: 'copy_value', label: 'Copy Value' },
  { value: 'custom_button', label: 'Custom Button' },
];

const BUTTON_STYLE_OPTIONS: CardButtonStyle[] = ['primary', 'secondary', 'outline', 'ghost', 'danger'];
const OPEN_TYPE_OPTIONS: CardOpenType[] = ['drawer', 'page', 'modal'];
const ICON_OPTIONS = ['eye', 'play', 'list', 'sync', 'copy', 'external_link'];

const ICON_MAP: Record<string, React.ReactNode> = {
  eye: <Eye size={14} />,
  play: <Play size={14} />,
  list: <List size={14} />,
  sync: <RefreshCw size={14} />,
  copy: <Copy size={14} />,
  external_link: <ExternalLink size={14} />,
};

interface DraftAction {
  id?: string;
  label: string;
  action_type: CardActionType;
  child_api_id: string | null;
  value_path: string;
  button_style: CardButtonStyle;
  icon: string;
  open_type: CardOpenType;
  sort_order: number;
  is_default_card_click: boolean;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  ott_id: string;
  parent_api: ApiNode;
  child_apis: ApiNode[];
  parent_response: any;
  onChanged?: () => void | Promise<void>;
}

function action_to_draft(a: CardAction, default_id: string | null): DraftAction {
  return {
    id: a.id,
    label: a.label,
    action_type: a.action_type,
    child_api_id: a.child_api_id,
    value_path: a.value_path ?? '',
    button_style: a.button_style,
    icon: a.icon ?? '',
    open_type: a.open_type,
    sort_order: a.sort_order,
    is_default_card_click: !!default_id && default_id === a.id,
  };
}

function blank_draft(sort_order: number): DraftAction {
  return {
    label: '',
    action_type: 'call_child_api',
    child_api_id: null,
    value_path: '',
    button_style: 'primary',
    icon: 'eye',
    open_type: 'drawer',
    sort_order,
    is_default_card_click: false,
  };
}

const CardActionsManagerModal: React.FC<Props> = ({
  isOpen,
  onClose,
  ott_id,
  parent_api,
  child_apis,
  parent_response,
  onChanged,
}) => {
  const confirm = useConfirm();
  const [actions, set_actions] = useState<CardAction[]>([]);
  const [default_action_id, set_default_action_id] = useState<string | null>(null);
  const [loading, set_loading] = useState(false);
  const [saving, set_saving] = useState(false);

  const [editing, set_editing] = useState<DraftAction | null>(null);

  const value_path_options = useMemo(() => {
    if (!parent_response || !parent_api.list_path) return [];
    return extract_field_paths_from_list_response(parent_response, parent_api.list_path);
  }, [parent_response, parent_api.list_path]);

  const load = async () => {
    set_loading(true);
    try {
      const res = await ott_service.get_card_actions(ott_id, parent_api.id);
      if (!res.success || !res.data) throw new Error(res.message || 'Failed to load actions');
      set_actions(res.data.actions || []);
      set_default_action_id(res.data.default_card_click_action_id ?? null);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to load card actions');
    } finally {
      set_loading(false);
    }
  };

  useEffect(() => {
    if (isOpen) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, parent_api.id]);

  const handle_save = async () => {
    if (!editing) return;
    if (!editing.label || editing.label.trim().length === 0) {
      toast.error('Label is required');
      return;
    }
    if (editing.action_type === 'call_child_api' && !editing.child_api_id) {
      toast.error('Pick a child API');
      return;
    }
    if ((editing.action_type === 'copy_value' || editing.action_type === 'open_url') && !editing.value_path) {
      toast.error('value_path is required for this action type');
      return;
    }

    set_saving(true);
    try {
      const payload: CreateCardActionPayload = {
        label: editing.label.trim(),
        action_type: editing.action_type,
        child_api_id: editing.action_type === 'call_child_api' ? editing.child_api_id : null,
        value_path: editing.value_path || null,
        button_style: editing.button_style,
        icon: editing.icon || null,
        open_type: editing.open_type,
        sort_order: editing.sort_order,
        is_default_card_click: editing.is_default_card_click,
      };

      if (editing.id) {
        const res = await ott_service.update_card_action(ott_id, parent_api.id, editing.id, payload);
        if (!res.success) throw new Error(res.message || 'Failed to update action');
        toast.success('Action updated');
      } else {
        const res = await ott_service.create_card_action(ott_id, parent_api.id, payload);
        if (!res.success) throw new Error(res.message || 'Failed to create action');
        toast.success('Action created');
      }
      set_editing(null);
      await load();
      await onChanged?.();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to save action');
    } finally {
      set_saving(false);
    }
  };

  const handle_delete = async (action: CardAction) => {
    const ok = await confirm({
      title: `Delete action "${action.label}"?`,
      message: 'This cannot be undone.',
      confirm_label: 'Delete',
      danger: true,
    });
    if (!ok) return;
    try {
      const res = await ott_service.delete_card_action(ott_id, parent_api.id, action.id);
      if (!res.success) throw new Error(res.message || 'Failed to delete action');
      toast.success('Action deleted');
      await load();
      await onChanged?.();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to delete action');
    }
  };

  const handle_reorder = async (action: CardAction, direction: 'up' | 'down') => {
    const sorted = [...actions].sort((a, b) => a.sort_order - b.sort_order);
    const idx = sorted.findIndex(a => a.id === action.id);
    if (idx === -1) return;
    const target = direction === 'up' ? idx - 1 : idx + 1;
    if (target < 0 || target >= sorted.length) return;
    [sorted[idx], sorted[target]] = [sorted[target], sorted[idx]];
    try {
      await Promise.all(
        sorted.map((a, i) =>
          a.sort_order !== i
            ? ott_service.update_card_action(ott_id, parent_api.id, a.id, { sort_order: i })
            : Promise.resolve(),
        ),
      );
      await load();
      await onChanged?.();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to reorder');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        onClick={onClose}
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
      />
      <motion.div
        initial={{ scale: 0.96, opacity: 0, y: 16 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        className="relative w-full max-w-4xl max-h-[90vh] bg-bg-card border border-border-subtle rounded-3xl shadow-2xl flex flex-col overflow-hidden"
      >
        <div className="p-6 border-b border-border-subtle flex items-center justify-between bg-black/5 dark:bg-white/5">
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-2xl bg-brand-blue/10 text-brand-blue">
              <Layers size={24} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-text-main">Manage Card Actions</h2>
              <p className="text-xs text-text-muted">Buttons rendered on every card from <span className="font-mono">{parent_api.name}</span></p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-black/5 dark:hover:bg-white/5 text-text-muted transition-colors">
            <X size={24} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {loading ? (
            <div className="flex items-center justify-center py-20 text-text-muted">
              <Loader2 size={28} className="animate-spin" />
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-text-main">Configured actions ({actions.length})</h3>
                <button
                  onClick={() => set_editing(blank_draft(actions.length))}
                  className="btn-primary flex items-center gap-2 px-4 py-2 text-xs"
                >
                  <Plus size={16} />
                  Add action
                </button>
              </div>

              {actions.length === 0 ? (
                <div className="p-12 text-center bg-black/5 dark:bg-white/5 rounded-2xl border border-dashed border-border-subtle">
                  <p className="text-sm text-text-muted">No card actions configured yet.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {[...actions]
                    .sort((a, b) => a.sort_order - b.sort_order)
                    .map((a, idx, arr) => (
                      <div
                        key={a.id}
                        className={`flex items-center justify-between gap-4 p-4 rounded-2xl border ${
                          default_action_id === a.id
                            ? 'border-brand-emerald/40 bg-brand-emerald/5'
                            : 'border-border-subtle bg-black/5 dark:bg-white/5'
                        }`}
                      >
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <div className="flex flex-col gap-1">
                            <button
                              onClick={() => handle_reorder(a, 'up')}
                              disabled={idx === 0}
                              className="text-text-muted hover:text-brand-emerald disabled:opacity-20"
                            >
                              <ChevronUp size={14} />
                            </button>
                            <button
                              onClick={() => handle_reorder(a, 'down')}
                              disabled={idx === arr.length - 1}
                              className="text-text-muted hover:text-brand-emerald disabled:opacity-20"
                            >
                              <ChevronDown size={14} />
                            </button>
                          </div>
                          <div className="w-8 h-8 rounded-lg bg-bg-card border border-border-subtle flex items-center justify-center text-text-muted">
                            {a.icon && ICON_MAP[a.icon] ? ICON_MAP[a.icon] : <Layers size={14} />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-bold text-text-main truncate">{a.label}</p>
                              {default_action_id === a.id && (
                                <span className="text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded bg-brand-emerald/10 text-brand-emerald">
                                  Default click
                                </span>
                              )}
                            </div>
                            <p className="text-[10px] text-text-muted font-mono truncate">
                              {a.action_type}
                              {a.action_type === 'call_child_api' && a.child_api_id
                                ? ` → ${child_apis.find(c => c.id === a.child_api_id)?.name ?? '(unknown child)'}`
                                : ''}
                              {(a.action_type === 'copy_value' || a.action_type === 'open_url') && a.value_path
                                ? ` → ${a.value_path}`
                                : ''}
                            </p>
                          </div>
                          <span className="text-[10px] font-bold uppercase tracking-widest text-text-muted">
                            {a.button_style}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => set_editing(action_to_draft(a, default_action_id))}
                            className="px-3 py-1.5 text-xs font-bold text-text-main bg-bg-card border border-border-subtle rounded-lg hover:border-brand-emerald/50"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handle_delete(a)}
                            className="p-1.5 rounded-lg text-text-muted hover:text-red-500 hover:bg-red-500/10"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    ))}
                </div>
              )}

              {editing && (
                <div className="p-6 rounded-3xl border border-border-subtle bg-bg-main space-y-5">
                  <h3 className="text-sm font-bold text-text-main">{editing.id ? 'Edit action' : 'New action'}</h3>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-text-muted uppercase tracking-wider ml-1 block">Button label</label>
                      <input
                        type="text"
                        value={editing.label}
                        onChange={(e) => set_editing({ ...editing, label: e.target.value })}
                        // Default `.input-field` (py-3) matches the heights of
                        // the CommonSearchSelect rows next to it. The previous
                        // py-2 made this row visibly shorter than its siblings.
                        className="input-field text-sm"
                        placeholder="View Details"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs font-bold text-text-muted uppercase tracking-wider ml-1 block">Action type</label>
                      <CommonSearchSelect
                        size="md"
                        value={editing.action_type}
                        on_change={(v) => set_editing({ ...editing, action_type: (v ?? 'open_detail') as CardActionType })}
                        options={ACTION_TYPE_OPTIONS.map(o => ({ label: o.label, value: o.value }))}
                      />
                    </div>
                  </div>

                  {editing.action_type === 'call_child_api' && (
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-text-muted uppercase tracking-wider ml-1 block">Child API</label>
                      <CommonSearchSelect
                        size="md"
                        value={editing.child_api_id || null}
                        on_change={(v) => set_editing({ ...editing, child_api_id: v })}
                        is_clearable
                        options={child_apis.map(c => ({ label: c.name, value: c.id, description: c.endpoint }))}
                        placeholder="— pick a child API —"
                        search_placeholder="Search child APIs..."
                        empty_message="No child APIs registered"
                      />
                      {child_apis.length === 0 && (
                        <p className="text-[11px] text-amber-500">
                          No child APIs registered for this parent yet. Add a child API first.
                        </p>
                      )}
                    </div>
                  )}

                  {(editing.action_type === 'copy_value' || editing.action_type === 'open_url') && (
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-text-muted uppercase tracking-wider ml-1 block">
                        Value path {editing.action_type === 'copy_value' ? '(value to copy)' : '(URL to open)'}
                      </label>
                      {value_path_options.length > 0 ? (
                        <CommonSearchSelect
                          size="md"
                          value={editing.value_path || null}
                          on_change={(v) => set_editing({ ...editing, value_path: v ?? '' })}
                          is_clearable
                          options={value_path_options.map(p => ({ label: p, value: p }))}
                          placeholder="— pick a path —"
                          search_placeholder="Search paths..."
                        />
                      ) : (
                        <input
                          type="text"
                          // py-3 default matches the dropdown branch height.
                          className="input-field text-sm font-mono"
                          placeholder="data[0].slug"
                          value={editing.value_path}
                          onChange={(e) => set_editing({ ...editing, value_path: e.target.value })}
                        />
                      )}
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-text-muted uppercase tracking-wider ml-1 block">Button style</label>
                      <CommonSearchSelect
                        size="md"
                        value={editing.button_style}
                        on_change={(v) => set_editing({ ...editing, button_style: (v ?? 'primary') as CardButtonStyle })}
                        options={BUTTON_STYLE_OPTIONS.map(o => ({ label: o, value: o }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-text-muted uppercase tracking-wider ml-1 block">Icon</label>
                      <CommonSearchSelect
                        size="md"
                        value={editing.icon || null}
                        on_change={(v) => set_editing({ ...editing, icon: v ?? '' })}
                        is_clearable
                        options={ICON_OPTIONS.map(o => ({ label: o, value: o }))}
                        placeholder="— none —"
                        search_placeholder="Search icons..."
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-text-muted uppercase tracking-wider ml-1 block">Open type</label>
                      <CommonSearchSelect
                        size="md"
                        value={editing.open_type}
                        on_change={(v) => set_editing({ ...editing, open_type: (v ?? 'inline') as CardOpenType })}
                        options={OPEN_TYPE_OPTIONS.map(o => ({ label: o, value: o }))}
                      />
                    </div>
                  </div>

                  <label className="flex items-center gap-2 text-sm text-text-main">
                    <input
                      type="checkbox"
                      checked={editing.is_default_card_click}
                      onChange={(e) => set_editing({ ...editing, is_default_card_click: e.target.checked })}
                    />
                    Set as default card click action
                  </label>

                  <div className="flex gap-3">
                    <button
                      onClick={() => set_editing(null)}
                      className="flex-1 py-2.5 rounded-xl bg-black/5 dark:bg-white/5 text-text-main font-bold text-sm hover:bg-black/10 dark:hover:bg-white/10"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handle_save}
                      disabled={saving}
                      className="flex-1 btn-primary py-2.5 flex items-center justify-center gap-2 text-sm disabled:opacity-50"
                    >
                      {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                      {editing.id ? 'Save changes' : 'Create action'}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </motion.div>
    </div>
  );
};

export default CardActionsManagerModal;
