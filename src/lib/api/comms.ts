/**
 * COMMS-301 — clientul tipat al modulului de comunicare omnicanal (WhatsApp, Telegram, Viber, Gmail).
 * Contractul rutelor: server/routes/comms*.ts. Documentația canalelor: docs/comms/.
 */
import { api, ApiError } from "@/lib/api";

export type ChannelKind = "whatsapp" | "telegram" | "viber" | "gmail";

export const CHANNEL_KIND_LABELS: Record<ChannelKind, string> = {
  whatsapp: "WhatsApp",
  telegram: "Telegram",
  viber: "Viber",
  gmail: "Gmail",
};

export interface CommChannel {
  id: string;
  kind: ChannelKind;
  name: string;
  status: "active" | "disabled" | "error" | "pending";
  externalId: string | null;
  config: Record<string, unknown>;
  lastError: string | null;
  lastEventAt: string | null;
  createdAt: string;
  mock: boolean;
  webhookUrl: string | null;
  verifyToken: string | null;
  connectedBy: string | null;
}

export interface PlatformInfo {
  gmailConfigured: boolean;
  gmailPush: boolean;
  whatsappPlatformApp: boolean;
  mockAllowed: boolean;
  encryptionKeySet: boolean;
  publicBaseUrl: string;
}

export interface ConversationListItem {
  id: string;
  status: "open" | "closed";
  subject: string | null;
  unreadCount: number;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
  lastMessageDirection: "inbound" | "outbound" | null;
  lastInboundAt: string | null;
  assignedTo: string | null;
  assignedName: string | null;
  channelId: string;
  channelKind: ChannelKind;
  channelName: string;
  contactId: string;
  contactName: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  contactUsername: string | null;
  contactAvatar: string | null;
  contactBlocked: string | null;
  leadId: string | null;
  leadName: string | null;
}

export interface CommMediaItem {
  type: string;
  url?: string | null;
  name?: string | null;
  mime?: string | null;
  size?: number | null;
}

export interface CommMessage {
  id: string;
  direction: "inbound" | "outbound";
  kind: string;
  body: string | null;
  subject: string | null;
  media: CommMediaItem[] | null;
  status: "queued" | "sent" | "delivered" | "read" | "failed" | "received";
  errorCode: string | null;
  errorMessage: string | null;
  templateName: string | null;
  senderUserId: string | null;
  senderName: string | null;
  sentAt: string | null;
  deliveredAt: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface ConversationDetail {
  conversation: {
    id: string;
    status: "open" | "closed";
    subject: string | null;
    assignedTo: string | null;
    unreadCount: number;
    lastInboundAt: string | null;
    leadId: string | null;
  };
  channel: { id: string; kind: ChannelKind; name: string; status: string; mock: boolean };
  contact: {
    id: string;
    externalUserId: string;
    displayName: string | null;
    phone: string | null;
    email: string | null;
    username: string | null;
    avatarUrl: string | null;
    blockedAt: string | null;
  };
  lead: { id: string; fullName: string; phone: string | null; email: string | null; stage: string } | null;
  messages: CommMessage[];
  compose: {
    canSendFreeform: boolean;
    needsTemplate: boolean;
    blocked: boolean;
    reason: string | null;
    consentRevoked: boolean;
    windowExpiresAt: string | null;
  };
}

export interface WhatsappTemplate {
  name: string;
  language: string;
  category: string | null;
  status: string | null;
  body: string | null;
  paramCount: number;
}

export interface ComposePayload {
  text?: string | null;
  subject?: string | null;
  media?: { type: "image" | "document" | "video" | "audio"; url: string; name?: string | null } | null;
  template?: { name: string; language: string; params: string[] } | null;
  replyToMessageId?: string | null;
}

export interface LeadChannelOption {
  id: string;
  kind: ChannelKind;
  name: string;
  canStart: boolean;
  optInLink: string | null;
  needsTemplate: boolean;
}

export interface LeadConversation {
  id: string;
  channelId: string;
  channelKind: ChannelKind;
  channelName: string;
  subject: string | null;
  unreadCount: number;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
  status: string;
}

/** Mesajul în română pe care îl trimite serverul (`message`), altfel codul. */
export function commsErrorText(err: unknown, fallback = "A apărut o eroare."): string {
  if (err instanceof ApiError) {
    const m = err.body?.message;
    if (typeof m === "string" && m) return m;
    return err.code || fallback;
  }
  return err instanceof Error && err.message ? err.message : fallback;
}

const J = (body: unknown): RequestInit => ({ method: "POST", body: JSON.stringify(body) });

// ─── canale ──────────────────────────────────────────────────────────────────

export function listChannels(): Promise<{ channels: CommChannel[]; platform: PlatformInfo }> {
  return api("/api/comms/channels", { cache: "reload" });
}

export function connectChannel(body: {
  kind: Exclude<ChannelKind, "gmail">;
  name: string;
  credentials: Record<string, string>;
  config?: { senderName?: string; autoCreateLead?: boolean };
  mock?: boolean;
}): Promise<{ channel: CommChannel; manualSteps: string[] }> {
  return api("/api/comms/channels", J(body));
}

export function updateChannel(
  id: string,
  body: { name?: string; status?: "active" | "disabled"; config?: { senderName?: string; autoCreateLead?: boolean } }
): Promise<{ channel: CommChannel }> {
  return api(`/api/comms/channels/${id}`, { method: "PATCH", body: JSON.stringify(body) });
}

export function rotateChannelCredentials(id: string, credentials: Record<string, string>): Promise<{ channel: CommChannel; manualSteps: string[] }> {
  return api(`/api/comms/channels/${id}/credentials`, J({ credentials }));
}

export function testChannel(id: string): Promise<{ ok: boolean; detail: string }> {
  return api(`/api/comms/channels/${id}/test`, { method: "POST" });
}

export function disconnectChannel(id: string): Promise<{ ok: boolean }> {
  return api(`/api/comms/channels/${id}`, { method: "DELETE" });
}

export interface WebhookEvent {
  id: string;
  kind: string;
  signatureOk: boolean;
  error: string | null;
  processedAt: string | null;
  receivedAt: string;
}

export function listChannelEvents(id: string): Promise<{ events: WebhookEvent[] }> {
  return api(`/api/comms/channels/${id}/events`, { cache: "reload" });
}

export function simulateInbound(
  id: string,
  body: { from: string; name?: string; text: string; phone?: string; email?: string; subject?: string }
): Promise<{ ok: boolean; result: { messages: number; skipped: number; leadsCreated: number } }> {
  return api(`/api/comms/channels/${id}/simulate`, J(body));
}

export function startGmailOAuth(name?: string): Promise<{ url: string }> {
  return api("/api/comms/gmail/oauth/start", J({ name }));
}

export function syncGmail(): Promise<{ ok: boolean; messages: number; errors: string[] }> {
  return api("/api/comms/gmail/sync", { method: "POST" });
}

// ─── inbox ───────────────────────────────────────────────────────────────────

export function getInboxSummary(): Promise<{ unread: number; byKind: Record<string, { unread: number; conversations: number }> }> {
  return api("/api/comms/inbox/summary", { cache: "reload" });
}

export function listConversations(filters: {
  kind?: string | null;
  status?: "open" | "closed" | "all";
  mine?: boolean;
  unread?: boolean;
  q?: string;
  leadId?: string;
}): Promise<{ items: ConversationListItem[] }> {
  const p = new URLSearchParams();
  if (filters.kind) p.set("kind", filters.kind);
  if (filters.status && filters.status !== "all") p.set("status", filters.status);
  if (filters.mine) p.set("mine", "1");
  if (filters.unread) p.set("unread", "1");
  if (filters.q?.trim()) p.set("q", filters.q.trim());
  if (filters.leadId) p.set("leadId", filters.leadId);
  const qs = p.toString();
  return api(`/api/comms/inbox/conversations${qs ? `?${qs}` : ""}`, { cache: "reload" });
}

export function getConversation(id: string): Promise<ConversationDetail> {
  return api(`/api/comms/inbox/conversations/${id}`, { cache: "reload" });
}

export function sendMessage(conversationId: string, body: ComposePayload): Promise<{ message: CommMessage }> {
  return api(`/api/comms/inbox/conversations/${conversationId}/messages`, J(body));
}

export function markConversationRead(id: string): Promise<{ ok: boolean }> {
  return api(`/api/comms/inbox/conversations/${id}/read`, { method: "POST" });
}

export function updateConversation(
  id: string,
  body: { status?: "open" | "closed"; assignedTo?: string | null; leadId?: string | null }
): Promise<unknown> {
  return api(`/api/comms/inbox/conversations/${id}`, { method: "PATCH", body: JSON.stringify(body) });
}

export function getLeadComms(leadId: string): Promise<{ conversations: LeadConversation[]; channels: LeadChannelOption[] }> {
  return api(`/api/comms/inbox/leads/${leadId}`, { cache: "reload" });
}

export function startLeadConversation(
  body: ComposePayload & { leadId: string; channelId: string; to?: string | null }
): Promise<{ message: CommMessage; conversationId: string }> {
  return api("/api/comms/inbox/start", J(body));
}

export function listTemplates(channelId: string): Promise<{ templates: WhatsappTemplate[] }> {
  return api(`/api/comms/inbox/channels/${channelId}/templates`);
}

export function mediaUrl(messageId: string, index: number): string {
  return `/api/comms/inbox/media/${messageId}/${index}`;
}
