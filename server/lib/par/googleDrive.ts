/**
 * Clientul Google Drive — OAuth „offline" + cele patru apeluri REST de care avem nevoie.
 *
 * De ce scris cu `fetch` și nu cu `googleapis`: pachetul oficial aduce ~15 MB și un client
 * generat pentru toate API-urile Google, într-o funcție serverless care are de urcat niște
 * PDF-uri. Aici sunt patru apeluri (refresh token, caută folder, creează folder, urcă fișier),
 * toate documentate stabil de ani de zile.
 *
 * Scope: `drive.file` — aplicația vede și scrie DOAR fișierele create de ea. Un token scurs nu
 * deschide restul Drive-ului utilizatorului, iar noi n-avem cum să citim din greșeală documente
 * personale. Consecința de design: nu putem „alege" un folder existent al utilizatorului (nu-l
 * vedem), deci rădăcina o CREĂM noi, cu numele ales în setări.
 */
const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const USERINFO_ENDPOINT = "https://openidconnect.googleapis.com/v1/userinfo";
const DRIVE_FILES = "https://www.googleapis.com/drive/v3/files";
const DRIVE_UPLOAD = "https://www.googleapis.com/upload/drive/v3/files";

export const DRIVE_SCOPES = "https://www.googleapis.com/auth/drive.file openid email";
export const FOLDER_MIME = "application/vnd.google-apps.folder";

export interface DriveOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

/**
 * Config-ul din mediu. Refolosim CLIENT_ID/SECRET de la Sign-in (același proiect Google Cloud),
 * dar cu redirect-ul nostru — altfel callback-ul ar cădea peste fluxul de autentificare.
 */
export function getDriveConfig(): DriveOAuthConfig | null {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  const appUrl = process.env.APP_URL ?? "http://localhost:5173";
  const redirectUri = process.env.GOOGLE_DRIVE_REDIRECT_URI ?? `${appUrl}/api/par/drive/callback`;
  return { clientId, clientSecret, redirectUri };
}

/**
 * URL-ul de consimțământ. `access_type=offline` + `prompt=consent` sunt obligatorii ÎMPREUNĂ:
 * fără ele Google întoarce doar un access token de o oră și sync-ul de săptămâna viitoare moare
 * fără ca nimeni să observe. `prompt=consent` forțează un refresh token NOU chiar dacă omul a mai
 * autorizat aplicația cândva (Google îl trimite o singură dată, la prima autorizare).
 */
export function buildDriveAuthUrl(
  config: DriveOAuthConfig,
  state: string,
  codeChallenge: string
): string {
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    scope: DRIVE_SCOPES,
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
  });
  return `${AUTH_ENDPOINT}?${params.toString()}`;
}

export interface DriveTokens {
  accessToken: string;
  /** Prezent DOAR la prima autorizare cu access_type=offline. Fără el nu putem sincroniza. */
  refreshToken: string | null;
  expiresIn: number;
}

export async function exchangeDriveCode(
  config: DriveOAuthConfig,
  code: string,
  codeVerifier: string
): Promise<DriveTokens> {
  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: config.redirectUri,
      code_verifier: codeVerifier,
    }).toString(),
  });
  if (!res.ok) {
    throw new Error(`drive_token_exchange_failed: ${res.status} ${await res.text().catch(() => "")}`);
  }
  const data = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
  };
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? null,
    expiresIn: data.expires_in ?? 3600,
  };
}

/** Schimbă refresh token-ul pe un access token. Aruncă `drive_reauth_required` dacă a fost revocat. */
export async function refreshDriveAccessToken(
  config: DriveOAuthConfig,
  refreshToken: string
): Promise<string> {
  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }).toString(),
  });
  if (res.status === 400 || res.status === 401) {
    // `invalid_grant` = omul a revocat accesul sau a schimbat parola. Nu e o eroare tranzitorie:
    // nicio reîncercare n-o repară, trebuie reconectat contul din setări.
    throw new Error("drive_reauth_required");
  }
  if (!res.ok) {
    throw new Error(`drive_refresh_failed: ${res.status} ${await res.text().catch(() => "")}`);
  }
  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}

/** Adresa de e-mail a contului conectat — o arătăm în setări, ca omul să știe în al cui Drive scrie. */
export async function fetchDriveAccountEmail(accessToken: string): Promise<string | null> {
  const res = await fetch(USERINFO_ENDPOINT, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) return null;
  const data = (await res.json()) as { email?: string };
  return data.email?.toLowerCase() ?? null;
}

/**
 * Escapează un nume pentru clauza `q` din Drive API: acolo șirurile sunt între apostrofi, deci
 * un proiect numit „Anul 2026 'pilot'" ar rupe interogarea (sau, mai rău, ar schimba filtrul).
 */
export function escapeDriveQueryValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

async function driveJson<T>(url: string, accessToken: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${accessToken}`, ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    throw new Error(`drive_api_${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

/** Caută un (sub)folder după nume. `parentId` null = My Drive („root"). */
export async function findFolder(
  accessToken: string,
  name: string,
  parentId: string | null
): Promise<string | null> {
  const q = [
    `name = '${escapeDriveQueryValue(name)}'`,
    `mimeType = '${FOLDER_MIME}'`,
    `'${escapeDriveQueryValue(parentId ?? "root")}' in parents`,
    "trashed = false",
  ].join(" and ");
  const url = `${DRIVE_FILES}?q=${encodeURIComponent(q)}&fields=files(id,name)&pageSize=10`;
  const data = await driveJson<{ files: Array<{ id: string; name: string }> }>(url, accessToken);
  return data.files[0]?.id ?? null;
}

export async function createFolder(
  accessToken: string,
  name: string,
  parentId: string | null
): Promise<string> {
  const data = await driveJson<{ id: string }>(`${DRIVE_FILES}?fields=id`, accessToken, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name,
      mimeType: FOLDER_MIME,
      parents: [parentId ?? "root"],
    }),
  });
  return data.id;
}

/** Caută-și-creează. Folosit prin cache-ul din DB, nu direct în buclă. */
export async function ensureFolder(
  accessToken: string,
  name: string,
  parentId: string | null
): Promise<string> {
  return (await findFolder(accessToken, name, parentId)) ?? (await createFolder(accessToken, name, parentId));
}

/** True dacă fișierul mai există și nu e în coș — folderele șterse manual trebuie recreate. */
export async function fileExists(accessToken: string, fileId: string): Promise<boolean> {
  const res = await fetch(`${DRIVE_FILES}/${encodeURIComponent(fileId)}?fields=id,trashed`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (res.status === 404) return false;
  if (!res.ok) return false;
  const data = (await res.json()) as { trashed?: boolean };
  return data.trashed !== true;
}

export interface UploadResult {
  fileId: string;
  webViewLink: string | null;
}

/**
 * Urcă (sau înlocuiește) un PDF. Multipart, nu resumable: dosarele noastre sunt de ordinul
 * megaocteților, iar resumable ar însemna două drumuri dus-întors pentru fiecare fișier.
 *
 * Cu `existingFileId` face UPDATE pe același fișier, deci link-ul pe care l-a pus cineva într-un
 * e-mail rămâne valid, iar Drive păstrează versiunile.
 */
export async function uploadPdf(
  accessToken: string,
  params: { name: string; parentId: string; bytes: Buffer; existingFileId?: string | null }
): Promise<UploadResult> {
  const boundary = `vector-${Math.random().toString(36).slice(2)}`;
  const metadata: Record<string, unknown> = { name: params.name };
  // La update, `parents` nu se poate trimite în metadata (Drive cere ?addParents/?removeParents),
  // iar mutarea între mape o tratăm separat, la nivelul runner-ului.
  if (!params.existingFileId) metadata.parents = [params.parentId];

  const body = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: application/pdf\r\n\r\n`,
      "utf8"
    ),
    params.bytes,
    Buffer.from(`\r\n--${boundary}--\r\n`, "utf8"),
  ]);

  const url = params.existingFileId
    ? `${DRIVE_UPLOAD}/${encodeURIComponent(params.existingFileId)}?uploadType=multipart&fields=id,webViewLink`
    : `${DRIVE_UPLOAD}?uploadType=multipart&fields=id,webViewLink`;

  const res = await fetch(url, {
    method: params.existingFileId ? "PATCH" : "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": `multipart/related; boundary=${boundary}`,
    },
    body: new Uint8Array(body),
  });
  if (!res.ok) {
    throw new Error(`drive_upload_${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`);
  }
  const data = (await res.json()) as { id: string; webViewLink?: string };
  return { fileId: data.id, webViewLink: data.webViewLink ?? null };
}

/** Mută un fișier într-o altă mapă (cererea și-a schimbat proiectul între două sincronizări). */
export async function moveFile(
  accessToken: string,
  fileId: string,
  newParentId: string,
  oldParentId: string
): Promise<void> {
  const url =
    `${DRIVE_FILES}/${encodeURIComponent(fileId)}?addParents=${encodeURIComponent(newParentId)}` +
    `&removeParents=${encodeURIComponent(oldParentId)}&fields=id`;
  await driveJson<{ id: string }>(url, accessToken, { method: "PATCH" });
}

/** Revocă token-ul la deconectare — altfel aplicația rămâne în lista de acces a contului Google. */
export async function revokeDriveToken(refreshToken: string): Promise<void> {
  await fetch("https://oauth2.googleapis.com/revoke", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token: refreshToken }).toString(),
  }).catch(() => undefined);
}
