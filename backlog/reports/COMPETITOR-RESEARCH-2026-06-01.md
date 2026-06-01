# Competitor research — feature gaps (2026-06-01)

Compared Vector Learn against the leading education-business platforms: **Teachworks**
(tutoring), **Jackrabbit** (dance/music/class), **Classe365** (SIS+CRM+LMS), **Outcoach**,
**DanceStudio-Pro**, **Tutorbase**. Goal: find features they all have that we don't —
verified against our actual codebase (routes + schema), not assumed.

## What we ALREADY have (strong position)
Full CRM (leads→pipeline→convert), Finanțe (invoices/debt/subscriptions/e-Factura), HR/payroll,
Orar (rooms/recurring/attendance/conflict), Comunicare (templates/broadcast/notifications),
Cohorte, Contracte, Feedback/NPS, Diplome (in progress), multi-tenant, audit log, analytics.
Online lessons: we DO have `meetingUrl` per lesson (Zoom/Meet link). ✓

## CONFIRMED GAPS (they have it, we verified we don't)

### 🔴 High value (every competitor has these; direct revenue/retention impact)
1. **Online card payments (Stripe/processor).** 0 files in `server/` reference Stripe — all payments
   are manually recorded (cash/transfer). Teachworks, Jackrabbit, Outcoach, DanceStudio-Pro all
   collect card payments online. For a paying client this is table-stakes: parents pay by card,
   invoices auto-reconcile. → **PAY-901**
2. **Parent/Student self-service portal.** No `families`/`parent`/`portal` route exists — `families.ts`
   is only a data relation, admin-only. Every competitor's #1 selling point is a 24/7 parent portal:
   view schedule, lesson notes, balance, pay invoices, book/cancel lessons. → **PORTAL-902**
3. **Lesson packages / prepaid credits.** No package/credit/prepaid concept. Tutorbase & Teachworks
   center on this: sell a block of N hours, auto-deduct a credit per attended lesson, low-balance
   alerts. The dominant billing model for tutoring/music. → **PKG-903**

### 🟡 Medium value
4. **Makeup lessons + cancellation credits.** No makeup/recovery flow. Standard in dance/music:
   a cancelled lesson issues a credit, student rebooks into an open slot without re-paying. → **SCHED-904**
5. **Gradebook / student progress reports.** No grades/skills/progress-report. Classe365 & Tutorbase
   make measurable progress (skill milestones, test-score deltas) a parent-retention driver. → **PROG-905**
6. **Public online enrollment (self-enroll + pay).** We have public lead intake, but not direct
   self-enrollment into a specific course/cohort with payment — Jackrabbit/Outcoach let a parent
   register + pay in one public flow, no staff touch. → **ENROLL-906**

### 🟢 Lower value / nice-to-have
7. **Homework / assignments per lesson.** `lessons` has no homework field. Some SIS/LMS competitors
   attach homework + submission to a lesson. Lighter priority for a CRM-first product. → **LESSON-907**

## Not gaps (verified we have them)
- Online lessons (meetingUrl) ✓ · Waitlist signals (notifications) ✓ · Referral/source on leads ✓
- Attendance, recurring lessons, conflict detection, bulk invoicing, broadcast, e-Factura ✓

## Recommendation (priority order for revenue/retention)
PAY-901 (online payments) and PORTAL-902 (parent portal) are the two that competitors lead with and
that a paying client will ask for first. PKG-903 (prepaid packages) is the billing model most
tutoring/music schools actually run on. Start there.

Sources: teachworks.com/features, jackrabbitclass.com/features, classe365.com,
outcoach.io/outcoach-for-music, tutorbase.com/blog/crm-for-tutoring-business, danceclassjuggler.com.
