---
id: GAP-018
title: "Mobile check-in — prezență rapidă pe telefon (touch-friendly)"
milestone: GAP
phase: 5
priority: P2
slug: mobile-check-in
depends_on: [SCHED-503]
status: pending
---

# GAP-018 — Mobile check-in (prezență rapidă)

## Goal

Profesorul deschide o pagină optimizată mobile pentru a marca prezența elevilor la o lecție,
direct de pe telefon, în clasă. Interfață: lista elevilor înscriși cu un toggle mare (prezent/absent)
per elev, buton "Salvează prezența" la final. Nu necesită keyboard. Funcționează și pe desktop.

## In scope

- **Pagină nouă:** `/app/lessons/:lessonId/check-in` — `CheckInPage.tsx`
  - Renderizează lista `student_lessons` pentru acel lesson (`enrollmentStatus = active`)
  - Fiecare student: avatar inițiale + nume + toggle XL (prezent / absent / excused)
  - Stare inițială: preia `attendanceStatus` existent din DB pentru acel lesson
  - Buton "Salvează" → `PATCH /api/lessons/:lessonId/attendance` cu `{ updates: [{studentId, status}] }`
  - Toast confirmare "Prezența salvată" după succes
  - Loading skeleton în timpul fetch-ului
  - Responsive: funcționează la 375px (iPhone SE) și la 768px+

- **API endpoint (dacă nu există complet):** `PATCH /api/lessons/:lessonId/attendance`
  - Body: `{ updates: [{ studentId: string, status: 'present'|'absent'|'excused' }] }`
  - Upsert în `student_lessons` (attendanceStatus + markedAt)
  - Returnează `{ updated: number }`
  - Autentificat, tenant-scoped
  - Dacă există deja din SCHED-503 → extinde-l sau reuse-l; nu duplica

- **Link de navigație:** buton "Check-in rapid" pe pagina de detaliu lecție sau pe SchedulePage,
  vizibil pe mobile (poate fi și pe desktop). Link la `/app/lessons/:id/check-in`.

- **DB:** fără raw `.execute().rows`

- **TypeScript strict:** zero `any`

- **Tailwind touch targets:** butoane toggle ≥ 44×44px (`.touch-target` class sau `min-h-[44px] min-w-[44px]`)

## Out of scope

- QR code scan pentru check-in
- Offline mode / PWA / service worker
- Notificare automată la absență (COMM)
- Check-in pentru lecții din trecut (afișate read-only dacă lesson.date < azi)

## Acceptance criteria

- [ ] `/app/lessons/:lessonId/check-in` randează lista elevilor înscriși la lecție
- [ ] Toggle per elev schimbă statusul local (prezent/absent/excused)
- [ ] "Salvează" → `PATCH /api/lessons/:lessonId/attendance` → status salvat în DB
- [ ] La reload pagina afișează statusul din DB (nu resetat)
- [ ] Butoanele toggle au min 44×44px (touch-friendly)
- [ ] Pagina funcționează la lățime 375px fără scroll orizontal
- [ ] Link "Check-in rapid" accesibil din schedule sau lista lecții
- [ ] TypeScript strict; zero `any`; 0 axe critical/serious
- [ ] Build + typecheck + lint verde

## Tests

- **T-GAP-018-1** `[blocant]` Given lecție cu studenți înscriși, When `PATCH /api/lessons/:id/attendance` cu updates valide, Then 200 + `student_lessons.attendanceStatus` actualizat
- **T-GAP-018-2** `[blocant]` Given lecție fără studenți, When `GET /api/lessons/:id` (sau check-in page load), Then pagina randează „Niciun elev înscris" fără crash
- **T-GAP-018-3** `[blocant]` API smoke: login + `PATCH /api/lessons/<id>/attendance` cu body valid → 200
- **T-GAP-018-4** `[blocant]` CheckInPage randează fără crash cu mock lesson data (smoke render test)
- **T-GAP-018-5** `[normal]` Toggle UI schimbă statusul vizual local înainte de save (optimistic)
- **T-GAP-018-6** `[normal]` Butoanele toggle au `min-h-[44px]` sau clasa `touch-target` în DOM

## DoD

Standard CLAUDE.md §0.2. Faza 5 branch: `feat/GAP-faza-5-operational`. Un PR per fază.
