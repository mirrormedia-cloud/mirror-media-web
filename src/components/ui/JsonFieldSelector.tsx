/**
 * VS Code-style JSON tree with checkboxes — the unified field-selection
 * component for Card Builder, Card Action mappings, Capture mappings, etc.
 *
 * Behaviour:
 * - Object/array branches expand/collapse but are not selectable.
 * - Primitive leaves are selectable via checkbox.
 * - Search filters paths and values; matches are highlighted, ancestors auto-expanded.
 * - Inside an array, the FIRST element is shown with `[0]` template indices —
 *   matches the existing API/card flow where rendering replaces `[0]` with the
 *   row index. Other items are hidden to keep the tree readable.
 *
 * For the right-pane "selected fields panel" (label/display_type/sort/visibility),
 * use this component's checkbox selection for the path side; the panel itself
 * lives in the consumer (e.g. FieldSelectorModal) since per-call configuration
 * varies (display_type values differ between contexts).
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronRight, Search, Check, X, ListTree, ListCollapse } from "lucide-react";
import {
    get_value_type,
    get_sample_value,
    type ValueType,
} from "../../utils/json_path_utils";

interface JsonFieldSelectorProps {
    /** Sample data: usually the first element of a list_path (so `[0]` template makes sense). */
    data: any;
    /** Currently selected paths (e.g. `data[0].title`). */
    selected: string[];
    on_change: (selected: string[]) => void;
    /** Limit to specific value types; primitives outside this set become non-selectable. */
    selectable_types?: ValueType[];
    /** When true, allow selecting nothing → empty array. */
    allow_empty?: boolean;
    /** Single select mode — checkboxes act as radios. */
    single?: boolean;
    /** Depth at which children start collapsed. Default 1. */
    default_expanded_depth?: number;
    /** When true, arrays start collapsed. Default false (since the user is picking inside arrays). */
    collapse_arrays_by_default?: boolean;
    max_items_per_array?: number;
    class_name?: string;
    max_height?: number;
    /** Show a header with select-all/clear-all/expand/collapse and a count. */
    show_toolbar?: boolean;
    /** Path-prefix to use for top-level keys. Useful when `data` is a sub-object of a larger response. */
    path_prefix?: string;
}

type ExpandState = Record<string, boolean>;

function path_join(prefix: string, segment: string | number): string {
    if (typeof segment === "number") return `${prefix}[${segment}]`;
    if (!prefix) return segment;
    return `${prefix}.${segment}`;
}

function value_kind(value: any): "object" | "array" | "primitive" {
    if (value === null || value === undefined) return "primitive";
    if (Array.isArray(value)) return "array";
    if (typeof value === "object") return "object";
    return "primitive";
}

export const JsonFieldSelector: React.FC<JsonFieldSelectorProps> = ({
    data,
    selected,
    on_change,
    selectable_types,
    allow_empty: _allow_empty = true,
    single = false,
    default_expanded_depth = 1,
    collapse_arrays_by_default = false,
    max_items_per_array = 1,
    class_name = "",
    max_height,
    show_toolbar = true,
    path_prefix = "",
}) => {
    const [expanded, set_expanded] = useState<ExpandState>({});
    const [search, set_search] = useState("");

    const selected_set = useMemo(() => new Set(selected), [selected]);

    const toggle_path = useCallback((path: string) => {
        if (single) {
            on_change(selected_set.has(path) ? [] : [path]);
            return;
        }
        const next = new Set(selected_set);
        if (next.has(path)) next.delete(path);
        else next.add(path);
        on_change(Array.from(next));
    }, [single, selected_set, on_change]);

    const is_expanded = useCallback((path: string, depth: number, kind: "object" | "array"): boolean => {
        if (path in expanded) return expanded[path];
        if (kind === "array" && collapse_arrays_by_default) return depth < 0;
        return depth < default_expanded_depth;
    }, [expanded, default_expanded_depth, collapse_arrays_by_default]);

    const toggle_expand = useCallback((path: string, depth: number, kind: "object" | "array") => {
        set_expanded(prev => ({ ...prev, [path]: !is_expanded(path, depth, kind) }));
    }, [is_expanded]);

    /** Walk to compute matched paths + every selectable leaf (used by select all). */
    const { matched, all_leaves } = useMemo(() => {
        const m = new Set<string>();
        const leaves: string[] = [];
        const term = search.toLowerCase();
        const has_search = term.length > 0;

        const walk = (val: any, p: string) => {
            const k = value_kind(val);
            if (k === "primitive") {
                const type = get_value_type(val, last_segment(p));
                const ok = !selectable_types || selectable_types.includes(type);
                if (ok) leaves.push(p);
                if (has_search) {
                    const matches_path = p.toLowerCase().includes(term);
                    const matches_value = String(val ?? "").toLowerCase().includes(term);
                    if (matches_path || matches_value) m.add(p);
                }
                return;
            }
            const entries = k === "array"
                ? (val as any[]).slice(0, max_items_per_array).map((v, i) => [i, v] as [number, any])
                : Object.entries(val as any);
            let any_child = false;
            for (const [key, child] of entries) {
                const next = path_join(p, key);
                walk(child, next);
                if (m.has(next)) any_child = true;
            }
            if (has_search && (p.toLowerCase().includes(term) || any_child)) m.add(p);
        };
        walk(data, path_prefix);
        return { matched: m, all_leaves: leaves };
    }, [data, search, selectable_types, max_items_per_array, path_prefix]);

    // Auto-expand to reveal matches.
    useEffect(() => {
        if (!search || matched.size === 0) return;
        set_expanded(prev => {
            const next = { ...prev };
            for (const p of matched) next[p] = true;
            return next;
        });
    }, [search, matched]);

    const expand_all = useCallback(() => {
        const all: ExpandState = {};
        const walk = (val: any, p: string) => {
            const k = value_kind(val);
            if (k === "object" || k === "array") {
                all[p] = true;
                const entries = k === "array"
                    ? (val as any[]).slice(0, max_items_per_array).map((v, i) => [i, v] as [number, any])
                    : Object.entries(val as any);
                for (const [key, child] of entries) walk(child, path_join(p, key));
            }
        };
        walk(data, path_prefix);
        set_expanded(all);
    }, [data, max_items_per_array, path_prefix]);

    const collapse_all = useCallback(() => {
        const all: ExpandState = {};
        const walk = (val: any, p: string) => {
            const k = value_kind(val);
            if (k === "object" || k === "array") {
                all[p] = false;
                const entries = k === "array"
                    ? (val as any[]).slice(0, max_items_per_array).map((v, i) => [i, v] as [number, any])
                    : Object.entries(val as any);
                for (const [key, child] of entries) walk(child, path_join(p, key));
            }
        };
        walk(data, path_prefix);
        set_expanded(all);
    }, [data, max_items_per_array, path_prefix]);

    const select_all_visible = useCallback(() => {
        if (single) return;
        on_change(Array.from(new Set([...selected, ...all_leaves])));
    }, [single, on_change, selected, all_leaves]);

    const clear_all = useCallback(() => {
        on_change([]);
    }, [on_change]);

    return (
        <div className={`bg-[#0d1117] border border-border-subtle rounded-2xl overflow-hidden font-mono text-sm flex flex-col ${class_name}`}>
            {show_toolbar && (
                <div className="flex items-center gap-2 px-3 py-2 border-b border-border-subtle bg-[#161b22]">
                    <div className="relative flex-1 min-w-0">
                        <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
                        <input
                            value={search}
                            onChange={(e) => set_search(e.target.value)}
                            placeholder="Search paths or values…"
                            className="w-full bg-black/40 border border-border-subtle rounded-lg pl-7 pr-2 py-1 text-xs text-text-main placeholder-text-muted/60 focus:outline-none focus:ring-1 focus:ring-brand-emerald/50"
                        />
                    </div>
                    <span className="text-xs text-text-muted shrink-0">
                        {selected.length} selected
                    </span>
                    {!single && (
                        <button
                            type="button"
                            onClick={select_all_visible}
                            className="text-xs text-text-muted hover:text-brand-emerald flex items-center gap-1 px-2 py-1 rounded hover:bg-white/5"
                            title="Select all selectable fields"
                        >
                            <Check size={12} />
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={clear_all}
                        className="text-xs text-text-muted hover:text-red-400 flex items-center gap-1 px-2 py-1 rounded hover:bg-white/5"
                        title="Clear selection"
                    >
                        <X size={12} />
                    </button>
                    <button
                        type="button"
                        onClick={expand_all}
                        className="text-xs text-text-muted hover:text-brand-emerald flex items-center gap-1 px-2 py-1 rounded hover:bg-white/5"
                        title="Expand all"
                    >
                        <ListTree size={12} />
                    </button>
                    <button
                        type="button"
                        onClick={collapse_all}
                        className="text-xs text-text-muted hover:text-brand-emerald flex items-center gap-1 px-2 py-1 rounded hover:bg-white/5"
                        title="Collapse all"
                    >
                        <ListCollapse size={12} />
                    </button>
                </div>
            )}
            <div
                className="overflow-auto p-3 leading-relaxed flex-1"
                style={max_height ? { maxHeight: max_height } : undefined}
            >
                <FieldNode
                    value={data}
                    name={null}
                    path={path_prefix}
                    depth={0}
                    selected_set={selected_set}
                    on_toggle_select={toggle_path}
                    is_expanded={is_expanded}
                    on_toggle_expand={toggle_expand}
                    selectable_types={selectable_types}
                    matched={matched}
                    has_search={search.length > 0}
                    max_items_per_array={max_items_per_array}
                />
            </div>
        </div>
    );
};

// ── Internals ──────────────────────────────────────────────────────────

function last_segment(path: string): string {
    if (!path) return "";
    const cleaned = path.replace(/\[\d+\]/g, "");
    const parts = cleaned.split(".");
    return parts[parts.length - 1] ?? "";
}

interface FieldNodeProps {
    value: any;
    name: string | number | null;
    path: string;
    depth: number;
    selected_set: Set<string>;
    on_toggle_select: (path: string) => void;
    is_expanded: (path: string, depth: number, kind: "object" | "array") => boolean;
    on_toggle_expand: (path: string, depth: number, kind: "object" | "array") => void;
    selectable_types?: ValueType[];
    matched: Set<string>;
    has_search: boolean;
    max_items_per_array: number;
}

const FieldNode: React.FC<FieldNodeProps> = (p) => {
    const k = value_kind(p.value);
    const dim = p.has_search && !p.matched.has(p.path);

    if (k === "object" || k === "array") {
        const expanded = p.is_expanded(p.path, p.depth, k);
        const entries = k === "array"
            ? (p.value as any[]).slice(0, p.max_items_per_array).map((v, i) => [i, v] as [number, any])
            : Object.entries(p.value as any);
        const summary = k === "array" ? `Array(${(p.value as any[]).length})` : `Object {${Object.keys(p.value as any).length}}`;

        return (
            <div className={dim ? "opacity-40" : ""}>
                <div
                    onClick={() => p.on_toggle_expand(p.path, p.depth, k)}
                    className="group flex items-center gap-1.5 py-0.5 -mx-1 px-1 rounded cursor-pointer hover:bg-white/5"
                >
                    <ChevronRight
                        size={12}
                        className={`text-text-muted shrink-0 transition-transform ${expanded ? "rotate-90" : ""}`}
                    />
                    <span className="w-4 shrink-0" />
                    <KeyLabel name={p.name} />
                    <span className={`${k === "array" ? "text-[#79c0ff]" : "text-[#d2a8ff]"} font-medium`}>
                        {summary}
                    </span>
                </div>
                {expanded && (
                    <div className="ml-3 border-l border-white/5 pl-3">
                        {entries.map(([key, child]) => (
                            <FieldNode
                                key={String(key)}
                                value={child}
                                name={key}
                                path={path_join(p.path, key)}
                                depth={p.depth + 1}
                                selected_set={p.selected_set}
                                on_toggle_select={p.on_toggle_select}
                                is_expanded={p.is_expanded}
                                on_toggle_expand={p.on_toggle_expand}
                                selectable_types={p.selectable_types}
                                matched={p.matched}
                                has_search={p.has_search}
                                max_items_per_array={p.max_items_per_array}
                            />
                        ))}
                        {k === "array" && (p.value as any[]).length > p.max_items_per_array && (
                            <div className="text-[10px] text-text-muted/70 italic py-1">
                                template — `[0]` represents every array index at render time
                            </div>
                        )}
                    </div>
                )}
            </div>
        );
    }

    // Primitive (selectable) ──────────────────────────────────────────
    const type = get_value_type(p.value, last_segment(p.path));
    const allowed = !p.selectable_types || p.selectable_types.includes(type);
    const checked = p.selected_set.has(p.path);

    return (
        <div className={dim ? "opacity-40" : ""}>
            <div
                onClick={() => allowed && p.on_toggle_select(p.path)}
                className={`group flex items-center gap-1.5 py-0.5 -mx-1 px-1 rounded ${allowed ? "cursor-pointer hover:bg-brand-emerald/5" : "cursor-not-allowed opacity-60"}`}
                title={allowed ? "Click to select" : `Type "${type}" not selectable`}
            >
                <span className="w-3 shrink-0" />
                <span
                    className={`shrink-0 w-3.5 h-3.5 border rounded flex items-center justify-center transition-colors ${checked ? "bg-brand-emerald border-brand-emerald" : "border-text-muted/50"} ${!allowed ? "opacity-30" : ""}`}
                >
                    {checked && <Check size={10} className="text-white" />}
                </span>
                <KeyLabel name={p.name} />
                <PrimitivePreview value={p.value} type={type} />
            </div>
        </div>
    );
};

const KeyLabel: React.FC<{ name: string | number | null }> = ({ name }) => {
    if (name === null) return <span className="text-text-muted/60">$</span>;
    if (typeof name === "number") return <span className="text-[#ffa657]">[{name}]:</span>;
    return <span className="text-[#7ee787]">"{name}":</span>;
};

const PrimitivePreview: React.FC<{ value: any; type: ValueType }> = ({ value, type }) => {
    const sample = get_sample_value(value, 80);
    const colour =
        type === "null" || type === "undefined" || type === "boolean" ? "text-[#ff7b72]"
        : type === "number" ? "text-[#79c0ff]"
        : "text-[#a5d6ff]";
    return (
        <>
            <span className={`${colour} truncate max-w-[400px]`} title={String(value)}>
                {sample}
            </span>
            <span className="ml-auto text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded bg-brand-blue/10 text-brand-blue/80 border border-brand-blue/20 shrink-0">
                {type}
            </span>
        </>
    );
};
