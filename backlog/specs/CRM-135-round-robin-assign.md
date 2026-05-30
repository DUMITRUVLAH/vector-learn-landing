---
id: CRM-135
title: "Round-robin auto-assign pentru lead-uri noi"
milestone: CRM
phase: I
status: pending
depends_on: [CRM-101, CRM-103, CRM-104]
slug: round-robin-assign
---

## Goal

Când un lead nou sosește (webform, Facebook ad, import CSV, sau creat manual fără a selecta
un responsabil), sistemul îl auto-asignează în ordine circulară (round-robin) unui utilizator
din lista configurată per tenant.

Elimina situația în care lead-urile noi rămân `assignedTo = null` și nimeni nu le vede.

---

## In scope

- **Schema** — `tenants` extinsă cu:
  - `rr_enabled boolean NOT NULL DEFAULT false` — activează round-robin
  - `rr_user_ids uuid[] NOT NULL DEFAULT '{}'` — lista utilizatorilor în rotație (ordinea contează)
  - `rr_index integer NOT NULL DEFAULT 0` — pointerul la următorul utilizator de asignat
  (folosind `FOR UPDATE` pe rândul tenantului pentru a evita race conditions)
- **Server logic** — funcție `autoAssign(tenantId, currentAssignedTo)`:
  - dacă `rr_enabled = false` sau `rr_user_ids` e gol → returnează `currentAssignedTo` nemodificat
  - dacă `currentAssignedTo != null` → nu suprascrie
  - altfel: preia `rr_user_ids[rr_index % len]`, incrementează `rr_index`, salvează, returnează userId
  - Lock pe rând cu `SELECT ... FOR UPDATE` în aceeași tranzacție
- **Integrare** — apelat la:
  - `POST /api/leads/intake` (webform)
  - `POST /api/leads` (creare manuală, dacă `assignedTo` lipsă)
  - `POST /api/leads/bulk-import` (CSV import — fiecare lead)
  - `POST /api/webhooks/facebook` (webhook Fb ads)
- **UI Settings** — pagina `/app/settings` (tab „CRM" sau secțiunea existentă):
  - Toggle „Asignare automată (round-robin)"
  - Dacă activ: listă multi-select utilizatori (drag pentru reordonare, sau butoane ↑/↓)
  - Indicator „Urmează: <Prenume>" bazat pe `rr_index % len`
  - Buton „Salvează" → `PATCH /api/settings/rr-assign`
- **`PATCH /api/settings/rr-assign`** — body `{ enabled: bool, userIds: uuid[] }`, admin only.

## Out of scope

- Auto-asignare bazată pe încărcătură (workload balancing)
- Teritorii / zone geografice
- Reguli de skip (ex: dacă utilizatorul e absent)
- Notificare push/email la asignare nouă (poate fi adăugat în CRM-134 mentions infra)

---

## User stories

- **Andreea (director)**: Configurez lista celor 3 colegi din echipa de vânzări. Când un lead
  vine din publicitate Facebook la 3 AM, e deja asignat lui Ion, Mara, Ion, Mara... fără
  nicio intervenție manuală.
- **Ion (agent vânzări)**: Dimineața văd în kanban doar lead-urile mele. Nu mai trebuie să
  „revendic" lead-urile neasignate manual.

---

## Acceptance criteria

- [ ] `tenants` are coloanele `rr_enabled`, `rr_user_ids`, `rr_index`; migrare commitată.
- [ ] `POST /api/leads` fără `assignedTo` + RR activ → lead asignat utilizatorului corect din rotație.
- [ ] `POST /api/leads` cu `assignedTo` completat + RR activ → `assignedTo` nu e suprascris.
- [ ] Al doilea lead fără `assignedTo` → urmează al doilea utilizator din lista RR.
- [ ] Race condition: 2 lead-uri simultane asignate la utilizatori diferiți (nu ambele la același).
- [ ] Dacă `rr_enabled = false`, `POST /api/leads` fără `assignedTo` → `assignedTo = null`.
- [ ] UI Settings: toggle vizibil, multi-select utilizatori, indicator „Urmează".
- [ ] `PATCH /api/settings/rr-assign` cu rol non-admin → 403.
- [ ] Migrare `0017_crm135_rr_assign.sql` commitată; `db:reset + db:seed` succed.
- [ ] Multi-tenant: setările RR ale tenantului A nu afectează tenantul B.
- [ ] 0 violări axe critical/serious; dark mode OK.
- [ ] TypeScript strict; zero `any`.

---

## Files

### Nou
- `drizzle/0017_crm135_rr_assign.sql` — migrare ALTER TABLE tenants
- `server/lib/roundRobin.ts` — funcție `autoAssign(db, tenantId, currentAssignedTo)`
- `server/routes/settings.ts` — `GET /api/settings/rr-assign`, `PATCH /api/settings/rr-assign`
- `src/pages/app/SettingsPage.tsx` (sau componentă nouă `src/components/crm/RRSettings.tsx`)
- `src/lib/api/settings.ts` — fetch helpers
- `src/lib/api/settings.test.ts` — unit tests

### Modificat
- `server/db/schema/tenants.ts` — adaugă `rr_enabled`, `rr_user_ids`, `rr_index`
- `server/db/schema/index.ts` — re-export
- `server/routes/leads.ts` — apelează `autoAssign` în POST /api/leads și POST /api/leads/intake
- `server/routes/webhooks.ts` (sau echivalent) — apelează `autoAssign` în handler Facebook
- `server/index.ts` — mount `/api/settings`
- `backlog/crm/TEST-SCENARIOS.md` — adaugă scenariile CRM-135

---

## Tests (Given/When/Then)

- **T-CRM-135-1** `[blocant]` Given `autoAssign` cu `rr_enabled=false`, When called, Then returnează `null` (neschimbat).
- **T-CRM-135-2** `[blocant]` Given `rr_enabled=true`, `rr_user_ids=['u1','u2']`, `rr_index=0`, `currentAssignedTo=null`, When `autoAssign`, Then returnează `'u1'` și `rr_index` devine `1`.
- **T-CRM-135-3** `[blocant]` Given `rr_index=1`, `rr_user_ids=['u1','u2']`, When `autoAssign`, Then returnează `'u2'` și `rr_index` devine `2`.
- **T-CRM-135-4** `[blocant]` Given `rr_index=2` și `len=2` (wrap-around), When `autoAssign`, Then returnează `'u1'` (index % 2 = 0).
- **T-CRM-135-5** `[blocant]` Given `currentAssignedTo='u3'` + RR activ, When `autoAssign`, Then returnează `'u3'` (no override).
- **T-CRM-135-6** `[blocant]` Given `POST /api/leads` fără `assignedTo` + RR activ cu `['u1']`, Then lead creat cu `assignedTo='u1'`.
- **T-CRM-135-7** `[blocant]` Given `PATCH /api/settings/rr-assign` cu rol `teacher` (non-admin), Then `403`.
- **T-CRM-135-8** Multi-tenant: lead creat în tenant A nu consumă RR-ul tenantului B.

---

## DoD (Definition of Done)

- [ ] Toate acceptance criteria bifate.
- [ ] Toate scenariile `[blocant]` verzi.
- [ ] Migrare commitată; `db:generate` nu lasă diff suplimentar.
- [ ] `npm run build && npm run typecheck && npm run lint && npm test` verde.
- [ ] PR deschis pe `preview/sched-all` cu body structurat.
