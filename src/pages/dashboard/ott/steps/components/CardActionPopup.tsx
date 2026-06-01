import React, { useState } from 'react';
import { motion } from 'motion/react';
import {
  X,
  Play,
  Layers,
  Copy,
  Loader2,
  ChevronDown,
  ChevronRight,
  Settings,
  Video,
} from 'lucide-react';
import { ApiNode, BuiltCard } from '../../../../../types';
import { JsonTreeViewer } from '../../../../../components/ui/JsonTreeViewer';
import toast from 'react-hot-toast';

export type CardActionDispatch =
  | { kind: 'run' | 'run_show_cards' | 'configure_card'; child_api: ApiNode }
  | { kind: 'capture_videos' };

interface Props {
  isOpen: boolean;
  onClose: () => void;
  api_node: ApiNode;
  card: BuiltCard;
  child_apis: ApiNode[];
  on_dispatch: (intent: CardActionDispatch) => void;
  busy_child_id?: string | null;
  /** When true, show a "Capture Video URLs from this card" entry in the popup. */
  show_capture_videos?: boolean;
}

const CardActionPopup: React.FC<Props> = ({
  isOpen,
  onClose,
  api_node,
  card,
  child_apis,
  on_dispatch,
  busy_child_id = null,
  show_capture_videos = false,
}) => {
  const [show_raw, set_show_raw] = useState(false);

  if (!isOpen) return null;

  const copy_item_key = async () => {
    try {
      await navigator.clipboard.writeText(card.item_key);
      toast.success(`Copied ${card.item_key}`);
    } catch {
      toast.error('Clipboard unavailable');
    }
  };

  return (
    <div className="fixed inset-0 z-[105] flex items-center justify-center p-4">
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
        className="relative w-full max-w-5xl max-h-[90vh] bg-bg-card border border-border-subtle rounded-3xl shadow-2xl flex flex-col overflow-hidden"
      >
        <div className="p-6 border-b border-border-subtle flex items-center justify-between bg-black/5 dark:bg-white/5">
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-2xl bg-brand-blue/10 text-brand-blue">
              <Settings size={20} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-text-main">
                {card.fields.find(f => f.display_type === 'title')?.value
                  ? String(card.fields.find(f => f.display_type === 'title')?.value)
                  : 'Card actions'}
              </h3>
              <p className="text-[10px] text-text-muted uppercase font-bold tracking-widest">
                index {card.index} · key {card.item_key}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-black/5 dark:hover:bg-white/5 text-text-muted">
            <X size={22} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Selected fields summary */}
          <div className="space-y-2">
            <h4 className="text-[10px] font-bold uppercase tracking-widest text-text-muted">Card fields</h4>
            <div className="grid grid-cols-2 gap-2">
              {card.fields.map(f => (
                <div key={f.path} className="p-3 rounded-xl bg-black/5 dark:bg-white/5 border border-border-subtle">
                  <p className="text-[9px] font-bold text-text-muted uppercase truncate">{f.label || f.path}</p>
                  <p className="text-xs font-bold text-text-main truncate">
                    {f.value === null || f.value === undefined ? '—' : String(f.value)}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Child APIs */}
          <div className="space-y-2">
            <h4 className="text-[10px] font-bold uppercase tracking-widest text-text-muted">
              Child APIs ({child_apis.length})
            </h4>
            {child_apis.length === 0 ? (
              <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-600 dark:text-amber-300">
                No child APIs registered for <span className="font-mono">{api_node.name}</span>. Create one with this API as parent.
              </div>
            ) : (
              <div className="space-y-2">
                {child_apis.map(child => {
                  const busy = busy_child_id === child.id;
                  return (
                    <div key={child.id} className="p-4 rounded-2xl bg-bg-main border border-border-subtle space-y-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-text-main">{child.name}</p>
                          <p className="text-[10px] text-text-muted font-mono truncate">
                            {child.method} {child.endpoint}
                          </p>
                          {child.card_enabled && (
                            <span className="text-[9px] font-bold uppercase tracking-widest text-brand-emerald">
                              card configured
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <button
                          onClick={() => on_dispatch({ kind: 'run', child_api: child })}
                          disabled={busy}
                          className="px-3 py-2 rounded-lg bg-black/5 dark:bg-white/5 border border-border-subtle text-text-main text-xs font-bold hover:border-brand-emerald/50 disabled:opacity-50 flex items-center justify-center gap-1"
                        >
                          {busy ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
                          Run
                        </button>
                        <button
                          onClick={() => on_dispatch({ kind: 'run_show_cards', child_api: child })}
                          disabled={busy}
                          className="px-3 py-2 rounded-lg bg-brand-emerald text-white text-xs font-bold hover:scale-105 transition-transform disabled:opacity-50 flex items-center justify-center gap-1"
                        >
                          {busy ? <Loader2 size={12} className="animate-spin" /> : <Layers size={12} />}
                          Run & Show
                        </button>
                        <button
                          onClick={() => on_dispatch({ kind: 'configure_card', child_api: child })}
                          className="px-3 py-2 rounded-lg bg-black/5 dark:bg-white/5 border border-border-subtle text-text-main text-xs font-bold hover:border-brand-blue/50 flex items-center justify-center gap-1"
                        >
                          <Settings size={12} />
                          Configure
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Capture this card's video URLs */}
          {show_capture_videos && (
            <div className="space-y-2">
              <h4 className="text-[10px] font-bold uppercase tracking-widest text-text-muted">Local Library</h4>
              <button
                onClick={() => on_dispatch({ kind: 'capture_videos' })}
                className="w-full p-4 rounded-2xl bg-brand-blue/10 border border-brand-blue/30 text-brand-blue hover:bg-brand-blue/20 flex items-center justify-between gap-3 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <Video size={16} />
                  <div className="text-left">
                    <p className="text-sm font-bold">Capture Video URLs from this card</p>
                    <p className="text-[10px] opacity-80">Open the capture mapper using this card's response data.</p>
                  </div>
                </div>
                <ChevronRight size={14} />
              </button>
            </div>
          )}

          {/* Raw JSON */}
          <div className="space-y-2">
            <button
              onClick={() => set_show_raw(s => !s)}
              className="flex items-center gap-2 text-xs font-bold text-text-muted hover:text-text-main"
            >
              {show_raw ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              Raw item JSON
            </button>
            {show_raw && (
              <JsonTreeViewer
                data={card.raw_item}
                max_height={360}
                default_expanded_depth={1}
              />
            )}
          </div>
        </div>

        <div className="p-6 border-t border-border-subtle bg-black/5 dark:bg-white/5 flex items-center justify-between">
          <button
            onClick={copy_item_key}
            className="text-xs font-bold text-text-muted hover:text-brand-emerald flex items-center gap-1.5"
          >
            <Copy size={12} /> Copy item key
          </button>
          <button
            onClick={onClose}
            className="px-6 py-2 rounded-xl bg-bg-main border border-border-subtle text-text-main font-bold hover:bg-black/5"
          >
            Close
          </button>
        </div>
      </motion.div>
    </div>
  );
};

export default CardActionPopup;
