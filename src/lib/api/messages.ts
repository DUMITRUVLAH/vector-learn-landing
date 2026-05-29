/**
 * COMM-201 — Client-side API helpers for the messages module.
 */
import { api } from "../api";

export type MessageChannel = "email" | "sms" | "whatsapp";
export type MessageDirection = "outbound" | "inbound";
export type MessageStatus = "queued" | "sent" | "delivered" | "failed";

export interface Message {
  id: string;
  tenantId: string;
  leadId: string | null;
  studentId: string | null;
  direction: MessageDirection;
  channel: MessageChannel;
  toAddress: string;
  body: string;
  subject: string | null;
  templateId: string | null;
  status: MessageStatus;
  providerMessageId: string | null;
  errorMessage: string | null;
  sentAt: string | null;
  deliveredAt: string | null;
  failedAt: string | null;
  createdAt: string;
}

export interface SendMessagePayload {
  channel: MessageChannel;
  to_address: string;
  body: string;
  subject?: string | null;
  template_id?: string | null;
  lead_id?: string | null;
  student_id?: string | null;
}

export interface SendMessageResponse {
  message: Message;
}

export interface ListMessagesResponse {
  items: Message[];
}

// ─── API calls ────────────────────────────────────────────────────────────────

export async function sendMessage(
  payload: SendMessagePayload
): Promise<SendMessageResponse> {
  return api<SendMessageResponse>("/messages/send", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function listMessages(params: {
  lead_id?: string;
  student_id?: string;
  channel?: MessageChannel;
  limit?: number;
}): Promise<ListMessagesResponse> {
  const qs = new URLSearchParams();
  if (params.lead_id) qs.set("lead_id", params.lead_id);
  if (params.student_id) qs.set("student_id", params.student_id);
  if (params.channel) qs.set("channel", params.channel);
  if (params.limit) qs.set("limit", String(params.limit));
  return api<ListMessagesResponse>(`/messages?${qs.toString()}`);
}
