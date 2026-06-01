/**
 * Lightweight right-click context menu used by the Local Uploads file
 * manager. Positions itself at the cursor and clamps to the viewport so
 * it never overflows. Closes on:
 *   - escape
 *   - any click outside the menu
 *   - any item click (after the action runs)
 */

import React, { useEffect, useLayoutEffect, useRef, useState } from "react";

export interface ContextMenuItem {
    label: string;
    icon?: React.ComponentType<{ size?: number; className?: string }>;
    on_click: () => void;
    /** Renders red text + warning intent. */
    danger?: boolean;
    /** Adds a divider below this item. */
    separator_after?: boolean;
    disabled?: boolean;
    shortcut?: string;
}

interface Props {
    x: number;
    y: number;
    items: ContextMenuItem[];
    on_close: () => void;
}

export const ContextMenu: React.FC<Props> = ({ x, y, items, on_close }) => {
    const ref = useRef<HTMLDivElement>(null);
    const [pos, set_pos] = useState({ x, y });

    // Clamp to viewport. Measure after first render then adjust.
    useLayoutEffect(() => {
        const el = ref.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        let nx = x;
        let ny = y;
        if (nx + rect.width > vw - 8) nx = Math.max(8, vw - rect.width - 8);
        if (ny + rect.height > vh - 8) ny = Math.max(8, vh - rect.height - 8);
        set_pos({ x: nx, y: ny });
    }, [x, y]);

    useEffect(() => {
        const handle_click = (e: MouseEvent) => {
            if (!ref.current) return;
            if (!ref.current.contains(e.target as Node)) on_close();
        };
        const handle_key = (e: KeyboardEvent) => {
            if (e.key === "Escape") on_close();
        };
        // Use capture so the listener fires before regular onClick handlers
        // that might re-open another menu in the same tick.
        document.addEventListener("mousedown", handle_click, true);
        document.addEventListener("contextmenu", handle_click, true);
        document.addEventListener("keydown", handle_key);
        return () => {
            document.removeEventListener("mousedown", handle_click, true);
            document.removeEventListener("contextmenu", handle_click, true);
            document.removeEventListener("keydown", handle_key);
        };
    }, [on_close]);

    return (
        <div
            ref={ref}
            className="fixed z-[1000] min-w-[200px] py-1.5 rounded-xl border border-border-subtle bg-bg-card shadow-2xl backdrop-blur"
            style={{ left: pos.x, top: pos.y }}
            onClick={(e) => e.stopPropagation()}
            onContextMenu={(e) => e.preventDefault()}
        >
            {items.map((it, idx) => {
                const Icon = it.icon;
                return (
                    <React.Fragment key={idx}>
                        <button
                            type="button"
                            disabled={it.disabled}
                            onClick={() => {
                                if (it.disabled) return;
                                it.on_click();
                                on_close();
                            }}
                            className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left ${
                                it.disabled
                                    ? "text-text-muted opacity-50 cursor-not-allowed"
                                    : it.danger
                                        ? "text-red-400 hover:bg-red-500/10"
                                        : "text-text-main hover:bg-bg-surface"
                            }`}
                        >
                            {Icon && <Icon size={14} className={it.danger ? "text-red-400" : "text-text-muted"} />}
                            <span className="flex-1">{it.label}</span>
                            {it.shortcut && (
                                <span className="text-[10px] text-text-muted ml-3">{it.shortcut}</span>
                            )}
                        </button>
                        {it.separator_after && <div className="my-1 border-t border-border-subtle" />}
                    </React.Fragment>
                );
            })}
        </div>
    );
};
