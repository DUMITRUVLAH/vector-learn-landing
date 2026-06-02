---
id: POLISH-001
title: Global quick search + command palette (Cmd+K / Ctrl+K)
milestone: POLISH
phase: "1"
branch: feat/POLISH-faza-1-ux-polish
status: pending
attempts: 0
depends_on: []
---

## Goal

Adaugă o paletă de comenzi accesibilă prin Cmd+K (Mac) sau Ctrl+K (Windows/Linux) care permite
căutarea rapidă a elevilor, leadurilor, lecțiilor și cursurilor, plus navigare directă la pagini
frecvent accesate. Eliminăm necesitatea de a da click prin meniuri pentru a ajunge la un student
anume — 2 taste + 3 litere și ești acolo.

## User stories

- Ca director (Andreea), vreau să găsesc un elev anume în < 3 secunde fără să știu unde e în meniu, pentru că am 1400 elevi și nu pot naviga manual.
- Ca admin, vreau să navighez la pagini frecvente cu tastatura, pentru că Cmd+K îmi economisește 10+ clickuri pe zi.
- Ca utilizator nou, vreau sugestii de navigare la prima deschidere a paletei, pentru că nu știu încă toate paginile din app.
- Ca utilizator avansat, vreau să tipăr numele unui student și să ajung direct la profilul lui, pentru că este cel mai frecvent task al zilei.

## Acceptance criteria

1. **Trigger**: Cmd+K (Mac) și Ctrl+K (Win/Linux) deschid paleta din orice pagină a aplicației (`/app/*`).
2. **Input debounced**: 200ms delay, minim 2 caractere pentru a declanșa căutarea API.
3. **Surse de date** (în ordine de prioritate):
   - Elevi activi (`/api/students?search=<q>&limit=5`) — afișat cu avatar inițiale + status
   - Leaduri (`/api/leads?search=<q>&limit=5`) — afișat cu stadiu pipeline
   - Pagini de navigare (hardcoded, nu necesită API): Dashboard, CRM, Elevi, Facturi, Orar, Rapoarte, Setări
4. **Navigare cu tastatura**: ArrowUp/ArrowDown + Enter selectează, Escape închide.
5. **Click pe rezultat**: navighează direct la `/app/students/:id`, `/app/leads/:id` sau ruta paginii.
6. **Stare goală**: afișează 5 pagini frecvente ca sugestii când câmpul e gol.
7. **Overlay modal**: backdrop blur, centrat în pagină, z-index peste orice alt element.
8. **Dark mode**: funcționează cu token-uri semantice, fără hardcoded hex.
9. **Accesibilitate**: `role="combobox"`, `aria-expanded`, `aria-activedescendant` corect setate.
10. **Build + typecheck + lint** verzi.

## Files

### New
- `src/components/CommandPalette.tsx` — componenta principală cu modal + search input + results list
- `src/hooks/useCommandPalette.ts` — hook pentru open/close state + keyboard listener global
- `src/__tests__/CommandPalette.test.tsx` — unit tests

### Modified
- `src/components/Layout.tsx` (sau echivalentul layout-ului principal) — montează `<CommandPalette>` și `<useCommandPalette>` la nivel de app
- `src/lib/api/students.ts` — asigură că există `searchStudents(q)` helper
- `src/lib/api/leads.ts` — asigură că există `searchLeads(q)` helper

## Tests

- **T-POLISH-001-1** [blocant] Given app este montată, When Cmd+K este apăsat, Then paleta se deschide (aria-expanded=true).
- **T-POLISH-001-2** [blocant] Given paleta este deschisă și utilizatorul tipărește "Ana", When request se finalizează, Then lista conține cel puțin un rezultat de tip student sau lead.
- **T-POLISH-001-3** [blocant] Given paleta este deschisă, When Escape este apăsat, Then paleta se închide.
- **T-POLISH-001-4** [normal] Given paleta este deschisă cu câmpul gol, Then sunt afișate 5 sugestii de navigare.
- **T-POLISH-001-5** [normal] Given un rezultat este selectat cu Enter, Then app navighează la ruta corectă și paleta se închide.
- **T-POLISH-001-6** [normal] Given dark mode este activ, Then paleta folosește doar token-uri semantice (no hardcoded colors).

## DoD

- [ ] Cmd+K / Ctrl+K funcționează din orice pagină /app/*
- [ ] Căutare studenți + leaduri funcțională (minim 2 litere)
- [ ] Navigare cu tastatura completă (Up/Down/Enter/Escape)
- [ ] Dark mode parity
- [ ] Build + typecheck + lint + unit tests verzi
- [ ] Reviewer APPROVED
- [ ] PR pe `feat/POLISH-faza-1-ux-polish`
