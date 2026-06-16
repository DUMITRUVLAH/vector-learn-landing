---
id: DOCMERGE-004
title: "Document Merge — wizard end-to-end (template → Excel → mapare → preview → ZIP) + intrare în meniu"
milestone: DOCMERGE
phase: 1
status: pending
depends_on: [DOCMERGE-003]
slug: wizard-end-to-end
---

## Goal

Leagă cele 3 piese (001 template, 002 Excel+mapare, 003 generare ZIP) într-un **singur flux ghidat
pe pași** pe care un user îl parcurge cap-coadă, și adaugă **intrarea în meniul business** astfel
încât funcția să fie descoperibilă (nu doar prin URL). Acesta e item-ul care transformă bucățile
într-un feature pe care Andreea (managerul) îl poate folosi fără să citească documentația.

**Reuse obligatoriu:** toate API-urile și componentele din 001–003. Acest item NU adaugă logică de
backend nouă semnificativă — doar consolidează UX-ul și navigarea. Dacă 002/003 au pus pașii pe pagini
separate, aici se unifică într-un wizard coerent.

## In scope

### Wizard — `src/pages/business/docmerge/DocMergeWizardPage.tsx` (nou sau consolidare)
Sub `/business/docmerge` (sidebar business). Pași cu indicator (1→2→3→4):
1. **Template** — alege un template existent (din 001) SAU creează unul rapid (link la editorul 001).
   Afișează chips cu placeholderele detectate.
2. **Excel** — upload `.xlsx` (002) → „N rânduri, coloanele: …".
3. **Mapare + preview** — tabel de mapare placeholder→coloană (autoMap pre-completat, 002) +
   preview pe rândul selectat (render API din 001). Avertizează vizual placeholderele nemapate.
4. **Generează** — buton „Generează N documente" → `POST /api/docmerge/generate` (003) → descarcă ZIP.
   Ecran final: „N documente generate" + buton „Începe din nou" / „Înapoi la template-uri".
- Stare partajată între pași (template selectat, headers, rows, mapping). Navigare înainte/înapoi
  fără pierderea datelor.
- Tokens Vector 365, dark mode, a11y completă (pașii anunțați, focus management la schimbarea pasului,
  fiecare control are label). Touch targets ≥44px. Zero hex în `.tsx`.

### Navigare — intrarea în meniul business
- Adaugă „Documente în masă" (sau „Document Merge") în sidebar-ul business (componenta de sidebar
  folosită de paginile `/business/*` — vezi memoria FinDesk pentru care e sidebar-ul corect).
  Iconiță Lucide (ex. `FileStack` / `Files`). Link la `/business/docmerge`.
- Pagina `DocMergeTemplatesPage` (001) rămâne accesibilă (sub-tab „Template-uri" vs „Generează").

### Empty / error states
- Niciun template încă → empty state cu CTA „Creează primul template".
- Excel fără rânduri / fără headere → mesaj clar.
- Generare eșuată (timeout/eroare server) → mesaj + buton „Reîncearcă", fără să piardă maparea.

### Tests
- `src/__tests__/docmerge/wizard.test.tsx`:
  - Render wizard → pasul 1 vizibil, butonul „Înainte" dezactivat până se alege template.
  - Flux mock (template + parse-excel + automap mock) → ajunge la pasul 4 cu „Generează N documente".
  - Placeholder nemapat → avertisment vizibil.
- Smoke navigare: linkul din sidebar duce la `/business/docmerge` (test pe componenta de meniu).

## User stories
- Ca **Andreea (manager)**, vreau un singur ecran ghidat care mă duce de la template la ZIP-ul cu
  documente, pentru că nu am timp să învăț 3 ecrane separate.
- Ca **Admin**, vreau să găsesc funcția în meniu, pentru că altfel nu știu că există.
- Ca **Manager**, vreau să mă pot întoarce un pas fără să pierd Excel-ul încărcat, pentru că
  greșesc maparea și vreau să corectez rapid.

## Acceptance criteria
- AC1: Wizard în 4 pași cu indicator; nu poți avansa fără datele pasului curent.
- AC2: Starea (template, rows, mapping) persistă la navigare înainte/înapoi.
- AC3: Intrarea „Documente în masă" apare în sidebar-ul business și duce la `/business/docmerge`.
- AC4: Empty state când nu există niciun template, cu CTA de creare.
- AC5: Eroare de generare → mesaj + reîncercare fără pierderea mapării.
- AC6: A11y: pașii navigabili la tastatură, focus gestionat, label pe fiecare control; axe critical/serious = 0.
- AC7: Build+typecheck+lint curate; zero `any`; dark mode OK; zero hex în `.tsx`.

## Tests (Given/When/Then)
- **T-DOCMERGE-004-1** [blocant] Given wizard montat, When fără template ales, Then „Înainte" dezactivat.
- **T-DOCMERGE-004-2** [blocant] Given mock-uri pentru template+excel+automap, When parcurg pașii, Then pasul 4 arată „Generează N documente" cu N corect.
- **T-DOCMERGE-004-3** [blocant] Given un placeholder fără coloană mapată, When pasul 3, Then avertisment vizibil.
- **T-DOCMERGE-004-4** [blocant] Given sidebar business randat, When caut, Then linkul „Documente în masă" → `/business/docmerge`.
- **T-DOCMERGE-004-5** [normal] Given niciun template, When pasul 1, Then empty state cu CTA.
- **T-DOCMERGE-004-6** [blocant] Given `npm run build` + axe pe pagină, Then zero erori TS, zero violări critical/serious.

## DoD
Build+typecheck+lint+test verzi, reviewer APPROVED după review→improve loop, integration-architect
CONNECTED (wizard chemă API-urile 001–003, link în meniu), persona reports salvate (Andreea + Maria/Cristina),
commit pe `feat/DOCMERGE-faza-1-document-merge`. Faza 1 = UN singur PR cu toate cele 4 item-uri (§0.2).
