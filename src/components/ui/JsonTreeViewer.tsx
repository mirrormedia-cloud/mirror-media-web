/**
 * VS Code-style JSON tree viewer.
 *
 * - Collapsible objects/arrays (arrows)
 * - Type-coloured values (string/number/bool/null + URL detection)
 * - Search with match highlight
 * - Expand all / Collapse all / Copy full JSON / Copy path / Copy value
 * - Lazy: nodes are only rendered when their parent is expanded, so huge
 *   responses stay snappy. Arrays are collapsed by default.
 */

import React, { useCallback, useMemo, useState, useEffect } from "react";
import { ChevronRight, Copy, Check, Search, ListTree, ListCollapse, FileJson, Maximize2, X } from "lucide-react";

interface JsonTreeViewerProps {
    data: any;
    /** Depth at which children start collapsed. Default 1 (root expanded). */
    default_expanded_depth?: number;
    /** When true, arrays are always collapsed regardless of depth. Default true. */
    collapse_arrays_by_default?: boolean;
    searchable?: boolean;
    show_copy_buttons?: boolean;
    show_path?: boolean;
    /** Hide the toolbar entirely (caller provides its own). */
    hide_toolbar?: boolean;
    /** Cap on visible array items per branch. Default 200. */
    max_items_per_array?: number;
    class_name?: string;
    /** When set, height is constrained and the body scrolls. */
    max_height?: number;
    /** Show a maximize button in the toolbar that opens the same tree in a
     *  full-screen overlay. Default true; pass false for embedded contexts
     *  (e.g. Debug Console rows) where a tiny button would be noisy. */
    allow_fullscreen?: boolean;
}

/** Path → boolean (true = expanded). */
type ExpandState = Record<string, boolean>;

function path_join(prefix: string, segment: string | number): string {
    if (typeof segment === "number") return `${prefix}[${segment}]`;
    if (!prefix) return segment;
    return `${prefix}.${segment}`;
}

function value_kind(value: any): "object" | "array" | "string" | "number" | "boolean" | "null" {
    if (value === null) return "null";
    if (Array.isArray(value)) return "array";
    return typeof value as any;
}

function detect_url(value: any): "image" | "video" | "url" | null {
    if (typeof value !== "string") return null;
    if (!/^https?:\/\//i.test(value)) return null;
    const lower = value.toLowerCase();
    if (/\.(jpg|jpeg|png|webp|gif|svg|avif)/.test(lower)) return "image";
    if (/\.(mp4|m3u8|mpd|webm|mov|mkv|ts)(\?|$)/.test(lower) || lower.includes("/video/")) return "video";
    return "url";
}

export const JsonTreeViewer: React.FC<JsonTreeViewerProps> = ({
    data,
    default_expanded_depth = 1,
    collapse_arrays_by_default = true,
    searchable = true,
    show_copy_buttons = true,
    show_path: _show_path = true,
    hide_toolbar = false,
    allow_fullscreen = true,
    max_items_per_array = 200,
    class_name = "",
    max_height,
}) => {
    const [expanded, set_expanded] = useState<ExpandState>({});
    const [search, set_search] = useState("");
    const [copied_path, set_copied_path] = useState<string | null>(null);
    const [copied_full, set_copied_full] = useState(false);
    const [is_fullscreen, set_is_fullscreen] = useState(false);

    // ESC closes the fullscreen overlay. Only attached while open so we
    // don't hijack ESC globally.
    useEffect(() => {
        if (!is_fullscreen) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") set_is_fullscreen(false);
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [is_fullscreen]);

    const is_expanded = useCallback((path: string, depth: number, kind: "object" | "array"): boolean => {
        if (path in expanded) return expanded[path];
        if (kind === "array" && collapse_arrays_by_default) return depth < 0;
        return depth < default_expanded_depth;
    }, [expanded, default_expanded_depth, collapse_arrays_by_default]);

    const toggle = useCallback((path: string, depth: number, kind: "object" | "array") => {
        set_expanded(prev => ({ ...prev, [path]: !is_expanded(path, depth, kind) }));
    }, [is_expanded]);

    const expand_all = useCallback(() => {
        const all: ExpandState = {};
        const walk = (val: any, p: string) => {
            const k = value_kind(val);
            if (k === "object" || k === "array") {
                all[p] = true;
                const entries = k === "array" ? (val as any[]).slice(0, max_items_per_array).map((v, i) => [i, v] as [number, any]) : Object.entries(val as any);
                for (const [key, child] of entries) {
                    walk(child, path_join(p, key));
                }
            }
        };
        walk(data, "");
        set_expanded(all);
    }, [data, max_items_per_array]);

    const collapse_all = useCallback(() => {
        // Force every container shut, including the root.
        const all: ExpandState = {};
        const walk = (val: any, p: string) => {
            const k = value_kind(val);
            if (k === "object" || k === "array") {
                all[p] = false;
                const entries = k === "array" ? (val as any[]).slice(0, max_items_per_array).map((v, i) => [i, v] as [number, any]) : Object.entries(val as any);
                for (const [key, child] of entries) {
                    walk(child, path_join(p, key));
                }
            }
        };
        walk(data, "");
        set_expanded(all);
    }, [data, max_items_per_array]);

    const copy_path = useCallback(async (path: string) => {
        try {
            await navigator.clipboard.writeText(path || "(root)");
            set_copied_path(path);
            setTimeout(() => set_copied_path(null), 1200);
        } catch { /* clipboard may be blocked */ }
    }, []);

    const copy_value = useCallback(async (value: any) => {
        try {
            const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
            await navigator.clipboard.writeText(text);
        } catch { /* ignore */ }
    }, []);

    const copy_full = useCallback(async () => {
        try {
            await navigator.clipboard.writeText(JSON.stringify(data, null, 2));
            set_copied_full(true);
            setTimeout(() => set_copied_full(false), 1200);
        } catch { /* ignore */ }
    }, [data]);

    /** Pre-compute which paths match the search so we can highlight + auto-expand them. */
    const matched_paths = useMemo<Set<string>>(() => {
        if (!search) return new Set();
        const term = search.toLowerCase();
        const out = new Set<string>();
        const walk = (val: any, p: string) => {
            const k = value_kind(val);
            const path_match = p.toLowerCase().includes(term);
            if (k === "object" || k === "array") {
                const entries = k === "array" ? (val as any[]).slice(0, max_items_per_array).map((v, i) => [i, v] as [number, any]) : Object.entries(val as any);
                let any_child_match = false;
                for (const [key, child] of entries) {
                    const next = path_join(p, key);
                    walk(child, next);
                    if (out.has(next)) any_child_match = true;
                }
                if (path_match || any_child_match) out.add(p);
            } else {
                const value_str = String(val ?? "").toLowerCase();
                if (path_match || value_str.includes(term)) out.add(p);
            }
        };
        walk(data, "");
        return out;
    }, [data, search, max_items_per_array]);

    // When searching, auto-expand matched ancestors.
    useEffect(() => {
        if (!search || matched_paths.size === 0) return;
        set_expanded(prev => {
            const next = { ...prev };
            for (const p of matched_paths) next[p] = true;
            return next;
        });
    }, [search, matched_paths]);

    return (
        // flex flex-col + the body's flex-1/min-h-0 makes the body fill the
        // remaining height inside any height-constrained parent (e.g. the
        // fullscreen overlay's flex-1 wrapper) so its overflow-auto actually
        // has something to overflow. Without this the body sized to content
        // and there was nothing to scroll in fullscreen mode.
        <div className={`bg-[#0d1117] dark:bg-[#0d1117] border border-border-subtle rounded-2xl overflow-hidden font-mono text-sm w-full min-w-0 flex flex-col ${class_name}`}>
            {!hide_toolbar && (
                <div className="flex items-center gap-2 px-3 py-2 border-b border-border-subtle bg-[#161b22]">
                    {searchable && (
                        <div className="relative flex-1 min-w-0">
                            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
                            <input
                                value={search}
                                onChange={(e) => set_search(e.target.value)}
                                placeholder="Search keys or values…"
                                className="w-full bg-black/40 border border-border-subtle rounded-lg pl-7 pr-2 py-1 text-xs text-text-main placeholder-text-muted/60 focus:outline-none focus:ring-1 focus:ring-brand-emerald/50"
                            />
                        </div>
                    )}
                    <button
                        type="button"
                        onClick={expand_all}
                        className="text-xs text-text-muted hover:text-brand-emerald flex items-center gap-1 px-2 py-1 rounded hover:bg-white/5"
                        title="Expand all"
                    >
                        <ListTree size={12} /> Expand
                    </button>
                    <button
                        type="button"
                        onClick={collapse_all}
                        className="text-xs text-text-muted hover:text-brand-emerald flex items-center gap-1 px-2 py-1 rounded hover:bg-white/5"
                        title="Collapse all"
                    >
                        <ListCollapse size={12} /> Collapse
                    </button>
                    <button
                        type="button"
                        onClick={copy_full}
                        className="text-xs text-text-muted hover:text-brand-emerald flex items-center gap-1 px-2 py-1 rounded hover:bg-white/5"
                        title="Copy full JSON"
                    >
                        {copied_full ? <Check size={12} className="text-brand-emerald" /> : <FileJson size={12} />}
                        {copied_full ? "Copied" : "Copy"}
                    </button>
                    {/* Maximize — opens the same JSON in a full-screen overlay
                        for comfortable viewing when the embedded panel is too
                        small. ESC + clicking the backdrop both close. */}
                    {allow_fullscreen && !is_fullscreen && (
                        <button
                            type="button"
                            onClick={() => set_is_fullscreen(true)}
                            className="text-xs text-text-muted hover:text-brand-emerald flex items-center gap-1 px-2 py-1 rounded hover:bg-white/5"
                            title="Open fullscreen viewer"
                        >
                            <Maximize2 size={12} />
                        </button>
                    )}
                </div>
            )}
            <div
                // When a max_height is given (embedded usage), the body's
                // own scroll is bounded by that pixel value. Otherwise rely
                // on the parent height + flex-1 to define the scroll region —
                // critical for the fullscreen overlay to be scrollable.
                className={`overflow-auto p-3 leading-relaxed ${max_height ? "" : "flex-1 min-h-0"}`}
                style={max_height ? { maxHeight: max_height } : undefined}
            >
                <Node
                    value={data}
                    name={null}
                    path=""
                    depth={0}
                    is_expanded={is_expanded}
                    toggle={toggle}
                    matched={matched_paths}
                    has_search={search.length > 0}
                    on_copy_path={show_copy_buttons ? copy_path : undefined}
                    on_copy_value={show_copy_buttons ? copy_value : undefined}
                    copied_path={copied_path}
                    max_items_per_array={max_items_per_array}
                />
            </div>

            {/* Fullscreen overlay. Renders a separate JsonTreeViewer (with
                allow_fullscreen=false to avoid recursion) inside a fixed
                full-viewport container. We pass the same data and search
                opens at default depth — the overlay is its own state, so
                expanding paths inside fullscreen doesn't pollute the embedded
                panel state. */}
            {is_fullscreen && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
                    <div
                        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
                        onClick={() => set_is_fullscreen(false)}
                    />
                    <div className="relative w-full max-w-6xl h-[92vh] flex flex-col rounded-2xl bg-[#0d1117] border border-border-subtle shadow-2xl overflow-hidden">
                        <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-border-subtle bg-[#161b22]">
                            <div className="flex items-center gap-2 min-w-0">
                                <FileJson size={14} className="text-brand-emerald shrink-0" />
                                <span className="text-xs font-bold text-text-main">JSON Viewer</span>
                                <span className="text-[10px] text-text-muted">· press ESC to close</span>
                            </div>
                            <button
                                type="button"
                                onClick={() => set_is_fullscreen(false)}
                                className="p-1.5 rounded-lg text-text-muted hover:text-text-main hover:bg-white/5"
                                title="Close fullscreen (Esc)"
                            >
                                <X size={16} />
                            </button>
                        </div>
                        <div className="flex-1 overflow-hidden">
                            <JsonTreeViewer
                                data={data}
                                default_expanded_depth={default_expanded_depth}
                                collapse_arrays_by_default={collapse_arrays_by_default}
                                searchable={searchable}
                                show_copy_buttons={show_copy_buttons}
                                max_items_per_array={max_items_per_array}
                                class_name="h-full border-0 rounded-none"
                                allow_fullscreen={false}
                            />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

// ── Internals ──────────────────────────────────────────────────────────

interface NodeProps {
    value: any;
    name: string | number | null;
    path: string;
    depth: number;
    is_expanded: (path: string, depth: number, kind: "object" | "array") => boolean;
    toggle: (path: string, depth: number, kind: "object" | "array") => void;
    matched: Set<string>;
    has_search: boolean;
    on_copy_path?: (path: string) => void;
    on_copy_value?: (value: any) => void;
    copied_path: string | null;
    max_items_per_array: number;
}

const Node: React.FC<NodeProps> = (p) => {
    const k = value_kind(p.value);
    const dim = p.has_search && !p.matched.has(p.path);

    if (k === "object" || k === "array") {
        const expanded = p.is_expanded(p.path, p.depth, k);
        const entries = k === "array"
            ? (p.value as any[]).slice(0, p.max_items_per_array).map((v, i) => [i, v] as [number, any])
            : Object.entries(p.value as any);
        const summary = k === "array" ? `Array(${(p.value as any[]).length})` : `Object {${Object.keys(p.value as any).length}}`;

        return (
            <div className={`${dim ? "opacity-40" : ""}`}>
                <Row
                    onToggle={() => p.toggle(p.path, p.depth, k)}
                    expanded={expanded}
                    showArrow
                >
                    <KeyLabel name={p.name} />
                    <span className={`${k === "array" ? "text-[#79c0ff]" : "text-[#d2a8ff]"} font-medium`}>{summary}</span>
                    {p.on_copy_path && (
                        <CopyBtn
                            kind={p.copied_path === p.path ? "ok" : "copy"}
                            onClick={(e) => { e.stopPropagation(); p.on_copy_path!(p.path); }}
                            title="Copy path"
                        />
                    )}
                </Row>
                {expanded && (
                    <div className="ml-3 border-l border-white/5 pl-3">
                        {entries.map(([key, child]) => (
                            <Node
                                key={String(key)}
                                value={child}
                                name={key}
                                path={path_join(p.path, key)}
                                depth={p.depth + 1}
                                is_expanded={p.is_expanded}
                                toggle={p.toggle}
                                matched={p.matched}
                                has_search={p.has_search}
                                on_copy_path={p.on_copy_path}
                                on_copy_value={p.on_copy_value}
                                copied_path={p.copied_path}
                                max_items_per_array={p.max_items_per_array}
                            />
                        ))}
                        {k === "array" && (p.value as any[]).length > p.max_items_per_array && (
                            <div className="text-xs text-text-muted/70 italic py-1">
                                … {(p.value as any[]).length - p.max_items_per_array} more items hidden
                            </div>
                        )}
                    </div>
                )}
            </div>
        );
    }

    // Primitive ────────────────────────────────────────────────────────
    return (
        <div className={`${dim ? "opacity-40" : ""}`}>
            <Row showArrow={false}>
                <div className="flex-1 min-w-0 flex flex-wrap items-baseline gap-1.5">
                    <KeyLabel name={p.name} />
                    <PrimitiveValue value={p.value} />
                </div>
                {p.on_copy_value && (p.value !== null && p.value !== undefined) && (
                    <CopyBtn
                        kind="copy"
                        onClick={(e) => { e.stopPropagation(); p.on_copy_value!(p.value); }}
                        title="Copy value"
                    />
                )}
                {p.on_copy_path && (
                    <CopyBtn
                        kind={p.copied_path === p.path ? "ok" : "path"}
                        onClick={(e) => { e.stopPropagation(); p.on_copy_path!(p.path); }}
                        title="Copy path"
                    />
                )}
            </Row>
        </div>
    );
};

const Row: React.FC<{
    onToggle?: () => void;
    expanded?: boolean;
    showArrow: boolean;
    children: React.ReactNode;
}> = ({ onToggle, expanded, showArrow, children }) => (
    <div
        onClick={onToggle}
        className={`group flex items-start gap-1.5 py-0.5 -mx-1 px-1 rounded min-w-0 ${onToggle ? "cursor-pointer hover:bg-white/5" : ""}`}
    >
        {showArrow ? (
            <ChevronRight
                size={12}
                className={`text-text-muted shrink-0 transition-transform mt-0.5 ${expanded ? "rotate-90" : ""}`}
            />
        ) : (
            <span className="w-3 shrink-0" />
        )}
        {children}
    </div>
);

const KeyLabel: React.FC<{ name: string | number | null }> = ({ name }) => {
    if (name === null) return <span className="text-text-muted/60">$</span>;
    if (typeof name === "number") return <span className="text-[#ffa657]">[{name}]:</span>;
    return <span className="text-[#7ee787]">"{name}"</span>;
};

const PrimitiveValue: React.FC<{ value: any }> = ({ value }) => {
    const k = value_kind(value);
    if (k === "null") return <span className="text-[#ff7b72]">null</span>;
    if (k === "boolean") return <span className="text-[#ff7b72]">{String(value)}</span>;
    if (k === "number") return <span className="text-[#79c0ff]">{String(value)}</span>;
    // String
    const url_kind = detect_url(value);
    if (url_kind) {
        return (
            <a
                href={value}
                target="_blank"
                rel="noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="text-[#a5d6ff] underline decoration-dotted hover:decoration-solid break-all min-w-0"
                title={value}
            >
                "{value}"
            </a>
        );
    }
    return (
        <span className="text-[#a5d6ff] break-all min-w-0" title={value}>
            "{String(value)}"
        </span>
    );
};

const CopyBtn: React.FC<{
    kind: "copy" | "path" | "ok";
    onClick: (e: React.MouseEvent) => void;
    title: string;
}> = ({ kind, onClick, title }) => (
    <button
        type="button"
        onClick={onClick}
        title={title}
        className="opacity-0 group-hover:opacity-100 text-text-muted hover:text-brand-emerald p-0.5 rounded transition-opacity shrink-0"
    >
        {kind === "ok" ? <Check size={11} className="text-brand-emerald" /> : <Copy size={11} />}
    </button>
);
