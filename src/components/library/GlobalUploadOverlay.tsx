/**
 * App-root overlay that surfaces the current Local Uploads upload.
 * Subscribes to the module-level upload-status store so the popup
 * persists across route changes — switching from the library to
 * Schedules/Calendar/etc. doesn't make it disappear.
 *
 * The X (top-right) AND the bottom Cancel button both call the
 * abort handle stored in the status, which aborts the in-flight
 * axios request immediately.
 */

import React from "react";
import ReactDOM from "react-dom";
import { Loader2, X } from "lucide-react";
import toast from "react-hot-toast";
import { useUploadStatus, set_upload_status } from "../../stores/upload_status_store";
import { Tooltip } from "../ui/Tooltip";

export const GlobalUploadOverlay: React.FC = () => {
    const status = useUploadStatus();
    if (!status) return null;

    const pct = status.total > 0 ? Math.min(100, (status.loaded / status.total) * 100) : 0;

    const cancel = () => {
        try { status.abort(); } catch { /* no-op */ }
        // Optimistically clear so the popup hides instantly. The
        // initiating page's catch block also clears, but a fast-second
        // user click shouldn't have to wait on the network unwind.
        set_upload_status(null);
        toast("Upload cancelled", { icon: "✕" });
    };

    const node = (
        <div
            className="fixed bottom-5 right-5 z-[1200] w-[360px] rounded-2xl border border-border-subtle bg-bg-main backdrop-blur-md ring-1 ring-black/30"
            style={{ boxShadow: "0 20px 50px rgba(0,0,0,0.5)" }}
        >
            <div className="p-4">
                <div className="flex items-center gap-2.5 mb-3">
                    <div className="w-9 h-9 rounded-xl bg-brand-emerald/15 flex items-center justify-center shrink-0">
                        <Loader2 size={18} className="animate-spin text-brand-emerald" />
                    </div>
                    <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold text-text-main truncate">
                            {status.count > 1
                                ? `Uploading ${status.done_count} of ${status.count} files…`
                                : `Uploading ${status.count} file…`}
                        </p>
                        <p className="text-[11px] text-text-muted">
                            {(status.loaded / 1024 / 1024).toFixed(1)} / {(status.total / 1024 / 1024).toFixed(1)} MB · {pct.toFixed(0)}%
                            {status.label ? ` · ${status.label}` : ""}
                        </p>
                    </div>
                    <Tooltip content="Cancel upload" side="left">
                        <button
                            type="button"
                            onClick={cancel}
                            className="w-7 h-7 rounded-full flex items-center justify-center text-text-muted hover:text-red-400 hover:bg-red-500/10 transition-colors shrink-0"
                            aria-label="Cancel upload"
                        >
                            <X size={15} />
                        </button>
                    </Tooltip>
                </div>
                <div className="h-2 bg-bg-surface rounded-full overflow-hidden">
                    <div
                        className="h-full bg-gradient-to-r from-brand-emerald to-brand-blue transition-all duration-200 rounded-full"
                        style={{ width: `${pct}%` }}
                    />
                </div>
            </div>
        </div>
    );

    if (typeof document === "undefined") return node;
    return ReactDOM.createPortal(node, document.body);
};
