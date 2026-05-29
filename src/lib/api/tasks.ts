import { api } from "../api";

export interface LeadTask {
  id: string;
  tenantId: string;
  leadId: string;
  title: string;
  dueAt: string | null;
  status: "open" | "done" | "snoozed";
  assignedTo: string | null;
  createdBy: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LeadAttachment {
  id: string;
  tenantId: string;
  leadId: string;
  fileName: string;
  fileUrl: string;
  mime: string;
  sizeBytes: number;
  uploadedBy: string | null;
  createdAt: string;
}

export function listTasks(leadId: string): Promise<{ items: LeadTask[] }> {
  return api<{ items: LeadTask[] }>(`/api/leads/${leadId}/tasks`);
}

export function createTask(
  leadId: string,
  input: { title: string; dueAt?: string | null; assignedTo?: string | null }
): Promise<LeadTask> {
  return api<LeadTask>(`/api/leads/${leadId}/tasks`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateTask(
  leadId: string,
  taskId: string,
  patch: { title?: string; dueAt?: string | null; status?: "open" | "done" | "snoozed"; assignedTo?: string | null }
): Promise<LeadTask> {
  return api<LeadTask>(`/api/leads/${leadId}/tasks/${taskId}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export function deleteTask(leadId: string, taskId: string): Promise<{ deleted: boolean }> {
  return api<{ deleted: boolean }>(`/api/leads/${leadId}/tasks/${taskId}`, { method: "DELETE" });
}

export function getNextTask(leadId: string): Promise<{ task: LeadTask | null }> {
  return api<{ task: LeadTask | null }>(`/api/leads/${leadId}/tasks/next`);
}

export function listAttachments(leadId: string): Promise<{ items: LeadAttachment[] }> {
  return api<{ items: LeadAttachment[] }>(`/api/leads/${leadId}/attachments`);
}

export function createAttachment(
  leadId: string,
  input: { fileName: string; fileUrl: string; mime: string; sizeBytes: number }
): Promise<LeadAttachment> {
  return api<LeadAttachment>(`/api/leads/${leadId}/attachments`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function deleteAttachment(leadId: string, attachmentId: string): Promise<{ deleted: boolean }> {
  return api<{ deleted: boolean }>(`/api/leads/${leadId}/attachments/${attachmentId}`, { method: "DELETE" });
}
