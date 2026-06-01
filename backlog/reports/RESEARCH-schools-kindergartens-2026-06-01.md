# Research — extindere către școli private + grădinițe (2026-06-01)

New target segment: **private K-12 schools** and **kindergartens/daycare** (not just course
centers). Compared against the segment leaders — **Gradelink, FACTS, Classe365** (private schools)
and **Brightwheel, Famly, Procare** (daycare/preschool). Gaps verified against our actual
schema+routes (the prior matches for "gradebook/incidents/daily-report" were FALSE positives —
they don't exist in our DB).

## What we have that transfers
Multi-tenant, CRM/admissions funnel (leads→convert), invoicing, payroll/HR, communication +
notifications, contracts, parent/family relation (data only), lesson attendance, audit log.
**Reusable**, but the school/daycare core below is genuinely missing.

## SEGMENT A — Private K-12 schools (Gradelink/FACTS/Classe365 baseline)

### 🔴 Core / table-stakes
- **SCHOOL-001 — Academic year + terms + permanent classes.** We have course "cohorts" (editions),
  not a school year with classes/sections a student belongs to for a year. Foundational for the rest.
- **SCHOOL-002 — Gradebook + report cards.** Verified: NO grades/gradebook schema. Weighted
  assignments, custom grade scales, term report cards (PDF for parents). Gradelink/FACTS lead with this.
- **SCHOOL-003 — Daily/class attendance register.** We only have per-lesson attendance; schools need
  daily roll-call per class, absence reasons, automated low-attendance alerts to parents.
- **SCHOOL-004 — Tuition billing (annual/term plans + schedules).** We have invoices, but not
  tuition plans (annual fee split into installments, sibling discounts, financial aid/scholarship).
- **SCHOOL-005 — Admissions/enrollment workflow.** We have a lead funnel; schools need a structured
  application → documents → acceptance → enrollment contract → seat allocation (FACTS "EnrollMe").

### 🟡 Important
- **SCHOOL-006 — Timetable/master schedule** (class × subject × teacher × room grid), beyond recurring lessons.
- **SCHOOL-007 — Parent portal: grades, attendance, report cards, school news, alerts** (extends PORTAL-902).

## SEGMENT B — Kindergarten / daycare (Brightwheel/Famly/Procare baseline)

### 🔴 Core / table-stakes (and licensing-mandatory)
- **KINDER-001 — Digital check-in / sign-out with authorized-pickup + signature.** The #1 daycare
  feature. Parent/staff check child in/out (QR/PIN/e-signature), only authorized persons can pick up.
  Verified: we have nothing like it.
- **KINDER-002 — Daily report / child diary.** Per-child log of meals, naps, diaper changes,
  activities, mood, photos — pushed to the parent app in real time. The core parent-engagement loop.
- **KINDER-003 — Staff-to-child ratio monitoring.** Live ratio per room with alerts when approaching
  licensing limits. Compliance-critical; cannot run a licensed daycare without it.
- **KINDER-004 — Medical: allergies, immunization records, medication log.** Required for licensing
  and child safety. Verified absent.

### 🟡 Important
- **KINDER-005 — Parent app feed (photos/updates) + messaging.** Newsfeed of the child's day; extends
  our comms module to a parent-facing mobile feed.
- **KINDER-006 — Licensing/compliance reports** (ratio history, immunization status, attendance for
  subsidy programs) — exportable in required formats.
- **KINDER-007 — Incident/accident reports** with parent acknowledgment signature. (We have an audit
  log, but no parent-facing incident report.)

## Cross-segment (both need)
- **Authorized-guardian model** (multiple guardians per child, custody/permission flags) — our
  `families` table is too thin for this.
- **Consent/permission forms** (photo consent, trips, medical) with e-signature.

## Recommendation
This is a **bigger pivot than the GAP items** — it's a second product surface. Two honest paths:
1. **Daycare-first (KINDER-001/002/003)** — the daycare feature set is more self-contained and
   the parent-app loop (check-in + daily report + photos) is a sharp, demoable wedge with high
   willingness-to-pay. Compliance (ratios, immunization) is a strong moat.
2. **School-first (SCHOOL-001/002/003)** — bigger build (academic year + gradebook are foundational
   and interdependent), longer to a sellable MVP, but a larger contract value per client.
Don't try both at once. Daycare has the faster, cleaner MVP. PORTAL-902 (parent portal) and
PAY-901 (online payments) from the prior research are prerequisites for both.

Sources: gradelink.com, mybrightwheel.com/features, famly.co/platform/daily-logs,
procaresoftware.com, classe365.com/blog/best-school-management-portals-k12.
