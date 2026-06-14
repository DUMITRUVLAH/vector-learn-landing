# SPLIT — Secvența de build (driver autopilot)

> Separă repo-ul în 2 aplicații (CRM Educațional + Business Suite) și integrează FinDesk+PAR+ITPark.
> Sursa de adevăr: [`SPLIT-CORE.md`](./SPLIT-CORE.md). 1 fază = 1 branch = 1 PR (§0.2).
> Migrările pornesc `> max(origin/main)`. Reuse, don't rebuild. Local smoke gate după fiecare fază.

## Faza 1 — Fundație separare (app_kind + login separat) → `feat/SPLIT-foundation`
| Item | Titlu | Migr | Depinde |
|------|-------|------|---------|
| `SPLIT-001` | `tenants.app_kind` (learn\|business) + migrare ADD COLUMN IF NOT EXISTS default 'learn' + backfill + seed 1 tenant business demo | da | — |
| `SPLIT-002` | Middleware `requireApp(kind)` + marcare sesiune cu app_kind + respinge acces încrucișat | — | SPLIT-001 |
| `SPLIT-003` | Login separat `/business/login` (sesiune business) + validare app_kind la login pe ambele | — | SPLIT-002 |

## Faza 2 — Business Suite shell + landing → `feat/SPLIT-business-shell`
| Item | Titlu | Migr | Depinde |
|------|-------|------|---------|
| `SPLIT-101` | `BusinessShell` (sidebar: Dashboard, FinDesk, PAR, ITPark) + layout + gating rol | — | SPLIT-003 |
| `SPLIT-102` | Landing `/business` (hero finanțe, module, CTA → /business/login) | — | SPLIT-001 |
| `SPLIT-103` | Rute `/business/*` care refolosesc paginile FinDesk/PAR/ITPark existente (mapare, fără rescriere) | — | SPLIT-101 |

## Faza 3 — Punți de integrare (cele 3 module comunică) → `feat/SPLIT-integration`
| Item | Titlu | Migr | Depinde |
|------|-------|------|---------|
| `SPLIT-201` | PARTY comun: mapează `par_vendors` ↔ `fin_parties` + entități ITPark ↔ `fin_parties` (ADD COLUMN IF NOT EXISTS link ids) | da | SPLIT-103 |
| `SPLIT-202` | PAR → FinDesk: PAR aprobat → cheltuială `fin_expenses` (source=par); punte bidirecțională în UI | — | SPLIT-201 |
| `SPLIT-203` | ITPark → FinDesk: rezident ITPark → facturi/e-Factura/cheltuieli în FinDesk; dosar ITPark arată facturile | — | SPLIT-201 |
| `SPLIT-204` | Dashboard unificat `/business/dashboard`: KPI finanțe (FinDesk) + aprobări (PAR) + rezidenți (ITPark) | — | SPLIT-202, SPLIT-203 |

## Faza 4 — Curățare CRM (separare clară) → `feat/SPLIT-crm-cleanup`
| Item | Titlu | Migr | Depinde |
|------|-------|------|---------|
| `SPLIT-301` | AppShell CRM: scoate din sidebar-ul educațional modulele business (FinDesk/PAR/ITPark mută în Business Suite) | — | SPLIT-101 |
| `SPLIT-302` | Landing `/` rămâne CRM educațional; link discret „Business Suite" → /business | — | SPLIT-102 |
| `SPLIT-303` | Smoke E2E: ambele login-uri funcționează izolat; acces încrucișat respins; rutele cheie 200 | — | SPLIT-204, SPLIT-301 |

## Backlog descoperit (de notat, nu construit pe furiș)
- Branding per-app (culori/logo diferite CRM vs Business) — tokeni de temă.
- Switcher de aplicație dacă owner-ul decide ulterior cont comun.
- Migrare FinDesk/PAR/ITPark în repo separat (owner: nu acum).

## Total: 13 items / 4 faze.
