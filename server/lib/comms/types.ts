/**
 * COMMS-301 — contractul comun al canalelor (WhatsApp, Telegram, Viber, Gmail).
 *
 * Fiecare adaptor traduce între formatul furnizorului și evenimentele normalizate de aici.
 * Restul modulului (ingest, trimitere, inbox) nu știe nimic despre Meta, Telegram sau Google —
 * de-asta un canal nou înseamnă un fișier nou în `adapters/`, nu modificări prin tot codul.
 *
 * Documentația oficială pe care se bazează fiecare adaptor: docs/comms/<canal>.md.
 */
import type { CommChannelKind, CommMediaItem } from "../../db/schema/comms";

export type { CommChannelKind, CommMediaItem };

/** `fetch` injectabil — testele verifică exact cererea trimisă furnizorului, fără rețea. */
export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export type Credentials = Record<string, string>;
export type ChannelConfig = Record<string, unknown>;

export interface InboundMessageEvent {
  type: "message";
  /** Identificatorul omului pe canal (wa_id / BSUID, chat_id, id Viber, email). */
  externalUserId: string;
  displayName?: string | null;
  phone?: string | null;
  email?: string | null;
  username?: string | null;
  avatarUrl?: string | null;
  /** Id-ul mesajului la furnizor — cheia de idempotență. */
  externalId: string;
  /** Fir Gmail; gol pe mesagerii. */
  threadId?: string | null;
  subject?: string | null;
  kind: string;
  body?: string | null;
  media?: CommMediaItem[] | null;
  timestamp: Date;
  /** Payload-ul de deep link (`/start <x>` Telegram, `context` Viber) — leagă omul de un lead. */
  startPayload?: string | null;
  meta?: Record<string, unknown> | null;
}

export interface StatusEvent {
  type: "status";
  externalId: string;
  status: "sent" | "delivered" | "read" | "failed";
  errorCode?: string | null;
  errorMessage?: string | null;
  timestamp: Date;
}

export interface BlockedEvent {
  type: "blocked";
  externalUserId: string;
  blocked: boolean;
}

/** Omul a deschis conversația (Viber `conversation_started`/`subscribed`) fără să scrie încă ceva. */
export interface ContactEvent {
  type: "contact";
  externalUserId: string;
  displayName?: string | null;
  avatarUrl?: string | null;
  startPayload?: string | null;
}

/** Schimbare de configurație venită de la furnizor (ex. conexiune Telegram Business). */
export interface ConfigEvent {
  type: "config";
  patch: Record<string, unknown>;
}

export type NormalizedEvent = InboundMessageEvent | StatusEvent | BlockedEvent | ContactEvent | ConfigEvent;

export interface OutboundMessage {
  /** `externalUserId` al contactului. */
  to: string;
  text?: string | null;
  subject?: string | null;
  media?: { type: "image" | "document" | "video" | "audio"; url: string; name?: string | null } | null;
  template?: { name: string; language: string; params: string[] } | null;
  /** Mesajul la care se răspunde (citat), id la furnizor. */
  replyToExternalId?: string | null;
  threadId?: string | null;
  /** Meta ultimului mesaj primit în conversație (ex. business_connection_id, Message-ID Gmail). */
  lastInboundMeta?: Record<string, unknown> | null;
}

export interface SendResult {
  ok: boolean;
  externalId?: string | null;
  threadId?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  meta?: Record<string, unknown> | null;
}

export interface AdapterContext {
  creds: Credentials;
  config: ChannelConfig;
  fetch: FetchLike;
}

export interface ConnectInput extends AdapterContext {
  /** URL-ul public unde furnizorul trebuie să trimită webhook-urile acestui canal. */
  webhookUrl: string;
  webhookSecret: string;
  /**
   * Prima conectare a canalului. Doar atunci se aruncă update-urile vechi ținute de furnizor; la
   * „Testează" sau la rotirea tokenului ele sunt exact mesajele clienților care n-au ajuns încă.
   */
  firstConnect?: boolean;
}

export interface ConnectResult {
  externalId: string;
  /** Setări de păstrat (fără secrete): nume bot, număr afișat… */
  config: ChannelConfig;
  /** Instrucțiuni pentru om, când furnizorul nu permite înregistrarea automată a webhook-ului. */
  manualSteps?: string[];
}

export interface WebhookRequest {
  rawBody: string;
  headers: Record<string, string | undefined>;
}

export interface ChannelAdapter {
  kind: CommChannelKind;
  /**
   * Id-ul contului la furnizor, FĂRĂ efecte (getMe / get_account_info). Rulează înaintea lui
   * `connect`, ca un token deja folosit de alt workspace să fie refuzat ÎNAINTE să-i mutăm webhook-ul.
   */
  identify?(ctx: AdapterContext): Promise<string>;
  /** Validează credențialele la furnizor și, unde se poate, înregistrează webhook-ul. */
  connect(input: ConnectInput): Promise<ConnectResult>;
  /** Oprește livrarea webhook-urilor (best effort). */
  disconnect?(ctx: AdapterContext): Promise<void>;
  /** True doar dacă cererea poate fi dovedită ca venind de la furnizor. */
  verifyWebhook(req: WebhookRequest, ctx: AdapterContext & { webhookSecret: string }): boolean;
  /**
   * Transformă corpul brut în obiect. Implicit `JSON.parse`; Viber îl suprascrie fiindcă
   * `message_token` e un întreg pe 64 de biți pe care `JSON.parse` îl rotunjește.
   */
  decodeBody?(rawBody: string): unknown;
  parseWebhook(payload: unknown): NormalizedEvent[];
  send(ctx: AdapterContext, msg: OutboundMessage): Promise<SendResult>;
  /** Descarcă un fișier primit (serverul face proxy — tokenul nu ajunge niciodată în browser). */
  fetchMedia?(ctx: AdapterContext, providerFileId: string): Promise<{ body: ArrayBuffer; mime: string | null }>;
}

/** Eroare cu cod stabil, pe care ruta o transformă în răspuns HTTP și interfața în text. */
export class CommsError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly httpStatus: 400 | 401 | 403 | 404 | 409 | 422 | 502 | 503 = 400
  ) {
    super(message);
    this.name = "CommsError";
  }
}
