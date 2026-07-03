/**
 * Unit tests for the stubPartyParser regex primitives + choosePayee helpers.
 */

import { describe, it, expect } from "vitest";
import {
  stripIbanSpaces,
  findIbanCandidates,
  findIdCandidates,
  findVatCandidates,
  parseLocalizedAmount,
  extractAmount,
  cleanName,
} from "../stubPartyParser";
import {
  normalizeIban,
  fuzzyOrgMatch,
  routeIdAndIban,
  roleRank,
} from "../choosePayee";
import type { ParExtractedParty } from "../parPartyTypes";

describe("stripIbanSpaces / normalizeIban", () => {
  it("strips spaces and uppercases", () => {
    expect(stripIbanSpaces("md50 ag00 0000 0225 1652 4419")).toBe("MD50AG000000022516524419");
    expect(normalizeIban("md46 vb00")).toBe("MD46VB00");
    expect(normalizeIban(null)).toBeNull();
    expect(normalizeIban("   ")).toBeNull();
  });
});

describe("findIbanCandidates", () => {
  it("finds MD IBANs (space-broken)", () => {
    const r = findIbanCandidates("IBAN: MD50 AG00 0000 0225 1652 4419 etc");
    expect(r[0].value).toBe("MD50AG000000022516524419");
  });
  it("finds foreign DE IBAN", () => {
    const r = findIbanCandidates("IBAN: DE89 3704 0044 0532 0130 00");
    expect(r.some((x) => x.value === "DE89370400440532013000")).toBe(true);
  });
});

describe("findIdCandidates — 13-digit fiscal id", () => {
  it("labelled cod fiscal", () => {
    const r = findIdCandidates("cod fiscal (IDNO) 1020600033229");
    expect(r[0].value).toBe("1020600033229");
  });
  it("OCR-spaced 13 digits", () => {
    const r = findIdCandidates("cod fiscal: 2 0 0 3 6 0 0 0 7 1 2 3 4");
    expect(r.some((x) => x.value === "2003600071234")).toBe(true);
  });
});

describe("findVatCandidates — kept separate from IDNO", () => {
  it("captures Cod TVA / VAT", () => {
    expect(findVatCandidates("Cod TVA: 0307421")[0].value).toBe("0307421");
    expect(findVatCandidates("VAT ID (USt-IdNr.): DE298765432")[0].value).toBe("DE298765432");
  });
});

describe("parseLocalizedAmount", () => {
  it("RO thousands-space + comma decimal", () => {
    expect(parseLocalizedAmount("45 000,00")).toBe(45000);
  });
  it("EN comma-thousands + dot decimal", () => {
    expect(parseLocalizedAmount("48,750.00")).toBe(48750);
  });
  it("plain integer", () => {
    expect(parseLocalizedAmount("5000")).toBe(5000);
  });
});

describe("extractAmount — currency + total", () => {
  it("RO lei total", () => {
    const r = extractAmount("Total de plată: 45 000,00 lei");
    expect(r.amountCents).toBe(4500000);
    expect(r.currency).toBe("MDL");
  });
  it("EUR total", () => {
    const r = extractAmount("TOTAL DUE: EUR 48,750.00");
    expect(r.amountCents).toBe(4875000);
    expect(r.currency).toBe("EUR");
  });
  it("does not pick a list prefix like '3.1.'", () => {
    const r = extractAmount("3.1. Remunerația ... în mărime de 5000 lei (cinci mii lei 00 bani).");
    expect(r.amountCents).toBe(500000);
  });
});

describe("cleanName", () => {
  it("strips quotes + honorifics", () => {
    expect(cleanName('SC "Ducont Audit" SRL')).toBe("SC Ducont Audit SRL");
    expect(cleanName("dl. Vasile Cojocaru")).toBe("Vasile Cojocaru");
  });
});

describe("fuzzyOrgMatch — self-exclusion", () => {
  it("matches legal-form reorder", () => {
    expect(fuzzyOrgMatch('A.O. "Viitorul Copiilor"', "Viitorul Copiilor A.O.")).toBe(true);
  });
  it("matches uppercase vs mixed-case public assoc", () => {
    expect(
      fuzzyOrgMatch('ASOCIAȚIA OBȘTEASCĂ "VIITORUL COPIILOR"', "ASOCIAȚIA OBȘTEASCĂ VIITORUL COPIILOR"),
    ).toBe(true);
  });
  it("matches with trailing parenthetical resident note", () => {
    expect(fuzzyOrgMatch('"Vector Academy" SRL', "Vector Academy SRL")).toBe(true);
  });
  it("does not match unrelated orgs", () => {
    expect(fuzzyOrgMatch("Ducont Audit SRL", "Vector Academy SRL")).toBe(false);
  });
  it("empty org → never matches", () => {
    expect(fuzzyOrgMatch("Anything SRL", null)).toBe(false);
    expect(fuzzyOrgMatch("Anything SRL", "")).toBe(false);
  });
});

describe("routeIdAndIban — validation & slot routing", () => {
  const p = (over: Partial<ParExtractedParty>): ParExtractedParty => ({
    name: "X",
    role: "provider",
    ...over,
  });

  it("13-digit in IBAN slot → IDNO, IBAN empty", () => {
    const r = routeIdAndIban(p({ iban: "1009600012345" }));
    expect(r.idno).toBe("1009600012345");
    expect(r.iban).toBeNull();
  });

  it("valid MD IBAN kept", () => {
    const r = routeIdAndIban(p({ iban: "MD50AG000000022516524419" }));
    expect(r.iban).toBe("MD50AG000000022516524419");
    expect(r.ibanForeign).toBe(false);
  });

  it("MD format but mod-97 fail → empty + low-conf", () => {
    const r = routeIdAndIban(p({ iban: "MD51VI000000022511122233" }));
    // this value is intentionally mod-97-invalid in scenario par-ai-005
    expect(r.iban).toBeNull();
    expect(r.ibanLowConf).toBe(true);
  });

  it("foreign valid IBAN → kept + flagged foreign", () => {
    const r = routeIdAndIban(p({ iban: "DE89370400440532013000" }));
    expect(r.iban).toBe("DE89370400440532013000");
    expect(r.ibanForeign).toBe(true);
    expect(r.ibanLowConf).toBe(true);
  });

  it("malformed IBAN length → empty", () => {
    const r = routeIdAndIban(p({ iban: "MD24AG00022510001310416" })); // 23 chars
    expect(r.iban).toBeNull();
  });

  it("non-13-digit idno dropped + flagged", () => {
    const r = routeIdAndIban(p({ idno: "12345" }));
    expect(r.idno).toBeNull();
    expect(r.idnoDropped).toBe(true);
  });
});

describe("roleRank", () => {
  it("orders executor < provider < unknown < client < bank", () => {
    expect(roleRank("executor")).toBeLessThan(roleRank("provider"));
    expect(roleRank("provider")).toBeLessThan(roleRank("client"));
    expect(roleRank("client")).toBeLessThan(roleRank("bank"));
  });
});
