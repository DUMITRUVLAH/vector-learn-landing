/**
 * COMMS-301 — Gmail: OAuth, reîmprospătarea tokenului, sincronizarea și verificarea push-ului.
 *
 * Configurație (docs/comms/gmail.md):
 *   GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET   — clientul OAuth „Web application"
 *   GOOGLE_OAUTH_REDIRECT_URI (opțional)                  — implicit <APP_URL>/api/comms/gmail/oauth/callback
 *   GMAIL_PUBSUB_TOPIC (opțional)                         — projects/<id>/topics/<topic>; fără el: doar sincronizare periodică
 *   GMAIL_PUSH_AUDIENCE + GMAIL_PUSH_SA_EMAIL (opțional)  — verificarea OIDC a push-ului Pub/Sub
 *   GMAIL_PUSH_TOKEN (alternativ)                         — secret în query string, dacă nu se folosește OIDC
 */
import { createHmac, createPublicKey, createVerify, randomBytes, createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "../../db/client";
import { commChannels, type CommChannel } from "../../db/schema/comms";
import {
  GMAIL_API,
  GMAIL_SCOPES,
  GOOGLE_AUTH_URL,
  GOOGLE_TOKEN_URL,
  GOOGLE_USERINFO_URL,
  GOOGLE_REVOKE_URL,
  gmailMessageToEvent,
} from "./adapters/gmail";
import { decryptCredentials, encryptCredentials, providerFetch } from "./channelStore";
import { ingestEvents, type IngestResult } from "./ingest";
import { CommsError, type Credentials, type NormalizedEvent } from "./types";
import { arr, obj, readJson, safeEqual, str } from "./util";
import { commsHmacSecret } from "./secrets";

export function gmailConfigured(): boolean {
  return Boolean(process.env.GOOGLE_OAUTH_CLIENT_ID && process.env.GOOGLE_OAUTH_CLIENT_SECRET);
}

export function gmailRedirectUri(baseUrl: string): string {
  return process.env.GOOGLE_OAUTH_REDIRECT_URI ?? `${baseUrl}/api/comms/gmail/oauth/callback`;
}

// ─── state OAuth: semnat, legat de om, cu expirare ────────────────────────────

function stateKey(): string {
  const key = commsHmacSecret("comms-gmail-state");
  if (!key) throw new CommsError("encryption_key_missing", "Conectarea Gmail e oprită până se setează ENCRYPTION_KEY pe server.", 503);
  return key;
}

export interface OAuthState {
  tenantId: string;
  userId: string;
  name: string;
  /** PKCE verifier — trăiește doar în state-ul semnat, nu în bază. */
  verifier: string;
  exp: number;
}

export function signState(s: OAuthState): string {
  const body = Buffer.from(JSON.stringify(s)).toString("base64url");
  const sig = createHmac("sha256", stateKey()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifyState(raw: string | undefined | null): OAuthState | null {
  const [body, sig] = (raw ?? "").split(".");
  if (!body || !sig) return null;
  let key: string;
  try {
    key = stateKey();
  } catch {
    return null;
  }
  const expected = createHmac("sha256", key).update(body).digest("base64url");
  if (!safeEqual(sig, expected)) return null;
  try {
    const s = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as OAuthState;
    return s.exp > Date.now() ? s : null;
  } catch {
    return null;
  }
}

export function newPkce(): { verifier: string; challenge: string } {
  const verifier = randomBytes(48).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

export function buildAuthUrl(opts: { state: string; challenge: string; redirectUri: string; loginHint?: string | null }): string {
  const p = new URLSearchParams({
    client_id: process.env.GOOGLE_OAUTH_CLIENT_ID ?? "",
    redirect_uri: opts.redirectUri,
    response_type: "code",
    scope: GMAIL_SCOPES.join(" "),
    access_type: "offline",
    // `consent` forțează un refresh_token nou și la reconectare (altfel Google îl dă doar prima dată).
    prompt: "consent",
    include_granted_scopes: "true",
    state: opts.state,
    code_challenge: opts.challenge,
    code_challenge_method: "S256",
  });
  if (opts.loginHint) p.set("login_hint", opts.loginHint);
  return `${GOOGLE_AUTH_URL}?${p.toString()}`;
}

export async function exchangeCode(code: string, verifier: string, redirectUri: string) {
  const res = await providerFetch()(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_OAUTH_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET ?? "",
      code,
      code_verifier: verifier,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
    }).toString(),
  });
  const data = await readJson(res);
  if (!res.ok) throw new CommsError("oauth_failed", `Google a refuzat autorizarea: ${str(data.error_description) ?? str(data.error) ?? res.status}.`, 502);
  const granted = (str(data.scope) ?? "").split(/\s+/);
  // Google permite omului să debifeze scope-uri (granular consent) — fără ele canalul n-ar funcționa.
  const missing = GMAIL_SCOPES.filter((s) => s.startsWith("https://") && !granted.includes(s));
  if (missing.length) {
    throw new CommsError("scopes_missing", "Nu ai bifat toate permisiunile Gmail (citire + trimitere). Reconectează și bifează-le.", 422);
  }
  const accessToken = str(data.access_token) ?? "";
  const refreshToken = str(data.refresh_token);
  if (!refreshToken) throw new CommsError("oauth_failed", "Google nu a dat refresh token. Revocă accesul aplicației în contul Google și reîncearcă.", 502);

  const ui = await readJson(await providerFetch()(GOOGLE_USERINFO_URL, { headers: { Authorization: `Bearer ${accessToken}` } }));
  const email = str(ui.email)?.toLowerCase();
  if (!email) throw new CommsError("oauth_failed", "Nu am putut citi adresa contului Google.", 502);
  return {
    email,
    sub: str(ui.sub),
    name: str(ui.name),
    creds: {
      refreshToken,
      accessToken,
      accessTokenExpiresAt: String(Date.now() + (Number(data.expires_in) || 3600) * 1000),
    } as Credentials,
  };
}

/** Credențiale cu access token valid (reîmprospătat și salvat dacă expiră în < 2 minute). */
export async function freshGmailCreds(channel: CommChannel): Promise<Credentials> {
  const creds = decryptCredentials(channel);
  if (creds.accessToken && Number(creds.accessTokenExpiresAt) > Date.now() + 120_000) return creds;
  if (!creds.refreshToken) throw new CommsError("reauth_required", "Cutia Gmail trebuie reconectată.", 409);
  const res = await providerFetch()(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_OAUTH_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET ?? "",
      grant_type: "refresh_token",
      refresh_token: creds.refreshToken,
    }).toString(),
  });
  const data = await readJson(res);
  if (!res.ok) {
    // invalid_grant = acces revocat, parolă schimbată, 6 luni de inactivitate sau aplicația în
    // „Testing" (tokenuri de 7 zile). Omul trebuie să reconecteze — o spunem pe canal, nu în log.
    await db
      .update(commChannels)
      .set({ status: "error", lastError: "Accesul la Gmail a expirat sau a fost revocat — reconectează cutia.", updatedAt: new Date() })
      .where(eq(commChannels.id, channel.id));
    throw new CommsError("reauth_required", "Accesul la Gmail a expirat — reconectează cutia.", 409);
  }
  const next: Credentials = {
    ...creds,
    accessToken: str(data.access_token) ?? "",
    accessTokenExpiresAt: String(Date.now() + (Number(data.expires_in) || 3600) * 1000),
  };
  await db.update(commChannels).set({ credentialsEnc: encryptCredentials(next), updatedAt: new Date() }).where(eq(commChannels.id, channel.id));
  return next;
}

export async function revokeGmail(channel: CommChannel): Promise<void> {
  const creds = decryptCredentials(channel);
  const token = creds.refreshToken || creds.accessToken;
  if (!token) return;
  try {
    await providerFetch()(GOOGLE_REVOKE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token }).toString(),
    });
  } catch {
    // revocarea e best effort; rândul se șterge oricum
  }
}

// ─── watch (push Pub/Sub) ─────────────────────────────────────────────────────

/** Pornește/reînnoiește `users.watch`. Expiră după 7 zile — cronul îl reînnoiește zilnic. */
export async function ensureGmailWatch(channel: CommChannel, force = false): Promise<boolean> {
  const topic = process.env.GMAIL_PUBSUB_TOPIC;
  if (!topic) return false;
  const cfg = (channel.config ?? {}) as Record<string, unknown>;
  const exp = Number(cfg.watchExpiration ?? 0);
  if (!force && exp > Date.now() + 2 * 86_400_000) return true;
  const creds = await freshGmailCreds(channel);
  const res = await providerFetch()(`${GMAIL_API}/watch`, {
    method: "POST",
    headers: { Authorization: `Bearer ${creds.accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ topicName: topic, labelIds: ["INBOX"], labelFilterBehavior: "INCLUDE" }),
  });
  const data = await readJson(res);
  if (!res.ok) {
    await db
      .update(commChannels)
      .set({ lastError: `users.watch: ${str(obj(data.error).message) ?? res.status}`.slice(0, 1000) })
      .where(eq(commChannels.id, channel.id));
    return false;
  }
  const patch: Record<string, unknown> = { watchExpiration: Number(data.expiration) || null };
  if (!cfg.historyId && str(data.historyId)) patch.historyId = str(data.historyId);
  await db
    .update(commChannels)
    .set({ config: { ...cfg, ...patch }, updatedAt: new Date() })
    .where(eq(commChannels.id, channel.id));
  return true;
}

// ─── sincronizare ─────────────────────────────────────────────────────────────

async function gmailGet(accessToken: string, path: string) {
  const res = await providerFetch()(`${GMAIL_API}${path}`, { headers: { Authorization: `Bearer ${accessToken}` } });
  return { res, data: await readJson(res) };
}

/**
 * Aduce mesajele noi din INBOX de la ultimul `historyId` salvat și le trece prin ingest.
 *
 * Prima rulare (fără historyId) NU importă toată cutia: ia doar ultimele `initialLimit` mesaje
 * din INBOX din ultimele 3 zile — un inbox cu 40.000 de emailuri ar crea mii de leaduri false.
 * Dacă historyId e prea vechi (404), facem același „full sync" restrâns.
 */
export async function syncGmailChannel(channelId: string, initialLimit = 20): Promise<IngestResult & { inactive?: boolean }> {
  const [channel] = await db.select().from(commChannels).where(eq(commChannels.id, channelId));
  if (!channel || channel.kind !== "gmail" || channel.status === "disabled") {
    return { messages: 0, duplicates: 0, statuses: 0, leadsCreated: 0, skipped: 0, inactive: true };
  }
  const creds = await freshGmailCreds(channel);
  const cfg = (channel.config ?? {}) as Record<string, unknown>;
  const own = str(cfg.email) ?? "";
  let historyId = str(cfg.historyId);
  const ids = new Set<string>();
  let newHistoryId: string | null = null;

  if (historyId) {
    let pageToken: string | null = null;
    let expired = false;
    for (let page = 0; page < 10; page++) {
      const q = new URLSearchParams({ startHistoryId: historyId, historyTypes: "messageAdded", labelId: "INBOX", maxResults: "500" });
      if (pageToken) q.set("pageToken", pageToken);
      const { res, data } = await gmailGet(creds.accessToken, `/history?${q.toString()}`);
      if (res.status === 404) {
        expired = true;
        break;
      }
      if (!res.ok) throw new CommsError("provider_error", `Gmail history.list: ${str(obj(data.error).message) ?? res.status}`, 502);
      for (const h of arr(data.history)) {
        for (const added of arr(obj(h).messagesAdded)) {
          const id = str(obj(obj(added).message).id);
          if (id) ids.add(id);
        }
      }
      newHistoryId = str(data.historyId) ?? newHistoryId;
      pageToken = str(data.nextPageToken);
      if (!pageToken) break;
    }
    if (expired) historyId = null;
  }

  if (!historyId) {
    const q = new URLSearchParams({ labelIds: "INBOX", maxResults: String(initialLimit), q: "newer_than:3d" });
    const { res, data } = await gmailGet(creds.accessToken, `/messages?${q.toString()}`);
    if (!res.ok) throw new CommsError("provider_error", `Gmail messages.list: ${str(obj(data.error).message) ?? res.status}`, 502);
    for (const m of arr(data.messages)) {
      const id = str(obj(m).id);
      if (id) ids.add(id);
    }
    const profile = await gmailGet(creds.accessToken, "/profile");
    newHistoryId = str(profile.data.historyId);
  }

  const events: NormalizedEvent[] = [];
  for (const id of ids) {
    const { res, data } = await gmailGet(creds.accessToken, `/messages/${encodeURIComponent(id)}?format=full`);
    if (!res.ok) continue; // mesaj șters între timp
    const ev = gmailMessageToEvent(data, own);
    if (ev) events.push(ev);
  }
  // Cele mai vechi întâi, ca previzualizarea conversației să rămână pe ultimul mesaj.
  events.sort((a, b) => (a.type === "message" && b.type === "message" ? a.timestamp.getTime() - b.timestamp.getTime() : 0));
  const result = await ingestEvents(channel, events);

  if (newHistoryId) {
    const [fresh] = await db.select().from(commChannels).where(eq(commChannels.id, channel.id));
    await db
      .update(commChannels)
      .set({
        config: { ...((fresh?.config ?? cfg) as Record<string, unknown>), historyId: newHistoryId, lastSyncAt: new Date().toISOString() },
        status: channel.status === "error" ? "active" : channel.status,
        lastError: channel.status === "error" ? null : channel.lastError,
        updatedAt: new Date(),
      })
      .where(eq(commChannels.id, channel.id));
  }
  return result;
}

/** Canalele Gmail active pentru o adresă — push-ul Pub/Sub ne dă doar adresa. */
export async function gmailChannelsForEmail(email: string): Promise<CommChannel[]> {
  return db
    .select()
    .from(commChannels)
    .where(and(eq(commChannels.kind, "gmail"), eq(commChannels.externalId, email.toLowerCase())));
}

// ─── verificarea push-ului Pub/Sub (OIDC) ─────────────────────────────────────

let jwksCache: { at: number; keys: Record<string, unknown>[] } | null = null;

async function googleJwks(): Promise<Record<string, unknown>[]> {
  if (jwksCache && Date.now() - jwksCache.at < 3_600_000) return jwksCache.keys;
  const data = await readJson(await providerFetch()("https://www.googleapis.com/oauth2/v3/certs"));
  jwksCache = { at: Date.now(), keys: arr(data.keys).map(obj) };
  return jwksCache.keys;
}

/**
 * Verifică JWT-ul OIDC trimis de Pub/Sub: semnătura RS256 cu cheile Google, emitentul,
 * audiența, contul de serviciu și expirarea. Fără configurare → refuz (nu „sărim verificarea").
 */
export async function verifyPubsubRequest(authHeader: string | undefined, queryToken: string | undefined): Promise<boolean> {
  const audience = process.env.GMAIL_PUSH_AUDIENCE;
  if (audience) {
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token) return false;
    const [h, p, s] = token.split(".");
    if (!h || !p || !s) return false;
    try {
      const header = JSON.parse(Buffer.from(h, "base64url").toString("utf8")) as { kid?: string; alg?: string };
      if (header.alg !== "RS256") return false;
      const jwk = (await googleJwks()).find((k) => k.kid === header.kid);
      if (!jwk) return false;
      const key = createPublicKey({ key: jwk as never, format: "jwk" });
      const ok = createVerify("RSA-SHA256").update(`${h}.${p}`).verify(key, Buffer.from(s, "base64url"));
      if (!ok) return false;
      const claims = JSON.parse(Buffer.from(p, "base64url").toString("utf8")) as Record<string, unknown>;
      const iss = str(claims.iss);
      if (iss !== "https://accounts.google.com" && iss !== "accounts.google.com") return false;
      if (claims.aud !== audience) return false;
      if (Number(claims.exp) * 1000 < Date.now()) return false;
      // Contul de serviciu e OBLIGATORIU: orice utilizator Google Cloud poate obține un token semnat
      // de Google pentru audiența noastră; doar `email` spune că vine din abonamentul NOSTRU.
      const sa = process.env.GMAIL_PUSH_SA_EMAIL;
      if (!sa || claims.email !== sa || claims.email_verified !== true) return false;
      return true;
    } catch {
      return false;
    }
  }
  const shared = process.env.GMAIL_PUSH_TOKEN;
  if (shared) return safeEqual(queryToken, shared);
  return false;
}

