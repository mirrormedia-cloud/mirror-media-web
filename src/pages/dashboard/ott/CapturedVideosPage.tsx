/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import toast from 'react-hot-toast';
import {
  Video,
  Loader2,
  Search,
  Copy,
  Download,
  Trash2,
  ExternalLink,
  ArrowLeft,
  Filter,
  RefreshCw,
  Save,
  CheckCircle2,
  Folder,
} from 'lucide-react';
import { ott_service } from '../../../services/ott_service';
import { VideoAsset, LibraryItemStatus } from '../../../types';
import { useConfirm } from '../../../components/ui/ConfirmDialog';

const VIDEO_TYPE_OPTIONS = ['', 'mp4', 'webm', 'mov', 'mkv', 'm3u8', 'mpd', 'unknown'];

const CapturedVideosPage: React.FC = () => {
  const { ott_id } = useParams<{ ott_id: string }>();
  const navigate = useNavigate();
  const confirm = useConfirm();

  const [items, set_items] = useState<VideoAsset[]>([]);
  const [total, set_total] = useState(0);
  const [page, set_page] = useState(1);
  const [limit] = useState(50);
  const [loading, set_loading] = useState(true);

  const [search, set_search] = useState('');
  const [video_type, set_video_type] = useState('');
  const [selected_ids, set_selected_ids] = useState<Set<string>>(new Set());
  const [busy_ids, set_busy_ids] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    if (!ott_id) return;
    set_loading(true);
    try {
      const params: any = { page, limit };
      if (search) params.search = search;
      if (video_type) params.video_type = video_type;
      const res = await ott_service.get_video_assets(ott_id, params);
      if (!res.success || !res.data) throw new Error(res.message || 'Failed to load videos');
      set_items(res.data.items);
      set_total(res.data.total);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to load videos');
    } finally {
      set_loading(false);
    }
  }, [ott_id, page, limit, search, video_type]);

  useEffect(() => { load(); }, [load]);

  const handle_delete = async (id: string) => {
    if (!ott_id) return;
    const ok = await confirm({
      title: 'Delete this captured video?',
      message: 'This cannot be undone.',
      confirm_label: 'Delete',
      danger: true,
    });
    if (!ok) return;
    try {
      const res = await ott_service.delete_video_asset(ott_id, id);
      if (!res.success) throw new Error(res.message);
      toast.success('Deleted');
      await load();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to delete');
    }
  };

  const handle_copy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success('URL copied');
    } catch { toast.error('Clipboard not available'); }
  };

  const handle_save_one = async (id: string) => {
    if (!ott_id) return;
    set_busy_ids(prev => { const n = new Set(prev); n.add(id); return n; });
    try {
      const res = await ott_service.save_to_library(ott_id, { video_asset_id: id });
      if (!res.success) throw new Error(res.message);
      toast.success(res.message || 'Save started — check Library for progress');
      await load();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to start save');
    } finally {
      set_busy_ids(prev => { const n = new Set(prev); n.delete(id); return n; });
    }
  };

  const handle_save_bulk = async (ids: string[]) => {
    if (!ott_id || ids.length === 0) return;
    try {
      const res = await ott_service.save_bulk_to_library(ott_id, { video_asset_ids: ids });
      if (!res.success || !res.data) throw new Error(res.message);
      toast.success(`${res.data.started} save${res.data.started === 1 ? '' : 's'} started, ${res.data.skipped} already saved`);
      set_selected_ids(new Set());
      await load();
    } catch (err: any) {
      toast.error(err?.message || 'Bulk save failed');
    }
  };

  const toggle_select = (id: string) => {
    set_selected_ids(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };

  const select_all_visible = () => {
    set_selected_ids(prev => {
      const n = new Set(prev);
      for (const v of items) if (!v.is_saved_to_library) n.add(v.id);
      return n;
    });
  };

  const clear_selection = () => set_selected_ids(new Set());

  const visible_unsaved_ids = items.filter(v => !v.is_saved_to_library).map(v => v.id);

  const total_pages = Math.max(1, Math.ceil(total / limit));

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex flex-col gap-2">
          <button
            onClick={() => navigate(`/dashboard/ott/${ott_id}/manage`)}
            className="flex items-center gap-2 text-xs font-bold text-text-muted hover:text-text-main w-fit"
          >
            <ArrowLeft size={14} /> Back to OTT
          </button>
          <h1 className="text-3xl font-black text-text-main tracking-tight flex items-center gap-3">
            <Video size={28} /> Captured Videos
          </h1>
          <p className="text-sm text-text-muted">
            {total} captured · search and filter, then download mp4/webm/mov directly through the backend.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => navigate(`/dashboard/ott/${ott_id}/library`)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-bg-card border border-border-subtle text-text-main text-sm font-bold hover:border-brand-emerald/50"
          >
            <Folder size={16} /> Open Library
          </button>
          <button
            onClick={load}
            className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-bg-card border border-border-subtle text-text-main text-sm font-bold hover:border-brand-emerald/50"
          >
            <RefreshCw size={16} /> Refresh
          </button>
        </div>
      </div>

      {/* Bulk action bar */}
      {(selected_ids.size > 0 || visible_unsaved_ids.length > 0) && (
        <div className="flex items-center justify-between gap-3 p-4 rounded-2xl bg-brand-emerald/5 border border-brand-emerald/20 flex-wrap">
          <p className="text-sm text-text-main">
            {selected_ids.size > 0
              ? <><span className="font-bold">{selected_ids.size}</span> selected</>
              : <span className="text-text-muted">Pick items below or save everything visible.</span>}
          </p>
          <div className="flex items-center gap-2 flex-wrap">
            {selected_ids.size > 0 && (
              <button onClick={clear_selection} className="text-xs font-bold text-text-muted hover:text-text-main px-3 py-1.5">
                Clear
              </button>
            )}
            {visible_unsaved_ids.length > 0 && selected_ids.size === 0 && (
              <button
                onClick={select_all_visible}
                className="text-xs font-bold text-text-main bg-bg-card border border-border-subtle rounded-xl px-3 py-1.5"
              >
                Select all unsaved
              </button>
            )}
            <button
              onClick={() => handle_save_bulk(selected_ids.size > 0 ? Array.from(selected_ids) : visible_unsaved_ids)}
              disabled={(selected_ids.size === 0 && visible_unsaved_ids.length === 0)}
              className="btn-primary px-5 py-2 text-sm flex items-center gap-2 disabled:opacity-50"
            >
              <Save size={14} />
              {selected_ids.size > 0
                ? `Save ${selected_ids.size} to Library`
                : `Save All Visible (${visible_unsaved_ids.length})`}
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted" size={16} />
          <input
            type="text"
            value={search}
            onChange={(e) => { set_search(e.target.value); set_page(1); }}
            placeholder="Search title or URL..."
            className="w-full bg-black/5 dark:bg-white/5 border border-border-subtle rounded-2xl pl-12 pr-4 py-2.5 text-sm text-text-main outline-none focus:ring-2 focus:ring-brand-emerald/50"
          />
        </div>
        <div className="flex items-center gap-2 text-xs text-text-muted">
          <Filter size={14} />
          <select
            value={video_type}
            onChange={(e) => { set_video_type(e.target.value); set_page(1); }}
            className="input-field py-2 text-xs"
          >
            {VIDEO_TYPE_OPTIONS.map(t => (
              <option key={t || 'all'} value={t}>{t ? t : 'all types'}</option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-text-muted">
          <Loader2 size={28} className="animate-spin" />
        </div>
      ) : items.length === 0 ? (
        <div className="p-16 text-center bg-black/5 dark:bg-white/5 rounded-3xl border border-dashed border-border-subtle space-y-3">
          <Video size={48} className="mx-auto text-text-muted opacity-50" />
          <h3 className="text-lg font-bold text-text-main">No videos captured yet</h3>
          <p className="text-sm text-text-muted">
            Open a nested cards page and click <span className="font-bold">Capture Video URLs</span>.
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {items.map(v => (
              <VideoAssetCard
                key={v.id}
                asset={v}
                ott_id={ott_id ?? ''}
                on_copy={handle_copy}
                on_delete={handle_delete}
                on_save={handle_save_one}
                saving={busy_ids.has(v.id)}
                selected={selected_ids.has(v.id)}
                on_toggle_select={() => toggle_select(v.id)}
                on_open_library={() => navigate(`/dashboard/ott/${ott_id}/library`)}
              />
            ))}
          </div>

          {total_pages > 1 && (
            <div className="flex items-center justify-between text-xs text-text-muted">
              <span>Page {page} of {total_pages} · {total} total</span>
              <div className="flex gap-2">
                <button
                  onClick={() => set_page(p => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="px-3 py-1.5 rounded-lg bg-bg-card border border-border-subtle disabled:opacity-50"
                >
                  Prev
                </button>
                <button
                  onClick={() => set_page(p => Math.min(total_pages, p + 1))}
                  disabled={page >= total_pages}
                  className="px-3 py-1.5 rounded-lg bg-bg-card border border-border-subtle disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

// ── Card component ──────────────────────────────────────────────────────
interface AssetCardProps {
  asset: VideoAsset;
  ott_id: string;
  on_copy: (url: string) => void | Promise<void>;
  on_delete: (id: string) => void | Promise<void>;
  on_save: (id: string) => void | Promise<void>;
  saving: boolean;
  selected: boolean;
  on_toggle_select: () => void;
  on_open_library: () => void;
}

const STATUS_BADGE_STYLE: Record<NonNullable<LibraryItemStatus>, string> = {
  completed: 'bg-brand-emerald/10 text-brand-emerald',
};

const VideoAssetCard: React.FC<AssetCardProps> = ({ asset, ott_id, on_copy, on_delete, on_save, saving, selected, on_toggle_select, on_open_library }) => {
  const [show_playlist_menu, set_show_playlist_menu] = useState(false);
  const is_playlist = asset.video_type === 'm3u8' || asset.video_type === 'mpd';
  const is_saved = !!asset.is_saved_to_library;
  const lib_status = asset.library_status as LibraryItemStatus | undefined;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={`rounded-3xl bg-bg-card border overflow-hidden flex flex-col transition-colors relative ${selected ? 'border-brand-emerald shadow-lg shadow-brand-emerald/10' : 'border-border-subtle'}`}
    >
      <div className="aspect-video bg-black/20 relative">
        {asset.thumbnail ? (
          <img src={asset.thumbnail} alt={asset.title ?? 'video'} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-text-muted">
            <Video size={32} />
          </div>
        )}
        {!is_saved && (
          <label
            onClick={(e) => e.stopPropagation()}
            className="absolute bottom-2 right-2 z-10 flex items-center gap-1.5 px-2 py-1 rounded-lg bg-black/60 backdrop-blur-md cursor-pointer select-none"
          >
            <input
              type="checkbox"
              checked={selected}
              onChange={on_toggle_select}
              className="cursor-pointer accent-brand-emerald"
            />
            <span className="text-[10px] font-bold uppercase text-white tracking-wider">Select</span>
          </label>
        )}
        <span className="absolute top-2 right-2 text-[10px] font-bold uppercase px-2 py-0.5 rounded-lg bg-black/60 text-white tracking-wider">
          {asset.video_type ?? 'unknown'}
        </span>
        {asset.quality && (
          <span className="absolute top-2 left-2 text-[10px] font-bold uppercase px-2 py-0.5 rounded-lg bg-brand-emerald/80 text-white tracking-wider">
            {asset.quality}
          </span>
        )}
      </div>
      <div className="p-4 flex-1 flex flex-col gap-2">
        <p className="text-sm font-bold text-text-main line-clamp-1">{asset.title ?? '(no title)'}</p>
        <div className="flex items-center gap-2 text-[10px] text-text-muted flex-wrap">
          {asset.language && <span>{asset.language}</span>}
          {asset.duration && <span>· {asset.duration}</span>}
          {asset.createdAt && <span>· {new Date(asset.createdAt).toLocaleDateString()}</span>}
          {is_saved && lib_status && (
            <span className={`px-1.5 py-0.5 rounded font-bold uppercase tracking-wider ${STATUS_BADGE_STYLE[lib_status]}`}>
              Library: {lib_status}
            </span>
          )}
        </div>
        <p className="text-[10px] text-text-muted font-mono break-all line-clamp-2">{asset.video_url}</p>
        {is_playlist && !is_saved && (
          <p className="text-[10px] text-amber-500">Will convert to MP4 before saving (requires ffmpeg).</p>
        )}
        {!is_playlist && !is_saved && (
          <p className="text-[10px] text-text-muted">Will download original file.</p>
        )}
      </div>

      {/* Library save row */}
      <div className="p-3 border-t border-border-subtle flex items-center justify-between gap-2">
        {is_saved ? (
          <>
            <span className="flex items-center gap-1 text-[10px] font-bold text-brand-emerald">
              <CheckCircle2 size={12} /> Saved
            </span>
            <button
              onClick={on_open_library}
              className="flex items-center gap-1 text-[10px] font-bold text-text-main hover:text-brand-emerald"
            >
              <Folder size={12} /> View in Library
            </button>
          </>
        ) : (
          <>
            <span className="text-[10px] font-bold text-text-muted">Local Library</span>
            <button
              onClick={() => on_save(asset.id)}
              disabled={saving}
              className="btn-primary px-3 py-1.5 text-[10px] flex items-center gap-1 disabled:opacity-50"
            >
              {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
              Save to Library
            </button>
          </>
        )}
      </div>

      <div className="p-3 border-t border-border-subtle flex items-center justify-between gap-2">
        <button
          onClick={() => on_copy(asset.video_url)}
          className="flex items-center gap-1 text-[10px] font-bold text-text-muted hover:text-brand-emerald"
        >
          <Copy size={12} /> Copy
        </button>
        {is_playlist ? (
          <div className="relative">
            <button
              onClick={() => set_show_playlist_menu(s => !s)}
              className="flex items-center gap-1 text-[10px] font-bold text-brand-blue hover:underline"
            >
              <ExternalLink size={12} /> Playlist
            </button>
            {show_playlist_menu && (
              <div className="absolute bottom-6 right-0 z-10 bg-bg-card border border-border-subtle rounded-xl shadow-2xl p-2 w-48 space-y-1">
                <button
                  onClick={() => { on_copy(asset.video_url); set_show_playlist_menu(false); }}
                  className="w-full text-left px-3 py-1.5 text-[11px] font-bold text-text-main hover:bg-black/5 rounded-lg"
                >
                  Copy URL
                </button>
                <a
                  href={ott_service.get_video_download_url(ott_id, asset.id, 'playlist')}
                  className="block px-3 py-1.5 text-[11px] font-bold text-text-main hover:bg-black/5 rounded-lg"
                  onClick={() => set_show_playlist_menu(false)}
                >
                  Download playlist file
                </a>
                <p className="px-3 py-1 text-[10px] text-text-muted italic">
                  Conversion job coming soon
                </p>
              </div>
            )}
          </div>
        ) : (
          <a
            href={ott_service.get_video_download_url(ott_id, asset.id)}
            className="flex items-center gap-1 text-[10px] font-bold text-brand-emerald hover:underline"
          >
            <Download size={12} /> Download
          </a>
        )}
        <button
          onClick={() => on_delete(asset.id)}
          className="flex items-center gap-1 text-[10px] font-bold text-text-muted hover:text-red-500"
        >
          <Trash2 size={12} />
        </button>
      </div>
    </motion.div>
  );
};

export default CapturedVideosPage;
