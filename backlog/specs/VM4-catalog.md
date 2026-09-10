# VM4 — Feedback Violeta (rol finanțe), 2026-09-10

> Sursă: mesajele Violetei către owner după ce a lucrat pe PAR-2026-0020 în producție.
> Toate cele patru item-uri au fost verificate în cod înainte de construcție: erau găuri reale,
> nu neînțelegeri de UI. Livrate pe branch-ul `feat/PAR-finante-recall-dovada`.
>
> Citatele, în ordinea în care le-a scris:
> - „din greșeala am apasat plaitit / cum sa fac recall la acest par / sa nu fie plata"
> - „am vrut sa apas refuzat"
> - „la marcaj ca platit — extrasele bancare vin a 2 zi cu stampila bancii in pdf / tot mereu
>   pentru toate platile"
> - „ar trebui sa fie un mecanism in care sa se ataseze ordinul de plata / cand am 20 sau 30
>   plati tre sa ma duc jos cu split la fiecare act"
> - „sau de inserat printr-un comentariu ca imagine cand fac print screen la ordin de plata /
>   dar asta e post factum, nu in acelasi moment cand e achitat parul"

---

## VM4-01 — „Anulează plata" (recall pentru clickul greșit) — **done**

**Gap:** `paid` era terminal. Un click greșit rămânea în istoric ca plată executată, solicitantul
primea notificarea „plătit", iar singura ieșire era o cerere nouă.

**Livrat:** `POST /api/par/:id/unpay` (finance / par_admin, motiv obligatoriu) → `in_finance`,
`paid_at` golit, rândul din `par_payments` păstrat (suma și referința se refolosesc la re-plată),
audit `payment_reverted`, notificare de anulare către solicitant. Buton „Anulează plata" pe fișa
cererii, cu formular de motiv.

**AC:** (1) doar din `paid`, altfel 409; (2) doar finanțe/par_admin, altfel 403 — autorul NU își
poate anula plata; (3) motivul e obligatoriu (400 fără el); (4) după anulare, `/pay` funcționează
din nou; (5) ambele evenimente rămân în jurnal.

## VM4-02 — Finanțele pot refuza plata — **done**

**Gap:** ecranul de finanțe avea un singur drum înainte („Marchează plătit"). Butonul „refuzat" pe
care îl căuta nu exista nicăieri — de aici și clickul greșit.

**Livrat:** `POST /api/par/:id/finance-return` din `approved` / `in_finance` /
`reapproval_required` → `changes_requested`, cu motiv, audit `finance_returned` și notificare.
Buton „Refuză plata" pe fișa cererii ȘI în dialogul de înregistrare a plății (acolo se ia decizia).

**AC:** (1) cererea devine editabilă pentru solicitant și, la re-trimitere, reia lanțul de aprobare;
(2) motivul ajunge în notificare și în jurnal; (3) pe o cerere deja plătită → 409 (întâi se anulează
plata); (4) 403 fără rol de finanțe.

## VM4-03 — „Marchează plătit" cere confirmare — **done**

**Gap:** un singur click schimba statutul cererii și trimitea notificarea „plătit".

**Livrat:** dialogul arată întâi un rezumat (cui, cât, în ce IBAN) și abia „Da, confirmă plata"
execută. „Înapoi" lasă cererea neplătită.

**AC:** primul click NU cheamă API-ul; al doilea îl cheamă o singură dată.

## VM4-04 — Dovezile de plată, atașate în bloc și potrivite automat — **done**

**Gap:** extrasul ștampilat vine a doua zi, deci dovada nu poate fi atașată la momentul plății. Cu
20–30 de plăți, atașarea însemna deschiderea fiecărei cereri în parte.

**Livrat:**
- ecran nou `/business/par/dovezi` (finance / par_admin): coadă derivată — cereri `paid` fără
  atașament de tip `payment_order`; se golește singură pe măsură ce dovezile apar, oriunde ar fi
  atașate;
- încărcare în bloc: drag & drop, selectare multiplă sau Ctrl+V (print screen);
- potrivire automată fișier → plată după numele fișierului (nr. ordin, nr. cerere, beneficiar,
  sumă), cu încredere și motiv afișate, listă de corectat manual;
- la momentul plății: ordinul de plată se poate LIPI direct în dialog (Ctrl+V) și se salvează cu
  tipul real `payment_order`, nu „Altul".

**AC:** (1) o potrivire ambiguă sau slabă NU se atașează singură; (2) două fișiere care trag la
aceeași plată — doar cel mai bine punctat rămâne propus; (3) atașarea folosește ruta existentă de
atașamente (aceleași validări de tip/mărime); (4) o eroare la un fișier nu oprește lotul;
(5) un atașament de alt tip (factură) nu trece drept dovadă de plată.

## VM4-05 — „Confirmarea plății" sus pe fișa cererii, cu previzualizare — **done**

**Feedback owner după prima zi pe ecranul de dovezi:** „dacă intri la PAR de acolo, trebuie sus să
fie dovada… adaugă confirmare plată, să poți adăuga fișier, captură de ecran… acest «choose file»
parcă e old school, și după ce e adăugat să poți vedea direct documentul confirmativ, și la fel se
adaugă la dosar."

**Gap:** încărcarea ordinului de plată stătea la coada secțiunii 13, ca `<input type="file">`
nestilizat, accepta doar `.pdf`, iar după încărcare vedeai un nume de fișier — ca să știi ce ai
atașat trebuia să-l deschizi.

**Livrat:** card „Confirmarea plății" imediat sub acțiuni, doar pe cereri `paid`:
- starea în clar („La dosar" / „Lipsește din dosar");
- zonă de tragere + buton propriu + **Ctrl+V** pentru captura de ecran; PDF sau imagine, max 3 MB,
  cu mesaj când fișierul e prea mare;
- **previzualizare pe loc**: PDF în cadru, imaginea ca imagine, plus „Mărește" (vizualizatorul din
  aplicație) și ștergere pentru cel care a încărcat;
- fișierul rămâne un atașament obișnuit `payment_order`: apare în secțiunea 13, în dosarul PDF și
  scoate cererea din coada „Dovezi de plată". Secțiunea 13 trimite acum spre card, ca să nu existe
  două locuri de încărcare.

**AC:** (1) cardul apare sus pe cereri plătite; (2) fișierul ales SAU lipit se atașează cu tipul
`payment_order` și numele cererii în denumire; (3) documentul se vede fără să fie deschis;
(4) un fișier de alt tip din dosar (factura) nu e confundat cu dovada; (5) cine nu are drept de
încărcare vede doar documentul, iar dacă nu există dovadă nu vede niciun card.

---

## Amânate deliberat (nu s-au construit acum)

- **Ordinul de plată generat de aplicație (PDF)** — rămâne VM2-09. Violeta atașează ordinul emis de
  bancă, nu unul generat de noi; generarea e o altă discuție.
- **Reconciliere din extrasul bancar** (marcare automată ca plătit din fișierul băncii) — VM2-11,
  amânat explicit de ea încă din runda 2: „asta-i next step".
