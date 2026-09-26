---
id: CONTPLATA-faza-1
title: Contul de plată în CRM — numerotare automată, client complet, catalog, șabloane, PDF personalizabil
status: in_progress
branch: feat/CONTPLATA-faza-1-crm-personalizabil
requested: 2026-09-26 (owner, captură „Generator Cont de plată — FinDesk")
---

# Ce a cerut owner-ul (26.09.2026)

1. Numărul contului să se pună **automat** (următorul din serie); manual doar dacă vrea el.
2. **Previzualizarea nu merge** (iframe gol cu „foaie tristă").
3. **Nu intră toate datele clientului** (beneficiarului).
4. Serviciile/produsele **legate de CRM**: modulul să stea în CRM, să ia din **catalog/stoc**,
   să refolosească serviciile din conturile anterioare, și să aibă **șabloane ca la PAR**.
5. Contul iese **HTML, nu PDF**, și **nu se poate personaliza** (logo, rechizitele noastre, culori).

# Cauzele, verificate în cod

| Simptom | Cauza reală |
|---|---|
| Fără număr automat | Generatorul (`FinInvoiceDocPage`) **nu salvează nimic** — nu are de unde să știe numărul următor. |
| Preview gol | Iframe cu sursă `blob:` — CSP-ul aplicației (`frame-src`) o blochează. Aceeași pană reparată la PAR în 7901b268: iframe-ul trebuie să arate o **rută de pe aceeași origine**, marcată în `FRAMEABLE_BY_US`. |
| Date client lipsă | Formularul are doar nume/IDNO/adresă; căutarea din registru nu aduce contactele, iar clienții din CRM (`crm_companies`) nu sunt deloc căutați. |
| HTML în loc de PDF | PDF-ul se făcea cu Chromium (Playwright). **Pe Vercel Chromium nu există** → cădea mereu pe HTML. Registrul de acte a rezolvat asta de mult cu pdfmake (`server/lib/docs/pdfDocument.ts`, text vectorial, fonturi cu diacritice). |
| Nepersonalizabil | Șablonul HTML are culorile hardcodate (emerald) și ia doar `tenant.name/iban/bic`; nu citește „Datele firmei", nici logoul. |

Mai exista și un **al doilea** modul, `/business/conturi-plata` (tabela `payment_accounts`, cu
numerotare pe serie și rechizite înghețate), practic nefolosit pe prod (2 conturi, 0 profiluri).
Două sisteme pentru același act = exact derapajul pe care îl interzice §3.5.1. **Decizia:** un singur
modul, construit pe `payment_accounts` (modelul persistent, corect), mutat în CRM; generatorul vechi
și rutele vechi redirecționează acolo.

# Ce refolosim (nu reconstruim)

- **Rechizitele noastre** = `fin_org_profile` prin `/api/crm/company-profile` („CRM › Datele firmei") —
  aceeași sursă ca ofertele și contractele CRM. Scrise o dată, apar peste tot.
- **Catalogul** = `crm_products` (+ `fin_inventory_items` pentru stoc, prin LEFT JOIN, ca în
  `/api/crm/products`).
- **Clienții** = `crm_companies` + registrul de stat (`/api/registry`).
- **PDF** = pdfmake + fonturile Tinos/Onest din `server/lib/docs/pdfFonts.ts`; suma în litere din
  `server/lib/docs/amountToWords.ts`; logoul se încarcă prin `uploadOrgLogo` (bucket `org-branding`)
  și se citește prin `logoDataUrl` (cache, niciodată blocant).
- **Totalurile** = `server/lib/paymentAccountTotals.ts` (deja pure + testate).

# Gate-uri obligatorii pe TOATE itemii (CLAUDE.md §3.5.1, nu doar CP-01)
Fiecare rută nouă (`next-number`, `:id/issue`, `:id/pdf`, `catalog`, `templates`,
`templates/:id/instantiate`) trece prin smoke-ul API live înainte de commit: server pornit,
login, apel real cu date realiste → 200 + forma așteptată a răspunsului (nu doar „ruta există").
Reamintire, nu excepție de la regulă generală.

# Itemi (un commit per item, un singur PR / push în main pentru toată faza)

## CP-01 — Model: client complet, legături CRM, setări, șabloane (backend)
- Migrare nouă: coloane noi pe `payment_accounts` (buyer_vat_code, buyer_email, buyer_phone,
  buyer_iban, buyer_bank_name, buyer_contact, crm_company_id, lead_id, lang, template_id,
  seller_bic/phone/email/administrator), `payment_account_items.product_id`, setări de design pe
  `seller_profiles` (accent_color, layout, logo_url, show_logo, show_amount_words, show_signature,
  show_stamp, footer_text, default_notes, default_due_days, default_lang, number_pattern,
  number_pad, number_start), tabela nouă `payment_account_templates`.
- Heal în `sync-schema` (tabela nouă în `ENSURE_STATEMENTS`; coloanele prin healul generic).
- **Acceptanță:** [blocant] `db:reset` trece; [blocant] schema-drift verde; [blocant] toate coloanele
  noi declarate în schema TS (potrivire bidirecțională).

## CP-02 — Numerotare automată cu suprascriere manuală
- `server/lib/paymentAccounts/numbering.ts` pur: șablon cu `{serie}`, `{an}`, `{nr}`, zero-padding,
  număr de start (pentru cine vine din alt program și e deja la 278).
- `GET /api/payment-accounts/next-number` → numărul care va fi atribuit.
- `POST /:id/issue` acceptă opțional `documentNumber` manual; numărul ocupat în tenant → **409
  `number_taken`**, niciodată duplicat.
- **Atenție la rescriere:** `/issue` actual (`server/routes/paymentAccounts.ts`) calculează
  `max(number)+1` cu un SELECT separat de UPDATE — cursă reală sub concurență (două `issue`
  simultane pot ieși cu același număr). `server/routes/docs.ts` rezolvă exact asta la finalizare
  cu un UPSERT atomic pe un contor dedicat (`docNumberSequences`: `INSERT … ON CONFLICT DO UPDATE
  SET lastNumber = lastNumber + 1 RETURNING`, vezi linia ~631). CP-02 TREBUIE să folosească același
  tipar atomic (fie un contor dedicat per tenant+serie+an, fie un `UPDATE … RETURNING` echivalent),
  nu SELECT-apoi-UPDATE.
- **Acceptanță:** [blocant] primul cont = `CP-2026-0001`; [blocant] al doilea = `…0002`;
  [blocant] start=279 → `…0279`; [blocant] număr manual duplicat → 409; [blocant] numărul manual
  nu strică secvența automată următoare; [blocant] **10 `issue` simultane pe același
  tenant+serie produc 10 numere distincte, fără gol și fără duplicat** (test de concurență —
  regresie directă pe cursa din `/issue` actual).

## CP-03 — PDF real, personalizabil, care merge pe Vercel
- `server/lib/paymentAccounts/paymentAccountPdf.ts` (pdfmake): 3 machete (`modern`, `clasic`,
  `compact`), culoare de accent aleasă, logo, rechizitele noastre complete (IDNO, TVA, adresă, IBAN,
  bancă, BIC, telefon, email), toate datele clientului, tabel poziții, TVA, total, **suma în litere**,
  semnătura administratorului, loc pentru ștampilă, text de subsol, note. RO/RU/EN.
- `GET /api/payment-accounts/:id/pdf` (inline, încadrabil de noi) și `?download=1` (atașament).
  Ciorna iese cu mențiunea CIORNĂ și cu numărul care urmează.
- `GET /api/payment-accounts/settings/sample.pdf` — mostră cu setările curente.
- **Acceptanță:** [blocant] răspunsul e `application/pdf` care începe cu `%PDF`; [blocant] ruta e
  în `FRAMEABLE_BY_US` (preview-ul se vede în iframe); [blocant] culoarea de accent invalidă nu
  strică PDF-ul (revine la implicit); [blocant] logo indisponibil → PDF fără logo, nu eroare.

## CP-04 — Catalog: produse CRM + stoc + servicii folosite anterior
- `GET /api/payment-accounts/catalog?q=` → produsele active din CRM (preț, unitate, TVA, stoc
  disponibil) + rândurile din conturile anterioare (distincte, cele mai recente/frecvente întâi).
- Linia păstrează `product_id`. **Contul de plată NU scade stocul** — e o cerere de plată, nu o
  livrare; stocul scade la câștigarea oportunității (regula existentă din CRM). Editorul avertizează
  când cantitatea cerută depășește stocul.
- **Acceptanță:** [blocant] produsele altui tenant nu apar; [blocant] stocul vine din inventar;
  [normal] un serviciu folosit de 3 ori apare o singură dată.

## CP-05 — Șabloane (ca la PAR)
- CRUD `/api/payment-accounts/templates`; „Salvează ca șablon" dintr-un cont; „Pornește din șablon";
  „Duplică" un cont anterior.
- **Acceptanță:** [blocant] contul pornit din șablon are clientul + pozițiile + notele șablonului și
  numărul NOU; [blocant] șabloanele sunt izolate pe tenant.

## CP-06 — Interfața în CRM
- `/business/crm/conturi-plata` (listă cu filtre + totaluri), `/nou`, `/:id` (editor + preview PDF
  viu, salvare automată a ciornei), `/setari` (rechizite, logo, culori, machetă, numerotare,
  texte implicite, cu mostră PDF live). Intrare în meniul CRM.
- Client: o singură căutare peste clienții CRM **și** registrul de stat; alegerea completează tot
  (inclusiv contactele din fișa registrului); „Mai multe detalii" pentru email/telefon/IBAN/bancă.
- Linii: descrierea are autocomplete din catalog (produse cu stoc + „folosite anterior").
- Redirecționări: `/business/fin/invoices/document` și `/business/conturi-plata/*` → CRM.
- **Acceptanță:** [blocant] preview-ul se vede în browser real (iframe, nu blob); [blocant] „Emite"
  pune numărul automat și descarcă un PDF; [blocant] lucrează în light și dark; [blocant] fără hex
  în `.tsx`.

# Ce NU intră în faza 1 (backlog descoperit)
- Trimiterea pe email a contului direct din aplicație (se poate refolosi `documentEmail` din acte).
- Legarea plății încasate (extras bancar) de contul de plată → status „plătit" automat.
- Transformarea contului de plată în factură fiscală / e-Factura.
- Buton „Cont de plată" pe fișa leadului / a firmei din CRM, cu clientul și produsul leadului
  precompletate (coloana `lead_id` există deja; lipsește doar punctul de intrare).
- „Adaugă în catalogul CRM" direct dintr-o poziție scrisă de mână.
- `GET /api/fin/invoices/:id/document.pdf` (factura FinDesk) încă rasterizează cu Chromium → pe
  Vercel iese HTML. Aceeași reparație ca aici (pdfmake), separat.
- Previzualizarea logoului în pagina de setări: CSP-ul `img-src` nu include Storage, deci logoul se
  vede doar în mostra PDF (suficient, dar o miniatură ar fi mai clară).
