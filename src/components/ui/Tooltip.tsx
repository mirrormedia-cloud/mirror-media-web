/**
 * Themed tooltip — drop-in replacement for the native `title` attribute.
 *
 * Wraps a SINGLE child element (button, icon, span, etc.), clones it
 * to attach hover/focus listeners, and renders the tooltip via portal
 * so it can never be clipped by parent overflow / z-index. Honours the
 * system theme via `bg-bg-card` / `text-text-main` etc.
 *
 *   <Tooltip content="Cancel upload" side="top">
 *     <button onClick={cancel}><X size={15} /></button>
 *   </Tooltip>
 *
 * Notes:
 *   - Triggers on hover AND keyboard focus (accessibility).
 *   - Press Esc to dismiss while hovered.
 *   - Defaults to a 400ms delay so the tooltip doesn't strobe as the
 *     mouse passes over densely-packed icon rows.
 *   - Pass `content={null}` or an empty string to disable; the child
 *     is rendered untouched.
 */

import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import ReactDOM from "react-dom";

export type TooltipSide = "top" | "bottom" | "left" | "right";

interface TooltipProps {
    content: React.ReactNode;
    side?: TooltipSide;
    /** Hover delay in ms. Default 400. Set 0 for instant. */
    delay?: number;
    /** Extra className for the floating bubble. */
    bubble_class?: string;
    /** When false the tooltip is disabled and the child is rendered
     *  as-is (useful when the label depends on state). Default true. */
    enabled?: boolean;
    children: React.ReactElement;
}

interface FloatingState {
    x: number;
    y: number;
    side: TooltipSide;
}

export const Tooltip: React.FC<TooltipProps> = ({
    content,
    side = "top",
    delay = 400,
    bubble_class = "",
    enabled = true,
    children,
}) => {
    const trigger_ref = useRef<HTMLElement | null>(null);
    const bubble_ref = useRef<HTMLDivElement | null>(null);
    const timer_ref = useRef<number | null>(null);
    const [open, set_open] = useState(false);
    const [pos, set_pos] = useState<FloatingState | null>(null);

    const compute = useCallback((): FloatingState | null => {
        const el = trigger_ref.current;
        if (!el) return null;
        const r = el.getBoundingClientRect();
        const offset = 8;
        switch (side) {
            case "bottom":
                return { x: r.left + r.width / 2, y: r.bottom + offset, side };
            case "left":
                return { x: r.left - offset, y: r.top + r.height / 2, side };
            case "right":
                return { x: r.right + offset, y: r.top + r.height / 2, side };
            case "top":
            default:
                return { x: r.left + r.width / 2, y: r.top - offset, side: "top" };
        }
    }, [side]);

    const show = useCallback(() => {
        if (!enabled || content === null || content === undefined || content === "") return;
        if (timer_ref.current !== null) window.clearTimeout(timer_ref.current);
        timer_ref.current = window.setTimeout(() => {
            const p = compute();
            if (p) {
                set_pos(p);
                set_open(true);
            }
        }, Math.max(0, delay));
    }, [compute, content, delay, enabled]);

    const hide = useCallback(() => {
        if (timer_ref.current !== null) {
            window.clearTimeout(timer_ref.current);
            timer_ref.current = null;
        }
        set_open(false);
    }, []);

    // Cleanup on unmount.
    useEffect(() => () => {
        if (timer_ref.current !== null) window.clearTimeout(timer_ref.current);
    }, []);

    // Esc dismisses while open.
    useEffect(() => {
        if (!open) return;
        const handler = (e: KeyboardEvent) => { if (e.key === "Escape") hide(); };
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, [open, hide]);

    // After the bubble mounts, clamp it to the viewport so it never
    // overflows. We measure the rendered bubble then nudge the floating
    // coordinates if needed.
    useLayoutEffect(() => {
        if (!open || !pos) return;
        const el = bubble_ref.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const margin = 6;
        let nx = rect.left;
        let ny = rect.top;
        if (rect.right > vw - margin) nx -= rect.right - (vw - margin);
        if (rect.left < margin) nx += margin - rect.left;
        if (rect.bottom > vh - margin) ny -= rect.bottom - (vh - margin);
        if (rect.top < margin) ny += margin - rect.top;
        if (nx !== rect.left || ny !== rect.top) {
            el.style.left = `${nx}px`;
            el.style.top = `${ny}px`;
            el.style.transform = "none";
        }
    }, [open, pos]);

    if (!enabled || content === null || content === undefined || content === "") {
        return children;
    }

    // Merge our event handlers with whatever the child already has.
    const original = children.props as any;
    const merged: any = {
        ref: (el: HTMLElement | null) => {
            trigger_ref.current = el;
            const original_ref = (children as any).ref;
            if (typeof original_ref === "function") original_ref(el);
            else if (original_ref && typeof original_ref === "object") {
                (original_ref as React.MutableRefObject<HTMLElement | null>).current = el;
            }
        },
        onMouseEnter: (e: React.MouseEvent) => {
            show();
            if (original.onMouseEnter) original.onMouseEnter(e);
        },
        onMouseLeave: (e: React.MouseEvent) => {
            hide();
            if (original.onMouseLeave) original.onMouseLeave(e);
        },
        onFocus: (e: React.FocusEvent) => {
            show();
            if (original.onFocus) original.onFocus(e);
        },
        onBlur: (e: React.FocusEvent) => {
            hide();
            if (original.onBlur) original.onBlur(e);
        },
        // Strip native title — we render our themed bubble instead, no
        // need for the OS double-tooltip.
        title: undefined,
    };

    // Translate fractions chosen so the bubble is centered over the
    // trigger axis (top/bottom: horizontally centered; left/right:
    // vertically centered) before the viewport clamp kicks in.
    const transform = pos?.side === "top" ? "translate(-50%, -100%)"
        : pos?.side === "bottom" ? "translate(-50%, 0)"
        : pos?.side === "left" ? "translate(-100%, -50%)"
        : "translate(0, -50%)";

    const bubble = open && pos ? ReactDOM.createPortal(
        <div
            ref={bubble_ref}
            role="tooltip"
            // `bg-bg-main` (fully opaque) + ring + heavy shadow so
            // the content behind the bubble doesn't bleed through.
            // Capped at `max-w-sm` (~384px); `truncate` is shorthand
            // for whitespace-nowrap + overflow-hidden + text-ellipsis.
            className={`fixed z-[9999] pointer-events-none select-none px-2.5 py-1.5 rounded-lg bg-bg-main border border-border-subtle text-text-main text-[11px] font-medium leading-tight ring-1 ring-black/40 max-w-sm truncate animate-in fade-in zoom-in-95 duration-100 ${bubble_class}`}
            style={{ left: pos.x, top: pos.y, transform, boxShadow: "0 8px 24px rgba(0,0,0,0.5)" }}
        >
            {content}
        </div>,
        document.body,
    ) : null;

    return (
        <>
            {React.cloneElement(children, merged)}
            {bubble}
        </>
    );
};
