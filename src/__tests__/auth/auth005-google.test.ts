// @vitest-environment node
/**
 * AUTH-005 — Google Sign-In (OAuth 2.0 / OIDC)
 *
 * Covers the pure helper layer in server/auth/google.ts (no DB / Hono needed):
 *   T-AUTH-005-1 [blocant]: getGoogleConfig — null when unconfigured, redirect URI default
 *   T-AUTH-005-2 [blocant]: PKCE — code_challenge = base64url(sha256(verifier)), S256
 *   T-AUTH-005-3 [blocant]: buildAuthUrl — correct endpoint + required OAuth params
 *   T-AUTH-005-4 [blocant]: exchangeCode — posts code+verifier, throws on non-OK
 *   T-AUTH-005-5 [blocant]: fetchUserInfo — normalizes email (lowercase), email_verified, name fallback
 *
 * The DB-branching of the callback (link-by-email / create-tenant / google-id login)
 * is straightforward Drizzle and verified via the live API smoke.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { createHash } from "node:crypto";
import {
  getGoogleConfig,
  generateState,
  generateCodeVerifier,
  codeChallengeFromVerifier,
  buildAuthUrl,
  exchangeCode,
  fetchUserInfo,
} from "../../../server/auth/google";

const ORIG_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIG_ENV };
  vi.restoreAllMocks();
});

// ── T-AUTH-005-1: config ────────────────────────────────────────────────────
describe("AUTH-005: getGoogleConfig — T-AUTH-005-1", () => {
  it("returns null when client id/secret are missing (feature off)", () => {
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;
    expect(getGoogleConfig()).toBeNull();
  });

  it("builds the redirect URI from APP_URL when GOOGLE_REDIRECT_URI is unset", () => {
    process.env.GOOGLE_CLIENT_ID = "cid";
    process.env.GOOGLE_CLIENT_SECRET = "secret";
    process.env.APP_URL = "https://app.example.com";
    delete process.env.GOOGLE_REDIRECT_URI;
    const cfg = getGoogleConfig();
    expect(cfg?.redirectUri).toBe("https://app.example.com/api/auth/google/callback");
  });

  it("prefers an explicit GOOGLE_REDIRECT_URI", () => {
    process.env.GOOGLE_CLIENT_ID = "cid";
    process.env.GOOGLE_CLIENT_SECRET = "secret";
    process.env.GOOGLE_REDIRECT_URI = "https://custom.example.com/cb";
    expect(getGoogleConfig()?.redirectUri).toBe("https://custom.example.com/cb");
  });
});

// ── T-AUTH-005-2: PKCE ──────────────────────────────────────────────────────
describe("AUTH-005: PKCE — T-AUTH-005-2", () => {
  it("state and verifier are URL-safe, non-trivial in length", () => {
    expect(generateState()).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(generateCodeVerifier().length).toBeGreaterThanOrEqual(43);
  });

  it("code_challenge equals base64url(sha256(verifier)) — S256", () => {
    const verifier = generateCodeVerifier();
    const expected = createHash("sha256").update(verifier).digest("base64url");
    expect(codeChallengeFromVerifier(verifier)).toBe(expected);
    // base64url must not contain +, /, or = padding.
    expect(codeChallengeFromVerifier(verifier)).not.toMatch(/[+/=]/);
  });
});

// ── T-AUTH-005-3: auth URL ──────────────────────────────────────────────────
describe("AUTH-005: buildAuthUrl — T-AUTH-005-3", () => {
  it("targets Google's auth endpoint with all required params", () => {
    const cfg = {
      clientId: "cid",
      clientSecret: "secret",
      redirectUri: "https://app.example.com/api/auth/google/callback",
    };
    const url = new URL(buildAuthUrl(cfg, "state123", "challenge123"));
    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    const p = url.searchParams;
    expect(p.get("client_id")).toBe("cid");
    expect(p.get("redirect_uri")).toBe(cfg.redirectUri);
    expect(p.get("response_type")).toBe("code");
    expect(p.get("scope")).toBe("openid email profile");
    expect(p.get("state")).toBe("state123");
    expect(p.get("code_challenge")).toBe("challenge123");
    expect(p.get("code_challenge_method")).toBe("S256");
  });
});

// ── T-AUTH-005-4: token exchange ────────────────────────────────────────────
describe("AUTH-005: exchangeCode — T-AUTH-005-4", () => {
  const cfg = {
    clientId: "cid",
    clientSecret: "secret",
    redirectUri: "https://app.example.com/api/auth/google/callback",
  };

  it("POSTs the code + verifier and returns tokens", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ access_token: "at", id_token: "it" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const tokens = await exchangeCode(cfg, "authcode", "verifier123");
    expect(tokens.access_token).toBe("at");

    const [calledUrl, init] = fetchMock.mock.calls[0];
    expect(calledUrl).toBe("https://oauth2.googleapis.com/token");
    const body = String((init as RequestInit).body);
    expect(body).toContain("code=authcode");
    expect(body).toContain("code_verifier=verifier123");
    expect(body).toContain("grant_type=authorization_code");
  });

  it("throws when Google returns a non-OK status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("bad", { status: 400 }))
    );
    await expect(exchangeCode(cfg, "x", "y")).rejects.toThrow(/google_token_exchange_failed/);
  });
});

// ── T-AUTH-005-5: userinfo normalization ────────────────────────────────────
describe("AUTH-005: fetchUserInfo — T-AUTH-005-5", () => {
  it("lowercases email, maps email_verified, and passes name through", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            sub: "google-sub-1",
            email: "Person@Example.COM",
            email_verified: true,
            name: "Test Person",
            picture: "https://pic",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      )
    );
    const p = await fetchUserInfo("token");
    expect(p.sub).toBe("google-sub-1");
    expect(p.email).toBe("person@example.com");
    expect(p.emailVerified).toBe(true);
    expect(p.name).toBe("Test Person");
    expect(p.picture).toBe("https://pic");
  });

  it("treats a missing email_verified as unverified and falls back to email-local name", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ sub: "s2", email: "noname@example.com" }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      )
    );
    const p = await fetchUserInfo("token");
    expect(p.emailVerified).toBe(false);
    expect(p.name).toBe("noname");
  });

  it("throws when userinfo returns a non-OK status", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 401 })));
    await expect(fetchUserInfo("token")).rejects.toThrow(/google_userinfo_failed/);
  });
});
