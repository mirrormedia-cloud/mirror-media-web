/**
 * Desktop-style grid selection (Windows Explorer / macOS Finder semantics).
 *
 * Caller passes the *currently visible* item ids in render order. The hook
 * returns:
 *   - `selected_ids` — Set of currently selected ids
 *   - `is_selected(id)` — convenience query
 *   - `handle_item_click(id, e)` — call from a click handler; respects
 *      Ctrl (toggle), Shift (range), Ctrl+Shift (additive range).
 *      Plain click clears + selects only the clicked id.
 *   - `handle_background_click()` — call from the container click; clears.
 *   - `clear()`, `select_all()`
 *
 * Keyboard shortcuts (Ctrl+A select all, Esc clear) are auto-installed
 * while the hook is mounted. The `enabled` arg lets callers disable them
 * conditionally (e.g. when an input is focused).
 *
 * Anchor handling:
 *   - Plain click and Ctrl+click set the anchor to the clicked id.
 *   - Shift / Ctrl+Shift use the anchor → clicked id range, computed
 *     against the order in `ordered_ids`. If no anchor exists yet, falls
 *     back to a plain select.
 *   - clear() / select_all() reset the anchor.
 */

import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";

export interface GridSelection {
    selected_ids: Set<string>;
    selected_count: number;
    is_selected: (id: string) => boolean;
    handle_item_click: (id: string, e: React.MouseEvent | { ctrlKey?: boolean; metaKey?: boolean; shiftKey?: boolean }) => void;
    handle_background_click: () => void;
    clear: () => void;
    select_all: () => void;
    set_selected: (ids: string[]) => void;
}

interface Options {
    /** Currently visible item ids in render order. Required for Shift range
     *  semantics + Ctrl+A scope. Pass an empty array to disable both. */
    ordered_ids: string[];
    /** When false, keyboard shortcuts (Ctrl+A, Esc) are NOT installed. Use
     *  this when the page already has a focused input that should swallow
     *  those keys. Default true. */
    enabled?: boolean;
}

export function useGridSelection({ ordered_ids, enabled = true }: Options): GridSelection {
    const [selected_ids, set_selected_ids_state] = useState<Set<string>>(new Set());
    const anchor_ref = useRef<string | null>(null);
    // Keep a live ref to ordered_ids so the keyboard handlers always see
    // the latest list (the listener is registered once on mount).
    const ordered_ref = useRef<string[]>(ordered_ids);
    useEffect(() => { ordered_ref.current = ordered_ids; }, [ordered_ids]);

    const is_selected = useCallback((id: string) => selected_ids.has(id), [selected_ids]);

    const set_selected = useCallback((ids: string[]) => {
        set_selected_ids_state(new Set(ids));
    }, []);

    const clear = useCallback(() => {
        set_selected_ids_state(new Set());
        anchor_ref.current = null;
    }, []);

    const select_all = useCallback(() => {
        set_selected_ids_state(new Set(ordered_ref.current));
        anchor_ref.current = ordered_ref.current[0] ?? null;
    }, []);

    /**
     * Compute the range of ids between two anchors (inclusive) using the
     * current `ordered_ids` order. Returns [] if either id isn't present.
     */
    const range_between = useCallback((from_id: string, to_id: string): string[] => {
        const list = ordered_ref.current;
        const from_idx = list.indexOf(from_id);
        const to_idx = list.indexOf(to_id);
        if (from_idx === -1 || to_idx === -1) return [];
        const [lo, hi] = from_idx <= to_idx ? [from_idx, to_idx] : [to_idx, from_idx];
        return list.slice(lo, hi + 1);
    }, []);

    const handle_item_click = useCallback((
        id: string,
        e: React.MouseEvent | { ctrlKey?: boolean; metaKey?: boolean; shiftKey?: boolean },
    ) => {
        // macOS users use Cmd, Windows/Linux use Ctrl — treat both the same.
        const ctrl = !!(e.ctrlKey || e.metaKey);
        const shift = !!e.shiftKey;

        if (shift && anchor_ref.current) {
            const range = range_between(anchor_ref.current, id);
            if (ctrl) {
                // Ctrl+Shift — additive range: union with existing selection.
                set_selected_ids_state(prev => {
                    const next = new Set(prev);
                    for (const r of range) next.add(r);
                    return next;
                });
            } else {
                // Shift only — replace selection with the range.
                set_selected_ids_state(new Set(range));
            }
            // Anchor stays put for Shift — matches Explorer behaviour
            // (you can re-shift-click to widen/narrow the same range).
            return;
        }

        if (ctrl) {
            // Ctrl-click toggles the single id, sets anchor to it.
            set_selected_ids_state(prev => {
                const next = new Set(prev);
                if (next.has(id)) next.delete(id);
                else next.add(id);
                return next;
            });
            anchor_ref.current = id;
            return;
        }

        // Plain click — replace selection with just this id.
        set_selected_ids_state(new Set([id]));
        anchor_ref.current = id;
    }, [range_between]);

    const handle_background_click = useCallback(() => {
        // Don't clobber the anchor here — re-selecting the previously
        // anchored item should still work as a base for Shift-click later.
        set_selected_ids_state(new Set());
    }, []);

    // ── Keyboard shortcuts: Ctrl+A select all, Esc clear ─────────────────
    useEffect(() => {
        if (!enabled) return;
        const onKey = (e: KeyboardEvent) => {
            // Don't hijack typing in form fields. contentEditable also counts.
            const target = e.target as HTMLElement | null;
            const tag = target?.tagName?.toUpperCase();
            const in_input =
                tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT"
                || target?.isContentEditable;
            if (in_input) return;

            if ((e.ctrlKey || e.metaKey) && (e.key === "a" || e.key === "A")) {
                // Always preventDefault while the hook is mounted —
                // otherwise the browser's native "Select All Text"
                // kicks in and paints every label on the page blue
                // (sidebar, header, etc.) even when our grid is empty.
                e.preventDefault();
                if (ordered_ref.current.length > 0) {
                    set_selected_ids_state(new Set(ordered_ref.current));
                    anchor_ref.current = ordered_ref.current[0] ?? null;
                }
                return;
            }
            if (e.key === "Escape") {
                set_selected_ids_state(prev => prev.size > 0 ? new Set() : prev);
                anchor_ref.current = null;
                return;
            }
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [enabled]);

    return {
        selected_ids,
        selected_count: selected_ids.size,
        is_selected,
        handle_item_click,
        handle_background_click,
        clear,
        select_all,
        set_selected,
    };
}
