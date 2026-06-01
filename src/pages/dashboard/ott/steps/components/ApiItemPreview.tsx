/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { ApiNode, BuiltCard, CardAction } from '../../../../../types';
import { ExternalLink, Loader2, ChevronDown, ChevronRight, Eye, EyeOff } from 'lucide-react';
import SelectedCardsView from '../../../../../components/dashboard/SelectedCardsView';
import { ott_service } from '../../../../../services/ott_service';

interface Props {
  api: ApiNode;
  ott_id: string;
  refresh_token?: number;
}

const ApiItemPreview: React.FC<Props> = ({ api, ott_id, refresh_token }) => {
  // Collapsed by default. The previous version auto-loaded cards on every
  // render which was visually noisy on the API tree page (every configured
  // node showed its full card list on first paint). Now the user explicitly
  // expands the preview when they want to see it — also saves a network call
  // per node on initial load.
  const [expanded, setExpanded] = useState(false);

  const [cards, setCards] = useState<BuiltCard[]>([]);
  const [actions, setActions] = useState<CardAction[]>([]);
  const [default_action_id, setDefaultActionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  // Whether we've ever loaded for this api.id — lets us skip a refetch on
  // subsequent expand/collapse cycles, but force a refetch when refresh_token
  // changes (e.g. after the user saves edited card config).
  const [loaded_for, setLoadedFor] = useState<string | null>(null);
  const [last_refresh_token, setLastRefreshToken] = useState<number | undefined>(undefined);

  useEffect(() => {
    // Don't fetch when collapsed — saves N requests on first paint of the
    // API tree page. Refetch when refresh_token changes even while collapsed
    // is irrelevant since we only fetch when needed.
    if (!expanded) return;
    if ((api.selected_fields || []).length === 0 || !api.list_path) {
      setCards([]);
      setActions([]);
      setDefaultActionId(null);
      return;
    }
    // Skip refetch if we already have data for this api and the refresh_token
    // hasn't changed since last load.
    if (loaded_for === api.id && last_refresh_token === refresh_token) return;

    let cancelled = false;
    setLoading(true);
    ott_service.get_api_cards(ott_id, api.id)
      .then(res => {
        if (cancelled) return;
        if (res.success && res.data) {
          setCards(res.data.cards);
          setActions(res.data.actions || []);
          setDefaultActionId(res.data.default_card_click_action_id ?? null);
        } else {
          setCards([]);
          setActions([]);
          setDefaultActionId(null);
        }
        setLoadedFor(api.id);
        setLastRefreshToken(refresh_token);
      })
      .catch(() => {
        if (!cancelled) {
          setCards([]);
          setActions([]);
          setDefaultActionId(null);
        }
      })
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [expanded, api.id, ott_id, api.list_path, api.selected_fields, refresh_token, loaded_for, last_refresh_token]);

  if ((api.selected_fields || []).length === 0) return null;

  const card_count_label = loaded_for === api.id ? `${cards.length} card${cards.length === 1 ? '' : 's'}` : 'click to load';

  return (
    <div className="space-y-3 animate-in fade-in slide-in-from-top-2">
      {/* Header with toggle. Clicking anywhere on the row expands/collapses.
          The "Edit Card Mapping" button was removed — the "Edit Card" button
          on the node row already opens the same Card Builder modal, so this
          duplicate just added clutter. */}
      <button
        type="button"
        onClick={() => setExpanded(v => !v)}
        className="flex items-center gap-2 text-xs font-bold text-text-main hover:text-brand-emerald transition-colors"
      >
        {expanded ? <ChevronDown size={14} className="text-brand-emerald" /> : <ChevronRight size={14} className="text-text-muted" />}
        <ExternalLink size={14} className="text-brand-emerald" />
        <span className="uppercase tracking-widest">
          Live Preview from <span className="text-brand-emerald">{api.name}</span>
        </span>
        <span className="text-[10px] font-normal text-text-muted normal-case tracking-normal ml-1">
          ({card_count_label})
        </span>
        {expanded
          ? <Eye size={12} className="ml-1 text-brand-emerald" />
          : <EyeOff size={12} className="ml-1 text-text-muted/60" />}
      </button>

      {expanded && (
        loading ? (
          <div className="flex items-center justify-center py-8 text-text-muted">
            <Loader2 size={20} className="animate-spin" />
          </div>
        ) : (
          <SelectedCardsView
            cards={cards}
            actions={actions}
            default_card_click_action_id={default_action_id}
            className="max-h-[600px] overflow-y-auto pr-2 scrollbar-hide"
          />
        )
      )}
    </div>
  );
};

export default ApiItemPreview;
