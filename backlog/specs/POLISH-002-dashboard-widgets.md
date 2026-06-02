---
id: POLISH-002
title: Dashboard widget customization — reorder, show/hide, metrics at a glance
milestone: POLISH
phase: "1"
branch: feat/POLISH-faza-1-ux-polish
status: pending
attempts: 0
depends_on: ["POLISH-001"]
---

## Goal

Dashboard-ul `/app` afișează metrici fixe. Directori diferiți au nevoi diferite: unii vor revenue,
alții vor nr. elevi activi, alții vor taskuri CRM restante. Adăugăm posibilitatea de a
personaliza ce widget-uri apar pe dashboard și în ce ordine — preferințele salvate per user în
localStorage (fără backend nou).

## User stories

- Ca director (Andreea), vreau să văd pe dashboard exact metricile care contează pentru mine azi, pentru că nu am timp să caut prin 5 tab-uri.
- Ca admin, vreau să ascund widget-urile care nu se aplică centrului meu (ex. kinderul nu are leaduri), pentru că clutter-ul mă distrage.
- Ca utilizator nou, vreau un dashboard implicit cu cele mai importante metrici vizibile, pentru că prima impresie contează la demo.
- Ca utilizator avansat, vreau să reordonez widget-urile prin drag-and-drop, pentru că prioritățile mele se schimbă sezonier.

## Acceptance criteria

1. Dashboard-ul `/app` are un buton "Personalizează" (sau icon gear) în header.
2. Click pe "Personalizează" deschide un panel lateral sau un modal cu lista tuturor widget-urilor disponibile + toggle show/hide per widget.
3. **Widget-uri disponibile** (minim 6):
   - Revenue total luna curentă
   - Elevi activi
   - Lecții azi
   - Taskuri CRM restante (overdue)
   - Leaduri noi (ultima săptămână)
   - Plăți restante (debts count)
4. Reordonarea widget-urilor se face cu drag-and-drop (mouse) sau săgeți sus/jos în panel (keyboard).
5. Preferințele se salvează în `localStorage` sub cheia `vl_dashboard_widgets_<userId>`.
6. La reload, preferințele sunt restaurate fără flickering.
7. Dashboard-ul implicit (fără preferințe salvate) afișează primele 4 widget-uri în ordine: Revenue, Elevi activi, Lecții azi, Taskuri restante.
8. **Dark mode** și responsive (widget-uri se aranjează în grid 2 coloane pe mobile, 3-4 pe desktop).
9. Build + typecheck + lint verzi.

## Files

### New
- `src/components/DashboardCustomizer.tsx` — panel/modal de customizare
- `src/hooks/useDashboardWidgets.ts` — hook pentru preferințe + localStorage
- `src/__tests__/DashboardCustomizer.test.tsx` — unit tests

### Modified
- `src/pages/app/DashboardPage.tsx` — integrare customizer + render dinamic al widget-urilor

## Tests

- **T-POLISH-002-1** [blocant] Given DashboardPage este montată, Then cel puțin 4 widget-uri sunt vizibile.
- **T-POLISH-002-2** [blocant] Given utilizatorul ascunde un widget și reîncarcă pagina, Then widget-ul rămâne ascuns (localStorage persistence).
- **T-POLISH-002-3** [normal] Given panelul de customizare este deschis, When un widget este dezactivat cu toggle, Then widget-ul dispare din dashboard imediat.
- **T-POLISH-002-4** [normal] Given preferințe inexistente în localStorage, Then dashboard-ul afișează setul implicit de 4 widget-uri.
- **T-POLISH-002-5** [normal] Given dark mode este activ, Then panelul de customizare folosește token-uri semantice.

## DoD

- [ ] Minim 6 widget-uri disponibile
- [ ] Persistență localStorage funcțională
- [ ] Drag-and-drop sau reordonare cu butoane
- [ ] Dark mode parity
- [ ] Build + typecheck + lint + unit tests verzi
- [ ] Reviewer APPROVED
- [ ] PR pe `feat/POLISH-faza-1-ux-polish`
