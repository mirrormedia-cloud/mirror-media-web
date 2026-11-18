import { api_client, normalize_envelope, ServiceEnvelope } from "@/lib/api_client";

export type AutoPostFrequency = "every_day" | "every_week" | "every_month";

export interface AutoPostConfig {
    id: string;
    enabled: boolean;
    social_account_id: string | null;
    frequency: AutoPostFrequency;
    /** HH:MM in `timezone`. Length = posts per day. */
    post_times: string[];
    weekdays: number[];
    month_days: number[];
    timezone: string;
    /** Always true — content is always AI-generated. */
    auto_generate: true;
    enabled_at: string | null;
    updatedAt: string;
}

export interface AutoPostLog {
    id: string;
    slot_key: string;
    content: string | null;
    status: "pending" | "posted" | "failed";
    platform_post_id: string | null;
    post_url: string | null;
    error_message: string | null;
    posted_at: string | null;
    createdAt: string;
}

export interface AutoPostState {
    config: AutoPostConfig;
    facebook_accounts: { id: string; page_id: string | null; page_name: string | null }[];
    facebook_connected: boolean;
    logs: AutoPostLog[];
}

export type SaveAutoPostPayload = Partial<
    Pick<AutoPostConfig, "enabled" | "social_account_id" | "frequency" | "post_times" | "weekdays" | "month_days" | "timezone">
>;

export const auto_post_service = {
    async get(): Promise<ServiceEnvelope<AutoPostState>> {
        const res = await api_client.get("/api/auto-post");
        return normalize_envelope<AutoPostState>(res.data);
    },

    async save(payload: SaveAutoPostPayload): Promise<ServiceEnvelope<AutoPostConfig>> {
        const res = await api_client.put("/api/auto-post", payload);
        return normalize_envelope<AutoPostConfig>(res.data);
    },

    async preview(): Promise<ServiceEnvelope<{ message: string; topic: string }>> {
        const res = await api_client.post("/api/auto-post/preview", {});
        return normalize_envelope(res.data);
    },

    async post_now(): Promise<ServiceEnvelope<AutoPostLog>> {
        const res = await api_client.post("/api/auto-post/post-now", {});
        return normalize_envelope<AutoPostLog>(res.data);
    },
};
