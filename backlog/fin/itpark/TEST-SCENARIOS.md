# ITPARK — TEST-SCENARIOS (gate dur per item)

> `[blocant]` = dacă pică, repară pe loc înainte de următorul item (§0.2). `[normal]` = de dorit.
> Fixture de aur: dosarul **Vector Academy 2025** (vezi BUILD-SEQUENCE.md).

## Faza A — Fundație
- **T-001-1** [blocant] `db:generate` lasă 0 fișiere uncommitted; prefix `0116` > `0114`.
- **T-001-2** [blocant] `db:reset && db:seed` trec; tabelele itpark există.
- **T-001-3** [blocant] `schema/index.ts` conține `export * from "./itpark"` (altfel `db.query.itparkEngagements` undefined → 500).
- **T-002-1** [blocant] seed-ul are toate codurile CAEM eligibile din CORE §4; `85.59` și `62.02` prezente, `eligible=true`.
- **T-002-2** [normal] un cod neprezent (ex. `47.11`) → `eligible=false`.
- **T-003-1** [normal] `itpark_settings` are `eligibilityThresholdPct=70`, `toleranceMonths=2`.

## Faza B — Dosar
- **T-101-1** [blocant] POST `/api/itpark/engagements` (autentificat) → 201 + JSON dosar; GET listă → conține dosarul; izolat pe tenant.
- **T-101-2** [blocant] ruta e montată în `app.ts` (altfel SPA fallback → „Unexpected token '<'").
- **T-102-1** [normal] wizard 3 pași salvează dosarul; câmpurile obligatorii validate (IDNO, perioadă).

## Faza C — Venit
- **T-201-1** [blocant] CRUD linie venit: creezi/editezi/ștergi; suma în `*_cents`, afișaj 2 zecimale.
- **T-202-1** [blocant] import prin lipire a 96 linii Vector Academy → 96 linii salvate, fără pierdere; sumele se păstrează la bani.
- **T-202-2** [normal] CSV malformat → eroare clară per rând, nu crash.
- **T-203-1** [normal] „Servicii instruire domeniu digital" → sugestie `85.59`; „Servicii consultanta in domeniu digital" → `62.02`.

## Faza D — Calcul
- **T-301-1** [blocant] din cele 96 linii: total eligibile = **1.971.197,19**, total vânzări = **2.227.917,19**, pondere = **88,48%** (toleranță ±0,01).
- **T-301-2** [blocant] per cod: `62.02` = 98.000,00 (4,40%); `85.59` = 1.873.197,19 (84,08%).
- **T-302-1** [blocant] Anexa 4: 12 luni; cumulativ eligibil decembrie = 1.971.197,19; pondere cumulativă decembrie = 88,48%.
- **T-302-2** [blocant] prag: pondere YTD 88,48% ≥ 70% → conform; un dosar sub 70% > 2 luni → flag „risc statut".
- **T-302-3** [blocant] zero linii → fără `#DIV/0!` (afișează 0 / „—", nu eroare).

## Faza E — Anexe
- **T-401-1** [blocant] Anexa 2 rândurile 7 & 8 = totalurile din motor (consistent cu Anexa 3).
- **T-402-1** [blocant] Anexa 3: footer per cod + total = motorul; randare a 96 rânduri fără crash.
- **T-403-1** [blocant] gate consistență: Anexa 2 rând 7/8 == Anexa 3 footer == Anexa 4 Total; dacă diferă → eroare, dosarul nu devine „Ready".

## Faza F — Scrisori
- **T-501-1** [blocant] fiecare scrisoare injectează denumirea, IDNO, perioada, adresa rezidentului (fără „XXX"/placeholder rămas).
- **T-502-1** [normal] declarația conține art. 312 CP + perioada + reprezentant legal.

## Faza G — Export
- **T-601-1** [blocant] PDF generat conține toate piesele (Anexa 2,3,4 + 5 scrisori + declarație); diacritice `ă â î ș ț` corecte (fără mojibake).
- **T-602-1** [blocant] „Ready" blocat dacă gate-ul de consistență (T-403-1) e roșu; permis când e verde.
- **T-602-2** [normal] fiecare export → intrare în `itpark_audit`.

## Faza H — AI & Polish
- **T-701-1** [blocant] AI propune cod/linie dar NU modifică totaluri; cifrele rămân deterministe; toate sugestiile în `aiAuditLog`.
- **T-702-1** [normal] dashboard arată pondere YTD, status prag, deadline aprilie.

## Gate-uri transversale (fiecare PR de fază)
- build + typecheck + lint + vitest verzi; `npm run check-refs` + `vite build` verzi.
- a11y axe 0 violări critical/serious pe paginile noi; dark mode OK; fără hex hardcodat în `.tsx`.
- live API smoke: login + endpoint-urile fazei → 200.
