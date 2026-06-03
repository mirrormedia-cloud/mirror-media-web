/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { api_client, normalize_envelope, ServiceEnvelope } from "@/lib/api_client";
import {
    OttPlatformSummary,
    OttPlatformDetail,
    ApiNode,
    ApiCardsResponse,
    OttCardsResponse,
    ApiCallLog,
    CreateOttPayload,
    UpdateOttPayload,
    CreateApiNodePayload,
    UpdateApiNodePayload,
    SaveSelectedFieldsPayload,
    CardAction,
    CardActionsListResponse,
    CreateCardActionPayload,
    UpdateCardActionPayload,
    NestedDataResponse,
    CardConfigPayload,
    SaveCardConfigPayload,
    CardsFromContextResponse,
    ApiCardsBundle,
    VideoAsset,
    CaptureVideoAssetsPayload,
    NestedCardsPageResponse,
    LibraryItem,
    SaveToLibraryPayload,
    SaveBulkToLibraryPayload,
    CaptureMapping,
    SaveFromCardsPayload,
    PaginationConfig,
    PaginationType,
    PaginationTestResult,
    QuickFlowResponse,
} from "@/types";

const API_BASE_URL_RESOLVED =
    (import.meta as any).env?.VITE_API_BASE_URL
    ?? (typeof process !== "undefined" ? (process as any).env?.VITE_API_BASE_URL : "")
    ?? "";

async function GET<T>(url: string, params?: Record<string, any>): Promise<ServiceEnvelope<T>> {
    const res = await api_client.get(url, { params });
    return normalize_envelope<T>(res.data);
}

async function POST<T>(url: string, payload?: any, config?: { timeout?: number }): Promise<ServiceEnvelope<T>> {
    const res = await api_client.post(url, payload ?? {}, config);
    return normalize_envelope<T>(res.data);
}

async function PUT<T>(url: string, payload?: any): Promise<ServiceEnvelope<T>> {
    const res = await api_client.put(url, payload ?? {});
    return normalize_envelope<T>(res.data);
}

async function DELETE<T>(url: string, config?: { timeout?: number }): Promise<ServiceEnvelope<T>> {
    const res = await api_client.delete(url, config);
    return normalize_envelope<T>(res.data);
}

export interface CallApiResult {
    api_id: string;
    status: string;
    success: boolean;
    http_status: number | null;
    duration_ms: number | null;
    log_id: string;
    response: any;
    error_message: string | null;
}

export interface CallChildApiResult {
    parent_api_id: string;
    child_api_id: string;
    card_index: number;
    item_key: string;
    parent_item_key: string | null;
    source_response_id: string | null;
    response_id: string | null;
    resolved_endpoint: string;
    success: boolean;
    http_status: number | null;
    duration_ms: number | null;
    log_id: string;
    response: any;
    error_message: string | null;
    cards: {
        card_enabled: boolean;
        cards: any[];
        list_path: string | null;
        quick_run: boolean;
        default_child_api_id: string | null;
        open_type: string;
    };
}

export interface SyncResult {
    ott_id: string;
    mode: "root_only" | "all";
    fetch_all_pages?: boolean;
    total: number;
    results: Array<{
        api_id: string;
        name: string;
        success: boolean;
        http_status: number | null;
        duration_ms: number | null;
        log_id: string;
        pagination: null | {
            pages_fetched: number;
            total_items: number;
            stop_reason: string;
        };
    }>;
}

export interface ApiResponseEnvelope {
    api_id: string;
    http_status?: number | null;
    duration_ms?: number | null;
    response_preview?: string | null;
    response: any;
    updatedAt?: string | null;
}

export interface SelectedFieldsEnvelope {
    api_id: string;
    list_path: string | null;
    selected_fields: any[];
}

export interface LogsListData {
    ott_id: string;
    total: number;
    page: number;
    limit: number;
    items: ApiCallLog[];
}

export interface LogsListFilters {
    status?: "pending" | "success" | "failed";
    api_id?: string;
    search?: string;
    page?: number;
    limit?: number;
}

export const ott_service = {
    // ── Platforms ────────────────────────────────────────────────────────
    async get_all_otts(params: Record<string, any> = {}) {
        return GET<OttPlatformSummary[]>("/api/ott", params);
    },

    async create_ott(payload: CreateOttPayload) {
        return POST<OttPlatformDetail>("/api/ott", payload);
    },

    async get_ott_by_id(ott_id: string) {
        return GET<OttPlatformDetail>(`/api/ott/${ott_id}`);
    },

    async update_ott(ott_id: string, payload: UpdateOttPayload) {
        return PUT<OttPlatformDetail>(`/api/ott/${ott_id}`, payload);
    },

    async delete_ott(ott_id: string) {
        return DELETE<{ id: string }>(`/api/ott/${ott_id}`);
    },

    // ── API tree ─────────────────────────────────────────────────────────
    async get_ott_apis(ott_id: string) {
        return GET<{ ott_id: string; api_tree: ApiNode[] }>(`/api/ott/${ott_id}/apis`);
    },

    async create_api_node(ott_id: string, payload: CreateApiNodePayload) {
        return POST<ApiNode>(`/api/ott/${ott_id}/apis`, payload);
    },

    async update_api_node(ott_id: string, api_id: string, payload: UpdateApiNodePayload) {
        return PUT<ApiNode>(`/api/ott/${ott_id}/apis/${api_id}`, payload);
    },

    /** Fresh single-node fetch — used by the API form modal on open to dodge any
     *  tree-staleness between save and next edit. */
    async get_api_node(ott_id: string, api_id: string) {
        return GET<ApiNode>(`/api/ott/${ott_id}/apis/${api_id}`);
    },

    /** Quick Flow visualisation aggregator — one fetch returns nodes, edges,
     *  and summary stats so the flow chart renders without 6 round-trips. */
    async get_quick_flow(ott_id: string) {
        return GET<QuickFlowResponse>(`/api/ott/${ott_id}/quick_flow`);
    },

    async delete_api_node(ott_id: string, api_id: string) {
        return DELETE<{ id: string }>(`/api/ott/${ott_id}/apis/${api_id}`);
    },

    async call_api_node(
        ott_id: string,
        api_id: string,
        options: {
            fetch_all_pages?: boolean;
            page_number?: number;
            cursor_value?: string;
            id_value?: string;
            offset_value?: number;
            limit_value?: number;
        } = {},
    ) {
        return POST<CallApiResult & {
            pagination?: {
                pages_fetched: number;
                total_items: number;
                stop_reason: string;
                pages: import("@/types").PaginationPageLog[];
            };
            pagination_state?: {
                pagination_type: string;
                current_page_number: number | null;
                current_cursor: string | null;
                current_id: string | null;
                current_offset: number | null;
                next_page_number: number | null;
                next_cursor: string | null;
                next_id: string | null;
                next_offset: number | null;
                has_next: boolean;
                item_count: number;
                stop_reason: string | null;
                total_pages: number | null;
                total_items: number | null;
            };
        }>(`/api/ott/${ott_id}/apis/${api_id}/call`, options);
    },

    /**
     * Dry-run pagination config against the live upstream — fetches at most 2
     * pages and returns their request URLs + item counts WITHOUT persisting.
     * Used by the API form's "Test Pagination" button.
     */
    async test_api_pagination(
        ott_id: string,
        api_id: string,
        payload: { pagination_type: PaginationType; pagination_config: PaginationConfig },
    ) {
        return POST<PaginationTestResult>(
            `/api/ott/${ott_id}/apis/${api_id}/test_pagination`,
            payload,
        );
    },

    /**
     * Run a single "sample" call so the card builder has a response to inspect.
     * Works for both root APIs (calls them directly) and child APIs (auto-resolves
     * the parent's first card and runs call_from_card under the hood).
     */
    async sample_call_api(ott_id: string, api_id: string) {
        return POST<{
            api_id: string;
            source: 'root' | 'child';
            source_response_id?: string;
            success: boolean;
            http_status: number | null;
            response: any;
            error_message: string | null;
            parent_api_name?: string;
        }>(`/api/ott/${ott_id}/apis/${api_id}/sample_call`);
    },

    async call_child_api_from_card(args: {
        ott_id: string;
        child_api_id: string;
        parent_api_id: string;
        card_index: number;
        item_key?: string;
        parent_item_key?: string;
        source_response_id?: string;
        fetch_all_pages?: boolean;
        page_number?: number;
        cursor_value?: string;
        id_value?: string;
        offset_value?: number;
        limit_value?: number;
    }) {
        const { ott_id, child_api_id, parent_api_id, card_index, item_key, parent_item_key, source_response_id, fetch_all_pages, page_number, cursor_value, id_value, offset_value, limit_value } = args;
        const body: Record<string, any> = { parent_api_id, card_index };
        if (item_key !== undefined) body.item_key = item_key;
        if (parent_item_key !== undefined) body.parent_item_key = parent_item_key;
        if (source_response_id !== undefined) body.source_response_id = source_response_id;
        if (fetch_all_pages !== undefined) body.fetch_all_pages = fetch_all_pages;
        if (page_number !== undefined) body.page_number = page_number;
        if (cursor_value !== undefined) body.cursor_value = cursor_value;
        if (id_value !== undefined) body.id_value = id_value;
        if (offset_value !== undefined) body.offset_value = offset_value;
        if (limit_value !== undefined) body.limit_value = limit_value;
        return POST<CallChildApiResult & {
            pagination?: {
                pages_fetched: number;
                total_items: number;
                stop_reason: string;
                pages: import("@/types").PaginationPageLog[];
            } | null;
            pagination_state?: {
                pagination_type: string;
                current_page_number: number | null;
                current_cursor: string | null;
                current_id: string | null;
                current_offset: number | null;
                next_page_number: number | null;
                next_cursor: string | null;
                next_id: string | null;
                next_offset: number | null;
                has_next: boolean;
                item_count: number;
                stop_reason: string | null;
                total_pages: number | null;
                total_items: number | null;
            } | null;
        }>(
            `/api/ott/${ott_id}/apis/${child_api_id}/call_from_card`,
            body,
        );
    },

    async sync_ott(
        ott_id: string,
        mode: "root_only" | "all" = "root_only",
        options: { fetch_all_pages?: boolean } = {},
    ) {
        return POST<SyncResult>(`/api/ott/${ott_id}/sync`, { mode, ...options });
    },

    // ── Selected fields ──────────────────────────────────────────────────
    async get_selected_fields(ott_id: string, api_id: string) {
        return GET<SelectedFieldsEnvelope>(`/api/ott/${ott_id}/apis/${api_id}/fields`);
    },

    async save_selected_fields(ott_id: string, api_id: string, payload: SaveSelectedFieldsPayload) {
        return PUT<SelectedFieldsEnvelope>(`/api/ott/${ott_id}/apis/${api_id}/fields`, payload);
    },

    // ── Responses + cards ────────────────────────────────────────────────
    async get_api_response(ott_id: string, api_id: string) {
        return GET<ApiResponseEnvelope>(`/api/ott/${ott_id}/apis/${api_id}/response`);
    },

    async get_api_cards(ott_id: string, api_id: string) {
        return GET<ApiCardsBundle>(`/api/ott/${ott_id}/apis/${api_id}/cards`);
    },

    async get_api_card_config(ott_id: string, api_id: string) {
        return GET<CardConfigPayload>(`/api/ott/${ott_id}/apis/${api_id}/card_config`);
    },

    async save_api_card_config(ott_id: string, api_id: string, payload: SaveCardConfigPayload) {
        return PUT<CardConfigPayload>(`/api/ott/${ott_id}/apis/${api_id}/card_config`, payload);
    },

    async get_api_cards_from_context(ott_id: string, api_id: string, source_response_id: string, item_key?: string) {
        const params: Record<string, any> = { source_response_id };
        if (item_key !== undefined) params.item_key = item_key;
        return GET<CardsFromContextResponse>(`/api/ott/${ott_id}/apis/${api_id}/cards_from_context`, params);
    },

    // ── Capture mapping (persisted on api_node.card_config.capture_mapping) ─
    async get_capture_mapping(ott_id: string, api_id: string) {
        return GET<{ api_id: string; list_path: string | null; mapping: CaptureMapping | null }>(
            `/api/ott/${ott_id}/apis/${api_id}/capture_mapping`,
        );
    },

    async save_capture_mapping(ott_id: string, api_id: string, mapping: CaptureMapping) {
        return PUT<{ api_id: string; mapping: CaptureMapping }>(
            `/api/ott/${ott_id}/apis/${api_id}/capture_mapping`,
            mapping,
        );
    },

    async get_ott_cards(ott_id: string) {
        return GET<OttCardsResponse>(`/api/ott/${ott_id}/cards`);
    },

    // ── Logs ─────────────────────────────────────────────────────────────
    async get_ott_logs(ott_id: string, params: LogsListFilters = {}) {
        return GET<LogsListData>(`/api/ott/${ott_id}/logs`, params);
    },

    async get_log_by_id(ott_id: string, log_id: string) {
        return GET<ApiCallLog>(`/api/ott/${ott_id}/logs/${log_id}`);
    },

    async clear_logs(ott_id: string) {
        return DELETE<{ ott_id: string; removed: number }>(`/api/ott/${ott_id}/logs`);
    },

    // ── Card actions ─────────────────────────────────────────────────────
    async get_card_actions(ott_id: string, api_id: string) {
        return GET<CardActionsListResponse>(`/api/ott/${ott_id}/apis/${api_id}/card_actions`);
    },

    async create_card_action(ott_id: string, api_id: string, payload: CreateCardActionPayload) {
        return POST<CardAction>(`/api/ott/${ott_id}/apis/${api_id}/card_actions`, payload);
    },

    async update_card_action(ott_id: string, api_id: string, action_id: string, payload: UpdateCardActionPayload) {
        return PUT<CardAction>(`/api/ott/${ott_id}/apis/${api_id}/card_actions/${action_id}`, payload);
    },

    async delete_card_action(ott_id: string, api_id: string, action_id: string) {
        return DELETE<{ id: string }>(`/api/ott/${ott_id}/apis/${api_id}/card_actions/${action_id}`);
    },

    // ── Nested page ──────────────────────────────────────────────────────
    async get_nested_data(args: {
        ott_id: string;
        parent_api_id: string;
        item_key: string;
        child_api_id: string;
        card_index?: number;
        source_response_id?: string;
        parent_item_key?: string;
        force_sync?: boolean;
    }) {
        const { ott_id, parent_api_id, item_key, child_api_id, ...rest } = args;
        const params: Record<string, any> = {};
        if (rest.card_index !== undefined) params.card_index = rest.card_index;
        if (rest.source_response_id) params.source_response_id = rest.source_response_id;
        if (rest.parent_item_key !== undefined) params.parent_item_key = rest.parent_item_key;
        if (rest.force_sync) params.force_sync = "true";
        return GET<NestedDataResponse>(
            `/api/ott/${ott_id}/nested/${parent_api_id}/${encodeURIComponent(item_key)}/${child_api_id}`,
            params,
        );
    },

    async sync_nested_data(args: {
        ott_id: string;
        parent_api_id: string;
        item_key: string;
        child_api_id: string;
        card_index?: number;
        source_response_id?: string;
        parent_item_key?: string;
    }) {
        return this.get_nested_data({ ...args, force_sync: true });
    },

    // ── Nested cards page (NestedCardsPage) ──────────────────────────────
    async get_nested_cards_page(args: {
        ott_id: string;
        parent_api_id: string;
        item_key: string;
        child_api_id: string;
        card_index?: number;
        source_response_id?: string;
        parent_item_key?: string;
        action_id?: string;
        force_sync?: boolean;
    }) {
        const { ott_id, parent_api_id, item_key, child_api_id, ...rest } = args;
        const params: Record<string, any> = {};
        if (rest.card_index !== undefined) params.card_index = rest.card_index;
        if (rest.source_response_id) params.source_response_id = rest.source_response_id;
        if (rest.parent_item_key !== undefined) params.parent_item_key = rest.parent_item_key;
        if (rest.action_id) params.action_id = rest.action_id;
        if (rest.force_sync) params.force_sync = "true";
        return GET<NestedCardsPageResponse>(
            `/api/ott/${ott_id}/cards/${parent_api_id}/${encodeURIComponent(item_key)}/${child_api_id}`,
            params,
        );
    },

    // ── Video assets ─────────────────────────────────────────────────────
    async capture_video_assets(ott_id: string, payload: CaptureVideoAssetsPayload) {
        return POST<{
            saved_count: number;
            updated_count: number;
            already_saved_count: number;
            /** Sum of updated + already_saved, kept for older clients. */
            skipped_count: number;
            error_count: number;
            errors: Array<{ video_url?: string; message: string }>;
            items: Array<VideoAsset & { outcome: 'created' | 'updated' | 'already_saved' }>;
        }>(`/api/ott/${ott_id}/video_assets/capture`, payload);
    },

    async get_video_assets(ott_id: string, params: {
        search?: string;
        video_type?: string;
        api_node_id?: string;
        page?: number;
        limit?: number;
    } = {}) {
        return GET<{
            ott_id: string;
            total: number;
            page: number;
            limit: number;
            items: VideoAsset[];
        }>(`/api/ott/${ott_id}/video_assets`, params);
    },

    async get_video_asset_by_id(ott_id: string, video_asset_id: string) {
        return GET<VideoAsset>(`/api/ott/${ott_id}/video_assets/${video_asset_id}`);
    },

    async delete_video_asset(ott_id: string, video_asset_id: string) {
        return DELETE<{ id: string }>(`/api/ott/${ott_id}/video_assets/${video_asset_id}`, { timeout: 0 });
    },

    /** Bulk delete captured video assets — used by the multi-select toolbar. */
    async bulk_delete_video_assets(ott_id: string, ids: string[]) {
        return POST<{
            requested: number;
            deleted: number;
            missing_ids: string[];
            failed: Array<{ id: string; error: string }>;
        }>(`/api/ott/${ott_id}/video_assets/bulk_delete`, { ids }, { timeout: 0 });
    },

    /** Clear downloaded_at on all video assets for this OTT. Called after sync so new content is re-downloadable. */
    async reset_downloaded(ott_id: string) {
        return POST<{ updated: number }>(`/api/ott/${ott_id}/video_assets/reset_downloaded`, {});
    },

    /** Build the direct download URL the browser navigates to. Backend streams the file. */
    get_video_download_url(ott_id: string, video_asset_id: string, mode?: "playlist") {
        const base = String(API_BASE_URL_RESOLVED).replace(/\/$/, "");
        const qs = mode ? `?mode=${mode}` : "";
        return `${base}/api/ott/${ott_id}/video_assets/${video_asset_id}/download${qs}`;
    },

    // ── Library (local media archive) ───────────────────────────────────
    async save_to_library(ott_id: string, payload: SaveToLibraryPayload) {
        return POST<LibraryItem>(`/api/ott/${ott_id}/library/save`, payload);
    },

    async save_bulk_to_library(ott_id: string, payload: SaveBulkToLibraryPayload) {
        return POST<{ total: number; started: number; skipped: number; items: LibraryItem[] }>(
            `/api/ott/${ott_id}/library/save_bulk`,
            payload,
        );
    },

    /**
     * Save selected card indices straight to the local library using the api_node's
     * saved capture_mapping. Used by per-card save icons and bulk save toolbar.
     */
    async save_cards_to_library(ott_id: string, payload: SaveFromCardsPayload) {
        return POST<{
            total: number;
            started: number;
            already: number;
            no_url: number;
            items: LibraryItem[];
        }>(`/api/ott/${ott_id}/library/save_from_cards`, payload);
    },

    async get_library_items(ott_id: string, params: {
        search?: string;
        type?: string;
        status?: 'pending' | 'downloading' | 'converting' | 'completed' | 'failed';
        sort_by?: 'newest' | 'oldest' | 'title_asc' | 'title_desc' | 'size_desc' | 'size_asc' | 'status';
        page?: number;
        limit?: number;
        parent_item_key?: string;
        parent_api_id?: string;
        ungrouped_only?: boolean;
    } = {}) {
        return GET<{
            items: LibraryItem[];
            pagination: { page: number; limit: number; total: number };
            status_counts: {
                all: number;
                pending: number;
                downloading: number;
                converting: number;
                completed: number;
                failed: number;
                in_progress: number;
            };
        }>(`/api/ott/${ott_id}/library`, params);
    },

    /**
     * Folder grid — one row per (parent_api_id, parent_item_key) tuple.
     * The "Ungrouped" pseudo-folder bundles legacy rows that were saved
     * before parent context was captured.
     */
    /**
     * Top-level library browser — every OTT this user owns plus per-type
     * file counts. Powers the unified /dashboard/library page where each
     * OTT renders as a folder.
     */
    /**
     * Bulk-clear library contents for the selected OTTs (deletes every
     * saved file/row inside, leaves the OTT registration alone).
     */
    async bulk_delete_otts_library_contents(ott_ids: string[]) {
        return POST<{
            requested_otts: number;
            cleared_otts: number;
            total_deleted: number;
            per_ott: Array<{ ott_id: string; deleted: number; failed: number }>;
        }>(`/api/library/otts/bulk_delete_contents`, { ott_ids }, { timeout: 0 });
    },

    async list_library_otts() {
        return GET<{
            otts: Array<{
                id: string;
                name: string;
                favicon_url: string | null;
                counts: {
                    total: number;
                    folder_count: number;
                };
            }>;
        }>(`/api/library/otts`);
    },

    // `upload_local_files` was removed in the R2 migration — the
    // backend endpoint /api/library/upload_local_files no longer
    // exists. Callers now go through `local_uploads_service.upload_files`
    // which runs the signed-URL R2 flow.

    async get_library_folders(ott_id: string) {
        return GET<{
            folders: Array<{
                parent_api_id: string | null;
                parent_item_key: string | null;
                title: string;
                item_count: number;
                completed_count: number;
                failed_count: number;
                in_progress_count: number;
                thumbnail_url: string | null;
                latest_at: string | null;
            }>;
        }>(`/api/ott/${ott_id}/library/folders`);
    },

    async get_library_item(ott_id: string, library_item_id: string) {
        return GET<LibraryItem>(`/api/ott/${ott_id}/library/${library_item_id}`);
    },

    async retry_library_item(ott_id: string, library_item_id: string) {
        return POST<LibraryItem>(`/api/ott/${ott_id}/library/${library_item_id}/retry`);
    },

    /**
     * Stub kept for compile compat — the Phase-1 reliability/retry
     * endpoints were retired with the Drive flow. The only caller
     * (`on_retry` on LibraryCard) is no longer rendered. Always 404s
     * against the current backend.
     */
    async reupload_library_item(ott_id: string, library_item_id: string) {
        return POST<LibraryItem>(`/api/ott/${ott_id}/library/${library_item_id}/reupload`);
    },

    async delete_library_item(ott_id: string, library_item_id: string) {
        return DELETE<{ id: string }>(`/api/ott/${ott_id}/library/${library_item_id}`, { timeout: 0 });
    },

    /** Bulk delete library items + their local files — used by the multi-select toolbar. */
    async bulk_delete_library_items(ott_id: string, ids: string[]) {
        return POST<{
            requested: number;
            deleted: number;
            missing_ids: string[];
            failed: Array<{ id: string; error: string }>;
        }>(`/api/ott/${ott_id}/library/bulk_delete`, { ids }, { timeout: 0 });
    },

    /**
     * Bulk delete every item inside one or more folders. Each folder is
     * identified by (parent_item_key, parent_api_id). Pass parent_item_key
     * as null to target the synthetic "Ungrouped" bucket.
     */
    async bulk_delete_library_folders(
        ott_id: string,
        folders: Array<{ parent_item_key: string | null; parent_api_id: string | null }>,
    ) {
        return POST<{
            requested_folders: number;
            total_deleted: number;
            folders: Array<{
                parent_item_key: string | null;
                parent_api_id: string | null;
                deleted: number;
                failed: number;
            }>;
        }>(`/api/ott/${ott_id}/library/folders/bulk_delete`, { folders }, { timeout: 0 });
    },

    // HLS / preview helpers removed in the R2 migration — file_url is
    // the single source of truth now.

    get_library_download_url(ott_id: string, library_item_id: string) {
        const base = String(API_BASE_URL_RESOLVED).replace(/\/$/, "");
        return `${base}/api/ott/${ott_id}/library/${library_item_id}/download`;
    },

    get_library_stream_url(ott_id: string, library_item_id: string) {
        const base = String(API_BASE_URL_RESOLVED).replace(/\/$/, "");
        return `${base}/api/ott/${ott_id}/library/${library_item_id}/stream`;
    },
};

// Window event used by sidebar / list pages to refresh after mutations.
export const OTT_LIST_UPDATED_EVENT = "ott_list_updated";

export function notify_ott_list_updated() {
    if (typeof window !== "undefined") {
        window.dispatchEvent(new Event(OTT_LIST_UPDATED_EVENT));
    }
}
