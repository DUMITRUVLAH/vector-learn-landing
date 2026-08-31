# „PDF-ul arată ca un fișier HTML" — pentru că era o poză

**Categorie:** frontend / documente · **Data:** 2026-08-31 · **Găsit de:** owner, pe actele reale

## Simptom
Actele descărcate din modulul de documente arătau prost: text neclar la zoom, rânduri tăiate exact
la marginea paginii, nimic de căutat cu Ctrl+F, nimic de copiat. Exportul pentru Word al aceluiași
act arăta perfect. Owner: „PDF-ul, nu știu, e ca un fișier HTML. Word-ul e ok."

## Cauza reală
Pe Vercel nu există chromium, deci randarea pe server (`htmlToPdfBuffer` → Playwright) întorcea
mereu `null`. Ca soluție de avarie, PDF-ul se făcea ÎN BROWSER: `html2canvas` fotografia pagina și
`jsPDF` împacheta imaginea. Rezultatul era un JPEG, tăiat mecanic la fiecare 297 mm — deci prin
mijlocul rândurilor — fără strat de text, fără antet, fără paginație.

Un al doilea efect, mai grav: PDF-ul exista doar dacă cineva apăsa butonul în browser. E-mailul
către contraparte și ZIP-ul dosarului depindeau de el, deci refuzau să plece („actul nu are încă
PDF generat"), iar `PUT /documents/:id/pdf` accepta octeți DE LA BROWSER — adică oricine putea
înlocui PDF-ul unui act semnat cu orice fișier.

## Cum s-a reparat (DC-102)
Corpul actului se citește ca structură (`server/lib/docs/richText.ts`: titluri, paragrafe, liste,
tabele) și se scrie ca PDF adevărat cu **pdfmake** (`server/lib/docs/pdfDocument.ts`): text
vectorial, antetul tabelului repetat la schimbarea paginii, „pagina X din Y" în subsol, marginile
identice cu previzualizarea. Rulează pe server, deci același fișier ajunge în descărcare, în e-mail,
în ZIP și în atașamentul cererii de plată. Ruta `PUT …/pdf` a dispărut; în locul ei,
`POST …/pdf/ensure` generează din corpul sigilat.

**Fontul:** Times New Roman e proprietar; fonturile standard din PDF (WinAnsi) nu au `ă ș ț`. Am
livrat **Tinos** (Apache-2.0), metric-compatibil cu Times New Roman — deci PDF-ul și fișierul Word
rup rândurile la fel.

## Capcana de împachetare (a doua zi de muncă, dacă o ratezi)
`pdfkit`/`fontkit` citesc fișiere de date cu `__dirname + "/data.trie"`. Într-un bundle ESM
(`scripts/build-vercel.mjs`) `__dirname` nu există → **prima cerere de PDF moare în producție**,
deși totul e verde local. La fel ca lecția exceljs: un pachet care citește de pe disc nu poate fi
„extern" fără fișierele lui. Soluția: pdfmake se copiază ca PACHET în `.func/node_modules`
(închiderea de dependențe), iar fonturile în `.func/assets/fonts`. Build-ul pică explicit dacă
lipsesc — mai bine un deploy oprit decât un act cu pătrățele în loc de diacritice.

## Regula de reținut
> Un PDF care nu-ți dă textul înapoi la extragere **nu e un PDF, e o poză**. Testul care contează
> nu e „s-au întors octeți cu `%PDF`", ci `extractText(pdf)` care găsește titlul, suma și numărul
> actului (`server/lib/docs/__tests__/pdfDocument.test.ts`, `docgen-pdf.routes.test.ts`).
