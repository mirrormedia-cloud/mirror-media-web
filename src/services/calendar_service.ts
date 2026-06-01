/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { api_client, normalize_envelope, ServiceEnvelope } from "@/lib/api_client";

export type CalendarEventType =
    | "content_release"
    | "reminder"
    | "meeting"
    | "task"
    | "campaign"
    | "maintenance"
    | "custom"
    | "upload_schedule";

export type CalendarEventStatus = "scheduled" | "completed" | "cancelled" | "uploaded" | "failed";

export interface CalendarEvent {
    id: string;
    title: string;
    description: string | null;
    startAt: string;
    endAt: string | null;
    all_day: boolean;
    event_type: CalendarEventType;
    color: string | null;
    status: CalendarEventStatus;
    upload_schedule_item_id?: string | null;
    library_item_id?: string | null;
    ott_id?: string | null;
    metadata?: Record<string, any>;
    createdAt: string;
    updatedAt: string;
    deletedAt?: string | null;
}

export interface CalendarEventPayload {
    title: string;
    description?: string | null;
    startAt: string;
    endAt?: string | null;
    all_day?: boolean;
    event_type: CalendarEventType;
    color?: string | null;
    status?: CalendarEventStatus;
}

export interface ListEventsParams {
    start?: string;
    end?: string;
    event_type?: CalendarEventType;
    event_types?: string;
}

export type SupportedPlatform = "facebook" | "youtube" | "instagram";
export type ScheduleFrequency = "every_day" | "every_week" | "every_month" | "custom_range";
export type ScheduleStatus = "draft" | "scheduled" | "completed" | "cancelled";
export type ScheduleItemStatus = "draft" | "scheduled" | "uploading" | "uploaded" | "failed" | "cancelled";

export interface SchedulePayload {
    ott_id: string;
    library_item_ids: string[];
    scheduled?: boolean;
    platforms: SupportedPlatform[];
    frequency?: ScheduleFrequency | null;
    release_count?: number;
    upload_times?: string[];
    start_date?: string | null;
    end_date?: string | null;
    weekdays?: number[];
    month_days?: number[];
    color?: string | null;
    title_prefix?: string | null;
    description?: string | null;
    tags?: string[];
    name?: string | null;
    metadata?: Record<string, any>;
    /** When true, the cron will fill missing per-platform fields from a Gemini analysis. */
    auto_details?: boolean;
    /** Manual values that win over generated ones, per-field. */
    manual_details?: {
        title?: string;
        description?: string;
        caption?: string;
        tags?: string[];
        hashtags?: string[];
    };
    /** Per-platform overrides — wins over `manual_details` per-field. */
    platform_details?: Record<string, {
        title?: string;
        description?: string;
        caption?: string;
        tags?: string[];
        hashtags?: string[];
    }>;
}

export interface SchedulePreviewItem {
    library_item_id: string;
    title: string | null;
    scheduledAt: string | null;
    platforms: string[];
    color: string | null;
}

export interface SchedulePreviewResponse {
    total_files: number;
    total_slots: number;
    scheduled_count: number;
    unscheduled_count: number;
    warnings: string[];
    items: SchedulePreviewItem[];
}

export interface ScheduleBatch {
    id: string;
    ott_id: string | null;
    ott_name?: string | null;
    name: string | null;
    scheduled: boolean;
    platforms: SupportedPlatform[];
    frequency: ScheduleFrequency | null;
    release_count: number;
    upload_times: string[];
    start_date: string | null;
    end_date: string | null;
    weekdays: number[];
    month_days: number[];
    color: string | null;
    title_prefix: string | null;
    description: string | null;
    tags: string[];
    status: ScheduleStatus;
    items_count: number | null;
    scheduled_count: number | null;
    metadata: Record<string, any>;
    createdAt: string;
    updatedAt: string;
    deletedAt?: string | null;
}

export interface ScheduleItem {
    id: string;
    batch_id: string | null;
    ott_id: string | null;
    library_item_id: string | null;
    calendar_event_id: string | null;
    title: string | null;
    description: string | null;
    platforms: SupportedPlatform[];
    scheduledAt: string | null;
    color: string | null;
    status: ScheduleItemStatus;
    upload_result: Record<string, any>;
    error_message: string | null;
    metadata: Record<string, any>;
    library_item: {
        id: string;
        title: string | null;
        thumbnail_url: string | null;
        file_name: string | null;
        duration: string | null;
        save_type: string | null;
        status: string | null;
    } | null;
    createdAt: string;
    updatedAt: string;
    deletedAt?: string | null;
}

export interface CreateScheduleResponse {
    batch: ScheduleBatch;
    items: ScheduleItem[];
    warnings: string[];
    scheduled_count: number;
    unscheduled_count: number;
}

export interface ListSchedulesResponse {
    total: number;
    page: number;
    limit: number;
    batches: ScheduleBatch[];
}

export interface ScheduleDetailResponse {
    batch: ScheduleBatch;
    items: ScheduleItem[];
}

export interface LibraryScheduleStatus {
    library_item_id: string;
    next_scheduledAt: string | null;
    batch_id: string;
    platforms: string[];
    status: string;
}

export const calendar_service = {
    // --- events ---------------------------------------------------------
    async get_events(params: ListEventsParams = {}): Promise<ServiceEnvelope<CalendarEvent[]>> {
        const res = await api_client.get("/api/calendar/events", { params });
        return normalize_envelope<CalendarEvent[]>(res.data);
    },

    async get_event(event_id: string): Promise<ServiceEnvelope<CalendarEvent>> {
        const res = await api_client.get(`/api/calendar/events/${event_id}`);
        return normalize_envelope<CalendarEvent>(res.data);
    },

    async create_event(payload: CalendarEventPayload): Promise<ServiceEnvelope<CalendarEvent>> {
        const res = await api_client.post("/api/calendar/events", payload);
        return normalize_envelope<CalendarEvent>(res.data);
    },

    async update_event(
        event_id: string,
        payload: Partial<CalendarEventPayload>,
    ): Promise<ServiceEnvelope<CalendarEvent>> {
        const res = await api_client.put(`/api/calendar/events/${event_id}`, payload);
        return normalize_envelope<CalendarEvent>(res.data);
    },

    async delete_event(event_id: string): Promise<ServiceEnvelope<{ id: string }>> {
        const res = await api_client.delete(`/api/calendar/events/${event_id}`);
        return normalize_envelope<{ id: string }>(res.data);
    },

    /**
     * Wipe calendar content owned by the user. `scope`:
     *   - `'all'`   → every calendar event + every upload schedule
     *   - `'media'` → only upload schedules + their spawned
     *                 calendar events; manual events stay put
     * Long-running on large datasets — no timeout.
     */
    async clear_all(scope: 'all' | 'media' = 'all'): Promise<ServiceEnvelope<{
        scope: 'all' | 'media';
        events_deleted: number;
        batches_deleted: number;
        items_deleted: number;
    }>> {
        const res = await api_client.post(
            `/api/calendar/clear_all`,
            { scope },
            { timeout: 0 },
        );
        return normalize_envelope(res.data);
    },

    // --- upload schedules ----------------------------------------------
    async preview_upload_schedule(payload: SchedulePayload): Promise<ServiceEnvelope<SchedulePreviewResponse>> {
        const res = await api_client.post("/api/calendar/upload_schedules/preview", payload);
        return normalize_envelope<SchedulePreviewResponse>(res.data);
    },

    async create_upload_schedule(payload: SchedulePayload): Promise<ServiceEnvelope<CreateScheduleResponse>> {
        const res = await api_client.post("/api/calendar/upload_schedules", payload);
        return normalize_envelope<CreateScheduleResponse>(res.data);
    },

    async update_upload_schedule(batch_id: string, payload: SchedulePayload): Promise<ServiceEnvelope<CreateScheduleResponse>> {
        const res = await api_client.put(`/api/calendar/upload_schedules/${batch_id}`, payload);
        return normalize_envelope<CreateScheduleResponse>(res.data);
    },

    async list_upload_schedules(params: { ott_id?: string; status?: string; page?: number; limit?: number } = {}): Promise<ServiceEnvelope<ListSchedulesResponse>> {
        const res = await api_client.get("/api/calendar/upload_schedules", { params });
        return normalize_envelope<ListSchedulesResponse>(res.data);
    },

    async get_upload_schedule(batch_id: string): Promise<ServiceEnvelope<ScheduleDetailResponse>> {
        const res = await api_client.get(`/api/calendar/upload_schedules/${batch_id}`);
        return normalize_envelope<ScheduleDetailResponse>(res.data);
    },

    async cancel_upload_schedule(batch_id: string): Promise<ServiceEnvelope<{ id: string }>> {
        const res = await api_client.post(`/api/calendar/upload_schedules/${batch_id}/cancel`);
        return normalize_envelope<{ id: string }>(res.data);
    },

    async delete_upload_schedule(batch_id: string): Promise<ServiceEnvelope<{ id: string }>> {
        const res = await api_client.delete(`/api/calendar/upload_schedules/${batch_id}`);
        return normalize_envelope<{ id: string }>(res.data);
    },

    async get_library_schedule_status(params: { ott_id?: string } = {}): Promise<ServiceEnvelope<{ items: LibraryScheduleStatus[] }>> {
        const res = await api_client.get("/api/calendar/library_schedule_status", { params });
        return normalize_envelope<{ items: LibraryScheduleStatus[] }>(res.data);
    },
};
