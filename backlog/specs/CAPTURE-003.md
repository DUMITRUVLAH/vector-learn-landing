---
id: CAPTURE-003
title: "UI confirmare câmp↔valoare↔încredere — 1-click devine cheltuială"
milestone: FIN
phase: "8"
status: pending
depends_on: [CAPTURE-001, CAPTURE-002]
spec: backlog/specs/CAPTURE-003.md
---

## Goal

Construiește pagina `/app/fin/captures/:id` — interfața de confirmare a câmpurilor extrase de AI
din un bon/factură scanat. Utilizatorul vede câmpurile grupate (vendor, sumă, TVA, dată, categorie,
IBAN, referință) cu badge-ul de încredere (green/amber/red), poate edita oricare câmp, și cu un
singur buton "Confirmă cheltuiala" transformă captura în `fin_expense` real.

FIN-CORE regula #5: AI propune, omul confirmă. Niciun modul AI nu e singur punct de eșec.
FIN-CORE regula #4: AI nu calculează, AI extrage. Calculul TVA rămâne determinist în cod.

---

## User stories

- Ca **contabil**, vreau să văd câmpurile extrase de AI cu culoarea gradului de încredere, pentru că altfel nu știu pe care să le reverific mai atent.
- Ca **contabil**, vreau să pot edita orice câmp înainte de confirmare, pentru că AI poate greși pe bonuri neclare.
- Ca **director**, vreau ca un singur click "Confirmă" să creeze cheltuiala, pentru că re-introducerea manuală a datelor este pierdere de timp.
- Ca **auditor**, vreau să văd statusul capturii (extracted/confirmed/failed) în lista de capturi, pentru că trebuie să urmăresc ce așteptă confirmare.

---

## Acceptance criteria

- [ ] Pagina `/app/fin/captures/:id` se randează fără crash când status = `extracted`
- [ ] Fiecare câmp extras afișează un badge de încredere: verde ≥0.85, amber 0.60–0.84, roșu <0.60
- [ ] Câmpurile cu `low_confidence: true` sunt evidențiate vizual (border amber + icon atenție)
- [ ] Utilizatorul poate edita orice câmp (vendor_name, amount_cents, vat_amount_cents, vat_deductible, expense_date, category, reference)
- [ ] Câmpul `amount_cents` se afișează/editează în format MDL (ex. "1.250,00 MDL")
- [ ] Câmpul `vat_deductible` este un toggle boolean explicit (nu un câmp text)
- [ ] Butonul "Confirmă cheltuiala" este dezactivat dacă `amount_cents` sau `expense_date` lipsesc
- [ ] POST `/api/fin/captures/:id/confirm` este apelat cu câmpurile editate (nu cu AI-originale dacă au fost modificate)
- [ ] La confirmare reușită → redirect la `/app/fin/expenses` cu toast "Cheltuiala a fost creată"
- [ ] Status `confirmed` → pagina afișează rezumatul cheltuielii create (read-only) cu link la cheltuiala din SPEND
- [ ] Status `failed` → mesaj de eroare clar + buton "Reîncarcă documentul"
- [ ] Status `processing` → spinner cu "AI procesează documentul..." (polling la 2s)
- [ ] Lista capturi `/app/fin/captures` afișează badge status per rând (extras/confirmat/eroare/în procesare)
- [ ] Tenant isolation: utilizatorul nu poate accesa captura altui tenant (404)
- [ ] Design system tokens only, light + dark, WCAG AA (contrast ≥ 4.5:1, touch targets ≥ 44px)

---

## Files to create / modify

**Create:**
- `src/pages/fin/CapturePage.tsx` — pagina de confirmare a câmpului
- `src/components/fin/CaptureFieldRow.tsx` — rând câmp cu badge de încredere + edit inline
- `src/components/fin/ConfidenceBadge.tsx` — badge verde/amber/roșu cu tooltip explicativ
- `src/lib/api/finCaptures.ts` — hook-uri React Query pentru GET capture + POST confirm
- `src/__tests__/fin/capture-confirm.test.tsx` — test UI confirmare

**Modify:**
- `src/App.tsx` — adaugă ruta `/app/fin/captures/:id` + redirecționare de la `/app/fin/captures`
- `src/pages/fin/CapturesListPage.tsx` — dacă nu există, creează-l (lista de capturi cu statusuri)
- `src/lib/api/finCaptures.ts` — sau adaugă la fișierul existent dacă există

---

## Tests

- **T-CAPTURE-003-1** [blocant] Given o captură cu status `extracted` cu câmpuri de încredere mixtă, When navighez la `/app/fin/captures/:id`, Then văd toate câmpurile grupate cu badge-uri de culoare corectă (verde/amber/roșu) fără nicio eroare de consolă.
- **T-CAPTURE-003-2** [blocant] Given câmpul `amount_cents = null` (AI nu a găsit suma), When încerc să apăs "Confirmă cheltuiala", Then butonul e dezactivat și există un mesaj "Suma obligatorie".
- **T-CAPTURE-003-3** [blocant] Given utilizatorul modifică `vendor_name` și `amount_cents` față de valorile AI, When apasă "Confirmă cheltuiala", Then POST /api/fin/captures/:id/confirm primește valorile editate (nu cele AI originale).
- **T-CAPTURE-003-4** [blocant] Given login ca user din tenant B, When GET /api/fin/captures/:id cu un id din tenant A, Then răspuns 404 (tenant isolation).
- **T-CAPTURE-003-5** [blocant] Given captura în status `extracted`, When POST /api/fin/captures/:id/confirm reușește, Then status devine `confirmed`, `expense_id` e populat, UI redirecționează la `/app/fin/expenses`.
- **T-CAPTURE-003-6** [normal] Given captură în status `processing`, When pagina se deschide, Then există un element `[data-testid="processing-spinner"]` și polling-ul se face la 2s.

---

## Definition of Done

- Toate acceptance criteria bifate
- Scenariile blocante [T-CAPTURE-003-1..5] verzi
- Build + typecheck + lint verzi
- Ruta montată în `server/app.ts` și `src/App.tsx`
- Design tokens only, no hex, dark mode funcțional
- Raport persona-manager + persona-student salvat
- PR deschis pe `feat/FIN-capture` (ultima fază a fazei CAPTURE)
