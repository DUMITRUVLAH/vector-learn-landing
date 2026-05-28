# M1-001 — Manager Review (Andreea Mitran)

## Context
- Pagină: `/modules/orar`
- Reviewer: Andreea Mitran, director academie cu 6 locații, 80 profesori, 1.400 elevi.
- Stack actual: Excel + WhatsApp Web + un CRM generic.
- Mod de citire: 60 secunde scanare, apoi 3-4 minute lectură atentă.

## Primele 60 de secunde

Aterizez pe pagină. Văd badge-ul "Modulul Orar", titlul *"Programarea care se ocupă singură de logistică"*, sub-titlul cu WhatsApp + Zoom + plăți. OK, am înțeles ce face produsul în 5-6 secunde — bun.

CTA principal: **"Cere demo gratuit"**. Clar. Secundar: "Vezi prețuri". Bun, e exact ce vreau să apăs înainte să-mi pierd vremea cu un demo.

Scroll. Apare imediat un calendar real — nu un screenshot, ci grilă cu lecții colorate. **Asta e ce m-a făcut să rămân.** Văd "Engleză B2 — Ana M.", "Pian — Radu C." — sună a date plauzibile, nu lorem ipsum.

Scroll mai jos: "4 pași până la un orar care se gestionează singur", "Tot ce-ți trebuie ca să nu mai pierzi 6 ore/săptămână pe orar". Singura cifră concretă pe pagină: **6 ore/săptămână**. Una singură. Asta e problema.

## Lectura de 3-4 minute

### Hook (hero)
Titlul este bun: zice ce face, pentru cine, cu un beneficiu măsurabil implicit. Sub-titlul listează 4 lucruri care se întâmplă automat (plăți, WhatsApp, salariu profesor, Zoom). Asta îmi rezolvă cele mai mari dureri zilnice.
**Minus**: nu există nicăieri în hero o cifră concretă — fără "salvează X ore", fără "folosit de Y academii", fără logo-uri. Pentru un buyer skeptic ca mine, hero-ul vinde o promisiune, nu o dovadă.

### Demo interactiv
Am tras "Pian — Radu C." din Marți 09:00 în Joi 16:00. Două toast-uri au apărut: "Părinți notificați pe WhatsApp" și "Orar profesor actualizat". Animația de hover pe celulă, ring primar pe drop — execuție curată. Am pus o lecție peste alta — se aprind roșu, badge de conflict apare sus. **Funcționează exact cum spune spec-ul.**
**Minus**:
- Demo-ul are doar **o săptămână, 4 sloturi de oră**. Eu am orar cu 8-9 sloturi/zi pe filială. Pare mic.
- Nicăieri nu scrie "Acest demo e simulat — în produs ai integrare reală cu WhatsApp Business API". Eu, suspicioasă, presupun că toast-ul e teatru și că în realitate nu există integrarea.
- Nu există filtre vizibile: sală, profesor, filială. Spec-ul promite "5 vizualizări", aici văd una.
- Pe mobil (l-am simulat) — calendarul cu 5 coloane × 4 rânduri va deveni inutilizabil sub 500px. Nu văd un toggle "vezi pe listă".

### Capabilități
6 carduri cu iconițe. Conținut bun: conflict detection, recuperări automate, lecții online, înlocuiri. Cardul "Confirmări cu 24h înainte" îmi rezolvă o durere reală — eu acum sun părinții manual.
**Minus**: zero capturi de ecran ale produsului real. Totul e text + iconițe lucide generice.

### "Pentru cine"
3 carduri — manager, profesor, director rețea. Profesorul are *"Vezi-ți comisionul în timp real"* — e un beneficiu specific și convingător. Pentru directorul de rețea: *"dashboard centralizat, rapoarte consolidate pe locație"* — exact ce caut, dar nu există un screenshot ca să cred.

### FAQ
4 întrebări, toate relevante. Răspunsul la "cât durează setup-ul" zice **"aproximativ 2 ore, migrare inclusă pe Pro și Enterprise"** — asta e cel mai concret număr de pe pagină după "6 ore/săptămână". Bun. Răspunsul despre filiale e exact ce voiam să aud (permisiuni granulare).
**Minus grav**: NIMIC despre GDPR. NIMIC despre e-Factura. NIMIC despre integrare cu 1C sau SAGA. Pentru România, asta e showstopper. Eu am 1.400 de profile de minori în sistem — vreau un FAQ care zice "datele stau pe servere UE, conform GDPR".

### CTA & friction
- CTA primar trimite la `#/?demo=orar` — bun, ancoră directă.
- Lipsește un CTA repetat la final de pagină. După FAQ pagina se termină brusc. Sunt convinsă 70%, dar nu am pe ce să apăs fără să fac scroll înapoi.
- "Vezi prețuri" — nu există prețuri pe această pagină. Eu vreau o cifră, sau cel puțin "de la X RON/lună/profesor".

### Limba română
Naturală, profesională, fără calcuri din engleză. *"Profesor dublu-rezervat"*, *"cu un swipe"* — sună bine. Nu am simțit niciun moment cringe. Bravo.

## Concluzia mea de cumpărător

Pagina e **clar peste media demo-urilor pe care le-am văzut** (din 4, asta e a 2-a ca polish). Demo-ul interactiv chiar funcționează, copy-ul e curat, structura e logică. Problemele sunt: zero dovezi sociale (logo-uri, testimoniale, număr de academii), zero menționare GDPR/e-Factura/integrări locale, o singură cifră de ROI ("6 ore/săptămână" — și aia spusă într-un titlu, nu cu metodologie), niciun screenshot al produsului real în afara demo-ului. Demo-ul e prea mic pentru o academie reală (4 sloturi).

Nu trec direct la "buy" — dar cer demo. **MAYBE.** Dacă demo-ul live arată numerele de care am nevoie (logo-uri clienți, GDPR, e-Factura), trec la BUY rapid.

---

```
MANAGER_REVIEW: MAYBE
ID: M1-001
FIRST_IMPRESSION_5S: "OK, calendarul ăsta chiar se mișcă — hai să văd ce poate."
HOOK_STRENGTH: strong
TRUST_SIGNALS: absent
ROI_PROOF: vague
CTA_CLARITY: clear
COPY_QUALITY: natural
DEMO_REALISM: feels real

FRICTION_POINTS (max 5):
- [critical] Zero mențiuni de GDPR, e-Factura sau integrare cu 1C/SAGA — pentru România e showstopper
- [critical] Zero dovezi sociale: niciun logo de academie client, zero testimoniale, niciun "folosit de X școli"
- [major] O singură cifră de ROI pe toată pagina ("6 ore/săptămână") și fără sursă — am nevoie de mai multe numere concrete
- [major] Demo-ul are doar 4 sloturi orare și o săptămână — pare jucărie față de orarul meu real cu 8-9 sloturi/zi × 6 filiale
- [minor] Lipsește un CTA repetat la finalul paginii; după FAQ nu am pe ce să apăs fără scroll înapoi

WINS (max 3):
- Demo interactiv real funcțional cu drag&drop, toast-uri credibile și conflict detection — m-a făcut să rămân pe pagină
- Copy în română natural și profesional, fără calcuri din engleză, cu beneficii concrete (Zoom, WhatsApp, salariu profesor)
- FAQ-ul despre setup ("2 ore, migrare inclusă pe Pro/Enterprise") și despre filiale cu permisiuni granulare răspund la întrebările mele reale

QUOTE: "Demo-ul m-a convins că știți să faceți produs — acum demonstrați-mi cu cifre și clienți reali că merită să-mi mut 80 de profesori pe el."

VERDICT: Pagină solidă, peste media demo-urilor concurente, cu un demo interactiv care chiar funcționează și copy românesc curat. Dar îmi lipsesc trei lucruri critice ca să semnez: dovezi sociale (logo-uri, testimoniale, număr clienți), conformitate locală vizibilă (GDPR, e-Factura, integrări cu software-ul de contabilitate românesc) și ROI cuantificat dincolo de "6 ore/săptămână". Cer demo, dar nu cumpăr azi.
```
