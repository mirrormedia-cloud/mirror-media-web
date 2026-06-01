/**
 * "Properties" popup — shows total size + per-item breakdown for the
 * currently selected library items. Toggled by Alt+Enter (Windows
 * Explorer Properties shortcut).
 *
 * The popup is anchored as a floating panel (top-right, below the
 * header) instead of a full modal so the user can keep working in
 * the grid while it's open. Dismiss with Esc, click outside, or the
 * X button.
 */

import React, { useEffect, useRef } from "react";
import ReactDOM from "react-dom";
import { X, FileVideo, FileImage, File as FileIcon, FileMusic } from "lucide-react";
import { LibraryItem } from "../../types";

function format_bytes(n: number | null | undefined): string {
    if (n === null || n === undefined || !Number.isFinite(n)) return "—";
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
    return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function icon_for(item: LibraryItem) {
    const t = item.save_type;
    if (t === "video") return FileVideo;
    if (t === "image" || t === "thumbnail") return FileImage;
    if (t === "playlist") return FileMusic;
    return FileIcon;
}

export const FileInfoPopup: React.FC<{
    items: LibraryItem[];
    on_close: () => void;
}> = ({ items, on_close }) => {
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handle_click = (e: MouseEvent) => {
            if (!ref.current) return;
            if (!ref.current.contains(e.target as Node)) on_close();
        };
        const handle_key = (e: KeyboardEvent) => {
            if (e.key === "Escape") on_close();
        };
        document.addEventListener("mousedown", handle_click, true);
        document.addEventListener("keydown", handle_key);
        return () => {
            document.removeEventListener("mousedown", handle_click, true);
            document.removeEventListener("keydown", handle_key);
        };
    }, [on_close]);

    const total_bytes = items.reduce((a: number, i) => a + (i.file_size ?? 0), 0);
    const by_type: Record<string, number> = {};
    for (const i of items) {
        const t = i.save_type ?? "file";
        by_type[t] = (by_type[t] ?? 0) + 1;
    }

    const node = (
        <div
            ref={ref}
            role="dialog"
            aria-modal="false"
            className="fixed top-24 right-5 z-[1300] w-[420px] max-h-[70vh] flex flex-col rounded-2xl border border-border-subtle bg-bg-main backdrop-blur-md ring-1 ring-black/40"
            style={{ boxShadow: "0 24px 60px rgba(0,0,0,0.5)" }}
        >
            <div className="flex items-center gap-3 px-5 py-4 border-b border-border-subtle/60">
                <div className="min-w-0 flex-1">
                    <p className="text-[10px] uppercase font-bold tracking-widest text-text-muted">Properties</p>
                    <p className="text-base font-bold text-text-main">
                        {items.length} item{items.length === 1 ? "" : "s"} selected
                    </p>
                </div>
                <button
                    type="button"
                    onClick={on_close}
                    className="w-8 h-8 rounded-full flex items-center justify-center text-text-muted hover:text-text-main hover:bg-bg-surface transition-colors"
                    aria-label="Close"
                    title="Close (Esc)"
                >
                    <X size={15} />
                </button>
            </div>

            <div className="px-5 py-3 border-b border-border-subtle/60 grid grid-cols-2 gap-3">
                <div>
                    <p className="text-[10px] uppercase font-bold tracking-widest text-text-muted">Total size</p>
                    <p className="text-lg font-bold text-text-main">{format_bytes(total_bytes)}</p>
                </div>
                <div>
                    <p className="text-[10px] uppercase font-bold tracking-widest text-text-muted">By type</p>
                    <p className="text-xs text-text-main font-medium">
                        {Object.entries(by_type).map(([t, n]) => `${n} ${t}`).join(" · ") || "—"}
                    </p>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto px-2 py-2">
                {items.length === 0 ? (
                    <p className="text-sm text-text-muted text-center py-6">No items selected.</p>
                ) : (
                    items.map((it) => {
                        const Icon = icon_for(it);
                        return (
                            <div key={it.id} className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-bg-surface/40">
                                <Icon size={20} className="text-text-muted shrink-0" />
                                <div className="min-w-0 flex-1">
                                    <p className="text-sm font-medium text-text-main truncate" title={it.title ?? it.file_name ?? ""}>
                                        {it.title || it.file_name || "Untitled"}
                                    </p>
                                    <p className="text-[10px] text-text-muted">
                                        {(it.file_ext || it.save_type || "file").toUpperCase()}
                                        {it.status ? ` · ${it.status.replace(/_/g, " ")}` : ""}
                                    </p>
                                </div>
                                <p className="text-xs text-text-main font-mono whitespace-nowrap shrink-0">
                                    {format_bytes(it.file_size ?? 0)}
                                </p>
                            </div>
                        );
                    })
                )}
            </div>

            <div className="px-5 py-2.5 border-t border-border-subtle/60 text-[10px] uppercase tracking-widest text-text-muted text-center">
                Alt+Enter to toggle
            </div>
        </div>
    );

    if (typeof document === "undefined") return node;
    return ReactDOM.createPortal(node, document.body);
};
