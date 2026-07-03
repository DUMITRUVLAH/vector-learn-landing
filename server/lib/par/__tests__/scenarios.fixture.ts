/**
 * The 20 PAR AI-autocomplete scenarios, as a deterministic test fixture.
 * Used by choosePayee.test.ts (no LLM, no API key).
 */

export interface ScenarioExpected {
  payeeName: string;
  payeeIdno: string;
  payeeIban: string;
  payeeType?: "fizic" | "juridic";
  amountCents: number;
  currency: "MDL" | "EUR" | "USD";
  needsClarification: boolean;
  candidateNames: string[];
}

export interface Scenario {
  id: string;
  title: string;
  tenantOrgName: string;
  docText: string;
  expected: ScenarioExpected;
}

export const SCENARIOS: Scenario[] = [
  {
    id: "par-ai-001",
    title: "Contract constatări efective — Beneficiar=client(payer) trap",
    tenantOrgName: "Vector Academy SRL",
    docText: `CONTRACT DE CONSTATĂRI EFECTIVE nr. 2025.02-25
or. Chișinău                                                    25 februarie 2025

ÎNTRE:
SC "Ducont Audit" SRL, denumită în continuare EXECUTOR, înregistrată în Republica Moldova,
cod fiscal (IDNO) 1020600033229, cu sediul în mun. Chișinău, str. Columna 170, reprezentată de
administrator dl. Andrei Ducaru, care acționează în baza statutului,

și

"Vector Academy" SRL (rezident Moldova IT Park), denumită în continuare BENEFICIAR,
cod fiscal (IDNO) 1024600035737, cu sediul în mun. Chișinău, bd. Ștefan cel Mare 202, reprezentată
de administrator dna. Elena Roșca,

au încheiat prezentul contract privind următoarele:

3. PREȚUL ȘI MODALITATEA DE PLATĂ
3.1. Remunerația pentru serviciile prestate este în mărime de 5000 lei (cinci mii lei 00 bani).

4. RECHIZITELE PĂRȚILOR
EXECUTOR: SC "Ducont Audit" SRL
  IDNO 1020600033229
  IBAN: MD50AG000000022516524419
  Banca: BC "MAIB" S.A., suc. Chișinău
  BIC (cod SWIFT): AGRNMD2X

BENEFICIAR: "Vector Academy" SRL
  IDNO 1024600035737
  IBAN: MD87AG000000022516065719
  Banca: BC "MAIB" S.A.`,
    expected: {
      payeeName: "Ducont Audit SRL",
      payeeIdno: "1020600033229",
      payeeIban: "MD50AG000000022516524419",
      amountCents: 500000,
      currency: "MDL",
      payeeType: "juridic",
      needsClarification: false,
      candidateNames: [],
    },
  },
  {
    id: "par-ai-002",
    title: "Factură fiscală RO — furnizorul e beneficiarul plății",
    tenantOrgName: "Vector Academy SRL",
    docText: `FACTURĂ FISCALĂ
Seria AB nr. 0004821                                      Data: 14.03.2025

FURNIZOR (Vânzător):
  "TechSupply Distribution" SRL
  Cod fiscal: 1003600099887
  Cod TVA: 0307421
  Adresa: mun. Chișinău, str. Mihai Viteazul 4
  Cont IBAN: MD50VI000000022511122233
  Banca: BC "Victoriabank" S.A., fil. nr. 3 Chișinău

CUMPĂRĂTOR (Plătitor):
  "Vector Academy" SRL
  Cod fiscal: 1024600035737
  Adresa: mun. Chișinău, bd. Ștefan cel Mare 202

                                       Total fără TVA:      37 500,00
                                       TVA 20%:              7 500,00
                                       TOTAL DE PLATĂ:      45 000,00 lei

Plata se efectuează în contul furnizorului indicat mai sus.`,
    expected: {
      payeeName: "TechSupply Distribution SRL",
      payeeIdno: "1003600099887",
      payeeIban: "MD50VI000000022511122233",
      amountCents: 4500000,
      currency: "MDL",
      payeeType: "juridic",
      needsClarification: false,
      candidateNames: [],
    },
  },
  {
    id: "par-ai-003",
    title: "Contract prestări servicii RU — tenant nementionat, payee by role",
    tenantOrgName: "Vector Academy SRL",
    docText: `ДОГОВОР ОКАЗАНИЯ УСЛУГ № 17/2025
г. Кишинёв                                                  02 апреля 2025 г.

Исполнитель: ООО «Клинсервис Про» (Prestator), IDNO 1015600077665,
  юридический адрес: мун. Кишинёв, ул. Дачия 21,
  в лице директора Сергея Кравцова, действующего на основании устава,

Заказчик: Региональный учебный центр (Beneficiar),
  в лице администратора, действующего на основании доверенности,

2. СТОИМОСТЬ И ПОРЯДОК РАСЧЁТОВ
2.1. Общая стоимость услуг (сумма к оплате) составляет 12 000 леев (двенадцать тысяч леев).

3. РЕКВИЗИТЫ ИСПОЛНИТЕЛЯ
  ООО «Клинсервис Про»
  IDNO: 1015600077665
  IBAN: MD46VB000000025117788990
  Банк: BC «Victoriabank» S.A.
  BIC: VICBMD2X`,
    expected: {
      payeeName: "Клинсервис Про ООО",
      payeeIdno: "1015600077665",
      payeeIban: "MD46VB000000025117788990",
      amountCents: 1200000,
      currency: "MDL",
      payeeType: "juridic",
      needsClarification: false,
      candidateNames: [],
    },
  },
  {
    id: "par-ai-004",
    title: "Contract bilateral colaborare — plată ambiguă",
    tenantOrgName: "",
    docText: `CONTRACT DE COLABORARE nr. 09/2025
or. Bălți                                                      18 aprilie 2025

PARTEA A: Antreprenor "Alfa Construct" SRL, IDNO 1009600044556,
  sediu: mun. Bălți, str. Independenței 12,
  IBAN: MD35AG000000022500111222, Banca: BC "MAIB" S.A.

PARTEA B: Prestator "Beta Logistic" SRL, IDNO 1011600066778,
  sediu: mun. Bălți, str. Ștefan cel Mare 8,
  IBAN: MD87EX000000099912345678, Banca: BC "Eximbank" S.A.

2. DECONTĂRI
2.1. Valoarea totală a serviciilor reciproce este estimată la 80 000 lei.

NOTĂ: prezentul contract-cadru nu stabilește care parte plătește prima.`,
    expected: {
      payeeName: "",
      payeeIdno: "",
      payeeIban: "",
      amountCents: 8000000,
      currency: "MDL",
      payeeType: "juridic",
      needsClarification: true,
      candidateNames: ["Alfa Construct SRL", "Beta Logistic SRL"],
    },
  },
  {
    id: "par-ai-005",
    title: "Ordin de plată RO — IBAN invalid + 13-cifre în slot IBAN",
    tenantOrgName: "Vector Academy SRL",
    docText: `ORDIN DE PLATĂ nr. 312
Data: 22.04.2025

PLĂTITOR (Ordonator):
  "Vector Academy" SRL
  Cod fiscal: 1024600035737
  Cont: MD24AG000000022516065719
  Banca plătitorului: BC "MAIB" S.A.

BENEFICIAR (în favoarea cui se plătește):
  "Lumina Print" SRL
  Cod fiscal: 1018600088990
  IBAN beneficiar: MD51VI000000022511122233
  Banca beneficiarului: BC "Victoriabank" S.A.

SUMA: 7 350,00 lei (șapte mii trei sute cincizeci lei 00 bani)

DESTINAȚIA PLĂȚII: achitare servicii tipar materiale promoționale.

Notă internă scanare OCR: câmp 'IBAN' citit secundar = 1018600088990`,
    expected: {
      payeeName: "Lumina Print SRL",
      payeeIdno: "1018600088990",
      payeeIban: "",
      amountCents: 735000,
      currency: "MDL",
      payeeType: "juridic",
      needsClarification: false,
      candidateNames: [],
    },
  },
  {
    id: "PAR-SCEN-06",
    title: "Russian счёт-фактура — seller is payee",
    tenantOrgName: "A.O. «Centrul Educațional Vector»",
    docText: `ООО «СтройМонтаж-Люкс»
Поставщик (Получатель платежа)
ИДНО (фискальный код): 1014600031245
Код НДС (TVA): 0708912
IBAN: MD80MO2224ASV12345678901
Банк: BC «Moldindconbank» S.A., код банка MOBBMD2X

СЧЁТ-ФАКТУРА № 2041 от 14.06.2026

Плательщик: A.O. «Centrul Educațional Vector», ИДНО 1009600045678

Наименование работ: Ремонт учебного класса №3
Цена без НДС: 18 500,00 лей
НДС 20%: 3 700,00 лей
Итого к оплате (всего): 22 200,00 лей`,
    expected: {
      payeeName: "СтройМонтаж-Люкс ООО",
      payeeIdno: "1014600031245",
      payeeIban: "MD80MO2224ASV12345678901",
      amountCents: 2220000,
      currency: "MDL",
      payeeType: "juridic",
      needsClarification: false,
      candidateNames: [],
    },
  },
  {
    id: "PAR-SCEN-07",
    title: "English invoice — foreign supplier, EUR, German IBAN",
    tenantOrgName: "Centrul Educational Vector A.O.",
    docText: `LinguaTech Solutions GmbH
Supplier / Beneficiary (payee)
Friedrichstraße 120, 10117 Berlin, Germany
VAT ID (USt-IdNr.): DE298765432
Commercial Register: HRB 145982 B

INVOICE No. INV-2026-0455
Date: 12 June 2026

Bill to: Centrul Educational Vector A.O., Chisinau, Moldova

Description: Annual license — adaptive language e-learning platform (50 seats)
Net amount: 3 600.00 EUR
Total due: 3 600.00 EUR

Payment details:
Beneficiary bank: Deutsche Bank AG
IBAN: DE89 3704 0044 0532 0130 00
BIC/SWIFT: DEUTDEFF`,
    expected: {
      payeeName: "LinguaTech Solutions GmbH",
      payeeIdno: "",
      payeeIban: "DE89370400440532013000",
      amountCents: 360000,
      currency: "EUR",
      payeeType: "juridic",
      needsClarification: false,
      candidateNames: [],
    },
  },
  {
    id: "PAR-SCEN-08",
    title: "Contract cu persoană fizică — IDNP, payeeType=fizic",
    tenantOrgName: 'Asociația Obștească „Centrul Educațional Vector"',
    docText: `CONTRACT DE PRESTĂRI SERVICII Nr. 33 din 09.06.2026

Între:
Beneficiar (Plătitor): Asociația Obștească „Centrul Educațional Vector", IDNO 1009600045678, cu sediul în mun. Chișinău,
reprezentată de directorul Andreea Mitran,

și

Prestator: dl. Vasile Cojocaru, cetățean al Republicii Moldova,
IDNP: 2002004112345, domiciliat în or. Strășeni, str. Ștefan cel Mare 12,

Obiectul contractului: prestarea de servicii de instruire muzicală (pian) pentru grupele de copii.

Remunerația: o remunerație în mărime de 9 600,00 lei (nouă mii șase sute lei 00 bani).

Modalitatea de plată: prin transfer pe contul bancar al Prestatorului:
IBAN: MD91ML000002259A19498123
Banca: BC „Maib" S.A.`,
    expected: {
      payeeName: "Vasile Cojocaru",
      payeeIdno: "2002004112345",
      payeeIban: "MD91ML000002259A19498123",
      amountCents: 960000,
      currency: "MDL",
      payeeType: "fizic",
      needsClarification: false,
      candidateNames: [],
    },
  },
  {
    id: "PAR-SCEN-09",
    title: "Receipt/bon — only name + amount, NO IBAN",
    tenantOrgName: "Centrul Educațional Vector",
    docText: `CHITANȚĂ / BON DE PLATĂ
Seria AB Nr. 0091224
Data: 18.06.2026

Am primit de la: Centrul Educațional Vector
Suma de: 450,00 lei
patru sute cincizeci lei 00 bani

Reprezentând: transport materiale didactice (cursă Chișinău–Bălți)

Primit de: Gheorghe Rusu, transportator individual
Tel: 069123456

(bon fără cod fiscal, fără IBAN — plată în numerar)`,
    expected: {
      payeeName: "Gheorghe Rusu",
      payeeIdno: "",
      payeeIban: "",
      amountCents: 45000,
      currency: "MDL",
      payeeType: "fizic",
      needsClarification: false,
      candidateNames: [],
    },
  },
  {
    id: "PAR-SCEN-10",
    title: "Malformed IBAN + two plausible payees → clarify",
    tenantOrgName: "Centrul Educațional Vector A.O.",
    docText: `FACTURĂ FISCALĂ Nr. AA 7781903 din 21.06.2026

Furnizor: SC „TehnoForce" SRL, IDNO 1013600078945
Intermediar logistic: Prestator „Rapid Cargo Express" SRL, IDNO 1015600099112
(mărfurile au fost livrate prin intermediarul de mai sus)

Cumpărător: Centrul Educațional Vector A.O., IDNO 1009600045678

Denumire marfă: 30 buc. table interactive + montaj
Valoare fără TVA: 41 666,67 lei
TVA 20%: 8 333,33 lei
Total de plată: 50 000,00 lei

Rechizite de plată:
IBAN: MD24AG00022510001310416
Banca: BC „Victoriabank" S.A.`,
    expected: {
      payeeName: "",
      payeeIdno: "",
      payeeIban: "",
      amountCents: 5000000,
      currency: "MDL",
      payeeType: "juridic",
      needsClarification: true,
      candidateNames: ['TehnoForce SRL', 'Rapid Cargo Express SRL'],
    },
  },
  {
    id: "PAR-DOC-11",
    title: 'Contract — "Cod fiscal" sinonim IDNO',
    tenantOrgName: 'A.O. "Centrul de Inițiative Comunitare"',
    docText: `CONTRACT DE PRESTĂRI SERVICII Nr. 47/2026

Între:
A.O. "Centrul de Inițiative Comunitare" (Beneficiar), IDNO 1009600012345, cu sediul în mun. Chișinău, str. Vlaicu Pârcălab 48, denumită în continuare BENEFICIAR,

și

Î.I. "Andronic Construct" (Prestator), Cod fiscal 1014000076543, cu sediul în or. Ialoveni, str. Alexandru cel Bun 12, denumită în continuare PRESTATOR,

2. PREȚUL ȘI MODALITATEA DE PLATĂ
2.1. Valoarea totală a lucrărilor constituie 156 000,00 lei (una sută cincizeci și șase mii lei 00 bani), TVA inclus.
2.2. Plata se efectuează prin transfer bancar pe contul Prestatorului:
    Beneficiar plată: Î.I. "Andronic Construct"
    IBAN: MD24AG000225100013104168
    Banca: BC "Moldova-Agroindbank" S.A., fil. Ialoveni`,
    expected: {
      payeeName: 'Andronic Construct',
      payeeIdno: "1014000076543",
      payeeIban: "MD24AG000225100013104168",
      amountCents: 15600000,
      currency: "MDL",
      payeeType: "juridic",
      needsClarification: false,
      candidateNames: [],
    },
  },
  {
    id: "PAR-DOC-12",
    title: 'Act prestare — persoană fizică, "Beneficiar"=clientul NGO',
    tenantOrgName: 'Fundația "Lumina pentru Toți"',
    docText: `ACT DE PREDARE-PRIMIRE A SERVICIILOR
Nr. 8 din 20 iunie 2026

Beneficiarul serviciilor: Fundația "Lumina pentru Toți", IDNO 1003600054321, mun. Bălți, str. Independenței 21.

Prestatorul (persoană fizică): dna Tatiana Mocanu, IDNP 2002400098765, domiciliată în mun. Bălți, str. Ștefan cel Mare 99.

În baza Contractului de prestări servicii din 01.06.2026, prestatorul a executat servicii de traducere.

Remunerarea convenită: 9 850,00 lei (nouă mii opt sute cincizeci lei).
Se achită în contul personal al prestatorului:
    IBAN: MD80MO2224ASV12345678901
    Banca: BC "Moldindconbank" S.A.`,
    expected: {
      payeeName: "Tatiana Mocanu",
      payeeIdno: "2002400098765",
      payeeIban: "MD80MO2224ASV12345678901",
      amountCents: 985000,
      currency: "MDL",
      payeeType: "fizic",
      needsClarification: false,
      candidateNames: [],
    },
  },
  {
    id: "PAR-DOC-13",
    title: "Factură — 13-digit în slot IBAN → route to IDNO",
    tenantOrgName: 'Asociația Obștească "Pas cu Pas"',
    docText: `FACTURĂ FISCALĂ
Seria AAA Nr. 1234567   Data: 15.06.2026

Furnizor: SRL "TehnoServ Grup"
Cod fiscal/IDNO: 1009600012345
Adresa: mun. Chișinău, bd. Dacia 24/3

Cumpărător: Asociația Obștească "Pas cu Pas"
Cod fiscal: 1014000076543
Adresa: mun. Chișinău, str. Mihai Eminescu 7

Denumirea mărfii/serviciului: Licențe software contabilitate (5 utilizatori)
Valoarea totală fără TVA: 125 000,00 lei
TVA 20%: 25 000,00 lei
TOTAL DE PLATĂ: 150 000,00 lei

Rechizite de plată ale furnizorului:
    Cont/IBAN: 1009600012345
    Banca: BC "Victoriabank" S.A.`,
    expected: {
      payeeName: "TehnoServ Grup SRL",
      payeeIdno: "1009600012345",
      payeeIban: "",
      amountCents: 15000000,
      currency: "MDL",
      payeeType: "juridic",
      needsClarification: false,
      candidateNames: [],
    },
  },
  {
    id: "PAR-DOC-14",
    title: 'EUR invoice — "Cod TVA"/VAT ≠ fiscal id',
    tenantOrgName: 'Association "Future Skills Moldova"',
    docText: `INVOICE / FACTURĂ
Invoice No: INV-2026-0091   Date: 18 June 2026

Seller / Vânzător: "BrightMedia Solutions" SRL
IDNO: 1003600054321
Cod TVA / VAT No: 0405123   (VAT registered)
Address: Chișinău, str. Columna 102, Republic of Moldova
IBAN: MD92VI02251000001234567Q
Bank: BC "Victoriabank" S.A.

Bill to / Client: Association "Future Skills Moldova"
IDNO: 2002400098765
Address: Chișinău, str. Bucureşti 60

Description: Video production services for the "Digital Youth" campaign — 3 promotional clips.
Unit price: EUR 48,750.00

Subtotal: EUR 48,750.00
VAT (0% — export of services): EUR 0.00
TOTAL DUE: EUR 48,750.00`,
    expected: {
      payeeName: "BrightMedia Solutions SRL",
      payeeIdno: "1003600054321",
      payeeIban: "MD92VI02251000001234567Q",
      amountCents: 4875000,
      currency: "EUR",
      payeeType: "juridic",
      needsClarification: false,
      candidateNames: [],
    },
  },
  {
    id: "PAR-DOC-15",
    title: "Payment order with TWO real candidates → ask",
    tenantOrgName: "Общественная организация «Открытый Мир»",
    docText: `ПЛАТЁЖНОЕ ПОРУЧЕНИЕ (черновик) № 312 от 22.06.2026

Плательщик: Общественная организация «Открытый Мир» (наш фонд)
IDNO 1009600012345
г. Кишинёв, ул. Измаильская 84

Основание: оплата по проекту «Ремонт учебного центра».

По данному проекту произведены работы двумя организациями:

1) Подрядчик: ООО «СтройМонтаж Плюс»
   Cod fiscal 1014000076543
   IBAN: MD35EX00000000123456789Z
   Банк: BC «Eximbank» S.A.
   Сумма работ: 72 000,00 лей

2) Поставщик материалов: ООО «БазаСтрой»
   Cod fiscal 1003600054321
   IBAN: MD39ML00000ABCDEF1234567
   Банк: BC «maib» S.A.
   Сумма поставки: 53 000,00 лей

ИТОГО к оплате по проекту: 125 000,00 лей.

Примечание бухгалтерии: уточнить, кому именно оформляется заявка — окончательный получатель не указан в шапке.`,
    expected: {
      payeeName: "",
      payeeIdno: "",
      payeeIban: "",
      amountCents: 12500000,
      currency: "MDL",
      payeeType: "juridic",
      needsClarification: true,
      candidateNames: ["СтройМонтаж Плюс ООО", "БазаСтрой ООО"],
    },
  },
  {
    id: "PAR-FIX-16",
    title: "RU proces-verbal — NON-financiar (not_invoice)",
    tenantOrgName: 'Asociația Obștească "Viitorul Copiilor"',
    docText: `ПРОТОКОЛ № 14
заседания правления Общественной организации «Будущее Детей»
г. Кишинёв, ул. Штефан чел Маре 12
Дата: 23 июня 2026 г.   Время: 10:00–11:30

ПОВЕСТКА ДНЯ:
1. Утверждение плана мероприятий на III квартал 2026 г.
2. Подготовка летнего лагеря для детей.

РЕШЕНИЯ:
1. Принять план мероприятий единогласно.
2. Назначить ответственной за лагерь В. Руссу; смету представить на следующем заседании.

Заседание закрыто в 11:30.`,
    expected: {
      payeeName: "",
      payeeIdno: "",
      payeeIban: "",
      amountCents: 0,
      currency: "MDL",
      needsClarification: false,
      candidateNames: [],
    },
  },
  {
    id: "PAR-FIX-17",
    title: "EN consultancy — fuzzy self-match, payer IBAN decoy",
    tenantOrgName: "Viitorul Copiilor A.O.",
    docText: `INVOICE  No. BFC-2026-0094
Date: 19 June 2026   Due: 03 July 2026

Supplier (Bill From):
  Bright Future Consulting LLC
  14 Sycamore Road, Dublin D02 XY45, Ireland
  VAT No. IE 6388047V
  Company Reg. (fiscal code) 1019600045123
  Bank: BC Victoriabank S.A., Chisinau branch
  IBAN: MD51VI02EXEC000011122200

Bill To (Client):
  A.O. "Viitorul Copiilor"  (Future of Children Public Assoc.)
  Stefan cel Mare 12, Chisinau, Moldova
  Fiscal code 1010620007777
  Client settlement account (do NOT pay here): MD45MO225500099988877700 at Maib

Description: Strategic fundraising consultancy, 30 hours @ EUR 80.00
Subtotal: EUR 2,400.00
Total due: EUR 2,400.00`,
    expected: {
      payeeName: "Bright Future Consulting LLC",
      payeeIdno: "1019600045123",
      payeeIban: "MD51VI02EXEC000011122200",
      amountCents: 240000,
      currency: "EUR",
      payeeType: "juridic",
      needsClarification: false,
      candidateNames: [],
    },
  },
  {
    id: "PAR-FIX-18",
    title: "RO factură TOATĂ CU MAJUSCULE — COD FISCAL=IDNO",
    tenantOrgName: "ASOCIAȚIA OBȘTEASCĂ VIITORUL COPIILOR",
    docText: `FACTURĂ FISCALĂ SERIA AA NR. 0042178
DATA: 17 IUNIE 2026

FURNIZOR: SC LINGVO-PLUS SRL
ADRESA: MUN. CHIȘINĂU, STR. ALBA IULIA 75, OF. 4
COD FISCAL: 1003600052891
COD TVA: 0407123
CONT IBAN: MD45MO225500099988877700
BANCA: MAIB, FILIALA CENTRU

CUMPĂRĂTOR: ASOCIAȚIA OBȘTEASCĂ "VIITORUL COPIILOR"
COD FISCAL: 1010620007777
ADRESA: MUN. CHIȘINĂU, BD. ȘTEFAN CEL MARE 12

DENUMIREA SERVICIULUI: ABONAMENT CURS LIMBA ENGLEZĂ, GRUP 10 COPII, IUNIE 2026
CANTITATE: 10   PREȚ UNITAR: 750,00 LEI   VALOARE: 7 500,00 LEI
TVA (NU SE APLICĂ): 0,00 LEI
TOTAL DE PLATĂ: 7 500,00 LEI (ȘAPTE MII CINCI SUTE LEI 00 BANI)`,
    expected: {
      payeeName: "SC LINGVO-PLUS SRL",
      payeeIdno: "1003600052891",
      payeeIban: "MD45MO225500099988877700",
      amountCents: 750000,
      currency: "MDL",
      payeeType: "juridic",
      needsClarification: false,
      candidateNames: [],
    },
  },
  {
    id: "PAR-FIX-19",
    title: "RO bon OCR — IBAN spart pe spații + al doilea IBAN invalid",
    tenantOrgName: "A.O. Viitorul Copiilor",
    docText: `ORDIN  DE  PLATA   nr.  7781
Data  24.06.2026

PLATITOR :  A.O.  Viitorul  Copiilor ,  cod  fiscal  1010620007777

BENEFICIAR :  Întreprinderea  Individuala  "AGRO-TEH  SERVICE"
cod  fiscal :  2 0 0 3 6 0 0 0 7 1 2 3 4
IBAN :  MD50 AG00 0000 0225 1652 4419
Banca  benef. :  BC  Moldova  Agroindbank  S.A.
( cont  vechi ,  inchis ,  a  nu  se  folosi :  MD22 EX00 0000 0500 0123 456 )

Suma :  12 340 ,00  lei
Destinatia  platii :  reparatie  acoperis  sediu`,
    expected: {
      payeeName: 'AGRO-TEH SERVICE',
      payeeIdno: "2003600071234",
      payeeIban: "MD50AG000000022516524419",
      amountCents: 1234000,
      currency: "MDL",
      payeeType: "juridic",
      needsClarification: false,
      candidateNames: [],
    },
  },
  {
    id: "PAR-FIX-20",
    title: "RO/RU tripartit — beneficiar ambiguu → clarify, amount 0",
    tenantOrgName: 'Asociația Obștească "Viitorul Copiilor"',
    docText: `ACORD TRIPARTIT nr. 5 / TRILATERAL AGREEMENT
Chișinău, 20 iunie 2026

ÎNTRE:
(1) BENEFICIAR / Client (cel care comandă și achită lucrarea):
    Asociația Obștească „Viitorul Copiilor", IDNO 1010620007777,
    bd. Ștefan cel Mare 12, Chișinău — denumită în continuare „Clientul".

(2) ANTREPRENOR GENERAL / Подрядчик:
    SC CONSTRUCT-NORD SRL, cod fiscal 1005600033210,
    IBAN MD19ML00CONSTRUCT0042000, Banca: BC Victoriabank S.A.
    — denumită „Antreprenorul".

(3) SUBANTREPRENOR / Субподрядчик:
    ÎI „Termo-Instal Grup", cod fiscal 2007600088990,
    IBAN MD43AG000000001234567890, Banca: Maib
    — denumită „Subantreprenorul".

OBIECTUL: renovarea sălii de festivități a Clientului.
VALOAREA TOTALĂ A LUCRĂRILOR: 184 500,00 lei.

MODALITATEA DE PLATĂ:
  • Clientul achită Antreprenorului 60% (110 700,00 lei) pentru coordonare și materiale.
  • Clientul achită DIRECT Subantreprenorului 40% (73 800,00 lei) pentru lucrările de instalații termice.

Prezenta cerere de plată se referă la o singură tranșă.`,
    expected: {
      payeeName: "",
      payeeIdno: "",
      payeeIban: "",
      amountCents: 0,
      currency: "MDL",
      needsClarification: true,
      candidateNames: ["CONSTRUCT-NORD SRL", "Termo-Instal Grup"],
    },
  },
];
