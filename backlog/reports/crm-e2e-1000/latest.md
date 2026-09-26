# CRM e2e — 2530 scenarii

Rulat: 2026-09-26T11:22:39.767Z · țintă http://localhost:3150 · 13.5s · **2456 trec, 74 pică**

| Grup | Trec | Pică |
|---|---:|---:|
| acte:oferte | 27 | 0 |
| acte:profil | 14 | 0 |
| auto:crud | 44 | 0 |
| auto:declanșare | 40 | 0 |
| auto:etape | 15 | 2 |
| auto:scenarii | 20 | 0 |
| cadente:reactivare | 21 | 2 |
| cadente:secvențe | 38 | 2 |
| captare:formular | 45 | 5 |
| echipa:acces | 21 | 0 |
| echipa:invitații | 26 | 0 |
| echipa:jurnal | 16 | 0 |
| echipa:roluri | 23 | 1 |
| echipa:sănătate | 8 | 0 |
| firme:crud | 32 | 0 |
| firme:fisa | 22 | 0 |
| firme:import | 30 | 1 |
| firme:unificare | 24 | 4 |
| import:leaduri | 37 | 5 |
| import:mapari | 14 | 0 |
| leads:bulk | 22 | 2 |
| leads:crud | 35 | 8 |
| leads:etape | 31 | 1 |
| leads:export | 18 | 1 |
| leads:gdpr | 24 | 2 |
| leads:interactiuni | 23 | 1 |
| leads:izolare | 12 | 2 |
| leads:lista | 34 | 4 |
| leads:persoana | 11 | 0 |
| leads:tabla | 14 | 0 |
| leads:workspace-nou | 2 | 4 |
| matrix:anon | 152 | 0 |
| matrix:catalog | 1 | 0 |
| matrix:corp-stricat | 498 | 0 |
| matrix:id-inexistent | 118 | 0 |
| matrix:id-invalid | 177 | 0 |
| matrix:izolare | 92 | 0 |
| matrix:rol-agent | 48 | 0 |
| matrix:valori-ostile | 95 | 0 |
| proces:etape | 42 | 3 |
| proces:pâlnii | 41 | 0 |
| produse:catalog | 25 | 3 |
| produse:stoc | 42 | 3 |
| rapoarte:cifre | 48 | 3 |
| rapoarte:norme | 28 | 0 |
| repartizare:loturi | 36 | 2 |
| repartizare:reguli | 44 | 0 |
| satelite:campuri | 34 | 2 |
| satelite:comunicare | 29 | 0 |
| satelite:contacte | 22 | 0 |
| satelite:etichete | 22 | 1 |
| satelite:fisiere | 18 | 0 |
| satelite:motive | 24 | 2 |
| satelite:taskuri | 55 | 8 |
| satelite:vederi | 22 | 0 |

## Ce pică

- **[auto:etape]** o automatizare nu mută leadul într-o etapă care nu e în pâlnia lui — leadul din pâlnia implicită a ajuns în etapa „negotiation”, care nu există în pâlnia lui (new,contacted,trial,paid,lost) — e invizibil pe tablă
- **[auto:etape]** „atribuie după regulă” la schimbarea etapei chiar atribuie leadul — leadul nu a fost atribuit la mutare (responsabil null); jurnal: [{"action":"assign","detail":"atribuirea n-a putut fi făcută"}]
- **[cadente:reactivare]** „înscrie în cadență” fără cadență aleasă e refuzată (n-ar putea rula niciodată) — input greșit acceptat: HTTP 201 {"id":"402e8da6-42a8-4ad4-958f-7717db9549a2","tenantId":"47839ad7-5bd9-4460-81ba-8a976f64453c","name":"FărăCadență muiavotf","enabled":true,"afterMonths":2,"los
- **[cadente:reactivare]** nici prin editare nu se poate lega o cadență din alt workspace — editarea a acceptat cadența altui client (HTTP 200, cadenceId=8bcfaac2-7602-4b63-aaf7-f3caa979cd2f)
- **[cadente:secvențe]** a doua înscriere manuală în aceeași cadență activă nu dublează urmărirea — leadul are 2 înscrieri active în aceeași cadență — pașii s-ar aprinde de două ori
- **[cadente:secvențe]** o cadență oprită nu mai aprinde pașii înscrierilor existente — cadența oprită (comutatorul „Pornit/oprit”) a aprins totuși un pas
- **[captare:formular]** leadul captat într-un workspace nou poate fi mutat imediat pe tablă — leadul venit de pe site nu se poate muta (etapele pâlniei n-au fost create la captare): așteptat 200, primit HTTP 400 {"error":"unknown_stage"}
- **[captare:formular]** formular legat de pâlnia SPANCO → leadul intră pe prima ei etapă — leadul a intrat în etapa „new”, care nu există în SPANCO (prima e „suspect”) — e invizibil pe tablă
- **[captare:formular]** un formular nu poate fi legat de pâlnia altui client — formularul a acceptat pâlnia altui workspace: input greșit acceptat: HTTP 201 {"id":"a8fc9800-bcf5-4f64-a305-26397a7af00a","tenantId":"f8257384-472c-4b02-a137-82e21394b2e0","name":"Furt de pâlnie muiavotf","token":"aovAMg4d9jr650adaXZZ-xY
- **[captare:formular]** nici prin editare nu se poate lega pâlnia altui client — editarea a acceptat pâlnia altui workspace: input greșit acceptat: HTTP 200 {"id":"a9fd57ba-e237-434e-8a27-44fbbbb5c18b","tenantId":"f8257384-472c-4b02-a137-82e21394b2e0","name":"Newsletter muiavotf","token":"aRLYPvMun9DkaoSmk_rcKazgv9e
- **[captare:formular]** clientul care retrimite formularul își oprește cadența de urmărire — clientul a răspuns prin formular, dar cadența a rămas „active” — agentul va primi „sună, nu răspunde”
- **[echipa:roluri]** schimbarea de drept apare în jurnal ca permission.changed pe utilizator — ținta e un om, dar jurnalul o trece ca „crm_lead” — filtrul pe targetType=crm_user n-o găsește
- **[firme:import]** numărul rândului cu eroare e cel din fișier, și după un rând gol — rândul raportat 3, în fișier e 4
- **[firme:unificare]** previzualizarea cu principalul printre duplicate e refuzată — input greșit acceptat: HTTP 200 {"plan":{"primaryId":"05a47d31-4d49-4207-848d-aacc9c05701d","duplicateIds":["05a47d31-4d49-4207-848d-aacc9c05701d"],"fields":[{"field":"fullName","keep":"primar
- **[firme:unificare]** duplicatul unificat dispare din lista de leaduri — duplicatul unificat e încă în lista de leaduri (se poate lucra pe el în paralel)
- **[firme:unificare]** duplicatul unificat dispare de pe tabla kanban — duplicatul unificat e încă un card pe tablă
- **[firme:unificare]** după unificare, leadurile firmei nu mai includ duplicatul — duplicatul unificat e încă listat la firmă (2 leaduri, fișa spune 1)
- **[import:leaduri]** rândurile goale din mijloc nu sunt numărate ca erori — counts {"total":4,"valid":2,"errors":2,"duplicatesInFile":0,"duplicatesInDb":0,"importableNew":2,"importableAll":2} — un rând gol a devenit „Lipsește numele”
- **[import:leaduri]** emailul greșit e semnalat la previzualizare — adresa „ion@@gmail” trece fără nicio semnalare (POST /leads ar refuza-o)
- **[import:leaduri]** aceeași firmă cu și fără IDNO în același fișier → o singură fișă — 2 fișe pentru „Sigma Construct muiavotf SRL”
- **[import:leaduri]** registru Excel (.xlsx) cu leaduri se previzualizează — previzualizare {"headers":["UEsDBAoAAAAIANBaOl2R28AJWQEAAPAEAAATAAAAW0NvbnRlbnRfVHlwZXNdLnhtbK2UTW7CMBCF9z1F5C1KDF1UVUXCorTLFqn0ANN4Qiwc2/KYv9t3EiiqKiCqYBMrmTfve57EGU+2jUnWGEg7m4tRNhQJ2tIpbRe5+Jy/po8ioQhWgXEWc7FDEpP
- **[import:leaduri]** registru Excel (.xlsx) cu leaduri se importă — created 0
- **[leads:bulk]** atribuire în masă către un om din alt workspace → refuzată — leadul a fost dat unui om din alt client (HTTP 200)
- **[leads:bulk]** atribuire în masă către un uuid inexistent → 4xx, nu 500 — eroare de server pe input greșit: HTTP 500 {"error":"internal_error"}
- **[leads:crud]** numele doar din spații este refuzat — nume gol din spații: așteptat 400, primit HTTP 201 {"id":"b2022706-32ae-4753-b277-1387ed3e0b7a","tenantId":"3b8285bd-4d4f-432f-9035-4ff3a5842b36","fullName":" ","fullNameNormalized":null,"phone":null,"phoneNorma
- **[leads:crud]** numele de 201 caractere → 400, nu 500 — nume prea lung: așteptat 400, primit HTTP 500 {"error":"internal_error"}
- **[leads:crud]** valoarea peste limita coloanei (30 mil. lei în cenți) → 400, nu 500 — valoare peste int32: așteptat 400, primit HTTP 500 {"error":"internal_error"}
- **[leads:crud]** responsabil = uuid care nu e niciun utilizator → 4xx, nu 500 — responsabil inexistent: eroare de server pe input greșit: HTTP 500 {"error":"internal_error"}
- **[leads:crud]** responsabil dintr-un alt workspace este refuzat — responsabil din alt client: input greșit acceptat: HTTP 201 {"id":"68b1144f-0b46-4ff5-96d8-176ead5721c4","tenantId":"3b8285bd-4d4f-432f-9035-4ff3a5842b36","fullName":"INVALID-muiavotf resp străin","fullNameNormalized":nu
- **[leads:crud]** creare cu etapă inexistentă → refuzată (altfel leadul dispare de pe tablă) — etapă necunoscută la creare: așteptat 400, primit HTTP 201 {"id":"1a1a0377-becd-4867-8a8e-ad9fe260a966","tenantId":"3b8285bd-4d4f-432f-9035-4ff3a5842b36","fullName":"INVALID-muiavotf etapă fantomă","fullNameNormalized":
- **[leads:crud]** PATCH generic nu poate marca „pierdut” fără motiv (ocolind regula de pe /stage) — leadul a ajuns „pierdut” fără motiv prin PATCH generic (HTTP 200)
- **[leads:crud]** PATCH generic cu etapă inexistentă → refuzat, etapa rămâne — leadul are acum etapa orfană „nu-exista” (HTTP 200)
- **[leads:etape]** fișa unui lead SPANCO „lost” arată etapa pâlniei LUI („Lost”), nu a celei implicite — etapa: {"id":"2ea24cd9-b069-4433-9993-2b18872c7aed","tenantId":"60439a83-7920-40ec-b34e-0374762b64ab","pipelineId":"ab81900e-ea0b-41bf-8083-42f29f81d767","key":"lost","label":"Pierdut","color":"rose","orderIndex":4,"isWon":fals
- **[leads:export]** o formulă în nume („=HYPERLINK…”) nu iese executabilă în Excel — celula începe cu formulă: =HYPERLINK("http://evil.invalid";"Deschide")
- **[leads:gdpr]** a doua retragere păstrează data primei retrageri (dovada cererii) — data s-a rescris: 2026-09-26T11:22:28.547Z → 2026-09-26T11:22:28.686Z
- **[leads:gdpr]** jurnalul de audit nu mai păstrează numele sau emailul persoanei anonimizate — jurnalul păstrează PII: ["crm.gdpr.anonymized","crm.lead.created"]
- **[leads:interactiuni]** o „schimbare de etapă” nu se poate falsifica manual în cronologie — stage_change manual: input greșit acceptat: HTTP 201 {"id":"2f8f909f-b516-4157-adc5-5fe1b8b58d1b","tenantId":"7f6308c2-faad-4a95-aa9d-90d0da72bb66","leadId":"706d05e4-ee78-4707-8c18-0620e1cc941a","type":"stage_cha
- **[leads:izolare]** lead creat de A cu produsul lui B → refuzat — productId din alt client: input greșit acceptat: HTTP 201 {"id":"627ec3fe-f90b-42a0-8f21-9e38e0fd233b","tenantId":"4449481f-66c6-4db2-adaf-3f1de020ba59","fullName":"Produs Străin muiavotf","fullNameNormalized":null,"ph
- **[leads:izolare]** leadul lui A nu poate fi atribuit unui om din B (PATCH) — leadul lui A e atribuit unui om din B (HTTP 200)
- **[leads:lista]** căutare fără diacritice „Stefan Turcanu” găsește „Ștefan Țurcanu” — negăsit fără diacritice
- **[leads:lista]** căutare după telefon în alt format („069123456”) găsește același om — negăsit după telefonul normalizat
- **[leads:lista]** căutarea „%” găsește doar leadul care conține „%”, nu toată baza — „%” e tratat ca wildcard: 25 rezultate
- **[leads:lista]** căutarea „_” nu se comportă ca wildcard — „_” a potrivit 25 leaduri fără underscore
- **[leads:workspace-nou]** primul lead se poate muta în „contacted” fără să fi deschis tabla — PATCH /stage într-un workspace nou: așteptat 200, primit HTTP 400 {"error":"unknown_stage"}
- **[leads:workspace-nou]** fișa primului lead arată eticheta etapei, nu null — etapa din fișă: null
- **[leads:workspace-nou]** mutarea în masă a primului lead funcționează fără tabla deschisă — răspuns: {"updated":0,"skipped":[{"leadId":"cedad038-8e2d-4b9f-b04d-740ad2db81fb","reason":"unknown_stage"}]}
- **[leads:workspace-nou]** mutarea primului lead în pâlnia implicită nu dă „pipeline_has_no_stages” — așteptat 200, primit HTTP 409 {"error":"pipeline_has_no_stages"}
- **[proces:etape]** eticheta de 101+ caractere → 400 (nu 500), la creare și la redenumire — creare: eroare de server pe input greșit: HTTP 500 {"error":"internal_error"}
- **[proces:etape]** prima etapă adăugată într-un workspace nou nu înlocuiește cele 5 implicite — etapele după prima adăugare (fără ele: fără „Client”, fără „Pierdut”, iar leadurile noi intră direct pe „Ofertă trimisă”): așteptat ["new","contacted","trial","paid","lost","oferta_trimisa"], primit ["oferta_trimisa"]
- **[proces:etape]** primul lead dintr-un workspace nou se poate muta pe etape — leadul creat înainte de deschiderea tablei (stage=new) nu se poate muta: 400 {"error":"unknown_stage"}
- **[produse:catalog]** TVA de 250% e refuzat — input greșit acceptat: HTTP 201 {"id":"f947da1a-8fc0-4c0a-a402-033edcef44d3","tenantId":"3f17c693-8183-4196-993f-5b40cafe49c4","sku":null,"name":"TVA absurd muiavotf","category":null,"descript
- **[produse:catalog]** leadul nu poate primi produsul altui workspace — input greșit acceptat: HTTP 201 {"id":"79462ec7-288b-4f88-bf5c-424e29d4de99","tenantId":"3f17c693-8183-4196-993f-5b40cafe49c4","fullName":"Lead cu produs străin muiavotf","fullNameNormalized":
- **[produse:catalog]** leadul nu poate primi un produs inexistent — eroare de server pe input greșit: HTTP 500 {"error":"internal_error"}
- **[produse:stoc]** într-un workspace nou, primul lead creat se poate muta în altă etapă — mutarea primului lead: așteptat 2xx, primit HTTP 400 {"error":"unknown_stage"}
- **[produse:stoc]** schimb cantitatea după câștig: la retragere revine exact ce s-a scăzut — după retragere stocul e 7, trebuia 5 (s-au scăzut 2, nu 4)
- **[produse:stoc]** leadul creat direct în „câștigat” scade stocul — stoc 7, înainte 7
- **[rapoarte:cifre]** un „stage_change” scris de mână în istoric nu umflă contractele — un rând de istoric falsificat a transformat L5 (încă „new”) în contract semnat: 2 → 3 (POST interactions a răspuns 201)
- **[rapoarte:cifre]** agentul (fără reports.view_team) nu vede cifrele colegilor — agentul B vede cifrele lui A: [{"owner":"1f7e2d36-8000-4a91-b99a-81fec4a41373","won":120000},{"owner":"1f7e2d36-8000-4a91-b99a-81fec4a41373","won":120000}]
- **[rapoarte:cifre]** pâlnia unui lead pierdut direct din prima etapă îl numără la prima etapă — leadul a stat în „Lead nou” și a căzut de acolo (tranziția new→lost există), dar pâlnia spune reached=0 dropped=0
- **[repartizare:loturi]** rezerva numără doar contactele deschise nerepartizate — rezerva arată 11, dar repartizarea are 10 disponibile — clientul pierdut e numărat în rezervă
- **[repartizare:loturi]** agentul nu poate schimba regula care îi ia contactele (403) — așteptat 403, primit HTTP 200 {"enabled":false,"days":365}
- **[satelite:campuri]** câmp numeric: text („mult”) e refuzat, valoarea veche rămâne — text într-un câmp numeric: input greșit acceptat: HTTP 200 {"id":"a1946acf-0ffd-40aa-ab7c-e69b9af046fc","tenantId":"7c7d2357-882a-4555-8124-1ec02d579ce6","leadId":"ba1ad8e3-c467-4f27-8a96-83d41da0f4f6","fieldId":"b1b048
- **[satelite:campuri]** câmp select: o valoare din afara listei e refuzată — opțiune inexistentă într-un select: input greșit acceptat: HTTP 200 {"id":"e34c27de-b7bc-4f34-a26f-8577de92551d","tenantId":"7c7d2357-882a-4555-8124-1ec02d579ce6","leadId":"ba1ad8e3-c467-4f27-8a96-83d41da0f4f6","fieldId":"362c29
- **[satelite:etichete]** eticheta doar din spații e refuzată (nu se salvează o etichetă goală) — etichetă goală după curățare: input greșit acceptat: HTTP 201 {"id":"8112b089-e393-4a8d-9d29-7791c1d221ba","tenantId":"a0054e39-f03d-4f01-b015-bdf2b7410cda","leadId":"ed80601c-3709-4a61-8dff-84e66efb9a2b","tag":"","created
- **[satelite:motive]** workspace nou: mutarea leadului merge și fără să fi deschis tabla — prima mutare într-un workspace nou: așteptat 2xx, primit HTTP 400 {"error":"unknown_stage"}
- **[satelite:motive]** motiv doar din spații e refuzat — motiv gol: input greșit acceptat: HTTP 201 {"id":"79dda759-fd87-4597-9eb1-de1751ee8f6f","tenantId":"8f796353-0aba-49cc-9166-bf38b251de20","label":" ","orderIndex":7,"createdAt":"2026-09-26T11:22:30.312Z"
- **[satelite:taskuri]** creare cu titlu doar din spații e refuzată — titlu gol după curățare: input greșit acceptat: HTTP 201 {"id":"8c5d2323-2433-4036-99ab-2a69e4055533","tenantId":"6d747d95-1812-4080-bc22-02174d822daa","leadId":"5c2a5cf0-4cf5-48e1-b98c-7e8c691bb765","title":"","dueAt
- **[satelite:taskuri]** task alocat unui om din alt workspace e refuzat — responsabil din alt workspace: input greșit acceptat: HTTP 201 {"id":"e4053db4-534b-4850-ac05-3a4973d58855","tenantId":"6d747d95-1812-4080-bc22-02174d822daa","leadId":"5c2a5cf0-4cf5-48e1-b98c-7e8c691bb765","title":"Străin",
- **[satelite:taskuri]** task alocat unui utilizator inexistent → eroare de client, nu 500 — responsabil inexistent: eroare de server pe input greșit: HTTP 500 {"error":"internal_error"}
- **[satelite:taskuri]** adăugarea orei pe un task „toată ziua” (doar dueHasTime) persistă — dueHasTime=false: ora cerută pe un task care ARE dată s-a pierdut
- **[satelite:taskuri]** încheierea lasă o urmă „system” în istoricul leadului (T-CRM-107-3) — nicio interacțiune system după încheierea taskului; tipuri: (niciuna)
- **[satelite:taskuri]** taskul amânat rămâne în clopoțel, cu scadența nouă — taskul amânat a dispărut din clopoțel (status „snoozed” e filtrat afară) — nu mai revine niciodată
- **[satelite:taskuri]** leadul cu un task amânat nu e „fără pas următor” — leadul cu task amânat apare ca „fără pas următor”
- **[satelite:taskuri]** „azi”: taskul „toată ziua” scadent AZI nu e restant (CRM-U04) — taskul „toată ziua” de azi (2026-09-26T09:00:00.000Z) e listat ca RESTANT la /today — ziua lui nu s-a terminat
