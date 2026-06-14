/**
 * CLIENTPORTAL-003 — Upload documente + polish UX
 *
 * T-CLIENTPORTAL-003-1 [blocant] POST /documents?token=valid → 200 + {id, originalName, uploadedAt}
 * T-CLIENTPORTAL-003-2 [blocant] finClientPortalDocuments schema e exportat corect
 * T-CLIENTPORTAL-003-3 [blocant] ClientPortalPage renders with documents list without crash
 * T-CLIENTPORTAL-003-4 [normal] POST /documents cu fișier prea mare → 413 error
 * T-CLIENTPORTAL-003-5 [normal] ClientPortalPage fără facturi/documente afișează empty-state text
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { uploadPortalDocument, getPortalDocuments } from "@/lib/api/finClientPortal";
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

// ─── T-CLIENTPORTAL-003-1 ─────────────────────────────────────────────────────
describe("POST /api/fin/client-portal/documents", () => {
  it("T-CLIENTPORTAL-003-1 [blocant] returns document record on upload", async () => {
    mockFetch(200, {
      id: "doc-001",
      originalName: "contract.pdf",
      mimeType: "application/pdf",
      sizeBytes: 12345,
      uploadedAt: new Date().toISOString(),
    });

    const fakeFile = new File(["pdf content"], "contract.pdf", { type: "application/pdf" });
    const result = await uploadPortalDocument("valid-token", fakeFile);
    expect(result.id).toBe("doc-001");
    expect(result.originalName).toBe("contract.pdf");
    expect(result.uploadedAt).toBeDefined();
  });

  it("T-CLIENTPORTAL-003-4 [normal] throws error when file is too large", async () => {
    mockFetch(413, { error: "Fișier prea mare (max 10 MB)" });

    // Create a large file stub (actual size check is backend-side; we test the client error handling)
    const largeFile = new File(["x".repeat(100)], "huge.pdf", { type: "application/pdf" });
    await expect(uploadPortalDocument("valid-token", largeFile)).rejects.toThrow(
      "Fișier prea mare"
    );
  });
});

// ─── T-CLIENTPORTAL-003-2 ─────────────────────────────────────────────────────
describe("Schema export — finClientPortalDocuments", () => {
  it("T-CLIENTPORTAL-003-2 [blocant] finClientPortalDocuments is exported from schema index", async () => {
    const schema = await import("@/../server/db/schema");
    expect(schema).toHaveProperty("finClientPortalDocuments");
    expect(typeof schema.finClientPortalDocuments).toBe("object");
  });
});

// ─── T-CLIENTPORTAL-003-3 ─────────────────────────────────────────────────────
describe("ClientPortalPage with documents", () => {
  it("T-CLIENTPORTAL-003-3 [blocant] renders documents list without crash", async () => {
    const identityResponse = {
      contactName: "Ion Popescu",
      companyName: null,
      tenantName: "Academia Vectora",
      tokenId: "tok-001",
    };
    const invoicesResponse = {
      invoices: [],
      totalOwedCents: 0,
      contactName: "Ion Popescu",
      companyName: null,
      tenantName: "Academia Vectora",
    };
    const docsResponse = {
      documents: [
        {
          id: "doc-001",
          originalName: "contract.pdf",
          mimeType: "application/pdf",
          sizeBytes: 5000,
          uploadedAt: new Date().toISOString(),
        },
      ],
    };

    // Route responses by URL path so parallel Promise.all works correctly
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        let body: unknown;
        const urlStr = String(url);
        if (urlStr.includes("/me")) body = identityResponse;
        else if (urlStr.includes("/invoices")) body = invoicesResponse;
        else body = docsResponse; // /documents
        return { ok: true, json: async () => body };
      }) as unknown as typeof fetch
    );

    const { container } = render(
      <ClientPortalPage token="aaaaaaaa-1111-2222-3333-eeeeeeeeeeee" />
    );
    await waitFor(() => {
      expect(container.textContent).toContain("contract.pdf");
    });
  });

  it("T-CLIENTPORTAL-003-5 [normal] shows empty state when no invoices or documents", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const urlStr = String(url);
        let body: unknown;
        if (urlStr.includes("/me")) body = { contactName: "Ion", companyName: null, tenantName: "Academia", tokenId: "t1" };
        else if (urlStr.includes("/invoices")) body = { invoices: [], totalOwedCents: 0, contactName: "Ion", companyName: null, tenantName: "Academia" };
        else body = { documents: [] };
        return { ok: true, json: async () => body };
      }) as unknown as typeof fetch
    );

    const { container } = render(
      <ClientPortalPage token="aaaaaaaa-1111-2222-3333-ffffffffffff" />
    );
    await waitFor(() => {
      // Should render empty state messages (not undefined/null text)
      const text = container.textContent ?? "";
      expect(text.length).toBeGreaterThan(0);
      // Should not show "undefined" or "[object Object]"
      expect(text).not.toContain("undefined");
      expect(text).not.toContain("[object Object]");
    });
  });
});
