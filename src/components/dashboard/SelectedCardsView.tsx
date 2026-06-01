/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import {
  LayoutGrid,
  List,
  Search,
  Play,
  Image as ImageIcon,
  Eye,
  RefreshCw,
  Copy,
  ExternalLink,
} from 'lucide-react';
import { BuiltCard, CardAction, CardButtonStyle } from '../../types';

interface Props {
  cards: BuiltCard[];
  actions?: CardAction[];
  default_card_click_action_id?: string | null;
  on_action?: (action: CardAction, card: BuiltCard) => void;
  on_card_click?: (card: BuiltCard) => void;
  active_keys?: Record<string, boolean>;
  className?: string;
}

const ICON_MAP: Record<string, React.ReactNode> = {
  eye: <Eye size={14} />,
  play: <Play size={14} />,
  list: <LayoutGrid size={14} />,
  sync: <RefreshCw size={14} />,
  copy: <Copy size={14} />,
  external_link: <ExternalLink size={14} />,
};

const STYLE_MAP: Record<CardButtonStyle, string> = {
  primary: 'bg-brand-emerald text-white hover:scale-105 shadow-xl',
  secondary: 'bg-bg-card border border-border-subtle text-text-main hover:border-brand-emerald/50',
  outline: 'border border-brand-emerald text-brand-emerald hover:bg-brand-emerald/10',
  ghost: 'bg-white/10 text-white backdrop-blur-md hover:bg-white/20',
  danger: 'bg-red-500 text-white hover:bg-red-600 shadow-xl',
};

const SelectedCardsView: React.FC<Props> = ({
  cards,
  actions = [],
  on_action,
  on_card_click,
  active_keys = {},
  className = '',
}) => {
  const [view_mode, setViewMode] = useState<'grid' | 'table'>('grid');
  const [search_term, setSearchTerm] = useState('');

  const filtered_cards = useMemo(() => {
    if (!search_term) return cards;
    const term = search_term.toLowerCase();
    return cards.filter(c =>
      c.fields.some(f => String(f.value ?? '').toLowerCase().includes(term)),
    );
  }, [cards, search_term]);

  const sorted_actions = useMemo(
    () => [...actions].filter(a => a.is_active !== false).sort((a, b) => a.sort_order - b.sort_order),
    [actions],
  );

  if (cards.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center bg-black/5 dark:bg-white/5 rounded-3xl border border-dashed border-border-subtle">
        <Eye size={48} className="text-text-muted mb-4 opacity-50" />
        <p className="text-sm font-bold text-text-main">No cards available</p>
        <p className="text-xs text-text-muted mt-1">Call the API and configure list path / fields to generate cards.</p>
      </div>
    );
  }

  const visible_field = (card: BuiltCard, type: string) =>
    card.fields.find(f => f.display_type === type);

  const render_action_button = (action: CardAction, card: BuiltCard) => {
    const loading = active_keys[`${action.id}:${card.item_key}`];
    return (
      <button
        key={action.id}
        disabled={loading}
        onClick={(e) => { e.stopPropagation(); on_action?.(action, card); }}
        className={`w-full py-2.5 rounded-xl text-[10px] font-black uppercase tracking-wider flex items-center justify-center gap-2 transition-all disabled:opacity-50 ${STYLE_MAP[action.button_style] || STYLE_MAP.primary}`}
      >
        {loading ? <RefreshCw size={14} className="animate-spin" /> : (action.icon ? ICON_MAP[action.icon] : <Play size={14} fill="currentColor" />)}
        {action.label}
      </button>
    );
  };

  return (
    <div className={`space-y-6 ${className}`}>
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted" size={18} />
          <input
            type="text"
            placeholder={`Search ${cards.length} items...`}
            value={search_term}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-black/5 dark:bg-white/5 border border-border-subtle rounded-2xl pl-12 pr-4 py-3 text-sm text-text-main outline-none focus:ring-2 focus:ring-brand-emerald/50"
          />
        </div>
        <div className="flex items-center gap-2 p-1 bg-black/5 dark:bg-white/5 rounded-2xl w-fit border border-border-subtle">
          <button
            onClick={() => setViewMode('grid')}
            className={`p-2 rounded-xl transition-all ${view_mode === 'grid' ? 'bg-bg-card shadow-sm text-text-main' : 'text-text-muted hover:text-text-main'}`}
          >
            <LayoutGrid size={18} />
          </button>
          <button
            onClick={() => setViewMode('table')}
            className={`p-2 rounded-xl transition-all ${view_mode === 'table' ? 'bg-bg-card shadow-sm text-text-main' : 'text-text-muted hover:text-text-main'}`}
          >
            <List size={18} />
          </button>
        </div>
      </div>

      {filtered_cards.length === 0 ? (
        <div className="p-12 text-center bg-black/5 dark:bg-white/5 rounded-3xl">
          <p className="text-sm text-text-muted">No items match your search.</p>
        </div>
      ) : view_mode === 'grid' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {filtered_cards.map((card, idx) => {
            const title = visible_field(card, 'title')?.value;
            const subtitle = visible_field(card, 'subtitle')?.value;
            const image = visible_field(card, 'image')?.value;
            const description = visible_field(card, 'description')?.value;
            const badges = card.fields.filter(f => f.display_type === 'badge');
            const text_fields = card.fields.filter(f => f.display_type === 'text');

            return (
              <motion.div
                key={card.item_key + idx}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.04 }}
                onClick={() => on_card_click?.(card)}
                className="group flex flex-col bg-bg-card rounded-3xl border border-border-subtle overflow-hidden hover:shadow-xl hover:shadow-black/5 transition-all cursor-pointer"
              >
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
                  {sorted_actions.length > 0 && (
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-4 gap-2">
                      {sorted_actions.map(a => render_action_button(a, card))}
                    </div>
                  )}
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
                      {text_fields.map((tf, i) =>
                        tf.value !== undefined && tf.value !== null ? (
                          <div key={`${tf.path}-${i}`} className="flex items-center justify-between gap-4 overflow-hidden">
                            <span className="text-[10px] text-text-muted shrink-0 uppercase tracking-wider font-bold">{tf.label || tf.path}</span>
                            <span className="text-[11px] text-text-main truncate font-medium">{String(tf.value)}</span>
                          </div>
                        ) : null,
                      )}
                    </div>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>
      ) : (
        <div className="bg-bg-card rounded-3xl border border-border-subtle overflow-hidden">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-black/5 dark:bg-white/5 border-b border-border-subtle">
                <th className="px-6 py-4 text-xs font-bold text-text-muted uppercase tracking-wider">Preview</th>
                {filtered_cards[0]?.fields.filter(f => f.display_type !== 'image' && f.display_type !== 'hidden_id').map(f => (
                  <th key={f.path} className="px-6 py-4 text-xs font-bold text-text-muted uppercase tracking-wider">
                    {f.label || f.path}
                  </th>
                ))}
                <th className="px-6 py-4 text-xs font-bold text-text-muted uppercase tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {filtered_cards.map((card, idx) => {
                const image = visible_field(card, 'image')?.value;
                return (
                  <tr
                    key={card.item_key + idx}
                    onClick={() => on_card_click?.(card)}
                    className="hover:bg-black/2 group cursor-pointer"
                  >
                    <td className="px-6 py-4">
                      <div className="w-16 h-10 rounded-lg bg-black/10 dark:bg-white/10 overflow-hidden shrink-0">
                        {image ? (
                          <img src={String(image)} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-text-muted"><ImageIcon size={14} /></div>
                        )}
                      </div>
                    </td>
                    {card.fields.filter(f => f.display_type !== 'image' && f.display_type !== 'hidden_id').map(f => (
                      <td key={f.path} className="px-6 py-4">
                        <span className={`text-sm ${f.display_type === 'title' ? 'font-bold text-text-main' : 'text-text-muted'}`}>
                          {f.display_type === 'badge' ? (
                            <span className="px-2 py-0.5 rounded-full bg-brand-emerald/10 text-brand-emerald text-[10px] font-bold uppercase tracking-wider">
                              {String(f.value ?? '')}
                            </span>
                          ) : (
                            String(f.value ?? '')
                          )}
                        </span>
                      </td>
                    ))}
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        {sorted_actions.map(a => {
                          const loading = active_keys[`${a.id}:${card.item_key}`];
                          return (
                            <button
                              key={a.id}
                              disabled={loading}
                              onClick={(e) => { e.stopPropagation(); on_action?.(a, card); }}
                              className="p-2 rounded-xl bg-brand-emerald/10 text-brand-emerald hover:bg-brand-emerald hover:text-white transition-all disabled:opacity-50"
                              title={a.label}
                            >
                              {loading ? <RefreshCw size={14} className="animate-spin" /> : (a.icon && ICON_MAP[a.icon]) || <Play size={14} fill="currentColor" />}
                            </button>
                          );
                        })}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default SelectedCardsView;
