---
id: POLISH-003
title: Empty states cu CTA pentru paginile cheie
milestone: POLISH
phase: "1"
branch: feat/POLISH-faza-1-ux-polish
status: pending
attempts: 0
depends_on: []
---

## Goal

Paginile care nu au date (zero elevi, zero leaduri, zero facturi) afișează un ecran gol fără
context. Adăugăm empty states cu ilustrație, mesaj motivațional și un buton de acțiune primară
— "Adaugă primul elev", "Creează primul lead", etc. Primul run după seed sau la un tenant nou
arată o experiență îngrijită, nu un tabel gol.

## User stories

- Ca utilizator nou (onboarding), vreau să văd un ghid clar de ce să fac când o pagină e goală, pentru că altfel nu știu de unde să încep.
- Ca director în demo (Andreea), vreau că paginile goale arată profesional și nu ca o eroare, pentru că dau demo clienților potențiali.
- Ca student (Maria), vreau să văd un mesaj prietenos când nu am teme sau lecții, pentru că altfel cred că e o eroare.
- Ca dezvoltator, vreau un component `<EmptyState>` reutilizabil cu props standardizate, pentru că nu vreau să duplicăm markup.

## Acceptance criteria

1. Component `<EmptyState>` cu props:
   - `icon`: ReactNode (Lucide icon)
   - `title`: string
   - `description`: string
   - `action?`: `{ label: string; onClick: () => void }` (opțional)
2. Pagini care primesc empty state (cu mesaj și acțiune specifică):
   - `/app/students` — "Niciun elev înregistrat" + "Adaugă elev"
   - `/app/leads` — "Niciun lead în pipeline" + "Adaugă lead"
   - `/app/invoices` — "Nicio factură creată" + "Creează factură"
   - `/app/courses` — "Niciun curs configurat" + "Creează curs"
   - `/app/lessons` — "Nicio lecție planificată" + "Planifică lecție"
3. Vizual: icon centrat (48x48), titlu bold, descriere muted, buton primary sub text — aliniere verticală centrată în container.
4. **Dark mode**: funcționează fără hardcoded culori.
5. **Accesibilitate**: text alternativ pentru icon, buton accesibil cu tastatură.
6. Build + typecheck + lint verzi.
7. Unit tests pentru componenta `<EmptyState>`.

## Files

### New
- `src/components/EmptyState.tsx` — componenta reutilizabilă
- `src/__tests__/EmptyState.test.tsx` — unit tests

### Modified
- `src/pages/app/StudentsPage.tsx` — adaugă `<EmptyState>` când `students.length === 0`
- `src/pages/app/LeadsPage.tsx` (sau CRM KanbanPage) — empty state pentru zero leaduri
- `src/pages/app/InvoicesPage.tsx` — empty state pentru zero facturi
- `src/pages/app/CoursesPage.tsx` — empty state pentru zero cursuri
- `src/pages/app/LessonsPage.tsx` — empty state pentru zero lecții

## Tests

- **T-POLISH-003-1** [blocant] Given `<EmptyState title="Test" description="Desc">` este randat, Then titlul și descrierea sunt vizibile în DOM.
- **T-POLISH-003-2** [blocant] Given `action` prop este furnizat, Then butonul de acțiune este randat și clickabil.
- **T-POLISH-003-3** [normal] Given StudentsPage cu zero studenți, Then `<EmptyState>` cu "Niciun elev" este afișat.
- **T-POLISH-003-4** [normal] Given dark mode, Then EmptyState nu conține culori hardcodate.
- **T-POLISH-003-5** [normal] Given action prop lipsă, Then niciun buton nu e randat (optional prop).

## DoD

- [ ] Component `<EmptyState>` complet cu toate props
- [ ] Cel puțin 5 pagini integrate
- [ ] Dark mode parity
- [ ] Build + typecheck + lint + unit tests verzi
- [ ] Reviewer APPROVED
- [ ] PR pe `feat/POLISH-faza-1-ux-polish`
