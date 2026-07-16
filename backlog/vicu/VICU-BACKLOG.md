# VICU — Backlog (v2, ancorat în inventarul crm-vector + cercetarea de piață)

> Concept: [`VICU-CORE.md`](VICU-CORE.md). Implementare: **crm-vector** (Lovable/Supabase, §0.0).
> O fază = un branch = un PR (§0.2). Fiecare item: problemă → ce construim → AC scurte.
> Statusuri: toate `pending` — nimic nu intră în build până owner-ul nu dă drumul.
>
> **v2 (2026-07-16):** item-urile marcate ♻️ s-au MICȘORAT pentru că funcționalitatea există
> deja în crm-vector (vezi CORE §4); Faza 7 (persoană & echipă) e nouă, din cercetarea de piață.

---

## Faza 0 — Fundația botului (fără ea nu există nimic)

### VICU-001 ♻️ — Bot Telegram bidirecțional + linking utilizatori
**Există deja:** botul + `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID` (folosite de
`send-weekly-update`) — dar DOAR push, one-way. **Ce construim:** edge function `vicu-telegram`
ca webhook de INTRARE (secret token verificat), `telegram_links` — fiecare membru se leagă cu
`/start <cod>` generat din profilul lui (`profiles`); grupul echipei e deja cunoscut
(`TELEGRAM_CHAT_ID`). **AC:** (1) owner + un membru legați de conturile lor; (2) mesaj din chat
necunoscut → refuz politicos, nimic sensibil logat; (3) reuse token existent — NU un bot nou;
(4) pași manuali (setWebhook, secrete) în LOVABLE-DEPLOY.md.

### VICU-002 — Setări Vicu + quiet hours + destinatari
**Ce construim:** `vicu_settings` (ora briefingului, quiet hours, opt-in/out per tip de
notificare), pagină minimă de setări în CRM. **AC:** (1) briefingul respectă ora setată
(Europe/Chișinău); (2) în quiet hours nu pleacă nimic non-critic; (3) un tip de notificare se
poate opri individual.

### VICU-003 — Agent core: creier LLM + prompt versionat + jurnal
**Ce construim:** edge function `vicu-agent` (wrapper LLM — decizie Claude API vs Lovable AI
gateway pe un test de română + cost), `vicu_prompt_versions` (promptul activ + istoric),
`vicu_runs` (fiecare analiză: input-sumar, output, tokens), `vicu_reports`. Promptul definește
PERSOANA (CORE §2): un singur Vicu, română caldă, fără blamare, fără ownership. **AC:** (1)
promptul se schimbă din DB fără redeploy; (2) fiecare mesaj trimis e legat de un run; (3) erorile
LLM → retry + eșec vizibil în jurnal, nu tăcere.

### VICU-004 — Scheduler: joburi zilnice/săptămânale
**Ce construim:** `pg_cron` + `pg_net` → edge functions programate (briefing 08:30, analize
17:30, retro vineri 15:00, self-report duminică). Joburi idempotente. **AC:** (1) rulează la ora
configurată; (2) re-rularea în aceeași zi nu dublează mesaje; (3) SQL-ul cron în
LOVABLE-DEPLOY.md.

### VICU-005 — Secțiunea „Vicu" în CRM: feed de rapoarte
**Ce construim:** pagină cu feed-ul tuturor rapoartelor/mesajelor lui Vicu (filtru tip/dată),
detaliu per raport cu datele-sursă. **AC:** (1) tot ce a plecat pe Telegram e și în CRM;
(2) fiecare raport arată pe ce date s-a bazat; (3) respectă rolurile/RLS existente.

---

## Faza 1 — Igiena taskurilor (PILOT — primul livrat, decizia owner-ului)

### VICU-101 — Digest zilnic de igienă („ce s-a făcut" întâi)
**Ce construim:** job zilnic pe `board_tasks`: ÎNTÂI ce s-a finalizat ieri (nominal — laudă),
apoi neasignate, restante, fără activitate > N zile → digest compact (owner 1:1 + grup).
Framing-ul „done-first" e anti-nagging (CORE §6). **AC:** (1) fiecare task cu link direct în
TaskBoard; (2) zero probleme → mesaj scurt pozitiv; (3) cifrele bat cu TaskBoard la aceeași oră.

### VICU-102 — Motiv obligatoriu la mutarea termenului
**Ce construim:** în TaskBoard, la schimbarea due-date-ului → dialog „De ce se mută?" (motiv
obligatoriu); scris în `task_change_log` (task, cine, veche→nouă, motiv). De verificat întâi ce
prinde deja `board_task_activity` — extindem, nu duplicăm. **AC:** (1) mutare fără motiv
imposibilă (și prin API, nu doar UI); (2) istoricul mutărilor vizibil pe task; (3) reuse
`board_task_activity` unde există.

### VICU-103 — Detector de termene „plimbate" + raport
**Ce construim:** analiză pe `task_change_log`: taskuri mutate ≥ N ori, motive slabe/repetitive
(judecate de LLM), top taskuri; raport săptămânal owner. **AC:** (1) task, nr. mutări, motive;
(2) LLM marchează motivele care „nu explică nimic"; (3) raportul e și în feed-ul CRM.

### VICU-104 — Vicu întreabă în Telegram (fără blamare)
**Ce construim:** task mutat fără motiv (căi vechi/bypass) sau neasignat > N ore → Vicu întreabă
în grup sau DM, cu etichetă non-acuzatoare („hai să ne uităm împreună…"); reply-ul se salvează în
`task_change_log`. **AC:** (1) reply-ul ajunge în log legat de task; (2) fără răspuns în 24h →
UN mesaj privat către owner (mod doar-către-manager), nu escaladare publică; (3) max un ping per
task per zi.

---

## Faza 2 — Aliniere KPI & planificare

### VICU-201 ♻️ — Snapshots + acoperire pe registrul KPI existent
**Există deja:** `strategy_kpis` (țintă, current_value, perioadă, owner, status) +
`strategy_kpi_tasks` (legătura task↔KPI cu pondere) + pagina Strategy — NU se reconstruiește
nimic. **Ce construim:** doar `kpi_snapshots` (valoarea zilnică, pentru trend) + verificarea
acoperirii: ce KPI nu are owner/țintă/taskuri. **AC:** (1) snapshot zilnic automat per KPI;
(2) zero UI nou de administrare (Strategy există); (3) raport de acoperire: KPI-uri orfane.

### VICU-202 — Judecata taskurilor NElegate (contribuie sau nu?)
**Problema centrală a owner-ului.** **Ce construim:** job care ia taskurile active FĂRĂ intrare
în `strategy_kpi_tasks` și le trece prin LLM cu registrul KPI: propune legătura (om confirmă în
Strategy) sau le marchează „nu servește nimic — de ce există?". **AC:** (1) fiecare task activ e
ori legat, ori marcat cu explicație; (2) legăturile propuse de Vicu cer confirmare umană (scrise
doar după accept); (3) lista „taskuri fără scop" sortată după efort, în raportul zilnic.

### VICU-203 — Update zilnic de aliniere + îmbunătățirea planificării
**Ce construim:** raport zilnic (Telegram + CRM): % taskuri aliniate, KPI-uri fără niciun task
activ („plan gol"), 1–3 sugestii concrete de re-prioritizare; sugestiile de ieri sunt urmărite
(„s-a făcut / ignorat"). **AC:** (1) cifre + sugestii, nu doar text; (2) KPI fără taskuri
semnalat explicit; (3) follow-up pe sugestiile anterioare.

### VICU-204 — Update-uri pe vânzări
**Ce construim:** Vicu postează pe KPI-urile de vânzări (zilnic scurt, săptămânal detaliat):
vânzări vs țintă din `strategy_kpis` + `sales`, trend, pipeline-ul lunii. Înlocuiește/absoarbe
`send-weekly-update` existent (o singură voce — a lui Vicu). **AC:** (1) cifrele bat cu Roas/
rapoartele CRM; (2) formulare umană; (3) `send-weekly-update` e retras sau rutat prin Vicu (nu
două boturi în același chat).

---

## Faza 3 — Campanii & vânzări (Meta Ads × CRM)

### VICU-301 ♻️ — Verificarea conductei Windsor (nu ingestie nouă)
**Există deja:** `sync-windsor` → `marketing_costs` (spend/impresii/clickuri per campanie/zi).
**Ce construim:** doar garanția de prospețime: cron zilnic care verifică sync-ul (date de ieri
prezente?), alertă dacă conducta a murit. **AC:** (1) date lipsă > 24h → alertă owner; (2) zero
tabele noi; (3) documentat cum se re-autorizează Windsor (pas manual).

### VICU-302 ♻️ — Verdicte pe campanii (scale/cut/test) cu plafoane umane
**Există deja:** `Roas.tsx` + `analyze-ads` calculează. **Ce construim:** verdictul LLM peste
`marketing_costs` × `sales` (prin `utm_campaign`): scalează/oprește/testează cu justificare în
cifre, trimis săptămânal + la cerere („Vicu, cum merg campaniile?"). Guardrail-then-delegate:
Vicu NU modifică nimic în Meta — propune, omul execută. **AC:** (1) ROAS din vânzări CRM reale;
(2) fiecare recomandare are cifrele ei; (3) nicio scriere spre Meta API în v1.

### VICU-303 — Alerte de anomalie pe ads
**Ce construim:** verificare zilnică: CPL > X% peste media pe 7 zile, spend fără lead-uri,
campanie oprită neașteptat → alertă imediată (marketing manager + owner). **AC:** (1) praguri
configurabile în `vicu_settings`; (2) alerta include cifra + comparația; (3) max o alertă per
campanie per zi.

---

## Faza 4 — Checklist-ul obligatoriu de curs + scope

### VICU-401 ♻️ — Verificarea checklist-ului la start de curs
**Există deja:** `board_task_templates` + `marketing_task_templates` + `course_edition_*`.
**Ce construim:** detectarea startului de ediție → verificare: taskurile din șablon generate?
asignate? cu termen? → alertă cu ce lipsește + raport de conformitate per curs activ
(verde/roșu per pas: promovare → onboarding → feedback → diplome). **AC:** (1) curs pornit fără
checklist → alertă în ziua 0; (2) task de checklist neasignat → intră în digestul VICU-101;
(3) „mandatory check" vizibil în CRM per ediție.

### VICU-402 — Monitorizarea schimbărilor de scope
**Ce construim:** logare + raportare a modificărilor de conținut pe taskuri/checklist-uri
(titlu, descriere, pași adăugați/șterși) — cine, ce, când; sumar săptămânal cu evaluarea LLM
(„schimbare reală de plan sau haos?"). Reuse `board_task_activity` unde acoperă. **AC:** (1)
orice modificare de scope în log; (2) sumar săptămânal per curs/proiect; (3) definiția „scope"
configurabilă.

---

## Faza 5 — Ședințe (RO audio → concluzii → taskuri confirmate → follow-up)

### VICU-501 — Ingestie audio: Telegram + upload în CRM + Zoom
**Ce construim:** (a) fișier audio/voice către bot → `meetings` cu status `uploaded`; (b) pagină
„Ședințe" în CRM cu upload; (c) ♻️ ședințele interne ținute pe Zoom se preiau AUTOMAT din
`zoom_recordings` (marcate ca „ședință de echipă", nu lecție — filtru pe `zoom_course_links`).
**AC:** (1) toate cele trei căi produc aceeași înregistrare în `meetings`; (2) până la ~2h
(chunking); (3) confirmare imediată („am primit, transcriu").

### VICU-502 — Înregistrare direct din CRM
**Ce construim:** buton „Înregistrează ședința" (MediaRecorder), pauză/stop, upload la final,
chunk-uri (rețeaua căzută nu pierde tot). **AC:** (1) Chrome/Safari desktop; (2) întrerupere =
pierdere max un chunk; (3) intră în fluxul VICU-501.

### VICU-503 — Transcriere română
**Ce construim:** `vicu-transcribe` — candidat principal **ElevenLabs STT (3.1% WER pe română,
peste Whisper/Gemini — din research)**; fallback Whisper API; test pe o ședință reală decide.
**AC:** (1) ședință de 30 min transcrisă inteligibil (owner validează); (2) cost per ședință
logat; (3) eșec → status clar + retry manual.

### VICU-504 — Analiza ședinței: concluzii + taskuri propuse
**Ce construim:** LLM pe transcript → sumar RO (max o pagină), decizii, taskuri propuse (titlu,
responsabil dacă se deduce, termen dacă s-a spus), **fiecare cu citatul-sursă din transcript**
(anti-halucinare — lecția ClickUp). Vorbitor neidentificat → task „de revendicat". **AC:**
(1) fiecare task propus are citat; (2) vorbitor necunoscut → „cine și-l ia?"; (3) postat în grup
+ pagina ședinței.

### VICU-505 — Confirmarea taskurilor din ședință → TaskBoard
**Ce construim:** pe pagina ședinței + în Telegram: Confirmă/Editează/Respinge per task propus;
la confirmare → task real prin `tasks-mcp` (`bulk_create_tasks` există), atribuit „creat de Vicu,
confirmat de X". **AC:** (1) nimic nu intră în TaskBoard fără confirmare; (2) taskul păstrează
link-ul la ședință + citatul; (3) respingerile rămân vizibile.

### VICU-506 — Follow-up forțat (diferențiatorul categoriei)
**Problema (diagnosticul pieței):** toate tool-urile extrag action-items; aproape niciunul nu
urmărește execuția. **Ce construim:** (a) la T+48h: câte taskuri propuse → confirmate → în lucru,
neconfirmatele nominal; (b) **la URMĂTOAREA ședință analizată, Vicu redeschide item-urile
nerezolvate din precedenta** („săptămâna trecută am zis X — unde suntem?"). **AC:** (1) update
automat T+48h; (2) re-surfacing automat la ședința următoare; (3) și în feed-ul CRM.

---

## Faza 6 — Învățare & auto-îmbunătățire

### VICU-601 — Captarea feedbackului
**Ce construim:** `/feedback <text>` + reply cu feedback la orice mesaj al lui Vicu + buton în
CRM per raport → `vicu_feedback` legat de run. **AC:** (1) feedbackul e legat de mesajul exact;
(2) confirmare discretă; (3) vizibil în CRM cu status (nou/aplicat/refuzat).

### VICU-602 — Auto-revizuirea promptului (cu aprobarea owner-ului)
**Ce construim:** job săptămânal: LLM analizează feedbackul → propune diff pe system-prompt
(`vicu_prompt_versions`, status `proposed`); owner-ul vede diff-ul (CRM sau Telegram) →
aprobă/refuză; rollback oricând. **AC:** (1) nicio versiune activată fără aprobare; (2) diff
lizibil cu feedbackul citat; (3) rollback într-un click; (4) versiunea activă vizibilă pe fiecare
raport.

### VICU-603 — Detectorul de muncă repetitivă → propuneri de automatizare
**Ce construim:** analiză săptămânală pe istoricul `board_tasks` (+ `marketing_tasks`): clustere
de taskuri similare, aceeași persoană, cadență regulată → „X face «montaj episod» în fiecare
vineri de 6 săptămâni — candidat de automatizare" + schiță de soluție. Primii candidați evidenti:
pașii de montaj/publicare video, raportările manuale. **AC:** (1) detectează minim taskurile
identice-ca-text recurente; (2) fiecare candidat are frecvență + timp estimat pierdut; (3)
owner-ul marchează „automatizat/ignoră" ca să nu reapară.

### VICU-604 — Raportul săptămânal al lui Vicu despre Vicu
**Ce construim:** duminică seara, către owner: ce a semnalat, ce alerte s-au dovedit false (cu
scuze publice unde a greșit în grup), feedback primit, ce propune să-și schimbe + **valoarea în
rezultate** (lead-uri salvate, taskuri deblocate — nu „mesaje trimise"). **AC:** (1) include rata
de reacție la ping-uri; (2) max 15 rânduri; (3) alimentează VICU-602.

---

## Faza 7 — Persoană & echipă (NOU în v2, din cercetare + echipa reală)

### VICU-701 — Memoria despre oameni (`vicu_people`)
**Golul din piață:** nimeni nu combină memorie-per-persoană cu briefing zilnic. **Ce construim:**
profil viu per membru: rol (marketing/sales/product/design/video), boardurile lui, program,
preferințe de comunicare (DM vs grup, ora), promisiunile active (din retro/ședințe), actualizat
automat din interacțiuni + editabil în CRM. Folosit de TOATE mesajele lui Vicu (ton + rutare).
**AC:** (1) fiecare membru linked are profil; (2) Vicu rutează ping-urile după preferințe;
(3) omul își poate vedea și corecta profilul (transparență — nu dosar secret); (4) zero scoring
de „engagement"/sentiment (interdicție de design, CORE §2).

### VICU-702 — Ritualurile: briefing „done-first" + retro async vineri
**Ce construim:** cele două rituale din CORE §6 care nu sunt acoperite de VICU-101: (a) briefingul
de grup cu structura fixă „ieri s-a făcut → azi contează → atenție la"; (b) retro async vineri:
3 întrebări în DM fiecărui membru linked, sinteza luni în briefing, acțiunile devin taskuri
confirmate. **AC:** (1) retro cu ≥1 răspuns → sinteză luni; (2) acțiunile din retro sunt
urmărite săptămâna următoare (buclă închisă); (3) cine nu răspunde nu e numit public (opt-in).

### VICU-703 — Briefs săptămânale per rol
**Ce construim:** luni dimineața, DM per membru, pe rolul lui: marketing (CPL/ROAS per curs +
verdictele VICU-302), sales (pipeline + speed-to-lead + cadențe), product (vocea clientului din
`feedback_responses` + scope), design (coada + briefs incomplete), video (pipeline producție +
materiale Zoom noi). **AC:** (1) fiecare rol primește DOAR ce-l privește; (2) max 10 rânduri per
brief; (3) opt-out individual.

### VICU-704 ♻️ — Echilibrul de încărcare al echipei
**Există deja:** `team_daily_load`, `team_task_estimates`, `analyze-team-workload` (funcție AI
completă). **Ce construim:** doar cadența + vocea: raport săptămânal către owner (cine e
supraîncărcat, cine are spațiu, propuneri de re-balansare), cu etichetă fără blamare. **AC:**
(1) reuse `analyze-team-workload` — zero logică nouă de analiză; (2) raportul propune mutări
concrete de taskuri; (3) doar către owner (mod privat).

### VICU-705 — Antrenorul de delegare al owner-ului
**Durerea #1 declarată** („I am very bad at delegating"). **Ce construim:** analiză pe taskurile
ținute de owner: care puteau fi delegate (LLM: natura taskului × skills din `analyze-user-skills`
× încărcarea din `team_daily_load`) → în briefingul 1:1: „taskul X poate merge la Y — o fac?";
confirmarea owner-ului → Vicu reasignează + anunță politicos. **AC:** (1) min o propunere de
delegare pe zi când există candidați; (2) reasignarea doar cu confirmare; (3) tracking lunar:
% taskuri owner vs echipă (trendul delegării — metrica succesului lui Vicu).

### VICU-706 — Watchdog follow-up vânzări
**Ce construim:** pe `leads` + `lead_tasks` + `cadences`: lead nou necontactat > N ore →
ping sales manager; lead blocat în stadiu > N zile fără activitate → în briefing; cadență
neexecutată → semnal. Deal-uri mari în risc → DM privat sales manager + owner (nu în grup).
**AC:** (1) speed-to-lead măsurat și raportat săptămânal; (2) pragurile configurabile; (3)
semnalele sensibile doar privat.

### VICU-707 — @mention Q&A peste date + ședințe
**Ce construim:** Vicu răspunde la @mention în grup / mesaj în DM cu întrebări libere: interoghează
datele (taskuri, lead-uri, vânzări, campanii, KPI) + transcriptele de ședințe („ce a zis clientul
X despre preț?" — stil AskFred). Fiecare răspuns cu sursa (link/citat). **AC:** (1) răspunde în
< 30s la întrebări pe date; (2) fiecare cifră are sursă; (3) „nu știu" onest când datele lipsesc
— niciodată inventat.

---

## Trasabilitate: cerința owner-ului → item

| Ce a cerut owner-ul (2026-07-16) | Item(e) |
|---|---|
| Bot Telegram, chat 1:1 + push în grupul echipei | VICU-001, VICU-002 |
| Integrat în CRM-ul Lovable (context = CRM + taskuri + FB Ads) | VICU-005, Fazele 2–4 |
| Monitorizează + face rapoarte | VICU-101, VICU-203, VICU-204, VICU-302 |
| Taskurile ajută KPI-urile? update zilnic | VICU-201, VICU-202, VICU-203 |
| Analiză zilnică: cum îmbunătățim planificarea | VICU-203 |
| Rezultate vânzări din CRM + KPI pe vânzări + update-uri | VICU-204, VICU-706 |
| Digest zilnic: taskuri neasignate | VICU-101 |
| Taskuri mutate frecvent fără motiv | VICU-102, VICU-103 |
| Motiv obligatoriu la schimbarea termenului + raport | VICU-102, VICU-103, VICU-104 |
| Învață din feedback, își schimbă promptul | VICU-601, VICU-602, VICU-604 |
| Analizează toate campaniile × vânzări | VICU-301, VICU-302, VICU-303 |
| Checklist obligatoriu per curs, asignat la fiecare start | VICU-401 |
| Monitorizarea schimbărilor de scope | VICU-402 |
| Ședințe în română → analiză | VICU-501–504 |
| Taskuri din ședință confirmate de oameni („să fie reale") | VICU-505 |
| Update: taskurile din ședință au fost adăugate? | VICU-506 |
| Taskuri repetitive → propunere de automatizare | VICU-603 |
| **„Să fie ca un om adevărat"** (v2) | VICU-003 (persona), VICU-701, VICU-702, VICU-604 |
| **Ajutor pentru fiecare membru al echipei** (v2) | VICU-703, VICU-704, VICU-705, VICU-706 |
| **„Sunt prost la delegare"** — direct | VICU-705 |

## Ordine recomandată (valoare/efort, revizuită v2)

1. **Faza 0 + Faza 1** — fundația + pilotul (igiena taskurilor). Primul „wow": briefingul
   done-first + Vicu care întreabă blând de taskul mutat.
2. **VICU-701 + VICU-702 + VICU-601** — trase devreme: persoana, ritualurile și captarea
   feedbackului sunt ce-l fac „coleg", nu „script"; și acumulează date pentru Faza 6.
3. **Faza 2** — alinierea KPI (acum ieftină: `strategy_kpis` există; miezul cererii).
4. **Faza 5** — ședințele (durerea „vorbim și nu se întâmplă nimic"); VICU-506 e diferențiatorul.
5. **Faza 3 + VICU-703/704/705/706** — ads×vânzări + briefs per rol + antrenorul de delegare.
6. **Faza 4** — checklist curs + scope (efort mic, se strecoară oricând).
7. **Restul Fazei 6** — auto-revizuirea promptului, detectorul de repetitive.

> 33 de item-uri (28 v1 + 5 noi în Faza 7; VICU-201/301/302/401/704 micșorate prin reuse).
> Înainte de build, backlog-critic (§3.5.1bis) trece peste specurile detaliate ale fiecărei faze.
