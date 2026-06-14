---
id: SPLIT-301
title: "AppShell CRM: scoate din sidebar-ul educațional modulele business"
milestone: SPLIT
phase: "4"
status: pending
branch: feat/SPLIT-crm-cleanup
depends_on: [SPLIT-101]
spec: backlog/specs/SPLIT-301.md
---

## Goal

Verifică și confirmă că AppShell (`src/components/app/AppShell.tsx`) nu conține entry-uri de navigare pentru FinDesk, PAR, sau ITPark. Dacă există rămășițe de navigare business în sidebar-ul CRM educațional — le scoate. Dacă sunt deja absente (fapt confirmat că e cazul — AppShell nu are aceste entry-uri), adaugă o separare vizuală clară și un banner/notice discret că modulele business sunt în Business Suite.

**Situație actuală (verificată):** AppShell.tsx nu are FinDesk/PAR/ITPark în sidebar — sunt deja separate. Totuși, rutele `/app/fin/*` sunt montate în App.tsx și sunt accesibile din CRM. SPLIT-301 asigură că:
1. Nu există linkunri/entri-uri de navigare spre `/app/fin/`, `/app/par`, `/app/itpark` în AppShell.
2. Rutele `/app/fin/*`, `/app/par/*`, `/app/itpark/*` din App.tsx rămân montate (backward compat cu PRs vechi) dar NU sunt promovate în navigarea educaționala.
3. O notă minimalistă în secțiunea „Finanțe" din AppShell explică că FinDesk complet e în Business Suite.

## User Stories

- Ca director de academie, vreau ca sidebar-ul CRM să arate doar modulele educaționale, pentru că confuzia cu modulele business distrage atenția.
- Ca agent CRM, vreau să știu că Business Suite există dar să nu fiu forțat să intru în el din fluxul educațional.

## Acceptance Criteria

- [ ] AppShell.tsx nu conține entry-uri de navigare cu href-uri spre `/app/fin/*`, `/app/par*`, `/app/itpark*`.
- [ ] Secțiunea „Finanțe" din AppShell conține: Plăți, Facturi, Cont de plată, Contracte, Salarizare (educațional) — și un sub-text discret sau tooltip „FinDesk complet → Business Suite".
- [ ] Nicio rută funcțională nu este ruptă (rutele /app/fin/* rămân în App.tsx pentru backward compat).
- [ ] AppShell rămâne vizual curat; nicio poluare de menu items sau secțiune business intrusivă.
- [ ] Build + typecheck green.

## Files Affected

- `src/components/app/AppShell.tsx` — verifică + eventuale curățiri minore + comentariu discret

## Tests

- **T-SPLIT-301-1** [blocant] Given AppShell este randat, When se verifică lista de itemi de nav, Then nu există itemi cu href startsWith("/app/fin/") sau "/app/par" sau "/app/itpark".
- **T-SPLIT-301-2** [normal] Given AppShell este randat, When se verifică secțiunea Finanțe, Then există entry-urile educaționale (Plăți, Facturi, Contracte, Salarizare).
- **T-SPLIT-301-3** [normal] Given ruta /app/fin/invoices este accesată direct, When pagina se încarcă, Then nu produce crash (ruta există, backward compat).

## DoD

- Verificare confirmată prin test T-SPLIT-301-1.
- Build green.
- Reviewer APPROVED.
