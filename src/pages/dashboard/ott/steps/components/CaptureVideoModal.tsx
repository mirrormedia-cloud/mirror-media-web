import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import toast from 'react-hot-toast';
import {
  X,
  Loader2,
  Save,
  Video,
  Hash,
  Plus,
  Trash2,
  AlertCircle,
} from 'lucide-react';
import { ott_service } from '../../../../../services/ott_service';
import {
  extract_paths_with_arrays,
  getValueByPath,
} from '../../../../../utils/apiDataUtils';
import { CommonSearchSelect, type SearchSelectOption, field_path_options_to_select } from '../../../../../components/ui/CommonSearchSelect';
import { build_field_path_options, build_array_path_options, get_value_type, get_sample_value } from '../../../../../utils/json_path_utils';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  ott_id: string;
  api_node_id: string;
  parent_api_id?: string | null;
  source_response_id?: string | null;
  item_key?: string | null;
  /** The actual response we're capturing video URLs from. */
  response: any;
  /**
   * Per-card capture only: a prefix that the backend needs to resolve picked paths
   * against the FULL saved response. For example if the user is capturing card index
   * 5 from list_path "episodes", set this to "episodes[5]" — the modal will prepend
   * it to every selected path before sending so that "sources[0].file" becomes
   * "episodes[5].sources[0].file" on the backend.
   *
   * When set, the list_path dropdown is hidden because we're capturing a single item.
   */
  card_path_prefix?: string | null;

  /**
   * When true the modal does NOT capture URLs into ott_video_assets — instead it
   * persists the selected paths as the api_node's reusable capture_mapping. The
   * mapping is then used by the bulk save_from_cards endpoint to capture + library-
   * save many cards in one click.
   */
  save_as_mapping?: boolean;
  /** Pre-fills the modal when editing an existing mapping. */
  initial_mapping?: {
    list_path?: string | null;
    video_url_paths?: string[];
    title_path?: string | null;
    description_path?: string | null;
    thumbnail_path?: string | null;
    quality_path?: string | null;
    language_path?: string | null;
    duration_path?: string | null;
  } | null;

  onSaved?: () => void | Promise<void>;
}

const VIDEO_HINT_KEYWORDS = ['m3u8', 'mp4', 'webm', 'video', 'stream', 'playback', 'source', 'file', 'url', 'manifest', 'mpd'];

function looks_like_video_path(path: string, value: any): boolean {
  const lower = (path || '').toLowerCase();
  if (typeof value === 'string') {
    const v = value.toLowerCase();
    if (v.includes('.m3u8') || v.includes('.mp4') || v.includes('.webm') || v.includes('.mpd') || v.includes('.mov')) return true;
  }
  return VIDEO_HINT_KEYWORDS.some(k => lower.endsWith(`.${k}`) || lower.endsWith(`.${k}s`) || lower.includes(`.${k}.`));
}

const CaptureVideoModal: React.FC<Props> = ({
  isOpen,
  onClose,
  ott_id,
  api_node_id,
  parent_api_id,
  source_response_id,
  item_key,
  response,
  card_path_prefix,
  save_as_mapping = false,
  initial_mapping,
  onSaved,
}) => {
  const is_per_card = !!card_path_prefix;
  const is_mapping_mode = !!save_as_mapping;
  const join_with_prefix = (p: string) => {
    if (!card_path_prefix) return p;
    if (!p) return card_path_prefix;
    // p starts with a property name (e.g. "sources[0].file") or with "[0]" if user picked
    // a path under the array root. In either case, separate with "." unless p starts with "[".
    return p.startsWith('[') ? `${card_path_prefix}${p}` : `${card_path_prefix}.${p}`;
  };
  const [list_path, set_list_path] = useState<string>('');
  const [video_url_paths, set_video_url_paths] = useState<string[]>([]);
  const [title_path, set_title_path] = useState<string>('');
  const [description_path, set_description_path] = useState<string>('');
  const [thumbnail_path, set_thumbnail_path] = useState<string>('');
  const [quality_path, set_quality_path] = useState<string>('');
  const [language_path, set_language_path] = useState<string>('');
  const [duration_path, set_duration_path] = useState<string>('');
  const [saving, set_saving] = useState(false);

  // Reset / pre-fill on open
  useEffect(() => {
    if (!isOpen) return;
    set_list_path(initial_mapping?.list_path ?? '');
    set_video_url_paths(initial_mapping?.video_url_paths ?? []);
    set_title_path(initial_mapping?.title_path ?? '');
    set_description_path(initial_mapping?.description_path ?? '');
    set_thumbnail_path(initial_mapping?.thumbnail_path ?? '');
    set_quality_path(initial_mapping?.quality_path ?? '');
    set_language_path(initial_mapping?.language_path ?? '');
    set_duration_path(initial_mapping?.duration_path ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const array_path_options = useMemo<SearchSelectOption[]>(() => {
    if (!response) return [];
    return build_array_path_options(response).map(o => ({
      label: o.label,
      value: o.value,
      description: o.sample,
      group: 'Array fields',
      badge: 'array',
    }));
  }, [response]);

  // Rich options for the path dropdowns — includes per-field type + sample preview
  // so users can find "thumbnail" by typing "image" or by matching the actual URL.
  const candidate_options = useMemo<SearchSelectOption[]>(() => {
    if (!response) return [];
    if (list_path) {
      const opts = build_field_path_options({ response, list_path });
      return field_path_options_to_select(opts);
    }
    // Single-item response (e.g. one card's raw_item).
    const paths = extract_paths_with_arrays(response);
    return paths.map<SearchSelectOption>(p => {
      const value = getValueByPath(response, p);
      const type = get_value_type(value);
      return {
        label: p,
        value: p,
        description: `${type} • ${get_sample_value(value)}`,
        group: type === 'video_url' ? 'Video fields'
          : type === 'image_url' ? 'Image fields'
          : type === 'url' ? 'URL fields'
          : type === 'array' ? 'Array fields'
          : type === 'object' ? 'Object fields'
          : type === 'number' ? 'Number fields'
          : type === 'boolean' ? 'Boolean fields'
          : type === 'id' ? 'ID fields'
          : 'Text fields',
        badge: type,
      };
    });
  }, [response, list_path]);

  const candidate_paths = useMemo(() => candidate_options.map(o => o.value), [candidate_options]);

  const video_suggestions = useMemo(() => {
    if (!response) return [];
    return candidate_paths.filter(p => {
      const sample = getValueByPath(response, p);
      return looks_like_video_path(p, sample);
    });
  }, [response, candidate_paths]);

  const add_url_path = (p: string) => {
    if (!p || video_url_paths.includes(p)) return;
    set_video_url_paths(prev => [...prev, p]);
  };

  const remove_url_path = (p: string) => {
    set_video_url_paths(prev => prev.filter(x => x !== p));
  };

  const handle_save = async () => {
    if (video_url_paths.length === 0) {
      toast.error('Pick at least one video URL path');
      return;
    }
    set_saving(true);
    try {
      // ── Mapping mode: persist the configuration on the api_node, don't capture URLs.
      if (is_mapping_mode) {
        const map_res = await ott_service.save_capture_mapping(ott_id, api_node_id, {
          list_path: list_path || null,
          video_url_paths,
          title_path: title_path || null,
          description_path: description_path || null,
          thumbnail_path: thumbnail_path || null,
          quality_path: quality_path || null,
          language_path: language_path || null,
          duration_path: duration_path || null,
        });
        if (!map_res.success) throw new Error(map_res.message || 'Failed to save mapping');
        toast.success('Capture mapping saved. You can now save any card straight to the Library.');
        await onSaved?.();
        onClose();
        return;
      }

      // For per-card capture, every picked path is relative to the card's raw_item.
      // The backend resolves against the FULL saved response, so we prepend the
      // card_path_prefix (e.g. "episodes[5]") to every path here. list_path is
      // forced to null because we're capturing a single item, not iterating.
      const res = await ott_service.capture_video_assets(ott_id, {
        api_node_id,
        source_response_id: source_response_id ?? null,
        parent_api_id: parent_api_id ?? null,
        item_key: item_key ?? null,
        list_path: is_per_card ? null : (list_path || null),
        video_url_paths: video_url_paths.map(join_with_prefix),
        title_path: title_path ? join_with_prefix(title_path) : null,
        description_path: description_path ? join_with_prefix(description_path) : null,
        thumbnail_path: thumbnail_path ? join_with_prefix(thumbnail_path) : null,
        quality_path: quality_path ? join_with_prefix(quality_path) : null,
        language_path: language_path ? join_with_prefix(language_path) : null,
        duration_path: duration_path ? join_with_prefix(duration_path) : null,
      });
      if (!res.success || !res.data) throw new Error(res.message || 'Capture failed');

      const { saved_count, updated_count, already_saved_count, error_count, items } = res.data;
      const total = saved_count + updated_count + already_saved_count;

      if (saved_count > 0) {
        const tail = updated_count > 0 ? ` (+${updated_count} updated)` : '';
        toast.success(`${saved_count} new video URL${saved_count === 1 ? '' : 's'} captured${tail}`);
      } else if (updated_count > 0) {
        toast.success(`Updated metadata on ${updated_count} existing capture${updated_count === 1 ? '' : 's'}`);
      } else if (already_saved_count > 0) {
        toast(
          `Already in Captured Videos — ${already_saved_count} URL${already_saved_count === 1 ? '' : 's'} were saved earlier. Open the Captured Videos page to view ${already_saved_count === 1 ? 'it' : 'them'}.`,
          { duration: 5000 },
        );
      } else if (error_count > 0) {
        toast.error(`No URLs captured — ${error_count} error${error_count === 1 ? '' : 's'}. Check backend logs.`);
      } else if (total === 0) {
        // Backend now returns `extraction_diagnostics` when nothing
        // matched — surface it so the user knows WHY (usually a path
        // mismatch or wrong API level) instead of just "didn't work".
        const diag = (res.data as any)?.extraction_diagnostics;
        if (diag) {
          // eslint-disable-next-line no-console
          console.log('[CAPTURE] extraction_diagnostics:', diag);
          const sample = diag.attempted_paths?.[0];
          const tried = sample
            ? `Tried "${sample.path}" → ${sample.resolved}`
            : 'No paths attempted';
          const tail = diag.sample_card_keys?.length
            ? ` Available fields on each card: ${diag.sample_card_keys.slice(0, 8).join(', ')}${diag.sample_card_keys.length > 8 ? '…' : ''}.`
            : diag.response_top_keys?.length
                ? ` Top-level response keys: ${diag.response_top_keys.join(', ')}.`
                : '';
          toast.error(
            `No URLs extracted. ${tried}.${tail} ${diag.hint ?? ''}`.trim(),
            { duration: 12000 },
          );
        } else {
          toast.error(
            'No URLs were extracted. The selected paths did not resolve to a non-empty string in the response.',
            { duration: 6000 },
          );
        }
      }

      // Helpful hint when every URL was already saved — surfaces the existing IDs.
      if (saved_count === 0 && already_saved_count > 0 && items.length > 0) {
        // eslint-disable-next-line no-console
        console.log('[CAPTURE] already-saved item ids:', items.filter(i => i.outcome === 'already_saved').map(i => i.id));
      }

      await onSaved?.();
      onClose();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to capture videos');
    } finally {
      set_saving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[115] flex items-center justify-center p-4">
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
        className="relative w-full max-w-3xl max-h-[92vh] bg-bg-card border border-border-subtle rounded-3xl shadow-2xl flex flex-col overflow-hidden"
      >
        <div className="p-6 border-b border-border-subtle flex items-center justify-between bg-black/5 dark:bg-white/5">
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-2xl bg-brand-blue/10 text-brand-blue">
              <Video size={22} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-text-main">
                {is_mapping_mode ? 'Configure Capture Mapping' : 'Capture Video URLs'}
              </h2>
              <p className="text-xs text-text-muted">
                {is_mapping_mode
                  ? 'Pick the URL/title/thumbnail paths once — every card will reuse this when you click "Save to Library".'
                  : 'Pick the response paths that contain video URLs. Use list_path to capture URLs from every item.'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-black/5 dark:hover:bg-white/5 text-text-muted">
            <X size={22} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {!response ? (
            <div className="p-12 text-center text-text-muted">
              <AlertCircle size={32} className="mx-auto mb-4" />
              <p className="text-sm">No response available — call the API first.</p>
            </div>
          ) : (
            <>
              {/* List path */}
              {is_per_card ? (
                <div className="rounded-2xl border border-brand-emerald/30 bg-brand-emerald/5 p-3 flex items-center gap-3 text-xs text-text-main">
                  <Hash size={14} className="text-brand-emerald" />
                  <div>
                    <p className="font-bold">Capturing from a single card</p>
                    <p className="text-text-muted">
                      Picked paths will be saved as <span className="font-mono">{card_path_prefix}.&lt;path&gt;</span> so they resolve against the full saved response.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-text-muted uppercase tracking-wider flex items-center gap-2">
                    <Hash size={14} /> List path (optional — capture from every item)
                  </label>
                  <CommonSearchSelect
                    value={list_path || null}
                    on_change={(v) => { set_list_path(v ?? ''); set_video_url_paths([]); }}
                    options={array_path_options}
                    is_clearable
                    placeholder="— No list_path (single response) —"
                    search_placeholder="Search array paths..."
                    empty_message="No arrays detected in response"
                  />
                </div>
              )}

              {/* Video URL paths */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-text-muted uppercase tracking-wider">Video URL paths</label>

                {video_suggestions.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-[10px] text-text-muted">Suggested (looks like video):</p>
                    <div className="flex flex-wrap gap-2">
                      {video_suggestions.map(p => (
                        <button
                          key={p}
                          onClick={() => add_url_path(p)}
                          disabled={video_url_paths.includes(p)}
                          className="text-[10px] font-mono px-2 py-1 rounded-lg bg-brand-emerald/10 text-brand-emerald border border-brand-emerald/30 hover:bg-brand-emerald/20 disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          + {p}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex gap-2">
                  <CommonSearchSelect
                    is_multi
                    value={video_url_paths}
                    on_change={(v) => set_video_url_paths(v)}
                    options={candidate_options}
                    placeholder="— Pick video URL paths —"
                    search_placeholder="Search by path, type, or sample..."
                    empty_message="No paths in response"
                    panel_max_height={360}
                  />
                </div>

                <div className="space-y-1">
                  {video_url_paths.length === 0 ? (
                    <p className="text-[11px] text-amber-500">Select at least one video URL path.</p>
                  ) : (
                    video_url_paths.map(p => (
                      <div key={p} className="flex items-center justify-between gap-2 p-2 rounded-lg bg-black/5 dark:bg-white/5 border border-border-subtle">
                        <span className="text-[11px] font-mono text-text-main truncate">{p}</span>
                        <button
                          onClick={() => remove_url_path(p)}
                          className="p-1 rounded-md text-text-muted hover:text-red-500 hover:bg-red-500/10"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Optional path mappings */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {([
                  ['Title path', title_path, set_title_path],
                  ['Description path', description_path, set_description_path],
                  ['Thumbnail path', thumbnail_path, set_thumbnail_path],
                  ['Quality path', quality_path, set_quality_path],
                  ['Language path', language_path, set_language_path],
                  ['Duration path', duration_path, set_duration_path],
                ] as const).map(([label, value, setter]) => (
                  <div key={label} className="space-y-1.5">
                    <label className="text-xs font-bold text-text-muted uppercase tracking-wider ml-1">{label}</label>
                    <CommonSearchSelect
                      size="sm"
                      value={value || null}
                      on_change={(v) => setter(v ?? '')}
                      options={candidate_options}
                      is_clearable
                      placeholder="— None —"
                      search_placeholder="Search paths..."
                    />
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="p-6 border-t border-border-subtle bg-black/5 dark:bg-white/5 flex items-center justify-between">
          <p className="text-xs text-text-muted">
            {video_url_paths.length} URL path{video_url_paths.length === 1 ? '' : 's'} selected
            {is_per_card && (
              <span className="ml-2">
                · single-card capture under <span className="font-mono">{card_path_prefix}</span>
              </span>
            )}
            {!is_per_card && list_path && (
              <span className="ml-2">
                · iterating over <span className="font-mono">{list_path}</span>
              </span>
            )}
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
              disabled={saving || video_url_paths.length === 0}
              className="btn-primary px-8 py-2.5 flex items-center gap-2 disabled:opacity-50"
            >
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              {is_mapping_mode
                ? `Save Mapping (${video_url_paths.length} URL path${video_url_paths.length === 1 ? '' : 's'})`
                : `Capture ${video_url_paths.length} path${video_url_paths.length === 1 ? '' : 's'}`}
            </button>
          </div>
        </div>
      </motion.div>

      {/* Hidden Plus icon import keeps lint happy if added later */}
      <span className="hidden"><Plus /></span>
    </div>
  );
};

export default CaptureVideoModal;
