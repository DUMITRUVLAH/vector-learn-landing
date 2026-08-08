# VICU — Plan de implementare long-term (infrastructură unică + reguli de autopilot)

> Documentul de EXECUȚIE: cum se construiește Vicu ([`VICU-CORE.md`](VICU-CORE.md),
> [`VICU-BACKLOG.md`](VICU-BACKLOG.md)) ca o singură infrastructură, în valuri, de către
> autopilot, **fără a depăși ~35% din limita zilnică de utilizare per zi** (directiva
> owner-ului, 2026-07-17). Repo-ul țintă: **crm-vector** (Lovable/Supabase, regula §0.0).

---

## 0. Lecții adoptate din video (Stanford AI report / skills workflow — 2026-07-17)

Ce reținem și aplicăm DIRECT la Vicu (restul e ignorat ca marketing):

1. **Modelul nu decide, contextul + workflow-ul decid.** Diferența între modelele de top e
   ~2,5%. Vicu nu e „un prompt către un LLM", e un **workflow cu context**: fiecare capabilitate
   are date-sursă (query-uri), procedură, format de ieșire. → confirmă arhitectura vicu-agent.
2. **Skill = repozitoriu, nu un fișier.** Un skill bun conține: instrucțiunea, procedura pas cu
   pas, formatul ieșirii, sursele, și **exemple bine/rău**. → „promptul" lui Vicu din
   `vicu_prompt_versions` devine un **skill-pack** structurat (vezi §2), nu un text monolit.
3. **Exemple bine/rău în prompt** — cea mai ieftină metodă de a fixa tonul (anti-blamare,
   done-first, română naturală): 3-5 mesaje-exemplu „așa DA / așa NU" trăiesc în skill-pack și
   se îmbogățesc din feedbackul VICU-601.
4. **„Consiliu" anti-servilism pentru decizii.** LLM-urile aprobă orice („отличная идея!").
   Pentru verdictele cu miză (VICU-302 scale/cut pe ads, VICU-705 propuneri de delegare):
   **2-3 apeluri LLM cu roluri opuse** (avocatul lui „scalează" vs avocatul lui „oprește" +
   arbitru pe cifre) în loc de un singur apel care confirmă. Cost mic, încredere mare.
5. **Research înainte de a construi** — deja practicat (cercetarea de piață din v2); rămâne
   regulă: fiecare val de build începe cu RECALL pe docs/solutions + memoriile existente.
6. **Securitatea skill-urilor terțe**: nu instalăm skill-uri externe în pipeline-ul lui Vicu;
   tot ce rulează e scris în repo, cu secrete doar în Supabase secrets. (Regulă permanentă.)
7. **Funcții, nu personaje.** „AI-sotrudnik" = o funcție împachetată (brief→video, task→raport),
   nu o persoană falsă. Confirmă decizia CORE §2: un singur Vicu, capabilități = funcții.

## 1. Principiul de infrastructură: UN creier, UN jurnal, UN ceas, N capabilități

Tot ce face Vicu (33 item-uri) trece prin **aceleași 4 piese**. Nicio capabilitate nu are voie
să-și facă propriul mini-sistem (anti-pattern-ul „competing systems" din §3.5.1):

```
                    ┌───────────────────────────────────────────┐
  CAPABILITĂȚI      │  1 CREIER   vicu-agent (edge fn unică)    │
  (funcții, nu      │             ├ skill-pack activ din DB     │
  sisteme):         │             ├ context-builder per funcție │
  igienă taskuri ──►│             └ consiliu 2-3 voci la decizii│
  aliniere KPI   ──►│  1 JURNAL   vicu_runs + vicu_reports      │
  ads×vânzări    ──►│             (orice mesaj = un run logat)  │
  ședințe        ──►│  1 CEAS     pg_cron → vicu-cron-dispatch  │
  ritualuri      ──►│             (UN singur dispatcher, citește│
  delegare       ──►│              vicu_settings, nu N cron-uri)│
                    │  1 GURĂ     vicu-telegram (in/out unic)   │
                    └───────────────────────────────────────────┘
```

Reguli dure de infrastructură (autopilotul le respectă la FIECARE item):
- **R1 — un singur dispatcher cron.** `vicu-cron-dispatch` primește `{job: "morning_brief"}`
  etc. din pg_cron; capabilitățile noi adaugă un `job type`, NU un cron nou. (Un singur loc de
  debugat „de ce n-a venit briefingul".)
- **R2 — orice ieșire trece prin `vicu_runs`.** Nicio funcție nu apelează Telegram direct;
  toate trimit prin `vicu-telegram` care scrie run-ul. (Audit total + feed-ul CRM gratis.)
- **R3 — orice capabilitate = un skill-pack în DB** (§2). Zero prompturi hardcodate în cod.
- **R4 — scrierile în datele CRM doar prin confirmare umană** (tasks din ședințe, reasignări).
  Vicu scrie liber DOAR în tabelele lui (`vicu_*`, `task_change_log`, `meetings`).
- **R5 — fiecare val livrează și healul sync-schema** pentru tabelele noi (regula
  [[prod-migration-tracking-desynced]]) + intrări LOVABLE-DEPLOY.md.

## 2. Skill-pack-urile lui Vicu (structura promptului versionat)

`vicu_prompt_versions` nu stochează un text, ci un JSON structurat per capabilitate:

```
{
  "persona":   "cine e Vicu — comun, o singură definiție",
  "skills": {
    "morning_brief":  { "instructiune", "procedura" (pașii + query-urile),
                        "format" (structura fixă done-first),
                        "exemple": [{bun}, {rau, de_ce}] },
    "ads_verdict":    { ..., "consiliu": ["pro-scale", "pro-cut", "arbitru"] },
    "nudge_task":     { ..., "exemple": [fără blamare / cu blamare-INTERZIS] },
    ...
  }
}
```

- Feedbackul (VICU-601/602) propune diff-uri pe UN skill, nu pe tot promptul → schimbările
  sunt mici, lizibile, aprobabile.
- Skill-pack-urile au și copie git în crm-vector (`supabase/functions/_vicu-skills/`) — seed +
  code review; DB rămâne sursa runtime (schimbare fără redeploy).

## 3. Valurile de build (long-term, în ordine, cu dependențe)

Fiecare val = **un branch + un PR pe crm-vector** (§0.2), construit item cu item, teste per
item. Un val NU începe până valul anterior nu e mergiuit + verificat live (§0.0: migrările
aplicate manual de owner în Supabase → bifate în LOVABLE-DEPLOY.md).

| Val | Item-uri | Livrează | Depinde de | Estimare rulări* |
|-----|----------|----------|-----------|------------------|
| **W0 — Scheletul** | VICU-001..005 | bot bidirecțional, settings, creier+skill-pack, dispatcher cron, feed CRM | — | 2-3 |
| **W1 — Pilotul (igiena)** | VICU-101..104 | digest done-first, motiv la mutare, detector termene plimbate, întrebarea blândă | W0 | 2 |
| **W1.5 — Persoana** | VICU-701, 702, 601 | vicu_people, briefing+retro, captare feedback | W0 (paralel cu W1 posibil, dar NU același branch) | 1-2 |
| **W2 — KPI** | VICU-201..204 | snapshots, judecata taskurilor nelegate, alinierea zilnică, vânzări (absoarbe send-weekly-update) | W0 | 1-2 |
| **W3 — Ședințe** | VICU-501..506 | ingestie (TG+CRM+Zoom), recorder, STT română, analiză+confirmare+follow-up | W0; STT = test real la 503 | 2-3 |
| **W4 — Ads** | VICU-301..303 | freshness Windsor, verdicte cu consiliu, alerte anomalie | W0, W2 (utm→sales) | 1 |
| **W5 — Echipă** | VICU-703..707 | briefs per rol, workload, antrenor delegare, watchdog vânzări, @mention Q&A | W1.5, W2 | 2 |
| **W6 — Curs+scope** | VICU-401, 402 | mandatory-check per ediție, jurnal scope | W1 | 1 |
| **W7 — Învățare** | VICU-602, 603, 604 | auto-revizuire prompt, detector repetitive, self-report | W1.5 (≥3 săpt. de feedback acumulat) | 1-2 |

\* „rulări" = sesiuni de autopilot sub plafonul de buget din §4. Total estimat: **13-18 rulări**
≈ 3-4 săptămâni calendaristice în ritmul de 1 rulare/zi (mai repede nu are sens: valurile cer
pași manuali de la owner între ele — migrări, setWebhook, token-uri).

**Gate-uri de val (înainte de PR):** build+lint verzi · e2e per val (scripts/e2e-vicu-*.mjs în
crm-vector: mock Telegram update → webhook → răspuns corect; cron dispatch idempotent — testează
ACȚIUNEA, nu afordanța, §3.5.1quater) · LOVABLE-DEPLOY.md actualizat · zero secrete în cod ·
review→improve loop (§3.5.2).

**Pași manuali de owner (planificați, ca să nu blocheze):** după W0-PR: aplică migrările în
Supabase + setWebhook + secrete (ANTHROPIC/STT key) — checklist în LOVABLE-DEPLOY.md; după W3:
alege providerul STT pe testul real; înainte de W4: confirmă că Windsor sync e activ.

## 4. Regula de buget — max ~35% din limita zilnică (directiva owner-ului, OBLIGATORIE)

Autopilotul pe VICU **nu are voie să consume ziua de lucru a owner-ului cu Claude**. Concret:

1. **O singură rulare de autopilot VICU per zi calendaristică**, cu **max 2 item-uri** per
   rulare (mai strict decât plafonul general de 3 din §0.1) — un item VICU mediu + teste + e2e
   ≈ o treime din capacitatea unei zile; două item-uri mici pot intra într-o rulare.
2. **Stop imediat, chiar mijloc de item, dacă apare orice avertisment de limită de utilizare**
   (usage warning / rate limit) — commit la ultimul punct stabil, item înapoi pe `pending`,
   notă în BUILD-LOG. Nu „încă puțin și termin".
3. **Fără lanțuri de batch-uri** pe VICU: regula din [[autopilot-batch-token-budget]]
   (checkpoint după 6-7 batch-uri) NU se aplică aici — aici e 1 rulare → STOP → mâine.
4. **Jurnal de consum:** fiecare rulare scrie la final în
   `crm-vector/backlog/vicu/BUILD-LOG.md`: data, item-urile atinse, starea (done/pending),
   estimarea subiectivă de consum (scurtă/medie/lungă), pașii manuali rămași pentru owner.
   Rularea următoare îl citește ÎNTÂI (memoria dintre zile — nu conversația).
5. **Prioritate la buget:** dacă în ziua respectivă owner-ul lucrează interactiv cu Claude pe
   altceva, rularea VICU se sare complet (owner-ul o declanșează manual când vrea).
6. **Ultracode/workflow-uri multi-agent NU se folosesc la build-ul VICU** — consumă exact
   bugetul pe care regula asta îl protejează. Review-ul rămâne pe agenții obișnuiți (§3.5.2).

> De ce așa: „35%" nu e măsurabil exact în tokens din interiorul unei sesiuni, așa că îl
> traducem în plafoane observabile: 1 rulare/zi × max 2 item-uri × stop-la-primul-avertisment.
> Dacă în practică o rulare se dovedește prea grasă, plafonul scade la 1 item/zi — BUILD-LOG-ul
> arată trendul.

## 5. Runbook-ul unei rulări de autopilot VICU (pas cu pas)

```
1. cd /Users/dima/crm-vector  (NU vector-learn-landing! [[two-remotes]])
2. Citește: backlog/vicu/BUILD-LOG.md (ultima stare) + LOVABLE-DEPLOY.md
   (există pași NEAPLICAȚI blocanți pentru valul curent? → dacă da: STOP,
   raportează owner-ului exact ce are de aplicat, nu construi peste)
3. RECALL: docs/solutions/ + memoriile relevante (vicu-*, taskboard, lovable-deploy)
4. Alege următoarele 1-2 item-uri pending din valul curent (ordinea din §3)
5. Per item: build → test → e2e (acțiunea, nu afordanța) → commit conventional
   (feat(VICU-xxx): …) pe branch-ul valului (feat/VICU-W<N>-<slug>)
6. Migrare nouă? → intrare LOVABLE-DEPLOY.md [ ] NEAPLICAT + heal sync-schema
7. La capătul plafonului (§4): push, PR de val doar dacă valul e COMPLET
   (altfel branch-ul rămâne deschis), actualizează BUILD-LOG.md, STOP.
8. Mesajul final către owner: 3 rânduri — ce s-a făcut, ce pași manuali are,
   când e următoarea rulare.
```

## 6. Riscuri long-term și cum le ținem sub control

| Risc | Mitigare |
|---|---|
| Bot-ul vechi (`send-weekly-update`) și Vicu vorbesc amândoi în grup | W2/VICU-204 îl absoarbe explicit; până atunci coexistă (Vicu tace duminica) |
| Costul LLM crește tăcut cu fiecare capabilitate | `vicu_runs.tokens` per run → în self-report-ul săptămânal (VICU-604) intră și costul; prag de alertă în vicu_settings |
| Skill-pack-ul degenerat de auto-revizuiri succesive | fiecare versiune aprobată manual + rollback (VICU-602); diff pe UN skill, nu pe tot |
| Echipa ignoră ping-urile → Vicu devine zgomot | rata de reacție e KPI-ul lui Vicu (VICU-604); două săptămâni sub 30% → owner-ul decide: recalibrare ton/frecvență, nu „mai multe ping-uri" |
| Lovable sync suprascrie/încurcă edge functions | funcțiile vicu-* au prefix propriu, nu ating funcțiile existente; verificare la fiecare push (§0.0 pct. 3) |
| Owner-ul uită pașii manuali → valul următor construiește pe nisip | runbook pasul 2: verificare live ÎNAINTE de build (REST 200/404), nu după |

---

*Creat 2026-07-17 (directiva owner-ului: infrastructură unică + plafon ~35%/zi la build).
Se citește împreună cu VICU-CORE.md + VICU-BACKLOG.md. Build-ul pornește la semnalul owner-ului.*
