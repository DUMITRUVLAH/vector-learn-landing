---
id: CRM-120
title: Dashboard „Azi" per vânzător (task scadent + leaduri noi + follow-up + Next Best Action)
milestone: CRM
phase: G
priority: P0
core_ref: [CRM-CORE.md §2.3, §11.4]
tests: TEST-SCENARIOS.md#crm-120
depends_on: [CRM-107, CRM-111]
status: pending
---

# CRM-120 — Dashboard „Azi"

## Goal
Cel mai important ecran pentru adopție. CRM-ul actual e un depozit — îți arată 200 de carduri și
te lasă blocat. Acest ecran spune **ce să faci ACUM**: pe cine sun, ce task e scadent, ce lead nou
n-a fost atins. Transformă CRM-ul din „stochează" în „ghidează".

## In scope
- Rută `/app/leads/today` (sau tab „Azi" pe `/app/leads`), scoped pe userul logat (managerul vede tot).
- Secțiuni:
  1. **Task-uri scadente azi/întârziate** (din `lead_tasks`, sortate după scadență; click → cartonaș).
  2. **Leaduri noi nealocate/alocate mie** necontactate (fără `lead_interaction` outbound).
  3. **Follow-up de făcut** (leaduri în `contacted/trial` fără contact > 2 zile).
  4. **Next Best Action**: top 5 leaduri după (score desc, aging desc) cu buton rapid Sună/WhatsApp.
- Fiecare rând: nume, curs, valoare, motiv apariție („necontactat 3z", „task scadent azi").
- Endpoint `GET /api/leads/today` agregă cele 4 liste; tenant + user scoped.
- Counter în navigație (badge cu nr. acțiuni de azi).

## Out of scope
- Rapoartele istorice (sunt CRM-112/REP). Aici e exclusiv „de făcut acum".

## Acceptance criteria
- [ ] Cele 4 secțiuni populate corect din date reale; user-scoped (manager vede tot)
- [ ] „Necontactat" = fără interaction outbound; „follow-up" = fără contact > 2 zile — calc corect
- [ ] Next Best Action ordonat după score+aging; butoane sună/WhatsApp funcționale
- [ ] Badge counter în nav corect
- [ ] `GET /api/leads/today` tenant-scoped; nu raw `.execute().rows`
- [ ] 0 axe critical/serious; dark mode OK; mobil-friendly

## Tests
`TEST-SCENARIOS.md#crm-120`. Blocante verzi (incl. integration smoke pe agregare).

## DoD
Standard.
