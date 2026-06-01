/**
 * Module-level clipboard for the Local Uploads file manager.
 *
 * Lives outside React state because Ctrl+X / Ctrl+C in folder A and
 * Ctrl+V in folder B span different mounts of FileListView — putting
 * the clipboard inside one mount loses it on navigation.
 *
 * Uses `useSyncExternalStore` so any component that reads the
 * clipboard re-renders when it changes.
 */

import { useSyncExternalStore } from "react";

// Cut-only — copy was intentionally removed. The backend `paste`
// endpoint still accepts both operations, but no UI path writes a
// "copy" entry to the clipboard.
export type ClipboardOperation = "cut";

export interface LocalUploadsClipboard {
    operation: ClipboardOperation;
    ott_id: string;
    /** The folder the items came from. NULL = OTT root. */
    source_folder_key: string | null;
    item_ids: string[];
    folder_keys: string[];
    /** Total entries — convenience for badges. */
    count: number;
    /** When the clipboard was set (epoch ms). */
    at: number;
}

let _state: LocalUploadsClipboard | null = null;
const _listeners = new Set<() => void>();

function emit(): void {
    for (const fn of _listeners) {
        try { fn(); } catch { /* listener errors shouldn't crash other subscribers */ }
    }
}

export function set_clipboard(next: LocalUploadsClipboard | null): void {
    _state = next;
    emit();
}

export function get_clipboard(): LocalUploadsClipboard | null {
    return _state;
}

export function clear_clipboard(): void {
    if (_state === null) return;
    _state = null;
    emit();
}

function subscribe(fn: () => void): () => void {
    _listeners.add(fn);
    return () => { _listeners.delete(fn); };
}

function get_snapshot(): LocalUploadsClipboard | null {
    return _state;
}

export function useLocalUploadsClipboard(): LocalUploadsClipboard | null {
    return useSyncExternalStore(subscribe, get_snapshot, get_snapshot);
}

/** Quick helper — returns true when the given item id is in a "cut"
 *  clipboard from the same OTT. The FE uses this to render the tile
 *  with reduced opacity until the cut is pasted or cleared. */
export function is_cut_item(ott_id: string, item_id: string): boolean {
    const c = _state;
    if (!c || c.operation !== "cut" || c.ott_id !== ott_id) return false;
    return c.item_ids.includes(item_id);
}

export function is_cut_folder(ott_id: string, folder_key: string): boolean {
    const c = _state;
    if (!c || c.operation !== "cut" || c.ott_id !== ott_id) return false;
    return c.folder_keys.includes(folder_key);
}

// ── Paste-in-progress status bar ─────────────────────────────────────
// Shown at the bottom of the page while a paste API call is in flight.
// Survives folder navigation since it lives at module scope — important
// because the user may scroll / change folders while a large copy
// completes.

export type PasteOperationKind = "move";

export interface PasteStatus {
    operation: PasteOperationKind;
    total: number;
    /** Free-text label like "file1.mp4, file2.mp4 +3 more". */
    summary: string;
    /** Where the paste is going. NULL = OTT root. */
    target_folder_key: string | null;
    started_at: number;
}

let _paste: PasteStatus | null = null;
const _paste_listeners = new Set<() => void>();
function emit_paste(): void {
    for (const fn of _paste_listeners) {
        try { fn(); } catch { /* swallow */ }
    }
}

export function set_paste_status(next: PasteStatus | null): void {
    _paste = next;
    emit_paste();
}

export function get_paste_status(): PasteStatus | null {
    return _paste;
}

export function usePasteStatus(): PasteStatus | null {
    return useSyncExternalStore(
        (fn) => { _paste_listeners.add(fn); return () => { _paste_listeners.delete(fn); }; },
        () => _paste,
        () => _paste,
    );
}
