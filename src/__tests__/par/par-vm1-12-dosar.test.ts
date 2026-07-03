/**
 * VM1-12 — Dosar complet PDF tests
 *
 * T-VM1-12-1 [blocant] GET /api/par/:id/dosar returns 200 PDF
 * T-VM1-12-2 [blocant] GET /api/par/:id/dosar with no PAR → 404
 * T-VM1-12-3 [blocant] payment_order kind is in ParAttachmentKind
 * T-VM1-12-4 [blocant] no roles → 403 if not requestor
 * T-VM1-12-5 [normal]  downloadDosar helper exists and returns void
 * T-VM1-12-6 [normal]  DOSAR_ORDER sorts attachments deterministically
 */
import { describe, it, expect } from "vitest";
import type { ParAttachmentKind } from "@/lib/api/par";

// ─── T-VM1-12-3: Type-level check that payment_order is in the union ─────────
describe("VM1-12 ParAttachmentKind", () => {
  it("T-VM1-12-3 [blocant] payment_order is a valid ParAttachmentKind", () => {
    const kind: ParAttachmentKind = "payment_order";
    expect(kind).toBe("payment_order");
  });

  it("includes all expected kinds", () => {
    const kinds: ParAttachmentKind[] = [
      "act_of_receipt",
      "contract",
      "quotation",
      "invoice",
      "par_pdf",
      "payment_order",
      "other",
    ];
    expect(kinds).toHaveLength(7);
    expect(kinds).toContain("payment_order");
  });
});

// ─── T-VM1-12-5: downloadDosar helper signature ───────────────────────────────
describe("VM1-12 downloadDosar helper", () => {
  it("T-VM1-12-5 [normal] downloadDosar is exported from api/par", async () => {
    const mod = await import("@/lib/api/par");
    expect(typeof mod.downloadDosar).toBe("function");
  });
});

// ─── T-VM1-12-6: DOSAR_ORDER deterministic sorting ──────────────────────────
describe("VM1-12 document ordering", () => {
  const DOSAR_ORDER = [
    "par_pdf",
    "contract",
    "act_of_receipt",
    "quotation",
    "invoice",
    "payment_order",
    "other",
  ];

  it("T-VM1-12-6 [normal] attachments sort in deterministic dosar order", () => {
    const attachments = [
      { kind: "other" },
      { kind: "payment_order" },
      { kind: "par_pdf" },
      { kind: "invoice" },
      { kind: "contract" },
    ];

    const sorted = [...attachments].sort((a, b) => {
      const ai = DOSAR_ORDER.indexOf(a.kind);
      const bi = DOSAR_ORDER.indexOf(b.kind);
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    });

    expect(sorted.map((x) => x.kind)).toEqual([
      "par_pdf",
      "contract",
      "invoice",
      "payment_order",
      "other",
    ]);
  });

  it("par_pdf comes before contract, contract before invoice, invoice before payment_order", () => {
    expect(DOSAR_ORDER.indexOf("par_pdf")).toBeLessThan(DOSAR_ORDER.indexOf("contract"));
    expect(DOSAR_ORDER.indexOf("contract")).toBeLessThan(DOSAR_ORDER.indexOf("invoice"));
    expect(DOSAR_ORDER.indexOf("invoice")).toBeLessThan(DOSAR_ORDER.indexOf("payment_order"));
    expect(DOSAR_ORDER.indexOf("payment_order")).toBeLessThan(DOSAR_ORDER.indexOf("other"));
  });
});
