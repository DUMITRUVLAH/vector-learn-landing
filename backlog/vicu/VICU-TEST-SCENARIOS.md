# VICU — TEST-SCENARIOS (gate dur per val)

> Regula §3.5.1quater: testează ACȚIUNEA (invocă endpoint-ul/jobul cu input realist, asertează
> răspunsul + efectul în DB), nu afordanța. Un scenariu `[blocant]` roșu → repară pe loc,
> re-rulează, apoi treci mai departe. e2e per val: `scripts/e2e-vicu-w<N>.mjs` în crm-vector
> (mock Telegram: POST direct pe webhook cu update-uri fabricate; nu e nevoie de Telegram real).

## W0 — Schelet
- **W0-S1 [blocant]** Migrarea W0 se aplică pe DB curat; toate tabelele `vicu_*` + `telegram_links` există; RLS activ; GRANT-uri prezente (fără 42501 la select autentificat).
- **W0-S2 [blocant]** POST pe webhook FĂRĂ `X-Telegram-Bot-Api-Secret-Token` corect → 401, nimic scris în DB.
- **W0-S3 [blocant]** `/start <cod valid>` → rând în `telegram_links` legat de profilul corect; `/start <cod greșit>` → refuz politicos, zero rânduri.
- **W0-S4 [blocant]** Mesaj dintr-un chat necunoscut → refuz + NIMIC sensibil în log.
- **W0-S5** Audio primit → rând `meetings(status=uploaded)` (stub W0).
- **W0-S6 [blocant]** `vicu-agent {skill:"qa"}` cu întrebare simplă → răspuns; `vicu_runs` are rândul cu tokens + prompt_version; `vicu_reports` legat.
- **W0-S7 [blocant]** LLM întoarce eroare (mock) → retry 1x → run `status=error`; NICIUN mesaj trimis în grup.
- **W0-S8 [blocant]** `vicu-cron-dispatch {job}` de 2 ori în aceeași zi → al doilea = no-op (`vicu_job_runs.dedup_key` unic).
- **W0-S9 [blocant]** `vicu_settings.paused=true` → orice job = no-op; mesajele directe primesc „sunt pe pauză".
- **W0-S10** Setările se salvează din UI și schimbă comportamentul (ora briefului).
- **W0-S11** Tot ce a plecat pe Telegram apare în feed-ul CRM cu datele-sursă.

## W1 — Igiena (pilot)
- **W1-S1 [blocant]** Update due_date prin API/RPC FĂRĂ motiv → respins (nu doar UI); cu motiv → `task_change_log` are old/new/reason/actor.
- **W1-S2 [blocant]** UI: dialogul de motiv nu permite salvare cu motiv gol.
- **W1-S3** Istoricul mutărilor vizibil pe task.
- **W1-S4 [blocant]** `hygiene_digest`: DB seedat cu 2 finalizate ieri + 1 neasignat + 1 restant → digestul le conține exact pe toate, done-first, cu link-uri; cifrele = query-urile direct.
- **W1-S5** Zero probleme → mesaj scurt pozitiv (nu digest gol).
- **W1-S6 [blocant]** Task neasignat > N ore → UN ping; reply-ul la ping → `task_change_log(source=vicu_reply)` legat de taskul corect.
- **W1-S7 [blocant]** Fără răspuns 24h → UN DM către owner; niciun al doilea ping public în aceeași zi.
- **W1-S8** Task mutat de 3 ori (seed) → apare în `date_drift_report` cu motivele; LLM marchează motivul gol/„așa a ieșit" ca neexplicativ.

## W1.5 — Persoana
- **W15-S1 [blocant]** Fiecare membru linked are `vicu_people`; ping-urile respectă prefs (DM vs grup).
- **W15-S2** Membrul își vede și corectează profilul în CRM; NU există niciun câmp de scoring engagement/sentiment în schemă.
- **W15-S3 [blocant]** `/feedback text` + reply-feedback → `vicu_feedback` legat de run-ul/raportul EXACT; vizibil în CRM.
- **W15-S4 [blocant]** `morning_brief` ≤ 15 rânduri, structura done-first → azi → atenție.
- **W15-S5** Retro vineri: DM cu 3 întrebări doar membrilor linked; cine nu răspunde nu e numit public.
- **W15-S6 [blocant]** Sinteza de luni conține răspunsurile; o acțiune confirmată → task real în TaskBoard.

## W2 — KPI
- **W2-S1 [blocant]** `kpi_snapshot` zilnic → un rând per KPI per zi (unique nu se încalcă la re-rulare).
- **W2-S2** Raportul de acoperire listează KPI fără owner/țintă/taskuri.
- **W2-S3 [blocant]** `task_kpi_judge`: task fără KPI → propunere cu explicație; scrierea în `strategy_kpi_tasks` DOAR după confirmare (fără confirmare → zero rânduri).
- **W2-S4 [blocant]** `evening_alignment`: % aliniere = calculul direct pe DB (nu cifra LLM); KPI fără taskuri semnalat explicit.
- **W2-S5** Sugestia de ieri e urmărită azi (făcut/ignorat).
- **W2-S6 [blocant]** Cifrele din update-ul de vânzări = `sales` pe aceeași perioadă; cron-ul vechi send-weekly-update oprit (pas manual bifat) — nu vin două mesaje duminica.

## W3 — Ședințe
- **W3-S1 [blocant]** Toate cele 3 căi (Telegram audio, upload CRM, zoom ne-mapat) → același shape în `meetings`; confirmarea „am primit" vine imediat.
- **W3-S2 [blocant]** `vicu-transcribe` pe un fișier real RO de test → transcript non-gol + cost logat; provider eșuat (mock) → `status=failed` + retry manual funcțional.
- **W3-S3** Audio > 20 min → chunking, transcript complet.
- **W3-S4 [blocant]** `meeting_analysis`: FIECARE task propus are `quote` non-gol prezent în transcript (verificare substring); vorbitor nedetectat → „de revendicat".
- **W3-S5 [blocant]** Confirmarea unui task → task real prin tasks-mcp + `board_task_id` setat + link înapoi la ședință; respins → rămâne vizibil `rejected`; NIMIC în TaskBoard fără confirmare.
- **W3-S6 [blocant]** `meeting_followup` la T+48h: numără corect propuse/confirmate/în lucru; neconfirmatele nominal.
- **W3-S7** Ședința următoare analizată re-deschide item-urile nerezolvate din precedenta.
- **W3-S8** Recorder: întrerupere de rețea (simulată) → se pierde max un chunk.

## W4 — Ads
- **W4-S1 [blocant]** `windsor_freshness`: `marketing_costs` fără date de ieri → alertă; cu date → tăcere.
- **W4-S2 [blocant]** `ads_verdict`: pe seed cunoscut (campania A ROAS 4x, B 0.5x) → verdictele corecte cu cifrele exacte; maparea utm↔campanie documentată în cod.
- **W4-S3 [blocant]** Consiliul rulează 3 voci; verdictul final citează amândouă pozițiile; ZERO apeluri de scriere spre Meta API în tot codul W4.
- **W4-S4** `ads_check`: CPL 2x peste media 7 zile (seed) → alertă cu comparația; a doua rulare în zi → tăcere.

## W5 — Echipa
- **W5-S1 [blocant]** `qa`: „câte vânzări luna asta?" → cifra = query pe `sales`; întrebare fără date → „nu știu" (nu inventează).
- **W5-S2** Fiecare cifră din răspuns are sursă (link/citat).
- **W5-S3 [blocant]** Watchdog: lead nou necontactat > N ore (seed) → ping; deal mare stagnant → DOAR DM privat, nu grup.
- **W5-S4** Briefs de luni: fiecare rol primește doar secțiunea lui, ≤ 10 rânduri; opt-out respectat.
- **W5-S5** Workload: raportul reuse `analyze-team-workload`, doar către owner.
- **W5-S6 [blocant]** Delegare: propunerea vine în briefingul 1:1; reasignarea se întâmplă DOAR după confirmare; taskul reasignat păstrează istoricul.

## W6 — Curs + scope
- **W6-S1 [blocant]** Ediție pornită fără taskuri din șablon (seed) → alertă ziua 0 cu lista lipsurilor.
- **W6-S2** Raportul de conformitate per ediție: verde/roșu per pas, în CRM.
- **W6-S3** Modificare de titlu/descriere/checklist → în jurnalul de scope; sumarul săptămânal le agregă.

## W7 — Învățarea
- **W7-S1** Self-report: include costul LLM al săptămânii (sumă `vicu_runs`) + rata de reacție la ping-uri.
- **W7-S2 [blocant]** Propunerea de prompt: diff pe UN skill, cu feedbackul citat; activare DOAR după aprobare; rollback readuce exact versiunea anterioară (byte-identic).
- **W7-S3** Detector repetitive: 6 taskuri identice săptămânale (seed) → candidat cu frecvență + timp estimat; marcat „ignoră" → nu reapare.
