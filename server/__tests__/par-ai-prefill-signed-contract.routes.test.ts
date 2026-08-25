/**
 * @vitest-environment node
 *
 * PAR AI prefill on the REAL route, with the LLM unavailable — i.e. the deterministic stub path,
 * which is what every user hits while the model has no credit (and what produced the owner's
 * 2026-08-25 report: a signed services contract came back with the bank field garbled, the
 * administrator truncated to a role noun, no BIC, and phantom "Beneficiar"/"Prestator" payees).
 *
 * Invokes the endpoint with a real PDF and asserts the RESPONSE the form is filled from
 * (CLAUDE.md §3.5.1quater — test the action, not the affordance).
 */
import { describe, it, expect, vi } from "vitest";
import { PDFDocument, StandardFonts } from "pdf-lib";

// The model is deliberately NOT mocked away: it reports itself unavailable, so the route falls
// back to the regex stub — the exact production condition being reproduced.
vi.mock("../lib/ai/parExtractor", async () => {
  const { parsePartiesFromText } = await import("../lib/par/stubPartyParser");
  return {
    extractParParties: async (text: string) => ({
      ...parsePartiesFromText(text),
      isStub: true,
      unavailable: "no_key" as const,
    }),
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

vi.mock("../db/client", () => ({
  db: {
    select: () => ({ from: () => ({ where: async () => [{ orgLegalName: "Vector Academy SRL" }] }) }),
  },
}));

import { parAiPrefillRoutes } from "../routes/parAiPrefill";

const CONTRACT_LINES = [
  "CONTRACT DE PRESTARE A SERVICIILOR nr. 27-26/ NDF DKK",
  "Partile contractante",
  "Asociatia Obsteasca „Centrul de Resurse Juridice” (in continuare CRJM), in persoana Presedintelui Ilie CHIRTOACA,",
  "cod fiscal 1010620008129, denumita in continuare „Beneficiar”,",
  "si „Vector Academy” S.R.L in persoana Administratorului, Dumitru VLAH, cod fiscal 1024600035737,",
  "numit in continuare „Prestator”, au convenit asupra incheierii prezentului Contract.",
  "5.3 Remunerarea totala a serviciilor prestate constituie MDL 8,000.00 (opt mii lei, 00 bani), TVA inclus.",
  "Semnaturile partilor:",
  "BENEFICIAR PRESTATOR",
  "Asociatia Obsteasca „Centrul de Resurse Juridice”",
  "Adresa: str. A.Sciusev 33, MD-2001, mun. Chisinau",
  "Cod fiscal: 1010620008129",
  "Banca Beneficiara: VictoriaBank S.A. fil. Nr. 17",
  "Codul Bancii: VICBMD2X457",
  "Codul IBAN: MD80VI000002224217675MDL",
  "Presedinte, Ilie CHIRTOACA",
  "S.C. „Vector Academy” S.R.L.",
  "Adresa juridica: mun. Chisinau, str. 31 August 1989, 78",
  "Cod fiscal nr. 1024600035737",
  "Banca Beneficiara: BC Moldova-Agroindbank S.A.",
  "Codul Bancii: AGRNMD2X",
  "Codul IBAN: MD87AG000000022516065719",
  "Administrator, Dumitru VLAH",
];

async function contractPdf(): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([842, 842]);
  CONTRACT_LINES.forEach((line, i) => {
    page.drawText(line, { x: 30, y: 800 - i * 16, size: 9, font });
  });
  return Buffer.from(await doc.save());
}

describe("POST /api/par/ai-prefill — signed services contract, stub (no-model) path", () => {
  it("[blocant] fills the counterparty's requisites correctly, each in its own field", async () => {
    const fd = new FormData();
    fd.append("file", new File([new Uint8Array(await contractPdf())], "contract.pdf", { type: "application/pdf" }));
    const res = await parAiPrefillRoutes.request("/", { method: "POST", body: fd });
    expect(res.status).toBe(200);

    const body = (await res.json()) as Record<string, { value: unknown }> & {
      needsClarification: boolean;
      parties: Array<{ name: string; role: string }>;
    };

    // The tenant is the Prestator, so the payee is the other side of the contract.
    expect(body.needsClarification).toBe(false);
    expect(body.payeeName.value).toBe("Centrul de Resurse Juridice");
    expect(body.payeeIdno.value).toBe("1010620008129");
    expect(body.payeeIban.value).toBe("MD80VI000002224217675MDL");
    // Was "iciara: VictoriaBank S.A. fil. Nr. 17 Codul Bancii: VICBMD2X457 Codul".
    expect(body.payeeBank.value).toBe("VictoriaBank S.A. fil. Nr. 17");
    // Was always empty — the stub never extracted a BIC at all.
    expect(body.payeeBic.value).toBe("VICBMD2X457");
    // Was "Presedintelui Ilie" (role noun kept, CAPS surname dropped).
    expect(body.payeeAdministrator.value).toBe("Ilie CHIRTOACA");
    expect(body.payeeLegalAddress.value).toBe("str. A.Sciusev 33, MD-2001, mun. Chisinau");
    // Was 222 421 767 500 — the digits of the IBAN read as an amount.
    expect(body.totalCents.value).toBe(800_000);
    expect(body.currency.value).toBe("MDL");
    // Neither the contract's own defined terms nor a split duplicate of a party.
    expect(body.parties.map((p) => p.name).sort()).toEqual([
      "Centrul de Resurse Juridice",
      "Vector Academy S.R.L",
    ]);
  });
});
