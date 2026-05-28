# M1-008 Multi-filiale — Persona Review (Maria + Cristina)

**Verdict**: NOT_RELEVANT (cu un semnal slab pentru Cristina)

Pagina e B2B pură — pentru directori de rețele/francize. Maria și Cristina nu sunt utilizatori-țintă, dar tot le-am pus să citească pentru că Cristina, ca plătitor, ar putea fi afectată INDIRECT de două lucruri menționate în FAQ.

---

## Cristina (mama, 42, plătește facturile)

### 1. Transfer între filiale — duplicate sau date corecte?

FAQ #3 zice: *"sistemul mută istoricul, plățile rămase, accesul la app — toate atomic. Pe rapoarte, elevul apare în ambele cu marcaj (left X / joined Y)."*

> "OK, deci copilul meu apare în DOUĂ filiale pe rapoarte? Asta înseamnă că primesc două facturi? Sau o factură dublă? «Atomic» nu înțeleg ce vrea să spună — sună a tehnologie, nu a confort pentru mine."

**Friction**: Cuvântul "atomic" e jargon dev. Pentru un părinte, "apare în ambele filiale" sună a duplicare, nu a istoric curat. Faptul că textul liniștește developerul ("totul atomic") nu liniștește părintele.

**Risc real pe care pagina NU îl adresează**:
- Cine emite factura după transfer — filiala veche sau cea nouă?
- Plățile recurente (card salvat) se mută automat? Sau Cristina trebuie să reintroducă cardul?
- Dacă a plătit în avans pe luna în curs la București și se mută la Cluj, banii se transferă sau se pierd?

Nimic din toate astea nu e clarificat. Pagina vinde directorului transferul ca "atomic", dar plătitorul are zero garanții vizibile.

### 2. Pricing diferit per filială — avertizare la mutare?

FAQ #2: *"Engleză B2 — 280€/lună în București, 220€/lună în Cluj"*.
FAQ #3 (transferul): zero mențiune că prețul se poate schimba.

> "Stai. Deci dacă mut copilul de la Cluj la București, factura mea sare de la 220€ la 280€ peste noapte? Și sistemul îmi spune asta ÎNAINTE să confirm transferul, sau aflu din extras?"

**Issue major**: Spec-ul descrie transferul ca un click pentru director. Director-ul vede "elev mutat". Părintele descoperă diferența de preț pe extrasul de cont. Asta e un dark pattern, chiar dacă neintenționat.

**Recomandare pentru M2** (nu blochează M1, e B2B landing):
- FAQ #3 ar trebui să menționeze explicit: "Diferențele de preț între filiale sunt afișate părintelui ÎNAINTE de confirmarea transferului, cu opțiune de refuz."
- Sau, în modulul Wallet/Payments (alt spec), trebuie o regulă: re-confirmare consimțământ când prețul crește >5%.

---

## Maria (14, elev)

> "Hartă cu pini. Mișto pentru proiectul de geografie. Bye."

Nimic relevant. Pagina e despre administrare de rețea, ea vrea doar să știe dacă noul profesor din Cluj e ok. Asta ar fi în modulul Profesori, nu aici. **Skip.**

---

## Sumar acționabil

| # | Issue | Severitate | Tip |
|---|---|---|---|
| 1 | "Atomic" e jargon, părintele nu înțelege | Low | Copy |
| 2 | Pricing-shock la transfer nu e adresat în UX | **Medium** | Spec gap (M2) |
| 3 | Factura/cardul salvat după transfer — neclar | Medium | Spec gap (M2) |
| 4 | Maria nu are nimic aici | Expected | n/a |

Pagina M1-008 își face treaba pentru audiența ei (directori). Cele două semnale de mai sus sunt input pentru spec-ul Wallet/Payments în M2, nu blockere pentru landing-ul curent.

**PASS_WITH_FEEDBACK** — nu blochează.
