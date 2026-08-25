/**
 * Regression for the owner's 2026-08-25 report: a real signed services contract (CRJM ↔ Vector
 * Academy) prefilled the PAR form wrong in five separate ways. The text below is the shape the
 * PDF actually produces once its line structure is preserved (see pdfText.test.ts — the newlines
 * were being collapsed, which is what let all of this through unnoticed).
 *
 * What was wrong, and is asserted fixed here:
 *  1. amount = 2 224 217 675,00 MDL — the digits of "MD80VI000002224217675MDL" read as money,
 *     because an IBAN ends in a currency code. The real total is 8 000,00 lei, printed as
 *     "MDL 8,000.00 (" — currency BEFORE the number, bracket after, which matched nothing.
 *  2. roles inverted — the payer (CRJM, "Beneficiar") came out `provider` and the payee
 *     (Vector Academy, "Prestator") came out `client`, because in the signature block the
 *     column headers "BENEFICIAR PRESTATOR" sit on one line and nearest-anchor proximity picks
 *     whichever word happens to be closer to the name below.
 *  3. Bancă = "iciară: VictoriaBank S.A. fil. Nr. 17 Codul Băncii: …" — the label
 *     "Banca Beneficiară:" was sliced mid-word, so it no longer looked like a label to strip.
 *  4. Administrator = "Președintelui Ilie" — the role noun was read as part of the name and the
 *     ALL-CAPS surname ("CHIRTOACĂ") was not matched at all.
 *  5. two phantom parties named "Beneficiar" and "Prestator" (the contract's own defined terms),
 *     plus the real payee split into two half-filled entries ("… S.R.L" vs "S.C. … S.R.L.").
 * Also: the BIC printed as "Codul Băncii: VICBMD2X457" was never extracted by this path at all.
 */

import { describe, it, expect } from "vitest";
import { parsePartiesFromText } from "../stubPartyParser";
import { choosePayee } from "../choosePayee";

const SIGNED_SERVICES_CONTRACT = [
  "CONTRACT DE PRESTARE A SERVICIILOR nr. 27-26/ NDF DKK",
  "mun. Chișinău 13 iulie 2026",
  "Părțile contractante",
  "Asociația Obștească „Centrul de Resurse Juridice” (în continuare CRJM), în persoana Președintelui Ilie CHIRTOACĂ, care",
  "acționează în baza Statutului, înregistrată la Ministerul Justiției cu nr. 002704 la 15 noiembrie 2010, cod fiscal",
  "1010620008129, denumită în continuare „Beneficiar”,",
  "și",
  "„Vector Academy” S.R.L în persoana Administratorului, Dumitru VLAH, care acționează în baza statutului, cod fiscal",
  "1024600035737 pe de altă parte, numit în continuare „Prestator”, au convenit asupra încheierii prezentului Contract.",
  "5.3 Remunerarea totală a serviciilor prestate constituie MDL 8,000.00 (opt mii lei, 00 bani), TVA inclus.",
  "Semnăturile părților:",
  "BENEFICIAR PRESTATOR",
  "Asociaţia Obştească „Centrul de Resurse Juridice”",
  "Adresa: str. A.Şciusev 33, MD-2001, mun. Chişinău",
  "Cod fiscal: 1010620008129",
  "Banca Beneficiară: VictoriaBank S.A. fil. Nr. 17",
  "Codul Băncii: VICBMD2X457",
  "Codul IBAN: MD80VI000002224217675MDL",
  "Preşedinte, Ilie CHIRTOACĂ",
  "S.C. „Vector Academy” S.R.L.",
  "Adresa juridică: mun. Chișinău, str. 31 August 1989, 78",
  "Cod fiscal nr. 1024600035737",
  "Banca Beneficiară: BC „Moldova-Agroindbank” S.A.",
  "Codul Băncii: AGRNMD2X",
  "Codul IBAN: MD87AG000000022516065719",
  "Administrator, Dumitru VLAH",
].join("\n");

describe("stubPartyParser — signed MD services contract with a 2-column signature block", () => {
  const ext = parsePartiesFromText(SIGNED_SERVICES_CONTRACT);
  const crjm = ext.parties.find((p) => /Resurse Juridice/i.test(p.name));
  const vector = ext.parties.find((p) => /Vector Academy/i.test(p.name));

  it("reads the printed total, not the digits inside the IBAN", () => {
    expect(ext.amountCents).toBe(800_000);
    expect(ext.currency).toBe("MDL");
  });

  it("names exactly the two real parties — no defined-term phantoms, no split duplicates", () => {
    expect(ext.parties.map((p) => p.name).sort()).toEqual([
      "Centrul de Resurse Juridice",
      "Vector Academy S.R.L",
    ]);
  });

  it("assigns the roles the contract states: Beneficiar pays, Prestator is paid", () => {
    expect(crjm?.role).toBe("client");
    expect(vector?.role).toBe("provider");
  });

  it("keeps each party's requisites in its own, correctly-typed field", () => {
    expect(crjm?.idno).toBe("1010620008129");
    expect(crjm?.iban).toBe("MD80VI000002224217675MDL");
    expect(crjm?.bank).toBe("VictoriaBank S.A. fil. Nr. 17");
    expect(crjm?.bic).toBe("VICBMD2X457");
    // Diacriticele legacy cu sedilă din document (`ş`/`ţ`) sunt normalizate la forma corectă
    // (`ș`/`ț`) la intrarea în parser — vezi normalizeRoDiacritics. Fără normalizare, orice
    // regex scris cu diacritice corecte e orb, în tăcere, pe documentele generate cu fonturi vechi.
    expect(crjm?.legalAddress).toBe("str. A.Șciusev 33, MD-2001, mun. Chișinău");

    expect(vector?.idno).toBe("1024600035737");
    expect(vector?.iban).toBe("MD87AG000000022516065719");
    expect(vector?.bank).toBe("BC „Moldova-Agroindbank” S.A.");
    expect(vector?.bic).toBe("AGRNMD2X");
    expect(vector?.legalAddress).toBe("mun. Chișinău, str. 31 August 1989, 78");
  });

  it("reads the signatory's full name, ALL-CAPS surname included, without the role noun", () => {
    expect(crjm?.administratorName).toBe("Ilie CHIRTOACĂ");
    expect(vector?.administratorName).toBe("Dumitru VLAH");
  });

  it("prefills the counterparty for either side of the contract, with full requisites", () => {
    const forProvider = choosePayee({ ...ext, isStub: true }, "Vector Academy SRL");
    expect(forProvider.needsClarification).toBe(false);
    expect(forProvider.payee?.name).toBe("Centrul de Resurse Juridice");
    expect(forProvider.payee?.iban).toBe("MD80VI000002224217675MDL");
    expect(forProvider.payee?.bank).toBe("VictoriaBank S.A. fil. Nr. 17");
    expect(forProvider.payee?.administratorName).toBe("Ilie CHIRTOACĂ");

    const forClient = choosePayee({ ...ext, isStub: true }, "Asociația Obștească Centrul de Resurse Juridice");
    expect(forClient.needsClarification).toBe(false);
    expect(forClient.payee?.name).toBe("Vector Academy S.R.L");
    expect(forClient.payee?.iban).toBe("MD87AG000000022516065719");
    expect(forClient.payee?.bic).toBe("AGRNMD2X");
  });
});
