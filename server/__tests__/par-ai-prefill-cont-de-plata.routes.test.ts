/**
 * @vitest-environment node
 *
 * PAR AI prefill pe RUTA REALĂ, cu documentul owner-ului: „CONT DE PLATĂ" nr. 68339 (ZBOR.MD /
 * S.C. Explor Tur S.R.L., 25.08.2026), raportat pe 2026-08-28 — „am încărcat documentul și nu s-a
 * autocompletat".
 *
 * Ce rupea documentul (ambele căi):
 *   • vânzătorul e doar în ANTET (niciun „Furnizor"/„Prestator"), iar cumpărătorul apare ca
 *     „PLĂTITOR:" + o prescurtare fără formă juridică pe rândul următor („ATIC") → și modelul, și
 *     parserul determinist lipeau rolul de plătitor pe VÂNZĂTOR, singura parte plătibilă, care era
 *     apoi scoasă din pool → nume, IDNO, IBAN, bancă: toate goale în formular;
 *   • ordinea rândurilor din PDF e amestecată (tabelul înaintea antetului, „TOTAL" rupt de cifră) →
 *     suma nu se extrăgea deloc pe calea deterministă, iar modelul citea 23 442 în loc de 23 042.
 *
 * Testul invocă endpoint-ul (CLAUDE.md §3.5.1quater — testăm ACȚIUNEA, nu butonul) pe ambele căi.
 */
import { describe, it, expect, vi } from "vitest";
import { PDFDocument, StandardFonts } from "pdf-lib";

/** Comută între calea deterministă (model indisponibil) și o extragere LLM cu roluri/sumă greșite. */
const state = vi.hoisted(() => ({ mode: "stub" as "stub" | "llm-wrong" }));

vi.mock("../lib/ai/parExtractor", async () => {
  const { parsePartiesFromText } = await import("../lib/par/stubPartyParser");
  return {
    extractParParties: async (text: string) => {
      if (state.mode === "llm-wrong") {
        // Exact ce a întors gpt-4o-mini pe acest document ÎNAINTE de întărirea promptului:
        // singura contraparte etichetată „client" și totalul citit greșit (23 442 în loc de 23 042).
        return {
          parties: [
            {
              name: 'S.C. "Explor Tur" S.R.L.',
              role: "client" as const,
              idno: "1012600013482",
              iban: "MD61VI000000222432697MDL",
              bank: "B.C. VICTORIABANK S.A.",
              bic: "VICBMD2X469",
            },
          ],
          amountCents: 2_344_200,
          amountConfidence: 0.9,
          currency: "MDL" as const,
          scope: "Bilete de avion",
          documentClass: "invoice" as const,
          lineItems: [],
          isStub: false,
        };
      }
      return { ...parsePartiesFromText(text), isStub: true, unavailable: "no_key" as const };
    },
  };
});

vi.mock("../middleware/requireAuth", () => ({
  requireAuth: async (c: { set: (k: string, v: unknown) => void }, next: () => Promise<void>) => {
    c.set("user", { id: "u1", tenantId: "t1", email: "a@b.c" });
    await next();
  },
}));

vi.mock("../middleware/requirePARRole", () => ({
  requirePARRole: () => async (_c: unknown, next: () => Promise<void>) => next(),
}));

// Organizația proprie (ATIC) — plătitorul din document; nu are voie să fie propusă ca beneficiar.
vi.mock("../db/client", () => ({
  db: {
    select: () => ({
      from: () => ({ where: async () => [{ orgLegalName: "Asociatia Nationala a Companiilor din Domeniul TIC" }] }),
    }),
  },
}));

import { parAiPrefillRoutes } from "../routes/parAiPrefill";

/** Rândurile exact în ordinea în care ies din PDF-ul real (tabelul ÎNAINTEA antetului). */
const CONT_DE_PLATA_LINES = [
  "1 Bilet de avion TLLLISTLL, BORDEI VIORICA 11094 1 11094",
  "2 Bilet de avion RMOLISRMO, BORDENIUC VIOLETA 11948 1 11948",
  "23042",
  "Director/Contabil sef ____________ L.S.",
  "TOTAL",
  "Total factura in litere: douazeci si trei de mii patruzeci si doi lei 00 bani",
  "Preturile sunt exprimate in lei moldovenesti. TVA=0%",
  "CONT DE PLATA",
  "nr. 68339 din 25 Aug 2026",
  "PLATITOR:",
  "ATIC",
  'S.C. "Explor Tur" S.R.L.',
  "str. 31 August 1989, 64",
  "Chisinau, MD-2001, R. Moldova",
  "Cod fiscal: 1012600013482",
  "Date Bancare:",
  'B.C."VICTORIABANK"S.A. fil.nr.26 Chisinau,',
  "Cod bancar: VICBMD2X469",
  "Cont: IBAN MD61VI000000222432697MDL",
  "Tel: (+373 22) 844 111",
  "Nr. Denumirea serviciilor Pret unitar Cant. Pret produs",
];

async function contDePlataPdf(): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([842, 842]);
  CONT_DE_PLATA_LINES.forEach((line, i) => {
    page.drawText(line, { x: 30, y: 800 - i * 16, size: 9, font });
  });
  return Buffer.from(await doc.save());
}

async function prefill() {
  const fd = new FormData();
  fd.append(
    "file",
    new File([new Uint8Array(await contDePlataPdf())], "68339_CA_ATIC_25Aug26.pdf", {
      type: "application/pdf",
    }),
  );
  const res = await parAiPrefillRoutes.request("/", { method: "POST", body: fd });
  expect(res.status).toBe(200);
  return (await res.json()) as Record<string, { value: unknown; low_confidence?: boolean }> & {
    needsClarification: boolean;
    parties: Array<{ name: string; role: string }>;
    partyOptions: Array<{ name: string; isPayer: boolean; recommended: boolean }>;
  };
}

describe("POST /api/par/ai-prefill — cont de plată cu vânzătorul în antet și „PLĂTITOR:”", () => {
  it("[blocant] calea deterministă: completează beneficiarul (nu plătitorul) + suma din litere", async () => {
    state.mode = "stub";
    const body = await prefill();

    expect(body.needsClarification).toBe(false);
    expect(String(body.payeeName.value)).toMatch(/Explor Tur/i);
    expect(body.payeeIdno.value).toBe("1012600013482");
    expect(body.payeeIban.value).toBe("MD61VI000000222432697MDL");
    expect(body.payeeBic.value).toBe("VICBMD2X469");
    expect(String(body.payeeBank.value)).toMatch(/VICTORIABANK/i);
    // „TOTAL" e rupt de cifră în PDF; suma vine din „Total factura in litere”.
    expect(body.totalCents.value).toBe(2_304_200);
    expect(body.currency.value).toBe("MDL");
    // Plătitorul e recunoscut ca parte separată și marcat ca atare — niciodată auto-completat.
    expect(body.partyOptions.find((o) => o.name === "ATIC")?.isPayer).toBe(true);
  });

  it("[blocant] calea LLM cu rol greșit și sumă greșită: beneficiarul tot se completează, iar suma e corectată din litere", async () => {
    state.mode = "llm-wrong";
    const body = await prefill();

    // Rolul „client" pe singura contraparte cu IBAN nu mai golește formularul.
    expect(String(body.payeeName.value)).toMatch(/Explor Tur/i);
    expect(body.payeeIban.value).toBe("MD61VI000000222432697MDL");
    expect(body.payeeName.low_confidence).toBe(true); // deducție din rechizite → „de verificat”
    // 23 442 (citit greșit de model) → 23 042, marcat pentru verificare.
    expect(body.totalCents.value).toBe(2_304_200);
    expect(body.totalCents.low_confidence).toBe(true);
  });
});
