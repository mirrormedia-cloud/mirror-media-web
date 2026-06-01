/**
 * Module-level delete-in-progress status.
 *
 * Mirrors upload_status_store: lives outside React component state so
 * the popup survives route changes. Used by every Local Uploads /
 * Library delete path so a bulk delete of hundreds of items shows
 * progress even if the user navigates away mid-operation.
 *
 * Delete operations don't stream progress (the backend processes them
 * inside a single endpoint call), so we only track:
 *   - total: how many items the user asked to delete
 *   - done:  how many have completed (updated client-side; for
 *            single-endpoint bulk deletes this is 0 → total when the
 *            response lands)
 */

import { useSyncExternalStore } from "react";

export interface DeleteStatus {
    total: number;
    done: number;
    label?: string;
    started_at: number;
}

let _state: DeleteStatus | null = null;
const _listeners = new Set<() => void>();

function emit(): void {
    for (const fn of _listeners) {
        try { fn(); } catch { /* one bad listener shouldn't break others */ }
    }
}

function subscribe(fn: () => void): () => void {
    _listeners.add(fn);
    return () => { _listeners.delete(fn); };
}

function get_snapshot(): DeleteStatus | null {
    return _state;
}

let _beforeunload_attached = false;
function on_beforeunload(e: BeforeUnloadEvent): void {
    if (_state) {
        e.preventDefault();
        e.returnValue = "Delete in progress — leaving may leave it half-done.";
    }
}
function ensure_beforeunload(): void {
    if (_beforeunload_attached || typeof window === "undefined") return;
    window.addEventListener("beforeunload", on_beforeunload);
    _beforeunload_attached = true;
}

export function set_delete_status(next: DeleteStatus | null): void {
    _state = next;
    if (next) ensure_beforeunload();
    emit();
}

export function update_delete_progress(done: number): void {
    if (!_state) return;
    _state = { ..._state, done };
    emit();
}

export function get_delete_status(): DeleteStatus | null {
    return _state;
}

export function useDeleteStatus(): DeleteStatus | null {
    return useSyncExternalStore(subscribe, get_snapshot, get_snapshot);
}
