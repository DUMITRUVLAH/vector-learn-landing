/**
 * Corpus de documente PAR — date SALVATE, încărcate de pe disc.
 *
 * Fiecare document trăiește în `fixtures/documents/` ca pereche `<slug>.txt` (textul, exact
 * cum iese din PDF) + `<slug>.json` (ce trebuie extras din el). Testul de mai jos le descoperă
 * singur: ca să adaugi un document nou NU atingi acest fișier, doar pui perechea în folder
 * (`npm run par:extract -- <fișier> --save <slug>` o creează).
 *
 * De ce corpus și nu un singur document: extragerea NU are voie să depindă de tipul actului.
 * Documentele reale ale owner-ului au prins, pe rând, exact ce ratau fixture-urile sintetice —
 * rânduri tăiate ciudat de PDF, diacritice legacy cu sedilă, etichete bilingve fără „:”.
 *
 * Vezi `fixtures/documents/README.md`.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, it, expect } from "vitest";

import { parsePartiesFromText } from "../stubPartyParser";
import { choosePayee } from "../choosePayee";

const OWN_ORG = "VECTOR ACADEMY S.R.L.";
const DIR = join(__dirname, "fixtures", "documents");

interface Expectations {
  payeeName?: string;
  payeeNameContains?: string;
  payeeNameMatches?: string;
  payeeIdno?: string | null;
  payeeIban?: string | null;
  payeeBic?: string | null;
  payeeAdministrator?: string | null;
  payeeBankContains?: string;
  payeeBankNotContains?: string;
  payeeLegalAddressContains?: string;
  payeeIsNull?: boolean;
  amountCents?: number | null;
  currency?: string | null;
  scopeMatches?: string;
  documentClass?: string;
  needsClarification?: boolean;
}

interface Fixture {
  slug: string;
  name: string;
  sursa?: string;
  deCeConteaza?: string;
  asteptari: Expectations;
  text: string;
}

function loadFixtures(): Fixture[] {
  const out: Fixture[] = [];
  for (const f of readdirSync(DIR).filter((x) => x.endsWith(".json")).sort()) {
    const slug = f.replace(/\.json$/, "");
    const meta = JSON.parse(readFileSync(join(DIR, f), "utf8")) as Omit<Fixture, "slug" | "text">;
    out.push({ ...meta, slug, text: readFileSync(join(DIR, `${slug}.txt`), "utf8") });
  }
  return out;
}

const FIXTURES = loadFixtures();

// ─── Invariante universale de puritate (valabile pe ORICE document) ──────────

const IBAN_RE = /\bMD\d{2}[A-Z0-9]{20}\b|\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/;
const FISCAL13_RE = /\b\d{13}\b/;
const ADDRESS_TOKEN_RE = /\b(?:mun|or|sat|str|bd|sec|SEC|nr|bl|of|ap)\.\s*\S/;
const ROLE_LABEL_RE =
  /^(?:Furnizor|Поставщик|Prestator|Исполнитель|Executor|Cump[ăa]r[ăa]tor|Покупатель|Получатель|Beneficiar|Pl[ăa]titor|Плательщик|Заказчик|Supplier|Seller|Buyer|Bill\s)/i;

describe("corpus salvat — puritatea câmpurilor nu depinde de tipul actului", () => {
  it("corpusul are documente încărcate de pe disc", () => {
    expect(FIXTURES.length).toBeGreaterThanOrEqual(11);
  });

  for (const fx of FIXTURES) {
    it(`${fx.slug}: niciun câmp nu conține datele altui câmp`, () => {
      const ext = parsePartiesFromText(fx.text);
      for (const p of ext.parties) {
        expect(p.name, `nume: ${p.name}`).not.toMatch(IBAN_RE);
        expect(p.name, `nume: ${p.name}`).not.toMatch(FISCAL13_RE);
        expect(p.name, `nume: ${p.name}`).not.toMatch(ADDRESS_TOKEN_RE);
        expect(p.name, `nume: ${p.name}`).not.toMatch(ROLE_LABEL_RE);
        expect(p.name, `nume: ${p.name}`).not.toMatch(/\bCont\b/i);
        if (p.bank) {
          expect(p.bank, `bancă: ${p.bank}`).not.toMatch(IBAN_RE);
          expect(p.bank, `bancă: ${p.bank}`).not.toMatch(FISCAL13_RE);
        }
      }
    });
  }

  it("„Scop” nu e NICIODATĂ un antet de tabel, în nicio limbă și cu orice diacritice", () => {
    for (const fx of FIXTURES) {
      const { scope } = parsePartiesFromText(fx.text);
      if (!scope) continue; // null e onest — mai bine gol decât greșit
      expect(scope, `${fx.slug} → scope: ${scope}`).not.toMatch(
        /codul\s*pozi|tarifare|unit\s*price|\bqty\b|cantitat|unitate\s*de\s*m[ăa]sur|Наименование\s*товаров/i,
      );
    }
  });
});

// ─── Așteptările declarate în fiecare .json ──────────────────────────────────

describe("corpus salvat — extragerea găsește ce e în document", () => {
  for (const fx of FIXTURES) {
    const label = fx.deCeConteaza ? `${fx.name} — ${fx.deCeConteaza.slice(0, 70)}` : fx.name;

    it(`${fx.slug}: ${label}`, () => {
      const ext = parsePartiesFromText(fx.text);
      const choice = choosePayee({ ...ext, isStub: true }, OWN_ORG);
      const p = choice.payee;
      const e = fx.asteptari;
      const where = (f: string) => `${fx.slug} → ${f}`;

      if (e.payeeIsNull) expect(p, where("payee")).toBeNull();
      if (e.payeeName !== undefined) expect(p?.name, where("payeeName")).toBe(e.payeeName);
      if (e.payeeNameContains !== undefined)
        expect(p?.name ?? "", where("payeeNameContains")).toContain(e.payeeNameContains);
      if (e.payeeNameMatches !== undefined)
        expect(p?.name ?? "", where("payeeNameMatches")).toMatch(new RegExp(e.payeeNameMatches));
      if (e.payeeIdno !== undefined) expect(p?.idno ?? null, where("payeeIdno")).toBe(e.payeeIdno);
      if (e.payeeIban !== undefined) expect(p?.iban ?? null, where("payeeIban")).toBe(e.payeeIban);
      if (e.payeeBic !== undefined) expect(p?.bic ?? null, where("payeeBic")).toBe(e.payeeBic);
      if (e.payeeAdministrator !== undefined)
        expect(p?.administratorName ?? null, where("payeeAdministrator")).toBe(e.payeeAdministrator);
      if (e.payeeBankContains !== undefined)
        expect(p?.bank ?? "", where("payeeBankContains")).toContain(e.payeeBankContains);
      if (e.payeeBankNotContains !== undefined)
        expect(p?.bank ?? "", where("payeeBankNotContains")).not.toContain(e.payeeBankNotContains);
      if (e.payeeLegalAddressContains !== undefined)
        expect(p?.legalAddress ?? "", where("payeeLegalAddressContains")).toContain(
          e.payeeLegalAddressContains,
        );

      if (e.amountCents !== undefined) expect(ext.amountCents, where("amountCents")).toBe(e.amountCents);
      if (e.currency !== undefined) expect(ext.currency, where("currency")).toBe(e.currency);
      if (e.scopeMatches !== undefined)
        expect(ext.scope ?? "", where("scopeMatches")).toMatch(new RegExp(e.scopeMatches, "i"));
      if (e.documentClass !== undefined)
        expect(ext.documentClass, where("documentClass")).toBe(e.documentClass);
      if (e.needsClarification !== undefined)
        expect(choice.needsClarification, where("needsClarification")).toBe(e.needsClarification);
    });
  }
});
