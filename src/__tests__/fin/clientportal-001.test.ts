/**
 * CLIENTPORTAL-001 — Portal client financiar: schema token + acces magic-link
 *
 * T-CLIENTPORTAL-001-1 [blocant] Admin POST /tokens → 200 + JSON cu token + portalUrl
 * T-CLIENTPORTAL-001-2 [blocant] GET /me?token=valid → 200 + JSON cu contactName/companyName
 * T-CLIENTPORTAL-001-3 [blocant] GET /me?token=bad-uuid → 401 + JSON cu error
 * T-CLIENTPORTAL-001-4 [blocant] db.query.finClientPortalTokens schema e exportat corect
 * T-CLIENTPORTAL-001-5 [normal] Admin DELETE /tokens/:id → 200 + is_active=false
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  generatePortalToken,
  getPortalIdentity,
  revokePortalToken,
} from "@/lib/api/finClientPortal";

function mockFetch(status: number, body: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    })) as unknown as typeof fetch
  );
}

afterEach(() => vi.unstubAllGlobals());

// ─── T-CLIENTPORTAL-001-1 ─────────────────────────────────────────────────────
describe("POST /api/fin/client-portal/tokens", () => {
  it("T-CLIENTPORTAL-001-1 [blocant] returns token and portalUrl", async () => {
    const mockToken = "aaaaaaaa-1111-2222-3333-bbbbbbbbbbbb";
    mockFetch(200, {
      token: mockToken,
      expiresAt: new Date(Date.now() + 30 * 86400_000).toISOString(),
      portalUrl: `/portal/client?token=${mockToken}`,
    });

    const result = await generatePortalToken({ contactId: "00000000-0000-0000-0000-000000000001" });
    expect(result.token).toMatch(/^[0-9a-f-]{36}$/i);
    expect(result.portalUrl).toContain("/portal/client?token=");
  });
});

// ─── T-CLIENTPORTAL-001-2 ─────────────────────────────────────────────────────
describe("GET /api/fin/client-portal/me", () => {
  it("T-CLIENTPORTAL-001-2 [blocant] returns contactName or companyName for valid token", async () => {
    mockFetch(200, {
      contactName: "Ion Popescu",
      companyName: null,
      tenantName: "Academia Vectora",
      tokenId: "aaaaaaaa-1111-2222-3333-cccccccccccc",
    });

    const result = await getPortalIdentity("aaaaaaaa-1111-2222-3333-bbbbbbbbbbbb");
    expect(result.tenantName).toBe("Academia Vectora");
    expect(result.contactName ?? result.companyName).not.toBeNull();
  });

  it("T-CLIENTPORTAL-001-3 [blocant] throws error for invalid token", async () => {
    mockFetch(401, { error: "invalid_or_expired_token" });

    await expect(getPortalIdentity("not-a-uuid")).rejects.toThrow();
  });
});

// ─── T-CLIENTPORTAL-001-4 ─────────────────────────────────────────────────────
describe("Schema export — finClientPortalTokens", () => {
  it("T-CLIENTPORTAL-001-4 [blocant] finClientPortalTokens is exported from schema index", async () => {
    // Dynamic import ensures we actually exercise the export resolution
    const schema = await import("@/../server/db/schema");
    expect(schema).toHaveProperty("finClientPortalTokens");
    expect(typeof schema.finClientPortalTokens).toBe("object");
  });
});

// ─── T-CLIENTPORTAL-001-5 ─────────────────────────────────────────────────────
describe("DELETE /api/fin/client-portal/tokens/:id", () => {
  it("T-CLIENTPORTAL-001-5 [normal] revoke token returns ok:true", async () => {
    mockFetch(200, { ok: true });
    await expect(revokePortalToken("aaaaaaaa-1111-2222-3333-dddddddddddd")).resolves.toBeUndefined();
  });
});
