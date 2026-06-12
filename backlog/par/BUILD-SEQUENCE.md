# PAR — Secvența de build (driver pas-cu-pas pentru autopilot)

> **Acesta este șoferul autopilotului pentru modulul PAR (Payment Action Request).** La „run",
> construiești **un singur item PAR-xxx odată**, în ordinea de mai jos. NU sări, NU comasa item-uri
> într-un commit, NU trece mai departe cu teste roșii (CLAUDE.md §0.2).
>
> Regula de aur: **build → rulează scenariile item-ului din `TEST-SCENARIOS.md` → dacă pică
> `[blocant]`, REPARĂ pe loc → abia apoi treci la următorul.** Sursa de adevăr pentru comportament
> este [`PAR-CORE.md`](./PAR-CORE.md).

## Cum se citește (pentru orchestrator)

1. Item-urile sunt grupate în **6 faze (A→F)**. Fazele se fac în ordine.
2. În interiorul unei faze, item-urile se fac în ordinea numerică.
3. Fiecare item are: spec dedicat (`backlog/specs/PAR-xxx.md`), referințe CORE, scenarii de test
   (`TEST-SCENARIOS.md#par-xxx`), dependențe.
4. **Livrare grupată pe fază (CLAUDE.md §0.2):** o fază = un branch (`feat/PAR-faza-<X>-<slug>`) = un
   PR. Commit separat per item (`feat(PAR-101): …`) pentru trasabilitate.
5. Un item e `done` DOAR dacă: cod livrat + toate scenariile lui `[blocant]` trec + reviewer APPROVED
   + integration-architect fără `COMPETING_SYSTEM` + build/typecheck/lint/test verzi. Altfel →
   încearcă un fix; dacă eșuează structural → `blocked` cu raport.
6. Între item-uri: o singură linie `[ITEM] PAR-xxx done → PR #N · next: PAR-yyy`.

**Anti-pierdere de feature-uri:** dacă găsești un comportament din CORE neacoperit de specul curent,
notează-l în „Backlog descoperit" la finalul acestui fișier și continuă doar scope-ul item-ului.

---

## Faza A — Fundație (date + roluri + config org)

| Item | Titlu | Spec | CORE | Depinde de |
|------|-------|------|------|-----------|
| `PAR-001` | Schema `par.ts` (toate tabelele §2) + enums + migrare `0113_*` + index export + seed org demo | [PAR-001](../specs/PAR-001-schema.md) | §2 | — |
| `PAR-002` | Roluri PAR + `requirePARRole` middleware + `par_members` + DOA matrix (tabel) + seed DOA implicit | [PAR-002](../specs/PAR-002-roles-doa.md) | §1, §3 | PAR-001 |
| `PAR-003` | Config org: budget codes / departments / projects / vendors / settings (CRUD API + seed) | [PAR-003](../specs/PAR-003-org-config.md) | §2, §9 | PAR-001 |

## Faza B — Creare & trimitere PAR (fluxul requestorului)

| Item | Titlu | Spec | CORE | Depinde de |
|------|-------|------|------|-----------|
| `PAR-101` | API `POST/GET/PATCH /api/par` — header (secțiunile 1–9) + draft + numerotare `PAR-2026-0001` | [PAR-101](../specs/PAR-101-create-api.md) | §0, §2, §4 | PAR-002, PAR-003 |
| `PAR-102` | Line items (secț. 10) — editor + auto-sumă + `total_estimated_cents` + nota 10% | [PAR-102](../specs/PAR-102-line-items.md) | §0.10, §3 | PAR-101 |
| `PAR-103` | End-use (11) + payee block (12) cu validare IBAN MD (mod-97) + IDNP + alegere vendor | [PAR-103](../specs/PAR-103-enduse-payee.md) | §0.11–12, §9 | PAR-101 |
| `PAR-104` | Atașamente (secț. 13) — upload + kind + describe (reuse pattern existent) | [PAR-104](../specs/PAR-104-attachments.md) | §0.13 | PAR-101 |
| `PAR-105` | Wizard UI `/app/par/new` (header→clasificare→linii→end-use→payee→atașamente→review→submit) | [PAR-105](../specs/PAR-105-create-wizard.md) | §6 | PAR-102, PAR-103, PAR-104 |
| `PAR-106` | Dashboard + listă `/app/par` (cererile mele, status chips, filtre, totaluri) | [PAR-106](../specs/PAR-106-dashboard-list.md) | §6 | PAR-101 |

## Faza C — Aprobare (fluxul approverului)

| Item | Titlu | Spec | CORE | Depinde de |
|------|-------|------|------|-----------|
| `PAR-107` | Motor de rutare DOA — pe submit, generează lanțul `par_approvals` din matrice (prag+charge_to) | [PAR-107](../specs/PAR-107-routing-engine.md) | §3, §4 | PAR-002, PAR-101 |
| `PAR-108` | Inbox approver `/app/par/inbox` + Approve/Reject/Request-changes + comentariu + e-semnătură | [PAR-108](../specs/PAR-108-approver-inbox.md) | §1, §4 | PAR-107 |
| `PAR-109` | Aprobare secvențială multi-nivel + escaladare prag + lock pe pași + integritate (immutable după submit) | [PAR-109](../specs/PAR-109-sequential-approval.md) | §3, §4, §9 | PAR-108 |
| `PAR-110` | Timeline & audit per PAR (cine/ce/când, diff, semnături) | [PAR-110](../specs/PAR-110-timeline-audit.md) | §4, §9 | PAR-101 |
| `PAR-111` | Notificări (in-app + email): submit / pending-my-approval / approved / rejected / paid | [PAR-111](../specs/PAR-111-notifications.md) | §7 | PAR-108 |

## Faza D — Finanțe / execuție plată

| Item | Titlu | Spec | CORE | Depinde de |
|------|-------|------|------|-----------|
| `PAR-112` | Coadă finanțe `/app/par/finance` + secțiunea 16 (PAR BL / Date Received / Received By / Assigned To) | [PAR-112](../specs/PAR-112-finance-queue.md) | §0.16, §1 | PAR-109 |
| `PAR-113` | Execuție plată: actual amount + payment date/ref + proof + **regula 10% → reapproval_required** | [PAR-113](../specs/PAR-113-payment-execution.md) | §3, §4 | PAR-112 |

## Faza E — PDF (formularul exact)

| Item | Titlu | Spec | CORE | Depinde de |
|------|-------|------|------|-----------|
| `PAR-114` | Generator PDF `parPdf.ts` — fidel sample-ului, toate cele 16 secțiuni, checkbox-uri, semnături, MDL | [PAR-114](../specs/PAR-114-pdf-generator.md) | §0, §5 | PAR-109 |
| `PAR-115` | Buton „Download PDF" pe `/app/par/:id` + atașează PDF-ul la înregistrare | [PAR-115](../specs/PAR-115-pdf-download.md) | §5 | PAR-114 |

## Faza F — Admin, rapoarte, polish

| Item | Titlu | Spec | CORE | Depinde de |
|------|-------|------|------|-----------|
| `PAR-116` | Admin DOA matrix UI `/app/par/admin` (praguri per rol/department/charge_to) + members/roles | [PAR-116](../specs/PAR-116-admin-doa.md) | §3, §1 | PAR-107, PAR-003 |
| `PAR-117` | Rapoarte: spend pe budget code/department/project + aging + cycle time + export CSV | [PAR-117](../specs/PAR-117-reports.md) | §8 | PAR-113 |
| `PAR-118` | Detaliu PAR `/app/par/:id` complet — toate 16 secțiuni read-only + acțiuni role-aware + status timeline | [PAR-118](../specs/PAR-118-detail-page.md) | §6 | PAR-109, PAR-114 |

> **Ordinea reală de build** respectă dependențele: A (001→003) → B (101→106) → C (107→111) →
> D (112→113) → E (114→115) → F (116→118). PAR-118 (pagina detaliu completă) vine la urmă pentru că
> agregă tot, dar o versiune minimală a paginii de detaliu e livrată odată cu PAR-106/108 ca să poți
> testa fluxul; PAR-118 o duce la paritate completă cu formularul.

---

## Backlog descoperit (se completează în timpul build-ului)

- _(gol la start — orchestratorul adaugă aici comportamente din CORE neacoperite de specul curent)_

---

## Definition of Done pe fază (gate înainte de PR)

- [ ] Toate item-urile fazei `done` (scenarii `[blocant]` verzi).
- [ ] `npm run build` + `npm run typecheck` + `npm run check-refs` verzi.
- [ ] Migration gate: `db:generate` 0 fișiere uncommitted; `db:reset && db:seed` trec; prefix > `0112`.
- [ ] Live API smoke: login + endpoint-urile fazei → 200 cu JSON corect.
- [ ] integration-architect: fără `COMPETING_SYSTEM` (PAR reutilizează auth/tenant/PDF/notificări).
- [ ] Reviewer APPROVED după bucla review→improve.
- [ ] Persona reports salvate (manager + utilizator).
- [ ] Un singur PR pe fază, body structurat.
