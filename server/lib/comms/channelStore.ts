/**
 * COMMS-301 — citirea/scrierea canalelor cu secretele criptate.
 *
 * Secretele (tokenuri, App Secret, refresh token Gmail) stau DOAR criptate AES-256-GCM
 * (server/lib/crypto.ts) și nu ies niciodată din server: `publicChannel` e singura formă pe care
 * o primesc rutele pentru răspuns.
 */
import { eq } from "drizzle-orm";
import { db } from "../../db/client";
import { commChannels, type CommChannel } from "../../db/schema/comms";
import { encrypt, decrypt } from "../crypto";
import type { AdapterContext, Credentials, FetchLike } from "./types";
import { defaultFetch, str } from "./util";

export function encryptCredentials(creds: Credentials): string {
  return encrypt(JSON.stringify(creds));
}

export function decryptCredentials(channel: Pick<CommChannel, "credentialsEnc">): Credentials {
  if (!channel.credentialsEnc) return {};
  try {
    const parsed = JSON.parse(decrypt(channel.credentialsEnc)) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    const out: Credentials = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      const s = str(v);
      if (s !== null) out[k] = s;
    }
    return out;
  } catch {
    // Cheie de criptare schimbată fără re-criptare: canalul trebuie reconectat, nu trebuie să pice ruta.
    return {};
  }
}

/** Canal simulat (fără furnizor real) — pentru demo și e2e până vin cheile reale. */
export function isMockChannel(channel: Pick<CommChannel, "config">): boolean {
  return (channel.config as Record<string, unknown>)?.mock === true;
}

export function mockAllowed(): boolean {
  if (process.env.COMMS_ALLOW_MOCK === "1") return true;
  const prod = process.env.NODE_ENV === "production" && (process.env.VERCEL_ENV ?? "production") === "production";
  return !prod;
}

let fetchOverride: FetchLike | null = null;
/** Doar pentru teste: înlocuiește fetch-ul spre furnizori. */
export function __setProviderFetch(f: FetchLike | null): void {
  fetchOverride = f;
}
export function providerFetch(): FetchLike {
  return fetchOverride ?? defaultFetch;
}

export function adapterContext(channel: CommChannel, credsOverride?: Credentials): AdapterContext {
  return {
    creds: credsOverride ?? decryptCredentials(channel),
    config: (channel.config ?? {}) as Record<string, unknown>,
    fetch: providerFetch(),
  };
}

export async function saveChannelCredentials(channelId: string, creds: Credentials): Promise<void> {
  await db
    .update(commChannels)
    .set({ credentialsEnc: encryptCredentials(creds), updatedAt: new Date() })
    .where(eq(commChannels.id, channelId));
}

export async function patchChannelConfig(channel: CommChannel, patch: Record<string, unknown>): Promise<void> {
  await db
    .update(commChannels)
    .set({ config: { ...(channel.config ?? {}), ...patch }, updatedAt: new Date() })
    .where(eq(commChannels.id, channel.id));
}

export interface PublicChannel {
  id: string;
  kind: string;
  name: string;
  status: string;
  externalId: string | null;
  config: Record<string, unknown>;
  lastError: string | null;
  lastEventAt: Date | null;
  createdAt: Date;
  mock: boolean;
  webhookUrl: string | null;
  /** Pentru WhatsApp: tokenul de verificare de lipit în Meta. Nu e un secret de trimitere. */
  verifyToken: string | null;
  connectedBy: string | null;
}

/** Forma sigură pentru interfață — fără `credentialsEnc`. */
export function publicChannel(channel: CommChannel, baseUrl: string): PublicChannel {
  const cfg = { ...(channel.config ?? {}) } as Record<string, unknown>;
  delete cfg.historyId;
  const hasWebhook = channel.kind !== "gmail";
  return {
    id: channel.id,
    kind: channel.kind,
    name: channel.name,
    status: channel.status,
    externalId: channel.externalId,
    config: cfg,
    lastError: channel.lastError,
    lastEventAt: channel.lastEventAt,
    createdAt: channel.createdAt,
    mock: isMockChannel(channel),
    webhookUrl: hasWebhook ? webhookUrlFor(baseUrl, channel.kind, channel.webhookSecret) : null,
    verifyToken: channel.kind === "whatsapp" ? channel.webhookSecret : null,
    connectedBy: channel.connectedBy,
  };
}

export function webhookUrlFor(baseUrl: string, kind: string, secret: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/api/comms/webhooks/${kind}/${secret}`;
}

/**
 * Originea publică la care furnizorii pot ajunge. `APP_URL` are prioritate (un preview Vercel
 * are URL-uri care se schimbă la fiecare deploy — un webhook legat de el moare la următorul).
 */
/**
 * Originea la care FURNIZORII trimit webhook-urile. Diferă de `publicBaseUrl` într-un punct care
 * contează: furnizorii NU urmează redirecționări (Telegram o spune explicit, Meta la fel), iar
 * `finflow.best` răspunde 308 → `www.finflow.best`. Un webhook înregistrat pe domeniul fără www
 * n-ar primi niciodată nimic. Deci: `COMMS_WEBHOOK_BASE_URL` dacă e setată, altfel domeniul public
 * urmat până la capătul redirecționărilor (rezultatul se ține 10 minute).
 */
const resolvedBases = new Map<string, { origin: string; at: number }>();
export async function webhookBaseUrl(requestUrl: string): Promise<string> {
  const explicit = process.env.COMMS_WEBHOOK_BASE_URL?.replace(/\/+$/, "");
  if (explicit) return explicit;
  const base = publicBaseUrl(requestUrl);
  if (!base.startsWith("https://")) return base; // local: nimic de urmat
  const hit = resolvedBases.get(base);
  if (hit && Date.now() - hit.at < 600_000) return hit.origin;
  let origin = base;
  try {
    let current = base;
    for (let hop = 0; hop < 3; hop++) {
      const res = await fetch(`${current}/api/health`, { redirect: "manual", signal: AbortSignal.timeout(5000) });
      const loc = res.headers.get("location");
      if (![301, 302, 307, 308].includes(res.status) || !loc) break;
      const next = new URL(loc, current).origin;
      if (!next.startsWith("https://") || next === current) break;
      current = next;
    }
    origin = current;
  } catch {
    // rețeaua indisponibilă: rămânem pe domeniul configurat
  }
  resolvedBases.set(base, { origin, at: Date.now() });
  return origin;
}

export function publicBaseUrl(requestUrl: string): string {
  const app = process.env.APP_URL ?? process.env.PUBLIC_APP_URL;
  if (app?.startsWith("https://")) return app.replace(/\/+$/, "");
  return new URL(requestUrl).origin;
}
