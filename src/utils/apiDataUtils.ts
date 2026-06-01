/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { DisplayType } from "../types";

export function findArrayPaths(obj: any, currentPath = ""): string[] {
  if (!obj || typeof obj !== "object") return [];
  const paths: string[] = [];
  if (Array.isArray(obj)) {
    paths.push(currentPath);
    return paths;
  }
  for (const key in obj) {
    const value = obj[key];
    const newPath = currentPath ? `${currentPath}.${key}` : key;
    if (Array.isArray(value)) {
      paths.push(newPath);
    } else if (value && typeof value === "object") {
      paths.push(...findArrayPaths(value, newPath));
    }
  }
  return paths;
}

export function extractFieldPaths(obj: any, currentPath = "", depth = 0): string[] {
  if (depth > 5 || !obj || typeof obj !== "object") return [];
  const paths: string[] = [];
  for (const key in obj) {
    const value = obj[key];
    const newPath = currentPath ? `${currentPath}.${key}` : key;
    if (value === null || value === undefined) {
      paths.push(newPath);
    } else if (Array.isArray(value)) {
      paths.push(newPath);
    } else if (typeof value === "object") {
      paths.push(newPath);
      paths.push(...extractFieldPaths(value, newPath, depth + 1));
    } else {
      paths.push(newPath);
    }
  }
  return paths;
}

export function getValueByPath(obj: any, path: string): any {
  if (!obj || !path) return undefined;
  const normalizedPath = path.replace(/\[(\d+)\]/g, ".$1");
  const parts = normalizedPath.split(".").filter(Boolean);
  let current = obj;
  for (const part of parts) {
    if (current === undefined || current === null) return undefined;
    current = current[part];
  }
  return current;
}

export function replaceArrayIndexInPath(path: string, index: number): string {
  return path.replace(/\[0\]/g, `[${index}]`);
}

const ENDPOINT_VAR_RE = /<([a-zA-Z_][a-zA-Z0-9_]*)>|\{([a-zA-Z_][a-zA-Z0-9_]*)\}|(?:^|[^:/])(:([a-zA-Z_][a-zA-Z0-9_]*))/g;

/** Extract `<var>`, `{var}`, and `:var` placeholder names from an endpoint string. */
export function extract_endpoint_variables(endpoint: string): string[] {
  if (!endpoint) return [];
  const out = new Set<string>();
  const re = new RegExp(ENDPOINT_VAR_RE.source, "g");
  let match: RegExpExecArray | null;
  while ((match = re.exec(endpoint)) !== null) {
    const name = match[1] || match[2] || match[4];
    if (name) out.add(name);
  }
  return Array.from(out);
}

/** Replace `<var>`, `{var}`, and `:var` placeholders in an endpoint with URI-encoded values. */
export function resolve_endpoint_variables(endpoint: string, values: Record<string, any>): string {
  if (!endpoint) return endpoint;
  let resolved = endpoint;
  for (const [name, raw] of Object.entries(values)) {
    if (raw === undefined || raw === null) continue;
    const encoded = encodeURIComponent(String(raw));
    resolved = resolved.replace(new RegExp(`<${name}>`, "g"), encoded);
    resolved = resolved.replace(new RegExp(`\\{${name}\\}`, "g"), encoded);
    resolved = resolved.replace(
      new RegExp(`(^|[^:/]):${name}(?![a-zA-Z0-9_])`, "g"),
      (_full, before) => `${before}${encoded}`,
    );
  }
  return resolved;
}

/** Build dropdown options for parent response fields under a list path. */
export function extract_field_paths_from_list_response(response: any, list_path: string | null | undefined): string[] {
  const arr = list_path ? getValueByPath(response, list_path) : response;
  if (!Array.isArray(arr) || arr.length === 0) return [];
  const first = arr[0];
  if (first === null || typeof first !== "object") return [];
  const inner = extractFieldPaths(first);
  const prefix = list_path ? `${list_path}[0]` : "[0]";
  return inner.map(p => `${prefix}.${p}`);
}

/**
 * Walk an object recursively, yielding every reachable path INCLUDING array indices.
 * Use this when the response is a single item (e.g. one card's raw_item) and you want
 * to expose paths like `sources[0].file` for selection.
 */
export function extract_paths_with_arrays(obj: any, currentPath = "", depth = 0): string[] {
  if (depth > 6 || obj === null || obj === undefined || typeof obj !== "object") return [];
  const paths: string[] = [];
  if (Array.isArray(obj)) {
    if (obj.length === 0) return paths;
    const idx_path = `${currentPath}[0]`;
    paths.push(idx_path);
    paths.push(...extract_paths_with_arrays(obj[0], idx_path, depth + 1));
    return paths;
  }
  for (const key of Object.keys(obj)) {
    const value = obj[key];
    const newPath = currentPath ? `${currentPath}.${key}` : key;
    paths.push(newPath);
    if (value !== null && typeof value === "object") {
      paths.push(...extract_paths_with_arrays(value, newPath, depth + 1));
    }
  }
  return Array.from(new Set(paths));
}

export function isImageUrl(url: any): boolean {
  if (typeof url !== "string") return false;
  if (!/^https?:\/\//i.test(url)) return false;
  const extensions = [".jpg", ".jpeg", ".png", ".webp", ".gif", ".svg", ".avif"];
  const lower = url.toLowerCase();
  return extensions.some(ext => lower.includes(ext)) || lower.includes("image") || lower.includes("thumb");
}

export function detectDisplayType(key: string, value: any): DisplayType {
  if (isImageUrl(value)) return "image";
  const lower = key.toLowerCase();
  if (lower === "title" || lower === "name") return "title";
  if (lower === "description" || lower === "summary") return "description";
  if (lower === "id" || lower === "_id" || lower === "uuid") return "hidden_id";
  if (lower.includes("status") || lower.includes("type") || lower.includes("genre")) return "badge";
  return "text";
}
