/**
 * Regulile care au scos zgomotul din reconciliere, fiecare cu cazul real care le-a cerut
 * (producție, documentele din 06–16.09.2026).
 */
import { describe, it, expect } from "vitest";
import { amountIsUnreliable, amountMismatch, comparesAmount, comparesPayee, isVatRatio, ANALYSIS_VERSION } from "../reconcileScope";
import { checkPayerOnDocument } from "../payerOnDocument";
import { cleanPastedIdentityField } from "../fieldSanity";

describe("amountMismatch", () => {
  it("tace când CEREREA n-are sumă completată", () => {
    // PAR-2026-0034: total 0, actul zicea 1136,36 — raportat ca nepotrivire pe o cerere goală.
    expect(amountMismatch(0, 113636)).toBeNull();
    expect(amountMismatch(null, 113636)).toBeNull();
  });

  it("tace când documentul n-a dat nicio sumă", () => {
    expect(amountMismatch(150000, null)).toBeNull();
  });

  it("înghite bănuții pierduți la scanare", () => {
    expect(amountMismatch(34090, 34000)).toBe(false); // 340,90 citit „340,00"
    expect(amountMismatch(430075, 430000)).toBe(false); // 4300,75 citit „4300,00"
  });

  it("raportează o diferență pe care un om ar opri-o", () => {
    expect(amountMismatch(1400000, 7000000)).toBe(true); // 14.000 vs 70.000 lei
    expect(amountMismatch(379500, 84000)).toBe(true);
    expect(amountMismatch(10000, 10100)).toBe(true); // exact pragul de 1 unitate
  });
});

describe("domeniul comparațiilor, pe tipul documentului", () => {
  it("suma se compară doar pe documentele care o declară", () => {
    expect(comparesAmount("invoice")).toBe(true);
    expect(comparesAmount("payment_order")).toBe(true);
    expect(comparesAmount("contract")).toBe(false); // contract-cadru vs plata unei luni
    expect(comparesAmount("other")).toBe(false);
  });

  it("beneficiarul NU se compară pe un decont", () => {
    // PAR-2026-0042: șase chitanțe de card „Mailchimp", rambursate colegei care a plătit.
    // Documentul numește comerciantul, cererea numește persoana rambursată.
    expect(comparesPayee("other")).toBe(false);
    expect(comparesPayee("contract")).toBe(true);
    expect(comparesPayee("invoice")).toBe(true);
  });

  it("versiunea analizei e 3 — verdictele v2 nu mai blochează o semnătură", () => {
    expect(ANALYSIS_VERSION).toBe(3);
  });
});

describe("checkPayerOnDocument", () => {
  const partiesAtic = [
    { name: "ASOCIAȚIA NAȚIONALĂ A COMPANIILOR DIN DOMENIUL TIC", idno: "1006600034927", iban: null },
    { name: "Barbaroș Oxana", idno: "2001007259509", iban: null },
  ];

  it("fără identificator tare pe organizația noastră spune neverificat, nu «altul»", () => {
    // Cazul ATIC pe producție: name = legal_name = „ATIC", idno și iban goale. 17 din cele 59
    // de neconcordanțe veneau de aici, toate false.
    const r = checkPayerOnDocument(
      partiesAtic,
      { name: "ATIC", legalName: "ATIC", aliases: null, idno: null, iban: null },
      { name: "Barbaroș Oxana", idno: "2001007259509" },
      { carriesPayerSide: true }
    );
    expect(r.matches).toBeNull();
    expect(r.found).toBeNull();
  });

  it("cu aliasul completat, recunoaște denumirea juridică de pe act", () => {
    const r = checkPayerOnDocument(
      partiesAtic,
      {
        name: "ATIC",
        legalName: "ATIC",
        aliases: "Asociația Națională a Companiilor din Domeniul TIC",
        idno: null,
        iban: null,
      },
      { name: "Barbaroș Oxana", idno: "2001007259509" },
      { carriesPayerSide: true }
    );
    expect(r.matches).toBe(true);
  });

  it("cu IDNO completat, recunoaște organizația oricum ar fi scrisă", () => {
    const r = checkPayerOnDocument(
      partiesAtic,
      { name: "ATIC", legalName: "ATIC", aliases: null, idno: "1006600034927", iban: null },
      { name: "Barbaroș Oxana", idno: "2001007259509" },
      { carriesPayerSide: true }
    );
    expect(r.matches).toBe(true);
  });

  it("cu IDNO completat și ALTĂ firmă pe document, semnalează — ăsta e rostul verificării", () => {
    const r = checkPayerOnDocument(
      [
        { name: "FIRMA SOŘĂ S.R.L.", idno: "1011600099999", iban: null },
        { name: "Deea House SRL", idno: "1015600012345", iban: null },
      ],
      { name: "ATIC", legalName: "ATIC", aliases: null, idno: "1006600034927", iban: null },
      { name: "Deea House SRL", idno: "1015600012345" },
      { carriesPayerSide: true }
    );
    expect(r.matches).toBe(false);
    expect(r.found).toBe("FIRMA SOŘĂ S.R.L.");
  });

  it("nu întreabă deloc pe un document fără latură plătitoare", () => {
    // Lista de participanți raporta „plătitorul e Mariana Alexei"; chitanța, „plătitorul e Mailchimp".
    const r = checkPayerOnDocument(
      [
        { name: "Mariana Alexei", idno: null, iban: null },
        { name: "Olesea Prodan", idno: null, iban: null },
      ],
      { name: "ATIC", legalName: "ATIC", aliases: null, idno: "1006600034927", iban: null },
      null,
      { carriesPayerSide: false }
    );
    expect(r.matches).toBeNull();
    expect(r.found).toBeNull();
  });
});

describe("cleanPastedIdentityField", () => {
  it("taie o selecție lipită dintr-un PDF la primul rechizit următor", () => {
    // Valoarea reală din `payee_bank` pe producție, cu tot cu eticheta ruptă de la început.
    const raw =
      "iciară: VictoriaBank S.A. fil. Nr. 17 Codul Băncii: VICBMD2X457 Codul IBAN: MD80VI000002224217675MDL Preşedinte, Ilie CHIRTOACĂ S.C.";
    expect(cleanPastedIdentityField(raw, 150)).toBe("VictoriaBank S.A. fil. Nr. 17");
  });

  it("lasă în pace un nume de bancă normal", () => {
    expect(cleanPastedIdentityField('BC "MOLDINDCONBANK" S.A', 150)).toBe('BC "MOLDINDCONBANK" S.A');
    expect(cleanPastedIdentityField("maib", 150)).toBe("maib");
  });

  it("strânge rândurile multiple și golul devine null", () => {
    expect(cleanPastedIdentityField("Deea House\n  SRL", 150)).toBe("Deea House SRL");
    expect(cleanPastedIdentityField("   ", 150)).toBeNull();
    expect(cleanPastedIdentityField(null)).toBeNull();
  });
});

describe("acuzația de plătitor cere dovadă, nu doar absența noastră", () => {
  const noi = { name: "ATIC", legalName: "ATIC", aliases: null, idno: "1006600034927", iban: null };

  it("nu acuză când nicio parte de pe document nu poartă un identificator fiscal", () => {
    // După completarea IDNO-ului organizației, verificarea a început să acuze pe documente unde
    // n-avea ce căuta: „plătitorul e ANA BALAMATU" pe o factură fotografiată. Datele corecte
    // făceau rezultatul MAI prost — semn că regula era greșită, nu datele.
    const r = checkPayerOnDocument(
      [
        { name: "ANA BALAMATU", idno: null, iban: null },
        { name: "DEEA HOUSE S.R.L.", idno: null, iban: null },
      ],
      noi,
      { name: "DEEA HOUSE S.R.L." },
      { carriesPayerSide: true }
    );
    expect(r.matches).toBeNull();
  });

  it("acuză când documentul poartă IDNO-ul altei entități", () => {
    const r = checkPayerOnDocument(
      [
        { name: "FIRMA SORĂ S.R.L.", idno: "1011600099999", iban: null },
        { name: "Deea House SRL", idno: "1015600012345", iban: null },
      ],
      noi,
      { name: "Deea House SRL", idno: "1015600012345" },
      { carriesPayerSide: true }
    );
    expect(r.matches).toBe(false);
    expect(r.found).toBe("FIRMA SORĂ S.R.L.");
  });
});

describe("aceeași sumă, cu TVA și fără, nu e o diferență de bani", () => {
  it("recunoaște cotele de TVA din RM pe cifrele reale de pe facturi", () => {
    // EBL000116890: rândul TOTAL al facturii fiscale are 3148,15 | 251,85 | 3400,00. Cererea
    // poartă totalul cu TVA, extractorul a luat coloana fără TVA — aceeași factură, nu o diferență.
    expect(isVatRatio(340000, 314815)).toBe(true); // cota 8%
    expect(isVatRatio(379500, 351390)).toBe(true); // 3795,00 / 3513,90, tot 8%
    expect(isVatRatio(120000, 100000)).toBe(true); // cota standard 20%
    expect(amountMismatch(340000, 314815)).toBe(false);
  });

  it("nu înghite diferențele reale", () => {
    // Cele trei rămase după reparații, toate confirmate pe document ca fiind adevărate.
    expect(isVatRatio(1400000, 7000000)).toBe(false); // 14.000 cerere vs 70.000 pe factura de audit
    expect(isVatRatio(209475, 2576487)).toBe(false); // 2094,75 vs ordinul de plată de 25.764,87
    expect(amountMismatch(1400000, 7000000)).toBe(true);
    expect(amountMismatch(150000, 2576487)).toBe(true);
  });
});

describe("suma care nu se împacă cu rândurile documentului", () => {
  // Factura Deea House (PAR-2026-0046), fotografiată: 6 articole, total 3795,00.
  const deeaHouse = [
    { quantity: 20, unitPriceCents: 4200 }, // 840,00
    { quantity: 20, unitPriceCents: 4200 }, // 840,00
    { quantity: 15, unitPriceCents: 2100 }, // 315,00
    { quantity: 40, unitPriceCents: 2200 }, // 880,00
    { quantity: 20, unitPriceCents: 2300 }, // 460,00
    { quantity: 20, unitPriceCents: 2300 }, // 460,00
  ];

  it("prinde toate variantele pe care extractorul le-a citit greșit din aceeași poză", () => {
    expect(amountIsUnreliable(84000, deeaHouse)).toBe(true); // valoarea unui rând
    expect(amountIsUnreliable(77778, deeaHouse)).toBe(true); // alt rând, fără TVA
    expect(amountIsUnreliable(777700, deeaHouse)).toBe(true); // cifră stricată la citire
  });

  it("nu atinge totalul corect, nici varianta lui fără TVA", () => {
    expect(amountIsUnreliable(379500, deeaHouse)).toBe(false);
    expect(amountIsUnreliable(351390, deeaHouse)).toBe(false); // 3795 fără TVA de 8%
  });

  it("nu se aplică unde diferențele reale chiar apar", () => {
    // EBH000518484: un singur articol de 70.000 — diferența față de cererea de 14.000 e reală
    // și trebuie să rămână vizibilă. La fel ordinele de plată, care n-au tabel de articole.
    expect(amountIsUnreliable(7000000, [{ quantity: 1, unitPriceCents: 7000000 }])).toBe(false);
    expect(amountIsUnreliable(657400, undefined)).toBe(false);
    expect(amountIsUnreliable(657400, [])).toBe(false);
    expect(amountIsUnreliable(null, deeaHouse)).toBe(false);
  });
});

/**
 * Regula „o acuzație cere dovadă", aplicată și la beneficiar (producție, 17.09.2026).
 *
 * Pe factura fiscală Moldcell — unde rubrica 1 scrie „MOLDCELL S.A., c.f. 1002600046027", exact
 * codul din cerere — extractorul a întors o SINGURĂ parte: „Carolina Bugaian", semnatara de la
 * rubrica 14. Furnizorul și cumpărătorul n-au fost extrase deloc. Din asta a ieșit „beneficiarul
 * e altul" pe patru cereri corecte.
 *
 * Condiția trăiește în `analyzeAttachmentAgainstPar`; aici e fixată ca regulă, ca să nu se piardă.
 */
describe("beneficiarul se acuză doar dacă documentul a fost chiar citit", () => {
  const hasEvidence = (
    payee: { idno?: string | null; iban?: string | null } | null,
    par: { payeeIdnp: string | null; payeeIban: string | null },
    partyCount: number
  ) => !!payee?.idno || !!payee?.iban || (!par.payeeIdnp && !par.payeeIban) || partyCount >= 2;

  const cerereCuIdno = { payeeIdnp: "1002600046027", payeeIban: null };

  it("un singur nume gol, când cererea știe IDNO-ul, nu e dovadă", () => {
    expect(hasEvidence({ idno: null, iban: null }, cerereCuIdno, 1)).toBe(false);
  });

  it("dovadă e un identificator pe partea găsită…", () => {
    expect(hasEvidence({ idno: "1014600006741", iban: null }, cerereCuIdno, 1)).toBe(true);
    expect(hasEvidence({ idno: null, iban: "MD03MO2224ASV71447007100" }, cerereCuIdno, 1)).toBe(true);
  });

  it("…sau un document cu structură de părți, chiar fără rechizite", () => {
    expect(hasEvidence({ idno: null, iban: null }, cerereCuIdno, 2)).toBe(true);
  });

  it("când nici cererea n-are identificator, numele e tot ce avem — și rămâne verificat", () => {
    expect(hasEvidence({ idno: null, iban: null }, { payeeIdnp: null, payeeIban: null }, 1)).toBe(true);
  });
});
