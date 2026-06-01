/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Frontend client for /api/analytics/* endpoints. The backend pulls
 * everything live from YouTube / Facebook / Instagram on every call —
 * nothing is cached here, no DB persistence on either side. So any
 * filter change re-fetches; the spec rule is "live only".
 */

import { api_client, normalize_envelope, ServiceEnvelope } from "@/lib/api_client";

export type AnalyticsPlatform = "all" | "youtube" | "facebook" | "instagram";
export type AnalyticsStatus = "all" | "published" | "scheduled" | "failed" | "processing" | "draft";
export type AnalyticsDateRange = "today" | "last_7_days" | "last_30_days" | "custom";

export interface AnalyticsItemMetrics {
    views: number;
    plays: number;
    likes: number;
    reactions: number;
    comments_count: number;
    shares: number;
    reach: number;
    impressions: number;
    saves: number;
    engagement: number;
}

export interface AnalyticsItem {
    platform: "youtube" | "facebook" | "instagram";
    platform_id: string;
    platform_video_id: string | null;
    platform_media_id: string | null;
    platform_post_id: string | null;
    title: string | null;
    caption: string | null;
    thumbnail: string | null;
    platform_url: string | null;
    status: "published" | "scheduled" | "failed" | "processing" | "draft";
    published_at: string | null;
    metrics: AnalyticsItemMetrics;
    raw_response: any;
    platform_error: string | null;
}

export interface AnalyticsPlatformError {
    platform: "youtube" | "facebook" | "instagram";
    api_name: string;
    error_message: string;
    error_kind: "token_expired" | "permission" | "rate_limit" | "not_found" | "unknown";
}

export interface AnalyticsSummary {
    total_platform_videos: number;
    youtube_videos: number;
    facebook_videos: number;
    instagram_videos: number;
    published: number;
    scheduled: number;
    failed: number;
    processing: number;
    draft: number;
    total_views: number;
    total_likes: number;
    total_comments: number;
    total_shares: number;
    total_reach: number;
    total_impressions: number;
    total_saves: number;
    total_engagement: number;
}

export interface AnalyticsResponse {
    fetched_at: string;
    platform: AnalyticsPlatform;
    summary: AnalyticsSummary;
    /** Same shape as `summary` but only for items published today. */
    today_summary: AnalyticsSummary;
    platform_summary: {
        youtube: any;
        facebook: any;
        instagram: any;
    };
    /** Optional — only present when the request asked for `include_items=true`. */
    items?: AnalyticsItem[];
    errors: AnalyticsPlatformError[];
    /** True when the backend served from its 2-minute memory cache. */
    cached?: boolean;
}

export interface AnalyticsQuery {
    platform?: AnalyticsPlatform;
    status?: AnalyticsStatus;
    date_range?: AnalyticsDateRange;
    start_date?: string;
    end_date?: string;
    search?: string;
    limit_per_platform?: number;
    /** When true, backend bypasses its 2-minute memory cache. */
    force_refresh?: boolean;
}

export interface TodayAnalyticsResponse {
    fetched_at: string;
    platform: AnalyticsPlatform;
    today_summary: AnalyticsSummary;
    platform_summary: {
        youtube: any;
        facebook: any;
        instagram: any;
    };
    errors: AnalyticsPlatformError[];
    cached?: boolean;
}

export const analytics_service = {
    async fetch(query: AnalyticsQuery = {}): Promise<ServiceEnvelope<AnalyticsResponse>> {
        const res = await api_client.get("/api/analytics/social", { params: query });
        return normalize_envelope(res.data);
    },

    /**
     * Today-only analytics. Independent endpoint so the Today card can
     * refresh on its own cadence without paying for the full all-time
     * roundtrip. Backend always runs counts-only here, no per-video
     * insights calls — fast.
     */
    async fetch_today(query: { platform?: AnalyticsPlatform; force_refresh?: boolean } = {}): Promise<ServiceEnvelope<TodayAnalyticsResponse>> {
        const res = await api_client.get("/api/analytics/social/today", { params: query });
        return normalize_envelope(res.data);
    },
};
