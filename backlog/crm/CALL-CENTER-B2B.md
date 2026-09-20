# CRM pentru outreach B2B / call-center — analiză de goluri + plan de construcție

> **Cui îi trebuie:** o firmă care cumpără/importă liste de companii, le împarte între agenți de
> vânzări care sună, și urmărește pâlnia **SPANCO** cu bani și rate de cădere pe fiecare etapă.
>
> **Regula documentului:** întâi ce EXISTĂ deja în FinFlow (ca să nu construim a doua oară),
> apoi golul exact, apoi item-ul care îl închide. Sursa de adevăr pentru ce s-a portat din
> crm-vector rămâne [`PORT-DIN-CRM-VECTOR.md`](PORT-DIN-CRM-VECTOR.md); matricea de conformitate
> pe caietul Ecosolar e în [`CONFORMITATE-ESP-CRM.md`](CONFORMITATE-ESP-CRM.md).

---

## 1. Ce există deja (verificat pe `origin/main`, 20.09.2026)

| Cerința clientului | Starea azi | Unde |
|---|---|---|
| Import Excel/CSV cu maparea coloanelor | **Există** — vrăjitor în 3 pași, `.xlsx` prin exceljs, CSV RFC 4180 cu detecție de separator, previzualizare din ACEEAȘI funcție care scrie, dedup, mapări salvate, jurnal de importuri | `server/lib/crm/importFile.ts`, `src/pages/business/crm/CrmImportPage.tsx` |
| Repartizare către agenți | **Parțial** — acțiuni în masă (max 100/cerere) + reguli automate (round-robin, după capacitate, ponderat) + plan de reechilibrare | `server/lib/crm/assignment.ts`, `POST /api/crm/leads/bulk` |
| Etape configurabile (SPANCO) | **Parțial** — etapele sunt per workspace, cu `is_won`/`is_lost`/`probability_pct`, mai multe pâlnii | `server/db/schema/crmPipelineStages.ts` |
| Tablă Kanban + fișa leadului | **Există** — fișă pe 6 file, contacte multiple, câmpuri personalizate, fișiere, istoricul persoanei, filtre pe server | `src/components/crm/LeadDetailSheet.tsx` |
| Cod fiscal (IDNO) pe client | **Există în bază** — `crm_companies.idno`, criteriu decisiv la dedup | `server/db/schema/crmCompanies.ts` |
| Generare ofertă / contract din lead | **Există** — pornește motorul de acte FinFlow, cu rechizitele firmei înghețate în act, link public + semnal „Vizualizat" | `server/routes/crmDocuments.ts` |
| Rapoarte | **Parțial** — KPI pe perioadă, conversie între etape, pe agent, motive de pierdere, pe produs | `server/lib/crm/reports.ts`, `CrmReportsPage.tsx` |

**Concluzia:** nu construim un CRM de la zero. Construim **șapte piese lipsă** peste unul matur.

---

## 2. Golurile, spuse pe față

### G1 — Importul nu poate duce o coloană oarecare nicăieri
`IMPORT_TARGET_FIELDS` e o listă **fixă**, croită pe clientul de panouri fotovoltaice:
`interest_course`, `annual_consumption_kwh`. Un fișier real de call-center are „Cod CAEN",
„Nr. angajați", „Sursa listei", „Sub-sector", „Cifra de afaceri 2025". Azi toate astea pot merge
doar la `— ignoră coloana —`. Câmpurile personalizate (`custom_fields`) există și au rute, dar
**importul nu le poate scrie**, iar etichetele (`lead_tags`) la fel.

Mai grav: **`idno` NU e în lista de mapare.** Importăm o listă de firme cu cod fiscal și îl
aruncăm — exact cheia după care s-ar face dedup-ul corect.

### G2 — Nu există un set de etape SPANCO
Seed-ul implicit e din centre educaționale: `Lead nou / Contactat / Trial-Demo / Client / Pierdut`.
Un workspace de vânzări B2B își rescrie manual etapele, una câte una, ghicind ce flag pune unde.

### G3 — Repartizarea „200 lui A, 200 lui B, restul rece" nu se poate face
`POST /api/crm/leads/bulk` lucrează pe **id-uri selectate**, plafon 100. Ca să dai 200 de contacte
unui agent, cineva bifează 200 de cartonașe cu mâna, în două cereri. Nu există noțiunea de
**lot** (ia N din segmentul filtrat, dă-i-le lui X), și nici „rezerva rece" ca stare cu nume.

### G4 — Pâlnia nu se vede ca pâlnie
Rapoartele au un tabel de conversie și un grafic cu bare. Lipsesc trei lucruri cerute explicit:
1. **forma de pâlnie**, vizuală;
2. **banii pe fiecare etapă** (azi se numără doar lead-uri);
3. **rata de cădere pe fiecare etapă**, arătată lângă etapă, nu dedusă din două coloane.

Și lipsește **filtrarea**: `GET /api/crm/reports` acceptă doar `from`, `to`, `owner`. Nu se poate
cere „pâlnia pentru industria alimentară", deși segmentarea există pentru lista de leaduri.
Filtrele existente sunt oricum bătute în cuie pe firmografia energetică (industrie/regiune/mărime/
consum kWh) — o coloană importată nu poate filtra nimic.

### G5 — KPI-urile se măsoară, dar nu au normă
`salesKpis()` numără apeluri, întâlniri, oferte, contracte. Nu există **ținta**: „fiecare agent sună
60 de firme pe săptămână". Fără normă nu există „a realizat 43 din 60 (72%)", adică exact
răspunsul pe care îl caută un manager de call-center luni dimineața.

### G6 — Apelul nu are un rezultat cu vocabular
Rezultatul apelului stă în `lead_interactions.metadata` ca text liber, iar raportul caută literal
`outcome === "answered"`. Într-un call-center, diferența dintre „nu răspunde", „a răspuns
secretara", „am vorbit cu decidentul" și „refuz" **este** raportul. Fără un set închis:
- nu se poate calcula contactabilitatea listei (câte apeluri până la un decident),
- nu se poate opri automat sunatul după N încercări,
- nu se poate compara o listă cumpărată cu alta.

### G7 — Nimic nu întoarce în rezervă un lead pe care agentul nu l-a atins
Dacă un agent primește 200 de contacte și sună 40, restul de 160 stau blocate pe numele lui.
Cadențele și reactivarea există pentru lead-uri **contactate**, nu pentru cele repartizate și
neatinse.

---

## 3. Item-urile de construit

Ordinea nu e negociabilă: G1 deschide drumul (fără coloane importate n-ai ce filtra în pâlnie),
G3 depinde de segmentare, G4 de ambele.

| Item | Ce livrează | Depinde de |
|---|---|---|
| **CC-1** | Import: orice coloană → câmp personalizat, etichetă, sau IDNO | — |
| **CC-2** | Șabloane de pâlnie: SPANCO + Call-center B2B, alese la crearea pâlniei | — |
| **CC-3** | Repartizare pe loturi: din segmentul filtrat, N contacte fiecărui agent, restul în rezervă | CC-1 |
| **CC-4** | Tabloul pâlniei: formă vizuală, bani pe etapă, cădere pe etapă, filtrat pe agent/pâlnie/câmp importat | CC-1 |
| **CC-5** | Norme KPI pe agent + grad de realizare în rapoarte | — |
| **CC-6** | Rezultatul apelului cu vocabular închis + contorul de încercări | — |
| **CC-7** | Întoarcerea în rezervă a lead-urilor neatinse | CC-3, CC-6 |

### CC-1 — Importul scrie orice coloană

**De făcut:**
- lista de ținte a importului devine **dinamică**: câmpurile fixe + `idno` + `tag` +
  `cf:<key>` pentru fiecare câmp personalizat al workspace-ului;
- coloana mapată pe `tag` adaugă o etichetă pe lead (valori separate prin `,` sau `;` → etichete
  distincte);
- o coloană nemapată poate deveni câmp personalizat nou **dintr-un buton**, fără drum prin
  Setări (altfel nimeni n-o va face);
- `idno` scrie pe fișa firmei și intră în dedup ÎNAINTEA telefonului/emailului.

**Gata când:** un fișier cu coloanele `Denumire, IDNO, Telefon, Cod CAEN, Nr. angajați, Sursa`
se importă cu toate cele 6 coloane păstrate, iar `Cod CAEN` se poate filtra în listă și în pâlnie.

### CC-2 — Șabloane de pâlnie

`SPANCO`: Suspect → Prospect → Analiză (Approach/Analysis) → Negociere → Concluzie →
Comandă (câștigat), plus Pierdut. Probabilități implicite crescătoare, flagurile puse corect.
Al doilea șablon, `Call-center B2B`: Rezervă rece → Repartizat → Apel în lucru → Decident atins →
Ofertă trimisă → Negociere → Contract (câștigat) → Pierdut.

**Gata când:** la „Pâlnie nouă" se poate alege un șablon, etapele apar cu flagurile și culorile
corecte, iar pâlniile existente nu se ating.

### CC-3 — Repartizare pe loturi

Ecran nou, „Repartizare": alegi segmentul (aceleași filtre ca lista, inclusiv câmpurile
importate), vezi **câte contacte** sunt disponibile (nerepartizate), pui pentru fiecare agent
câte îi dai, apeși o dată. Restul rămân nerepartizate — asta E rezerva rece, nu o etapă
inventată.

**Reguli:**
- serverul lucrează pe **filtru + număr**, nu pe id-uri (altfel plafonul de 100 rămâne un zid);
- ordinea de luare e stabilă și explicită (cele mai vechi întâi), ca două rulări să nu amestece;
- răspunsul spune cât a primit fiecare ȘI cât n-a mai fost de unde să dea;
- fiecare repartizare scrie în jurnalul CRM (cine, cui, câte, pe ce filtru).

### CC-4 — Tabloul pâlniei

O pagină, nu un al treilea raport ascuns: pâlnia desenată pe verticală, fiecare etapă cu
- **stânga:** valoarea (suma `value_cents` a lead-urilor din etapă) + valoarea ponderată cu
  probabilitatea;
- **dreapta:** câte au căzut față de etapa precedentă, în procente.

Deasupra: perioada, pâlnia, agentul, și filtrele de segment (inclusiv câmpuri importate și
etichete). Sub pâlnie: aceeași pâlnie **descompusă pe agent**, ca să se vadă cine pierde unde.

**Onestitatea calculului** (regula pe care rapoartele existente o respectă deja și pe care nu o
rupem): lead-urile importate în bloc, fără tranziții înregistrate, nu au istoric de etape — deci
căderea se calculează din **tranziții reale** acolo unde există, iar instantaneul curent e marcat
ca atare. Nu inventăm o intrare la data creării.

### CC-5 — Norme KPI

Tabelă nouă: normă per utilizator per perioadă (săptămână/lună), pe indicatorii care există deja
(apeluri, contacte reușite, întâlniri, oferte, contracte, valoare). În rapoarte, fiecare KPI
capătă „realizat / normă" și un procent. Fără normă setată, afișarea rămâne ca azi — un număr gol,
nu un 0%.

### CC-6 — Rezultatul apelului

Set închis: `answered` (decident atins), `gatekeeper`, `no_answer`, `busy`, `wrong_number`,
`callback` (cu dată), `refused`, `not_interested`. Contor de încercări pe lead, incrementat la
fiecare apel fără răspuns. Raport de contactabilitate: apeluri → răspunsuri → decidenți → oferte.

### CC-7 — Întoarcerea în rezervă

Regulă per workspace: un lead repartizat și neatins de N zile (fără nicio interacțiune) se
întoarce automat în rezervă, cu o linie în cronologie. Rulează în cronul CRM existent (07:00).

---

## 3bis. Ce s-a livrat (20.09.2026)

Toate cele șapte item-uri sunt pe `main`. Ce trebuie știut ca să nu se reconstruiască:

| Item | Unde trăiește | Ce a ieșit altfel decât în plan |
|---|---|---|
| CC-1 | `server/lib/crm/importFile.ts`, `routes/crmImport.ts` | În plus față de plan: un rând FĂRĂ nume de persoană, dar cu firmă, nu mai e respins — firma devine numele leadului. Fără asta, un import de 800 de companii se termina cu 0 create. |
| CC-2 | `server/lib/crm/stages.ts` (`PIPELINE_TEMPLATES`) | — |
| CC-3 | `server/routes/crmDistribution.ts`, `pages/business/crm/CrmDistributionPage.tsx` | Plafonul e 5.000/cerere (nu 100, ca la acțiunile în masă): repartizarea nu rulează automatizări per lead, deci poate duce loturi mari. |
| CC-4 | `server/lib/crm/reports.ts` (`funnelBreakdown`), `routes/crmReports.ts` → `GET /funnel`, `components/crm/FunnelChart.tsx` | Pâlnia e desenată cu CSS, nu cu Recharts: o pâlnie e o listă de bare cu două numere alături, iar un grafic ar fi mutat cifrele în tooltip. |
| CC-5 | `db/schema/crmKpiTargets.ts`, `routes/crmKpiTargets.ts`, `reports.ts` (`kpiAttainment`) | Normele se SCALEAZĂ la perioada raportului (60/săptămână privit pe 28 de zile = 240). Fără normă nu există 0%. |
| CC-6 | `server/lib/crm/callOutcomes.ts`, coloanele `leads.call_*` (migrarea 0181) | Butonul „Am sunat" nu scria niciun rezultat, deci „contacte reușite" era 0 la toată lumea, mereu. Acum rezultatul se alege ODATĂ cu notarea apelului. |
| CC-7 | `server/lib/crm/recall.ts`, `leads.assigned_at` + `crm_recall_settings` (migrarea 0182), pasul 3 din cronul zilnic | Regula e OPRITĂ implicit: o automatizare care ia clienți de la un agent nu se aprinde singură. |

**Migrări noi:** 0180 (norme KPI), 0181 (rezultatul apelului), 0182 (întoarcerea în rezervă) —
toate cu heal în `server/db/ensure/crmParity.ts`, fiindcă producția nu aplică fiabil migrările.

**Filtrele de segment** acceptă acum `tag` și `cf_<cheie>` peste tot unde erau doar firmografia
fixă: listă, tablă, repartizare, pâlnie. Cheile sunt aceleași în query string și în corpul
cererii de repartizare — o singură gramatică.

---

## 4. Ce NU construim (și de ce)

- **Al doilea motor de acte.** CRM-ul cheamă motorul FinFlow — vezi `PORT-DIN-CRM-VECTOR.md`.
- **Telefonie (SIP/PBX), apel din browser, înregistrarea convorbirii.** E contract cu un furnizor,
  nu dezvoltare — cele 7 „Nu" din matricea Ecosolar sunt toate aici.
- **Un al doilea set de roluri/permisiuni.** Se folosesc cele din `crm_user_permissions`.
