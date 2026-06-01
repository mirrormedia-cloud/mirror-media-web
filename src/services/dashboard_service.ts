import { api_client, normalize_envelope, ServiceEnvelope } from "@/lib/api_client";

export interface DashboardSummary {
    total_otts: number;
    active_otts: number;
    total_library_items: number;
    completed_library_items: number;
    failed_library_items: number;
    today_schedules: number;
    upcoming_schedules: number;
    social_uploaded: number;
    social_failed: number;
    social_scheduled: number;
}

export interface DashboardLibraryStatus {
    completed: number;
    failed: number;
}

export interface DashboardSocialStatus {
    youtube:   { uploaded: number; scheduled: number; failed: number };
    facebook:  { uploaded: number; scheduled: number; failed: number };
    instagram: { uploaded: number; scheduled: number; failed: number };
}

export interface DashboardActivityItem {
    id: string;
    module: 'library' | 'social' | 'schedule';
    title: string;
    status: string | null;
    meta: any;
    updatedAt: string | null;
}

export interface DashboardFailedItem {
    id: string;
    module: 'library' | 'social';
    title: string;
    error_message: string | null;
    meta: any;
    updatedAt: string | null;
}

export interface DashboardUpcomingItem {
    id: string;
    title: string;
    scheduledAt: string | null;
    platforms: string[];
    status: string | null;
}

export interface DashboardOverview {
    fetched_at: string;
    summary: DashboardSummary;
    library_status: DashboardLibraryStatus;
    social_status: DashboardSocialStatus;
    recent_activity: DashboardActivityItem[];
    recent_failed_items: DashboardFailedItem[];
    upcoming_schedules: DashboardUpcomingItem[];
    top_otts: Array<{ ott_id: string; name: string; library_count: number }>;
    system_health: {
        tokens: { connected: number; expired: number };
        per_platform_token_status: Record<string, 'connected' | 'expired' | 'missing'>;
        social_queue: { active: number; failed: number };
    };
}

export const dashboard_service = {
    async overview(): Promise<ServiceEnvelope<DashboardOverview>> {
        const res = await api_client.get("/api/dashboard/overview");
        return normalize_envelope(res.data);
    },
};
