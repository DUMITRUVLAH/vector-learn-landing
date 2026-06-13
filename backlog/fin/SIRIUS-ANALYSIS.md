# sirius.expert — analiză detaliată (referință prioritară #2)

> **Sursă:** https://sirius.expert (+ subdomenii). Fondator: **Traian Chivriga**. SaaS din
> Republica Moldova. Poziționare: *„Platforma pentru finanțele afacerii tale"* /
> *„Cel mai simplu și deștept tool pentru banii companiei tale"*. Slogan de valoare:
> **„Economisește 20 ore pe săptămână"**.
> **Metodă:** WebFetch (a mers, fără 403) + `curl` pe HTML (98KB) + extragere structurată.
> Data: 2026-06-13.

---

## 1. Sirius e o SUITĂ de 3 produse (nu unul singur)
Spre deosebire de contafirm (un singur produs cu 7 module), Sirius e un **ecosistem**:

| Produs | URL | Ce face |
|--------|-----|---------|
| **Sirius Expert** (core) | sirius.expert / md.sirius.expert | management financiar: facturi, plăți, bănci, multi-companie |
| **e-Factura** | sirius.expert/e-factura | emitere + semnare facturi electronice, conectare SFS |
| **SiriusB2B** | siriusb2b.md | **director public de firme MD** (274.000+ companii, transparență corporativă) |
| **SiriusConta** | siriusconta.md | **marketplace de contabili** (găsești firmă de contabilitate + calculator cost) |

> Observație strategică: Sirius nu face contabilitate el însuși — pentru contabilitate te trimite la
> **marketplace-ul SiriusConta** (firme de contabilitate listate). La fel ca contafirm, **se oprește
> înainte de contabilitatea propriu-zisă**, dar acoperă golul prin marketplace, nu prin software.

## 2. Sirius Expert (core) — cele 4 capabilități esențiale („Esențialul nostru")
1. **Toate băncile într-o aplicație** — sincronizare automată cu conturile bancare, agregare
   multi-bancă, upload extrase, status plăți în timp real.
2. **Plăți și încasări** — conturi de plată generate în secunde (logo, culori, detalii firmă),
   **link-uri de plată directe**, **plăți card/MIA „coming soon"**, multi-valută.
3. **Multi-companie & roluri multiple** — gestionezi mai multe firme, **acces pe roluri**,
   până la 20 utilizatori (tier maxim).
4. **Grafic lunar al performanței** — venituri/cheltuieli, **monitorizare TVA + prag de înregistrare
   TVA**, facturi neîncasate, sold cont, grafice automate, date în timp real.

## 3. Modulul Facturare / e-Factura (detaliat)
- Creezi facturi **branded în 3 limbi** (RO / RU / EN).
- **Facturi recurente** pentru clienți.
- **Notificări în timp real** când factura e plătită.
- **Semnezi factura direct în cont** (semnătură electronică integrată).
- **Conturi de plată** pentru documente emise ȘI primite; **converti documente în conturi de plată**.
- Multi-valută. **Conectare e-Factura (SFS)** pe toate planurile plătite.

## 4. Tranzacții & reconciliere
- Sincronizare automată cu băncile, status plăți live, **marcare automată a facturii la încasare**,
  agregare multi-cont, upload extrase. (Reconcilierea = automată pe sincronizare bancară, nu manuală.)

## 5. Pricing (transparent, 4 tiere — model freemium)
| Plan | Cost | Limite |
|------|------|--------|
| Smart Start | Gratuit | 15 conturi de plată, 1 user, 30 contacte |
| French Studio | €9/lună +TVA | 100 conturi, 2 useri, 300 contacte, **e-Factura** |
| Middle-Class Fancy | €25/lună +TVA | 350 conturi, 10 useri, 1000 contacte |
| Penthouse View | €59/lună +TVA | 1000 conturi, 20 useri, contacte nelimitate |
> Anual: **−20%**. Numele de planuri sunt creative (nu „Basic/Pro/Enterprise").

## 6. SiriusConta — marketplace de contabili (model interesant)
- **Calculator de cost** (<1 min) pentru serviciile de contabilitate.
- Filtrare după **locație, industrie, servicii, limbi, formă juridică**.
- Servicii listate de firme: contabilitate primară, **salarizare, raportare financiară, depunere
  declarații fiscale, consultanță fiscală, înregistrare/lichidare firme, audit extern, asistență
  start-up, accesare finanțări**.
- Industrii: agricultură, asigurări, construcții, e-commerce, educație, energetică, IT, medicină,
  producție, retail, turism/HoReCa.

## 7. SiriusB2B — director public de firme
- *„Găsește orice firmă. Instant."* — 274.000+ companii, ~3.000 rezidenți MITP, 1.643 clienți Sirius.
- Date din registre de stat + rapoarte: fondatori, contact, venituri, domeniu. Fără reclame.
- **Echivalent direct cu `/catalog-firme` de la contafirm** — ambele au director SEO de firme MD
  ca motor de achiziție/lead-gen.

## 8. Diferențe cheie Sirius vs contafirm
| Dimensiune | Sirius | contafirm |
|------------|--------|-----------|
| Arhitectură | suită de 3 produse + marketplace | un produs, 7 module |
| Punct forte | **sincronizare bancară automată** (toate băncile), semnătură e-factură | **flux conectat contract→factură**, CRM financiar |
| Contabilitate reală | nu (→ marketplace SiriusConta) | nu (→ „înainte de contabilitate") |
| Pricing | transparent, 4 tiere freemium | „gratuit în lansare" |
| AI | nu (zero mențiuni) | nu (zero mențiuni) |
| Director firme | SiriusB2B | /catalog-firme |
| Maturitate | mai matur (founder, testimoniale, MIA, multi-limbă) | mai nou, design mai modern |

## 9. Ce le lipsește AMBELOR (oportunitatea FinDesk — confirmată pe 2 concurenți)
- ❌ **AI** (OCR pe documente, categorizare automată, narativ CFO) — **niciunul** nu are. Cel mai
  mare diferențiator posibil pentru noi.
- ❌ **Contabilitate reală** (GL, declarații, salarii, mijloace fixe) — ambii se opresc înainte.
- ❌ **Generare bulk** de documente.
- ✓ Ce au și noi trebuie să avem la paritate: **sincronizare/import bancar + reconciliere**,
  **facturi recurente din contracte**, **e-Factura SFS**, **multi-companie + roluri**, **multi-valută**,
  **semnătură pe factură**, **link-uri de plată**, **director public de firme MD** (SEO/lead-gen).

## 10. Puncte tari de adoptat de la Sirius
1. **Sincronizare bancară automată „toate băncile"** + marcare automată factură la încasare (mai
   puternic decât upload manual de extras).
2. **Link-uri de plată + plată card/MIA** (încasezi online direct din factură).
3. **Semnătură electronică pe factură**, direct în aplicație.
4. **Multi-limbă (RO/RU/EN)** pe documente — relevant în Moldova.
5. **Pricing freemium transparent** cu tiere clare (vs „gratuit nedefinit").
6. **Prag de înregistrare TVA monitorizat** — alertă utilă pentru firme mici.
7. **Marketplace de contabili / director de firme** ca extensie de ecosistem (long-term).
