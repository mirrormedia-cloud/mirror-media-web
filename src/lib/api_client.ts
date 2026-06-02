/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import axios, { AxiosError } from "axios";

const API_BASE_URL =
    (import.meta as any).env?.VITE_API_BASE_URL
    ?? (typeof process !== "undefined" ? (process as any).env?.VITE_API_BASE_URL : "")
    ?? "";

export const api_client = axios.create({
    baseURL: API_BASE_URL,
    // No client-side timeout — long-running calls (sync, bulk delete, capture,
    // large API responses) must be allowed to finish. Per-call overrides can
    // still pass `{ timeout: N }` explicitly.
    timeout: 0,
    headers: {
        "Content-Type": "application/json",
    },
});

/**
 * One key for the JWT in localStorage so login/logout/api_client all agree.
 * Exported so AuthContext can use the same constant.
 */
export const AUTH_TOKEN_KEY = "ott_auth_token";

/** Returns the current JWT, or null if not logged in. SSR-safe. */
export function get_auth_token(): string | null {
    return typeof window === "undefined" ? null : window.localStorage.getItem(AUTH_TOKEN_KEY);
}

export function set_auth_token(token: string | null) {
    if (typeof window === "undefined") return;
    if (token) window.localStorage.setItem(AUTH_TOKEN_KEY, token);
    else window.localStorage.removeItem(AUTH_TOKEN_KEY);
}

api_client.interceptors.request.use((config) => {
    const token = get_auth_token();
    if (token && config.headers) {
        (config.headers as any).Authorization = `Bearer ${token}`;
    }
    // FormData uploads need the browser/axios to set multipart/form-data
    // WITH a boundary parameter. Our global `Content-Type: application/json`
    // default would otherwise stick on FormData posts and the backend
    // rejects them with "request is not multipart". Strip the header so
    // axios re-derives the correct one from the request body.
    if (typeof FormData !== "undefined" && config.data instanceof FormData && config.headers) {
        delete (config.headers as any)["Content-Type"];
        delete (config.headers as any)["content-type"];
    }
    return config;
});

api_client.interceptors.response.use(
    (response) => response,
    (error: AxiosError<any>) => {
        // 401 from any /api/* call means the JWT is missing, expired, or rejected.
        // Clear the token and bounce the user to /login. Done at axios-level so we
        // don't have to remember this in every page. window.location (not router
        // navigation) because axios runs outside the React tree.
        // Skip hard-redirect for /api/auth/me — that's the boot-time session
        // check. A 401 there just means "not logged in"; AuthContext clears the
        // user and RequireAuth redirects via React Router (no full page reload).
        // For every other endpoint, a 401 means the token expired mid-session →
        // clear + hard redirect so the user re-authenticates.
        const is_me_check = (error?.config?.url ?? "").includes("/api/auth/me");
        if (error?.response?.status === 401 && !is_me_check) {
            set_auth_token(null);
            // Don't loop if we're already on /login (e.g. login itself returned 401).
            if (typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
                window.location.href = "/login";
            }
        }

        const data = error?.response?.data;
        const message =
            data?.error?.message
            ?? data?.message
            ?? error?.message
            ?? "Something went wrong";

        return Promise.reject({
            ...error,
            message,
            envelope: data ?? null,
        });
    },
);

export interface ServiceEnvelope<T = any> {
    success: boolean;
    code: number;
    message: string;
    data: T | null;
}

/**
 * Normalize the backend's `{ success: { status, code, message }, data, error }` envelope
 * into the simpler `{ success, code, message, data }` shape the UI consumes.
 */
export function normalize_envelope<T>(raw: any): ServiceEnvelope<T> {
    if (!raw || typeof raw !== "object") {
        return { success: false, code: 0, message: "Empty response", data: null };
    }
    if (raw.success && typeof raw.success === "object") {
        return {
            success: !!raw.success.status,
            code: raw.success.code ?? 200,
            message: raw.success.message ?? "",
            data: (raw.data ?? null) as T,
        };
    }
    if (raw.error && typeof raw.error === "object") {
        return {
            success: false,
            code: raw.error.code ?? 500,
            message: raw.error.message ?? "Request failed",
            data: null,
        };
    }
    if (typeof raw.success === "boolean") {
        return {
            success: raw.success,
            code: raw.code ?? 0,
            message: raw.message ?? "",
            data: (raw.data ?? null) as T,
        };
    }
    return { success: true, code: 200, message: "", data: raw as T };
}
