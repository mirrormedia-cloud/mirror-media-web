/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { api_client, normalize_envelope, ServiceEnvelope } from "@/lib/api_client";

export type AnalysisPlatform = "youtube" | "facebook" | "instagram" | "general";
export type AnalysisStatus = "pending" | "completed" | "failed";

export interface ManualOverrides {
    title?: string;
    description?: string;
    caption?: string;
    tags?: string[];
    hashtags?: string[];
}

export interface AnalysisRow {
    id: string;
    user_id: string;
    ott_id: string | null;
    library_item_id: string;
    platform: AnalysisPlatform;
    title: string | null;
    description: string | null;
    caption: string | null;
    tags: string[];
    hashtags: string[];
    keywords: string[];
    category: string | null;
    language: string | null;
    analysis_provider: string;
    prompt_type: string | null;
    raw_analysis: Record<string, any>;
    status: AnalysisStatus;
    error_message: string | null;
    createdAt: string | null;
    updatedAt: string | null;
    deletedAt: string | null;
}

/** Legacy shape returned by the old /analyze endpoint — kept so the
 *  existing SocialUploadModal doesn't break. */
export interface AnalysisResult {
    platform: AnalysisPlatform;
    title: string;
    description: string;
    tags: string[];
    hashtags: string[];
    keywords?: string[];
    raw?: string;
}

export const media_analysis_service = {
    /**
     * Run (or fetch cached) analysis for one (library_item, platform).
     * Returns the persisted row — `status='completed'` when ready.
     */
    async analyze(payload: {
        library_item_id: string;
        ott_id?: string;
        platform?: AnalysisPlatform;
        context?: string;
        force_refresh?: boolean;
        manual_overrides?: ManualOverrides;
    }): Promise<ServiceEnvelope<AnalysisRow & AnalysisResult>> {
        // Server returns the full AnalysisRow shape; we type it as the
        // intersection so legacy callers reading `.title` etc still work.
        const res = await api_client.post("/api/media-analysis/analyze", payload);
        return normalize_envelope(res.data);
    },

    /** Paginated list of analyses for the current user. */
    async list(params: {
        ott_id?: string;
        library_item_id?: string;
        platform?: AnalysisPlatform;
        status?: AnalysisStatus;
        page?: number;
        limit?: number;
    } = {}): Promise<ServiceEnvelope<{ total: number; page: number; limit: number; analyses: AnalysisRow[] }>> {
        const res = await api_client.get("/api/media-analysis", { params });
        return normalize_envelope(res.data);
    },

    /** All analyses for one library item, plus a `latest_by_platform` map. */
    async for_library_item(library_item_id: string): Promise<ServiceEnvelope<{
        library_item_id: string;
        analyses: AnalysisRow[];
        latest_by_platform: Record<AnalysisPlatform, AnalysisRow | undefined>;
    }>> {
        const res = await api_client.get(`/api/media-analysis/library/${library_item_id}`);
        return normalize_envelope(res.data);
    },

    /** Soft-delete one analysis row. */
    async remove(analysis_id: string): Promise<ServiceEnvelope<{ id: string }>> {
        const res = await api_client.delete(`/api/media-analysis/${analysis_id}`);
        return normalize_envelope(res.data);
    },
};
