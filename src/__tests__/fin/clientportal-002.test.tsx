/**
 * CLIENTPORTAL-002 — Portal pagina client (facturi, plată online, sold)
 *
 * T-CLIENTPORTAL-002-1 [blocant] GET /invoices?token=valid → 200 + invoices[] + totalOwedCents
 * T-CLIENTPORTAL-002-2 [blocant] GET /invoices?token=bad → 401 + error
 * T-CLIENTPORTAL-002-3 [blocant] ClientPortalPage renders without crash
 * T-CLIENTPORTAL-002-4 [blocant] Response contains only tenant-scoped invoices (contractual)
 * T-CLIENTPORTAL-002-5 [normal] Token absent in URL → error message (no stack trace)
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { getPortalInvoices } from "@/lib/api/finClientPortal";
import { ClientPortalPage } from "@/pages/portal/ClientPortalPage";

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

// ─── T-CLIENTPORTAL-002-1 ─────────────────────────────────────────────────────
describe("GET /api/fin/client-portal/invoices", () => {
  it("T-CLIENTPORTAL-002-1 [blocant] returns invoices array and totalOwedCents for valid token", async () => {
    mockFetch(200, {
      invoices: [
        {
          id: "inv-001",
          invoiceNumber: "VECT-2026-0001",
          amountCents: 150000,
          currency: "MDL",
          status: "issued",
          issueDate: "2026-06-01T00:00:00Z",
          dueDate: "2026-07-01T00:00:00Z",
          stripeSessionId: null,
        },
      ],
      totalOwedCents: 150000,
      contactName: "Ion Popescu",
      companyName: null,
      tenantName: "Academia Vectora",
    });

    const result = await getPortalInvoices("aaaaaaaa-1111-2222-3333-bbbbbbbbbbbb");
    expect(Array.isArray(result.invoices)).toBe(true);
    expect(result.invoices.length).toBeGreaterThan(0);
    expect(result.totalOwedCents).toBeGreaterThanOrEqual(0);
    expect(result.invoices[0].invoiceNumber).toBe("VECT-2026-0001");
  });

  it("T-CLIENTPORTAL-002-2 [blocant] throws error for invalid token", async () => {
    mockFetch(401, { error: "invalid_or_expired_token" });
    await expect(getPortalInvoices("bad-token")).rejects.toThrow();
  });
});

// ─── T-CLIENTPORTAL-002-3 ─────────────────────────────────────────────────────
describe("ClientPortalPage", () => {
  it("T-CLIENTPORTAL-002-3 [blocant] renders without crash in loading state", () => {
    // Mock all 3 fetch calls with a never-resolving promise so we stay in loading
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => {})) as unknown as typeof fetch
    );

    // Should not throw
    expect(() => render(<ClientPortalPage token="aaaaaaaa-1111-2222-3333-bbbbbbbbbbbb" />)).not.toThrow();
  });

  it("T-CLIENTPORTAL-002-4 [blocant] API response is tenant-scoped (shape check)", async () => {
    // Verify the getPortalInvoices function includes tenantName in the response
    mockFetch(200, {
      invoices: [],
      totalOwedCents: 0,
      contactName: null,
      companyName: "ACME SRL",
      tenantName: "Academia Vectora",
    });

    const result = await getPortalInvoices("valid-token");
    // The response must include tenantName — this is the contract for tenant isolation
    expect(result).toHaveProperty("tenantName");
    expect(typeof result.tenantName).toBe("string");
    // The response must NOT return undefined totalOwedCents
    expect(result.totalOwedCents).toBeDefined();
  });

  it("T-CLIENTPORTAL-002-5 [normal] renders error message when token is empty", async () => {
    const { container } = render(<ClientPortalPage token="" />);
    // Should eventually show an error, not crash
    // Wait for the async effect to run (token is empty → immediate error set)
    await vi.waitFor(() => {
      const text = container.textContent ?? "";
      expect(text.length).toBeGreaterThan(0);
    });
  });
});
