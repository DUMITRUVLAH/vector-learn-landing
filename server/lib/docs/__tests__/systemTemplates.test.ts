/**
 * @vitest-environment node
 * ȘABLOANELE LIVRATE CU PRODUSUL — garda de calitate.
 *
 * De ce există testul: prima versiune a bibliotecii avea acte de 6–8 rânduri (părțile, o frază
 * despre obiect, semnăturile). Arătau a schiță, nu a act: un contract fără clauză de plată, de
 * răspundere sau de protecție a datelor nu se poate duce la semnat, așa că omul îl rescria în
 * Word — adică exact munca pe care produsul promitea s-o înlăture. Testul apără pragul de jos:
 * nimeni nu mai poate livra din greșeală un „contract" de cinci rânduri.
 *
 * Nu verifică stilul (asta e treaba juristului organizației), ci prezența pieselor fără de care
 * un act e inutilizabil, plus disciplina tehnică: HTML curat, câmpuri din catalog, tabelul
 * pozițiilor acolo unde actul are obiect.
 */
import { describe, it, expect } from "vitest";
import { SYSTEM_TEMPLATES } from "../systemTemplates";
import { sanitizeTemplateHtml } from "../sanitizeHtml";
import { LINES_TABLE_TOKEN } from "../linesTable";
import { unresolvedFields } from "../blanks";

/** Câmpurile pe care le știe rezolva `fieldResolver.ts`, plus cele care ies intenționat ca rând
 *  de completat cu pixul (numele administratorului nostru, contul nostru — nu sunt în registru). */
const KNOWN_FIELDS = new Set([
  "noi.denumire", "noi.idno", "noi.adresa", "noi.administrator", "noi.iban", "noi.banca",
  "contraparte.denumire", "contraparte.idno", "contraparte.adresa", "contraparte.iban",
  "contraparte.banca", "contraparte.bic", "contraparte.administrator", "contraparte.cod_tva",
  "document.numar", "document.data", "document.loc", "document.baza",
  "total.suma", "total.valuta", "total.in_litere",
  "proiect.nume", "proiect.donator", "eveniment.nume",
  "utilizator.nume", "utilizator.functie",
  "tabel.pozitii",
]);

/** Actele care POARTĂ un obiect (bunuri, servicii, poziții) au nevoie de tabelul pozițiilor. */
const NEEDS_LINES = SYSTEM_TEMPLATES.map((t) => t.name);

describe("Biblioteca de șabloane livrate cu produsul", () => {
  it("[blocant] are toate tipurile de act pe care se sprijină produsul", () => {
    const kinds = new Set(SYSTEM_TEMPLATES.map((t) => t.kind));
    for (const kind of ["act_primire_predare", "contract_servicii", "contract_vanzare", "act_aditional", "proces_verbal", "oferta_comerciala"]) {
      expect(kinds, `lipsește tipul ${kind}`).toContain(kind);
    }
    // Numele sunt cheia după care se împrospătează șabloanele existente (docs.ts): două șabloane
    // cu același nume ar face actualizarea nedeterministă.
    const names = SYSTEM_TEMPLATES.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("[blocant] niciun act nu mai e o schiță de cinci rânduri", () => {
    for (const t of SYSTEM_TEMPLATES) {
      const text = t.bodyHtml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      // Pragul e ales pe cel mai scurt act care are totuși sens (un ordin intern), nu pe media
      // contractelor: nu cerem tuturor actelor să fie lungi, doar să nu fie goale.
      expect(text.length, `„${t.name}" are doar ${text.length} caractere de text`).toBeGreaterThan(600);
    }
  });

  it("[blocant] contractele au clauzele fără de care nu se pot semna", () => {
    const contracts = SYSTEM_TEMPLATES.filter((t) => t.kind.startsWith("contract"));
    expect(contracts.length).toBeGreaterThanOrEqual(3);
    for (const t of contracts) {
      const body = t.bodyHtml.toLowerCase();
      for (const [what, needle] of [
        ["obiectul", "obiectul contractului"],
        ["prețul", "plat"],
        ["penalitatea de întârziere", "0,1%"],
        ["forța majoră", "forț"],
        ["datele cu caracter personal", "133/2011"],
        ["litigiile", "litigi"],
        ["rechizitele și semnăturile", "semnătur"],
      ]) {
        expect(body, `„${t.name}" nu are ${what}`).toContain(needle);
      }
    }
  });

  it("[blocant] actele de predare spun cine predă, cine primește și ce se întâmplă cu riscul", () => {
    const acts = SYSTEM_TEMPLATES.filter((t) => t.kind === "act_primire_predare");
    for (const t of acts) {
      const body = t.bodyHtml.toLowerCase();
      expect(body).toContain("predător");
      expect(body).toContain("primitor");
      expect(body).toContain("exemplare");
      // Viciile ascunse: fără termen scris, actul semnat închide orice reclamație ulterioară.
      expect(body).toContain("vicii");
    }
  });

  it("[blocant] actele cu obiect poartă tabelul pozițiilor", () => {
    for (const t of SYSTEM_TEMPLATES) {
      if (!NEEDS_LINES.includes(t.name)) continue;
      expect(t.bodyHtml, `„${t.name}" nu are ${LINES_TABLE_TOKEN}`).toContain(LINES_TABLE_TOKEN);
    }
  });

  it("[blocant] nu cer câmpuri pe care sistemul nu le cunoaște", () => {
    for (const t of SYSTEM_TEMPLATES) {
      for (const field of unresolvedFields(t.bodyHtml)) {
        expect(KNOWN_FIELDS, `„${t.name}" cere câmpul necunoscut {{${field}}}`).toContain(field);
      }
    }
  });

  it("[blocant] trec neatinse prin curățarea de HTML — altfel actul arată altfel decât șablonul", () => {
    for (const t of SYSTEM_TEMPLATES) {
      const cleaned = sanitizeTemplateHtml(t.bodyHtml);
      // Curățarea normalizează spațiile; comparăm textul vizibil, nu octeții.
      const visible = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      expect(visible(cleaned), `„${t.name}" pierde text la curățare`).toBe(visible(t.bodyHtml));
    }
  });
});
