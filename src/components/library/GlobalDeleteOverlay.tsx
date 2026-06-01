/**
 * App-root overlay for in-flight delete operations. Mirrors
 * GlobalUploadOverlay so the popup persists across route changes — a
 * bulk delete of hundreds of items (which calls R2's delete API per
 * object plus the DB row) stays visible even if the user navigates away.
 *
 * Delete operations don't stream progress (the backend does the work
 * inside one endpoint call), so the bar is indeterminate until the
 * response lands. The label tells the user what's happening.
 */

import React from "react";
import ReactDOM from "react-dom";
import { Loader2, Trash2 } from "lucide-react";
import { useDeleteStatus } from "../../stores/delete_status_store";
import { useUploadStatus } from "../../stores/upload_status_store";

export const GlobalDeleteOverlay: React.FC = () => {
    const status = useDeleteStatus();
    // If an upload is also in progress we lift the delete popup above
    // it so neither overlaps. When the delete is the only one
    // active, sit at the standard 20px bottom-right.
    const upload = useUploadStatus();
    if (!status) return null;

    const pct = status.total > 0 ? Math.min(100, (status.done / status.total) * 100) : 0;
    const indeterminate = status.done === 0;

    // Standard 20px gap from bottom + right; lifted to ~160px when
    // the upload overlay is also visible so the two cards stack
    // cleanly instead of overlapping.
    const bottom_class = upload ? "bottom-[160px]" : "bottom-5";

    const node = (
        <div
            className={`fixed ${bottom_class} right-5 z-[1200] w-[360px] rounded-2xl border border-border-subtle bg-bg-main backdrop-blur-md ring-1 ring-black/30 transition-all`}
            style={{ boxShadow: "0 20px 50px rgba(0,0,0,0.5)" }}
        >
            <div className="p-4">
                <div className="flex items-center gap-2.5 mb-3">
                    <div className="w-9 h-9 rounded-xl bg-red-500/15 flex items-center justify-center shrink-0 text-red-400">
                        <Trash2 size={16} />
                    </div>
                    <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold text-text-main truncate flex items-center gap-2">
                            <Loader2 size={14} className="animate-spin text-red-400" />
                            Deleting {status.total} item{status.total === 1 ? "" : "s"}…
                        </p>
                        <p className="text-[11px] text-text-muted">
                            {indeterminate
                                ? "Removing from Storage…"
                                : `${status.done} / ${status.total} done · ${pct.toFixed(0)}%`}
                            {status.label ? ` · ${status.label}` : ""}
                        </p>
                    </div>
                </div>
                <div className="h-2 bg-bg-surface rounded-full overflow-hidden relative">
                    {indeterminate ? (
                        // Indeterminate shimmer — shows activity even
                        // though we don't have streaming per-item
                        // progress from the backend.
                        <div className="absolute inset-y-0 w-1/3 rounded-full bg-gradient-to-r from-transparent via-red-400 to-transparent animate-[shimmer_1.4s_linear_infinite]" />
                    ) : (
                        <div
                            className="h-full bg-gradient-to-r from-red-500 to-rose-400 transition-all duration-200 rounded-full"
                            style={{ width: `${pct}%` }}
                        />
                    )}
                </div>
            </div>
            <style>{`
                @keyframes shimmer {
                    0% { left: -33%; }
                    100% { left: 100%; }
                }
            `}</style>
        </div>
    );

    if (typeof document === "undefined") return node;
    return ReactDOM.createPortal(node, document.body);
};
