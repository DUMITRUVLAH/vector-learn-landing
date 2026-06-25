---
id: VM1-02
title: "Import config din Excel — proiecte, departamente, coduri de buget"
milestone: VIOLETA
phase: "VIOLETA"
status: pending
attempts: 0
depends_on: []
spec: backlog/specs/VM1-02-import-config-excel.md
core: backlog/par/PAR-CORE.md
---

## Goal

La onboarding/administrare, par_admin poate popula datele de configurare ale PAR dintr-un fișier Excel:
DOAR proiecte (`parProjects`), departamente (`parDepartments`) și coduri de buget (`parBudgetCodes`).
NU se importă vendori și NU se importă linii PAR. Se reutilizează exact pattern-ul de import Excel din
DocMerge (`/business/docmerge/job`), iar `exceljs` se încarcă prin `import()` dinamic (import top-level
= cădere a întregului API în prod).

## User stories

- **Ca** par_admin, **vreau** să încarc un Excel cu proiecte/departamente/coduri de buget, **pentru că**
  introducerea manuală a zecilor de rânduri la onboarding e lentă și predispusă la erori.
- **Ca** par_admin, **vreau** un template descărcabil, **pentru că** trebuie să știu exact ce coloane se
  așteaptă.
- **Ca** par_admin, **vreau** un preview cu erori per-rând înainte de a confirma, **pentru că** nu vreau
  date murdare în sistem.

## Acceptance criteria

- [ ] Buton „Import din Excel" în `ParAdmin` (pagina de administrare PAR)
- [ ] Template `.xlsx` descărcabil cu 3 sheet-uri/secțiuni: Proiecte (`name`, `donor`), Departamente (`name`), Coduri de buget (`code`, `name`, `allocatedCents`/sumă)
- [ ] Parsarea Excel se face DOAR prin `await import("exceljs")` dinamic (niciun import top-level)
- [ ] Endpoint server de import care primește rândurile parsate și face upsert tenant-scoped în `parProjects`/`parDepartments`/`parBudgetCodes`
- [ ] Preview înainte de confirmare: rândurile valide vs invalide, cu raport de erori per-rând (rând, coloană, motiv)
- [ ] Validare: câmpuri obligatorii prezente, `code` unic la budget codes, sume numerice; rândurile invalide NU se importă, cele valide pot continua
- [ ] Dedup: dacă un proiect/departament/cod există deja (după cheie naturală: `name`, respectiv `code`), se face update, nu duplicat
- [ ] Doar par_admin poate importa (rol verificat prin `requirePARRole`); tenant scope respectat
- [ ] NU se importă vendori și NU se importă linii PAR (în afara scope-ului)
- [ ] Mesaj de succes cu numărul de rânduri create/actualizate/sărite

## Files

**New:**
- `server/routes/parConfigImport.ts` (endpoint import + generare/descărcare template)
- `src/pages/par/ParConfigImport.tsx` (sau wizard inline în ParAdmin) reutilizând pattern-ul din DocMerge
- teste `server/routes/__tests__/par-config-import.test.ts`

**Modified:**
- `server/app.ts` — mount route nou
- `src/pages/par/ParAdmin.tsx` — buton „Import din Excel" + descărcare template

## Tests

- **T-VM1-02-1** [blocant] Given un Excel valid cu 3 proiecte + 2 departamente + 4 coduri, When import confirmat, Then toate apar tenant-scoped în tabele
- **T-VM1-02-2** [blocant] Given un Excel cu un rând fără `code` la budget, When preview, Then acel rând e raportat ca eroare și NU se importă, restul da
- **T-VM1-02-3** [blocant] Live API smoke: login par_admin + import → 200 cu counts corecte
- **T-VM1-02-4** [normal] Given un proiect cu același `name` deja existent, When import, Then se face update, fără duplicat

## DoD

- Live-smoke verde · reviewer APPROVED · personas salvate
