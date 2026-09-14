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
| tasks + today | 199 + 135 | 3 | ✅ livrat |
| tags | 151 | 3 | ✅ livrat |
| importFile (CSV) | 576 | 4 | ✅ livrat — fără .xlsx, vezi mai jos |
| companies + duplicates | 249 + 733 | 4 | ✅ livrat |
| documents (oferte/contracte) | 740 + docs/* | 5 | ✅ livrat — pe motorul FinFlow, vezi mai jos |
| reports + analytics | 478 + 275 | 6 | ✅ livrat |
| automations | 230 | 7 | ✅ livrat |
| assignment | 641 | 7 | ✅ livrat |
| calls + channels | 413 + 341 | 8 | ✅ livrat ca „Comunicare" |
| cadences | 305 | 9 | ✅ livrat — cron zilnic la 07:00 |
| reengagement | 371 | 9 | ✅ livrat — preview obligatoriu înainte de rulare |
| roles + audit | 158 + 147 | 9 | ✅ livrat — peste rolurile și jurnalul existente |
| pipelines (pâlnii multiple) | 134 | 9 | ✅ livrat |
| savedViews | 28 | 9 | ✅ livrat — personale implicit |
| files (fișiere pe lead) | 58 | 9 | ✅ livrat — prin Storage, nu base64 |
| history (istoricul persoanei) | 57 | 9 | ✅ livrat |
| reminders (clopoțel) | 87 | 9 | ✅ livrat |
| fișa pe file + contacte + câmpuri | — | 9 | ✅ livrat |
| vedere listă/tabel | — | 9 | ✅ livrat |

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


## Ce NU s-a portat ca atare, și de ce

Patru decizii luate pe parcurs. Le scriu aici fiindcă fiecare e o abatere de la
„copiază tot", iar cine se uită peste un an trebuie să înțeleagă de ce.

**1. Motorul de acte nu s-a portat.** FinFlow îl are deja — șabloane cu versiuni,
numerotare rezervată la finalizare, înghețarea rechizitelor, jurnal, PDF, email.
Motorul din crm-vector plecase, de fapt, de aici. Un al doilea ar fi divergent în
câteva luni și nimeni n-ar mai ști care produce actul adevărat. În loc de port:
`docs.ts` expune `createDocumentRecord()`, iar CRM-ul traduce un lead în
contrapartea actului. Cele 115 teste docgen au rămas neatinse.

**2. Fără al doilea registru de persoane.** crm-vector avea `sales_members`
fiindcă responsabilul era text liber. Aici oamenii sunt `users`. Două liste de
persoane s-ar desincroniza: cineva pleacă din firmă, dispare din `users`, dar
rămâne în roster și continuă să primească lead-uri. `crm_sales_settings` e doar
un rând de setări atașat unui user existent.

**3. Fără tabelă nouă pentru comunicare.** `lead_interactions` avea deja enum-ul
`call | email | whatsapp | sms | meeting` și `metadata` jsonb. Un al doilea jurnal
ar fi însemnat două cronologii ale aceluiași lead.

**4. Fără `.xlsx` la import.** N-am adăugat o dependință (SheetJS) pentru o
singură funcție. CSV acoperă orice export Excel; din Excel: „Salvează ca" → CSV.
Fișierele cu punct-și-virgulă (cum le dă Excel-ul în română) sunt recunoscute.

Și o abatere impusă de schemă: câmpurile de firmografie (industrie, regiune,
mărime, consum) nu există pe `leads` în FinFlow. Ajung pe `crm_companies`, unde
au coloane — nu se pierd, dar nici nu se falsifică pe lead.

## Faza 9 — livrată (2026-09-14)

Golul dintre FinFlow și crm-vector s-a închis. Ce s-a adăugat, în ordinea în care
s-a construit:

1. **Pâlnii multiple** (migrarea 0166). Cheia etapei devine unică pe
   (tenant, pâlnie, key) — două linii de business au amândouă dreptul la „new".
   `leads.pipeline_id` NULL se citește ca „pâlnia implicită", deci niciun lead
   existent nu s-a rescris.
2. **Vedere listă/tabel** comutabilă, cu sortare și paginare PE SERVER. Kanbanul
   citește 50 de carduri pe coloană; pe 3.200 de leaduri nu mai e instrument de lucru.
3. **Vizualizări salvate** — personale implicit, cu bifă „vizibilă echipei".
4. **Contacte multiple, câmpuri personalizate, fișiere, istoricul persoanei** —
   tabelele existau din migrarea 0007, dar n-aveau nicio rută.
5. **Fișa leadului pe șase file**, cu antetul mereu deasupra. Fiecare filă își cere
   datele ei la deschidere.
6. **Clopoțel de remindere** — restante/azi/mâine, cu insigna care numără doar urgentele.
7. **Cadențe + reactivare** (migrarea 0169) și cronul zilnic `/api/crm/cron/daily`.
8. **Roluri + jurnal CRM** peste cele existente în FinFlow.

### Abateri noi de la „copiază tot" (Faza 9)

**5. Fără al doilea set de roluri.** Referința adăuga `director_comercial`,
`team_leader`, `sales_manager` în baza de date. Aici rolurile de pe `users.role`
sunt folosite de tot restul aplicației; matricea de permisiuni se așază peste ele.
Și: `leads.view_all` rămâne la toate rolurile care intră azi în CRM — o
restrângere tăcută ar lua vederea de ansamblu unor oameni care se bazează pe ea.
Diferențierea e pe acțiunile administrative și distructive.

**6. Fără al doilea jurnal.** Intrările CRM merg în `audit_log` (tabela folosită
de celelalte module), cu prefixul `crm.` — același raționament ca la comunicare.

**7. Fără filă „Comunicare" separată în fișă.** Mesajele apar deja în „Activitate";
o filă separată ar fi o a doua cronologie a aceluiași lead.

**8. Fișierele nu trec prin browser către Storage.** Referința folosea
`supabase-js` din browser cu cheia publică. Aici cheia de service nu are ce căuta
în browser: serverul semnează, browserul urcă binarul direct în bucket, serverul
verifică octeții REALI înainte să scrie rândul (secvența de la atașamentele PAR).

**10. Cadența se oprește când clientul răspunde** — singurul lucru ADĂUGAT peste
crm-vector, unde o secvență merge înainte oricum. Vine din specul mai vechi al
FinFlow (CRM-126) și previne o umilință reală: clientul răspunde luni, iar
miercuri agentul primește „sună clientul, nu răspunde". Oprirea e vizibilă (notă
de sistem în cronologie) și reversibilă cu un click din fișă.

**9. Vizualizările salvate sunt personale.** În referință erau globale, fiindcă
baza avea un singur utilizator.

## De verificat pe producție

`GET /api/crm/health` (neautentificat) probează toate tabelele CRM, tipul coloanei
`leads.stage`, interogarea pâlniei și fiecare workspace în parte. A găsit deja două
probleme reale înainte să le vadă ownerul. Când nu mai e nevoie de el, se scoate —
dar nu înainte ca modulul să stea liniștit câteva săptămâni.
