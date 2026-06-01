/**
 * Frontend service for the backend cron registry. Pairs with
 * backend/src/modules/crons/crons.routes.ts.
 */

import { api_client, normalize_envelope, ServiceEnvelope } from "@/lib/api_client";

export interface CronState {
    id: string;
    label: string;
    description: string;
    interval_ms: number;
    started_at: string | null;
    last_run_at: string | null;
    last_run_ok: boolean | null;
    last_run_summary: string | null;
    last_run_duration_ms: number | null;
    next_run_at: string | null;
    is_running: boolean;
}

export const cron_service = {
    async list(): Promise<ServiceEnvelope<{ crons: CronState[] }>> {
        const res = await api_client.get(`/api/crons/`);
        return normalize_envelope(res.data);
    },

    async run(id: string): Promise<ServiceEnvelope<{ id: string; summary: string; state: CronState }>> {
        const res = await api_client.post(`/api/crons/${encodeURIComponent(id)}/run`);
        return normalize_envelope(res.data);
    },
};
