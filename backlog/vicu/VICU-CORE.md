# VICU — colegul AI al Vector Academy (concept v2)

> **Vicu** este colegul AI al echipei Vector Academy: o singură persoană digitală, cu nume, voce
> și memorie, care trăiește în Telegram + în crm-vector, vede tot contextul operațional
> (TaskBoard, CRM/vânzări, Meta Ads via Windsor, ședințe, Zoom) și face ce ar face un
> chief-of-staff bun: briefing dimineața, aliniere task↔KPI, accountability blând, analiză de
> campanii, urmărirea deciziilor din ședințe — și învață din feedback.
>
> v1: briefing-ul owner-ului, 2026-07-16. **v2 (aceeași zi):** + inventarul real crm-vector,
> + cercetare de piață asupra produselor „AI coworker" (surse în §7), + design de persoană,
> + capabilități per rol pentru echipa reală. Redenumit din VIC în **VICU** la cererea owner-ului.
> Backlog: [`VICU-BACKLOG.md`](VICU-BACKLOG.md). Prefix item-uri: **VICU-xxx**.

---

## 1. Problema (în cuvintele owner-ului)

1. **Delegarea nu se întâmplă** — owner-ul ține totul în cap; nimeni nu urmărește sistematic
   dacă execuția zilnică servește strategia.
2. **Taskurile alunecă** — neasignate, cu termene mutate repetat fără motiv; nimeni nu întreabă.
3. **Ședințele nu produc nimic** — „vorbim mult la ședințe și nu se întâmplă nimic".
4. **Nimeni nu leagă taskurile de KPI** — strategia are KPI-uri, execuția nu e verificată zilnic.
5. **Campaniile și vânzările trăiesc separat** — Facebook Ads × vânzări CRM, neanalizate împreună.
6. **Munca repetitivă nu se automatizează** — nimeni nu observă tiparele.
7. **Checklist-ul de curs nu e garantat** — promovare → onboarding → feedback → diplome depind
   de memoria umană la fiecare start de curs.

## 2. Cine e Vicu (persoana)

- **Un singur Vicu, nu un roi de mini-boți.** Piața a testat ambele: platformele cu 12 personaje
  separate (Sintra) sunt percepute ca „strat de automatizare", nu ca un coleg; o singură voce
  coerentă pe toate suprafețele (Telegram 1:1, grup, CRM) trece bariera de „coleg". Vicu e unul.
- **Vorbește românește, ca un om**, nu ca un raport: scurt, cald, direct, cu umor moderat.
  Nu folosește corporate-speak. Semnează totul „Vicu".
- **Ține minte oamenii, nu doar datele.** Are un profil viu per membru (rol, boarduri, program,
  cum preferă să fie pinguit, ce a promis săptămâna asta) — combinația „memorie despre oameni +
  briefing zilnic" nu există azi în niciun produs de pe piață; e exact golul pe care îl umplem.
- **E proactiv** — linia de demarcație din cercetare: „un AI fără memorie e o unealtă cu care
  vorbești; un coleg observă firul neterminat și revine el la tine". Vicu deschide conversații:
  reia promisiunile din retro, întreabă de taskul mutat, felicită vânzarea închisă.
- **Recunoaște când nu știe / a greșit.** Alertele false se corectează public și intră în
  raportul lui săptămânal despre sine (VICU-604). Încrederea vine din onestitate, nu din aplomb.

### Granița importantă (din cercetare, nu negociabilă)
Studiile BU/HBR 2026: când output-ul AI e încadrat ca venind de la un „angajat AI", oamenii prind
cu **18% mai puține erori** și escaladează cu 44% mai mult în loc să corecteze singuri. De aceea:
- Vicu are personalitate, dar **niciodată ownership**: orice task, decizie sau cifră are un om
  numit care răspunde de ea. Vicu propune, semnalează, întreabă — omul deține.
- **Fără scoruri de „engagement"/sentiment pe persoane** (gen Read.ai) — e trăsătura cea mai
  criticată din toată piața: penalizează introvertiții și otrăvește încrederea, cu atât mai mult
  într-o echipă de 6 în care toți se cunosc. Vicu măsoară munca (taskuri, lead-uri, campanii),
  nu oamenii.
- **Etichetă de nudge fără blamare**: „hai să vedem împreună ce s-a întâmplat cu X", nu „n-ai
  făcut X". Escaladarea sensibilă merge privat către owner (mod „doar către manager"), nu în grup.
- **Guardrail-then-delegate la bani**: la ads, omul setează plafoanele (spend cap, ROAS floor),
  Vicu monitorizează bucla rapidă și propune; nicio schimbare de spend fără confirmare umană.

## 3. Echipa lui Vicu — ce face pentru fiecare (Vector Academy: cursuri + platformă HR)

| Cine | Ce face Vicu pentru el/ea, concret |
|---|---|
| **Dumitru (owner)** | **Briefing „prezidențial" dimineața** (pipeline + taskuri critice + anomalii ads + top 3 priorități azi). **Antrenor de delegare** — exact durerea declarată: detectează taskurile pe care owner-ul le ține și puteau fi delegate, propune cui (pe baza `team_daily_load` + `analyze-user-skills`, ambele există). Update zilnic aliniere KPI. Raport săptămânal de valoare al lui Vicu, măsurat în rezultate (lead-uri→plăți), nu în „mesaje trimise". |
| **Marketing manager** | Verdicte pe campanii cu justificare (scalează / oprește / testează) din `marketing_costs` (Windsor) × `sales` — ROAS real din vânzări CRM, nu din pixel. Alerte de oboseală creativă (`get-ad-creatives`). Conformitatea checklist-ului de promovare la fiecare lansare de curs (`marketing_task_templates` există). Brief săptămânal: CPL/ROAS per curs. |
| **Sales manager** | **Speed-to-lead**: lead nou necontactat în N ore → ping. Lead-uri blocate în pipeline fără activitate. Conformitatea cadențelor (`cadences`/`lead_cadence_enrollments` există). „Cine te așteaptă azi" dimineața (LeadsToday, împins în Telegram). Tipare de lost-reason lunar. Semnalarea privată a deal-urilor în risc (mod doar-către-manager). |
| **Product manager (platforma HR)** | Igiena boardului de produs (taskuri fără AC/termene). Jurnalul schimbărilor de scope pe produs. **Vocea clientului săptămânal**: agregarea `feedback_responses` + concluziile din ședințele cu clienți → top 3 dureri. Deciziile din ședințe → taskuri confirmate pe boardul de produs. |
| **Designer** | **Paznicul briefului**: task nou către design fără descriere/atașament/deadline → Vicu cere completarea DE LA CEL CARE L-A CREAT, nu de la designer. Ce stă blocat „la review" la alții. Coada săptămânii, clară luni dimineața. |
| **Video creator** | Pipeline-ul de producție per curs (filmare → montaj → publicare, din șabloane). `zoom_recordings` deja mapate cu AI (`ai-map-recordings`) → lista materialelor brute per curs. Candidat #1 la detectorul de muncă repetitivă (montaj/publicare au pași identici la fiecare curs → propuneri de automatizare). |
| **Toată echipa** | Digest de dimineață cu accent pe **„ce s-a făcut"** (nu doar „ce e restant" — framing-ul CRMChat, anti-oboseală-de-nag). Sărbătorirea vânzărilor închise în grup. **Retro async vineri** (3 întrebări, stil Geekbot, răspunsuri în Telegram, concluziile în TaskBoard). Echilibrul de încărcare (`analyze-team-workload` există). Întreabă-l orice cu @mention: „Vicu, ce a zis clientul X despre preț?" — răspunde din date + ședințe (stil AskFred). |

## 4. Ce există DEJA în crm-vector (Vicu folosește, nu reconstruiește)

Inventar verificat pe cod, 2026-07-16 (`/Users/dima/crm-vector`, branch `main`):

| Există deja | Consecința pentru Vicu |
|---|---|
| `strategy_kpis` + `strategy_kpi_tasks` (14.07.2026!) + pagina Strategy | Registrul KPI **există**: ținte, perioade, owneri, taskuri legate cu pondere. Vicu doar citește + judecă taskurile NElegate + împinge alinierea zilnic. |
| `sales` (amount, course_name, utm_campaign) + `marketing_costs` (Windsor/FB) + `Roas.tsx`, `AdsAnalysis.tsx`, `analyze-ads`, `get-ad-creatives`, `sync-windsor` | Ads×vânzări e **calculabil azi**. Vicu adaugă verdicte LLM + alerte + push Telegram, nu plumbing de date. |
| `send-weekly-update` (bot Telegram cu `TELEGRAM_BOT_TOKEN`+`TELEGRAM_CHAT_ID`+`LOVABLE_API_KEY`) | **Botul există, dar e doar push, one-way.** Faza 0 = îl facem bidirecțional (webhook + linking), refolosind același token. |
| TaskBoard complet: `board_tasks`, `board_task_activity`, `board_task_templates`, `board_checklists`, comments/tags | Pilotul de igienă are toate datele; `board_task_activity` probabil prinde deja mutările — lipsește doar câmpul „motiv". |
| `team_daily_load`, `team_task_estimates`, `analyze-team-workload`, `analyze-user-skills` | Analiza de încărcare/skills per om **are deja funcții AI**. Vicu le dă voce și cadență. |
| `zoom_recordings`, `zoom_attendance`, `ai-map-recordings` | Înregistrările Zoom intră deja în DB → ședințele pe Zoom pot curge în analiza lui Vicu fără upload manual. |
| `tasks-mcp` (list_boards, list_members, bulk_create_tasks) | Interfața programatică pentru crearea taskurilor confirmate din ședințe există. |
| `cadences`, `lead_tasks`, `lead_interactions`, `pipelines` | Watchdog-ul de follow-up vânzări e realizabil imediat. |
| `feedback_forms/responses`, `contracts` + `extract-contract-data`, `course_edition_*` (budgets/costs/participants) | Vocea clientului, economia per ediție de curs, contracte — toate interogabile. |
| `marketing_tasks` + `marketing_task_templates`, `upcoming_events`, `calendar_events` | Checklist-ul de promovare per lansare are deja structura. |

> **Concluzia v2:** Vicu e mai puțin „construiește integrări" și mai mult **„dă analizei
> existente o personalitate, o voce în Telegram și accountability per persoană"**. Proiect mult
> mai ieftin și mai rapid decât presupunea conceptul v1.

## 5. Arhitectură

```
 Telegram (owner 1:1, grup,      ┌──────────────────────────────────────────────┐
 DM-uri membri linked)           │            crm-vector (Supabase)             │
   │ webhook (NOU)               │                                              │
   ├────────────────────────────►│  Edge Functions NOI:                         │
   │ push ◄──────────────────────│   vicu-telegram (in/out, reuse bot token)    │
                                 │   vicu-agent   (creier: LLM, prompt din DB)  │
                                 │   vicu-cron-*  (briefing/analize/retro)      │
                                 │   vicu-transcribe (audio RO → text)          │
                                 │                                              │
                                 │  Edge Functions EXISTENTE refolosite:        │
                                 │   analyze-ads · analyze-team-workload        │
                                 │   analyze-user-skills · ai-map-recordings    │
                                 │   tasks-mcp · sync-windsor                   │
                                 │                                              │
                                 │  Tabele NOI: vicu_settings, vicu_prompt_     │
                                 │   versions, vicu_runs, vicu_reports,         │
                                 │   vicu_feedback, vicu_people, telegram_      │
                                 │   links, task_change_log, meetings,          │
                                 │   meeting_tasks                              │
                                 │                                              │
                                 │  Date EXISTENTE: strategy_kpis(+tasks),      │
                                 │   board_*, leads/pipelines/sales,            │
                                 │   marketing_costs, zoom_*, feedback_*,       │
                                 │   team_daily_load, cadences, contracts       │
                                 └───────┬──────────────┬───────────────────────┘
                                         │              │
                                  Windsor.ai / Meta   LLM (Claude API sau
                                  (deja sincronizat)  Lovable AI gateway) +
                                                      STT română (ElevenLabs
                                                      3.1% WER / Whisper)
```

- **Creierul**: system-promptul e în `vicu_prompt_versions` (versionat) — condiția pentru
  învățarea din feedback (VICU-602). Fiecare mesaj = un rând în `vicu_runs` (audit total).
- **Memoria despre oameni**: `vicu_people` — rol, boarduri, preferințe de comunicare, promisiuni
  active, fus/program. Actualizată automat din interacțiuni + editabilă în CRM.
- **Scheduler**: `pg_cron` + `pg_net` (briefing 08:30, analize 17:30, retro vineri 15:00,
  săptămânalul duminică seara — Europe/Chișinău, configurabile).
- **Checkpoint, nu autonomie mută**: orice scriere a lui Vicu (task creat, câmp completat) e
  logată, reversibilă, atribuită („creat de Vicu, confirmat de X") — modelul Asana/ClickUp.

### Regula Lovable-deploy (§0.0) — obligatorie
Fiecare migrare SQL, secret (`ANTHROPIC_API_KEY`/STT key — `TELEGRAM_BOT_TOKEN` există deja) și
job `pg_cron` = pas manual → intrare `LOVABLE-DEPLOY.md` cu `[ ] NEAPLICAT`, verificată la push.

## 6. Ritualurile lui Vicu (cadența care-l face „real")

| Când | Ce | De ce așa |
|---|---|---|
| Zilnic 08:30, grup | **Briefing de dimineață**: ieri s-au făcut X (nominal, cu laude), azi contează Y, atenție la Z (max 15 rânduri) | „Ce s-a făcut" înaintea „ce e restant" — anti-nagging (CRMChat); briefing-ul zilnic e ritualul pe care converg toate produsele chief-of-staff |
| Zilnic 08:30, owner 1:1 | **Briefing extins**: + pipeline, + ads, + top 3 priorități, + 1 propunere de delegare | modelul „Presidential Brief" (Bond, alfred_) |
| La eveniment | Vânzare închisă → felicitare în grup; lead necontactat N ore → ping vânzări; task fără motiv la mutare → întrebare blândă | proactivitate = bariera de „coleg" |
| Vineri 15:00 | **Retro async, 3 întrebări** (ce a mers / ce nu / ce schimbăm), răspunsuri în Telegram, sinteza luni în briefing + taskuri confirmate | cel mai ieftin ritual din piață cu efect dovedit pe încredere (Geekbot) |
| Duminică seara | **Raportul lui Vicu despre Vicu** către owner: ce a semnalat, ce a nimerit/ratat, feedback primit, ce propune să-și schimbe | onestitate → încredere; alimentează VICU-602 |
| Oricând | @mention în grup sau DM: întrebări libere peste date + ședințe („cât am cheltuit pe campania X?", „ce am decis despre prețul cursului Y?") | AskFred-style — capabilitatea cel mai des lăudată din categoria meeting-AI |

## 7. Ce am învățat din piață (cercetare 2026-07-16, surse complete în raportul de research)

**De copiat:** briefing zilnic (alfred_/Bond) · „ce s-a făcut" framing (CRMChat) · Q&A conversațional
peste ședințe (Fireflies AskFred) · buclă forțată de follow-up pe action-items — resurfacing la
următoarea ședință (diagnosticul categoriei: „extracția fără execuție e table stakes") · memorie
per persoană (Coworker.ai OM1, Personal.ai) · checkpoint + audit-trail (Asana AI Teammates,
ClickUp Brain) · retro async 3 întrebări (Geekbot) · rutare privată către manager (Standuply) ·
verdicte ads cu plafoane umane (Triple Whale Moby, Madgicx) · valoarea lui Vicu măsurată în
rezultate, nu în activitate (modelul de pricing HubSpot Breeze 2026).

**De evitat:** scoring de engagement pe persoane (Read.ai — cea mai criticată trăsătură din toată
piața) · roi de mini-boți cu nume (Sintra — perceput ca gimmick) · framing „angajat AI" (BU/HBR:
−18% erori prinse, +44% escaladări inutile) · costuri opace și suport mort (Lindy, Trustpilot
1.7/5) · „autonomous PM" ca produs întreg (Height — închis în 2025; autonomia supraviețuiește ca
feature în fluxul existent, nu ca înlocuitor) · action-items halucinate din audio zgomotos
(ClickUp) — de aceea taskurile din ședințe cer confirmare umană + citat-sursă.

**Prior art direct:** Telebiz (07.2026) — CRM AI nativ în Telegram (rezumat de grupuri, lead-uri
din chaturi, remindere pe deal-uri stagnante); CRMChat — digest de dimineață cu ce s-a finalizat.
Validează teza: echipele Telegram-native adoptă exact acest tip de coleg.

**Transcriere RO:** ElevenLabs Speech-to-Text — 3.1% WER pe română (FLEURS), peste
Whisper/Gemini → candidatul principal pentru VICU-503 (de validat pe o ședință reală).

## 8. Decizii confirmate de owner (2026-07-16)

| Întrebare | Decizie |
|---|---|
| Unde trăiesc KPI-urile? | **Deja în CRM** — confirmat în cod: `strategy_kpis` + `strategy_kpi_tasks`. |
| Cum ajung ședințele la Vicu? | **Toate trei**: audio pe Telegram + upload în CRM + înregistrare direct din CRM. (+ v2: Zoom recordings intră deja automat.) |
| Primul slice? | **Igiena taskurilor** (Faza 1). |
| Cine vorbește cu botul? | **Owner 1:1 + grupul echipei**; Vicu cere motive membrilor. |
| Numele | **Vicu** (redenumit din VIC, cerut 2026-07-16). |

## 9. Întrebări deschise

1. **Definiția „scope change"** — v1: modificări de titlu/descriere/checklist pe taskuri + plan
   de curs; de rafinat după primul raport.
2. **STT română** — ElevenLabs (3.1% WER) vs Whisper: test pe o ședință reală la VICU-503.
3. **LLM-ul lui Vicu** — Claude API direct vs Lovable AI gateway (`LOVABLE_API_KEY` există deja
   în send-weekly-update): de decis la VICU-003 după un test de calitate pe română + cost.
4. **Membrii echipei + handle-uri Telegram** — se rezolvă organic la linking (VICU-001).
5. **Boardurile per rol** — care board e al produsului HR, care al marketingului etc.; mapare la
   onboarding-ul lui Vicu (VICU-701).

---

*v2 — 2026-07-16. Implementarea țintește crm-vector; acest folder e sursa de adevăr pentru
concept + backlog.*
