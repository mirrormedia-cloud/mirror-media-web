/**
 * JSON path utilities. Extends `apiDataUtils.ts` with type detection, sample
 * value extraction, and richer "field option" objects used by the new
 * CommonSearchSelect / JsonFieldSelector components. Existing helpers are
 * re-exported under snake_case names so callers can migrate gradually.
 */

import {
    extractFieldPaths,
    extract_field_paths_from_list_response,
    extract_paths_with_arrays,
    findArrayPaths,
    getValueByPath,
    isImageUrl,
    replaceArrayIndexInPath,
} from "./apiDataUtils";

// ── Re-exports under snake_case ─────────────────────────────────────────
export const get_value_by_path = getValueByPath;
export const replace_array_index_in_path = replaceArrayIndexInPath;
export const find_array_paths = findArrayPaths;
export const extract_field_paths = extractFieldPaths;
export {
    extract_field_paths_from_list_response,
    extract_paths_with_arrays,
    isImageUrl as is_image_url,
};

// ── Value type detection ────────────────────────────────────────────────

export type ValueType =
    | "null"
    | "undefined"
    | "string"
    | "number"
    | "boolean"
    | "array"
    | "object"
    | "url"
    | "image_url"
    | "video_url"
    | "id";

export const VALUE_TYPE_GROUPS: Record<ValueType, string> = {
    null: "Empty fields",
    undefined: "Empty fields",
    string: "Text fields",
    number: "Number fields",
    boolean: "Boolean fields",
    array: "Array fields",
    object: "Object fields",
    url: "URL fields",
    image_url: "Image fields",
    video_url: "Video fields",
    id: "ID fields",
};

const VIDEO_EXTENSIONS = [".mp4", ".m3u8", ".mpd", ".webm", ".mov", ".mkv", ".ts"];

export function is_url(value: any): boolean {
    return typeof value === "string" && /^https?:\/\//i.test(value);
}

export function is_video_url(value: any): boolean {
    if (!is_url(value)) return false;
    const lower = String(value).toLowerCase();
    return VIDEO_EXTENSIONS.some(ext => lower.includes(ext)) || lower.includes("/video/");
}

/** Returns the lowercase final segment of a path (e.g. `data[0].slug` → `slug`). */
export function path_leaf_key(path: string): string {
    if (!path) return "";
    const cleaned = path.replace(/\[\d+\]/g, "");
    const parts = cleaned.split(".");
    return (parts[parts.length - 1] ?? "").toLowerCase();
}

const ID_KEY_PATTERNS = ["id", "_id", "uuid", "slug", "key"];

export function get_value_type(value: any, key?: string): ValueType {
    if (value === null) return "null";
    if (value === undefined) return "undefined";
    if (Array.isArray(value)) return "array";
    if (typeof value === "object") return "object";
    if (typeof value === "boolean") return "boolean";
    if (typeof value === "number") return "number";
    if (typeof value === "string") {
        if (isImageUrl(value)) return "image_url";
        if (is_video_url(value)) return "video_url";
        if (is_url(value)) return "url";
        const k = (key ?? "").toLowerCase();
        if (k && ID_KEY_PATTERNS.some(p => k === p || k.endsWith(`_${p}`))) return "id";
        return "string";
    }
    return "string";
}

/** Short, single-line preview of a value for dropdown descriptions. */
export function get_sample_value(value: any, max_length = 60): string {
    if (value === null) return "null";
    if (value === undefined) return "—";
    if (typeof value === "string") {
        const trimmed = value.length > max_length ? value.slice(0, max_length - 1) + "…" : value;
        return `"${trimmed}"`;
    }
    if (typeof value === "number" || typeof value === "boolean") return String(value);
    if (Array.isArray(value)) return `Array(${value.length})`;
    if (typeof value === "object") {
        const keys = Object.keys(value);
        return keys.length === 0 ? "{}" : `{${keys.slice(0, 3).join(", ")}${keys.length > 3 ? ", …" : ""}}`;
    }
    return String(value);
}

/** Trim leading dots/brackets, collapse `..`, etc. */
export function normalize_json_path(path: string): string {
    if (!path) return "";
    return path.replace(/^\.+/, "").replace(/\.{2,}/g, ".");
}

// ── Field option building (for CommonSearchSelect) ──────────────────────

export interface FieldPathOption {
    /** Path used for the value — e.g. `data[0].slug`. */
    value: string;
    /** Human-readable label, same as `value` by default. */
    label: string;
    /** Detected type of the sampled value. */
    type: ValueType;
    /** Stringified preview of the value at the path. */
    sample: string;
    /** Group label used by CommonSearchSelect (e.g. "Image fields"). */
    group: string;
    /** Raw value at the path — useful for further filtering. */
    raw_value: any;
    /** Final segment of the path. */
    leaf: string;
    /** Depth of the path (number of segments). */
    depth: number;
}

interface BuildOptionsArgs {
    response: any;
    list_path?: string | null;
    /** When true, include array container paths themselves (e.g. `data`, `episodes`). */
    include_arrays?: boolean;
    /** Cap on returned options (response-protective). */
    max?: number;
}

/**
 * Build dropdown options for every leaf field reachable from the response.
 * When `list_path` is provided, paths are resolved against the FIRST element
 * of that array and prefixed with `<list_path>[0]` (template syntax — at
 * render time the `[0]` is replaced with the actual index).
 */
export function build_field_path_options(args: BuildOptionsArgs): FieldPathOption[] {
    const { response, list_path, include_arrays = false, max = 1000 } = args;
    if (response === null || typeof response !== "object") return [];

    const root = list_path ? getValueByPath(response, list_path) : response;
    let sample_obj: any = root;
    let prefix = list_path ?? "";
    if (Array.isArray(root)) {
        if (root.length === 0) return [];
        sample_obj = root[0];
        prefix = list_path ? `${list_path}[0]` : "[0]";
    }
    if (sample_obj === null || typeof sample_obj !== "object") {
        // Single primitive — return one option.
        return [{
            value: prefix || "$",
            label: prefix || "$",
            type: get_value_type(sample_obj),
            sample: get_sample_value(sample_obj),
            group: VALUE_TYPE_GROUPS[get_value_type(sample_obj)],
            raw_value: sample_obj,
            leaf: prefix,
            depth: 0,
        }];
    }

    const out: FieldPathOption[] = [];
    walk(sample_obj, prefix, 0);
    return out;

    function walk(obj: any, current_path: string, depth: number) {
        if (depth > 6 || out.length >= max) return;
        if (Array.isArray(obj)) {
            const ap = `${current_path}[0]`;
            if (include_arrays) {
                out.push(make_option(ap, obj, depth));
            }
            if (obj.length > 0 && obj[0] !== null && typeof obj[0] === "object") {
                walk(obj[0], ap, depth + 1);
            } else if (obj.length > 0) {
                out.push(make_option(ap, obj[0], depth + 1));
            }
            return;
        }
        if (obj === null || typeof obj !== "object") return;
        for (const key of Object.keys(obj)) {
            const value = obj[key];
            const next_path = current_path ? `${current_path}.${key}` : key;
            if (value === null || typeof value !== "object") {
                out.push(make_option(next_path, value, depth + 1, key));
            } else if (Array.isArray(value)) {
                if (include_arrays) out.push(make_option(next_path, value, depth + 1, key));
                if (value.length > 0 && value[0] !== null && typeof value[0] === "object") {
                    walk(value[0], `${next_path}[0]`, depth + 1);
                } else if (value.length > 0) {
                    out.push(make_option(`${next_path}[0]`, value[0], depth + 2));
                }
            } else {
                if (include_arrays) out.push(make_option(next_path, value, depth + 1, key));
                walk(value, next_path, depth + 1);
            }
        }
    }

    function make_option(path: string, value: any, depth: number, key?: string): FieldPathOption {
        const type = get_value_type(value, key ?? path_leaf_key(path));
        return {
            value: path,
            label: path,
            type,
            sample: get_sample_value(value),
            group: VALUE_TYPE_GROUPS[type],
            raw_value: value,
            leaf: key ?? path_leaf_key(path),
            depth,
        };
    }
}

/** Build options for the array-path dropdown (list_path picker). */
export function build_array_path_options(response: any): FieldPathOption[] {
    const paths = findArrayPaths(response);
    return paths.map(p => {
        const value = getValueByPath(response, p);
        const arr = Array.isArray(value) ? value : [];
        return {
            value: p,
            label: p || "(root)",
            type: "array" as ValueType,
            sample: `Array(${arr.length})`,
            group: "Array fields",
            raw_value: value,
            leaf: path_leaf_key(p),
            depth: p.split(".").length,
        };
    });
}
