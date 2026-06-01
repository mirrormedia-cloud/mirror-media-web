/**
 * Frontend service for the Local Uploads CRUD endpoints.
 * Pairs with backend/src/modules/library_browser/local_uploads_crud.service.ts.
 */

import { api_client, normalize_envelope, ServiceEnvelope } from "@/lib/api_client";
import { LibraryItem } from "@/types";

export interface LocalUploadsInit {
    ott_id: string;
    ott_name: string;
}

export interface LocalUploadsFolderRef {
    parent_item_key: string;
    parent_title: string;
    parent_folder_key?: string | null;
}

export interface LocalUploadsFolder {
    parent_item_key: string;
    parent_folder_key: string | null;
    title: string;
    item_count: number;
    subfolder_count: number;
    file_count: number;
    created_at: string | null;
    /** Protected "media" folder auto-created on first list — the
     *  placeholder itself can't be deleted, only its contents. */
    is_default?: boolean;
}

export interface LocalUploadsBreadcrumb {
    key: string;
    title: string;
}

export interface LocalUploadResult {
    ott_id: string;
    ott_name: string;
    count: number;
    items: LibraryItem[];
}

export const local_uploads_service = {
    async init(): Promise<ServiceEnvelope<LocalUploadsInit>> {
        const res = await api_client.get(`/api/library/local-uploads/init`);
        return normalize_envelope(res.data);
    },

    async create_folder(
        ott_id: string,
        name: string,
        parent_folder_key?: string | null,
        title?: string,
    ): Promise<ServiceEnvelope<LocalUploadsFolderRef>> {
        const body: Record<string, unknown> = { name: title?.trim() || name };
        if (parent_folder_key) body.parent_folder_key = parent_folder_key;
        const res = await api_client.post(
            `/api/library/local-uploads/${ott_id}/folders`,
            body,
        );
        return normalize_envelope(res.data);
    },

    async list_folders(
        ott_id: string,
        parent_folder_key?: string | null,
        opts?: { include_ungrouped?: boolean },
    ): Promise<ServiceEnvelope<{ parent_folder_key: string | null; folders: LocalUploadsFolder[] }>> {
        const params: Record<string, string | boolean> = {};
        if (parent_folder_key) params.parent_folder_key = parent_folder_key;
        if (opts?.include_ungrouped) params.include_ungrouped = true;
        const res = await api_client.get(
            `/api/library/local-uploads/${ott_id}/folders`,
            { params },
        );
        return normalize_envelope(res.data);
    },

    async folder_breadcrumbs(
        ott_id: string,
        key: string,
    ): Promise<ServiceEnvelope<{ breadcrumbs: LocalUploadsBreadcrumb[] }>> {
        const res = await api_client.get(
            `/api/library/local-uploads/${ott_id}/folders/${encodeURIComponent(key)}/breadcrumbs`,
        );
        return normalize_envelope(res.data);
    },

    async paste(args: {
        ott_id: string;
        operation: 'move' | 'copy';
        item_ids?: string[];
        folder_keys?: string[];
        target_folder_key?: string | null;
    }): Promise<ServiceEnvelope<{
        operation: 'move' | 'copy';
        moved_files: number;
        moved_folders: number;
        copied_files: number;
        copied_folders: number;
        created_item_ids: string[];
        created_folder_keys: string[];
    }>> {
        const res = await api_client.post(
            `/api/library/local-uploads/${args.ott_id}/paste`,
            {
                operation: args.operation,
                item_ids: args.item_ids ?? [],
                folder_keys: args.folder_keys ?? [],
                target_folder_key: args.target_folder_key ?? null,
            },
        );
        return normalize_envelope(res.data);
    },

    async rename_folder(ott_id: string, key: string, name: string): Promise<ServiceEnvelope<LocalUploadsFolderRef>> {
        const res = await api_client.patch(
            `/api/library/local-uploads/${ott_id}/folders/${encodeURIComponent(key)}`,
            { name },
        );
        return normalize_envelope(res.data);
    },

    async delete_folder(ott_id: string, key: string): Promise<ServiceEnvelope<{ deleted: number; failed: number }>> {
        const res = await api_client.delete(
            `/api/library/local-uploads/${ott_id}/folders/${encodeURIComponent(key)}`,
            // No timeout — recursive folder delete walks every R2 key
            // which can take well over the 30s default for large folders.
            { timeout: 0 },
        );
        return normalize_envelope(res.data);
    },

    async rename_item(ott_id: string, item_id: string, name: string): Promise<ServiceEnvelope<LibraryItem>> {
        const res = await api_client.patch(
            `/api/library/local-uploads/${ott_id}/items/${item_id}`,
            { name },
        );
        return normalize_envelope(res.data);
    },

    async delete_item(ott_id: string, item_id: string): Promise<ServiceEnvelope<{ id: string }>> {
        const res = await api_client.delete(
            `/api/library/local-uploads/${ott_id}/items/${item_id}`,
            // No timeout — R2 delete + DB delete may take a few seconds
            // on large objects.
            { timeout: 0 },
        );
        return normalize_envelope(res.data);
    },

    /**
     * Upload one or more files into a folder using the **direct R2
     * signed-URL** flow. For each file:
     *
     *   1. POST `/api/storage/r2/signed-upload-url` → presigned PUT
     *      URL + permanent file_url + R2 object key
     *   2. PUT the file bytes straight to R2 — bytes never touch our
     *      backend
     *   3. POST `/api/storage/r2/complete-upload` → backend creates the
     *      library row (and walks the relative_path folder chain when
     *      the user dropped a directory)
     *
     * Files are processed sequentially so the user sees them appear
     * one-by-one and a single failure doesn't poison the rest of the
     * batch. The `on_progress` callback fires per byte across the
     * **current** file's PUT; `signal` aborts the in-flight PUT.
     */
    async upload_files(args: {
        ott_id: string;
        files: File[];
        relative_paths?: Array<string | null>;
        parent_item_key?: string | null;
        parent_title?: string | null;
        on_progress?: (loaded: number, total: number) => void;
        /** Fires once per file after `complete-upload` returns success.
         *  Lets the caller show a "X of Y files" counter alongside the
         *  byte progress bar — bulk uploads otherwise read as a single
         *  long PUT because the byte bar is the only feedback. */
        on_file_done?: () => void;
        signal?: AbortSignal;
    }): Promise<ServiceEnvelope<LocalUploadResult>> {
        if (args.files.length === 0) {
            return {
                success: true,
                message: 'No files',
                data: { ott_id: args.ott_id, ott_name: '', count: 0, items: [] },
            } as unknown as ServiceEnvelope<LocalUploadResult>;
        }

        const created: LibraryItem[] = [];
        const failures: Array<{ filename: string; error: string }> = [];
        let total_bytes_across_files = 0;
        for (const f of args.files) total_bytes_across_files += f.size;
        let bytes_done_in_prior_files = 0;

        for (let i = 0; i < args.files.length; i++) {
            const f = args.files[i]!;
            const rel = args.relative_paths?.[i] ?? null;
            const is_video = (f.type || '').startsWith('video/');
            const is_image = (f.type || '').startsWith('image/');
            const is_audio = (f.type || '').startsWith('audio/');
            const file_type = is_video ? 'video' : is_image ? 'image' : is_audio ? 'audio' : 'video';
            const save_type = is_video ? 'video' : is_image ? 'image' : is_audio ? 'audio' : 'video';

            try {
                // 1) Get a signed PUT URL.
                const sign_res = await api_client.post(
                    `/api/storage/r2/signed-upload-url`,
                    {
                        file_name: f.name,
                        file_type,
                        content_type: f.type || 'application/octet-stream',
                        folder: `library/${args.ott_id}/${is_video ? 'videos' : is_image ? 'images' : 'files'}`,
                    },
                    { signal: args.signal },
                );
                const sign_env = normalize_envelope<{
                    upload_url: string;
                    key: string;
                    file_url: string | null;
                    file_type: string;
                    expires_in: number;
                }>(sign_res.data);
                if (!sign_env.success || !sign_env.data?.upload_url) {
                    throw new Error(sign_env.message || 'Failed to get signed URL');
                }
                const { upload_url, key, file_url } = sign_env.data;

                // 2) PUT the bytes directly to R2. Bypasses the
                // axios interceptors so the Authorization header
                // isn't sent to R2 (it would reject the signature).
                await axios_direct_put({
                    url: upload_url,
                    file: f,
                    signal: args.signal,
                    on_progress: (loaded, total) => {
                        if (args.on_progress) {
                            args.on_progress(
                                bytes_done_in_prior_files + loaded,
                                total_bytes_across_files || (bytes_done_in_prior_files + total),
                            );
                        }
                    },
                });

                // 3) Confirm — backend creates the library row + the
                // folder placeholder chain when relative_path is set.
                const complete_payload: Record<string, unknown> = {
                    key,
                    file_url,
                    file_type,
                    mime_type: f.type || null,
                    file_size: f.size,
                    ott_id: args.ott_id,
                    title: f.name.replace(/\.[^.]+$/, ''),
                    file_name: f.name,
                    file_ext: (f.name.match(/\.([a-zA-Z0-9]{1,8})$/)?.[1] ?? '').toLowerCase() || null,
                    save_type,
                };
                if (args.parent_item_key) complete_payload.parent_item_key = args.parent_item_key;
                if (args.parent_title) complete_payload.parent_title = args.parent_title;
                if (rel) complete_payload.relative_path = rel;
                const complete_res = await api_client.post(
                    `/api/storage/r2/complete-upload`,
                    complete_payload,
                    { signal: args.signal },
                );
                const complete_env = normalize_envelope<{ library_item: LibraryItem }>(complete_res.data);
                if (!complete_env.success || !complete_env.data?.library_item) {
                    throw new Error(complete_env.message || 'complete-upload failed');
                }
                created.push(complete_env.data.library_item);
                if (args.on_file_done) {
                    try { args.on_file_done(); } catch { /* noop */ }
                }
            } catch (err: any) {
                failures.push({ filename: f.name, error: err?.message ?? 'upload failed' });
            } finally {
                bytes_done_in_prior_files += f.size;
                if (args.on_progress && total_bytes_across_files > 0) {
                    args.on_progress(bytes_done_in_prior_files, total_bytes_across_files);
                }
            }
        }

        return {
            success: created.length > 0,
            message: created.length > 0
                ? `Uploaded ${created.length} file${created.length === 1 ? '' : 's'}`
                : (failures[0]?.error ?? 'No files uploaded'),
            data: {
                ott_id: args.ott_id,
                ott_name: '',
                count: created.length,
                items: created,
                // Surface failures so callers can show a toast per
                // failed file. The legacy multipart flow had no
                // shape for this; the new flow returns them inline.
                ...(failures.length > 0 ? { failed: failures.length, failures } : {}),
            } as LocalUploadResult,
        } as ServiceEnvelope<LocalUploadResult>;
    },
};

/**
 * Bare-bones axios PUT that does NOT attach the api_client
 * interceptors (Authorization, etc.) — R2 rejects requests with
 * extra headers because they break the SigV4 signature. Uses the
 * native fetch API for streaming uploads.
 */
async function axios_direct_put(args: {
    url: string;
    file: File;
    signal?: AbortSignal;
    on_progress?: (loaded: number, total: number) => void;
}): Promise<void> {
    // XHR has reliable upload-progress events across browsers; fetch
    // still doesn't expose them as of late 2025. Wrap it in a Promise
    // so the rest of the flow stays async/await.
    await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('PUT', args.url, true);
        if (args.file.type) xhr.setRequestHeader('Content-Type', args.file.type);
        if (args.signal) {
            const abort_handler = () => { try { xhr.abort(); } catch { /* noop */ } };
            args.signal.addEventListener('abort', abort_handler, { once: true });
        }
        xhr.upload.onprogress = (e) => {
            if (e.lengthComputable && args.on_progress) args.on_progress(e.loaded, e.total);
        };
        xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) resolve();
            else reject(new Error(`R2 PUT failed: HTTP ${xhr.status} ${xhr.statusText}`));
        };
        xhr.onerror = () => reject(new Error('R2 PUT failed: network error'));
        xhr.onabort = () => reject(new Error('Upload aborted'));
        xhr.send(args.file);
    });
}
