/**
 * Regression: a 2-column EXECUTOR | BENEFICIAR requisites table (standard MD contract, flattened by
 * PDF→text so each label repeats per line) must yield two CLEAN parties with their own
 * IBAN/Cod fiscal/Banca. Before the columnar parser, the per-name windowing merged both names and
 * dropped/garbled the requisites → the form filled only the name + scope (owner-reported, 2026-06-28).
 */
import { describe, it, expect } from "vitest";
import { parsePartiesFromText } from "../stubPartyParser";
import { choosePayee } from "../choosePayee";

const TWO_COLUMN_CONTRACT = `CONTRACT DE CONSTATARI EFECTIVE nr. 2025.02-25 din 25.02.2025
Entitatea de audit Ducont Audit SRL, "EXECUTOR", si rezidentul Moldova IT Parc, Vector Academy SRL, "CLIENT".
3.1. Remunerarea se determina in marime de 5000 lei.
EXECUTOR BENEFICIAR
Ducont Audit SRL Vector Academy SRL
Cod fiscal 1020600033229 Cod fiscal 1024600035737
Adresa mun. Chisinau, str. Musatinilor 12/3 Adresa mun. Chisinau, str. 31 August 1989 78
IBAN MD50AG000000022516524419 IBAN MD87AG000000022516065719
Banca BC MAIB S.A. Banca BC MAIB S.A.
BIC AGRNMD2X BIC AGRNMD2X
Administrator Cojocari Maxim Administrator Vlah Dumitru`;

describe("stubPartyParser — 2-column requisites table", () => {
  it("splits the two columns into clean parties with their own requisites", () => {
    const ext = parsePartiesFromText(TWO_COLUMN_CONTRACT);
    const exec = ext.parties.find((p) => p.name === "Ducont Audit SRL");
    const client = ext.parties.find((p) => p.name === "Vector Academy SRL");
    expect(exec).toBeTruthy();
    expect(exec?.idno).toBe("1020600033229");
    expect(exec?.iban).toBe("MD50AG000000022516524419");
    expect(exec?.bank).toBe("BC MAIB S.A.");
    expect(client?.idno).toBe("1024600035737");
    expect(client?.iban).toBe("MD87AG000000022516065719");
    // no phantom "EXECUTOR"/"CLIENT" or merged "Ducont … Vector …" party
    expect(ext.parties.every((p) => !/EXECUTOR|BENEFICIAR/i.test(p.name))).toBe(true);
    expect(ext.parties.length).toBe(2);
  });

  it("choosePayee returns the executor (Ducont) WITH iban/idno/bank, not Vector (self)", () => {
    const ext = parsePartiesFromText(TWO_COLUMN_CONTRACT);
    const c = choosePayee({ ...ext, isStub: true }, "Vector Academy SRL");
    expect(c.payee?.name).toBe("Ducont Audit SRL");
    expect(c.payee?.iban).toBe("MD50AG000000022516524419");
    expect(c.payee?.idno).toBe("1020600033229");
    expect(c.payee?.bank).toBe("BC MAIB S.A.");
  });
});
