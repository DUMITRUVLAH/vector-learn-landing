/**
 * Corpus de tipuri de documente — invarianta „fiecare câmp doar cu info lui" pe forme
 * DIFERITE de act (factură fiscală tipizată MD, invoice EN, акт RU, chitanță, contract cu
 * rechizite pe două coloane, formular PAR cu beneficiar persoană fizică, proformă tabelară,
 * proces-verbal nefinanciar).
 *
 * De ce corpus și nu un singur document: extragerea NU are voie să depindă de tipul actului.
 * Fiecare document nou pe care owner-ul îl semnalează se adaugă aici — suita devine monoton
 * mai puternică și o reparație pentru un format nu poate rupe altul în tăcere.
 */
import { describe, it, expect } from "vitest";

import { parsePartiesFromText } from "../stubPartyParser";
import { choosePayee } from "../choosePayee";

const OWN_ORG = "VECTOR ACADEMY S.R.L.";

const DOCS: Array<{ name: string; text: string; expect: string }> = [
  {
    name: "1. Factură fiscală tipizată MD (documentul owner-ului)",
    expect: "DAIKIRI STUDIO S.R.L. / 17000 MDL",
    text: `FACTURĂ FISCALĂ
НАЛОГОВАЯ НАКЛАДНАЯ
Серия, № EBC000579678
1. Furnizor:
 Поставщик
"DAIKIRI STUDIO" S.R.L., SEC.CENTRU Grenoble nr.159 bl.6 of.12 Cont MD05ML022510000000001296, BC'Moldindconbank'S.A., MOLDMD2X
c.f./ nr.TVA 1024600006236 /
2. Cumpărător/beneficiar:
VECTOR ACADEMY S.R.L., SEC.CENTRU 31 August 1989 nr.78 c.f./ nr.TVA 1024600035737 /
Servicii predare curs "Productie si editare video" serv 1 17000.00 17000,00 - 0,00 17000,00
12. TOTAL (pe factura fiscală) / Всего 17000,00 X 0,00 17000,00 X X X 0,00`,
  },
  {
    name: "2. Invoice internațional EN (layout US/UE)",
    expect: "Northwind Design Ltd / 2400 EUR",
    text: `INVOICE
Invoice No: INV-2026-0042        Date: 12 August 2026

Bill From:
Northwind Design Ltd
14 Kingsway, London WC2B 6LH, United Kingdom
Company Reg 09876543
IBAN: GB29NWBK60161331926819
SWIFT: NWBKGB2L
Bank: NatWest Bank plc

Bill To:
VECTOR ACADEMY S.R.L.
31 August 1989 str. 78, Chisinau, Moldova

Description                          Qty   Unit Price    Amount
Brand identity design package         1     2,400.00     2,400.00

TOTAL DUE: EUR 2,400.00
Payment terms: 14 days`,
  },
  {
    name: "3. Акт выполненных работ (RU)",
    expect: "ООО Клинсервис Про / 45000 MDL",
    text: `АКТ ВЫПОЛНЕННЫХ РАБОТ № 17
от 03 марта 2026 г.

Исполнитель: ООО «Клинсервис Про», мун. Кишинэу, ул. Дачия 24/3
ИДНО 1010600012345
Расчётный счёт MD24AG000225100013104168
Банк: BC "Moldova-Agroindbank" S.A.

Заказчик: VECTOR ACADEMY S.R.L., ИДНО 1024600035737

Наименование работ: Комплексная уборка учебных помещений за февраль 2026 г.

Всего к оплате: 45 000,00 лей`,
  },
  {
    name: "4. Chitanță / bon fiscal (fără IBAN)",
    expect: "receipt, sumă 850",
    text: `CHITANȚĂ Nr. 0041
Data: 18.07.2026

Am primit de la: VECTOR ACADEMY S.R.L.
Prestator: Î.I. "Andronic Construct", cod fiscal 1013600098765
Suma: 850,00 lei
Reprezentând: reparație curentă sală de curs
Semnătura ______`,
  },
  {
    name: "5. Contract de prestări servicii (RO, rechizite la final)",
    expect: "LINGVO-PLUS SRL / 12000 MDL",
    text: `CONTRACT DE PRESTĂRI SERVICII nr. 88
încheiat la 05.02.2026, mun. Chișinău

1. PĂRȚILE
SC "LINGVO-PLUS" SRL, în calitate de Prestator, reprezentată de dl. Vasile Cojocaru
și VECTOR ACADEMY S.R.L., în calitate de Beneficiar

2. OBIECTUL CONTRACTULUI
2.1 Prestatorul se obligă să presteze servicii de traducere autorizată a materialelor didactice.

5. VALOAREA CONTRACTULUI
5.1 Valoarea totală a contractului constituie 12 000,00 lei.

DATELE JURIDICE ȘI BANCARE ALE PĂRȚILOR
PRESTATOR:                              BENEFICIAR:
SC "LINGVO-PLUS" SRL                    VECTOR ACADEMY S.R.L.
Cod fiscal 1009600045678                Cod fiscal 1024600035737
IBAN MD88AG000000002251234567           IBAN MD11VI000000002259876543
Banca: BC "Victoriabank" S.A.           Banca: BC "Moldindconbank" S.A.
mun. Chișinău, str. Alba Iulia 190      mun. Chișinău, str. 31 August 78`,
  },
  {
    name: "6. Formular PAR — beneficiar persoană fizică",
    expect: "Daria Roitman (persoană fizică)",
    text: `PAYMENT ACTION REQUEST (PAR) FORM
Requested By: Ana Munteanu (Programme Officer)

Payment Details
Name, Surname: Daria Roitman
IDNP:
MD48ML000002259A19498121
IBAN:
Bank: BC Moldindconbank S.A.
2008001007903

Purpose: Honorarium for 3 psychological counselling sessions, June 2026
Amount: 7 000,00 MDL

Approved by: Executive Director`,
  },
  {
    name: "7. Proformă / cont de plată (layout tabelar minimal)",
    expect: "MIXBOOK S.R.L. / 3250 MDL",
    text: `CONT DE PLATĂ Nr. 251 din 09.09.2026

Furnizor: S.R.L. "MIXBOOK", IDNO 1015600011223
Adresa: mun. Chișinău, bd. Ștefan cel Mare 132, of. 4
c/d MD87MO2224ASV12345678901 în BC "Mobiasbanca" S.A.

Cumpărător: VECTOR ACADEMY S.R.L.

Nr  Denumirea serviciului              Cant  Preț    Suma
1   Tipar broșuri A5, 500 ex.           1    3250,00 3250,00
                                      Total: 3250,00 lei`,
  },
  {
    name: "8. Document NEFINANCIAR (proces-verbal)",
    expect: "not_invoice, fără beneficiar",
    text: `PROCES-VERBAL nr. 4
al ședinței Consiliului de Administrație din 21.05.2026

Prezenți: 7 membri. Ordinea de zi:
1. Aprobarea planului de studii pentru anul 2026-2027.
2. Diverse.
S-a hotărât: se aprobă planul în unanimitate.
Președinte de ședință: Andrei Rusu`,
  },
];


const IBAN_RE = /\bMD\d{2}[A-Z0-9]{20}\b|\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/;
const FISCAL13_RE = /\b\d{13}\b/;
const ADDRESS_TOKEN_RE = /\b(?:mun|or|sat|str|bd|sec|SEC|nr|bl|of|ap)\.\s*\S/;
const ROLE_LABEL_RE =
  /^(?:Furnizor|Поставщик|Prestator|Исполнитель|Executor|Cump[\u0103a]r[\u0103a]tor|Покупатель|Получатель|Beneficiar|Pl[\u0103a]titor|Плательщик|Заказчик|Supplier|Seller|Buyer|Bill\s)/i;

describe("corpus de documente — puritatea câmpurilor nu depinde de tipul actului", () => {
  for (const d of DOCS) {
    it(`${d.name}: niciun câmp nu conține datele altui câmp`, () => {
      const ext = parsePartiesFromText(d.text);
      for (const p of ext.parties) {
        expect(p.name, `nume: ${p.name}`).not.toMatch(IBAN_RE);
        expect(p.name, `nume: ${p.name}`).not.toMatch(FISCAL13_RE);
        expect(p.name, `nume: ${p.name}`).not.toMatch(ADDRESS_TOKEN_RE);
        expect(p.name, `nume: ${p.name}`).not.toMatch(ROLE_LABEL_RE);
        expect(p.name, `nume: ${p.name}`).not.toMatch(/\bCont\b/i);
        // banca nu ține niciodată un IBAN sau un cod fiscal
        if (p.bank) {
          expect(p.bank, `bancă: ${p.bank}`).not.toMatch(IBAN_RE);
          expect(p.bank, `bancă: ${p.bank}`).not.toMatch(FISCAL13_RE);
        }
      }
    });
  }
});

describe("corpus de documente — extragerea găsește ce e în document", () => {
  const byName = (n: string) => DOCS.find((d) => d.name.startsWith(n))!;
  const run = (n: string) => {
    const d = byName(n);
    const ext = parsePartiesFromText(d.text);
    return { ext, choice: choosePayee({ ...ext, isStub: true }, OWN_ORG) };
  };

  it("1. factura fiscală tipizată MD: beneficiar, sumă, scop", () => {
    const { ext, choice } = run("1.");
    expect(choice.payee?.name).toBe("DAIKIRI STUDIO S.R.L.");
    expect(choice.payee?.iban).toBe("MD05ML022510000000001296");
    expect(choice.payee?.bic).toBe("MOLDMD2X");
    expect(ext.amountCents).toBe(1700000);
    expect(ext.scope).toMatch(/Servicii predare curs/);
  });

  it("2. invoice internațional EN: Bill From = beneficiarul, IBAN străin, EUR", () => {
    const { ext, choice } = run("2.");
    expect(choice.payee?.name).toBe("Northwind Design Ltd");
    expect(choice.payee?.iban).toBe("GB29NWBK60161331926819");
    expect(ext.amountCents).toBe(240000);
    expect(ext.currency).toBe("EUR");
  });

  it("3. акт выполненных работ RU: Исполнитель = beneficiarul", () => {
    const { ext, choice } = run("3.");
    expect(choice.payee?.name).toContain("Клинсервис");
    expect(choice.payee?.idno).toBe("1010600012345");
    expect(ext.amountCents).toBe(4500000);
  });

  it("4. chitanță fără IBAN: clasificată receipt, prestatorul e beneficiarul", () => {
    const { ext, choice } = run("4.");
    expect(ext.documentClass).toBe("receipt");
    expect(choice.payee?.name).toContain("Andronic");
    expect(ext.amountCents).toBe(85000);
  });

  it("5. contract cu rechizite pe două coloane: prestatorul, nu beneficiarul-client", () => {
    const { ext, choice } = run("5.");
    expect(choice.payee?.name).toContain("LINGVO-PLUS");
    expect(choice.payee?.idno).toBe("1009600045678");
    expect(ext.amountCents).toBe(1200000);
  });

  it("6. formular PAR cu beneficiar PERSOANĂ FIZICĂ: nume, IDNP, IBAN, sumă", () => {
    const { ext, choice } = run("6.");
    expect(choice.payee?.name).toBe("Daria Roitman");
    expect(choice.payee?.idno).toBe("2008001007903");
    expect(choice.payee?.iban).toBe("MD48ML000002259A19498121");
    expect(ext.amountCents).toBe(700000);
  });

  it("7. proformă tabelară: forma juridică păstrată, banca fără IBAN lipit", () => {
    const { ext, choice } = run("7.");
    expect(choice.payee?.name).toMatch(/S\.R\.L\..*MIXBOOK|MIXBOOK.*S\.R\.L\./);
    expect(choice.payee?.bank).toContain("Mobiasbanca");
    expect(choice.payee?.bank).not.toMatch(IBAN_RE);
    expect(ext.amountCents).toBe(325000);
  });

  it("8. proces-verbal nefinanciar: not_invoice, niciun beneficiar propus", () => {
    const { ext, choice } = run("8.");
    expect(ext.documentClass).toBe("not_invoice");
    expect(choice.payee).toBeNull();
  });

  it("scope nu e NICIODATĂ un antet de tabel, în nicio limbă", () => {
    for (const d of DOCS) {
      const { scope } = parsePartiesFromText(d.text);
      if (!scope) continue; // null e onest — mai bine gol decât greșit
      expect(scope, `${d.name} → scope: ${scope}`).not.toMatch(
        /codul\s*pozi|tarifare|unit\s*price|\bqty\b|cantitat|unitate\s*de\s*m[\u0103a]sur/i,
      );
    }
  });
});
