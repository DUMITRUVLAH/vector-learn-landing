/**
 * COMM-204 — Client-side API helpers for broadcasts.
 */
import { api } from "../api";
import type { MessageChannel } from "./messages";

export type BroadcastStatus = "draft" | "sending" | "done" | "failed";

export interface SegmentFilter {
  type: "leads" | "students";
  status_filter?: string | null;
  course_filter?: string | null;
  tag_filter?: string | null;
}

export interface Broadcast {
  id: string;
  tenantId: string;
  name: string;
  channel: MessageChannel;
  segmentFilter: SegmentFilter;
  templateId: string | null;
  body: string;
  subject: string | null;
  status: BroadcastStatus;
  totalRecipients: number;
  consentSkipped: number;
  queued: number;
  sentAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateBroadcastPayload {
  name: string;
  channel: MessageChannel;
  segment: SegmentFilter;
  template_id?: string | null;
  body: string;
  subject?: string | null;
}

export interface CreateBroadcastResponse {
  broadcastId: string;
  totalRecipients: number;
  consentSkipped: number;
  queued: number;
}

export interface PreviewCountResponse {
  count: number;
  sample: string[];
}

export async function createBroadcast(
  payload: CreateBroadcastPayload
): Promise<CreateBroadcastResponse> {
  return api<CreateBroadcastResponse>("/broadcasts", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function listBroadcasts(): Promise<{ items: Broadcast[] }> {
  return api<{ items: Broadcast[] }>("/broadcasts");
}

export async function previewCount(params: {
  type: "leads" | "students";
  status_filter?: string;
  course_filter?: string;
  tag_filter?: string;
  channel?: MessageChannel;
}): Promise<PreviewCountResponse> {
  const qs = new URLSearchParams();
  qs.set("type", params.type);
  if (params.status_filter) qs.set("status_filter", params.status_filter);
  if (params.course_filter) qs.set("course_filter", params.course_filter);
  if (params.tag_filter) qs.set("tag_filter", params.tag_filter);
  if (params.channel) qs.set("channel", params.channel);
  return api<PreviewCountResponse>(`/broadcasts/preview-count?${qs.toString()}`);
}
