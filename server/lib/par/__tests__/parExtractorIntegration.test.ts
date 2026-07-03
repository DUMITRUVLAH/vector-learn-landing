/**
 * Integration smoke for the PAR multi-party pipeline WITHOUT an API key.
 *
 * 1. `normalizeParExtraction` (the LLM-JSON path) → choosePayee → resolved/ambiguous result shape.
 * 2. `extractParParties` with `callAi` mocked to a STUB → delegates to the regex parser and
 *    produces isStub:true with the right parties (no DB, no API key).
 *
 * The 20-scenario gate (choosePayee.test.ts) covers the regex parser exhaustively; this file
 * proves the extractor wrapper wiring (JSON parse, ×100 cents, stub delegation).
 *
 * @vitest-environment node
 */
import { describe, it, expect, vi } from "vitest";

// Mock the AI client so no DB / no API key is touched.
vi.mock("../../ai/client", () => ({
  callAi: vi.fn(),
}));

import { callAi } from "../../ai/client";
import {
  extractParParties,
  normalizeParExtraction,
} from "../../ai/parExtractor";
import { choosePayee } from "../choosePayee";

const mockCallAi = vi.mocked(callAi);

describe("normalizeParExtraction (LLM JSON path)", () => {
  it("normalizes parties + ×100 cents + currency/class, then choosePayee resolves by role", () => {
    const json = {
      parties: [
        {
          name: "Ducont Audit SRL",
          role: "executor",
          idno: "1020600033229",
          iban: "MD50AG000000022516524419",
          bank: "BC MAIB S.A.",
        },
        {
          name: "Vector Academy SRL",
          role: "client",
          idno: "1024600035737",
          iban: "MD87AG000000022516065719",
        },
      ],
      amount: { value: 5000, confidence: 0.9 },
      currency: "MDL",
      scope: { value: "servicii audit", confidence: 0.7 },
      document_class: { value: "invoice", confidence: 0.9, reason: "Factură" },
    };
    const ext = normalizeParExtraction(json);
    expect(ext.isStub).toBe(false);
    expect(ext.parties).toHaveLength(2);
    expect(ext.amountCents).toBe(500000); // ×100
    expect(ext.currency).toBe("MDL");
    expect(ext.documentClass).toBe("invoice");

    const choice = choosePayee(ext, "Vector Academy SRL");
    expect(choice.needsClarification).toBe(false);
    expect(choice.payee?.name).toMatch(/Ducont Audit/);
    expect(choice.payee?.iban).toBe("MD50AG000000022516524419");
  });

  it("drops empty-name parties and invalid enums", () => {
    const ext = normalizeParExtraction({
      parties: [{ name: "", role: "provider" }, { name: "Real SRL", role: "weird" }],
      amount: { value: null },
      currency: "GBP",
      document_class: { value: "nonsense" },
    });
    expect(ext.parties).toHaveLength(1);
    expect(ext.parties[0].role).toBe("unknown");
    expect(ext.amountCents).toBeNull();
    expect(ext.currency).toBeNull();
    expect(ext.documentClass).toBeNull();
  });
});

describe("extractParParties — stub delegation (callAi mocked)", () => {
  it("delegates to the regex parser when callAi returns a stub", async () => {
    mockCallAi.mockResolvedValue({
      text: "",
      isStub: true,
      auditId: "x",
      model: "stub",
      promptTokens: 0,
      completionTokens: 0,
    });

    const doc = `Furnizor (Vânzător): "TechSupply Distribution" SRL
Cod fiscal: 1003600099887
Cont IBAN: MD50VI000000022511122233
Banca: BC "Victoriabank" S.A.
Cumpărător (Plătitor): "Vector Academy" SRL
TOTAL DE PLATĂ: 45 000,00 lei`;

    const ext = await extractParParties(doc, {
      tenantId: "t",
      prefillId: "p",
    });
    expect(ext.isStub).toBe(true);
    const choice = choosePayee(ext, "Vector Academy SRL");
    expect(choice.payee?.name).toMatch(/TechSupply/);
    expect(choice.amountCents).toBe(4500000);
  });

  it("parses model JSON when callAi returns text", async () => {
    mockCallAi.mockResolvedValue({
      text:
        '```json\n{"parties":[{"name":"Lumina Print SRL","role":"provider","idno":"1018600088990","iban":"MD51VI000000022511122233"}],"amount":{"value":73.5},"currency":"MDL","document_class":{"value":"invoice"}}\n```',
      isStub: false,
      auditId: "x",
      model: "m",
      promptTokens: 1,
      completionTokens: 1,
    });
    const ext = await extractParParties("irrelevant", { tenantId: "t", prefillId: "p" });
    expect(ext.isStub).toBe(false);
    expect(ext.parties[0].name).toBe("Lumina Print SRL");
    expect(ext.amountCents).toBe(7350);
  });
});
