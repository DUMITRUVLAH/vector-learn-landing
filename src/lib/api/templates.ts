import { api } from "../api";

export type TemplateChannel = "email" | "whatsapp" | "sms";

export interface MessageTemplate {
  id: string;
  tenantId: string;
  name: string;
  channel: TemplateChannel;
  subject: string | null;
  body: string;
  variables: string[];
  createdAt: string;
  updatedAt: string;
}

export interface TemplatePreview {
  body: string;
  subject: string | null;
  warnings: string[];
}

export const KNOWN_VARIABLES: Record<string, string> = {
  first_name: "Maria",
  course: "Engleză B2",
  trial_date: "sâmbătă, 1 iunie, ora 10:00",
  center_name: "Vector Learn",
  full_name: "Maria Popescu",
  phone: "+40 771 234 567",
};

export function extractVariables(body: string): string[] {
  const matches = body.match(/\{\{(\w+)\}\}/g) ?? [];
  return [...new Set(matches.map((m) => m.slice(2, -2)))];
}

export function renderPreview(body: string, context: Record<string, string> = KNOWN_VARIABLES): string {
  return body.replace(/\{\{(\w+)\}\}/g, (_, key: string) => context[key] ?? `{{${key}}}`);
}

export function listTemplates(): Promise<{ items: MessageTemplate[] }> {
  return api<{ items: MessageTemplate[] }>("/api/templates");
}

export function getTemplate(id: string): Promise<MessageTemplate> {
  return api<MessageTemplate>(`/api/templates/${id}`);
}

export function createTemplate(input: {
  name: string;
  channel: TemplateChannel;
  subject?: string | null;
  body: string;
}): Promise<MessageTemplate> {
  return api<MessageTemplate>("/api/templates", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateTemplate(
  id: string,
  patch: Partial<Pick<MessageTemplate, "name" | "channel" | "subject" | "body">>
): Promise<MessageTemplate> {
  return api<MessageTemplate>(`/api/templates/${id}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export function deleteTemplate(id: string): Promise<{ deleted: boolean }> {
  return api<{ deleted: boolean }>(`/api/templates/${id}`, { method: "DELETE" });
}

export function previewTemplate(id: string): Promise<TemplatePreview> {
  return api<TemplatePreview>(`/api/templates/${id}/preview`, { method: "POST" });
}
