/**
 * DG-105 — catalogul de câmpuri pe care le poate conține un act.
 *
 * De ce grupate pe sursă: un `{{iban}}` singur nu spune al cui e IBAN-ul — al nostru sau al
 * furnizorului. Pe un act de plată, confuzia asta e o plată trimisă greșit, așa că numele câmpului
 * poartă mereu sursa: `contraparte.iban`, `noi.iban`.
 *
 * Rezolvarea efectivă (de unde vine fiecare valoare) e treaba serverului — DG-108. Aici sunt doar
 * numele și etichetele, ca omul care scrie șablonul să nu învețe nicio sintaxă.
 */

/**
 * Notă de vocabular (cerință owner): pe ecran scrie „furnizor / beneficiar", nu „contraparte" —
 * termenul juridic nu spune nimic omului care completează actul. Cheile tehnice rămân
 * `contraparte.*`, altfel toate șabloanele deja scrise ar trebui rescrise.
 */
export interface DocField {
  /** Numele tehnic, exact cum apare în șablon: `{{contraparte.iban}}`. */
  name: string;
  /** Eticheta în română, arătată în editor. */
  label: string;
  /** Un exemplu, ca să se vadă ce fel de valoare va apărea. */
  sample: string;
}

export interface DocFieldGroup {
  key: string;
  label: string;
  hint: string;
  fields: DocField[];
}

export const FIELD_GROUPS: DocFieldGroup[] = [
  {
    key: "noi",
    label: "Organizația noastră",
    hint: "Se completează din datele organizației (plătitorul).",
    fields: [
      { name: "noi.denumire", label: "Denumirea noastră", sample: "Asociația ATIC" },
      { name: "noi.idno", label: "IDNO-ul nostru", sample: "1010600000000" },
      { name: "noi.adresa", label: "Adresa noastră juridică", sample: "mun. Chișinău, str. Ștefan cel Mare 1" },
      { name: "noi.iban", label: "IBAN-ul nostru", sample: "MD24AG000225100013104168" },
      { name: "noi.banca", label: "Banca noastră", sample: "BC Moldova-Agroindbank SA" },
      { name: "noi.administrator", label: "Administratorul nostru", sample: "Irina Oriol" },
    ],
  },
  {
    key: "contraparte",
    label: "Furnizorul / beneficiarul",
    hint: "Se completează din fișa furnizorului — nu se mai retastează nimic.",
    fields: [
      { name: "contraparte.denumire", label: "Denumirea furnizorului", sample: 'SRL "Tehnica Nouă"' },
      { name: "contraparte.idno", label: "Codul fiscal (IDNO/IDNP)", sample: "1234567890123" },
      { name: "contraparte.iban", label: "IBAN furnizor", sample: "MD48ML000002259A19498121" },
      { name: "contraparte.banca", label: "Banca furnizorului", sample: "BC Moldindconbank SA" },
      { name: "contraparte.bic", label: "Cod bancar (BIC/SWIFT)", sample: "MOLDMD2X309" },
      { name: "contraparte.adresa", label: "Adresa juridică", sample: "mun. Chișinău, bd. Dacia 45" },
      { name: "contraparte.administrator", label: "Administratorul furnizorului", sample: "Andrei Rusu" },
      { name: "contraparte.cod_tva", label: "Nr. plătitor TVA", sample: "0301234" },
    ],
  },
  {
    key: "proiect",
    label: "Proiect și eveniment",
    hint: "Din proiectele PAR — apar pe act ca sursă de finanțare.",
    fields: [
      { name: "proiect.nume", label: "Denumirea proiectului", sample: "Digital Skills 2026" },
      { name: "proiect.donator", label: "Donatorul", sample: "USAID" },
      { name: "eveniment.nume", label: "Evenimentul", sample: "Atelier Chișinău, martie" },
    ],
  },
  {
    key: "document",
    label: "Actul în sine",
    hint: "Numărul se rezervă la finalizare, nu la ciornă.",
    fields: [
      { name: "document.numar", label: "Numărul actului", sample: "ACT-2026-0007" },
      { name: "document.data", label: "Data actului", sample: "12.03.2026" },
      { name: "document.loc", label: "Locul întocmirii", sample: "mun. Chișinău" },
      { name: "document.baza", label: "În baza (contractul-sursă)", sample: "contractul nr. 14 din 02.02.2026" },
    ],
  },
  {
    key: "total",
    label: "Sume",
    hint: "Calculate din pozițiile actului, inclusiv suma în litere.",
    fields: [
      { name: "total.suma", label: "Suma totală", sample: "24 500,00" },
      { name: "total.valuta", label: "Valuta", sample: "MDL" },
      { name: "total.in_litere", label: "Suma în litere", sample: "douăzeci și patru de mii cinci sute lei 00 bani" },
    ],
  },
  {
    key: "utilizator",
    label: "Cine întocmește",
    hint: "Persoana logată, la momentul creării actului.",
    fields: [
      { name: "utilizator.nume", label: "Numele întocmitorului", sample: "Ana Contabil" },
      { name: "utilizator.functie", label: "Funcția întocmitorului", sample: "Contabil-șef" },
    ],
  },
];

export const ALL_FIELDS: DocField[] = FIELD_GROUPS.flatMap((g) => g.fields);

/** Fără diacritice și cu minuscule — omul tastează „predator", eticheta scrie „Predător". */
function fold(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/**
 * Caută după etichetă SAU după numele tehnic. Potrivirea se face pe CUVINTE, cu prefix, nu pe
 * subșir brut: cine tastează „cod fiscal" trebuie să găsească „Codul fiscal (IDNO/IDNP)", iar
 * un subșir simplu ar da zero rezultate exact acolo unde omul e cel mai sigur pe el.
 */
export function searchFields(query: string): DocField[] {
  const tokens = fold(query).split(/[\s.]+/).filter(Boolean);
  if (tokens.length === 0) return ALL_FIELDS;
  return ALL_FIELDS.filter((f) => {
    const words = fold(`${f.label} ${f.name}`).split(/[^a-z0-9]+/).filter(Boolean);
    return tokens.every((t) => words.some((w) => w.startsWith(t)));
  });
}

/** Eticheta unui câmp, pentru afișarea cipului. Numele necunoscut se arată ca atare. */
export function fieldLabel(name: string): string {
  return ALL_FIELDS.find((f) => f.name === name)?.label ?? name;
}
