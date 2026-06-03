/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import toast from 'react-hot-toast';
import {
  Image as ImageIcon,
  Layers,
  Loader2,
  Settings,
  Code,
  Plus,
  Play,
  Eye,
  Copy,
  ExternalLink,
  RefreshCw,
  Save,
  CheckCircle2,
  Download,
} from 'lucide-react';
import { ApiNode, BuiltCard, CardAction, CardButtonStyle } from '../../types';
import { ott_service } from '../../services/ott_service';

export type ChildContext = {
  api_node: ApiNode;
  cards: BuiltCard[];
  card_enabled: boolean;
  source_response_id: string | null;
  raw_response: any;
};

/** Top-level expansion key: <api_node_id>__<item_key>__<child_api_id>. */
export type ExpandedMap = Record<string, ChildContext>;

const ICON_MAP: Record<string, React.ReactNode> = {
  eye: <Eye size={14} />,
  play: <Play size={14} />,
  list: <Layers size={14} />,
  sync: <RefreshCw size={14} />,
  copy: <Copy size={14} />,
  external_link: <ExternalLink size={14} />,
};

const STYLE_MAP: Record<CardButtonStyle, string> = {
  primary: 'bg-brand-emerald text-white hover:scale-105 shadow-md',
  secondary: 'bg-bg-card border border-border-subtle text-text-main hover:border-brand-emerald/50',
  outline: 'border border-brand-emerald text-brand-emerald hover:bg-brand-emerald/10',
  ghost: 'bg-white/10 text-white backdrop-blur-md hover:bg-white/20',
  danger: 'bg-red-500 text-white hover:bg-red-600 shadow-md',
};

interface Props {
  ott_id: string;
  api_node: ApiNode;
  cards: BuiltCard[];
  /** Configured card actions for `api_node` (from /cards or /card_actions). */
  actions?: CardAction[];
  /** Map: api_node_id → its children. */
  children_by_parent: Map<string, ApiNode[]>;
  /** All API nodes flat. */
  all_apis: ApiNode[];
  /** Source response id to pass to call_from_card (for nested levels). */
  source_response_id?: string | null;
  /** Parent item key to pass to call_from_card (for nested levels). */
  parent_item_key?: string | null;
  depth?: number;
  max_depth?: number;
  /** Hoisted expansion state — allows the page to inline-expand from popup or actions. */
  expanded: ExpandedMap;
  set_expanded: React.Dispatch<React.SetStateAction<ExpandedMap>>;
  on_open_popup: (args: {
    api_node: ApiNode;
    card: BuiltCard;
    source_response_id: string | null | undefined;
    parent_item_key: string | null | undefined;
  }) => void;
  on_open_card_builder: (args: {
    api_node: ApiNode;
    sample_response?: any;
    source_response_id?: string;
  }) => void;
  /** Called for action buttons (run_show_cards, copy_value, open_url, etc.) configured via card_actions. */
  on_card_action: (args: {
    api_node: ApiNode;
    card: BuiltCard;
    action: CardAction;
    source_response_id: string | null | undefined;
    parent_item_key: string | null | undefined;
    expansion_key: string;
  }) => void;
  /** Per-action busy keys, format `${action_id}:${item_key}`. */
  busy_action_keys?: Record<string, boolean>;

  /**
   * If provided, each card renders a "Save to Library" icon button that calls this
   * with the clicked card. The page is expected to use the api_node's saved
   * capture_mapping to extract URLs and push to the library in one call.
   */
  on_save_card_to_library?: (card: BuiltCard) => void;
  /** Indices of cards currently being saved (for spinner state). */
  saving_card_indices?: Set<number>;
  /**
   * If provided, each card shows a multi-select checkbox. The Set holds card.index values.
   */
  selected_card_indices?: Set<number>;
  on_toggle_card_select?: (card: BuiltCard) => void;
  /** Show "Saved" badge on cards that already exist in the library. */
  saved_to_library_indices?: Set<number>;
  /** If provided, renders a per-card download button that calls this when clicked. */
  on_download_card?: (card: BuiltCard) => void;
  /** Per-card download states. Key = `${api_node_id}:${item_key}`. */
  card_download_states?: Map<string, 'idle' | 'downloading' | 'done'>;
}

const expansion_key_for = (api_id: string, item_key: string, child_api_id: string) =>
  `${api_id}__${item_key}__${child_api_id}`;

const NestedCardRenderer: React.FC<Props> = ({
  ott_id,
  api_node,
  cards,
  actions = [],
  children_by_parent,
  all_apis,
  source_response_id = null,
  parent_item_key = null,
  depth = 0,
  max_depth = 6,
  expanded,
  set_expanded,
  on_open_popup,
  on_open_card_builder,
  on_card_action,
  busy_action_keys = {},
  on_save_card_to_library,
  saving_card_indices,
  selected_card_indices,
  on_toggle_card_select,
  saved_to_library_indices,
  on_download_card,
  card_download_states,
}) => {
  const [busy_default_keys, set_busy_default_keys] = useState<Record<string, boolean>>({});

  const child_apis = useMemo(
    () => children_by_parent.get(api_node.id) || [],
    [children_by_parent, api_node.id],
  );

  const default_child = useMemo(() => {
    if (!api_node.default_child_api_id) return null;
    return child_apis.find(c => c.id === api_node.default_child_api_id) ?? null;
  }, [api_node.default_child_api_id, child_apis]);

  const sorted_actions = useMemo(
    () => [...actions].filter(a => a.is_active !== false).sort((a, b) => a.sort_order - b.sort_order),
    [actions],
  );

  const default_action = useMemo(() => {
    if (!api_node.default_card_action_id) return null;
    return sorted_actions.find(a => a.id === api_node.default_card_action_id) ?? null;
  }, [api_node.default_card_action_id, sorted_actions]);

  const handle_card_click = async (card: BuiltCard) => {
    // skip_action_modal: never open popup — execute the configured default action.
    if (api_node.skip_action_modal) {
      if (default_action) {
        on_card_action({
          api_node,
          card,
          action: default_action,
          source_response_id,
          parent_item_key,
          expansion_key: default_action.action_type === 'call_child_api' && default_action.child_api_id
            ? `${api_node.id}__${card.item_key}__${default_action.child_api_id}`
            : `${default_action.id}__${card.item_key}`,
        });
        return;
      }
      if (default_child) {
        await run_default_child_inline(card, default_child);
        return;
      }
    }

    // quick_run: directly call the default child API and inline its cards.
    if (api_node.quick_run && default_child) {
      await run_default_child_inline(card, default_child);
      return;
    }
    on_open_popup({ api_node, card, source_response_id, parent_item_key });
  };

  const run_default_child_inline = async (card: BuiltCard, child_api: ApiNode) => {
    if (depth >= max_depth) {
      toast.error(`Reached max nesting depth (${max_depth})`);
      return;
    }
    const key = expansion_key_for(api_node.id, card.item_key, child_api.id);
    set_busy_default_keys(prev => ({ ...prev, [key]: true }));
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
      const updated_child_node = all_apis.find(a => a.id === child_api.id) ?? child_api;
      set_expanded(prev => ({
        ...prev,
        [key]: {
          api_node: updated_child_node,
          cards: (res.data!.cards.cards as BuiltCard[]) ?? [],
          card_enabled: res.data!.cards.card_enabled,
          source_response_id: res.data!.response_id ?? res.data!.source_response_id,
          raw_response: res.data!.response,
        },
      }));
    } catch (err: any) {
      toast.error(err?.message || 'Child API failed');
    } finally {
      set_busy_default_keys(prev => ({ ...prev, [key]: false }));
    }
  };

  const collapse_expansion = (key: string) => {
    set_expanded(prev => {
      const n = { ...prev };
      delete n[key];
      return n;
    });
  };

  return (
    <div className="space-y-6">
      {cards.length === 0 ? (
        <div className="p-12 text-center text-text-muted bg-black/5 dark:bg-white/5 rounded-3xl border border-dashed border-border-subtle">
          <p className="text-sm">No cards to display.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {cards.map((card, idx) => {
            const title = card.fields.find(f => f.display_type === 'title')?.value;
            const subtitle = card.fields.find(f => f.display_type === 'subtitle')?.value;
            const image = card.fields.find(f => f.display_type === 'image')?.value;
            const description = card.fields.find(f => f.display_type === 'description')?.value;
            const badges = card.fields.filter(f => f.display_type === 'badge');
            const text_fields = card.fields.filter(f => f.display_type === 'text');
            const default_busy = default_child
              ? busy_default_keys[expansion_key_for(api_node.id, card.item_key, default_child.id)]
              : false;

            // Find expansion children for this card (any child api).
            const card_expansions: [string, ChildContext][] = Object.entries(expanded).filter(([k]) =>
              k.startsWith(`${api_node.id}__${card.item_key}__`),
            ) as [string, ChildContext][];

            return (
              <React.Fragment key={`${card.item_key}-${idx}`}>
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.03 }}
                  className="group flex flex-col bg-bg-card rounded-3xl border border-border-subtle overflow-hidden hover:shadow-xl hover:shadow-black/5 transition-all relative"
                >
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      on_open_popup({ api_node, card, source_response_id, parent_item_key });
                    }}
                    title="Card actions"
                    className="absolute top-3 right-3 z-10 p-1.5 rounded-lg bg-black/40 backdrop-blur-md text-white opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <Settings size={14} />
                  </button>

                  {/* Top-left: multi-select checkbox (only when selection callbacks are provided) */}
                  {on_toggle_card_select && (
                    <label
                      onClick={(e) => e.stopPropagation()}
                      className="absolute top-3 left-3 z-10 flex items-center gap-1.5 px-2 py-1 rounded-lg cursor-pointer select-none"
                      title="Select for bulk save"
                    >
                      <input
                        type="checkbox"
                        checked={selected_card_indices?.has(card.index) ?? false}
                        onChange={() => on_toggle_card_select(card)}
                        className="cursor-pointer accent-brand-emerald"
                      />
                    </label>
                  )}

                  {/* Below the gear: per-card "Save to Library" icon */}
                  {on_save_card_to_library && (() => {
                    const is_saved = saved_to_library_indices?.has(card.index);
                    const is_busy = saving_card_indices?.has(card.index);
                    return (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (!is_busy && !is_saved) on_save_card_to_library(card);
                        }}
                        disabled={is_busy || is_saved}
                        title={is_saved ? 'Already in Library' : is_busy ? 'Saving…' : 'Save to Local Library'}
                        className={`absolute top-12 right-3 z-10 p-1.5 rounded-lg backdrop-blur-md transition-opacity ${
                          is_saved
                            ? 'bg-brand-emerald/80 text-white opacity-100'
                            : is_busy
                              ? 'bg-amber-500/80 text-white opacity-100'
                              : 'bg-black/40 text-white opacity-0 group-hover:opacity-100'
                        } disabled:cursor-default`}
                      >
                        {is_saved ? <CheckCircle2 size={14} /> : is_busy ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                      </button>
                    );
                  })()}

                  <div onClick={() => handle_card_click(card)} className="cursor-pointer">
                    <div className="aspect-[16/9] relative bg-black/20 overflow-hidden">
                      {image ? (
                        <img
                          src={String(image)}
                          alt={String(title ?? 'item')}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-text-muted">
                          <ImageIcon size={32} />
                        </div>
                      )}
                      {badges.length > 0 && (
                        <div className="absolute top-3 left-3 flex flex-wrap gap-1.5 leading-none">
                          {badges.map((b, i) =>
                            b.value ? (
                              <span key={`${b.path}-${i}`} className="text-[10px] font-bold px-2 py-1 rounded-lg bg-black/60 backdrop-blur-md text-white uppercase tracking-wider">
                                {String(b.value)}
                              </span>
                            ) : null,
                          )}
                        </div>
                      )}
                      {default_busy && (
                        <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                          <Loader2 size={32} className="animate-spin text-brand-emerald" />
                        </div>
                      )}
                      {/* Per-card download button — bottom-right of image */}
                      {on_download_card && (() => {
                        const dl_status = card_download_states?.get(`${api_node.id}:${card.item_key}`) ?? 'idle';
                        return (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (dl_status === 'idle') on_download_card(card);
                            }}
                            disabled={dl_status === 'downloading'}
                            title={
                              dl_status === 'done'
                                ? 'Episodes downloaded'
                                : dl_status === 'downloading'
                                  ? 'Downloading episodes…'
                                  : 'Download all episodes'
                            }
                            className={`absolute bottom-3 right-3 z-10 p-1.5 rounded-lg backdrop-blur-md transition-all disabled:cursor-default ${
                              dl_status === 'done'
                                ? 'bg-brand-emerald/80 text-white opacity-100'
                                : dl_status === 'downloading'
                                  ? 'bg-amber-500/80 text-white opacity-100'
                                  : 'bg-black/40 text-white opacity-50 hover:opacity-100'
                            }`}
                          >
                            {dl_status === 'done'
                              ? <CheckCircle2 size={14} />
                              : dl_status === 'downloading'
                                ? <Loader2 size={14} className="animate-spin" />
                                : <Download size={14} />}
                          </button>
                        );
                      })()}
                    </div>

                    <div className="p-5 flex-1 flex flex-col gap-3">
                      <div className="space-y-1">
                        <h4 className="font-bold text-text-main group-hover:text-brand-emerald transition-colors line-clamp-1">
                          {title ? String(title) : 'Untitled'}
                        </h4>
                        {subtitle && <p className="text-xs text-text-muted line-clamp-1">{String(subtitle)}</p>}
                      </div>
                      {description && (
                        <p className="text-[11px] text-text-muted line-clamp-2 leading-relaxed opacity-80">{String(description)}</p>
                      )}
                      {text_fields.length > 0 && (
                        <div className="pt-3 border-t border-border-subtle grid grid-cols-1 gap-2">
                          {text_fields.map((tf, i) => (
                            tf.value !== undefined && tf.value !== null ? (
                              <div key={`${tf.path}-${i}`} className="flex items-center justify-between gap-4 overflow-hidden">
                                <span className="text-[10px] text-text-muted shrink-0 uppercase tracking-wider font-bold">{tf.label || tf.path}</span>
                                <span className="text-[11px] text-text-main truncate font-medium">{String(tf.value)}</span>
                              </div>
                            ) : null
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Card action buttons (from card_actions) */}
                  {sorted_actions.length > 0 && (
                    <div className="px-5 pb-5 -mt-2 grid grid-cols-1 gap-2">
                      {sorted_actions.map(a => {
                        const exp_key = a.action_type === 'call_child_api' && a.child_api_id
                          ? expansion_key_for(api_node.id, card.item_key, a.child_api_id)
                          : `${a.id}__${card.item_key}`;
                        const busy = busy_action_keys[`${a.id}:${card.item_key}`];
                        const inline_expanded = a.action_type === 'call_child_api' && a.child_api_id
                          ? Boolean(expanded[exp_key])
                          : false;
                        return (
                          <button
                            key={a.id}
                            disabled={busy}
                            onClick={(e) => {
                              e.stopPropagation();
                              on_card_action({
                                api_node,
                                card,
                                action: a,
                                source_response_id,
                                parent_item_key,
                                expansion_key: exp_key,
                              });
                            }}
                            className={`px-3 py-2 rounded-xl text-[11px] font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-all disabled:opacity-50 ${STYLE_MAP[a.button_style] || STYLE_MAP.primary}`}
                          >
                            {busy ? <RefreshCw size={12} className="animate-spin" /> : (a.icon ? ICON_MAP[a.icon] : <Play size={12} fill="currentColor" />)}
                            {a.label}
                            {inline_expanded && (
                              <span className="text-[8px] font-bold uppercase tracking-widest opacity-70">·shown</span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </motion.div>

                {/* Inline-expanded children (from quick_run, popup Run&Show, or action buttons) */}
                <AnimatePresence>
                  {card_expansions.map(([key, ctx]) => (
                    <motion.div
                      key={key}
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="col-span-full overflow-hidden"
                    >
                      <div className="rounded-3xl bg-black/5 dark:bg-white/5 border border-border-subtle p-6 my-4 space-y-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="p-2 rounded-xl bg-brand-blue/10 text-brand-blue">
                              <Layers size={16} />
                            </div>
                            <div>
                              <p className="text-sm font-bold text-text-main">{ctx.api_node.name}</p>
                              <p className="text-[10px] text-text-muted">
                                child of <span className="font-mono">{api_node.name}</span> · for <span className="font-mono">{card.item_key}</span>
                              </p>
                            </div>
                          </div>
                          <button
                            onClick={() => collapse_expansion(key)}
                            className="text-xs font-bold text-text-muted hover:text-red-500"
                          >
                            Hide
                          </button>
                        </div>

                        {ctx.card_enabled && ctx.cards.length > 0 ? (
                          <NestedCardRenderer
                            ott_id={ott_id}
                            api_node={ctx.api_node}
                            cards={ctx.cards}
                            children_by_parent={children_by_parent}
                            all_apis={all_apis}
                            source_response_id={ctx.source_response_id}
                            parent_item_key={card.item_key}
                            depth={depth + 1}
                            max_depth={max_depth}
                            expanded={expanded}
                            set_expanded={set_expanded}
                            on_open_popup={on_open_popup}
                            on_open_card_builder={on_open_card_builder}
                            on_card_action={on_card_action}
                            busy_action_keys={busy_action_keys}
                          />
                        ) : (
                          <div className="space-y-3">
                            <div className="flex items-center justify-between">
                              <p className="text-xs text-text-muted flex items-center gap-2">
                                <Code size={12} /> {ctx.cards.length === 0 && ctx.card_enabled
                                  ? 'Card enabled but list_path produced 0 items.'
                                  : 'Card not configured for this child API.'}
                              </p>
                              <button
                                onClick={() => on_open_card_builder({
                                  api_node: ctx.api_node,
                                  sample_response: ctx.raw_response,
                                  source_response_id: ctx.source_response_id ?? undefined,
                                })}
                                className="text-xs font-bold text-brand-emerald hover:underline flex items-center gap-1"
                              >
                                <Plus size={12} /> Create card for this child API
                              </button>
                            </div>
                            <textarea
                              readOnly
                              value={JSON.stringify(ctx.raw_response, null, 2).slice(0, 4000)}
                              className="w-full h-[260px] bg-black/90 text-brand-emerald p-4 rounded-2xl font-mono text-[10px] outline-none border border-border-subtle"
                            />
                          </div>
                        )}
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </React.Fragment>
            );
          })}
        </div>
      )}

      {depth >= max_depth && (
        <p className="text-center text-xs text-amber-500">
          Reached max depth {max_depth} — open a card's settings popup to drill further.
        </p>
      )}
    </div>
  );
};

export default NestedCardRenderer;
