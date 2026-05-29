import { api } from "../api";

// ─── Types ─────────────────────────────────────────────────────────────────────

export type AutomationTriggerEvent = "lead.created" | "lead.stage_changed" | "time.no_contact";

export interface AutomationTrigger {
  event: AutomationTriggerEvent;
  params?: Record<string, unknown>;
}

export type AutomationConditionOp = "eq" | "neq" | "contains" | "gte" | "lte" | "exists" | "not_exists";

export interface AutomationCondition {
  field: string;
  op: AutomationConditionOp;
  value?: string | number | boolean;
}

export type AutomationActionType = "send_template" | "create_task" | "assign" | "move_stage";

export interface AutomationAction {
  type: AutomationActionType;
  params: Record<string, unknown>;
}

export interface Automation {
  id: string;
  tenantId: string;
  name: string;
  enabled: boolean;
  trigger: AutomationTrigger;
  conditions: AutomationCondition[];
  actions: AutomationAction[];
  createdAt: string;
  updatedAt: string;
}

export interface AutomationRun {
  id: string;
  tenantId: string;
  automationId: string;
  leadId: string | null;
  status: "ok" | "failed" | "skipped";
  detail: string | null;
  dryRun: boolean;
  ranAt: string;
}

export interface ActionResult {
  type: string;
  status: "ok" | "failed" | "skipped";
  detail: string;
}

export interface TestResult {
  automationId: string;
  leadId: string;
  status: "ok" | "failed" | "skipped";
  dryRun: boolean;
  actionResults: ActionResult[];
}

// ─── API functions ─────────────────────────────────────────────────────────────

export function listAutomations(): Promise<{ items: Automation[] }> {
  return api<{ items: Automation[] }>("/api/automations");
}

export function getAutomation(id: string): Promise<Automation> {
  return api<Automation>(`/api/automations/${id}`);
}

export function createAutomation(input: {
  name: string;
  enabled?: boolean;
  trigger: AutomationTrigger;
  conditions?: AutomationCondition[];
  actions: AutomationAction[];
}): Promise<Automation> {
  return api<Automation>("/api/automations", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateAutomation(
  id: string,
  patch: Partial<Omit<Automation, "id" | "tenantId" | "createdAt" | "updatedAt">>
): Promise<Automation> {
  return api<Automation>(`/api/automations/${id}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export function deleteAutomation(id: string): Promise<{ deleted: boolean }> {
  return api<{ deleted: boolean }>(`/api/automations/${id}`, { method: "DELETE" });
}

export function listAutomationRuns(automationId: string): Promise<{ items: AutomationRun[] }> {
  return api<{ items: AutomationRun[] }>(`/api/automations/${automationId}/runs`);
}

export function testAutomation(id: string): Promise<TestResult> {
  return api<TestResult>(`/api/automations/${id}/test`, { method: "POST" });
}
