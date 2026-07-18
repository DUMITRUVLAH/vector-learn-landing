// @vitest-environment node
/**
 * Regression: a long (multi-page) contract must NOT lose its requisites. The IBAN / cod fiscal /
 * "DATELE JURIDICE" block often sits on page 5-9, far past a naïve slice(0, N) — so the AI never saw
 * the IBAN and the form filled name+amount but no IBAN (owner-reported, BNS Power BI contract).
 * buildAiText keeps the head PLUS windows around the requisite anchors anywhere in the document.
 *
 * Runs in the `node` env (directive above): importing parExtractor transitively constructs the PGlite
 * client; under jsdom pglite's wasm loader rejects with ERR_INVALID_URL_SCHEME after the test (exit≠0).
 */
import { describe, it, expect } from "vitest";
import { buildAiText } from "../parExtractor";

describe("buildAiText — long-document requisite preservation", () => {
  it("keeps the IBAN/cod-fiscal block even when it sits after ~24k chars of boilerplate", () => {
    const head =
      'CONTRACT VA02.06.2026. Prestatorul "Vector Academy" S.R.L c/f 1024600035737, Prestator. ' +
      "Autoritatea contractanta Biroul National de Statistica c/f 1006601000200, Beneficiar. Suma 30 555,00 lei.\n";
    // one giant boilerplate line (mimics PDF text with few newlines) — must NOT eat the budget
    const boiler = "Clauza contractuala standard privind obligatiile partilor, sanctiuni, confidentialitate. ".repeat(300);
    const reqs =
      "\nDATELE JURIDICE SI DE PLATI\nVECTOR ACADEMY SRL Biroul National de Statistica\n" +
      "Cod fiscal 1024600035737 Cod fiscal 1006601000200\n" +
      "IBAN MD87AG000000022516065719 IBAN MD71TRPBAA222600A00189AC";
    const full = head + boiler + reqs;
    expect(full.length).toBeGreaterThan(20000);

    const ai = buildAiText(full);
    // The payee's IBAN survives the truncation:
    expect(ai).toContain("MD87AG000000022516065719");
    // And it stays within budget (head + windows, not the whole 24k blob):
    expect(ai.length).toBeLessThan(15000);
  });

  it("returns the text unchanged when it already fits the budget", () => {
    const small = "Factura. Furnizor ACME SRL IBAN MD24AG000225100013104168. Total 100 lei.";
    expect(buildAiText(small)).toBe(small);
  });
});
