/**
 * Detailed library card — image hero + title + status chip + format chip
 * + icon-only action toolbar (play, download, copy URL, copy path,
 * delete). Used by both the legacy OttLibraryPage and the unified
 * LibraryBrowserPage when "files view" is OFF.
 */

import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import toast from 'react-hot-toast';
import {
    Play,
    Download,
    Trash2,
    Copy,
    Image as ImageIcon,
    Check,
    Clapperboard,
    CalendarClock,
    Send,
} from 'lucide-react';
import { LibraryItem, LibraryItemStatus } from '../../types';
import { ott_service } from '../../services/ott_service';

export interface LibraryCardScheduleInfo {
    next_scheduledAt: string | null;
    platforms: string[];
}

/**
 * Status pill — post-R2 there's only one terminal state (`completed`)
 * because a library row exists only when the R2 upload succeeded.
 */
export const STATUS_BADGE_STYLE: Record<LibraryItemStatus, string> = {
    completed: 'bg-brand-emerald/10 text-brand-emerald',
};

export const STATUS_LABEL: Record<LibraryItemStatus, string> = {
    completed: 'Completed',
};

export interface LibraryCardProps {
    item: LibraryItem;
    ott_id: string;
    /** Visual selected state — adds a check chip in the corner. The outer
     *  ring/shadow is applied by the wrapper, not by the card itself. */
    selected?: boolean;
    /** When set, renders a "Scheduled MMM D" badge on the hero. Pulled from
     *  the calendar service's library_schedule_status feed. */
    schedule?: LibraryCardScheduleInfo | null;
    on_play: () => void;
    on_delete: () => void;
    on_retry: () => void;
    on_copy_path: () => void;
    /** When set, renders a "Share to social" toolbar button that calls back. */
    on_share_social?: () => void;
    /** Fires when the user clicks/taps a row that ISN'T ready for playback —
     *  parent surfaces a status popup with a Re-upload button. Without
     *  this callback the click is a no-op (legacy behaviour). */
    on_status_popup?: () => void;
    /** Kept for backwards compatibility with callers that still pass
     *  them — no-ops since HLS was removed in the R2 migration. */
    on_generate_hls?: () => void;
    on_regenerate_hls?: () => void;
}

function format_short_date(iso: string | null): string {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export const LibraryCard: React.FC<LibraryCardProps> = ({ item, ott_id, selected = false, schedule = null, on_play, on_delete, on_copy_path, on_share_social, on_status_popup }) => {
    // When the hero <img> fails to load we hide it and fall through to
    // the placeholder icon.
    const [img_failed, set_img_failed] = useState(false);
    const hero_src = item.thumbnail_display_url ?? item.thumbnail_url ?? item.image_url ?? null;
    useEffect(() => { set_img_failed(false); }, [hero_src]);
    const file_type = item.file_type ?? null;
    const has_video = !!item.file_url && (file_type === 'video' || file_type === 'playlist' || item.save_type === 'video' || (item.mime_type ?? '').startsWith('video/'));
    const has_image = !!item.thumbnail_display_url
        || file_type === 'image'
        || file_type === 'thumbnail'
        || (!!item.file_url && (item.mime_type ?? '').startsWith('image/'));
    const format = (item.file_ext || item.original_video_type || '').toUpperCase();
    const can_play = !!item.file_url;
    const handle_hero_click = can_play
        ? on_play
        : (on_status_popup ?? (() => undefined));

    // Tiny icon-button helper. All actions in the toolbar share the same
    // size + hover treatment so the row reads as a uniform action strip
    // instead of a mix of styles.
    const action_btn_class =
        'flex h-8 w-8 items-center justify-center rounded-lg text-text-muted transition-colors ' +
        'hover:text-text-main hover:bg-black/5 dark:hover:bg-white/5 ' +
        'disabled:pointer-events-none disabled:opacity-35';

    return (
        <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className={`group relative rounded-2xl bg-bg-card border overflow-hidden flex flex-col transition-colors ${
                selected ? 'border-brand-emerald' : 'border-border-subtle hover:border-brand-emerald/40'
            }`}
        >
            {selected && (
                <span className="absolute top-2 left-2 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-brand-emerald text-white shadow-md">
                    <Check size={14} strokeWidth={3} />
                </span>
            )}
            <button
                type="button"
                onClick={handle_hero_click}
                disabled={!can_play && !on_status_popup}
                className={`aspect-video bg-black/20 relative block w-full text-left ${can_play || on_status_popup ? 'cursor-pointer' : 'cursor-default'}`}
            >
                {hero_src && !img_failed ? (
                    <img
                        src={hero_src}
                        alt={item.title ?? 'item'}
                        className="w-full h-full object-cover transition-transform group-hover:scale-[1.02]"
                        referrerPolicy="no-referrer"
                        onError={() => set_img_failed(true)}
                    />
                ) : (
                    <div className="w-full h-full flex items-center justify-center text-text-muted">
                        {has_image ? <ImageIcon size={32} /> : has_video ? <Play size={32} /> : <Clapperboard size={32} />}
                    </div>
                )}
                <span className={`absolute top-2 right-2 text-[10px] font-bold uppercase px-2 py-0.5 rounded-lg tracking-wider ${STATUS_BADGE_STYLE.completed}`}>
                    {STATUS_LABEL.completed}
                </span>
                {format && (
                    <span className="absolute top-2 left-2 text-[10px] font-bold uppercase px-2 py-0.5 rounded-lg bg-black/60 text-white tracking-wider">
                        {format}
                    </span>
                )}
                {schedule?.next_scheduledAt && (
                    <span
                        className="absolute bottom-2 left-2 flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-lg bg-brand-blue/90 text-white tracking-wider"
                        title={`Scheduled: ${new Date(schedule.next_scheduledAt).toLocaleString()}${schedule.platforms.length ? ` — ${schedule.platforms.join(', ')}` : ''}`}
                    >
                        <CalendarClock size={11} />
                        {format_short_date(schedule.next_scheduledAt)}
                    </span>
                )}
                {can_play && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/30 transition-colors">
                        <span className="opacity-0 group-hover:opacity-100 transition-opacity p-3 rounded-full bg-brand-emerald text-white shadow-lg">
                            <Play size={20} fill="currentColor" />
                        </span>
                    </div>
                )}
            </button>

            <div className="px-3 pt-3 pb-2">
                <p
                    className="text-sm font-bold text-text-main line-clamp-2 leading-snug"
                    title={item.title ?? ''}
                >
                    {item.title ?? '(no title)'}
                </p>
            </div>

            <div className="px-2 py-2 border-t border-border-subtle flex items-center gap-1">
                {can_play ? (
                    <button onClick={on_play} className={action_btn_class + ' text-brand-emerald hover:text-brand-emerald'} title="Play">
                        <Play size={15} fill="currentColor" />
                    </button>
                ) : (
                    <span className="h-8 w-8" />
                )}

                <span className="ml-auto flex items-center gap-1">
                    {item.file_url && (
                        <a
                            href={item.file_url ?? item.download_url ?? ott_service.get_library_download_url(ott_id, item.id)}
                            className={action_btn_class}
                            title="Download file"
                            target="_blank"
                            rel="noopener noreferrer"
                        >
                            <Download size={14} />
                        </a>
                    )}
                    {item.file_url && (
                        <button
                            onClick={async () => {
                                try {
                                    await navigator.clipboard.writeText(item.file_url!);
                                    toast.success('File URL copied');
                                } catch { toast.error('Clipboard not available'); }
                            }}
                            className={action_btn_class}
                            title="Copy file URL"
                        >
                            <Copy size={14} />
                        </button>
                    )}
                    {item.file_url && on_share_social && (
                        <button
                            onClick={on_share_social}
                            className={action_btn_class + ' text-brand-emerald hover:text-brand-emerald'}
                            title="Upload / schedule to YouTube, Facebook, Instagram"
                        >
                            <Send size={14} />
                        </button>
                    )}
                    {/* HLS controls removed in the R2 migration. */}
                    <button
                        onClick={on_copy_path}
                        className={action_btn_class}
                        title="Copy local file path"
                    >
                        <ImageIcon size={14} />
                    </button>
                    <button
                        onClick={on_delete}
                        className={action_btn_class + ' hover:!text-red-500 hover:!bg-red-500/10'}
                        title="Delete"
                    >
                        <Trash2 size={14} />
                    </button>
                </span>
            </div>
        </motion.div>
    );
};
