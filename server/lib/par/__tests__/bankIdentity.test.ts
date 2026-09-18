/**
 * Banca: când tăcem și când spunem „e altă bancă".
 *
 * Cele 7 „nepotriviri de bancă" măsurate pe 06–16.09.2026 erau, toate, aceeași bancă scrisă
 * altfel — de acolo regula v3, care a scos banca dintre avertismente cu totul. Testele de aici
 * păzesc amândouă capetele: cele 7 rămân tăcute, iar cazul invers (două bănci chiar diferite,
 * cu contul documentului necitit) nu mai trece nevăzut.
 */
import { describe, it, expect } from "vitest";
import { bankFromIban, bankIdentity, bankMismatch } from "../bankIdentity";

describe("bankFromIban", () => {
  it("citește codul băncii din IBAN-ul moldovenesc", () => {
    expect(bankFromIban("MD67ML0000002258A0919582")).toBe("micb");
    expect(bankFromIban("MD87AG000000022516065719")).toBe("maib");
    expect(bankFromIban("MD80VI000002224217675MDL")).toBe("victoriabank");
  });

  it("nu se lasă păcălit de spațiile de pe document", () => {
    expect(bankFromIban("MD 67 ML 0000 0022 58A0 9195 82")).toBe("micb");
  });

  it("tace pe un IBAN străin — codul băncii nu stă pe aceleași poziții", () => {
    expect(bankFromIban("RO49AAAA1B31007593840000")).toBeNull();
    expect(bankFromIban("DE89370400440532013000")).toBeNull();
    expect(bankFromIban(null)).toBeNull();
  });
});

describe("bankIdentity", () => {
  it("recunoaște aceeași bancă sub toate scrierile de pe acte", () => {
    for (const name of ['BC "MOLDINDCONBANK" S.A', "MOLDINDCONBANK", "BC «Moldindconbank» S.A."]) {
      expect(bankIdentity({ name }), name).toBe("micb");
    }
  });

  it("redenumirea nu e o bancă nouă", () => {
    expect(bankIdentity({ name: "Mobiasbanca-OTP Group S.A." })).toBe(bankIdentity({ name: "OTP Bank S.A." }));
  });

  it("contul bate numele — acolo chiar pleacă banii", () => {
    // Cineva a scris în cerere banca greșită peste un IBAN de Moldindconbank.
    expect(bankIdentity({ name: "BC Moldova-Agroindbank S.A.", iban: "MD67ML0000002258A0919582" })).toBe("micb");
  });

  it("BIC-ul cu sufix de filială identifică banca", () => {
    expect(bankIdentity({ bic: "AGRNMD2X885" })).toBe("maib");
  });

  it("două conturi la bănci diferite înseamnă „nu se poate ști”", () => {
    expect(bankIdentity({ iban: "MD67ML0000002258A0919582", ibans: ["MD87AG000000022516065719"] })).toBeNull();
  });

  it("o bancă pe care n-o cunoaștem nu capătă identitate", () => {
    expect(bankIdentity({ name: "Banca Populară din Comrat" })).toBeNull();
    expect(bankIdentity({})).toBeNull();
  });
});

describe("bankMismatch", () => {
  it("prinde două bănci chiar diferite, cu contul documentului necitit", () => {
    // Cazul din 18.09.2026: contractul scria Agroindbank, cererea plătea la Moldindconbank.
    expect(bankMismatch(
      { name: 'BC "Moldindconbank" S.A.', iban: "MD67ML0000002258A0919582" },
      { name: "BC Moldova-Agroindbank S.A." },
    )).toBe(true);
  });

  it("nu acuză aceeași bancă scrisă altfel", () => {
    expect(bankMismatch({ name: 'BC "MOLDINDCONBANK" S.A' }, { name: "Moldindconbank" })).toBe(false);
  });

  it("tace când una dintre bănci nu e cunoscută", () => {
    expect(bankMismatch({ name: "Banca Populară din Comrat" }, { name: "BC Moldova-Agroindbank S.A." })).toBeNull();
    expect(bankMismatch({ name: 'BC "Moldindconbank" S.A.' }, { name: "filiala nr. 17" })).toBeNull();
  });

  it("tace când documentul nu numește nicio bancă — diferența de cont o spune rândul IBAN", () => {
    expect(bankMismatch(
      { name: 'BC "Moldindconbank" S.A.', iban: "MD67ML0000002258A0919582" },
      { name: null, iban: "MD87AG000000022516065719" },
    )).toBeNull();
  });
});
