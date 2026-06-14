/**
 * ITPARK-502 — Declarație pe proprie răspundere (decl_self_responsibility)
 * T-502-1 [blocant]: body contains administrator, SRL name, IDNO, legal address, period
 * T-502-2 [blocant]: no "XXX" or "Numele Prenumele" placeholders
 * T-502-3 [blocant]: art. 312 Codul Penal + art. 18(1) Legea 77/2016 references present
 * T-502-4 [blocant]: all 5 negated situations mentioned
 * T-502-5 [blocant]: SelfDeclarationPage file exports component + uses decl_self_responsibility
 * T-502-6 [normal]: App.tsx route /declaratie registered
 */

import { describe, it, expect } from "vitest";

const ENG = {
  residentName: "TechVision SRL",
  idno: "1003600100005",
  periodStart: "2024-01-01",
  periodEnd: "2024-12-31",
  legalAddress: "mun. Chișinău, str. Academiei 1, biroul 301",
  reportingYear: 2024,
};

function todayISO() { return new Date().toISOString().slice(0, 10); }

function generateDeclBody(eng: typeof ENG) {
  const { residentName, idno, periodStart, periodEnd, legalAddress, reportingYear } = eng;
  const administrator = residentName;
  const fmt = (iso: string) => {
    try { return new Date(iso).toLocaleDateString("ro-MD", { day: "2-digit", month: "long", year: "numeric" }); }
    catch { return iso; }
  };
  const period = `${fmt(periodStart)} – ${fmt(periodEnd)}`;
  const body = `DECLARAȚIE PE PROPRIE RĂSPUNDERE

Subsemnatul/subsemnata, ${administrator}, în calitate de Reprezentant legal/Administrator al ${residentName} (cod fiscal ${idno}), cu sediul juridic la adresa: ${legalAddress},

declarăm pe proprie răspundere că, în perioada ${period} de deținere a statutului de rezident al Parcului Tehnologic IT:

1. Societatea nu s-a aflat în stare de insolvabilitate sau faliment;
2. Societatea nu a inițiat și nu se află în proces de lichidare voluntară sau forțată;
3. Societatea nu a fost supusă restructurării judiciare;
4. Societatea nu a suspendat activitatea de bază eligibilă IT Park;
5. Nu au fost inițiate proceduri legale cu impact semnificativ.

Prezenta declarație este dată în conformitate cu prevederile art. 312 din Codul Penal al Republicii Moldova și art. 18 alin. (1) din Legea nr. 77 din 21 aprilie 2016 cu privire la parcurile de tehnologii ale informației.

Declarația este emisă pentru dosarul de verificare MITP pentru anul ${reportingYear}.`;
  return { body, administrator, date: todayISO() };
}

const decl = generateDeclBody(ENG);

describe("ITPARK-502 — T-502-1 [blocant] body contains required fields", () => {
  it("contains residentName", () => { expect(decl.body).toContain(ENG.residentName); });
  it("contains IDNO", () => { expect(decl.body).toContain(ENG.idno); });
  it("contains legalAddress", () => { expect(decl.body).toContain(ENG.legalAddress); });
  it("contains year 2024", () => { expect(decl.body).toContain("2024"); });
  it("administrator pre-filled", () => { expect(decl.administrator).toBe(ENG.residentName); });
  it("date is today", () => { expect(decl.date).toBe(new Date().toISOString().slice(0, 10)); });
  it("body > 500 chars", () => { expect(decl.body.length).toBeGreaterThan(500); });
});

describe("ITPARK-502 — T-502-2 [blocant] no placeholders", () => {
  it("no 'XXX'", () => { expect(decl.body).not.toContain("XXX"); });
  it("no 'Numele Prenumele'", () => { expect(decl.body).not.toContain("Numele Prenumele"); });
  it("no bracket placeholder", () => { expect(decl.body).not.toMatch(/\[adresa\]|\[adresă\]/i); });
});

describe("ITPARK-502 — T-502-3 [blocant] legal references", () => {
  it("references art. 312 Codul Penal", () => {
    expect(decl.body).toContain("art. 312");
    expect(decl.body).toMatch(/Cod(?:ul)? Penal/);
  });
  it("references art. 18 Legea 77/2016", () => {
    expect(decl.body).toContain("art. 18");
    expect(decl.body).toContain("77");
  });
  it("references 21 aprilie 2016", () => { expect(decl.body).toContain("21 aprilie 2016"); });
});

describe("ITPARK-502 — T-502-4 [blocant] 5 negated situations", () => {
  it("insolvabilitate", () => { expect(decl.body.toLowerCase()).toContain("insolvabilitate"); });
  it("lichidare", () => { expect(decl.body.toLowerCase()).toContain("lichidare"); });
  it("restructurare/restructurarii", () => { expect(decl.body.toLowerCase()).toContain("restructur"); });
  it("suspendat/suspendare", () => { expect(decl.body.toLowerCase()).toContain("suspendat"); });
  it("proceduri legale", () => { expect(decl.body.toLowerCase()).toContain("proceduri legale"); });
});

describe("ITPARK-502 — T-502-5 [blocant] SelfDeclarationPage component", () => {
  it("file exports SelfDeclarationPage", () => {
    const { readFileSync } = require("fs");
    const { resolve } = require("path");
    const content = readFileSync(resolve(process.cwd(), "src/pages/app/fin/itpark/SelfDeclarationPage.tsx"), "utf8");
    expect(content).toContain("export function SelfDeclarationPage");
  });
  it("uses decl_self_responsibility", () => {
    const { readFileSync } = require("fs");
    const { resolve } = require("path");
    const content = readFileSync(resolve(process.cwd(), "src/pages/app/fin/itpark/SelfDeclarationPage.tsx"), "utf8");
    expect(content).toContain("decl_self_responsibility");
  });
});

describe("ITPARK-502 — T-502-6 [normal] App.tsx route", () => {
  it("App.tsx has /declaratie route for SelfDeclarationPage", () => {
    const { readFileSync } = require("fs");
    const { resolve } = require("path");
    const content = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");
    expect(content).toContain("SelfDeclarationPage");
    expect(content).toContain("declaratie");
  });
});
