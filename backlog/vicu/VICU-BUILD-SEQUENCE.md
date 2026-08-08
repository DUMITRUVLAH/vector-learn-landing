# VICU — BUILD-SEQUENCE (driverul de implementare)

> Documentul pe care autopilotul îl execută item cu item, în ordine. Repo țintă: **crm-vector**.
> Reguli: 1 val = 1 branch (`feat/VICU-W<N>-<slug>`) = 1 PR; commit per item; teste per item
> ([`VICU-TEST-SCENARIOS.md`](VICU-TEST-SCENARIOS.md)); **buget max ~35%/zi** (BUILD-PLAN §4:
> 1 rulare/zi, max 2 item-uri, stop la primul usage warning); regula Lovable §0.0 la fiecare
> migrare/secret/cron. Starea între rulări: `crm-vector/backlog/vicu/BUILD-LOG.md`.

---

## A. Contractul de date (schema completă — sursa de adevăr)

Toate tabelele noi au RLS enabled + GRANT-uri explicite (lecția [[crm-vector-sw-and-taskboard-grants]]:
GRANT-urile lipsă = 42501 tăcut). Migrare per val, nu per tabel. `--> statement-breakpoint`
între statement-uri. Fiecare tabel nou intră și în healul sync-schema dacă crm-vector are unul.

```sql
-- W0
telegram_links(id uuid pk, profile_id uuid fk profiles UNIQUE, tg_user_id bigint UNIQUE,
  tg_username text, tg_chat_id bigint, linked_at timestamptz, revoked_at timestamptz)
vicu_settings(key text pk, value jsonb, updated_at timestamptz)
  -- chei: group_chat_id, brief_hour, quiet_hours, paused, thresholds{...}, notif_optout{...}
vicu_prompt_versions(id uuid pk, version int UNIQUE, skills jsonb, status text
  CHECK (draft|proposed|active|retired), created_by uuid, approved_by uuid,
  approved_at timestamptz, notes text, created_at timestamptz)
vicu_runs(id uuid pk, kind text, skill text, prompt_version int, input_summary jsonb,
  output_text text, tokens_in int, tokens_out int, duration_ms int,
  status text CHECK (ok|error), error text, created_at timestamptz)
vicu_reports(id uuid pk, run_id uuid fk vicu_runs, type text, title text, body_md text,
  data jsonb, audience text, sent_to jsonb, created_at timestamptz)
vicu_job_runs(id uuid pk, job text, dedup_key text UNIQUE, ran_at timestamptz,
  status text, detail text)   -- idempotența cron-ului

-- W1
task_change_log(id uuid pk, task_id uuid fk board_tasks, actor_profile_id uuid,
  field text, old_value text, new_value text, reason text,
  source text CHECK (ui|api|vicu_reply|legacy), created_at timestamptz)

-- W1.5
vicu_people(profile_id uuid pk fk profiles, role text, boards jsonb, prefs jsonb,
  promises jsonb, notes text, updated_at timestamptz)
vicu_feedback(id uuid pk, run_id uuid fk null, report_id uuid fk null,
  author_profile_id uuid, source text CHECK (telegram|crm),
  text text, status text CHECK (new|applied|rejected), created_at timestamptz)

-- W2
kpi_snapshots(id uuid pk, kpi_id uuid fk strategy_kpis, value numeric,
  snapshot_date date, UNIQUE(kpi_id, snapshot_date))

-- W3
meetings(id uuid pk, source text CHECK (telegram|crm_upload|crm_record|zoom),
  storage_path text, zoom_recording_id text, status text
  CHECK (uploaded|transcribing|transcribed|analyzed|failed),
  transcript text, summary_md text, uploaded_by uuid, duration_sec int,
  stt_cost_usd numeric, created_at timestamptz)
meeting_tasks(id uuid pk, meeting_id uuid fk meetings, title text, quote text NOT NULL,
  proposed_assignee uuid null, due_date date null, status text
  CHECK (proposed|confirmed|rejected|claimed), board_task_id uuid null,
  decided_by uuid, decided_at timestamptz)
```

## B. Contractele edge functions (interfețele — nu se deviază)

| Funcție | Trigger | Contract |
|---|---|---|
| `vicu-telegram` | Telegram webhook POST (header `X-Telegram-Bot-Api-Secret-Token` verificat) + intern `{action:"send", chat_id, text, report_id?}` | Rutează: `/start <cod>` → linking; `/feedback <text>`; `/vicu pauza\|reia`; reply la mesaj Vicu → feedback sau motiv-task (după context); audio/voice → `meetings`; @mention/DM text → `vicu-agent {skill:"qa"}`. ORICE trimitere iese doar de aici și scrie `vicu_runs`. |
| `vicu-agent` | intern POST `{skill, params}` | Încarcă skill-pack-ul activ → context-builder (query-urile skill-ului) → LLM (consiliu dacă skill-ul o cere) → scrie run+report → trimite prin vicu-telegram. Erori: retry 1x, apoi run status=error (niciodată mesaj corupt în grup). |
| `vicu-cron-dispatch` | pg_cron → pg_net POST `{job}` | Joburi: `morning_brief`, `hygiene_digest`, `evening_alignment`, `kpi_snapshot`, `ads_check`, `windsor_freshness`, `retro_kickoff`, `retro_synthesis`, `self_report`, `meeting_followup`, `edition_check`. Idempotent prin `vicu_job_runs.dedup_key = job+data`. `paused=true` → no-op. |
| `vicu-transcribe` | intern POST `{meeting_id}` | storage → STT (provider din `vicu_settings.stt_provider`, default elevenlabs; chunking > 20 min) → `meetings.transcript` + cost. Eșec → status `failed` + retry manual din CRM. |

Secrete (Supabase secrets, pași manuali LOVABLE-DEPLOY): `TELEGRAM_WEBHOOK_SECRET` (nou),
`ANTHROPIC_API_KEY` sau reuse `LOVABLE_API_KEY` (decizie la VICU-003), `ELEVENLABS_API_KEY` (W3).
`TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID` **există deja**.

## C. Secvența de build (item cu item — ordinea e obligatorie)

> Per item: **Scope** (ce intră; ce NU intră — vezi AC în VICU-BACKLOG.md) · **Fișiere** ·
> **Gate** = scenariile blocante din TEST-SCENARIOS. Ce descoperi în plus → secțiunea
> „Backlog descoperit" (§D), NU se construiește pe furiș.

### W0 — Scheletul (branch `feat/VICU-W0-skeleton`)
1. **VICU-003a** (primul — totul depinde de el): migrarea W0 completă + seed
   `vicu_prompt_versions` v1 (persona + skill-urile `qa`, `morning_brief` minimal) din
   `supabase/functions/_vicu-skills/v1.json`. Fișiere: migrare, seed, skills JSON. Gate: W0-S1.
2. **VICU-001**: `vicu-telegram` webhook (secret verificat, linking `/start`, refuz chat
   necunoscut, primire audio → stub). Fișiere: `supabase/functions/vicu-telegram/index.ts`.
   Gate: W0-S2..S5. Manual: setWebhook + `TELEGRAM_WEBHOOK_SECRET` → LOVABLE-DEPLOY.
3. **VICU-003b**: `vicu-agent` (LLM wrapper + context-builder + run/report logging + trimitere).
   Decizia LLM (Claude direct vs LOVABLE_API_KEY): test de română pe ambele, alege în commit.
   Gate: W0-S6..S7.
4. **VICU-004**: `vicu-cron-dispatch` + `vicu_job_runs` + SQL pg_cron (LOVABLE-DEPLOY).
   Gate: W0-S8..S9.
5. **VICU-002**: pagina Setări Vicu în CRM (`src/pages/VicuSettings.tsx`) + kill-switch
   `paused`. Gate: W0-S10.
6. **VICU-005**: pagina feed `src/pages/Vicu.tsx` (rapoarte din `vicu_reports`, filtru
   tip/dată, detaliu cu `data` sursă). Gate: W0-S11.
7. **e2e:** `scripts/e2e-vicu-w0.mjs` (vezi TEST-SCENARIOS §W0). PR-ul valului.

### W1 — Igiena (PILOT) (branch `feat/VICU-W1-hygiene`)
1. **VICU-102**: audit `board_task_activity` (ce prinde azi la due-date?) → `task_change_log` +
   dialog motiv în TaskBoard UI + **guard pe calea de scriere** (funcție RPC/trigger care
   respinge update de due_date fără motiv — nu doar UI). Gate: W1-S1..S3.
2. **VICU-101**: skill `hygiene_digest` (done-first; query-urile: finalizate ieri, neasignate,
   restante, stale > N zile) + job cron. Gate: W1-S4..S5.
3. **VICU-104**: ping blând (task fără motiv pe căi legacy / neasignat > N ore) + reply →
   `task_change_log.source='vicu_reply'` + escaladare privată 24h. Gate: W1-S6..S7.
4. **VICU-103**: skill `date_drift_report` (săptămânal, LLM judecă motivele). Gate: W1-S8.
5. e2e `scripts/e2e-vicu-w1.mjs`. PR.

### W1.5 — Persoana (branch `feat/VICU-W15-persona`)
1. **VICU-701**: `vicu_people` + populare inițială (roluri echipă) + UI vizualizare/corectare
   în CRM + folosire în rutarea ping-urilor. Gate: W15-S1..S2.
2. **VICU-601**: `/feedback` + reply-feedback + buton în feed CRM → `vicu_feedback`. Gate: W15-S3.
3. **VICU-702**: `morning_brief` complet (done-first, max 15 rânduri) + retro vineri (3 întrebări
   DM) + sinteza luni + acțiunile → taskuri confirmate. Gate: W15-S4..S6. PR.

### W2 — KPI (branch `feat/VICU-W2-kpi`)
1. **VICU-201**: `kpi_snapshots` + job zilnic + raport de acoperire (KPI fără owner/țintă/taskuri).
2. **VICU-202**: skill `task_kpi_judge` — taskuri fără intrare în `strategy_kpi_tasks` → LLM
   propune legătura; **scrierea doar la confirmare** (buton în CRM / reply în Telegram).
3. **VICU-203**: skill `evening_alignment` (% aliniere, KPI orfani, 1-3 sugestii + follow-up
   pe sugestiile de ieri din `vicu_reports`).
4. **VICU-204**: update vânzări (zilnic scurt / săptămânal detaliat) + **retragerea
   send-weekly-update** (cron-ul lui se oprește — pas manual LOVABLE-DEPLOY; codul rămâne).
Gate: W2-S1..S6. PR.

### W3 — Ședințe (branch `feat/VICU-W3-meetings`)
1. **VICU-501**: `meetings` + ingestie Telegram audio + pagina Ședințe cu upload + preluarea
   `zoom_recordings` ne-mapate la cursuri (filtru `zoom_course_links`).
2. **VICU-503**: `vicu-transcribe` (ElevenLabs default, fallback Whisper; chunking; cost logat).
   **Pas manual owner: cheia STT + validarea pe o ședință reală.**
3. **VICU-504**: skill `meeting_analysis` (sumar RO ≤ 1 pagină, decizii, taskuri propuse cu
   citat obligatoriu, „de revendicat" la vorbitor necunoscut).
4. **VICU-505**: confirmare (CRM + Telegram butoane) → `tasks-mcp bulk_create_tasks` →
   `meeting_tasks.board_task_id`.
5. **VICU-506**: follow-up T+48h + re-surfacing la următoarea ședință analizată.
6. **VICU-502** (ultimul — singurul cu UI complex): recorder MediaRecorder cu chunk-uri.
Gate: W3-S1..S8. PR.

### W4 — Ads (branch `feat/VICU-W4-ads`)
1. **VICU-301**: job `windsor_freshness` (date de ieri lipsă > 24h → alertă).
2. **VICU-302**: skill `ads_verdict` cu CONSILIU (pro-scale / pro-cut / arbitru pe cifre);
   ROAS din `sales.utm_campaign` × `marketing_costs.campaign_name` (mapare fuzzy documentată);
   săptămânal + la cerere. Zero scrieri spre Meta.
3. **VICU-303**: `ads_check` zilnic (CPL > prag vs media 7 zile, spend fără lead-uri).
Gate: W4-S1..S4. PR.

### W5 — Echipa (branch `feat/VICU-W5-team`)
1. **VICU-707**: skill `qa` complet (@mention/DM: query-uri pe taskuri/lead-uri/vânzări/KPI/
   campanii + transcripte; sursa la fiecare cifră; „nu știu" onest).
2. **VICU-706**: watchdog vânzări (speed-to-lead, lead-uri stagnante, cadențe; semnale
   sensibile → DM privat).
3. **VICU-703**: briefs luni per rol (marketing/sales/product/design/video — max 10 rânduri).
4. **VICU-704**: raport workload săptămânal către owner (reuse `analyze-team-workload`).
5. **VICU-705**: antrenorul de delegare (candidați din natura taskului × skills × load;
   reasignare DOAR cu confirmarea owner-ului; tracking lunar % owner-vs-echipă).
Gate: W5-S1..S6. PR.

### W6 — Curs + scope (branch `feat/VICU-W6-course`)
1. **VICU-401**: `edition_check` (start ediție detectat → checklist generat? asignat? termen?)
   + raport conformitate per ediție în CRM.
2. **VICU-402**: jurnal scope (extindere `task_change_log` pe title/description/checklist) +
   sumar săptămânal LLM.
Gate: W6-S1..S3. PR. **→ v1.0 launch checklist (ANALYSIS §4).**

### W7 — Învățarea (v1.1) (branch `feat/VICU-W7-learning`)
1. **VICU-604**: self-report duminică (semnalat/ratat, feedback, cost LLM, rata de reacție).
2. **VICU-602**: propunere diff pe UN skill din feedback → aprobare owner → activare/rollback.
3. **VICU-603**: detector repetitive (clustere pe istoric ≥ 6 săpt.) + marcare automatizat/ignoră.
Gate: W7-S1..S3. PR.

## D. Backlog descoperit (se completează la build, NU se construiește pe furiș)

| Data | Descoperire | Propunere |
|------|-------------|-----------|
| — | — | — |

## E. Pași manuali per val (owner) — sinteza pentru LOVABLE-DEPLOY.md

| După | Owner face |
|------|-----------|
| W0 PR merge | aplică migrarea W0 · setWebhook cu secret · adaugă `TELEGRAM_WEBHOOK_SECRET` + cheia LLM · rulează SQL pg_cron · fiecare membru: `/start <cod>` |
| W1 merge | aplică migrarea W1 · anunță echipa despre regula motivului (mesajul îl scrie Vicu) |
| W2 merge | aplică migrarea W2 · oprește cron-ul vechi send-weekly-update |
| W3 merge | aplică migrarea W3 · `ELEVENLABS_API_KEY` · validează transcrierea pe o ședință reală |
| W4 merge | confirmă Windsor sync activ + pragurile de alertă |
| v1.0 | parcurge launch checklist-ul din ANALYSIS §4 |
