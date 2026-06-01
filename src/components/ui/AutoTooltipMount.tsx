/**
 * Global auto-tooltip — mounted once at the App root.
 *
 * Listens for `mouseover` / `mouseout` on the whole document, finds the
 * nearest ancestor with a `title` attribute, strips the native title
 * (so the OS doesn't show its plain tooltip), waits a brief delay, and
 * renders a themed bubble in its place. The original title is restored
 * when the cursor leaves so accessibility tools keep working.
 *
 * Result: every `<button title="…">` / `<span title="…">` already in
 * the codebase automatically gets the themed tooltip — no per-call
 * site changes required. For dynamic content / React-node tooltips,
 * use the explicit <Tooltip> wrapper instead.
 */

import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import ReactDOM from "react-dom";

const HOVER_DELAY_MS = 400;

interface BubbleState {
    x: number;
    y: number;
    text: string;
}

export const AutoTooltipMount: React.FC = () => {
    const [state, set_state] = useState<BubbleState | null>(null);
    const bubble_ref = useRef<HTMLDivElement | null>(null);
    // Track the live cursor so the bubble can anchor near it rather
    // than the static center of the hovered element. Updated on every
    // mousemove while a tooltip is visible.
    const cursor_ref = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

    useEffect(() => {
        let active_el: HTMLElement | null = null;
        let saved_title: string | null = null;
        let timer: number | null = null;

        const restore_title = () => {
            if (active_el && saved_title !== null) {
                if (!active_el.getAttribute("title")) {
                    active_el.setAttribute("title", saved_title);
                }
            }
            active_el = null;
            saved_title = null;
        };

        const reset = () => {
            if (timer !== null) { window.clearTimeout(timer); timer = null; }
            restore_title();
            set_state(null);
        };

        const handle_move = (e: MouseEvent) => {
            cursor_ref.current = { x: e.clientX, y: e.clientY };
        };

        const handle_over = (e: MouseEvent) => {
            const target = e.target as HTMLElement | null;
            if (!target || typeof target.closest !== "function") return;
            const el = target.closest<HTMLElement>("[title]");
            if (!el) return;
            if (el.getAttribute("data-tooltip-disabled") === "true") return;
            const text = el.getAttribute("title");
            if (!text) return;

            if (active_el === el) return;
            reset();
            active_el = el;
            saved_title = text;
            el.removeAttribute("title");
            // Capture the cursor where the hover started so the bubble
            // appears anchored to it from the get-go.
            cursor_ref.current = { x: e.clientX, y: e.clientY };

            if (timer !== null) window.clearTimeout(timer);
            timer = window.setTimeout(() => {
                if (!active_el) return;
                set_state({
                    x: cursor_ref.current.x,
                    y: cursor_ref.current.y - 14,
                    text,
                });
            }, HOVER_DELAY_MS);
        };

        const handle_out = (e: MouseEvent) => {
            const target = e.target as HTMLElement | null;
            if (!target || target !== active_el) {
                // Bubble-up case: the original target was a child of
                // active_el. Use relatedTarget (the next focused
                // element) to detect whether we actually left.
                const next = (e as MouseEvent).relatedTarget as HTMLElement | null;
                if (active_el && next && active_el.contains(next)) return;
            }
            reset();
        };

        // Hide the bubble on scroll / resize / Esc — it'd otherwise
        // float in stale coordinates.
        const handle_scroll = () => reset();
        const handle_key = (e: KeyboardEvent) => { if (e.key === "Escape") reset(); };
        // Hide immediately on any click / double-click. Otherwise a
        // tooltip lingers after the user has already opened the folder
        // (or navigated, or invoked the action) until they nudge the
        // cursor — which feels stale.
        const handle_click = () => reset();

        document.addEventListener("mouseover", handle_over, true);
        document.addEventListener("mouseout", handle_out, true);
        // mousemove keeps the cursor coordinates fresh — used by the
        // delayed timer so the bubble lands at the CURRENT cursor
        // position when the delay elapses, not the entry point.
        document.addEventListener("mousemove", handle_move, true);
        document.addEventListener("mousedown", handle_click, true);
        document.addEventListener("dblclick", handle_click, true);
        window.addEventListener("scroll", handle_scroll, true);
        window.addEventListener("resize", handle_scroll);
        window.addEventListener("keydown", handle_key);

        return () => {
            document.removeEventListener("mouseover", handle_over, true);
            document.removeEventListener("mouseout", handle_out, true);
            document.removeEventListener("mousemove", handle_move, true);
            document.removeEventListener("mousedown", handle_click, true);
            document.removeEventListener("dblclick", handle_click, true);
            window.removeEventListener("scroll", handle_scroll, true);
            window.removeEventListener("resize", handle_scroll);
            window.removeEventListener("keydown", handle_key);
            reset();
        };
    }, []);

    // Viewport clamp — measure rendered bubble and nudge if it would
    // overflow horizontally or off the top.
    useLayoutEffect(() => {
        if (!state) return;
        const el = bubble_ref.current;
        if (!el) return;
        const r = el.getBoundingClientRect();
        const margin = 6;
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        let nx = r.left;
        let ny = r.top;
        if (r.right > vw - margin) nx -= r.right - (vw - margin);
        if (r.left < margin) nx += margin - r.left;
        if (r.top < margin) {
            // Flip below the trigger if it'd run off the top.
            ny = state.y + 24;
        }
        if (r.bottom > vh - margin) ny -= r.bottom - (vh - margin);
        if (nx !== r.left || ny !== r.top) {
            el.style.left = `${nx}px`;
            el.style.top = `${ny}px`;
            el.style.transform = "none";
        }
    }, [state]);

    if (!state || typeof document === "undefined") return null;
    return ReactDOM.createPortal(
        <div
            ref={bubble_ref}
            role="tooltip"
            // `bg-bg-main` (fully opaque) + ring + heavy shadow so
            // file grid behind the bubble can never bleed through.
            // `truncate` is Tailwind's shorthand for
            // whitespace-nowrap + overflow-hidden + text-ellipsis,
            // capped by `max-w-sm` (~384px).
            className="fixed z-[9999] pointer-events-none select-none px-2.5 py-1.5 rounded-lg bg-bg-main border border-border-subtle text-text-main text-[11px] font-medium leading-tight ring-1 ring-black/40 max-w-sm truncate animate-in fade-in zoom-in-95 duration-100"
            style={{
                left: state.x,
                top: state.y,
                transform: "translate(-50%, -100%)",
                boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
            }}
        >
            {state.text}
        </div>,
        document.body,
    );
};
