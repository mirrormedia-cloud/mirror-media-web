import { api_client, normalize_envelope, ServiceEnvelope } from "@/lib/api_client";

export interface AutomationButton {
    title: string;
    action: string;
    url?: string;
}

export interface AutomationRule {
    id: string;
    platform: "instagram" | "facebook";
    type: "comment";
    ig_account_id: string;
    trigger_keywords: string[];
    comment_reply: { text: string };
    dm_message: { text: string; buttons: AutomationButton[] };
    status: "active" | "inactive";
    createdAt: string;
    updatedAt: string;
}

export interface CreateAutomationPayload {
    platform?: "instagram" | "facebook";
    type?: "comment";
    ig_account_id: string;
    trigger_keywords: string[];
    comment_reply: { text: string };
    dm_message: { text: string; buttons: AutomationButton[] };
    status?: "active" | "inactive";
}

export type UpdateAutomationPayload = Partial<Omit<CreateAutomationPayload, "ig_account_id">>;

export const automation_service = {
    async list_rules(): Promise<ServiceEnvelope<AutomationRule[]>> {
        const res = await api_client.get("/api/automation/rules");
        return normalize_envelope<AutomationRule[]>(res.data);
    },

    async get_rule(id: string): Promise<ServiceEnvelope<AutomationRule>> {
        const res = await api_client.get(`/api/automation/rules/${id}`);
        return normalize_envelope<AutomationRule>(res.data);
    },

    async create_rule(payload: CreateAutomationPayload): Promise<ServiceEnvelope<AutomationRule>> {
        const res = await api_client.post("/api/automation/rules", payload);
        return normalize_envelope<AutomationRule>(res.data);
    },

    async update_rule(id: string, payload: UpdateAutomationPayload): Promise<ServiceEnvelope<AutomationRule>> {
        const res = await api_client.put(`/api/automation/rules/${id}`, payload);
        return normalize_envelope<AutomationRule>(res.data);
    },

    async delete_rule(id: string): Promise<ServiceEnvelope<{ id: string }>> {
        const res = await api_client.delete(`/api/automation/rules/${id}`);
        return normalize_envelope<{ id: string }>(res.data);
    },
};
