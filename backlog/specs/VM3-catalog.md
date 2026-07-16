# VM3 — Feedback Violeta (conversație audio 2026-07-16)

> Sursă: transcrierea conversației owner ↔ Violeta (contabila care PLĂTEȘTE, nu creează PAR-uri —
> rolurile sunt divizate). Fiecare item de mai jos e un gap REAL verificat în cod la 2026-07-16;
> ce era deja livrat (duplicare, șabloane, import Excel config, DOA cu N pași, departament opțional,
> data cererii ajustabilă) NU se re-construiește. O fază = un branch = un PR (§0.2).
>
> Explicit AMÂNATE de Violeta în conversație (rămân în VM2, nu se construiesc acum):
> - Export fișier bancă TXT pt. 1C — „aici o să trebuiască încă de mai jucat asta" → VM2-10.
> - Reconciliere extras bancar → marchează plătit — „asta-i next step" → VM2-11.
> - Digest 2 emailuri/zi pt. aprobatori → VM2-06.
> - Rapoarte per departament/proiect — menționate ca „ulterior" → VM2-13.

---

## VM3-01 — Coada finanțe pentru contabil (cererea #1 a Violetei)

**Citat:** „vreau să văd IDNO-ul o coloniță, IBAN-ul o coloniță, suma și destinația plății o
coloniță. Și pe lângă proiect și budget line să se vadă… se poți face copie de aici în bancă
direct. Nu mai bat eu pe tastat… am posibilitatea să fac select la informația de aici."
Plus: „tu nu poți să deschizi aici" (rândul nu deschide PAR-ul) și „ar trebui să fie și
documentele acelea pe care le-am adăugat" (atașamentele vizibile în coadă, nu doar Dosar PDF).
Plus audit: „să se vadă: uite, două persoane au aprobat la ce dată".

**Server (`GET /api/par/finance`, `server/routes/parPayments.ts`):**
- adaugă `budgetCodeLabel` (cod — nume, rezolvat batch din `parBudgetCodes`);
- înlocuiește/completează `approverNames` cu `approverDecisions: [{name, decidedAt}]`
  (din `parApprovals.decidedAt`, doar `decision='approved'`, step ≥ 1);
- adaugă `attachmentsMeta: [{id, fileName, kind}]` (batch din `parAttachments`, FĂRĂ
  `fileUrl` — sunt data-URL-uri uriașe; conținutul se ia la cerere prin
  `GET /api/par/:id/attachments` existent).

**UI (`src/pages/par/ParFinanceQueue.tsx`):**
- coloane noi: IDNO (`payeeIdnp`), IBAN (`payeeIban`), Destinația plății (`endUse`),
  Budget line (`budgetCodeLabel`); Suma rămâne (cu valuta); tabelul intră în `overflow-x-auto`;
- textul celulelor selectabil + buton „copiază" (clipboard) pe IDNO / IBAN / sumă / destinație;
- `requestNo` devine link către `#/business/par/:id` (deschide PAR-ul din coadă);
- „Aprobat de" afișează numele + DATA deciziei per aprobator;
- buton „Documente (N)" per rând → listă cu atașamentele (fetch on-demand
  `listAttachments(parId)`, link de deschidere per fișier).

**AC:** (1) coloanele IDNO/IBAN/sumă/destinație/proiect/budget line vizibile și copiabile
(buton clipboard funcțional); (2) click pe nr. PAR deschide detaliul; (3) fiecare aprobator
apare cu data aprobării; (4) documentele atașate se pot deschide din coadă; (5) fără regresie
pe Secț. 16 / Înregistrare plată / Dosar PDF; (6) test API: răspunsul include
`budgetCodeLabel`, `approverDecisions`, `attachmentsMeta`.

## VM3-02 — Fișa aprobărilor în dosarul PDF (audit)

**Citat:** „Eu când o să descarc par-urile aprobate, eu trebuie să arăt: uite, par-ul ăsta cu
adevărat a fost aprobat la data asta, cine l-a aprobat… Să fie vizibil, nu ca să ne uităm în
setări." Azi dosarul (`GET /api/par/:id/dosar`) = separatoare + atașamente, ZERO informație
de aprobare generată la momentul descărcării.

**Ce construim:** prima pagină a dosarului devine „Fișa aprobărilor" generată live:
nr. PAR, dată cerere, beneficiar (nume/IDNO/IBAN), suma + valuta, proiect/budget line,
status curent + data, apoi lanțul de aprobare complet: pas, rol, nume, decizie, DATA deciziei,
comentariu. Se generează și când nu există atașamente. Diacritice: fontul standard
Helvetica (WinAnsi) nu poate ă/ț/ș → sanitizare la ASCII românesc (ex. „ă→a") ca în restul
codului PDF existent, sau embed font — folosește aceeași soluție ca formularul PAR existent.

**AC:** (1) dosarul unui PAR aprobat conține pagina cu fiecare aprobator + data deciziei;
(2) pagina apare și la dosare fără atașamente; (3) statusul + `approvedAt`/`paidAt` afișate;
(4) test API: PDF-ul rezultat conține numele aprobatorului și data (verificat pe bytes/parsare).

## VM3-03 — Formular creare: data necesară +10 zile, UM „bucăți", hint evenimente

**Citate:** „Selectezi data de azi… aici ar trebui automat să pună data necesară peste 10
zile" · „la unități de măsură o să adăugăm bucăți… servicii" · „[evenimentul] a dispărut…
n-are evenimente. Păi tu trebuie din spate să le puneți" (câmpul dispărea complet fără hint).

**Ce construim (`src/pages/par/ParCreateForm.tsx`):**
1. `dateNeeded` pre-completat automat = data cererii + 10 zile (editabil; se recalculează la
   schimbarea datei cererii DOAR dacă userul nu l-a modificat manual). Hint: „Estimativ — data
   cererii + 10 zile".
2. Input UM primește `<datalist>` cu sugestii: bucăți, servicii, ore, zile, sesiuni, persoane,
   luni, km, set (rămâne text liber).
3. Când e selectat un proiect fără evenimente, câmpul Eveniment NU dispare mut — apare hint:
   „Niciun eveniment pentru acest proiect" + link „Adaugă în Admin → Evenimente" pentru
   par_admin (pattern-ul link-ului există deja la Cod bugetar).

**AC:** (1) formular nou → data necesară = azi+10, schimbarea datei cererii recalculează,
editarea manuală oprește recalcularea; (2) datalist vizibil la focus pe UM, „bucăți" selectabil;
(3) proiect fără evenimente → hint vizibil (admin vede link, non-admin doar text); (4) teste
unit pe logica +10 zile și pe render-ul hint-ului.

---

## Notat, dar fără acțiune de cod acum
- **Nr. validatori configurabil (2/3):** matricea DOA (`parDoaMatrix.step`, UI în ParAdmin cu
  input `step`) suportă DEJA N pași per bandă de sumă — e configurare de date, nu cod nou.
- **Bug extracție AI „Victoriabank":** semnalat în conversație pe un document anume; fără
  documentul care reproduce, nu se poate fixa — se adaugă la VM2-backlogul de îmbunătățire
  extracție când owner-ul furnizează fișierul.
- **Import Excel buget în formatul Violetei:** funcția există (VM1-02, `parConfigImport.ts`);
  Violeta trimite Excel-ul ei — de re-verificat mapping-ul pe fișierul real când sosește.
