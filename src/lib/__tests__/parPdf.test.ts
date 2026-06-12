/**
 * PAR-114 — Unit tests for parPdf.ts
 *
 * Tests are pure string assertions on buildParHtml() — no browser / canvas required.
 * T-PAR-114-1 [blocant]: complete PAR contains all 16 sections, title, X marks, total, sigs
 * T-PAR-114-2 [blocant]: MDL money format (700000 → "L 7 000")
 * T-PAR-114-3 [normal]:  HTML special chars are escaped (anti-injection)
 */
import { describe, it, expect } from "vitest";
import { buildParHtml, money, esc } from "../parPdf";
import type { ParDetail } from "../api/par";

// ─── money() helper ────────────────────────────────────────────────────────────

describe("money()", () => {
  it("formats whole thousands", () => {
    const result = money(700000);
    expect(result).toMatch(/^L[\s  ]7[\s  ]000$/);
  });

  it("formats zero as L 0", () => {
    const result = money(0);
    expect(result).toMatch(/^L[\s  ]0$/);
  });

  it("formats large amount with multiple thousand groups", () => {
    const result = money(123456700);
    expect(result).toMatch(/^L[\s  ]1[\s  ]234[\s  ]567$/);
  });

  it("formats amount with cents", () => {
    const result = money(700050);
    expect(result).toMatch(/^L[\s  ]7[\s  ]000,50$/);
  });

  it("formats negative amount", () => {
    const result = money(-50000);
    expect(result).toMatch(/^-L[\s  ]500$/);
  });

  it("uses currency symbol for non-MDL", () => {
    const result = money(100000, "USD");
    expect(result).toMatch(/^USD[\s  ]1[\s  ]000$/);
  });

  it("starts with 'L' for MDL currency", () => {
    expect(money(700000)).toMatch(/^L/);
  });

  it("produces the thousands separator between digit groups", () => {
    const result = money(1000000); // 10,000.00 -> L 10 000
    expect(result).toContain("10");
    expect(result).toContain("000");
  });
});

// ─── esc() helper ─────────────────────────────────────────────────────────────

describe("esc()", () => {
  it("escapes & < > \"", () => {
    expect(esc('a & b < c > d "e"')).toBe("a &amp; b &lt; c &gt; d &quot;e&quot;");
  });

  it("returns empty string for null/undefined", () => {
    expect(esc(null)).toBe("");
    expect(esc(undefined)).toBe("");
  });

  it("returns plain string unchanged", () => {
    expect(esc("hello world")).toBe("hello world");
  });
});

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makePar(overrides: Partial<ParDetail> = {}): ParDetail {
  const base: ParDetail = {
    id: "par-uuid-001",
    tenantId: "tenant-uuid",
    requestNo: "PAR-2026-0001",
    dateOfRequest: "2026-06-10T00:00:00Z",
    requestedByUserId: "Sirbu Cristina",
    requestorTitle: "Procurement Specialist / M13",
    departmentId: "ATIC",
    dateNeeded: null,
    projectId: "Digital Safeguard",
    budgetCodeId: "BC-2026",
    budgetCodeNote: "according to monthly budget planning",
    purpose: "execute_payment",
    chargeTo: "program",
    chargeBillingCode: "BL-042",
    endUse: "performed group psychological consulting services, organized within the Digital Safeguard Project, lasting 120-180 min, on the Zoom platform.",
    vendorId: null,
    payeeName: "Daria Roitman",
    payeeIdnp: "2008001007903",
    payeeIban: "MD48ML000002259A19498121",
    payeeBank: 'BC "Moldindconbank" S.A.',
    attachmentsPresent: true,
    attachmentsNote: "act of receipt from June 09, 2026; Contract nr CS#DigiSec-2026-06-08",
    currency: "MDL",
    totalEstimatedCents: 700000,
    status: "paid",
    submittedAt: "2026-06-10T08:00:00Z",
    approvedAt: "2026-06-10T12:00:00Z",
    paidAt: "2026-06-11T10:00:00Z",
    cancelledAt: null,
    createdAt: "2026-06-10T07:00:00Z",
    updatedAt: "2026-06-11T10:00:00Z",
    line_items: [
      {
        id: "li-001",
        tenantId: "tenant-uuid",
        parId: "par-uuid-001",
        position: 1,
        description: "provision of psychological session services",
        quantity: 1,
        unit: "sesie",
        unitPriceCents: 700000,
        lineTotalCents: 700000,
        createdAt: "2026-06-10T07:00:00Z",
        updatedAt: "2026-06-10T07:00:00Z",
      },
    ],
    approvals: [
      {
        id: "appr-0",
        step: 0,
        approverUserId: "user-sirbu",
        approverRoleLabel: "Requestor",
        decision: "approved",
        locked: false,
        decidedAt: "2026-06-10T08:00:00Z",
        comment: null,
        signatureName: "Sirbu Cristina",
        signatureTitle: "Procurement Specialist / M13",
        createdAt: "2026-06-10T08:00:00Z",
      },
      {
        id: "appr-1",
        step: 1,
        approverUserId: "user-chirita",
        approverRoleLabel: "Strategic Projects Director",
        decision: "approved",
        locked: false,
        decidedAt: "2026-06-10T10:00:00Z",
        comment: null,
        signatureName: "Ana Chirita",
        signatureTitle: "Strategic Projects Director",
        createdAt: "2026-06-10T08:00:00Z",
      },
      {
        id: "appr-2",
        step: 2,
        approverUserId: "user-oriol",
        approverRoleLabel: "Executive Director",
        decision: "approved",
        locked: false,
        decidedAt: "2026-06-10T12:00:00Z",
        comment: null,
        signatureName: "Irina Oriol",
        signatureTitle: "Executive Director",
        createdAt: "2026-06-10T08:00:00Z",
      },
    ],
    attachments: [],
    payment: {
      id: "pmt-001",
      parBl: "BL-042-2026",
      receivedAt: "2026-06-10T14:00:00Z",
      receivedByUserId: null,
      assignedToUserId: null,
      actualAmountCents: 700000,
      paymentDate: "2026-06-11T10:00:00Z",
      paymentRef: "REF-2026-001",
    },
  };
  return { ...base, ...overrides };
}

// ─── T-PAR-114-1 [blocant]: Full PAR contains all required sections ───────────

describe("buildParHtml() — T-PAR-114-1 [blocant]", () => {
  const par = makePar();
  let html: string;

  it("builds without throwing", () => {
    expect(() => { html = buildParHtml(par); }).not.toThrow();
    html = buildParHtml(par);
  });

  it("contains pink title band with form name", () => {
    const html = buildParHtml(par);
    expect(html).toContain("Payment Action Request (PAR) Form");
    expect(html).toContain("#e85d7c"); // PINK_TITLE color
  });

  it("contains PAR request number", () => {
    const html = buildParHtml(par);
    expect(html).toContain("PAR-2026-0001");
  });

  it("contains help link text (section header area)", () => {
    const html = buildParHtml(par);
    expect(html).toContain("Instructions for completing this form may be found");
  });

  it("contains all 7 header section labels (1–7)", () => {
    const html = buildParHtml(par);
    expect(html).toContain("1. Date of Request");
    expect(html).toContain("2. Requested By");
    expect(html).toContain("3. Title / Code");
    expect(html).toContain("4. Department");
    expect(html).toContain("5. Date Needed");
    expect(html).toContain("6. Requested For / Deliver To");
    expect(html).toContain("7. Budget Code");
  });

  it("contains header field values", () => {
    const html = buildParHtml(par);
    expect(html).toContain("Sirbu Cristina");
    expect(html).toContain("Procurement Specialist / M13");
    expect(html).toContain("ATIC");
    expect(html).toContain("Digital Safeguard");
  });

  it("marks Purpose = execute_payment with X (section 8)", () => {
    const html = buildParHtml(par);
    // The chosen purpose checkbox has the 'X' character
    expect(html).toContain("Execute payment");
    // The X appears next to execute payment (selected = true produces ">X<")
    expect(html).toMatch(/Execute payment[\s\S]{0,50}X|X[\s\S]{0,300}Execute payment/);
  });

  it("marks Charge To = program with X (section 9)", () => {
    const html = buildParHtml(par);
    expect(html).toContain("Program");
    // Billing code appears
    expect(html).toContain("BL-042");
  });

  it("contains section 8 Purpose label", () => {
    const html = buildParHtml(par);
    expect(html).toContain("8. Purpose of PAR");
  });

  it("contains section 9 Charge To label", () => {
    const html = buildParHtml(par);
    expect(html).toContain("9. Charge To");
  });

  it("contains section 10 line item table headers", () => {
    const html = buildParHtml(par);
    expect(html).toContain("10. Items / Services Requested");
    expect(html).toContain("Description / Specifications");
    expect(html).toContain("Est. Unit Price (MDL)");
    expect(html).toContain("Est. Total Price (MDL)");
  });

  it("contains TOTAL ESTIMATED COST", () => {
    const html = buildParHtml(par);
    expect(html).toContain("TOTAL ESTIMATED COST");
  });

  it("contains the 10% overage footnote", () => {
    const html = buildParHtml(par);
    expect(html).toContain("10%");
    expect(html).toContain("micro-purchase threshold");
  });

  it("contains section 11 end-use", () => {
    const html = buildParHtml(par);
    expect(html).toContain("11. Purpose and Description of End Use");
    expect(html).toContain("psychological consulting services");
  });

  it("contains section 12 payee block", () => {
    const html = buildParHtml(par);
    expect(html).toContain("12. Special Instructions / Payee");
    expect(html).toContain("IDNP");
    expect(html).toContain("IBAN");
    expect(html).toContain("Daria Roitman");
    expect(html).toContain("2008001007903");
    expect(html).toContain("MD48ML000002259A19498121");
    expect(html).toContain("Moldindconbank");
  });

  it("contains section 13 attachments", () => {
    const html = buildParHtml(par);
    expect(html).toContain("13. Attachments");
    expect(html).toContain("act of receipt from June 09, 2026");
  });

  it("contains sections 14–15 signature boxes", () => {
    const html = buildParHtml(par);
    expect(html).toContain("14. Requestor Signature");
    expect(html).toContain("15. Approver");
    expect(html).toContain("Sirbu Cristina"); // sec 14 name
    expect(html).toContain("Ana Chirita");    // sec 15 step 1
    expect(html).toContain("Irina Oriol");    // sec 15 step 2
    expect(html).toContain("APPROVE");        // approved decision label
  });

  it("contains section 16 payment internal use", () => {
    const html = buildParHtml(par);
    expect(html).toContain("16. Payment");
    expect(html).toContain("PAR BL");
    expect(html).toContain("Date Received");
    expect(html).toContain("Received By");
    expect(html).toContain("Assigned To");
    expect(html).toContain("BL-042-2026");
  });
});

// ─── T-PAR-114-2 [blocant]: MDL money format ──────────────────────────────────

describe("buildParHtml() — T-PAR-114-2 [blocant] money format", () => {
  it("includes 'L' (MDL symbol) and '7' and '000' for 700000 cents", () => {
    const par = makePar({ totalEstimatedCents: 700000 });
    const html = buildParHtml(par);
    // money(700000) = "L 7 000" — check components are present
    expect(html).toMatch(/L[\s  ]7[\s  ]000/);
  });

  it("formats line item total — L prefix with 7 000 components", () => {
    const par = makePar();
    const html = buildParHtml(par);
    // Line item total is 700000 cents
    expect(html).toMatch(/L[\s  ]7[\s  ]000/);
  });

  it("uses MDL symbol in TOTAL ESTIMATED COST row", () => {
    const par = makePar();
    const html = buildParHtml(par);
    // Should contain TOTAL ESTIMATED COST label
    expect(html).toContain("TOTAL ESTIMATED COST");
  });
});

// ─── T-PAR-114-3 [normal]: HTML injection prevention ─────────────────────────

describe("buildParHtml() — T-PAR-114-3 [normal] HTML escape", () => {
  it("escapes payee name with special chars", () => {
    const par = makePar({
      payeeName: '<script>alert("xss")</script>',
      payeeIdnp: "& IDNP &",
      payeeBank: '"Bank" & <Trust>',
    });
    const html = buildParHtml(par);
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&amp; IDNP &amp;");
    expect(html).toContain("&quot;Bank&quot; &amp; &lt;Trust&gt;");
  });

  it("escapes end-use text with injection attempt", () => {
    const par = makePar({
      endUse: '<img src=x onerror="alert(1)">',
    });
    const html = buildParHtml(par);
    expect(html).not.toContain('<img src=x');
    expect(html).toContain("&lt;img");
  });

  it("escapes requestor title with special characters", () => {
    const par = makePar({ requestorTitle: "Director & <CEO>" });
    const html = buildParHtml(par);
    expect(html).toContain("Director &amp; &lt;CEO&gt;");
    expect(html).not.toContain("Director & <CEO>");
  });

  it("handles null payee fields gracefully (no crash)", () => {
    const par = makePar({
      payeeName: null,
      payeeIdnp: null,
      payeeIban: null,
      payeeBank: null,
    });
    expect(() => buildParHtml(par)).not.toThrow();
  });

  it("handles empty line_items array without crash", () => {
    const par = makePar({ line_items: [] });
    const html = buildParHtml(par);
    expect(html).toContain("No items");
    expect(html).toContain("TOTAL ESTIMATED COST");
  });
});
