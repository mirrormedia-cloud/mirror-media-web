/**
 * Frontend HTTP wrappers around /api/notifications/*. All routes require
 * the JWT — api_client appends it automatically via its interceptor.
 */

import { api_client, normalize_envelope, ServiceEnvelope } from "@/lib/api_client";
import { is_native, get_device_type } from "@/lib/push";

export type NotificationType = "error" | "warning" | "reminder" | "info";
export type NotificationPriority = "low" | "normal" | "high" | "critical";
export type NotificationChannel = "app" | "whatsapp" | "both";
export type NotificationStatus = "unread" | "read" | "failed";

export interface NotificationItem {
    id: string;
    user_id: string;
    session_id: string | null;
    type: NotificationType;
    module: string;
    title: string;
    message: string;
    event_type: string | null;
    related_id: string | null;
    redirect_url: string | null;
    sent_push: boolean;
    is_read: boolean;
    priority: NotificationPriority;
    channel: NotificationChannel;
    action_label: string | null;
    payload: Record<string, any> | null;
    error_message: string | null;
    whatsapp_sent: boolean;
    whatsapp_status: string | null;
    whatsapp_error: string | null;
    read_at: string | null;
    created_at: string;
}

export interface NotificationHistoryResult {
    items: NotificationItem[];
    total: number;
    unread_count: number;
    page: number;
    page_size: number;
}

export interface NotificationSettings {
    whatsapp_enabled: boolean;
    app_notification_enabled: boolean;
    whatsapp_api_configured: boolean;
}

export interface ActiveSession {
    id: string;
    device_type: string;
    device_name: string | null;
    browser: string | null;
    os: string | null;
    ip_address: string | null;
    notification_permission: "default" | "granted" | "denied";
    last_seen_at: string | null;
    login_time: string | null;
    is_current: boolean;
    push_enabled: boolean;
}

/** Derive display status from notification fields */
export function get_notification_status(item: Pick<NotificationItem, "is_read" | "error_message">): NotificationStatus {
    if (item.error_message) return "failed";
    if (item.is_read) return "read";
    return "unread";
}

function describe_browser(): { browser: string; os: string; device_name: string } {
    const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
    const browser = /Edg\//.test(ua) ? "Edge"
        : /Chrome\//.test(ua) ? "Chrome"
        : /Firefox\//.test(ua) ? "Firefox"
        : /Safari\//.test(ua) ? "Safari"
        : "Browser";
    const os = /Windows/i.test(ua) ? "Windows"
        : /Mac OS X/i.test(ua) ? "macOS"
        : /Android/i.test(ua) ? "Android"
        : /iPhone|iPad|iPod/i.test(ua) ? "iOS"
        : /Linux/i.test(ua) ? "Linux"
        : "Other";
    return { browser, os, device_name: `${browser} on ${os}` };
}

export async function register_fcm_token(
    fcm_token: string,
    permission: "default" | "granted" | "denied" = "granted"
): Promise<ServiceEnvelope<null>> {
    const desc = describe_browser();
    const device_type = get_device_type();
    const native = is_native();
    const res = await api_client.post("/api/notifications/register-token", {
        fcm_token,
        notification_permission: permission,
        device_type,
        device_name: native ? `${device_type} app` : desc.device_name,
        browser: desc.browser,
        os: native ? device_type : desc.os,
    });
    return normalize_envelope(res.data);
}

export async function update_permission_state(
    permission: "default" | "granted" | "denied"
): Promise<ServiceEnvelope<null>> {
    const res = await api_client.post("/api/notifications/permission", {
        notification_permission: permission,
    });
    return normalize_envelope(res.data);
}

export interface FetchHistoryOptions {
    page?: number;
    page_size?: number;
    unread_only?: boolean;
    module?: string;
    type?: NotificationType;
    status?: NotificationStatus;
    priority?: NotificationPriority;
    channel?: NotificationChannel;
    search?: string;
}

export async function fetch_notification_history(
    opts: FetchHistoryOptions = {}
): Promise<ServiceEnvelope<NotificationHistoryResult>> {
    const params: Record<string, string | number | boolean> = {};
    if (opts.page) params.page = opts.page;
    if (opts.page_size) params.page_size = opts.page_size;
    if (opts.unread_only) params.unread_only = opts.unread_only;
    if (opts.module) params.module = opts.module;
    if (opts.type) params.type = opts.type;
    if (opts.status) params.status = opts.status;
    if (opts.priority) params.priority = opts.priority;
    if (opts.channel) params.channel = opts.channel;
    if (opts.search) params.search = opts.search;
    const res = await api_client.get("/api/notifications/history", { params });
    return normalize_envelope(res.data);
}

export async function fetch_unread_count(): Promise<ServiceEnvelope<{ count: number }>> {
    const res = await api_client.get("/api/notifications/unread-count");
    return normalize_envelope(res.data);
}

export async function fetch_notification_by_id(id: string): Promise<ServiceEnvelope<NotificationItem>> {
    const res = await api_client.get(`/api/notifications/${id}`);
    return normalize_envelope(res.data);
}

export async function mark_notification_read(id: string): Promise<ServiceEnvelope<null>> {
    const res = await api_client.post(`/api/notifications/${id}/read`);
    return normalize_envelope(res.data);
}

export async function mark_all_read(): Promise<ServiceEnvelope<null>> {
    const res = await api_client.post("/api/notifications/read-all");
    return normalize_envelope(res.data);
}

export async function delete_notification(id: string): Promise<ServiceEnvelope<{ unread_count: number }>> {
    const res = await api_client.delete(`/api/notifications/${id}`);
    return normalize_envelope(res.data);
}

export async function clear_read_notifications(): Promise<ServiceEnvelope<null>> {
    const res = await api_client.delete("/api/notifications/clear-read");
    return normalize_envelope(res.data);
}

export async function fetch_notification_settings(): Promise<ServiceEnvelope<NotificationSettings>> {
    const res = await api_client.get("/api/notifications/settings");
    return normalize_envelope(res.data);
}

export async function update_notification_settings(
    settings: Partial<Pick<NotificationSettings, "whatsapp_enabled" | "app_notification_enabled">>
): Promise<ServiceEnvelope<NotificationSettings>> {
    const res = await api_client.patch("/api/notifications/settings", settings);
    return normalize_envelope(res.data);
}

export async function send_test_whatsapp(): Promise<ServiceEnvelope<null>> {
    const res = await api_client.post("/api/notifications/test-whatsapp");
    return normalize_envelope(res.data);
}

export async function list_active_sessions(): Promise<ServiceEnvelope<{ items: ActiveSession[] }>> {
    const res = await api_client.get("/api/notifications/sessions");
    return normalize_envelope(res.data);
}

export async function logout_session(session_id: string): Promise<ServiceEnvelope<null>> {
    const res = await api_client.post(`/api/notifications/sessions/${session_id}/logout`);
    return normalize_envelope(res.data);
}
