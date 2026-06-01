/**
 * Reusable searchable dropdown. Single + multi select, group support, keyboard
 * navigation, click-outside close, dark/light theme aware. Single source of truth
 * for every <select> in the OTT dashboard.
 *
 * Designed to drop in for native <select> with minimal prop changes — pass
 * options as `{label, value}[]` or as `string[]` (which is auto-mapped).
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, X, Search, Loader2, Inbox } from "lucide-react";

export interface SearchSelectOption {
    label: string;
    value: string;
    description?: string;
    group?: string;
    icon?: React.ReactNode;
    /** Inline tag rendered next to the label (e.g. "string", "url"). */
    badge?: string;
    disabled?: boolean;
}

type SingleProps = {
    is_multi?: false;
    value: string | null | undefined;
    on_change: (value: string | null) => void;
};
type MultiProps = {
    is_multi: true;
    value: string[];
    on_change: (value: string[]) => void;
};

type CommonProps = {
    options: SearchSelectOption[] | string[];
    placeholder?: string;
    search_placeholder?: string;
    is_clearable?: boolean;
    is_loading?: boolean;
    is_disabled?: boolean;
    empty_message?: string;
    error?: string;
    label?: string;
    size?: "sm" | "md";
    /** Render extra info inside the option row (e.g. type pill + sample). */
    render_option?: (opt: SearchSelectOption, state: { selected: boolean; active: boolean }) => React.ReactNode;
    /** Render the selected value display in the trigger. */
    render_value?: (opt: SearchSelectOption | null, all_selected: SearchSelectOption[]) => React.ReactNode;
    /** Optional max-height for the panel (CSS value). Defaults to 320px. */
    panel_max_height?: number;
    /** Override the default group ordering. */
    group_order?: string[];
    /** Class name extension for the trigger. */
    trigger_class?: string;
    /** When set, the panel is rendered with this id for testing. */
    id?: string;
};

export type CommonSearchSelectProps = CommonProps & (SingleProps | MultiProps);

function normalize_options(opts: SearchSelectOption[] | string[]): SearchSelectOption[] {
    return opts.map(o => typeof o === "string" ? { label: o, value: o } : o);
}

function match_text(needle: string, hay: string): boolean {
    if (!needle) return true;
    return hay.toLowerCase().includes(needle.toLowerCase());
}

export const CommonSearchSelect: React.FC<CommonSearchSelectProps> = (props) => {
    const {
        options: raw_options,
        placeholder = "Select…",
        search_placeholder = "Search…",
        is_clearable = false,
        is_loading = false,
        is_disabled = false,
        empty_message = "No options",
        error,
        label,
        size = "md",
        render_option,
        render_value,
        panel_max_height = 320,
        group_order,
        trigger_class = "",
        id,
    } = props;

    const options = useMemo(() => normalize_options(raw_options), [raw_options]);
    const [is_open, set_is_open] = useState(false);
    const [search, set_search] = useState("");
    const [active_index, set_active_index] = useState(0);
    /**
     * Where the dropdown panel opens relative to the trigger. Decided per-open
     * so a select near the bottom of the viewport flips upward instead of
     * extending past the page. Measured at the click that opens it; on resize
     * we keep the existing placement (changing it mid-open would feel jumpy).
     */
    const [placement, set_placement] = useState<"bottom" | "top">("bottom");
    /**
     * Fixed-positioning coords for the portal-rendered panel. Recomputed on
     * open + on scroll/resize. Rendering inside a portal escapes any
     * ancestor `overflow: hidden` (modal scroll containers) and any low
     * z-index stacking — the panel always paints on top.
     */
    const [panel_rect, set_panel_rect] = useState<{
        top: number;
        left: number;
        width: number;
    } | null>(null);
    const root_ref = useRef<HTMLDivElement | null>(null);
    const trigger_ref = useRef<HTMLButtonElement | null>(null);
    const panel_ref = useRef<HTMLDivElement | null>(null);
    const search_ref = useRef<HTMLInputElement | null>(null);
    const list_ref = useRef<HTMLDivElement | null>(null);

    const selected_values: string[] = props.is_multi
        ? props.value ?? []
        : (props.value !== null && props.value !== undefined ? [props.value] : []);
    const selected_options = useMemo(
        () => options.filter(o => selected_values.includes(o.value)),
        [options, selected_values],
    );

    // Filter + group ─────────────────────────────────────────────────────
    const filtered = useMemo(() => {
        if (!search) return options;
        return options.filter(o =>
            match_text(search, o.label) ||
            match_text(search, o.value) ||
            (o.description ? match_text(search, o.description) : false) ||
            (o.group ? match_text(search, o.group) : false),
        );
    }, [options, search]);

    const grouped = useMemo(() => {
        const map = new Map<string | null, SearchSelectOption[]>();
        for (const o of filtered) {
            const key = o.group ?? null;
            if (!map.has(key)) map.set(key, []);
            map.get(key)!.push(o);
        }
        const entries = Array.from(map.entries());
        if (group_order) {
            entries.sort(([a], [b]) => {
                const ai = a === null ? group_order.length : group_order.indexOf(a);
                const bi = b === null ? group_order.length : group_order.indexOf(b);
                return (ai === -1 ? group_order.length : ai) - (bi === -1 ? group_order.length : bi);
            });
        }
        return entries;
    }, [filtered, group_order]);

    /** Flat list (in render order) — used for keyboard navigation. */
    const flat = useMemo(() => grouped.flatMap(([, opts]) => opts), [grouped]);

    // Outside click + escape ─────────────────────────────────────────────
    // The panel is rendered in a portal (outside root_ref's subtree), so we
    // must check both root_ref AND panel_ref before deciding the click was
    // outside — otherwise clicking the search input would close the dropdown.
    useEffect(() => {
        if (!is_open) return;
        const onDoc = (e: MouseEvent) => {
            const target = e.target as Node;
            if (
                (root_ref.current && root_ref.current.contains(target)) ||
                (panel_ref.current && panel_ref.current.contains(target))
            ) return;
            set_is_open(false);
            set_search("");
        };
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                set_is_open(false);
                set_search("");
            }
        };
        document.addEventListener("mousedown", onDoc);
        document.addEventListener("keydown", onKey);
        return () => {
            document.removeEventListener("mousedown", onDoc);
            document.removeEventListener("keydown", onKey);
        };
    }, [is_open]);

    /**
     * Keep the portal panel pinned to the trigger when the user scrolls or
     * resizes the window. Without this the panel would visually "drift"
     * because it's now position: fixed in viewport coordinates while the
     * trigger moves with its scroll container.
     */
    useEffect(() => {
        if (!is_open) return;
        const reposition = () => {
            const el = trigger_ref.current;
            if (!el) return;
            const rect = el.getBoundingClientRect();
            set_panel_rect({ top: rect.top, left: rect.left, width: rect.width });
            // Also re-evaluate placement so a trigger that scrolls into a
            // tight spot near the bottom flips up mid-scroll.
            const panel_height = panel_max_height + 80;
            const space_below = window.innerHeight - rect.bottom;
            const space_above = rect.top;
            const flip_up = space_below < panel_height && space_above > space_below;
            set_placement(flip_up ? "top" : "bottom");
        };
        window.addEventListener("scroll", reposition, true);
        window.addEventListener("resize", reposition);
        return () => {
            window.removeEventListener("scroll", reposition, true);
            window.removeEventListener("resize", reposition);
        };
    }, [is_open, panel_max_height]);

    // Auto-focus search on open ──────────────────────────────────────────
    useEffect(() => {
        if (is_open) {
            // Defer to next tick so portal/focus works reliably.
            const t = setTimeout(() => search_ref.current?.focus(), 30);
            return () => clearTimeout(t);
        }
        return;
    }, [is_open]);

    // Reset active index when list changes ───────────────────────────────
    useEffect(() => {
        set_active_index(0);
    }, [search, is_open]);

    const choose = useCallback((opt: SearchSelectOption) => {
        if (opt.disabled) return;
        if (props.is_multi) {
            const set = new Set(props.value ?? []);
            if (set.has(opt.value)) set.delete(opt.value);
            else set.add(opt.value);
            props.on_change(Array.from(set));
        } else {
            props.on_change(opt.value);
            set_is_open(false);
            set_search("");
        }
    }, [props]);

    const clear = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        if (props.is_multi) props.on_change([]);
        else props.on_change(null);
    }, [props]);

    const remove_one = useCallback((value: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (props.is_multi) {
            props.on_change((props.value ?? []).filter(v => v !== value));
        } else {
            props.on_change(null);
        }
    }, [props]);

    /**
     * Decide where the panel should appear, then open. Defaults to bottom; if
     * there isn't enough space below for the panel AND the space above is
     * larger than the space below, flip to top. Falls back to bottom in any
     * tie or if measurement fails (no ref) — matches the user's spec
     * "default bottom" when neither side fits.
     */
    const open_with_smart_placement = useCallback(() => {
        const el = trigger_ref.current;
        // 80px ≈ search bar + paddings; matches the panel container's outer height
        // calc below. Exact pixels don't have to be perfect — we just need a
        // realistic estimate to choose direction.
        const panel_height = panel_max_height + 80;
        if (el && typeof window !== "undefined") {
            const rect = el.getBoundingClientRect();
            const space_below = window.innerHeight - rect.bottom;
            const space_above = rect.top;
            const flip_up = space_below < panel_height && space_above > space_below;
            set_placement(flip_up ? "top" : "bottom");
            set_panel_rect({ top: rect.top, left: rect.left, width: rect.width });
        } else {
            set_placement("bottom");
            set_panel_rect(null);
        }
        set_is_open(true);
    }, [panel_max_height]);

    const onKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
        if (!is_open) {
            if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown") {
                e.preventDefault();
                open_with_smart_placement();
            }
            return;
        }
        if (e.key === "ArrowDown") {
            e.preventDefault();
            set_active_index(i => Math.min(i + 1, flat.length - 1));
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            set_active_index(i => Math.max(0, i - 1));
        } else if (e.key === "Enter") {
            e.preventDefault();
            const opt = flat[active_index];
            if (opt) choose(opt);
        }
    };

    const trigger_padding = size === "sm" ? "py-2 px-3 text-sm" : "py-3 px-4";

    return (
        <div className="space-y-2 w-full" ref={root_ref}>
            {label && <label className="text-sm font-medium text-text-muted ml-1 block">{label}</label>}
            <div className="relative">
                <button
                    ref={trigger_ref}
                    id={id}
                    type="button"
                    disabled={is_disabled}
                    onClick={() => {
                        if (is_disabled) return;
                        if (is_open) set_is_open(false);
                        else open_with_smart_placement();
                    }}
                    onKeyDown={onKey as any}
                    className={`w-full bg-black/5 dark:bg-white/5 border ${error ? "border-red-500/50" : "border-border-subtle"} rounded-2xl ${trigger_padding} text-left transition-all flex items-center gap-2 group ${is_open ? "ring-2 ring-brand-emerald/50 border-brand-emerald" : ""} ${is_disabled ? "opacity-50 cursor-not-allowed" : "hover:border-brand-emerald/40"} ${trigger_class}`}
                >
                    <div className="flex-1 min-w-0">
                        {render_value ? (
                            render_value(selected_options[0] ?? null, selected_options)
                        ) : props.is_multi && selected_options.length > 0 ? (
                            <div className="flex flex-wrap gap-1.5">
                                {selected_options.map(opt => (
                                    <span
                                        key={opt.value}
                                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-medium bg-brand-emerald/15 text-brand-emerald border border-brand-emerald/30 max-w-[200px]"
                                        title={opt.label}
                                    >
                                        <span className="truncate">{opt.label}</span>
                                        <button
                                            type="button"
                                            onClick={(e) => remove_one(opt.value, e)}
                                            className="hover:text-white shrink-0"
                                        >
                                            <X size={12} />
                                        </button>
                                    </span>
                                ))}
                            </div>
                        ) : selected_options[0] ? (
                            <span className="truncate block text-text-main" title={selected_options[0].label}>
                                {selected_options[0].icon && <span className="mr-2 inline-flex">{selected_options[0].icon}</span>}
                                {selected_options[0].label}
                            </span>
                        ) : (
                            <span className="truncate block text-text-muted/60">{placeholder}</span>
                        )}
                    </div>
                    {is_loading && <Loader2 size={16} className="text-text-muted animate-spin shrink-0" />}
                    {is_clearable && selected_values.length > 0 && !is_disabled && (
                        <button
                            type="button"
                            onClick={clear}
                            className="text-text-muted hover:text-text-main shrink-0 p-0.5 rounded hover:bg-white/5"
                            aria-label="Clear"
                        >
                            <X size={14} />
                        </button>
                    )}
                    <ChevronDown
                        size={16}
                        className={`text-text-muted transition-transform shrink-0 ${is_open ? "rotate-180" : ""}`}
                    />
                </button>

                {is_open && panel_rect && typeof document !== "undefined" && createPortal(
                    <div
                        ref={panel_ref}
                        // Rendered to document.body via a portal with
                        // `position: fixed` so the panel always paints above
                        // any modal/scroll container chrome and is never
                        // clipped by an ancestor's `overflow: hidden`.
                        // z-[1000] keeps it above modal overlays (typically
                        // z-100) without going beyond toast portals.
                        //
                        // Whichever direction the panel opens, the search
                        // bar sits on the side closest to the trigger:
                        // - Opens down → search at top (just below trigger).
                        // - Opens up   → search at bottom (just above trigger).
                        // We achieve that with `flex-col-reverse` for the
                        // upward case so the search input is always one
                        // mouse-pixel away from the field the user just
                        // clicked.
                        className={`fixed z-[1000] bg-bg-surface backdrop-blur-xl border border-border-subtle rounded-2xl shadow-2xl overflow-hidden flex ${
                            placement === "top" ? "flex-col-reverse" : "flex-col"
                        }`}
                        // For the upward case we anchor by the panel's bottom
                        // edge (CSS `bottom`) so the panel hugs the trigger
                        // regardless of list length. Anchoring by `top` would
                        // assume max-height and leave a big gap above the
                        // trigger when only a few options exist — making the
                        // search input feel "far" from the field.
                        style={placement === "top" ? {
                            bottom: Math.max(8, (typeof window !== "undefined" ? window.innerHeight : 0) - panel_rect.top + 8),
                            left: panel_rect.left,
                            width: panel_rect.width,
                            maxHeight: panel_max_height + 80,
                        } : {
                            top: panel_rect.top + (trigger_ref.current?.offsetHeight ?? 0) + 8,
                            left: panel_rect.left,
                            width: panel_rect.width,
                            maxHeight: panel_max_height + 80,
                        }}
                    >
                        <div
                            className={`p-2 bg-bg-main/40 ${
                                placement === "top"
                                    ? "border-t border-border-subtle"
                                    : "border-b border-border-subtle"
                            }`}
                        >
                            <div className="relative">
                                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                                <input
                                    ref={search_ref}
                                    value={search}
                                    onChange={(e) => set_search(e.target.value)}
                                    onKeyDown={onKey as any}
                                    placeholder={search_placeholder}
                                    className="w-full bg-black/10 dark:bg-white/5 border border-border-subtle rounded-xl pl-9 pr-3 py-2 text-sm text-text-main placeholder-text-muted/60 focus:outline-none focus:ring-2 focus:ring-brand-emerald/50 focus:border-brand-emerald"
                                />
                            </div>
                        </div>
                        <div
                            ref={list_ref}
                            className="overflow-y-auto py-1"
                            style={{ maxHeight: panel_max_height }}
                        >
                            {is_loading ? (
                                <div className="flex items-center gap-2 px-4 py-6 text-sm text-text-muted justify-center">
                                    <Loader2 size={16} className="animate-spin" /> Loading…
                                </div>
                            ) : flat.length === 0 ? (
                                <div className="flex flex-col items-center justify-center gap-1 px-4 py-8 text-sm text-text-muted/70">
                                    <Inbox size={20} />
                                    <span>{empty_message}</span>
                                </div>
                            ) : (
                                grouped.map(([group, opts]) => (
                                    <div key={group ?? "__none"}>
                                        {group && (
                                            <div className="px-3 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-text-muted/70">
                                                {group}
                                            </div>
                                        )}
                                        {opts.map(opt => {
                                            const idx = flat.indexOf(opt);
                                            const selected = selected_values.includes(opt.value);
                                            const active = idx === active_index;
                                            return (
                                                <button
                                                    key={opt.value}
                                                    type="button"
                                                    disabled={opt.disabled}
                                                    onMouseEnter={() => set_active_index(idx)}
                                                    onClick={() => choose(opt)}
                                                    className={`w-full text-left px-3 py-2 flex items-center gap-2 transition-colors text-sm ${active ? "bg-brand-emerald/10" : ""} ${selected ? "text-brand-emerald" : "text-text-main"} ${opt.disabled ? "opacity-50 cursor-not-allowed" : "hover:bg-brand-emerald/5"}`}
                                                >
                                                    <span className="w-4 shrink-0 flex items-center justify-center">
                                                        {selected && <Check size={14} />}
                                                    </span>
                                                    {render_option ? (
                                                        render_option(opt, { selected, active })
                                                    ) : (
                                                        <div className="flex-1 min-w-0">
                                                            <div className="flex items-center gap-2 min-w-0">
                                                                {opt.icon}
                                                                <span className="truncate font-medium" title={opt.label}>{opt.label}</span>
                                                                {opt.badge && (
                                                                    <span className="text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded bg-brand-blue/15 text-brand-blue border border-brand-blue/30 shrink-0">
                                                                        {opt.badge}
                                                                    </span>
                                                                )}
                                                            </div>
                                                            {opt.description && (
                                                                <div className="text-xs text-text-muted truncate font-mono mt-0.5" title={opt.description}>
                                                                    {opt.description}
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}
                                                </button>
                                            );
                                        })}
                                    </div>
                                ))
                            )}
                        </div>
                    </div>,
                    document.body,
                )}
            </div>
            {error && <p className="text-xs text-red-400 ml-1 mt-1">{error}</p>}
        </div>
    );
};

// ── Helpers — turn FieldPathOption into a SearchSelectOption ────────────

import type { FieldPathOption } from "../../utils/json_path_utils";

const TYPE_BADGE: Record<string, string> = {
    string: "string",
    number: "number",
    boolean: "boolean",
    url: "url",
    image_url: "image",
    video_url: "video",
    id: "id",
    array: "array",
    object: "object",
    null: "null",
    undefined: "—",
};

export function field_path_options_to_select(opts: FieldPathOption[]): SearchSelectOption[] {
    return opts.map(o => ({
        label: o.value,
        value: o.value,
        description: `${o.type} • ${o.sample}`,
        group: o.group,
        badge: TYPE_BADGE[o.type] ?? o.type,
    }));
}
