/**
 * Floating bottom-center action bar that appears whenever there are
 * selected items in a grid (library / captured videos). Renders via
 * portal so it sits above any modal/drawer chrome and isn't clipped by
 * the parent's overflow.
 *
 * Caller controls when it's visible by passing `count`; passing 0 hides
 * it. All actions are optional — pass `on_download={undefined}` to omit
 * the download button. Delete is special-cased since it's the most
 * common destructive action and gets red treatment.
 */

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Trash2, Download, X, Loader2, CalendarDays } from "lucide-react";

interface Props {
    count: number;
    on_clear: () => void;
    on_delete?: () => void | Promise<void>;
    on_download?: () => void | Promise<void>;
    /** When set, renders a "Schedule Upload" button before the destructive
     *  actions. Used by the library to launch the schedule wizard. */
    on_schedule?: () => void;
    /** Override the default "X items selected" copy. */
    label?: string;
    /** When true, dim and lock the delete / schedule buttons (e.g. while a
     *  delete is in flight). Does NOT affect the download button. */
    busy?: boolean;
    /** When true, the download button shows a spinner and is disabled. */
    download_busy?: boolean;
    /** Current download progress — shown as "done / total" inside the
     *  download button and as a thin progress bar at the bottom of the bar. */
    download_progress?: { done: number; total: number };
}

export const SelectionActionBar: React.FC<Props> = ({
    count, on_clear, on_delete, on_download, on_schedule, label,
    busy = false, download_busy = false, download_progress,
}) => {
    // Animate in/out with a tiny mount delay so the entrance transition
    // actually plays (mounting at `translate-y-0` from the start would skip).
    const [shown, set_shown] = useState(false);
    useEffect(() => {
        if (count > 0) {
            const t = setTimeout(() => set_shown(true), 0);
            return () => clearTimeout(t);
        }
        set_shown(false);
        return;
    }, [count]);

    if (count === 0 || typeof document === "undefined") return null;

    const display_label = label ?? `${count} ${count === 1 ? "item" : "items"} selected`;
    const pct = download_progress && download_progress.total > 0
        ? Math.round((download_progress.done / download_progress.total) * 100)
        : 0;

    return createPortal(
        <div
            // Fixed at bottom-center with safe padding from screen edges.
            // z-[1100] beats both modal overlays (z-100/200) and the search
            // dropdown portal (z-1000) so the bar stays clickable.
            className={`fixed left-1/2 -translate-x-1/2 z-[1100] transition-all duration-200 ease-out ${
                shown ? "bottom-6 opacity-100" : "bottom-2 opacity-0 pointer-events-none"
            }`}
            role="toolbar"
            aria-label="Selection actions"
        >
            <div className="relative flex items-center gap-2 px-3 py-2 rounded-2xl bg-bg-card border border-border-subtle shadow-2xl shadow-black/30 backdrop-blur-xl overflow-hidden">
                <span className="text-xs font-bold text-text-main px-2">
                    {display_label}
                </span>

                <span className="h-5 w-px bg-border-subtle" />

                {on_schedule && (
                    <button
                        type="button"
                        onClick={on_schedule}
                        disabled={busy}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-text-main hover:bg-brand-blue/10 hover:text-brand-blue disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        title="Schedule upload"
                    >
                        <CalendarDays size={14} />
                        Schedule Upload
                    </button>
                )}

                {on_download && (
                    <button
                        type="button"
                        onClick={() => { if (!download_busy) void on_download(); }}
                        disabled={busy || download_busy}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-colors disabled:cursor-not-allowed ${
                            download_busy
                                ? "text-brand-emerald opacity-80"
                                : "text-text-main hover:bg-brand-emerald/10 hover:text-brand-emerald disabled:opacity-50"
                        }`}
                        title={download_busy ? "Download in progress…" : "Download selected"}
                    >
                        {download_busy
                            ? <Loader2 size={14} className="animate-spin" />
                            : <Download size={14} />
                        }
                        {download_busy && download_progress
                            ? `${download_progress.done} / ${download_progress.total}`
                            : "Download"
                        }
                    </button>
                )}

                {on_delete && (
                    <button
                        type="button"
                        onClick={() => { void on_delete(); }}
                        disabled={busy}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-red-500 hover:bg-red-500/10 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        title="Delete selected"
                    >
                        {busy ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                        Delete
                    </button>
                )}

                <button
                    type="button"
                    onClick={on_clear}
                    disabled={busy}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-text-muted hover:bg-black/5 dark:hover:bg-white/5 hover:text-text-main disabled:opacity-50 transition-colors"
                    title="Clear selection (Esc)"
                >
                    <X size={14} />
                    Clear
                </button>

                {/* Progress bar — slides in from the left while a download
                    is in flight. Sits flush at the very bottom of the pill
                    and is clipped by the parent's overflow-hidden. */}
                {download_busy && (
                    <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-border-subtle">
                        <div
                            className="h-full bg-gradient-to-r from-brand-emerald to-brand-blue transition-all duration-300 ease-out"
                            style={{ width: `${pct}%` }}
                        />
                    </div>
                )}
            </div>
        </div>,
        document.body,
    );
};
