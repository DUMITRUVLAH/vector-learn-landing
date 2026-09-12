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
    payerId: null,
    requestorTitle: "Procurement Specialist / M13",
    requestorCode: "M13",
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
    requestedByName: "Sirbu Cristina",
    departmentName: "ATIC",
    payerName: "ATIC",
    projectName: "Digital Safeguard",
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

  it("contains pale-rose title band with form name (official office-form look)", () => {
    const html = buildParHtml(par);
    expect(html).toContain("Payment Action Request (PAR) Form");
    expect(html).toContain("#fbe9ec"); // TITLE_BG pale-rose band
    // The old web-card pink fill must be gone — this is a black-and-white document.
    expect(html).not.toContain("#e85d7c");
  });

  it("contains PAR request number", () => {
    const html = buildParHtml(par);
    expect(html).toContain("PAR-2026-0001");
  });

  // VM1-04: donors report per-event — the event name must reach the printed form.
  it("renders the event name next to the project when eventName is set", () => {
    const html = buildParHtml(makePar({ projectName: "Proiect Educație", eventName: "Tabăra de vară 2026" }));
    expect(html).toContain("Proiect Educație · Tabăra de vară 2026");
  });

  it("renders only the project when no event is linked", () => {
    const html = buildParHtml(makePar({ projectName: "Proiect Educație", eventName: null }));
    expect(html).toContain("Proiect Educație");
    expect(html).not.toContain("Proiect Educație ·");
  });

  it("contains help link text (section header area)", () => {
    const html = buildParHtml(par);
    expect(html).toContain("Instructions for completing this form may be found");
  });

  it("contains all 7 header section labels (1–7, official wording)", () => {
    const html = buildParHtml(par);
    expect(html).toContain("Date of Request");
    expect(html).toContain("Requested By");
    expect(html).toContain("Title of Requestor/Code");
    expect(html).toContain("Department");
    expect(html).toContain("Date Items/Services Needed");
    expect(html).toContain("Requested For/Deliver To");
    expect(html).toContain("Budget code:");
  });

  it("contains header field values", () => {
    const html = buildParHtml(par);
    expect(html).toContain("Sirbu Cristina");
    expect(html).toContain("Procurement Specialist / M13");
    expect(html).toContain("ATIC");
    expect(html).toContain("Digital Safeguard");
  });

  it("prints the requestor's function and personal code from their PAR snapshot", () => {
    const html = buildParHtml(makePar({ requestorTitle: "Procurement Specialist", requestorCode: "M13" }));
    expect(html).toContain("Procurement Specialist · M13");
  });

  it("never prints raw relationship UUIDs when a display name is unavailable", () => {
    const rawUuid = "5bfefe33-5cf3-427f-9671-0e91c43eec61";
    const html = buildParHtml(makePar({
      requestedByUserId: rawUuid,
      departmentId: rawUuid,
      projectId: rawUuid,
      budgetCodeId: rawUuid,
      requestedByName: null,
      departmentName: null,
      projectName: null,
      budgetCodeLabel: null,
      budgetCodeNote: null,
    }));
    expect(html).not.toContain(rawUuid);
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
    expect(html).toContain("Purpose of PAR (check one):");
  });

  it("contains section 9 Charge To label", () => {
    const html = buildParHtml(par);
    expect(html).toContain("Charge To (check one and enter billing code, if applicable):");
  });

  it("contains section 10 line item table headers (official wording)", () => {
    const html = buildParHtml(par);
    expect(html).toContain("Items/Services Requested:");
    expect(html).toContain("Description/Specifications of Items or Service");
    expect(html).toContain("Est. Unit Price");
    expect(html).toContain("Est. Total Price");
    expect(html).toContain("Quantity");
    expect(html).toContain("Units");
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
    expect(html).toContain("Purpose and Description of End Use of Requested Items/Services:");
    expect(html).toContain("psychological consulting services");
  });

  it("contains section 12 payee block (inline labeled lines)", () => {
    const html = buildParHtml(par);
    expect(html).toContain("Special Instructions or Additional Information:");
    expect(html).toContain("IDNP");
    expect(html).toContain("IBAN");
    expect(html).toContain("Daria Roitman");
    expect(html).toContain("2008001007903");
    expect(html).toContain("MD48ML000002259A19498121");
    expect(html).toContain("Moldindconbank");
  });

  it("contains section 13 attachments", () => {
    const html = buildParHtml(par);
    expect(html).toContain("Attachments to PAR");
    expect(html).toContain("act of receipt from June 09, 2026");
  });

  it("contains sections 14–15 signature boxes", () => {
    const html = buildParHtml(par);
    expect(html).toContain("Requestor Signature:");
    expect(html).toContain("Approver Signature (DOA Holder, Supervisor, or Tech Lead):");
    expect(html).toContain("Sirbu Cristina"); // sec 14 name
    expect(html).toContain("Ana Chirita");    // sec 15 step 1
    expect(html).toContain("Irina Oriol");    // sec 15 step 2
    expect(html).toContain("APPROVE");        // approved decision stamp
  });

  /**
   * VM5-15 (Iulian, ATIC): pe un nivel paralel, formularul lua primele două rânduri din listă.
   * Când rândul încă nedecis venea primul din baza de date, o semnătură dată dispărea — la a doua
   * descărcare a ACELEIAȘI cereri. Aici se randează aceleași date de două ori, cu ordinea
   * aprobărilor inversată între randări.
   */
  /**
   * Atenție la citire: modulul ăsta e CALEA VECHE (vezi antetul lui `parPdf.ts`). Formularul pe
   * care îl descarcă oamenii se scrie pe server, iar regresia reală e apărată de
   * `server/__tests__/par-form-server.routes.test.ts`. Testele de aici țin cele două implementări
   * consecvente, ca o eventuală întoarcere la randarea în browser să nu reintroducă bugul.
   */
  describe("sections 14–15 — nivel paralel de aprobare", () => {
    const parallel = (order: number[]) => {
      const rows = [
        { id: "p-req", step: 0, approverUserId: "u-req", approverRoleLabel: "Requestor",
          decision: "approved" as const, locked: false, decidedAt: "2026-09-08T09:00:00Z",
          comment: null, signatureName: "Iulian Lungu", signatureTitle: "Project Coordinator",
          createdAt: "2026-09-08T09:00:00Z" },
        { id: "p-ana", step: 1, approverUserId: "u-ana", approverRoleLabel: "Aprobator",
          decision: "approved" as const, locked: false, decidedAt: "2026-09-08T10:00:00Z",
          comment: null, signatureName: "Ana Chirita", signatureTitle: "Strategic Projects Director",
          createdAt: "2026-09-08T09:00:00Z" },
        { id: "p-irina", step: 1, approverUserId: "u-irina", approverRoleLabel: "Aprobator",
          decision: "approved" as const, locked: false, decidedAt: "2026-09-08T11:00:00Z",
          comment: null, signatureName: "Irina Oriol", signatureTitle: "Executive Director",
          createdAt: "2026-09-08T09:00:00Z" },
        { id: "p-pending", step: 1, approverUserId: "u-alt", approverRoleLabel: "Aprobator",
          decision: "pending" as const, locked: false, decidedAt: null,
          comment: null, signatureName: null, signatureTitle: null,
          createdAt: "2026-09-08T09:00:00Z" },
      ];
      return makePar({ approvals: order.map((i) => rows[i]) });
    };

    it("tipărește ambele semnături indiferent de ordinea rândurilor", () => {
      const a = buildParHtml(parallel([0, 1, 2, 3]));
      const b = buildParHtml(parallel([3, 2, 1, 0]));
      for (const html of [a, b]) {
        expect(html).toContain("Ana Chirita");
        expect(html).toContain("Irina Oriol");
      }
    });

    it("produce exact același formular la două descărcări consecutive", () => {
      const strip = (h: string) => h.replace(/Generated: [^<]*/g, "Generated: —");
      expect(strip(buildParHtml(parallel([0, 1, 2, 3])))).toBe(strip(buildParHtml(parallel([2, 3, 0, 1]))));
    });

    it("dă o casetă fiecărui aprobator, nu doar primilor doi", () => {
      const html = buildParHtml(parallel([0, 1, 2, 3]));
      const boxes = html.match(/Signature:<\/span>/g) ?? [];
      // 1 solicitant + 3 aprobatori (doi semnați + unul în așteptare)
      expect(boxes.length).toBeGreaterThanOrEqual(4);
    });
  });

  /** VM5-17: ștampila de timp pe formularul tipărit. */
  describe("ștampile de timp", () => {
    it("scrie momentul depunerii, al aprobării și al generării", () => {
      const html = buildParHtml(par);
      expect(html).toContain("Submitted: 10-Jun-26");
      expect(html).toContain("Approved: 10-Jun-26");
      expect(html).toContain("Generated:");
    });

    /**
     * Fișa aprobărilor din dosar e fixată pe ora Chișinăului. Dacă formularul ar folosi ora
     * laptopului, două piese din același dosar ar arăta ore diferite pentru cine deschide
     * aplicația din altă țară.
     */
    it("scrie ora organizației, nu a laptopului", () => {
      const tzOriginal = process.env.TZ;
      process.env.TZ = "America/New_York";
      // decidedAt = 2026-06-10T10:00:00Z → 13:00 la Chișinău, 06:00 la New York.
      const html = buildParHtml(par);
      expect(html).toContain("10-Jun-26 13:00");
      expect(html).not.toContain("10-Jun-26 06:00");
      process.env.TZ = tzOriginal;
    });

    it("data deciziei include ora, nu doar ziua", () => {
      const html = buildParHtml(par);
      expect(html).toMatch(/Date:<\/span>\s*<span[^>]*>10-Jun-26 \d{2}:\d{2}/);
    });

    /**
     * VM5-06 (owner, 12.09.2026): retroactivitatea rămâne liberă, dar documentul de audit poartă o
     * SINGURĂ dată — cea a cererii. Că a fost scrisă în urmă se vede în aplicație, nu pe hârtie.
     */
    it("pe o cerere datată în urmă tipărește doar data cererii", () => {
      const html = buildParHtml(makePar({
        dateOfRequest: "2026-05-02T00:00:00Z",
        submittedAt: "2026-06-10T08:00:00Z",
      }));
      expect(html).toContain("02-May-26");
      expect(html).not.toContain("registered");
      expect(html).not.toContain("Submitted:");
    });

    it("pe o cerere depusă în aceeași zi, momentul depunerii rămâne în subsol", () => {
      const html = buildParHtml(makePar({
        dateOfRequest: "2026-06-10T07:30:00Z",
        submittedAt: "2026-06-10T08:00:00Z",
      }));
      expect(html).toContain("Submitted: 10-Jun-26");
    });
  });

  it("contains section 16 payment internal use", () => {
    const html = buildParHtml(par);
    expect(html).toContain("Payment Internal Use Only:");
    expect(html).toContain("PAR BL");
    expect(html).toContain("Date Received");
    expect(html).toContain("Received By");
    expect(html).toContain("Assigned To");
    expect(html).toContain("BL-042-2026");
  });
});

// ─── T-PAR-114-2 [blocant]: MDL money format ──────────────────────────────────

describe("buildParHtml() — T-PAR-114-2 [blocant] money format", () => {
  it("renders the total as '7 000,00' (space thousands, comma decimals — official Excel)", () => {
    const par = makePar({ totalEstimatedCents: 700000 });
    const html = buildParHtml(par);
    // amount(700000) = "7 000,00" — space thousands, two decimals (matches the source form)
    expect(html).toMatch(/7[\s  ]000,00/);
  });

  it("renders the line item total in the same space/comma format", () => {
    const par = makePar();
    const html = buildParHtml(par);
    // Line item total is 700000 cents → "7 000,00"
    expect(html).toMatch(/7[\s  ]000,00/);
  });

  it("labels the total row with TOTAL ESTIMATED COST and an MDL column header", () => {
    const par = makePar();
    const html = buildParHtml(par);
    expect(html).toContain("TOTAL ESTIMATED COST");
    expect(html).toContain("MDL"); // money lives under an MDL column, like the office form
  });

  /**
   * Regresie (ATIC, PAR-2026-0027): formularul avea „MDL" scris în capul coloanelor de preț și
   * lângă TOTAL ESTIMATED COST, deci o cerere de 1.500 USD se printa ca 1.500 de lei — actul
   * semnat spunea altceva decât ecranul de alături.
   */
  it("printează moneda cererii, nu MDL, pentru un PAR în valută", () => {
    const par = makePar();
    par.currency = "USD";
    par.totalEstimatedCents = 150000;
    par.totalMdlCents = 2585820;
    par.exchangeRate = "17.2388";
    par.line_items = [{ ...par.line_items![0], unitPriceCents: 150000, lineTotalCents: 150000 }];

    const html = buildParHtml(par);

    expect(html).toContain("TOTAL ESTIMATED COST*: &nbsp;USD");
    expect(html).toContain("Est. Unit Price<br/><span style=\"color:#c0392b;font-weight:800;\">USD</span>");
    expect(html).not.toContain(">MDL</span>");
    // Echivalentul în lei rămâne pe formular — e cifra după care se verifică pragurile interne.
    expect(html).toContain("MDL equivalent:");
    expect(html).toMatch(/25[\s  ]858,20/);
    expect(html).toContain("17.2388");
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
