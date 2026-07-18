# PAR — Backlog de modernizare FinFlow

> Actualizat 18 iulie 2026, după audit de cod. Acesta completează `PAR-CORE.md`: păstrează
> fluxul PAR existent și descrie cerințele operaționale noi. Statutul **implementat** înseamnă
> prezent în worktree și verificat static/local; nu înseamnă încă validat pe mediul live.

## Principii de produs

1. Un workspace poate avea mai multe entități juridice. În PAR, **Plătitorul** este entitatea
   juridică, iar proiectele, codurile bugetare și accesul utilizatorilor se află sub ea.
2. Un solicitant vede numai PAR-urile proprii; accesul la proiecte și plătitori se acordă explicit.
   Adminul de workspace/superadminul rămân excepțiile intenționate.
3. Formularele aleg implicit contextul cunoscut al persoanei, dar orice valoare permisă poate fi
   modificată înainte de trimitere.
4. Orice raport, inbox sau audit respectă aceeași izolare: plătitor → proiect → utilizator.

## Backlog prioritar

| ID | Feature / rezultat pentru utilizator | Prioritate | Statut audit | Criteriu de închidere |
|---|---|---:|---|---|
| PAR-MOD-01 | Profil solicitant: departament, funcție și cod personal precompletate, editabile pe PAR | P0 | Implementat | Adminul poate edita profilul; o cerere nouă îl preia; schimbarea în PAR nu modifică profilul. |
| PAR-MOD-02 | „Data estimativă de plată”, implicit la +10 zile și editabilă | P0 | Implementat | Eticheta este univocă în formular/PDF/detaliu și data nu poate preceda cererea. |
| PAR-MOD-03 | Ierarhie multi-entitate: Plătitor → Proiect → cod bugetar | P0 | Implementat | Proiectul și codul nu pot fi legați de alt plătitor, inclusiv prin apel API manual. |
| PAR-MOD-04 | Scope persoane/proiecte/plătitori; autoselectare când există o singură opțiune | P0 | Implementat | Un utilizator obișnuit poate lista/crea/vedea numai în scope; test de regresie pentru 0/1/multe opțiuni. |
| PAR-MOD-05 | Coduri bugetare filtrate după plătitor/proiect, căutare, adăugare directă și selecție automată când e unic | P0 | Implementat | Codul specific proiectului nu poate fi ales pe alt proiect; codul global al plătitorului rămâne eligibil. |
| PAR-MOD-06 | Evenimente: căutare, creare directă și vizibilitate pentru ceilalți din proiect | P1 | Implementat | Evenimentul este obligat în același proiect; lista nu expune proiecte neasignate. |
| PAR-MOD-07 | Registru de beneficiari: căutare, salvare/reutilizare, detalii bancare/juridice și administrator | P0 | Implementat | Beneficiarul AI sau introdus manual se salvează deduplicat și rămâne editabil; datele sunt vizibile numai rolurilor autorizate. |
| PAR-MOD-08 | Analiză AI a documentelor: prefill beneficiar și control de concordanță sume/rechizite după upload | P1 | Implementat | Fiecare atașament arată rezultatul `match`/`warning` și câmpurile neconcordante, fără a modifica automat un PAR trimis. |
| PAR-MOD-09 | Ciorne explicite: salvare sigură, mesaj cu locația și filtru „Ciornele mele” | P0 | Implementat | Deschiderea formularului nu creează ciornă; Salvare creează/actualizează și duce utilizatorul la lista filtrată. |
| PAR-MOD-10 | Inbox aprobare compact: filtre multiple și documente cu nume, deschidere în browser fără download | P1 | Implementat | Pentru fiecare document se poate vedea numele și deschide preview-ul/browserul; filtrele includ mai mult decât proiectul. |
| PAR-MOD-11 | Foldere PAR: status colorat și contoare (plătite/de aprobat); întoarcere păstrează folderul | P1 | Implementat | Click din folder setează returul la folder, nu la lista globală. |
| PAR-MOD-12 | Raportare: perioade prestabilite/personalizate și execuție alocat–angajat–plătit pe cod/proiect | P1 | Implementat | Exportul respectă perioada selectată și totalul plătit folosește suma reală, dacă există. |
| PAR-MOD-13 | Rol solicitant ca CRM (doar cererile proprii + statut/comentarii); aprobare multi-persoană secvențială sau paralelă | P0 | Implementat | Nu se permite auto-aprobarea; nivelul paralel avansează numai după toate deciziile necesare. |
| PAR-MOD-14 | Invitații și configurare: selectare plătitori la rol; import Excel pentru admin | P1 | Implementat, necesită smoke UI | Importul raportează rândurile respinse; invitația salvează scope-ul selectat și îl aplică la acceptare. |
| PAR-MOD-15 | Audit filtrabil după plătitor, proiect, perioadă, persoană, statut/eveniment; export PDF/XLSX | P1 | Implementat | Ambele exporturi conțin exact același set filtrat ca ecranul de audit. |
| PAR-MOD-16 | Superadmin platformă: entitlement PAR / FinDesk independent per organizație | P0 | Implementat | Dezactivarea modulului blochează API și navigarea pentru organizația respectivă, fără efect asupra altora. |
| PAR-MOD-17 | Compactare vizuală a formularului și test de acceptanță end-to-end pe roluri | P1 | Implementat | Formular compactat (grile 3-col pe lg, textarea end-use redusă, `touch-target` în loc de `[44px]`), toate câmpurile păstrate (vm3 verde); e2e pe cele 4 roluri verde (`scripts/e2e-par-100.mjs` 111/111). |

## Ordinea de livrare

1. **Gate de lansare (P0):** aplică migrarea `0136_par_payers_profiles_scope.sql`, rulează seed/smoke şi verifică izolarea pentru două plătitoare şi doi utilizatori.
2. **Flux solicitant:** MOD-01, 02, 04, 05, 07 şi 09 într-un scenariu complet „ciornă → trimite”.
3. **Control financiar:** MOD-03, 08, 12, 13 şi 15, cu un cod bugetar/proiect și două aprobări.
4. **Adopție operațională:** MOD-06, 10, 11, 14 şi compactarea MOD-17.
5. **Platformă:** MOD-16 verificat separat cu organizații care au entitlements diferite.

## Gate-uri rămase înainte de producție

- [x] `npm run check-refs` (gate-ul de deploy; `tsc --noEmit` complet rămâne roșu doar din ~350 erori
  de calitate pre-existente în module non-PAR — niciuna în fișierele-sursă PAR)
- [x] Migrare + `db:sync-local` + seed pe PGlite temporar (`db:reset && db:seed` exit 0)
- [x] Testele PAR țintite (40 fișiere / 391 teste verzi), inclusiv ciornă, inbox, finance, foldere, aprobări
- [x] Upload + preview în browser (inline `application/pdf`) + analiză AI — `scripts/e2e-par-scope.mjs` (14–17)
- [x] Smoke API cu două plătitoare, proiecte și utilizatori cu scope diferit — `scripts/e2e-par-scope.mjs` 19/19
- [x] Import Excel cu fișier real (rânduri respinse raportate + respingere cross-payer) — `e2e-par-scope.mjs` (12–13)
- [x] E2E pe cele 4 roluri (solicitant/aprobator/finanțe/admin) — `scripts/e2e-par-100.mjs` 111/111
- [ ] Migrarea `0136` aplicată și verificată pe baza de date de producție (**cod pregătit**: `server/db/sync-schema.ts`
  creează tabelele MOD-16 idempotent la deploy, ca prod să NU dea 500 înainte să ruleze migrarea)

## Remedieri de izolare (audit 18 iul 2026 — verificate cu `e2e-par-scope.mjs`)

Auditul de scope a găsit și s-au reparat următoarele scurgeri (fiecare cu regresie în smoke):

1. **BLOCANT — prod-500** (`server/db/sync-schema.ts`): tabelele MOD-16 (`par_payers`, `par_payer_modules`,
   `par_payer_members`, `par_member_profiles`, `par_project_members`, `platform_admins`) create doar de
   migrarea `0136` — adăugate în `ENSURE_STATEMENTS` (heal idempotent), altfel `requireModuleEntitlement`
   dă 500 pe FIECARE rută `/api/par/*` până se aplică migrarea pe prod.
2. **Scurgere cross-payer în listă** (`server/routes/par.ts`): `GET /api/par` exonera `par_admin` de scope →
   un `par_admin` invitat pe un singur plătitor vedea PAR-urile (IBAN/IDNP) tuturor plătitorilor. Eliminat.
3. **GDPR — registru beneficiari** (`server/routes/parVendors.ts`): `GET /vendors` fără rol PAR → orice user
   citea IDNP+IBAN. Adăugat `requirePARRole`.
4. **Sold cod bugetar** (`server/routes/parBudgetCodes.ts`): `GET /:id/balance` nu verifica plătitorul pentru
   codurile payer-wide. Adăugat `mayAccessPayer`.
5. **Evenimente** (`server/routes/parEvents.ts`): `PUT`/`DELETE /events/:id` fără verificare de scope. Adăugat.
6. **Import config** (`server/routes/parConfigImport.ts`): un `par_admin` non-workspace-admin putea crea
   plătitori și modifica config-ul altor plătitori. Adăugat gate workspace-admin + `mayAccessPayer`.

