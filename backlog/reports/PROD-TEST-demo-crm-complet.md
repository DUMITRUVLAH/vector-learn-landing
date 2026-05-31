# Raport testare reală — preview producție `demo/crm-complet`

**Data:** 2026-05-31
**Preview URL:** https://vector-learn-landing-hdqiwueps-dumitruvlahs-projects.vercel.app
**Branch:** demo/crm-complet (CRM-117…136 + CONTRACT-501 + FEEDBACK-601)
**Metodă:** Playwright headed browser (local) + vercel curl/logs (preview producție)

---

## Rezumat

| Mediu | Login | 14 pagini | Verdict |
|---|---|---|---|
| **Local** (DB migrat 0000-0023 + seed) | ✅ OK | ✅ 14/14 verde, 0 erori consolă/network | **Codul e corect end-to-end** |
| **Preview producție** (Supabase, fără migrări) | ❌ 500 | ⛔ blocat la login | **DB-ul de prod e în urmă cu schema** |

**Concluzie:** Codul funcționează perfect. Singura problemă în producție este că **migrările 0016-0023 nu au fost rulate pe Supabase**, deci schema DB-ului real nu se potrivește cu codul nou.

---

## ✅ REZOLVAT (2026-06-01) — migrările aplicate pe Supabase producție

Credențiale Supabase reîmprospătate via `vercel env pull` (proiect link-uit la Vercel — nu mai
e nevoie de parolă manuală). Rulat `DATABASE_PATH="" DATABASE_URL=<supabase-direct> npm run db:migrate`
(DATABASE_PATH gol e CRUCIAL — altfel `preferLocalPglite` forțează PGlite și migrarea rulează local
degeaba). Rezultat: **16→25 migrări, 30→41 tabele**. Toate tabelele noi create, `tenants.sla_hot_minutes`
există. **Login pe preview verificat: 200 OK** (Andreea Mitran / Demo Lingua School). Problema #1 închisă.

---

## Problema #1 (BLOCANT — acum REZOLVAT) — schema DB producție în urmă

**Eroare exactă din logurile Vercel:**
```
PostgresError: column "sla_hot_minutes" does not exist
code: 42703 (errorMissingColumn)
la POST /api/auth/login → 500 (287ms)
```

**Cauză:** login citește tabela `tenants`, care în cod are coloanele SLA (`sla_hot_minutes`, `sla_default_hours`, `rot_days` — adăugate de CRM-124, migrarea 0018). DB-ul Supabase de producție nu are aceste coloane → orice query pe `tenants` (deci și login) crapă.

**Migrări care lipsesc pe producție (8):**
`0016_crm119_saved_views`, `0017_crm123_notifications`, `0018_crm124_sla`,
`0019_crm125_forecast`, `0020_crm127_audit_log`, `0021_crm126_cadences`,
`0022_contract501_contracts`, `0023_feedback601_forms`.

**Fix:** rulează migrările pe Supabase producție: `DATABASE_URL=<supabase-prod> npm run db:migrate`
(NU `db:reset` — acela șterge datele! Doar `db:migrate` aplică incremental.)

---

## Problema #2 (REZOLVAT) — login se rotea la infinit

**Simptom inițial:** butonul „Conectare" se rotea la infinit (POST atârna 30s → timeout).
**Cauză:** `scripts/build-vercel.mjs` avea `shouldAddHelpers: true` — Vercel pre-citea body-ul
request-ului, golind stream-ul înainte ca Hono să-l citească; `c.req.json()` aștepta la infinit.
**Fix aplicat:** `shouldAddHelpers: false` (port din main #69, commit pe demo). După fix, login-ul
nu mai atârnă — ajunge la DB (și acolo lovește Problema #1).

---

## Problema #3 (de design) — `/api/health` cere auth

`GET /api/health` și `/api/health/db` întorc `{"error":"unauthenticated"}` (401) pe preview.
Health check-urile ar trebui să fie publice (înainte de middleware-ul de auth) ca monitoringul
să le poată folosi. Minor — nu blochează, dar de corectat.

---

## Testare locală — detaliu (DB migrat, tot verde)

Login OK → `/#/app/dashboard`. Toate 14 paginile fără erori de consolă sau network:
Dashboard, Azi, Leads, Elevi, Orar, Profesori, Plăți, **Contracte**, **Feedback**, Cadences,
Audit Log, Salarizare, Analytics CRM, Automatizări. Screenshots în `/tmp/e2e-*.png`.

Verificat manual prin API local: contract creat (`DL1-31.05.2026`), formular feedback creat+listat.

---

## Recomandare

1. **Pentru a testa preview-ul cu DB funcțional:** rulează `npm run db:migrate` pe Supabase prod
   (sigur — doar adaugă coloane/tabele, nu șterge). Apoi setează parola demo dacă lipsește.
2. **Înainte de merge în `main` (producție reală):** migrările TREBUIE rulate pe Supabase ÎNAINTE
   sau în același deploy, altfel producția reală cade exact ca preview-ul (login 500).
3. **Fix #3** (health public) — mută rutele `/api/health*` înainte de middleware-ul de auth.
