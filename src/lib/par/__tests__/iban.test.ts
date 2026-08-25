/**
 * @vitest-environment node
 *
 * Regresie pentru bug-ul raportat de owner (2026-08-21): formularul PAR respingea un IBAN
 * estonian PERFECT VALID — `EE162200221068653841`, Swedbank AS, HABAEE2X — cu mesajul
 * „IBAN invalid — format MD + 2 cifre + 20 caractere", și în același timp cerea „IDNP exact
 * 13 cifre" pentru un cod personal estonian de 11 cifre. Plățile pot fi internaționale, deci
 * regula moldovenească nu poate fi regula generală.
 *
 * Testele de mai jos PICĂ pe implementarea veche (regex `^MD\d{2}[A-Z0-9]{20}$`) și trec pe cea
 * nouă (registrul ISO 13616 + mod-97 + cod fiscal per țară).
 */
import { describe, it, expect } from "vitest";
import {
  validateIban,
  isValidIBAN,
  isValidMoldovaIBAN,
  normalizeIban,
  formatIban,
  ibanCountry,
  isValidBic,
  bicCountry,
  bicMatchesIban,
  validateFiscalId,
  isValidIDNP,
  IBAN_LENGTHS,
} from "../iban";

/** IBAN-ul exact din raportul owner-ului. */
const EE_IBAN = "EE162200221068653841";

describe("validateIban — plăți internaționale (regresia din 2026-08-21)", () => {
  it("IBAN-ul estonian din bug report e valid și marcat ca internațional", () => {
    const r = validateIban(EE_IBAN);
    expect(r.ok).toBe(true);
    expect(r.country).toBe("EE");
    expect(r.countryName).toBe("Estonia");
    expect(r.isForeign).toBe(true);
    expect(r.isMoldova).toBe(false);
    expect(r.message).toBeNull();
  });

  it.each([
    ["MD48ML000002259A19498121", "MD"],
    ["RO49AAAA1B31007593840000", "RO"],
    ["DE89370400440532013000", "DE"],
    ["GB82WEST12345698765432", "GB"],
    ["FR1420041010050500013M02606", "FR"],
  ])("acceptă IBAN valid din orice țară: %s", (iban, cc) => {
    const r = validateIban(iban);
    expect(r.ok).toBe(true);
    expect(r.country).toBe(cc);
  });

  it("acceptă IBAN scris cu spații sau liniuțe (copy-paste dintr-o factură)", () => {
    expect(validateIban("EE16 2200 2210 6865 3841").ok).toBe(true);
    expect(validateIban("ee16-2200-2210-6865-3841").ok).toBe(true);
    expect(normalizeIban(" ee16 2200 2210 6865 3841 ")).toBe(EE_IBAN);
  });

  it("lungime greșită pentru țara detectată → mesaj SPECIFIC țării, nu „format MD…”", () => {
    const r = validateIban("EE1622002210686538"); // 18, EE cere 20
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("bad_length");
    expect(r.message).toContain("20");
    expect(r.message).toContain("Estonia");
    expect(r.message).not.toContain("MD");
  });

  it("checksum stricat → respins (o cifră tastată greșit nu trece)", () => {
    const r = validateIban("EE172200221068653841");
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("bad_checksum");
  });

  it("cod de țară inexistent → respins cu motiv clar", () => {
    const r = validateIban("ZZ162200221068653841");
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("unknown_country");
  });

  it("SUA nu are IBAN → codul US nu e în registru (câmpul trebuie să refuze, nu să inventeze)", () => {
    expect(IBAN_LENGTHS.US).toBeUndefined();
    expect(validateIban("US12345678901234567890").ok).toBe(false);
  });

  it("gol → invalid, dar FĂRĂ mesaj de eroare (câmpul necompletat nu e o greșeală)", () => {
    const r = validateIban("");
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("empty");
    expect(r.message).toBeNull();
  });

  it("isValidMoldovaIBAN rămâne strict MD — pentru e-Factura / transfer intern", () => {
    expect(isValidMoldovaIBAN("MD48ML000002259A19498121")).toBe(true);
    expect(isValidMoldovaIBAN(EE_IBAN)).toBe(false);
    expect(isValidIBAN(EE_IBAN)).toBe(true); // ...dar gate-ul general îl acceptă
  });

  it("ibanCountry / formatIban — helpere de afișare", () => {
    expect(ibanCountry(EE_IBAN)).toBe("EE");
    expect(ibanCountry("1234567890")).toBeNull(); // fără 2 litere la început nu e cod de țară
    expect(formatIban(EE_IBAN)).toBe("EE16 2200 2210 6865 3841");
  });
});

describe("isValidBic — ISO 9362", () => {
  it("acceptă 8 și 11 caractere", () => {
    expect(isValidBic("HABAEE2X")).toBe(true);     // din bug report
    expect(isValidBic("MOLDMD2X")).toBe(true);
    expect(isValidBic("DEUTDEFF500")).toBe(true);
  });

  it("respinge lungimi/caractere greșite", () => {
    expect(isValidBic("HABAEE")).toBe(false);
    expect(isValidBic("HABAEE2X1")).toBe(false);
    expect(isValidBic("HAB4EE2X")).toBe(false); // cifră în codul băncii
  });

  it("bicCountry + potrivirea cu țara IBAN-ului", () => {
    expect(bicCountry("HABAEE2X")).toBe("EE");
    expect(bicMatchesIban("HABAEE2X", EE_IBAN)).toBe(true);
    expect(bicMatchesIban("MOLDMD2X", EE_IBAN)).toBe(false);
    // fără una dintre valori nu avem ce compara → nu semnalăm nimic
    expect(bicMatchesIban(null, EE_IBAN)).toBe(true);
  });
});

describe("validateFiscalId — IDNO/IDNP e o regulă MOLDOVENEASCĂ, nu una universală", () => {
  it("MD: 13 cifre → curat, fără mesaj", () => {
    const r = validateFiscalId("2008001007903", { country: "MD" });
    expect(r).toEqual({ ok: true, level: "ok", message: null });
  });

  it("EE: codul personal de 11 cifre din bug report e ACCEPTAT (nu blochează trimiterea)", () => {
    expect(validateFiscalId("48410210022", { country: "EE" }).ok).toBe(true);
    expect(validateFiscalId("48410210022", { country: "EE" }).level).toBe("ok");
  });

  it("un cod străin tastat ÎNAINTE de IBAN (deci cu țara presupusă MD) trece, doar cu avertisment", () => {
    // Owner, 2026-08-21: „IDNO e doar pentru moldoveni, deci poți adăuga orice număr din
    // diferite țări". Nu blocăm niciodată pe format — doar semnalăm.
    const r = validateFiscalId("48410210022", { country: "MD" });
    expect(r.ok).toBe(true);
    expect(r.level).toBe("warning");
    expect(r.message).toContain("13 cifre");
  });

  it("DE / FR: VAT alfanumeric acceptat", () => {
    expect(validateFiscalId("DE123456789", { country: "DE" }).ok).toBe(true);
    expect(validateFiscalId("FR 12 345678901", { country: "FR" }).ok).toBe(true);
    expect(validateFiscalId("GB-123 4567 89", { country: "GB" }).ok).toBe(true);
  });

  it("gol = valid (câmpul e opțional)", () => {
    expect(validateFiscalId("", { country: "MD" }).ok).toBe(true);
    expect(validateFiscalId(null).ok).toBe(true);
  });

  it("gunoi → SINGURUL caz blocant", () => {
    expect(validateFiscalId("!!", { country: "EE" }).ok).toBe(false);
    expect(validateFiscalId("<script>", { country: "MD" }).ok).toBe(false);
  });

  it("isValidIDNP rămâne regula MD strictă (e-Factura o cere)", () => {
    expect(isValidIDNP("2008001007903")).toBe(true);
    expect(isValidIDNP("48410210022")).toBe(false);
  });
});
