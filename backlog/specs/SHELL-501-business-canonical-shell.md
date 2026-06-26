---
id: SHELL-501
title: "Business modules render the wrong (CRM) shell under /app/* — grădiniță sidebar + double-sidebar flash"
milestone: SHELL
phase: "SHELL3"
status: done
attempts: 1
depends_on: []
spec: backlog/specs/SHELL-501-business-canonical-shell.md
---

## Problema (raportată de owner, 2026-06-26)

> „Încă îmi apar grădinițe în sidebar. Și când intru în aplicație apare un sidebar de finance, după alt sidebar."

### Cauza rădăcină (identificată)

Două bug-uri care se compun:

1. **Rutare pe shell greșit.** `AppShell` alege shell-ul după `path.startsWith("/business")`
   ([AppShell.tsx](../../src/components/app/AppShell.tsx) ~L204): sub `/business/*` deleagă către
   `BusinessShell`; sub orice altceva randează **shell-ul CRM** (`NAV_GROUPS`, care conține secțiunea
   `gradinita`/kinder). Dar două module business erau montate sub `/app/*`:
   - PAR la `/app/par/*` ([App.tsx](../../src/App.tsx) L102-109)
   - Cont de plată la `/app/conturi-plata/*` (App.tsx L175-182)
   → randau shell-ul CRM (cu grădinițe), nu BusinessShell.

2. **Default „mixt" arată tot CRM-ul.** `isModuleVisible("gradinita", type)`
   ([institution.ts](../../src/lib/institution.ts)): dacă tenant-ul n-are `institutionType`
   (cazul clientului business/ONG → `undefined`), e tratat ca **"mixt"** → toate modulele CRM,
   inclusiv grădinițe, devin vizibile.

3. **Deep-link-uri către `/app/par`.** ~25 de link-uri (ParDashboard, ParInbox, ParDetail,
   PaymentApprovalBadge, FinExpensesPage, ParCreateForm, **emailul VM1-08 din notify.ts**) duceau la
   `/app/par/*`. Trecând de la o pagină `/business/*` (sidebar finance) la un astfel de link →
   **sidebar finance, apoi sidebar CRM** = cele „două sidebar-uri" + grădinițe.

## Goal

Canonicalizează modulele business sub `/business/*` astfel încât să randeze ÎNTOTDEAUNA BusinessShell —
zero scurgere de shell CRM (grădinițe), zero flash de dublu-sidebar. Fără a atinge `isModuleVisible`
(ca să nu ascundem CRM-ul unui tenant CRM legit).

## Acceptance criteria

- [x] `/app/par/*` redirecționează la `/business/par/*` (toate sub-rutele: onboarding/new/inbox/finance/admin/reports/detail/dashboard)
- [x] `/app/conturi-plata/*` redirecționează la `/business/conturi-plata/*`; rutele canonice mutate sub `/business`
- [x] Toate deep-link-urile interne (`navigate`/`href`) folosesc `/business/par` și `/business/conturi-plata`
- [x] Email + notificările in-app (notify.ts, parPayments.ts) folosesc `/business/par/:id`
- [x] Linkul de nav „Cont de plată" (AppShell) → `/business/conturi-plata`
- [x] `check-nav-links` verde (zero dead links), `check-refs` + `vite build` verzi
- [x] Verificare headless pe prod: nicio scurgere de „grădiniță", un singur sidebar pe rutele PAR

## Files

**Modified:**
- `src/App.tsx` — `RedirectHash` helper + redirect `/app/par/*` și `/app/conturi-plata/*`; rute conturi-plata mutate sub `/business`
- `src/pages/par/*` (ParDashboard, ParInbox, ParDetail, ParCreateForm, ParOnboarding, ParAdmin, ParFinanceQueue, ParReports), `src/components/fin/PaymentApprovalBadge.tsx`, `src/pages/app/FinExpensesPage.tsx`, `src/pages/app/PaymentAccount*.tsx`, `src/components/app/AppShell.tsx` — deep-links → `/business/*`
- `server/services/par/notify.ts`, `server/routes/parPayments.ts`, `server/db/schema/inAppNotifications.ts` — link-uri → `/business/par`

## Tests

- **T-SHELL-501-1** [blocant] Navighez la `/app/par` → redirect la `/business/par`; sidebar-ul e BusinessShell (fără secțiune grădiniță)
- **T-SHELL-501-2** [normal] Email-ul de aprobare conține link `/business/par/:id` (nu `/app/par`)
- **T-SHELL-501-3** [normal] `check-nav-links` verde după schimbarea href-urilor de nav

## DoD

- Build + check-refs + nav-links verzi · verificat headless pe prod · deploy

## Follow-up (backlog descoperit)

- `isModuleVisible`: default „mixt" pe `institutionType` lipsă arată tot CRM-ul. Pentru un produs
  business-only, ar trebui ca un tenant fără tip (sau cu `appKind: business`) să NU vadă deloc nav-ul
  CRM. De evaluat separat (risc: să nu ascundem CRM unui tenant CRM legit).
