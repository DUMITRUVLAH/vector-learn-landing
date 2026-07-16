/**
 * @vitest-environment node
 * VM3-02: unit tests for the "Fișa aprobărilor" text builder + WinAnsi sanitizer.
 *
 * Violeta's audit ask: the downloaded dosar must SHOW who approved and when.
 * These tests assert the exact lines the PDF route draws.
 */
import { describe, it, expect } from "vitest";
import { buildApprovalSheetLines, type ApprovalSheetData } from "../approvalSheet";
import { winAnsiSafe } from "../pdfText";

const base: ApprovalSheetData = {
  requestNo: "PAR-2026-0042",
  dateOfRequest: "2026-07-10T00:00:00Z",
  status: "approved",
  requestedByName: "Ion Aprobatorul",
  payeeName: "Consult Prim SRL",
  payeeIdnp: "1002600012345",
  payeeIban: "MD24AG000225100013104168",
  payeeBank: "MAIB",
  currency: "MDL",
  totalEstimatedCents: 700000,
  totalMdlCents: null,
  projectName: "Digital Safeguard",
  eventName: null,
  budgetCodeLabel: "OPS-2026-07 — Operațiuni iulie",
  endUse: "Servicii de consultanță",
  approvedAt: "2026-07-14T10:30:00Z",
  paidAt: null,
  approvals: [
    {
      step: 0,
      approverRoleLabel: "Solicitant",
      name: "Ion Aprobatorul",
      decision: "approved",
      decidedAt: "2026-07-12T09:00:00Z",
      comment: null,
    },
    {
      step: 1,
      approverRoleLabel: "DOA Holder / Supervisor",
      name: "Ion Aprobatorul",
      decision: "approved",
      decidedAt: "2026-07-13T11:15:00Z",
      comment: null,
    },
    {
      step: 2,
      approverRoleLabel: "Executive Director",
      name: "Oana Directoarea",
      decision: "approved",
      decidedAt: "2026-07-14T10:30:00Z",
      comment: "Aprobat conform bugetului",
    },
  ],
};

describe("VM3-02 buildApprovalSheetLines", () => {
  const lines = buildApprovalSheetLines(base, new Date("2026-07-16T12:00:00Z"));
  const text = lines.map((l) => l.text).join("\n");

  it("[blocant] fiecare aprobator apare cu numele și DATA deciziei", () => {
    // WinAnsi-sanitized output (ă→a etc.) — exactly what gets drawn in the PDF.
    expect(text).toContain("Pas 1 — DOA Holder / Supervisor: Ion Aprobatorul — APROBAT la 13.07.2026");
    expect(text).toContain("Pas 2 — Executive Director: Oana Directoarea — APROBAT la 14.07.2026");
  });

  it("[blocant] antetul + statusul cu data aprobării sunt prezente", () => {
    expect(text).toContain(winAnsiSafe("FIȘA APROBĂRILOR — PAR-2026-0042"));
    expect(text).toContain("Status: Aprobat");
    expect(text).toContain("Aprobat la: 14.07.2026");
  });

  it("detaliile plății (beneficiar, IBAN, sumă, budget line) apar pe fișă", () => {
    expect(text).toContain("Consult Prim SRL");
    expect(text).toContain("MD24AG000225100013104168");
    expect(text).toContain("7000.00 MDL");
    expect(text).toContain(winAnsiSafe("OPS-2026-07 — Operațiuni iulie"));
  });

  it("comentariul aprobatorului apare sub pasul lui", () => {
    expect(text).toContain(winAnsiSafe("Comentariu: Aprobat conform bugetului"));
  });

  it("pasul 0 (solicitantul) e etichetat ca trimitere, nu ca aprobare", () => {
    expect(text).toContain("Pas 0 — Solicitant: Ion Aprobatorul — trimis spre aprobare la 12.07.2026");
  });

  it("pas în așteptare → 'în asteptare' (sanitizat: ș→s, î rămâne), fără dată", () => {
    const withPending = buildApprovalSheetLines(
      {
        ...base,
        status: "pending_approval",
        approvedAt: null,
        approvals: [
          ...base.approvals.slice(0, 2),
          { step: 2, approverRoleLabel: "Executive Director", name: "Oana Directoarea", decision: "pending", decidedAt: null, comment: null },
        ],
      },
      new Date("2026-07-16T12:00:00Z")
    );
    const t = withPending.map((l) => l.text).join("\n");
    expect(t).toContain("Pas 2 — Executive Director: Oana Directoarea — în asteptare");
    expect(t).not.toContain("Pas 2 — Executive Director: Oana Directoarea — în asteptare la");
  });

  it("fără aprobări → mesaj explicit, nu listă goală", () => {
    const empty = buildApprovalSheetLines({ ...base, approvals: [] }, new Date("2026-07-16T12:00:00Z"));
    const t = empty.map((l) => l.text).join("\n");
    expect(t).toContain(winAnsiSafe("Nicio semnătură înregistrată"));
  });

  it("valută străină → apare și echivalentul MDL", () => {
    const eur = buildApprovalSheetLines(
      { ...base, currency: "EUR", totalEstimatedCents: 100000, totalMdlCents: 1930000 },
      new Date("2026-07-16T12:00:00Z")
    );
    const t = eur.map((l) => l.text).join("\n");
    expect(t).toContain("1000.00 EUR");
    expect(t).toContain("echivalent 19300.00 MDL");
  });
});

describe("VM3-02 winAnsiSafe — regresia 'WinAnsi cannot encode'", () => {
  it("[blocant] transliterează ă/ș/ț (și formele legacy cu sedilă) — etichetele dosarului nu mai aruncă", () => {
    expect(winAnsiSafe("Factură")).toBe("Factura");
    expect(winAnsiSafe("Ordin de plată")).toBe("Ordin de plata");
    expect(winAnsiSafe("Act de recepție")).toBe("Act de receptie");
    expect(winAnsiSafe("Ofertă / Deviz")).toBe("Oferta / Deviz");
    expect(winAnsiSafe("ŞŢşţ")).toBe("STst");
    expect(winAnsiSafe("ȘȚșț")).toBe("STst");
  });

  it("â/î (cp1252) trec neschimbate; caractere non-cp1252 devin '?'", () => {
    expect(winAnsiSafe("întâi")).toBe("întâi");
    expect(winAnsiSafe("em—dash · dot")).toBe("em—dash · dot");
    expect(winAnsiSafe("日本")).toBe("??");
  });

  it("[blocant] output-ul e 100% desenabil de Helvetica (nu aruncă pe niciun caracter)", async () => {
    const { PDFDocument, StandardFonts } = await import("pdf-lib");
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const page = doc.addPage([595, 842]);
    const nasty = "Fișa aprobărilor — Factură șț ĂÎÂ日本 „ghilimele” €";
    expect(() => page.drawText(winAnsiSafe(nasty), { x: 50, y: 700, size: 10, font })).not.toThrow();
  });
});
