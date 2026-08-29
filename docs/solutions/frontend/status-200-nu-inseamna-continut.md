# 200 nu înseamnă că pagina există

**Data:** 2026-08-29 · **Zona:** deploy, SEO, verificare post-deploy

## Simptomul

După ce blogul pre-randat a fost împins pe `main`, verificarea post-deploy a raportat totul verde:

```bash
for u in /blog /blog/dosarul-unei-plati /sitemap.xml; do
  curl -s -o /dev/null -w '%{http_code}' https://www.finflow.best$u
done
# 200 200 200
```

Toate paginile serveau, de fapt, shell-ul aplicației. Zero cuvinte din articole.

## Cauza

Aplicația e un SPA: ultima regulă de rutare din `scripts/build-vercel.mjs` trimite orice cale
necunoscută la `/index.html`, cu status **200**. Asta e corect pentru o aplicație cu rutare pe
client — dar înseamnă că `curl -o /dev/null -w '%{http_code}'` returnează 200 pentru absolut orice
cale, inclusiv pentru una care nu există și nu a existat niciodată.

Deci verificarea nu putea pica. Iar o verificare care nu poate pica nu e o verificare: în cazul de
față, deploy-ul care rula încă era commit-ul dinaintea push-ului, și n-aveam cum să aflu din ea.

## Reparația

`scripts/check-blog-live.mjs` (rulat cu `npm run check:blog-live`) asertează **conținut**, nu status:

- fiecare articol publicat își conține propriul canonical, pe cale, plus titlul lui;
- `/blog/blog.css` chiar începe cu `:root`, nu cu `<!doctype html>`;
- `/sitemap.xml` conține `<urlset>` și toate slug-urile publicate;
- **testul negativ**: o rută inexistentă NU trebuie să arate ca un articol. Fără el, scriptul ar
  trece și pe un deploy complet gol — adică ar avea exact defectul pe care îl repară.

Lista de verificat se citește din registrul de articole, nu e scrisă în script: altfel ar rămâne în
urmă la primul articol nou.

Canonicalul se compară pe **cale**, nu pe gazdă. Paginile de pe un preview poartă domeniul de
producție cu care au fost construite, iar o comparație pe gazdă ar pica fals exact acolo unde vrei
să folosești garda.

## Regula generală

Pe orice aplicație cu fallback SPA, un test post-deploy care se uită doar la codul de status nu
demonstrează nimic. Verifică un fragment care **nu are cum** să apară în shell — un canonical, un
titlu, o afirmație din text — și include întotdeauna cazul negativ care trebuie să facă poarta roșie.

Vezi și `CLAUDE.md` §3.5.1quinquies și §3.5.1quater.
