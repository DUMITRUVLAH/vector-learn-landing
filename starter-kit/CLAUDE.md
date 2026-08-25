# CLAUDE.md — contractul de development

> Acest fișier este **contractul**, nu o colecție de sugestii. Tot ce scrie aici a fost plătit
> cu un bug scăpat în producție, o noapte de debugging sau o muncă pierdută. Respectă-l literal.
>
> **Cum îl folosești:** copiază-l în rădăcina proiectului nou ca `CLAUDE.md`. Completează §1
> (Contextul proiectului) și șterge secțiunile care nu se aplică stack-ului tău. Restul rămâne.

---

## 1. Contextul proiectului — COMPLETEAZĂ

| Câmp | Valoare |
|------|---------|
| Ce e produsul | `<o frază: pentru cine + ce problemă rezolvă>` |
| Stack | `<ex: React 18 + TS strict + Vite + Tailwind / Node + Hono + Postgres>` |
| Repo | `<owner/repo>` |
| Branch principal | `main` |
| Deploy | `<ex: Vercel, auto pe main>` |
| Prod URL | `<https://...>` |
| Owner | `<nume + email>` |
| Comenzi | `npm run dev` · `npm run build` · `npm run typecheck` · `npm run lint` · `npm test` · `npm run e2e` |

Dacă un rând de mai sus e necompletat, **prima ta sarcină e să-l completezi**, nu să ghicești.

---

## 2. Regula zero — ce înseamnă „gata"

**Un feature nu e gata când compilează. E gata când a fost EXECUTAT și a returnat ce trebuie.**

Cea mai scumpă lecție a proiectelor anterioare: „butonul se randează" și „pagina se încarcă fără
eroare" sunt **necesare, dar nu suficiente** — nu execută feature-ul. Un endpoint de upload a
ajuns în prod cu un 500 pentru că testul verifica doar că butonul de upload *există*, nu că
apăsarea lui *funcționează*.

Deci, pentru **fiecare** endpoint nou și **fiecare** acțiune de tip
*upload / generate / extract / merge / pay / approve / send / import / delete*:

> Testul trebuie să **invoce acțiunea o dată, cu input realist, și să verifice 200 + forma
> răspunsului** (sau non-200-ul documentat). Randarea unui control nu dovedește nimic despre
> ce se întâmplă la click.

Când raportezi „am testat", spune **ce ai rulat** și **ce output ai văzut**. Fără output = n-ai testat.

---

## 3. Git — branch, commit, push, PR

### 3.1 Branching

- **Nu se lucrează niciodată direct pe `main`.** Prima acțiune înainte de orice cod:
  ```bash
  git fetch origin
  git switch -c feat/<scop>-<slug> origin/main
  ```
- Numele branch-ului: `feat/`, `fix/`, `chore/`, `docs/`, `refactor/` + scop scurt în kebab-case.
  Ex: `feat/billing-invoices`, `fix/login-redirect-loop`.
- **Întotdeauna din `origin/main` proaspăt.** Niciodată dintr-un alt branch de feature — asta
  produce PR-uri care nu se mai pot merge-ui și sisteme concurente (două implementări ale
  aceluiași lucru care nu se pot împăca).
- **O unitate coerentă de valoare = un branch = un PR.** Nu 15 branch-uri pentru un modul; nici
  un branch gigantic cu 3 module. Regula practică: dacă nu poți descrie PR-ul într-o propoziție,
  e prea mare.

### 3.2 Commit-uri

- **Conventional commits**, în engleză sau română, consecvent:
  ```
  feat(billing): generate PDF invoice from an order
  fix(auth): stop redirect loop when the session cookie is stale
  chore(deps): bump vite to 5.4
  docs(solutions): record the migration-prefix collision
  ```
- **Un commit = o schimbare logică completă și verde.** Nu commit-ui cod care nu compilează.
  Nu amesteca refactor cu feature în același commit — reviewer-ul nu mai poate separa riscul.
- **Commit-uri dese și mici.** Munca necomisă e singura care se poate pierde. După fiecare
  bucată terminată:
  ```bash
  git add -A && git commit -m "feat(x): ..."
  ```
  Un commit se recuperează din reflog. Un working tree pierdut, nu întotdeauna.
- **Nu `git commit --no-verify`.** Dacă hook-ul pică, repari cauza, nu ocolești hook-ul.
- Mesajul explică **de ce**, nu **ce** (diff-ul arată deja ce). Corpul commit-ului e locul pentru
  „am ales X pentru că Y a picat la Z".

### 3.3 Comenzi git INTERZISE pe un working tree partajat

Acestea distrug munca altcuiva (sau a altui chat) fără avertisment:

```
git stash          git checkout -- .      git restore .
git clean -fd      git reset --hard       git push --force
```

- Dacă ai nevoie de un tree curat → **fă un worktree nou** (§10), nu curăța-l pe ăsta.
- Dacă chiar trebuie force-push pe branch-ul TĂU de feature, folosește
  `git push --force-with-lease` — refuză dacă altcineva a împins între timp.
- Înainte de orice comandă care schimbă working tree-ul: `git status --short`. Dacă vezi
  modificări pe care nu le-ai făcut tu → **oprește-te și întreabă**.

### 3.4 Push

```bash
# 1. rebase pe main proaspăt (nu merge — istoric liniar)
git fetch origin && git rebase origin/main

# 2. gate-urile locale, în ordinea asta, TOATE verzi
npm run typecheck && npm run lint && npm test && npm run build

# 3. abia acum
git push -u origin HEAD
```

- **Nu împinge cu teste roșii.** „Le repar în PR" înseamnă că CI-ul e roșu pentru toată lumea.
- Verifică remote-ul înainte de primul push dacă repo-ul are mai multe:
  `git remote -v` — `git push -u` alege prostește default-ul.
- După push, verifică CI-ul. Un PR cu CI roșu nu e deschis, e abandonat.

### 3.5 Pull request

Deschide-l cu `gh`:

```bash
gh pr create --base main --title "feat(billing): invoice PDF generation" --body "$(cat <<'EOF'
## Ce face
<1-3 propoziții, din perspectiva utilizatorului>

## De ce
<problema rezolvată / issue-ul legat>

## Cum am verificat
- [ ] `npm run typecheck` verde
- [ ] `npm test` verde (N teste noi)
- [ ] Am invocat `POST /api/invoices` cu input real → 200 + `{ id, pdfUrl }`
- [ ] Verificat manual în browser pe <ruta>, light + dark

## Risc / rollback
<ce se strică dacă e greșit; cum se dă înapoi>

## Pași manuali la deploy
<migrări de rulat, secrete de setat — sau "niciunul">
EOF
)"
```

- **Secțiunea „Cum am verificat" nu e opțională** și nu conține „am testat local". Conține ce
  comandă ai rulat și ce ai văzut.
- **Secțiunea „Pași manuali la deploy" este critică.** Dacă feature-ul are nevoie de o migrare,
  un secret, o setare în dashboard — scrie exact ce, aici. Codul se deployează singur; restul, nu.
- **Nu lăsa PR-urile să se adune.** PR-urile deschise săptămâni se transformă în conflicte
  irezolvabile. Dacă ai >5 PR-uri deschise, oprește build-ul de feature-uri noi și mergi-le.
- **Merge în `main` = deploy în producție = decizia owner-ului**, dacă nu ai autorizare explicită.

### 3.6 Merge

- Squash-merge implicit (istoric curat). Merge-commit doar dacă vrei să păstrezi commit-urile
  per item pentru trasabilitate.
- **Niciodată nu merge-ui N PR-uri divergente la grămadă.** Unul câte unul, cel mai vechi întâi,
  și după fiecare: `npm run build` + teste verzi înainte de următorul. Un merge care n-a fost
  build-uit nu a livrat nimic — e doar cod stricat pe `main`.
- După merge-ul final + deploy: rulează smoke-ul (§5.4). Dacă nu e verde, ai un incident, nu un release.

---

## 4. Gate-uri obligatorii înainte de orice livrare

| Gate | Comandă | De ce |
|------|---------|-------|
| Typecheck | `npm run typecheck` | Bundler-ele (esbuild/vite) **nu** verifică tipuri — un import lipsă compilează și crapă la runtime |
| Lint | `npm run lint` | consecvență + capcane cunoscute |
| Unit tests | `npm test` | comportament |
| Build | `npm run build` | ce ajunge de fapt la utilizator |
| Undefined refs | `node scripts/check-undefined-refs.mjs` | vezi mai jos — cel mai important gate |
| Smoke e2e | `npm run e2e` | aplicația reală, nu mock-uri |

### Gate-ul de referințe nedefinite (pune-l primul în build)

Un import lipsă (`Medal`, `z`, o pagină) trece de `vite build` pentru că esbuild doar șterge
tipurile. În prod devine `ReferenceError` → ecran alb sau 500 pe fiecare request. Scriptul
`scripts/check-undefined-refs.mjs` (inclus în kit) pică build-ul **doar** pe TS2304/TS2552, nu pe
toate erorile de tip — deci se poate activa și într-un repo care are deja datorii de tipuri.

Adaugă-l ca **primul pas** în comanda de build de producție:

```json
"build": "node scripts/check-undefined-refs.mjs && vite build"
```

Nu-l scoate niciodată. Nu-l „repara" gating-uind tot `tsc`.

---

## 5. Bază de date și migrări

> Sări secțiunea dacă proiectul n-are DB. Dacă are, e cea mai periculoasă zonă din tot fișierul.

### 5.1 Codul și schema se livrează ÎMPREUNĂ
Deploy-ul automat livrează **cod**, nu **schemă**. Cod nou care se așteaptă la o coloană
inexistentă = 500 pe fiecare query, pentru clientul care plătește, până rulezi migrarea manual.

- Orice modificare de schemă vine cu **migrarea comisă în același commit**.
- Rulează migrările **înainte de build** în pipeline-ul de deploy (`prebuild` / build command),
  ca schema să existe când codul aterizează.
- `db:reset && db:seed` trebuie să treacă pe un DB gol, mereu. Dacă nu trece, migrarea e greșită.

### 5.2 Coliziuni de prefix la migrări (spărgătorul #1 de prod)
Generatoarele numerotează migrările de la punctul de ramificare, deci **două branch-uri paralele
generează același `0016_`**. La merge, una o suprascrie pe alta și fiecare rută cu DB dă 500.

Înainte de PR: prefixul fiecărei migrări noi trebuie să fie **strict mai mare** decât maximul de
pe `origin/main`. Dacă nu e, renumerotează (fișierul `.sql`, snapshot-ul și jurnalul).
Jurnalul nu are voie să conțină un `idx` duplicat.

### 5.3 Regulile care se uită mereu
- **Schema bidirecțională:** dacă migrarea face `ADD COLUMN`, declară coloana și în fișierul de
  schemă, în același commit. Coloană în DB dar nu în schemă → `table.column` e `undefined` la
  runtime → 500 obscur.
- **Fișier nou de schemă = export nou în `index.ts`**, în același commit. Altfel ORM-ul nu-l
  cunoaște și orice rută care-l atinge dă 500.
- **Portabilitate:** dacă local rulezi alt engine decât în prod (PGlite vs Postgres, SQLite vs
  Postgres), formele de rezultat diferă. Nu folosi `db.execute(...).rows` brut; folosește
  query builder-ul, sau tratează ambele forme.
- **Migrări scrise de mână cu >1 statement** au nevoie de separatorul cerut de tool
  (`--> statement-breakpoint` la drizzle). Un `;` dintr-un bloc `DO $$ … $$;` **nu** e o graniță.
- **Degradare grațioasă:** o interogare pe o tabelă care poate lipsi temporar (fereastra dintre
  deploy-ul de cod și migrare) trebuie să prindă eroarea și să întoarcă rezultat gol, nu să
  crape pagina.

### 5.4 Smoke după deploy
Un script headless care: face login real, parcurge rutele principale și **caută textul de
eroare** din pagină (mesajele roșii), nu doar crash-urile JS. Majoritatea eșecurilor de API se
randează ca text — un check care ascultă doar `pageerror` raportează fals „totul e curat".

---

## 6. Rute, wiring, link-uri moarte

- **Fiecare router/handler exportat trebuie montat** în aplicație, în același commit. Un router
  nemontat cade în fallback-ul de HTML al SPA-ului → frontend-ul primește `<!doctype html>` și
  crapă cu `Unexpected token '<'`. Automatizează verificarea cu un script care compară
  export-urile de routere cu montările.
- **Link-urile din aplicație trebuie să ducă la rute reale.** Un `href` mort ejectează
  utilizatorul. Verifică programatic că fiecare intrare de meniu se rezolvă la o rută definită.
- **Parsează parametrii de rută agnostic de prefix.** `path.match(/\/order\/([^/]+)/)` — nu
  `path.replace('/app/order/','')`. Când ruta se mută din `/app/*` în `/business/*`, un strip cu
  prefix fix returnează gol și tot ce e după se strică. **Iar mock-ul din test trebuie mutat
  odată cu ruta** — un mock rămas pe ruta veche testează un drum mort și rămâne verde în timp ce
  prod-ul e roșu.

---

## 7. Securitate și efecte externe

- **Zero secrete în cod sau în commit.** `.env` în `.gitignore`, `.env.example` comis cu chei goale.
  Dacă un secret a ajuns într-un commit: îl **rotești**, nu doar îl ștergi din istoric.
- **Webhook-urile care mută stare financiară resping ce nu pot verifica criptografic.**
  „Nu e configurat secretul" înseamnă „nu am încredere" → 400. Niciodată „sar peste verificare".
- **Secretele la rest se criptează** (AES-256-GCM), nu se codează base64.
- **Efectele externe (email/SMS/plăți) se blochează după destinatar + mediu, nu după
  „lipsește cheia".** Dev-ul are de obicei cheia REALĂ în `.env` — deci fiecare rulare de teste
  trimite mail live. Pattern-ul corect, într-un singur guard prin care trece orice trimitere:
  1. domeniile de test/demo blocate peste tot;
  2. în afara producției nu se trimite nimic dacă nu e activat explicit (`EMAIL_SEND_MODE=on`);
  3. în producție, allowlist opțional.
  Fixture-urile de test folosesc doar domenii nerutabile. (Traficul de test care face bounce îți
  arde reputația de sender — furnizorii suspendă contul pe la ~5% bounce rate.)
- **Verifică autorizarea la nivel de resursă, nu doar autentificarea.** „E logat" ≠ „are voie la
  rândul ăsta". Fiecare query filtrează după tenant/owner, în repository, nu în UI.
- **Validează input-ul la graniță** (schema de validare pe body/query/params), nu prin `as` în TS.

---

## 8. Frontend

- **Design system, nu valori magice.** Culori prin token-uri semantice (`bg-primary`,
  `text-muted-foreground`), niciodată hex în `.tsx`. Spațiere pe scala framework-ului; valori
  arbitrare `[123px]` doar cu un comentariu care justifică.
- **Dark mode e parte din definiția de „gata"**, nu un follow-up.
- **Accesibilitate (baseline non-negociabil):** contrast ≥ 4.5:1 · target-uri ≥ 44×44px ·
  `aria-label` pe fiecare buton doar-cu-iconiță · `<label>` pe fiecare input · navigare completă
  cu tastatura · zero violări axe critical/serious.
- **TypeScript strict, zero `any`.** Folosește `unknown` + narrowing. Props tipate pe fiecare
  componentă.
- **Stări goale, de încărcare și de eroare** pentru fiecare vedere care aduce date. O pagină care
  arată bine doar pe happy path nu e terminată.
- **Buget de performanță:** Lighthouse ≥ 90 mobile · JS gzip ≤ ~100KB per rută · imagini lazy ·
  fără scripturi terțe care blochează randarea.

---

## 9. Bucla de învățare — fiecare bug devine un guard permanent

Un bug care ajunge la owner sau în prod **nu se termină la „reparat"**. Un bug netransformat
într-un guard se va repeta. În **aceeași** schimbare:

1. **Cauza-rădăcină într-o propoziție** — mecanismul, nu simptomul. („un string placeholder a
   fost scris într-o coloană `uuid`", nu „prefill-ul era stricat").
2. **Testul care l-ar fi prins** — și confirmă că **pică** pe codul vechi și **trece** pe fix.
   Pus unde rulează automat. Un fix fără test care să-l blocheze e jumătate de fix.
3. **Lecția scrisă** în `docs/solutions/<categorie>/<slug>.md`
   (categorii: `build-errors`, `database-issues`, `frontend`, `security-issues`,
   `architecture-patterns`). Dacă e o **clasă** de bug, adaugă și o linie de regulă în acest
   fișier, ca sesiunea următoare s-o citească.

**Înainte** de a începe lucru într-o zonă, citește `docs/solutions/` pentru zona aia. Nu re-învăța
un bug deja documentat.

---

## 10. Lucru în paralel — un worktree per fir de lucru

Mai multe sesiuni/chat-uri pe același repo **împart un singur working tree**. Un `git stash -u`
rulat într-unul șterge din fața celuilalt munca nesalvată, inclusiv fișierele noi.

```bash
# la începutul unui fir de lucru nou
git worktree add ../proj-<scop> -b feat/<scop> origin/main
cd ../proj-<scop> && npm install       # node_modules e per worktree

# porturi separate, altfel al doilea server moare
PORT=3131 npm run dev      # firul A
PORT=3132 npm run dev      # firul B

# la final
git worktree remove ../proj-<scop>
```

**Un fir = un modul = un branch = un worktree.** Nu edita din firul B fișiere pe care firul A le
are în lucru.

**Capcană macOS/APFS:** sistemul de fișiere e case-insensitive. Înainte să creezi
`lib/fooBar.ts`, rulează `ls lib/ | grep -i foobar` — altfel scrii peste `foobar.ts` fără niciun
avertisment.

---

## 11. Ce NU faci

- ❌ Feature-uri în afara scope-ului cerut („cât eram acolo, am mai adăugat…")
- ❌ Dependențe noi fără justificare în corpul PR-ului
- ❌ `console.log`, cod comentat, `TODO` fără issue
- ❌ Teste șterse sau slăbite ca să treacă gate-ul de coverage
- ❌ Documentație de arhitectură nesolicitată (fișiere `.md` de plan pe care nu le-a cerut nimeni)
- ❌ Raportat „gata" fără output-ul comenzilor care o dovedesc
- ❌ Refactor amestecat cu feature în același commit
- ❌ Ignorat un warning pentru că „merge oricum"

---

## 12. Definition of Done

Un item e livrat doar când **toate** sunt adevărate:

- [ ] Toate criteriile de acceptare din spec sunt implementate — nici mai puțin, nici mai mult
- [ ] `typecheck` + `lint` + `test` + `build` verzi
- [ ] Fiecare acțiune nouă a fost **invocată** o dată cu input real → 200 + forma așteptată (§2)
- [ ] Migrarea e comisă, `db:reset && db:seed` trece, prefixul nu se ciocnește (§5)
- [ ] Rutele/routerele noi sunt montate; niciun link mort (§6)
- [ ] Dark mode + a11y verificate pe UI nou (§8)
- [ ] Verificat manual în aplicația reală, nu doar în teste
- [ ] Lecțiile din bug-urile întâlnite pe drum sunt scrise în `docs/solutions/` (§9)
- [ ] PR deschis, cu „Cum am verificat" și „Pași manuali la deploy" completate (§3.5)

Dacă un item a fost livrat fără una din liniile de mai sus, **procesul e stricat, nu feature-ul**
— repară procesul înainte de următorul item.

---

*Menținut manual. Ultima actualizare: 2026-08-09.*
