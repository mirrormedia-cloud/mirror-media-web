/**
 * Module-level upload status store.
 *
 * Lives outside React component state so that:
 *   - The popup keeps showing when the user navigates to a different
 *     route while an upload is in flight.
 *   - The browser fires a `beforeunload` warning ("changes you made may
 *     not be saved") if the user tries to close the tab or hard-refresh
 *     during an upload.
 *
 * The actual axios call still happens inside the page that initiated
 * the upload — only the *state* lives here, plus the AbortController so
 * the global popup's Cancel button can abort the request from anywhere.
 */

import { useSyncExternalStore } from "react";

export interface UploadStatus {
    count: number;
    /** Files whose `complete-upload` succeeded. Lets the popup show
     *  "X of Y" so bulk uploads don't read as a single-file run. */
    done_count: number;
    loaded: number;
    total: number;
    abort: () => void;
    /** Free-text context (e.g. folder name) shown in the popup. */
    label?: string;
    started_at: number;
}

let _state: UploadStatus | null = null;
const _listeners = new Set<() => void>();

function emit(): void {
    for (const fn of _listeners) {
        try { fn(); } catch { /* swallow — one listener shouldn't break others */ }
    }
}

function subscribe(fn: () => void): () => void {
    _listeners.add(fn);
    return () => { _listeners.delete(fn); };
}

function get_snapshot(): UploadStatus | null {
    return _state;
}

// ── beforeunload warning ─────────────────────────────────────────────
// While an upload is active, prompt before the tab closes / refreshes.
let _beforeunload_attached = false;
function on_beforeunload(e: BeforeUnloadEvent): void {
    if (_state) {
        e.preventDefault();
        // Modern browsers ignore the custom message and show their own
        // generic copy, but setting returnValue is still required.
        e.returnValue = "Upload in progress — leaving will cancel it.";
    }
}
function ensure_beforeunload(): void {
    if (_beforeunload_attached || typeof window === "undefined") return;
    window.addEventListener("beforeunload", on_beforeunload);
    _beforeunload_attached = true;
}

export function set_upload_status(next: UploadStatus | null): void {
    _state = next;
    if (next) ensure_beforeunload();
    emit();
}

export function update_upload_progress(loaded: number, total: number): void {
    if (!_state) return;
    _state = { ..._state, loaded, total };
    emit();
}

export function bump_upload_done_count(): void {
    if (!_state) return;
    _state = { ..._state, done_count: _state.done_count + 1 };
    emit();
}

export function get_upload_status(): UploadStatus | null {
    return _state;
}

export function useUploadStatus(): UploadStatus | null {
    return useSyncExternalStore(subscribe, get_snapshot, get_snapshot);
}
