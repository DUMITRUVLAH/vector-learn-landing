/**
 * Gruparea părților + conturile multiple (cererea owner-ului, 2026-08-21):
 * „dacă is mai multe rechizite și mai mulți beneficiari sau prestatori, să îi grupezi
 *  și să întrebi care să introducă".
 *
 * Plus regresia care a pornit totul: tipul actului NU mai decide dacă se extrage ceva.
 * Un act de primire-predare (documentClass: "not_invoice") cu rechizite reale trebuie să
 * completeze formularul; înainte era golit din start.
 */
import { describe, it, expect } from "vitest";
import { choosePayee } from "../choosePayee";
import type { ParPartiesExtraction, ParExtractedParty } from "../parPartyTypes";

function ext(
  parties: ParExtractedParty[],
  over: Partial<ParPartiesExtraction> = {},
): ParPartiesExtraction {
  return {
    parties,
    amountCents: 47145,
    amountConfidence: 0.9,
    currency: "EUR",
    scope: "Servicii de comunicare",
    documentClass: "invoice",
    isStub: false,
    ...over,
  };
}

const PRESTATOR: ParExtractedParty = {
  name: "Viorica Bordei",
  role: "provider",
  idno: "4841021002234",
  iban: "MD69ML000000022519094129",
  bank: "BC Moldindconbank S.A.",
};
const CLIENT: ParExtractedParty = {
  name: "Asociatia Nationala a Companiilor din Domeniul TIC",
  role: "client",
  idno: "1006600034927",
};

describe("tipul actului nu mai gateaza extragerea", () => {
  it("[blocant] act de primire-predare (not_invoice) cu sumă + IBAN → beneficiar completat", () => {
    const r = choosePayee(ext([PRESTATOR, CLIENT], { documentClass: "not_invoice" }), null);
    expect(r.payee?.name).toBe("Viorica Bordei");
    expect(r.payee?.iban).toBe("MD69ML000000022519094129");
    expect(r.amountCents).toBe(47145);
  });

  it("[blocant] act fără sumă, dar cu IBAN + cod fiscal → tot completează", () => {
    // Cazul pe care vechea poartă îl golea: documentClass=not_invoice ȘI amount=null.
    const r = choosePayee(
      ext([PRESTATOR, CLIENT], { documentClass: "not_invoice", amountCents: null }),
      null,
    );
    expect(r.payee?.name).toBe("Viorica Bordei");
    expect(r.payee?.iban).toBe("MD69ML000000022519094129");
  });

  it("un act fără NICIO rechizită de plată (proces-verbal) nu propune beneficiar", () => {
    const r = choosePayee(
      ext(
        [
          { name: "Consiliul de administrație", role: "unknown" },
          { name: "Comisia de cenzori", role: "unknown" },
        ],
        { documentClass: null, amountCents: null },
      ),
      null,
    );
    expect(r.payee).toBeNull();
    expect(r.amountCents).toBe(0);
  });
});

describe("gruparea părților", () => {
  it("[blocant] întoarce un grup per parte, cu cea propusă marcată `recommended`", () => {
    const r = choosePayee(ext([PRESTATOR, CLIENT]), null);
    expect(r.options).toHaveLength(2);
    const chosen = r.options.find((o) => o.recommended);
    expect(chosen?.name).toBe("Viorica Bordei");
    expect(chosen?.idno).toBe("4841021002234");
  });

  it("[blocant] plătitorul apare ca grup, marcat `isPayer`, dar niciodată recomandat", () => {
    const r = choosePayee(ext([PRESTATOR, CLIENT]), null);
    const payer = r.options.find((o) => o.name.includes("TIC"));
    expect(payer?.isPayer).toBe(true);
    expect(payer?.recommended).toBe(false);
  });

  it("banca și propria organizație NU apar printre grupuri", () => {
    const r = choosePayee(
      ext([
        PRESTATOR,
        CLIENT,
        { name: "BC Moldindconbank S.A.", role: "bank" },
        { name: "Vector Academy SRL", role: "provider", idno: "1013600012345" },
      ]),
      "Vector Academy SRL",
    );
    const names = r.options.map((o) => o.name);
    expect(names).not.toContain("BC Moldindconbank S.A.");
    expect(names).not.toContain("Vector Academy SRL");
  });

  it("doi prestatori egali → tot se cere alegerea, iar grupurile conțin ambii", () => {
    const r = choosePayee(
      ext([
        { name: "Alfa Construct SRL", role: "provider", idno: "1014000076543", iban: "MD35EX00000000123456789Z" },
        { name: "Beta Materiale SRL", role: "provider", idno: "1003600054321", iban: "MD39ML00000ABCDEF1234567" },
      ]),
      null,
    );
    expect(r.needsClarification).toBe(true);
    expect(r.options.map((o) => o.name).sort()).toEqual(["Alfa Construct SRL", "Beta Materiale SRL"]);
    expect(r.options.every((o) => !o.recommended)).toBe(true);
  });
});

describe("conturi multiple ale aceleiași părți", () => {
  it("[blocant] toate conturile valide sunt păstrate, primul rămâne cel principal", () => {
    const r = choosePayee(
      ext([
        {
          ...PRESTATOR,
          ibans: ["MD69ML000000022519094129", "MD35EX00000000123456789Z"],
        },
      ]),
      null,
    );
    expect(r.payee?.ibans).toEqual([
      "MD69ML000000022519094129",
      "MD35EX00000000123456789Z",
    ]);
    expect(r.payee?.iban).toBe("MD69ML000000022519094129");
  });

  it("conturile invalide și codurile fiscale strecurate în listă sunt eliminate", () => {
    const r = choosePayee(
      ext([
        {
          ...PRESTATOR,
          ibans: ["MD69ML000000022519094129", "MD00INVALID000000000000", "4841021002234"],
        },
      ]),
      null,
    );
    expect(r.payee?.ibans ?? [r.payee?.iban]).toEqual(["MD69ML000000022519094129"]);
  });

  it("un singur cont → nu se expune listă (UI-ul nu întreabă degeaba)", () => {
    const r = choosePayee(ext([PRESTATOR]), null);
    expect(r.payee?.ibans).toBeUndefined();
    expect(r.payee?.iban).toBe("MD69ML000000022519094129");
  });
});
