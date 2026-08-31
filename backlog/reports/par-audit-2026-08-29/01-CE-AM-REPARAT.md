# Ce s-a reparat din audit — 30 august 2026

Branch `fix/par-hardening`, trei commit-uri. Toate găsirile au fost **re-verificate față de
`origin/main`** înainte de reparare: auditul rulase pe un branch mai vechi cu 58 de commit-uri în
urmă, iar o găsire (sugestiile de linii care expuneau IBAN-uri tenant-wide) era deja reparată pe
main — ruta e de mult limitată la istoricul propriu al utilizatorului.

## Verificat pe producție ÎNAINTE de a livra restricțiile
Fiecare restrângere de drepturi a fost confruntată cu datele reale (interogare directă pe Supabase),
ca să nu blocheze pe cineva care lucrează azi:

| Ce am verificat | Rezultat | Ce înseamnă |
|---|---|---|
| `platform_admins` | 1 rând, al proprietarului | Bootstrap-ul pe email e consumat → fallback-ul moare fără să blocheze pe nimeni |
| Conturi cu emailul proprietarului | 1 (cel real, din 03.06.2026) | Lanțul de preluare **nu a fost exploatat** |
| Utilizatori cu 2FA activat | 0 | Poarta 2FA pe login-ul business nu blochează pe nimeni azi |
| Delegări active | 0 | Plafonul moștenit prin delegare nu schimbă nimic acum |
| Matrice DOA | toate cele 3 organizații au o bandă nemărginită | Fallback-ul restrictiv nu se declanșează pentru datele existente |
| Atașamente | 31 fișiere, cel mai mare 3,8 MB, 20 MB total | Confirmă câștigul: o cerere cu un scan de 3,8 MB îl trimitea la fiecare deschidere |

## P0 — închise
1. **Preluarea platformei prin email rezervat.** Emailurile de proprietar nu mai pot fi revendicate
   pe nicio cale de creare de cont (signup clasic + business, accept-invite, cele trei căi Google,
   crearea invitației), iar `requirePlatformAdmin` tratează fallback-ul pe email ca strict de
   bootstrap: moare când există un rând real în `platform_admins` și refuză dacă emailul e
   revendicat de mai multe conturi.
2. **`ENCRYPTION_KEY` lipsă în producție.** Cheia a fost generată și setată în Vercel (Production).
   `encrypt()` refuză acum să scrie cu cheia implicită în deployment-ul de producție, iar
   `decrypt()` încearcă întâi cheia curentă și apoi pe cea veche, ca datele scrise înainte de
   rotație să rămână citibile. Fail-closed se aplică doar producției — pe preview `VERCEL_ENV`
   diferă, altfel ar fi trebuit dublat secretul în fiecare mediu.

## P1/P2 — securitate
2FA ocolibil prin `/api/business/auth/login` (poarta trăiește acum într-un singur loc, iar pagina
de login are pasul de cod) · traversare de cale la `captures/finalize` · rate limit lipsă pe
`/2fa/verify`, `/accept-invite` și căile Google + regula moartă pentru o rută inexistentă ·
cheia de rate-limit se lua din partea de `X-Forwarded-For` trimisă de client · auto-re-aprobarea
depășirii · delegarea care evapora plafonul DOA · gaura între benzile DOA (o singură semnătură
pentru orice sumă) · plata nu re-verifica sigiliul · aria lipsă din `canViewPar` (dosar, timeline,
comentarii, oferte, e-Factura) · comanda de achiziție și recepția fără arie · auto-extinderea ariei
unui par_admin restrâns · scurgerea de rechizite prin șabloane · ștergerea istoricului de aprobări ·
delegări fără rol și fără audit · impersonarea putea aproba și plăti sub semnătura clientului ·
injecție de formule în CSV · `/api/health/db` publica numărul de clienți · plafonul de alerte pe
email trăia în memoria unei instanțe · randarea PDF accepta `file://` și IP-uri private.

## Performanță
Atașamentele nu mai circulă ca base64 în JSON (metadate + adresa rutei de preview, care există de
mult și e singura cale prin care interfața le deschide) · N+1 la fiecare deschidere de inbox ·
filtrare pătratică în inbox · aria calculată de două ori în opt rute · cinci căutări secvențiale și
o re-citire inutilă în detaliul cererii · aprobarea în masă rula 25 de cereri secvențial (peste
plafonul funcției) · notificările se trimiteau una câte una, cu apelul HTTP await-uit · cursul BNM
primește memorare · zece indexuri noi (schema TS + migrarea 0153 + heal în `sync-schema`, fiindcă
producția nu aplică fiabil migrările) · html2canvas/jsPDF și recharts nu se mai încarcă eager ·
căutarea din listă e debounced, cu anulare și gardă de staleness.

## Ce am lăsat NEREPARAT, intenționat

1. **`parConfigImport` — 2 interogări per rând × 6 categorii.** Un fișier de 800 de rânduri
   înseamnă ~40 s pe producție. Nu l-am refactorizat: e o cale de import rulată rar, la
   configurare, iar rescrierea buclelor atinge logica de deduplicare (IBAN → denumire, „completează
   doar ce lipsește"). Un refactor grăbit acolo schimbă tăcut ce date ajung în registru — risc
   prost pentru un câștig care nu se vede în uzul zilnic.
2. **Atașamentele peste ~3 MB.** Plafonul din interfață a coborât la 3 MB, cu motivul scris în
   mesaj. Soluția reală nu e `multipart` (mută limita de la 3,3 la 4,4 MB), ci mutarea fișierelor în
   object storage, cum face deja FinDesk. Pașii sunt scriși în `FRONTEND-NEEDS-SERVER.md`.
3. **Segregarea „cine cere / cine plătește" nu e blocantă.** Plata înregistrată chiar de solicitant
   scrie un rând explicit `sod_self_payment` în audit, dar nu e refuzată: într-un ONG mic aceeași
   persoană chiar ține și cererea, și banca, iar plata a fost deja aprobată de altcineva
   (auto-aprobarea e interzisă dur). Blocarea e o linie de cod, dacă owner-ul o vrea.
4. **`manager` rămâne par_admin implicit** (`requirePARRole.ts`). Scoaterea lui cere confirmarea pe
   producție că migrarea de date 0137 a rulat — exact ce nu se poate garanta aici, unde migrările
   drizzle nu se aplică fiabil. Riscul invers (revocarea tăcută a dreptului de aprobare) e mai mare
   decât cel curent, care e cel puțin vizibil în ecranul de membri.

## Testele care blochează regresia
`server/__tests__/security-audit-2026-08-29.unit.test.ts` (16) și `.routes.test.ts` (8, pe rutele
reale + PGlite). Cele 7 teste blocante **pică pe codul de dinainte** și trec după — verificat prin
rularea suitei împotriva fișierelor de la `HEAD~3`. La rulare pe codul vechi, testul de accept-invite
chiar creează contul cu emailul proprietarului: exploatarea e reprodusă, nu presupusă.

## Starea gărzilor
`check-undefined-refs`, `check-route-mounts`, `check-migration-breakpoints`, `schema-drift` — verzi.
Suita server: 69 fișiere / 588 teste, toate verzi. Frontend: 113 fișiere picate, identic cu
`origin/main` curat (verificat într-un worktree de referință) — zero regresii introduse aici.
`npm run e2e` 25/25, `e2e:browser` 41/41, `e2e:all` 48/49; singurul roșu, `e2e-crud.mjs`, pică la
login cu `wrong_app` fiindcă seed-ul local pune utilizatorul demo într-o organizație `learn`, iar
scriptul intră pe ruta business — nepotrivire între seed și script, preexistentă.
