---
category: security-issues
date: 2026-09-13
symptom: "„Failed to fetch" în dialogul de înregistrare a plății, la orice cerere cu ordin de plată atașat"
files:
  - shared/csp.mjs
  - server/middleware/securityHeaders.ts
  - scripts/build-vercel.mjs
  - scripts/check-vercel-headers.mjs
  - src/lib/api/par.ts
  - src/lib/api/finCaptures.ts
  - src/lib/dataUrl.ts
---

# Un CSP care nu ține pasul cu produsul e o pană, nu o protecție

## Simptom

Owner-ul a trimis captura dialogului „Înregistrare plată" (PAR-2026-0032, ordin de plată atașat)
cu o eroare roșie sub titlu: **„Failed to fetch"**. Serverul nu logase nimic — pentru că nicio
cerere nu ajunsese la el.

## Mecanismul

Pe 13.09, `c18eb148` a mutat urcarea fișierelor DIRECT în Supabase Storage (browserul face `PUT`
la un URL semnat, ca să dispară plafonul de ~3 MB al corpului de funcție Vercel). Politica de
securitate a paginii rămăsese însă cea scrisă pe 08.08:

```
content-security-policy: … connect-src 'self'; …
```

`connect-src 'self'` înseamnă „browserul poate deschide conexiuni doar către originea noastră".
`https://<proiect>.supabase.co` nu e originea noastră, deci browserul a oprit `PUT`-ul **înainte
să plece** și `fetch` a respins cu TypeError-ul lui sec, „Failed to fetch" — mesaj pe care UI-ul îl
afișa ca atare. Local nu se vedea: în dev, pagina e servită de Vite, care nu pune CSP-ul; politica
de pe document vine, în producție, din regulile CDN-ului (`scripts/build-vercel.mjs`).

Aceeași cauză lovea, tăcut, și alte drumuri: urcarea în masă a documentelor din Finanțe
(`putToSignedUrl`), exportul JPG al diplomelor și descărcarea atașamentelor vechi — ultimele două
pentru că `fetch("data:…")` e la fel de blocat de `connect-src` ca orice altă origine.

## Cauza de fond (nu „am uitat o directivă")

CSP-ul trăia în **două copii**: middleware-ul Hono și configurația CDN-ului. Singurul lucru care le
ținea egale era un comentariu — „valorile sunt identice cu cele din middleware". Iar copia care
contează pentru ce poate face aplicația în browser e cea de pe DOCUMENT, adică exact cea servită de
CDN, pe care n-o vezi rulând aplicația local.

## Reparația

1. **O singură definiție**: `shared/csp.mjs`, importată și de middleware, și de build. Nu mai pot
   diverge. `connect-src` include originea Storage-ului, dedusă din `SUPABASE_URL` (wildcard
   `https://*.supabase.co` doar ca plasă de siguranță când env-ul lipsește la build).
2. **Poartă pe ARTEFACT**: `check-vercel-headers.mjs` pică dacă `connect-src` din
   `.vercel/output/config.json` nu permite Storage-ul. Verificat că poarta chiar prinde bug-ul:
   pe politica veche iese cu cod 1.
3. **Fără `fetch` pe `data:`**: `src/lib/dataUrl.ts` (decodare locală) și `canvas.toBlob` în
   `certificateRender.ts` — conținutul e deja în pagină, nu are ce căuta o cerere de rețea.
4. **Mesaje omenești**: un `fetch` care nici nu pleacă devine „Conexiunea nu a putut fi făcută…",
   nu jargonul browserului. La plată se spune explicit că cererea NU a fost înregistrată ca plătită.

## Regula, generalizată

**Orice funcție nouă care face browserul să vorbească cu o origine nouă cere, în ACELAȘI commit, o
directivă CSP și o poartă pe artefactul de deploy.** Un header de securitate care blochează o
funcție a produsului nu e „strict", e o pană — și una care nu se vede niciodată în dev, pentru că
dev-ul nu servește politica.
