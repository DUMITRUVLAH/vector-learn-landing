import { api } from "../api";

export interface CadenceStep {
  delay_days: number;
  action: "send_template" | "create_task";
  template_id?: string;
  task_title?: string;
}

export interface Cadence {
  id: string;
  tenantId: string;
  name: string;
  triggerStage: string;
  enabled: boolean;
  steps: CadenceStep[];
  activeEnrollments?: number;
  createdAt: string;
  updatedAt: string;
}

export interface CadenceEnrollment {
  enrollment: {
    id: string;
    leadId: string;
    cadenceId: string;
    enrolledAt: string;
    currentStep: number;
    status: "active" | "paused" | "completed" | "cancelled";
    nextFireAt: string | null;
    updatedAt: string;
  };
  cadence: Cadence;
}

export async function listCadences(): Promise<Cadence[]> {
  const res = await api<{ cadences: Cadence[] }>("/api/cadences");
  return res.cadences;
}

export async function createCadence(data: {
  name: string;
  triggerStage: string;
  enabled?: boolean;
  steps: CadenceStep[];
}): Promise<Cadence> {
  const res = await api<Cadence>("/api/cadences", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return res;
}

export async function updateCadence(
  id: string,
  data: Partial<{ name: string; triggerStage: string; enabled: boolean; steps: CadenceStep[] }>
): Promise<Cadence> {
  const res = await api<Cadence>(`/api/cadences/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return res;
}

export async function deleteCadence(id: string): Promise<void> {
  await api(`/api/cadences/${id}`, { method: "DELETE" });
}

export async function getLeadEnrollments(leadId: string): Promise<CadenceEnrollment[]> {
  const res = await api<{ enrollments: CadenceEnrollment[] }>(`/api/cadences/enrollments/${leadId}`);
  return res.enrollments;
}

export async function pauseEnrollment(enrollmentId: string): Promise<void> {
  await api(`/api/cadences/enrollments/${enrollmentId}/pause`, { method: "POST" });
}
