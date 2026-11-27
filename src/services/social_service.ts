/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { api_client, normalize_envelope, ServiceEnvelope } from "@/lib/api_client";

export type SocialPlatform = "youtube" | "facebook" | "instagram" | "tiktok" | "telegram";

export interface SocialAccount {
    id: string;
    platform: SocialPlatform;
    account_id: string | null;
    account_name: string | null;
    page_id: string | null;
    page_name: string | null;
    channel_id: string | null;
    channel_name: string | null;
    scopes: string[];
    status: string;
    has_access_token: boolean;
    has_refresh_token: boolean;
    token_type: string | null;
    expiresAt: string | null;
    remaining_seconds: number | null;
    metadata: Record<string, any>;
    createdAt: string | null;
    updatedAt: string | null;
}

export interface PlatformStatus {
    platform: SocialPlatform;
    connected: boolean;
    accounts: SocialAccount[];
}

export const social_service = {
    async list_accounts(): Promise<ServiceEnvelope<{ accounts: SocialAccount[] }>> {
        const res = await api_client.get("/api/social/accounts");
        return normalize_envelope(res.data);
    },

    /**
     * Get the OAuth consent URL for a platform. Frontend opens it in a
     * popup; the popup closes itself after the callback fires server-side.
     */
    async get_connect_url(platform: SocialPlatform, kind: "web" | "app" = "web"): Promise<ServiceEnvelope<{ url: string; platform: SocialPlatform }>> {
        const res = await api_client.get(`/api/social/${platform}/connect`, { params: { platform: kind } });
        return normalize_envelope(res.data);
    },

    /**
     * Telegram has no OAuth — the backend verifies the bot token is valid
     * and the bot is an admin of the channel, then stores the account.
     */
    async connect_telegram(payload: { telegram_bot_token: string; telegram_channel_username: string }): Promise<ServiceEnvelope<SocialAccount>> {
        const res = await api_client.post(`/api/social/telegram/connect`, payload);
        return normalize_envelope(res.data);
    },

    /**
     * Fresh TikTok creator_info for the post panel: nickname/avatar,
     * allowed privacy levels, interaction limits, max video duration.
     */
    async get_tiktok_creator_info(): Promise<ServiceEnvelope<TikTokCreatorInfo>> {
        const res = await api_client.get(`/api/social/tiktok/creator_info`);
        return normalize_envelope(res.data);
    },

    async get_status(platform: SocialPlatform): Promise<ServiceEnvelope<PlatformStatus>> {
        const res = await api_client.get(`/api/social/${platform}/status`);
        return normalize_envelope(res.data);
    },

    async refresh_token(platform: SocialPlatform): Promise<ServiceEnvelope<SocialAccount>> {
        const res = await api_client.post(`/api/social/${platform}/refresh_token`);
        return normalize_envelope(res.data);
    },

    async disconnect(platform: SocialPlatform): Promise<ServiceEnvelope<{ platform: SocialPlatform; removed: number }>> {
        const res = await api_client.post(`/api/social/${platform}/disconnect`);
        return normalize_envelope(res.data);
    },

    // ── Upload / history ───────────────────────────────────────────────
    async create_upload(payload: SocialUploadPayload): Promise<ServiceEnvelope<{ uploads: SocialUploadRow[] }>> {
        const res = await api_client.post(`/api/social/upload`, payload);
        return normalize_envelope(res.data);
    },

    async list_uploads(params: { library_item_id?: string; platform?: SocialPlatform; status?: string; search?: string; date_from?: string; date_to?: string; page?: number; limit?: number } = {}): Promise<ServiceEnvelope<{ total: number; page: number; limit: number; uploads: SocialUploadRow[] }>> {
        const res = await api_client.get(`/api/social/uploads`, { params });
        return normalize_envelope(res.data);
    },

    /**
     * Aggregate counts across the user's full social_uploads table (NOT
     * limited to a page). Backend returns `{ total, by_status, by_platform }`.
     * The history page calls this without filter params so the stat cards
     * show overall totals — pagination changes the table rows, not the
     * counts at the top.
     */
    async get_upload_stats(params: { platform?: SocialPlatform; status?: string } = {}): Promise<ServiceEnvelope<{
        total: number;
        by_status: Record<'draft' | 'scheduled' | 'uploading' | 'uploaded' | 'failed' | 'cancelled', number>;
        by_platform: Record<'youtube' | 'facebook' | 'instagram' | 'tiktok' | 'telegram', number>;
    }>> {
        const res = await api_client.get(`/api/social/uploads/stats`, { params });
        return normalize_envelope(res.data);
    },

    /**
     * Manually trigger uploads for a calendar schedule slot. Backend
     * pulls library_item_id + platforms + title from the slot (and its
     * parent batch) and runs the same dispatch as a library-card upload.
     */
    async upload_schedule_item(schedule_item_id: string): Promise<ServiceEnvelope<{ uploads: SocialUploadRow[] }>> {
        const res = await api_client.post(`/api/social/upload_schedule_item/${schedule_item_id}`);
        return normalize_envelope(res.data);
    },

    /**
     * Run the YouTube copyright sweep for the current user right now,
     * bypassing the per-row 15-min cooldown. Any video flagged for
     * copyright / Content-ID issues is permanently deleted on YouTube
     * and the matching social_upload row is marked failed.
     */
    async youtube_copyright_check_now(): Promise<ServiceEnvelope<CopyrightSweepResult>> {
        const res = await api_client.post(`/api/social/youtube/copyright_check`);
        return normalize_envelope(res.data);
    },

    /** Per-row variant — checks one upload by id. */
    async youtube_copyright_check_one(upload_id: string): Promise<ServiceEnvelope<CopyrightCheckOutcome>> {
        const res = await api_client.post(`/api/social/youtube/copyright_check/${upload_id}`);
        return normalize_envelope(res.data);
    },
};

export interface CopyrightCheckOutcome {
    upload_id: string;
    video_id: string | null;
    skipped: 'cooldown' | 'no_account' | 'no_video_id' | null;
    has_issue: boolean;
    reason: string | null;
    summary: string | null;
    deleted: boolean;
    error: string | null;
}

export interface CopyrightSweepResult {
    checked: number;
    deleted: number;
    clean: number;
    errors: number;
    skipped: number;
    outcomes: CopyrightCheckOutcome[];
}

// ── TikTok post settings ───────────────────────────────────────────────

export type TikTokPrivacyLevel = "PUBLIC_TO_EVERYONE" | "MUTUAL_FOLLOW_FRIENDS" | "FOLLOWER_OF_CREATOR" | "SELF_ONLY";

export interface TikTokCreatorInfo {
    account_id: string;
    creator_available: boolean;
    creator_avatar_url: string | null;
    creator_username: string | null;
    creator_nickname: string | null;
    privacy_level_options: TikTokPrivacyLevel[];
    comment_disabled: boolean;
    duet_disabled: boolean;
    stitch_disabled: boolean;
    max_video_post_duration_sec: number | null;
}

/** What the creator picked in the TikTok post panel — sent with the upload. */
export interface TikTokUploadOptions {
    privacy_level: TikTokPrivacyLevel;
    allow_comment: boolean;
    allow_duet: boolean;
    allow_stitch: boolean;
    brand_organic_toggle: boolean;
    brand_content_toggle: boolean;
}

// ── Upload types ───────────────────────────────────────────────────────

export interface SocialUploadManualDetails {
    title?: string;
    description?: string;
    caption?: string;
    tags?: string[];
    hashtags?: string[];
}

export interface SocialUploadPayload {
    library_item_id: string;
    platforms: SocialPlatform[];
    /** Required only when `auto_details` is false. */
    title?: string;
    description?: string;
    tags?: string[];
    hashtags?: string[];
    /** ISO 8601. Platform schedules the publish for that time when set. */
    scheduledAt?: string;
    visibility?: "public" | "unlisted" | "private";
    youtube_category_id?: string;
    schedule_item_id?: string;
    /** When true, missing per-platform fields are filled from Gemini. */
    auto_details?: boolean;
    /** Manual values that override the generated ones, per-field. */
    manual_details?: SocialUploadManualDetails;
    /** TikTok post panel choices (required by TikTok's sharing guidelines). */
    tiktok_options?: TikTokUploadOptions;
}

export interface SocialUploadRow {
    id: string;
    ott_id: string | null;
    library_item_id: string | null;
    schedule_item_id: string | null;
    social_account_id: string | null;
    platform: SocialPlatform;
    title: string | null;
    description: string | null;
    tags: string[];
    hashtags: string[];
    media_url: string | null;
    platform_media_id: string | null;
    platform_post_id: string | null;
    scheduledAt: string | null;
    publishedAt: string | null;
    visibility: string | null;
    status: "draft" | "scheduled" | "uploading" | "uploaded" | "failed" | "cancelled";
    upload_result: Record<string, any>;
    error_message: string | null;
    metadata: Record<string, any>;
    auto_details: boolean;
    analysis_result_id: string | null;
    platform_details: Record<string, {
        title?: string;
        description?: string;
        caption?: string;
        tags?: string[];
        hashtags?: string[];
    }>;
    createdAt: string | null;
    updatedAt: string | null;
    /** Backend-enriched related-row summaries — populated by
     *  list_uploads so the UI can render human-friendly names instead
     *  of raw UUIDs. All optional / nullable since FKs may be empty. */
    library_item?: { title: string | null; file_name: string | null; parent_title: string | null } | null;
    schedule_item?: { title: string | null; scheduled_at: string | null; batch_name: string | null } | null;
    social_account?: { channel_name: string | null; account_name: string | null; platform: string } | null;
}
