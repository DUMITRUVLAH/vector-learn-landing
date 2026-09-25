# CRM × generarea de acte — ce am învățat din VectorB2B (2026-09-25)

> Cererea ownerului: „mă interesează integrarea cu generarea de documente; caută în VectorB2B cum
> se generează documentele ușor și cum arată acestea, și vezi ce putem îmbunătăți la noi."

## 1. Cum face VectorB2B (repo `DUMITRUVLAH/vector-b2b`, citit 2026-09-25)

**Motorul** e simplu: `{{variabila}}` înlocuit în HTML sau direct în fișierul Word al firmei.
E construit pentru **angajați** (HR), nu pentru clienți, afaceri sau produse.

**De ce se simte ușor** — lecțiile care contează pentru noi:

1. **Încarci Word-ul tău, AI-ul găsește golurile.** Nu înveți nicio sintaxă: confirmi cu un
   comutator fiecare loc detectat („Subsemnatul …", „CNP ___") și șablonul e gata.
2. **Bibliotecă gata făcută** — ~14 documente HR cu text juridic MD/RO, adăugate dintr-un click.
3. **Datele firmei se scriu o singură dată** (IDNO, adresă, director, contabil-șef) și apar pe
   orice act.
4. **Datele persoanei vin singure** din fișă; omul scrie doar 1–2 câmpuri „per document".
5. **Generare în masă**: bifezi N persoane sau lipești din Excel → un fișier sau un ZIP, cu
   numere de înregistrare automate.
6. **Word-ul își păstrează formatarea originală** — completează fișierul firmei, nu-l redesenează.
7. **Previzualizare** înainte de generare, cu variabilele evidențiate.

**Ce arată bine NU e din aplicație.** Contractele-model (Azamet, Dentus) — antet, fișă-rezumat
cu etichete pe fond închis, articole numerotate, casete colorate, semnături pe două coloane —
au fost scrise ca HTML și tipărite din Chrome (metadatele PDF: `HeadlessChrome`). Generatorul
aplicației face PDF-uri-imagine (html2canvas), fără text selectabil.

**Ce e mai slab ca la noi:** fără clienți/afaceri/produse, fără tabel de poziții, fără sumă în
litere, fără stări (trimis/semnat) pe actele generice, prefixul numărului ignorat, fișierele
generate nelegate de fișa persoanei.

## 2. Ce era rupt la noi (testat în browser, 2026-09-25)

| # | Problema | Stare |
|---|----------|-------|
| 1 | O tastă în editor mută actul din CRM (`crm_lead` → `vendor`): dispare din fila „Acte" și din CRM › Documente, cu butoanele Semnat/Refuzat. Prod: 16 acte, niciunul atins încă | **reparat — D01** |
| 2 | „Act nou" din lead te scotea în PAR („Administrator PAR"), fără drum înapoi | **reparat — D01** (`/business/crm/documente/:id`) |
| 3 | Oferta se afișa ca „Act de primire-predare" în editor | **reparat — D01** |
| 4 | Prima salvare punea TVA-ul pozițiilor pe 0 | **reparat — D01** |
| 5 | Oferta și „alt document" împărțeau seria DOC- (numere duplicate) | **reparat — D01** (OF-) |
| 6 | Oferta pornea cu „Total 0,00 MDL" pe un lead de 29.000 cu produs ales | **reparat — D02** |
| 7 | Trimiterea cerea adresa într-un câmp gol; după prima trimitere, butonul dispărea | **reparat — D02** |
| 8 | Tabelul pozițiilor ieșea turtit într-un rând de text în PDF — în **toate** șabloanele, și PAR | **reparat — D03** |
| 9 | Oferta: Times, titlu centrat, fără TVA, fără loc de acceptare | **refăcut — D03** (stil modern) |
| 10 | IDNO/IBAN/banca/administratorul NOSTRU nu au unde fi scrise → linii goale pe fiecare act | **D04** |

## 3. Următorii pași (în ordinea valorii)

### CRM-D04 — „Datele firmei tale", o singură dată
Coloane noi pe `fin_org_profile` (iban, banca, bic, administrator, funcție, telefon, e-mail, logo)
cu heal în `sync-schema.ts`; ecran „Datele firmei" în CRM › Administrare (și un link din
avertismentul „rechizite lipsă" al editorului); `fieldResolver` le citește ca `noi.*`.
Criteriu: o ofertă nouă nu mai are niciun `____` în blocul furnizorului.

### CRM-D05 — Actul în viața leadului
- Ofertă trimisă → leadul trece singur în etapa „ofertă" a pâlniei (dacă există); contract
  semnat → etapa câștigată (cu confirmare, reversibil).
- Crearea / trimiterea / vizualizarea de către client / semnarea apar în cronologia leadului.
- „Vizualizată de client" apare pe fișa leadului și trimite o notificare responsabilului.

### CRM-D06 — Clientul acceptă online
Pagina publică `#/act/:token` capătă „Accept oferta" (nume tastat + data + IP + amprenta
actului, ca la ofertele de angajare din VectorB2B); acceptarea marchează actul „semnat" și
declanșează D05. E-mailul trimite linkul, nu doar atașamentul.

### CRM-D07 — Șablonul din Word-ul tău (lecția nr. 1 din VectorB2B)
„Încarcă un .docx" → textul intră în editorul de șabloane, iar AI-ul propune câmpurile
(`{{contraparte.denumire}}`, `{{total.suma}}`…) pe golurile găsite; omul confirmă cu comutatoare.
Refolosește `captureExtractor`/AI-ul existent și editorul TipTap.

### CRM-D08 — Word adevărat (.docx)
Azi „Descarcă pentru Word" dă HTML salvat ca `.doc`. Un .docx real (biblioteca `docx`), cu
același stil modern/clasic.

### Mai mici
- Oferta → contract: „Transformă în contract" pe o ofertă acceptată alege șablonul „Contract în
  baza ofertei acceptate" și completează `document.baza` cu numărul ofertei.
- Pagina CRM › Documente: buton „Act nou", clientul ca link spre lead, Semnat/Refuzat și acolo.
- Fișa firmei (G04) și cartonașul din pipeline: „Act nou" direct de acolo.
