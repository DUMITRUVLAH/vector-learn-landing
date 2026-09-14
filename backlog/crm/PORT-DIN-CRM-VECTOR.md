# Portarea CRM-ului complet din crm-vector în FinFlow

**Cererea ownerului:** „copie CRM de aici [github.com/DUMITRUVLAH/crm-vector] — tu ai
făcut practic un MVP, dar al nostru e mult mai extins."

Corect. Fazele 1–2 au livrat pipeline + produse + fișa leadului + etape configurabile.
Documentul ăsta ține evidența a ce mai e de portat, ca nimic să nu se piardă pe drum.

## De ce nu e „copy-paste"

Măsurat pe codul din crm-vector: **din 6443 de linii de domeniu, doar 73 (1%) ating
baza de date.** Restul sunt funcții pure — se mută aproape neatinse. Ce NU se mută:

| | crm-vector | FinFlow |
|---|---|---|
| Bază | Supabase, un singur tenant | Postgres multi-tenant |
| Izolare | RLS `USING(true)` — practic niciuna | `tenant_id` verificat în FIECARE query |
| Acces date | `supabase.from()` din browser | rute Hono + Drizzle pe server |
| UI | shadcn + React Query | design system propriu + `api()` |
| Migrări | manual, de owner | la deploy |

Deci: **logica se portează, stratul de date se rescrie.** Fiecare tabelă portată
primește `tenant_id` și fiecare query filtrul lui — fără asta e scurgere între clienți.

## Stare

| Modul | Linii în crm-vector | Fază | Stare |
|---|---|---|---|
| leads + pipeline | 583 + 134 | 1–2 | ✅ livrat |
| etape configurabile | — | 2 | ✅ livrat |
| fișa leadului | — | 2 | ✅ livrat |
| products | 363 | 1 | ✅ livrat |
| tasks + today | 199 + 135 | 3 | ⏳ |
| tags | 151 | 3 | ⏳ |
| importFile (CSV/XLSX) | 576 | 4 | ⏳ |
| companies + duplicates | 249 + 733 | 4 | ⏳ |
| documents (oferte/contracte) | 740 + docs/* | 5 | ⏳ |
| reports + analytics | 478 + 275 | 6 | ⏳ |
| automations | 230 | 7 | ⏳ |
| assignment | 641 | 7 | ⏳ |
| cadences | 305 | 7 | ⏳ |
| reengagement | 371 | 7 | ⏳ |
| calls + channels | 413 + 341 | 8 | ⏳ |
| roles + audit | 158 + 147 | 8 | ⏳ |

**Nu se portează** (sunt specifice Vector Academy, nu CRM): `taskBoards`, `checklists`,
`strategy`, `coursesSync`, `importKommo`, `kommoNotes`, `boardTemplates`.

## Reguli pentru fiecare fază

1. Tabelă nouă → `tenant_id` + index + `export * from` în `server/db/schema/index.ts`
   + migrare cu prefix peste maximul de pe `origin/main` + heal în `sync-schema.ts`
   (tabelele NU se vindecă generic, doar coloanele).
2. Fiecare query filtrat pe tenant. Cross-tenant → 404, nu 403.
3. Testul care contează în fiecare fază: **un rând al unui workspace nu e vizibil
   din altul.** Se scrie primul.
4. Gate: teste pe zona atinsă + `tsc` la baseline + porțile statice + e2e pe
   aplicația reală înainte de livrare pe `main`.
