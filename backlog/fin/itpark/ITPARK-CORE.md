# ITPARK — Moldova IT Park Audit Toolkit · CORE (sursă de adevăr pentru comportament)

> **Ce e:** un modul dedicat care ajută **contabilii și auditorii** să completeze MULT mai rapid
> dosarul de **verificare anuală (proceduri convenite, ISRS 4400)** cerut rezidenților „Moldova IT
> Park" — în special **Anexa 2, Anexa 3, Anexa 4** la Decizia anuală a Administrației MITP, plus
> scrisorile de confirmare și declarațiile pe proprie răspundere. Calculează singur **eligibilitatea
> (pragul 70%)**, repartizează veniturile pe **coduri CAEM**, importă liniile din facturi, și exportă
> **PDF semnabil** pentru tot pachetul.
>
> Trăiește în repo-ul Vector Learn, sub `/app/fin/itpark/*`, lângă PAR și e-Factura (EINV/EFMD).
> Refolosește stack-ul: multi-tenant (`tenants`), auth/roluri, PDF (`parPdf`/html2canvas cu
> diacritice corecte), facturi existente (`invoices.ts`), audit (`auditLog`).

---

## 0. De ce există (problema reală, din documentele furnizate)

Fiecare rezident MITP cu regim 7% trebuie, **până la sfârșitul lunii aprilie**, să predea
Administrației un **raport de proceduri convenite** semnat de un auditor licențiat + **Anexele 2–4**
semnate de administrator. Astăzi contabilul le completează **manual în Word/Excel** pentru fiecare
client:
- transcrie zeci–sute de **facturi** (număr, dată, client, obiect, **cod CAEM**, sumă) în Anexa 3;
- recalculează manual **totalurile pe cod CAEM** și **ponderea în total venituri** (Anexa 3 footer);
- reface lună-de-lună **veniturile eligibile vs totale + cumulativ + pondere lunară** (Anexa 4);
- copiază aceleași date de identificare în **Anexa 2** și în 4–6 **scrisori de confirmare/declarații**
  (insolvabilitate, adresă juridică, lipsa subdiviziunilor, descrierea activității, lipsa veniturilor
  ajustate);
- verifică „de mână" dacă **pragul de 70% venituri eligibile** e respectat în fiecare lună.

Erorile sunt frecvente (formulele Excel dau `#DIV/0!`, totalurile nu se leagă între anexe, codul CAEM
greșit), iar munca se repetă identic pentru fiecare rezident, în fiecare an. **Modulul automatizează
exact acest dosar**: introduci datele firmei o dată + importezi/lipești facturile → toate anexele +
scrisorile se generează, se recalculează singure și se exportă semnabil.

> Anti-scope: NU înlocuiește auditorul și NU semnează raportul de audit. Produce **dosarul de date**
> (anexele + confirmările) pe care auditorul și administratorul îl verifică și îl semnează. La fel ca
> contafirm/Sirius, ne oprim înainte de opinia de audit — dar livrăm pachetul gata de semnat.

---

## 1. Concepte de domeniu (vocabular fix — folosit în UI, cod, teste)

- **Engagement (Dosar de verificare):** un dosar de audit MITP pentru **un rezident, un an** (perioada
  `01.01.YYYY–31.12.YYYY`, sau perioada de deținere a statutului dacă < an). Rădăcina întregului modul.
- **Rezident:** firma verificată (denumire, IDNO/cod fiscal, nr.+data contractului MITP, adresă,
  adrese subdiviziuni, regim TVA). Echivalent cu Anexa 2 rândurile 1–5.
- **Linie de venit (Revenue Line):** o linie din Anexa 3 = unul/mai multe documente (facturi) către
  un client + obiectul serviciului + **cod CAEM (eligibil sau nu)** + sumă. Poate grupa mai multe
  facturi sub un client (ex. „Persoane Fizice" agregat).
- **Cod CAEM eligibil:** cod din lista oficială MITP (vezi §4). Linia cu cod eligibil → intră în
  „venituri eligibile"; altfel → doar în „total venituri".
- **Prag de eligibilitate (70%):** ponderea veniturilor eligibile în total trebuie ≥ **70%**
  (cumulativ; toleranță de max 2 luni consecutive sub prag — vezi §5). Sub prag = **risc** evidențiat.
- **Document de pachet (Packet Document):** o piesă generată — Anexa 2 / Anexa 3 / Anexa 4 / scrisoare
  de confirmare / declarație. Fiecare are status (draft/gata/exportat) și se exportă PDF.
- **Șablon (Template):** structura predefinită a fiecărei piese (din Decizia MITP), cu câmpuri
  auto-completate din Engagement + Rezident + Linii de venit.

---

## 2. Model de date (`server/db/schema/itpark.ts`) — un singur fișier

Bani în `*_cents` (bigint, MDL implicit) **și** o reprezentare zecimală pentru afișaj (anexele cer 2
zecimale). Toate tabelele: `id uuid pk`, `tenantId → tenants` (cascade), `createdAt`, `updatedAt`.

- **`itpark_engagements`** — dosarul: `tenantId`, `residentName`, `idno`, `mitpContractNo`,
  `mitpContractDate`, `legalAddress`, `vatPayer boolean`, `periodStart date`, `periodEnd date`,
  `reportingYear int`, `auditFirmName?`, `status` (`draft|in_progress|ready|exported`),
  `subcontractorCostsCents bigint default 0`, `subcontractorCostsPct numeric(5,2)?` (Anexa 2 rând 6),
  `totalSalesCents` (derivat/override), `adjustedRevenueCents default 0` (Anexa 2 rând 9),
  `employeeInfoProcedure text?` (Anexa 2 rând 10).
- **`itpark_revenue_lines`** — liniile Anexei 3: `engagementId`, `rowNo int`, `clientName`,
  `documentRefs text` (ex. „Factura EBC000276766 din 27.10.25, factura …"), `serviceDescription`,
  `caemCode varchar` (ex. `85.59`, `62.02`), `amountCents bigint`, `isEligible boolean` (derivat din
  cod, override permis), `month int?` (1–12, pentru Anexa 4; null dacă linia acoperă mai multe luni).
- **`itpark_caem_codes`** — nomenclator versionat: `code`, `label`, `eligible boolean`,
  `effectiveFrom date`, `country default "MD"`. Seed cu lista oficială MITP (§4). NICIODATĂ hardcodat
  în `.tsx` (regula design-system + REGISTRY).
- **`itpark_monthly`** — Anexa 4 (derivat, dar persistat pt. override/lock): `engagementId`,
  `month int`, `eligibleCents`, `totalCents`, `cumulativeEligibleCents`, `cumulativeTotalCents`,
  `monthlySharePct numeric(5,2)`. Recalculat din `revenue_lines` când `month` e setat; altfel
  introdus manual per lună.
- **`itpark_packet_documents`** — piesele generate: `engagementId`, `kind`
  (`anexa2|anexa3|anexa4|letter_solvency|letter_address|letter_no_subdivisions|letter_activity|
  letter_no_adjustments|decl_self_responsibility`), `status` (`draft|ready|exported`),
  `dataJson jsonb` (snapshot al câmpurilor la generare), `generatedAt?`.
- **`itpark_settings`** — per tenant: `eligibilityThresholdPct numeric default 70.00`,
  `toleranceMonths int default 2`, `defaultCurrency default "MDL"`, `defaultAuditFirm?`,
  `auditorUserId uuid references users(id)` (nullable — userul desemnat cu acces de auditor;
  orice admin/manager are acces contabil; nu se creează un tabel junction separat).
- **`itpark_audit`** — jurnal de acțiuni (creare/edit/export/import) — refolosește pattern `auditLog`.

> **Index rule (§3.5.1):** `server/db/schema/index.ts` primește `export * from "./itpark";` în ACELAȘI
> commit. **Migrare:** prefix **> max pe `origin/main`** (azi `0114`); FIN-BACKLOG rezervă `0116+`, deci
> ITPARK pornește la **`0116`** (înaintea FIN, fiind prioritar) — se renumerotează dacă main avansează.

---

## 3. Comportament (regulile de calcul — DETERMINISTE, nu AI)

Toate cifrele din anexe se calculează în cod determinist. (AI e doar **accelerator** la import/clasificare — §6 — niciodată sursă de cifre.)

1. **Eligibilitatea unei linii** = `caem_codes.eligible` pentru codul liniei (override manual permis,
   auditat). Codurile eligibile din §4.
2. **Anexa 3 — total per cod CAEM:** pentru fiecare cod prezent, `Σ amountCents` al liniilor cu acel
   cod; **pondere** = `total_cod / total_vânzări * 100` (2 zecimale). „Total venituri eligibile" =
   `Σ liniilor eligibile`; „Total venituri din vânzări" = `total eligibile + non-eligibile` (sau
   `engagement.totalSalesCents` dacă e setat ca override, când există venituri în afara Anexei 3).
3. **Anexa 4 — lunar:** pentru fiecare lună 1–12: `eligibleCents` = Σ linii eligibile cu acea lună;
   `totalCents` = Σ toate liniile cu acea lună (sau total lunar override). **Cumulativ** = suma
   lunilor ≤ luna curentă. **Pondere lunară cumulativă** = `cumulativeEligible / cumulativeTotal*100`.
   Footer „Total" trebuie să fie EGAL cu Anexa 3 (gate de consistență — §3.5.1 cross-anexă).
4. **Pragul 70%:** ponderea cumulativă a anului ≥ `eligibilityThresholdPct`. Dacă o lună cumulativă
   scade sub prag → **avertisment**; sub prag > `toleranceMonths` luni consecutive → **risc de pierdere
   a statutului** (mesaj clar, nu blocant — auditorul decide).
5. **Consistență între anexe (regula de aur):** „Total venituri din vânzări" și „Total venituri
   eligibile" trebuie să fie IDENTICE în Anexa 2 (rând 7 & 8), Anexa 3 (footer) și Anexa 4 (Total).
   Dacă diferă → eroare evidențiată; nu se poate marca dosarul „ready".
6. **Anexa 2 rând 6 (cost subcontractori străini):** `subcontractorCostsPct` =
   `subcontractorCostsCents / costul_vânzărilor * 100`; introdus de contabil (nu derivă din facturi).
7. **Format MDL:** 2 zecimale, separator de mii; perioada afișată `dd.mm.yyyy`.

---

## 4. Lista oficială de coduri CAEM eligibile (seed `itpark_caem_codes`)

Din Decizia MITP / art. 8 Legea 77/2016 și șablonul Anexa 3 (col. 4). `eligible=true` pentru toate:

`62.01` Realizarea de software la comandă · `58.21` Editare jocuri de calculator · `58.29` Editare
alte produse software · `62.02` Consultanță în tehnologia informației · `62.03` Managementul
mijloacelor de calcul · `62.09` Alte activități de servicii IT · `63.11` Prelucrarea datelor,
administrare pagini web (hosting) · `63.12` Activități ale portalurilor web · `85.59` Alte forme de
învățământ (instruire în domeniul digital) · `72.19.11`–`72.19.50` cercetare-dezvoltare IT ·
`72.11`, `26.11`, `59.12.13`–`59.20.13`, `74.10`, `78.30.11`, `78.30.12`, `82.20` (din art. 8) +
rândul descriptiv „servicii de asigurare a resurselor umane … transport de marfă". Codurile sunt
versionate (`effectiveFrom`) ca să urmărească modificările legislative. Orice cod neprezent în listă →
`eligible=false` (venit neeligibil, taxat standard).

> Sursă: Decizii MITP verificare anuală (mitp.md), șablonul Anexa 2-3-4 la Decizia nr. 4/11.03.2025.

---

## 5. Fluxul end-to-end (cum scurtează munca — testat logic)

```
Pas 0  Creezi Dosarul (Engagement): rezident + an + perioadă + regim TVA + firma de audit
Pas 1  Importezi facturile → liniile Anexei 3 (CSV / lipire / din invoices.ts existente)
        ↳ fiecare linie primește cod CAEM (auto-sugestie din serviciu) + lună
Pas 2  Modulul calculează SINGUR: total/cod, pondere, eligibil vs total, Anexa 4 lunară, pragul 70%
Pas 3  Completezi Anexa 2 (cost subcontractori, procedura de informare angajați) — restul e pre-umplut
Pas 4  Generezi scrisorile de confirmare + declarația (pre-completate din datele rezidentului)
Pas 5  Verificare de consistență (totaluri identice între anexe; prag ok) → marchezi „Ready"
Pas 6  Export PDF: tot pachetul (Anexa 2,3,4 + 5 scrisori) semnabil, cu diacritice corecte
```

**De ce e logic (verificat, fără găuri):** fiecare anexă își ia datele dintr-un pas anterior
(rezident → linii → calcule → documente). Importul are mereu și cale manuală (lipire/CSV) dacă nu
există facturi în repo. Pragul 70% e informativ, nu blocant. Consistența între anexe e un gate înainte
de „Ready". Exportul e ultimul consumator (nu produce date → fără circularitate).

---

## 6. AI (opțional, accelerator — nu sursă de cifre)

- **Sugestie cod CAEM:** din `serviceDescription` („Servicii instruire domeniu digital" → `85.59`).
  Propunere cu scor de încredere; contabilul confirmă. Refolosește `ai.ts`/`aiAuditLog.ts`.
- **Import din PDF factură:** OCR → linie de venit propusă (client, sumă, dată). Mereu confirmat de om.
- AI **nu** calculează totaluri/pondere/prag — acelea sunt deterministe (§3). Anonimizare PII spre
  prompt (TRUST). Toate sugestiile auditate.

---

## 7. Roluri & securitate

- Roluri (peste cele existente): **Contabil** (creează/editează dosarul), **Auditor** (vede tot,
  marchează verificat), **Viewer**. Izolare pe `tenant_id` pe fiecare rând (regula multi-tenant).
- Fiecare export + import + override de cod = intrare în `itpark_audit`.
- Datele firmelor sunt sensibile (financiar + fiscal) → fără leak între tenanți; GDPR/retenție via TRUST.

---

## 8. Refolosire din repo (reuse over rebuild — §3.7)

| Nevoie ITPARK | Există în repo | Cum |
|---------------|----------------|-----|
| Multi-tenant | `tenants.ts` | fiecare rând poartă `tenant_id` |
| Auth/roluri | `requireAuth`, `users` | roluri ITPARK peste cele existente |
| Facturi (import linii) | `invoices.ts` | sursă opțională pentru liniile Anexei 3 |
| PDF cu diacritice | `parPdf.ts`, `paymentAccountPdf.ts` (html2canvas) | export anexe + scrisori |
| Coduri versionate | pattern REGISTRY/`accounting.ts` | `itpark_caem_codes` cu `effectiveFrom` |
| AI + audit | `ai.ts`, `aiAuditLog.ts`, `aiFeatureFlags.ts` | sugestie CAEM + OCR |
| Audit | `auditLog.ts` | acțiuni pe dosar |
| Notificări | `inAppNotifications` | „dosar gata de semnat", „sub prag 70%" |

---

## 9. Module conexe (sistemul întreg)

- **EINV/EFMD (e-Factura SFS):** facturile emise prin e-Factura sunt sursa naturală pentru liniile
  Anexei 3 → import direct (un rezident MITP emite tot prin SFS). ITPARK **consumă** facturi, nu le
  produce.
- **BILL/PARTY (FIN):** dacă FIN e construit, clienții și facturile vin de acolo; altfel ITPARK
  funcționează standalone cu import CSV/lipire.
- **INSIGHT (FIN):** poate afișa un card „status conformitate MITP (pondere eligibilă YTD)".

ITPARK e **autonom** (nu depinde de restul FIN ca să livreze valoare), dar **se integrează** când
modulele surori există — exact ce a cerut owner-ul: gândit ca sistem întreg.
