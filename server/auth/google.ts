// AUTH-005: Google Sign-In (OAuth 2.0 + OIDC) — pure helpers, no DB access.
// We implement the flow with plain fetch (no extra dependency) and protect it
// with both a `state` CSRF token and PKCE (S256).
import { randomBytes, createHash } from "node:crypto";

const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const USERINFO_ENDPOINT = "https://openidconnect.googleapis.com/v1/userinfo";

export interface GoogleConfig {
  clientId: string;
  clientSecret: string;
  /** Must exactly match a redirect URI registered in the Google Cloud console. */
  redirectUri: string;
}

/**
 * Reads Google OAuth config from the environment. Returns null when the feature
 * is not configured, so callers can degrade gracefully instead of 500-ing.
 * The redirect URI defaults to `${APP_URL}/api/auth/google/callback` because in
 * dev the API is reached through the Vite proxy (5173 → 3000), so we cannot
 * derive the public origin from the request host.
 */
export function getGoogleConfig(): GoogleConfig | null {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  const appUrl = process.env.APP_URL ?? "http://localhost:5173";
  const redirectUri =
    process.env.GOOGLE_REDIRECT_URI ?? `${appUrl}/api/auth/google/callback`;
  return { clientId, clientSecret, redirectUri };
}

export function generateState(): string {
  return randomBytes(24).toString("base64url");
}

export function generateCodeVerifier(): string {
  return randomBytes(32).toString("base64url");
}

export function codeChallengeFromVerifier(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

export function buildAuthUrl(
  config: GoogleConfig,
  state: string,
  codeChallenge: string
): string {
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    prompt: "select_account",
  });
  return `${AUTH_ENDPOINT}?${params.toString()}`;
}

interface TokenResponse {
  access_token: string;
  id_token?: string;
  token_type?: string;
}

/** Exchanges the authorization code for tokens. Throws on a non-OK response. */
export async function exchangeCode(
  config: GoogleConfig,
  code: string,
  codeVerifier: string
): Promise<TokenResponse> {
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
    const detail = await res.text().catch(() => "");
    throw new Error(`google_token_exchange_failed: ${res.status} ${detail}`);
  }
  return (await res.json()) as TokenResponse;
}

export interface GoogleProfile {
  sub: string;
  email: string;
  emailVerified: boolean;
  name: string;
  picture?: string;
}

/** Fetches the OIDC userinfo for the given access token. Throws on failure. */
export async function fetchUserInfo(accessToken: string): Promise<GoogleProfile> {
  const res = await fetch(USERINFO_ENDPOINT, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error(`google_userinfo_failed: ${res.status}`);
  }
  const data = (await res.json()) as {
    sub: string;
    email?: string;
    email_verified?: boolean;
    name?: string;
    picture?: string;
  };
  return {
    sub: data.sub,
    email: (data.email ?? "").toLowerCase(),
    emailVerified: data.email_verified === true,
    name: data.name ?? (data.email ? data.email.split("@")[0] : "Utilizator"),
    picture: data.picture,
  };
}
