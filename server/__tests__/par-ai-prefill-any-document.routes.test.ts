/**
 * @vitest-environment node
 *
 * PAR AI prefill — "orice tip de act", pe ruta REALĂ.
 *
 * Bugul raportat de utilizator (2026-08-21): a încărcat un ACT de primire-predare **scanat**
 * (PDF fără strat de text) și a primit „Documentul nu pare a fi o factură" + câmpuri goale.
 * Două cauze: (1) un PDF scanat nu ajungea NICIODATĂ la model — ruta extrăgea text, obținea ""
 * și trimitea gol; (2) tipul actului bloca/avertiza degeaba.
 *
 * Testele de aici INVOCĂ ruta cu fișiere reale (CLAUDE.md §3.5.1quater — testează acțiunea,
 * nu doar butonul) și verifică ce primește extractorul, nu doar codul HTTP.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { PDFDocument, StandardFonts } from "pdf-lib";

// ─── Boundaries mocked: auth, DB, and the LLM extractor itself ────────────────

const extractSpy = vi.fn();

vi.mock("../lib/ai/parExtractor", () => ({
  extractParParties: (text: string, opts: Record<string, unknown>) => extractSpy(text, opts),
}));

vi.mock("../middleware/requireAuth", () => ({
  requireAuth: async (c: { set: (k: string, v: unknown) => void }, next: () => Promise<void>) => {
    c.set("user", { id: "u1", tenantId: "t1", email: "a@b.c" });
    await next();
  },
}));

vi.mock("../middleware/requirePARRole", () => ({
  requirePARRole: () => async (_c: unknown, next: () => Promise<void>) => next(),
}));

vi.mock("../db/client", () => ({
  db: {
    select: () => ({ from: () => ({ where: async () => [{ orgLegalName: "Vector Academy SRL" }] }) }),
  },
}));

import { parAiPrefillRoutes } from "../routes/parAiPrefill";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

/** A PDF whose pages carry NO text layer — exactly what a scanned/photographed act is. */
async function scannedPdf(): Promise<Buffer> {
  const doc = await PDFDocument.create();
  doc.addPage([595, 842]); // empty page → extractPdfText returns ""
  return Buffer.from(await doc.save());
}

/** A normal, digitally-generated PDF with a real text layer. */
async function textPdf(body: string): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([595, 842]);
  body.split("\n").forEach((line, i) => {
    page.drawText(line, { x: 40, y: 800 - i * 14, size: 10, font });
  });
  return Buffer.from(await doc.save());
}

function emptyExtraction(over: Record<string, unknown> = {}) {
  return {
    parties: [],
    amountCents: null,
    amountConfidence: 0,
    currency: null,
    scope: null,
    documentClass: null,
    lineItems: [],
    isStub: false,
    ...over,
  };
}

async function post(file: Buffer, name: string, mime: string) {
  const fd = new FormData();
  fd.append("file", new File([new Uint8Array(file)], name, { type: mime }));
  return parAiPrefillRoutes.request("/", { method: "POST", body: fd });
}

beforeEach(() => {
  extractSpy.mockReset();
  extractSpy.mockResolvedValue(emptyExtraction());
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("PDF scanat (fără strat de text) — ajunge totuși la model", () => {
  it("[blocant] trimite PDF-ul ca atașament când nu are text extractibil", async () => {
    const res = await post(await scannedPdf(), "act-scanat.pdf", "application/pdf");
    expect(res.status).toBe(200);

    expect(extractSpy).toHaveBeenCalledTimes(1);
    const [text, opts] = extractSpy.mock.calls[0];
    // Asta e regresia: înainte textul era "" și NIMIC nu ajungea la model.
    expect(String(text).trim().length).toBeLessThan(200);
    expect(String(opts.fileDataUrl)).toMatch(/^data:application\/pdf;base64,/);
    expect(opts.fileName).toBe("act-scanat.pdf");
  });

  it("un PDF cu text real NU e trimis ca atașament (calea ieftină rămâne textul)", async () => {
    const text = [
      "ACT de primire-predare a serviciilor",
      "Prestator: Viorica Bordei, cod personal 4841021002234",
      "IBAN: MD69ML000000022519094129, Banca: BC Moldindconbank S.A.",
      "Beneficiar: Asociatia Nationala a Companiilor din Domeniul TIC",
      "TOTAL, EUR 471.45",
      "Servicii de comunicare pentru evenimentul Moldova Digital Summit 2026",
      "Contract de prestari servicii CS-ATIC-2026-05-02 din 02.05.2026",
    ].join("\n");
    const res = await post(await textPdf(text), "act.pdf", "application/pdf");
    expect(res.status).toBe(200);

    const [sentText, opts] = extractSpy.mock.calls[0];
    expect(String(sentText)).toContain("MD69ML000000022519094129");
    expect(opts.fileDataUrl).toBeUndefined();
  });
});

describe("Alte formate de act", () => {
  it("[blocant] .docx e citit ca text (înainte ieșea binar prin toString('utf8'))", async () => {
    const JSZip = (await import("jszip")).default;
    const zip = new JSZip();
    zip.file(
      "word/document.xml",
      `<?xml version="1.0"?><w:document xmlns:w="x"><w:body>
        <w:p><w:r><w:t>Prestator: Bordei Viorica</w:t></w:r></w:p>
        <w:p><w:r><w:t>IBAN: MD69ML000000022519094129</w:t></w:r></w:p>
      </w:body></w:document>`,
    );
    const buf = Buffer.from(await zip.generateAsync({ type: "nodebuffer" }));

    const res = await post(
      buf,
      "act.docx",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
    expect(res.status).toBe(200);
    const [sentText] = extractSpy.mock.calls[0];
    expect(String(sentText)).toContain("Prestator: Bordei Viorica");
    expect(String(sentText)).toContain("MD69ML000000022519094129");
  });

  it("imaginea merge pe calea vision, ca înainte", async () => {
    // 1x1 PNG
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      "base64",
    );
    await post(png, "poza.png", "image/png");
    const [, opts] = extractSpy.mock.calls[0];
    expect(String(opts.imageDataUrl)).toMatch(/^data:image\/png;base64,/);
    expect(opts.fileDataUrl).toBeUndefined();
  });
});

describe("Tipul actului nu mai blochează nimic", () => {
  it("[blocant] un act 'not_invoice' cu sumă + IBAN completează beneficiarul", async () => {
    extractSpy.mockResolvedValue(
      emptyExtraction({
        documentClass: "not_invoice",
        documentClassReason: "Act de primire-predare",
        amountCents: 47145,
        amountConfidence: 0.9,
        currency: "EUR",
        scope: "Servicii de comunicare",
        parties: [
          {
            name: "Viorica Bordei",
            role: "provider",
            idno: "4841021002234",
            iban: "MD69ML000000022519094129",
            bank: "BC Moldindconbank S.A.",
          },
          { name: "Asociatia Nationala a Companiilor TIC", role: "client", idno: "1006600034927" },
        ],
      }),
    );

    const res = await post(await scannedPdf(), "act.pdf", "application/pdf");
    const body = (await res.json()) as Record<string, never>;

    expect(body.payeeName.value).toBe("Viorica Bordei");
    expect(body.payeeIban.value).toBe("MD69ML000000022519094129");
    expect(body.totalCents.value).toBe(47145);
    // Eticheta rămâne, dar pur informativ — fără steag de avertizare.
    expect(body.documentClass.value).toBe("not_invoice");
    expect("not_financial" in (body.documentClass as object)).toBe(false);
  });
});

describe("Grupare pe părți + conturi multiple", () => {
  it("[blocant] întoarce toate părțile grupate, cu cea propusă marcată", async () => {
    extractSpy.mockResolvedValue(
      emptyExtraction({
        amountCents: 100000,
        currency: "MDL",
        parties: [
          {
            name: "Alfa Construct SRL",
            role: "provider",
            idno: "1014000076543",
            iban: "MD35EX00000000123456789Z",
          },
          { name: "Beta Materiale SRL", role: "client", idno: "1003600054321" },
        ],
      }),
    );

    const res = await post(await scannedPdf(), "act.pdf", "application/pdf");
    const body = (await res.json()) as Record<string, never>;

    const names = (body.partyOptions as Array<{ name: string }>).map((o) => o.name);
    expect(names).toContain("Alfa Construct SRL");
    expect(names).toContain("Beta Materiale SRL");

    const options = body.partyOptions as Array<{ name: string; recommended: boolean; isPayer: boolean }>;
    expect(options.find((o) => o.name === "Alfa Construct SRL")?.recommended).toBe(true);
    expect(options.find((o) => o.name === "Beta Materiale SRL")?.isPayer).toBe(true);
  });

  it("[blocant] conturile multiple ale unei părți ajung în UI ca listă de ales", async () => {
    extractSpy.mockResolvedValue(
      emptyExtraction({
        amountCents: 100000,
        currency: "MDL",
        parties: [
          {
            name: "Alfa Construct SRL",
            role: "provider",
            idno: "1014000076543",
            iban: "MD35EX00000000123456789Z",
            ibans: ["MD35EX00000000123456789Z", "MD69ML000000022519094129"],
          },
        ],
      }),
    );

    const res = await post(await scannedPdf(), "act.pdf", "application/pdf");
    const body = (await res.json()) as Record<string, never>;
    const opt = (body.partyOptions as Array<{ ibans?: string[] }>)[0];
    expect(opt.ibans).toEqual([
      "MD35EX00000000123456789Z",
      "MD69ML000000022519094129",
    ]);
  });
});
