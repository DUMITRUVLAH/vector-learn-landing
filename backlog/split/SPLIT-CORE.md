# SPLIT — Două aplicații distincte în același repo (CORE / contract de comportament)

> **Cererea owner-ului (2026-06-14):** același repo, dar **2 aplicații distincte**, fiecare cu
> **landing page propriu, login complet separat, sidebar propriu**:
>
> 1. **CRM Educațional** (Vector Learn) — studenți, profesori, lecții, prezență, note, înscrieri.
> 2. **Business Suite** — **FinDesk** (finanțe) + **PAR** (aprobări plăți) + **ITPark** (rezidenți IT),
>    cele 3 **integrate între ele și comunicând**.
>
> Acesta e contractul de comportament. Fiecare item `SPLIT-xxx` se construiește ca să-l respecte.

## 1. Arhitectura țintă
```
REPO vector-learn-landing
├─ APP "learn"   (CRM Educațional)
│   landing: /            (HomePage actual rămâne pt CRM/educație)
│   login:   /app/login   (există deja)
│   shell:   AppShell      (sidebar CRM: studenți, profesori, lecții, note…)
│   rute:    /app/*
│
└─ APP "business" (Business Suite)
    landing: /business              (landing NOU, dedicat finanțe/business)
    login:   /business/login        (login NOU, sesiune separată)
    shell:   BusinessShell (NOU)     (sidebar: Dashboard, FinDesk, PAR, ITPark)
    rute:    /business/*
      ├─ /business/fin/*     → FinDesk (mapează rutele /app/fin existente)
      ├─ /business/par/*     → PAR
      ├─ /business/itpark/*  → ITPark
      └─ /business/dashboard → dashboard unificat (toate 3)
```

## 2. Separarea aplicațiilor (login complet separat)
- **Tenant capătă `app_kind`** (`learn` | `business`) — un tenant aparține unei aplicații.
  (Coloană nouă pe `tenants`, default `learn` pt cele existente.)
- **Login separat:** `/app/login` (CRM) și `/business/login` (Business). Fiecare validează că
  user-ul aparține unui tenant cu `app_kind` potrivit; altfel 403 „cont greșit pentru această aplicație".
- **Sesiune marcată cu `app_kind`** — middleware-ul respinge accesul încrucișat (un user business
  nu intră pe `/app/*` și invers). Reuse `requireAuth`, adăugă verificarea `app_kind`.
- **Landing-uri separate:** `/` rămâne pt CRM/educație; `/business` = landing nou pt Business Suite
  (hero finanțe, module FinDesk/PAR/ITPark, CTA „Intră în cont" → /business/login).

## 3. Integrarea celor 3 module din Business Suite (comunică între ele)
Sursa de adevăr pentru fiecare modul rămâne CORE-ul lui (FIN-CORE.md, PAR-CORE.md). Punțile:

1. **PAR → FinDesk (plăți):** o cerere de plată aprobată în PAR (`status=approved`/`paid`) creează/
   leagă automat o cheltuială (`fin_expenses`, `source=par`) în FinDesk. Extinde modulul APPROVAL
   existent (`payments.par_request_id`). Punte bidirecțională: din FinDesk vezi PAR-ul sursă.

2. **ITPark → FinDesk (facturi):** un rezident/companie ITPark are facturile + e-Factura + cheltuielile
   lui în FinDesk. Leagă entitatea ITPark de un `fin_parties` (PARTY). Facturile emise pt un rezident
   apar și în dosarul lui ITPark.

3. **Parteneri/clienți comuni (PARTY):** o singură bază `fin_parties` folosită de toate 3 — un client
   e același în PAR (payee/vendor), ITPark (rezident) și FinDesk (client/furnizor). Mapări:
   `par_vendors` ↔ `fin_parties`, entități ITPark ↔ `fin_parties`. Fără duplicare de contacte.

4. **Dashboard unificat:** `/business/dashboard` — KPI din toate 3: finanțe (venituri/cheltuieli/TVA
   din FinDesk), aprobări în așteptare (PAR), rezidenți/contracte (ITPark). Un singur tablou pt CFO.

## 4. Reguli (NON-NEGOTIABLE)
- **Reuse, don't rebuild:** NU rescrie FinDesk/PAR/ITPark — doar adaugă shell-ul Business, login-ul
  separat, rutele `/business/*` (care refolosesc paginile existente) și punțile de integrare.
- **Tenant isolation + app_kind** pe fiecare query (un tenant business nu vede date learn).
- **Migrările** pornesc `> max(origin/main)`; coloana `app_kind` pe tenants = o migrare cu
  `ADD COLUMN IF NOT EXISTS` + default `learn` (backfill sigur). FK-uri în `DO $$` guard (§3.5.1quater).
- **Punțile de integrare** se construiesc cu `ADD COLUMN IF NOT EXISTS` pe tabele partajate, nu
  re-CREATE (§3.5.1quater regula 3). integration-architect trebuie `CONNECTED`.
- **Design system** Vector 365, light+dark, WCAG AA; Business Suite poate avea accent de brand
  propriu (tokeni), dar aceiași tokeni semantici.
- **Local smoke gate:** după fiecare fază, `db:reset && db:seed`, ambele login-uri (`/app/login` +
  `/business/login`) returnează user, rutele cheie 200 (§3.5.1quater regula 8).

## 5. Ce NU se face
- Nu se duplică cod între aplicații (shell-uri separate, dar componente de modul partajate).
- Nu se mută FinDesk/PAR/ITPark în alt repo (owner: „același repo la etapa actuală").
- Nu se sparge CRM-ul educațional existent — `/app/*` rămâne funcțional neatins.
