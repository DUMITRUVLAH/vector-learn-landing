# `<Button href>` e o cale de router, nu un URL

**Categorie:** frontend · **Data:** 2026-09-26 · **Găsit de:** verificarea de tipuri + review, înainte de livrare (CONTPLATA)

## Ce s-a întâmplat
În modulul „Conturi de plată" am scris `<Button href={`#/business/crm/...`}>` și
`<Button href="/api/payment-accounts/:id/pdf?download=1">`. `Button` din `@/components/ds` randează
`<Link to={href}>`, care pune singur `#` în față și navighează prin routerul intern
(`navigate(to)`). Deci: linkurile ieșeau `##/business/...`, iar „Descarcă PDF" ar fi încercat o rută
a aplicației în loc de o cerere reală către API.

Tot acolo, un buton nou pe fișa leadului folosea `ReceiptText` fără import — testele treceau pentru
că niciunul nu deschidea fila „Acte". A prins-o `tsc` (clasa TS2304 care a dat outage-ul din 2026-06-02).

## Regula
- `Button href` = cale de router **fără `#`** (`/business/crm/conturi-plata/setari`).
- O descărcare / un endpoint API = `onClick={() => window.location.assign(url)}` sau un `<a href>` simplu.
- Un element nou într-o filă ascunsă are nevoie de un test care **deschide fila** — altfel importul
  lipsă sau linkul greșit nu se randează niciodată în test.

Teste: `src/__tests__/crm/lead-sheet-tabs.test.tsx` („fila Acte pornește un cont de plată"),
`src/__tests__/crm/payment-account-settings.test.tsx` (href-ul „Aspect și numerotare").
