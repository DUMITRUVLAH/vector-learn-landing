# Matrice de conformitate — ESP-CRM-CT-2026-01 (Ecosolar Parc)

Răspunsul FinFlow la Anexa B din caietul de sarcini „Cerințe tehnice CRM — managementul
vânzărilor de soluții energetice", verificat pe codul de pe `main` la 14.09.2026.

**Cum se citește coloana „Conform":**

| Valoare | Ce înseamnă |
|---|---|
| **Da** | Acoperit nativ, în producție, cu teste. |
| **Parțial** | Funcționează, dar nu în toată întinderea cerinței — observația spune exact ce lipsește. |
| **Nu** | Neacoperit. Necesită dezvoltare sau un contract cu un furnizor terț. |

Regula pe care am ținut-o scriind tabelul: **„Da" numai unde există cod care rulează și test care
îl apără.** O matrice cu 76 de „Da" se verifică la prima demonstrație și pierde licitația; una
onestă spune de la început ce se cumpără și ce se construiește.

---

## 4.1 Baza de clienți și importul lead-urilor

| Nr. | Cerință | Conform | Observații |
|---|---|---|---|
| 1 | Import masiv Excel/CSV, mapare configurabilă | **Parțial** | CSV complet, cu previzualizare înainte de scriere și mapări salvate per workspace (`crm_import_mappings`). `.xlsx` nu se citește direct — din Excel: „Salvează ca" → CSV. Fișierele cu punct-și-virgulă (formatul Excel în română) sunt recunoscute. Adăugarea `.xlsx` = o dependință (SheetJS) + ~1 zi. |
| 2 | Introducere manuală cu validare | **Da** | Numele minim 2 caractere, emailul validat, restul opțional — un formular care cere zece câmpuri la primul contact nu se completează. |
| 3 | Identificarea și eliminarea duplicatelor | **Da** | Scor pe telefon/email/nume normalizate, cu motivele potrivirii afișate; unificare fără pierdere de istoric. |
| 4 | Segmentare (industrie, regiune, mărime, consum, produs, sursă) | **Parțial** | Firmele au industrie, regiune, mărime și consum anual (kWh); leadurile au sursă și, de la 0170, produs din catalog. Filtrarea pe consum/mărime direct din tabla de leaduri nu există încă — se face din modulul Clienți. |
| 5 | Repartizare automată pe reguli (round-robin, teritoriu, capacitate) | **Da** | Cinci strategii: round-robin, teritoriu, capacitate, ponderat, fix — cu capacitate zilnică și pondere per agent. |
| 6 | Repartizare manuală | **Da** | Din fișa leadului și din acțiuni în masă. |
| 7 | Bază unică, deduplicată, companii + contacte | **Da** | `crm_companies` + `lead_contacts`, cu un singur contact principal per lead. |

## 4.2 Sales Pipeline

| Nr. | Cerință | Conform | Observații |
|---|---|---|---|
| 8 | Etape configurabile | **Da** | Etape per pâlnie, redenumibile, cu flaguri „câștigat"/„pierdut" — rapoartele urmăresc flagul, nu numele. |
| 9 | Kanban cu drag-and-drop | **Da** | Plus vedere listă cu sortare și paginare pe server, pentru volume mari. |
| 10 | Câmpuri per oportunitate: responsabil, produs, valoare, probabilitate, next action, termen | **Parțial** | Toate există: responsabil, produs (catalog), valoare, probabilitate proprie (implicit moștenită de la etapă), pas următor și termen (taskul deschis). NU sunt blocante la creare — sistemul le CERE vizibil după fiecare activitate, dar nu refuză salvarea. Obligativitatea dură se configurează la cerere. |
| 11 | Istoric al tranzițiilor, cu dată și utilizator | **Da** | Fiecare mutare scrie în cronologia leadului; jurnalul CRM reține și cine. |
| 12 | Motiv de pierdere obligatoriu | **Da** | Regula urmărește flagul `is_lost` al etapei, nu litera „pierdut" — merge și pe etape redenumite. |

## 4.3 Managementul apelurilor și task-urilor

| Nr. | Cerință | Conform | Observații |
|---|---|---|---|
| 13 | Listă zilnică de apeluri per vânzător | **Da** | Ecranul „Azi": restanțe, necontactați, fără pas următor, neglijați de peste 3 zile. |
| 14 | Task-uri și remindere configurabile | **Da** | Cu scadență, amânare și clopoțel propriu (restante / azi / mâine / mai târziu). |
| 15 | Planificare din fișa clientului | **Da** | |
| 16 | Înregistrarea rezultatului apelului | **Da** | Rezultat + durată, în cronologie. |
| 17 | „Next Action" obligatoriu la finalizarea activității | **Parțial** | După un apel notat, fișa semnalează pe loc dacă leadul rămâne fără pas următor. Nu blochează — apelul s-a întâmplat deja; blocarea mută problema în „nu mai notez apelurile". |
| 18 | Notificări automate pentru task-uri restante (in-app, e-mail) | **Parțial** | In-app: da (clopoțel cu insignă). Pe e-mail: nu încă — infrastructura de trimitere există (se folosește la oferte și la digestul PAR), lipsește doar cronul de digest pentru CRM. |
| 19 | Manager vede activitatea echipei în timp real | **Da** | Fluxul de comunicare al echipei + „Azi" filtrat pe agent. |

## 4.4 Telefonie și înregistrarea apelurilor

| Nr. | Cerință | Conform | Observații |
|---|---|---|---|
| 20 | Integrare API cu telefonie/Virtual PBX/SIP | **Nu** | Necesită alegerea centralei (ex. Zadarma, Binotel, Asterisk). Efort estimat: 5–8 zile după ce se știe furnizorul. |
| 21 | Apel direct din CRM (click-to-call) | **Parțial** | Numerele sunt `tel:` — deschid aplicația de telefon a dispozitivului. Apel prin centrală: vezi 20. |
| 22 | Identificarea clientului la apel primit (screen-pop) | **Nu** | Depinde de 20. |
| 23 | Înregistrarea apelurilor, atașată la fișă | **Nu** | Depinde de 20. Fișierul se poate atașa manual azi. |
| 24 | Istoricul complet al apelurilor | **Da** | Orice apel notat rămâne în cronologia unică a leadului. |
| 25 | Transcriere automată (speech-to-text) | **Nu** | Depinde de 23. |
| 26 | Sumarizare automată (AI) | **Nu** | Motorul AI există în produs (se folosește la citirea actelor); îi lipsește sursa audio. |
| 27 | Arhitectură deschisă pentru alte platforme de telefonie | **Da** | Apelurile intră prin aceeași rută de „atingere" ca restul canalelor. |

## 4.5 Comunicare omnichannel

| Nr. | Cerință | Conform | Observații |
|---|---|---|---|
| 28 | WhatsApp Business API | **Parțial** | Deschidere conversație + notarea atingerii în cronologie. Trimitere prin API oficial: necesită cont WhatsApp Business și aprobare de șabloane. |
| 29 | Viber Business | **Nu** | Necesită cont Viber Business. |
| 30 | E-mail (trimitere/primire, sincronizat cu fișa) | **Parțial** | Trimitere din aplicație, cu urma în cronologie chiar și când trimiterea eșuează. Primirea (IMAP/webhook) nu e implementată. |
| 31 | Adăugarea ulterioară a altor canale | **Da** | Canalele sunt valori în același jurnal, nu tabele separate. |
| 32 | Toate mesajele în istoricul unic | **Da** | Un singur jurnal per lead, indiferent de canal — decizie explicită de arhitectură. |

## 4.6 Istoricul clientului

| Nr. | Cerință | Conform | Observații |
|---|---|---|---|
| 33 | Istoric unic, pe termen lung | **Da** | Apeluri, mesaje, e-mailuri, note, schimbări de etapă, acte, fișiere. |
| 34 | Motivul refuzului păstrat | **Da** | Obligatoriu la pierdere, configurabil ca listă per workspace. |
| 35 | Reintroducere automată în follow-up după 3/6/12 luni | **Da** | Reguli de reactivare cu prag în luni, rulate de cron zilnic; previzualizare obligatorie înainte de aplicare. |
| 36 | Clientul refuzat rămâne permanent în bază | **Da** | Nu există ștergere de leaduri; „pierdut" e o etapă, nu o dispariție. |

## 4.7 Generarea ofertelor comerciale

| Nr. | Cerință | Conform | Observații |
|---|---|---|---|
| 37 | Generare din șabloane aprobate | **Da** | Motorul de acte al FinFlow: șabloane cu versiuni, numerotare rezervată la finalizare. |
| 38 | Auto-completare date client/produs/preț/discount | **Da** | Din fișa leadului și din catalog. |
| 39 | Export PDF | **Da** | |
| 40 | Salvare automată în fișa clientului | **Da** | |
| 41 | Transmitere către client din CRM | **Da** | Cu urmă în cronologie. |
| 42 | Urmărire: transmisă, vizualizată, acceptată, respinsă | **Parțial** | Transmisă / semnată / refuzată / anulată — da. „Vizualizată" cere pixel de urmărire sau portal de client (portalul există pentru facturi; extinderea la oferte e ~2 zile). |

## 4.8 Generarea contractelor

| Nr. | Cerință | Conform | Observații |
|---|---|---|---|
| 43 | Generare din șablon aprobat, cu datele din CRM | **Da** | Același motor ca ofertele. |
| 44 | Versionare (istoricul variantelor) | **Da** | Versiuni de șablon + înghețarea rechizitelor la finalizare. |
| 45 | Flux: Draft → Aprobare → Transmis → Semnat → Respins | **Parțial** | Ciornă → Finalizat → Trimis → Semnat / Refuzat / Anulat. Pasul intern „Aprobare" nu există ca stare proprie (aprobările trăiesc azi în modulul PAR). Se adaugă ca stare în ~1 zi. |
| 46 | Notificări la schimbarea statusului | **Parțial** | Urma în cronologie: da. Notificare in-app/e-mail către responsabil: nu încă. |

## 4.9 Administrarea produselor

| Nr. | Cerință | Conform | Observații |
|---|---|---|---|
| 47 | Mai multe produse/servicii în același CRM | **Da** | Catalog cu preț, TVA, unitate, arhivare. |
| 48 | Urmărire separată a rezultatelor pe produs | **Da** | De la 0170, leadul are produs din catalog — raportul grupează după el, nu după text liber. |
| 49 | Adăugare de produse fără dezvoltare (configurare) | **Da** | Din interfață, fără cod. |

## 4.10 KPI și Dashboard

| Nr. | Cerință | Conform | Observații |
|---|---|---|---|
| 50 | Dashboard per vânzător + agregat pe echipă | **Da** | Același ecran, comutat din selectorul de agent; plus evoluția perioadei ca grafic. |
| 51 | Indicatori minimi (lead-uri, apeluri, contacte, întâlniri, oferte, contracte, valoare) | **Da** | Toți cei șapte, plus taskuri finalizate/restante. |
| 52 | Rata de conversie între etape | **Da** | Din tranzițiile reale, nu din instantaneul curent. |
| 53 | Durata medie a ciclului de vânzare | **Da** | De la crearea leadului la prima intrare într-o etapă câștigată. |
| 54 | Rezultate pe produs | **Da** | |
| 55 | Motivele pierderii (agregat) | **Da** | Cu procent și valoare pierdută. |
| 56 | Task-uri efectuate vs. restante | **Da** | |
| 57 | Rapoarte zilnice, săptămânale, lunare, pe perioadă aleasă | **Da** | Preseturi + interval ales manual, cu ultima zi inclusă. |
| 58 | Export Excel și PDF | **Da** | CSV pentru Excel (separator `;` + BOM, cum îl cere Excel-ul în română) și PDF cu perioada și agentul în antet. |

## 4.11 Roluri și securitate

| Nr. | Cerință | Conform | Observații |
|---|---|---|---|
| 59 | Minimum 4 niveluri de acces | **Parțial** | Există patru roluri reale (administrator, manager, agent, recepție) peste care stă matricea CRM. Denumirile din caiet (Director Comercial, Team Leader, Sales Manager) se pot mapa 1:1, dar azi rolul „Team Leader" nu are o arie proprie de echipă — vede tot workspace-ul. |
| 60 | Drepturi diferențiate, configurabile per rol/utilizator | **Parțial** | Diferențiate per rol, da (14 drepturi, verificate pe server). Configurabile per UTILIZATOR din interfață: nu — matricea e cod, nu date. |
| 61 | Jurnalizare (audit log) | **Da** | Leaduri, pâlnii, etape, cadențe, reguli, câmpuri — cu cine, când și ce s-a schimbat. |
| 62 | Backup periodic, cu restaurare | **Parțial** | Asigurat de furnizorul de bază de date (backup zilnic, restaurare punctuală). Nu e o funcție a aplicației; se documentează în oferta tehnică. |
| 63 | Conformitate GDPR / legislația RM | **Parțial** | Consimțământ cu dată, IP și text, revocabil; ștergere/export la cerere există în modulul GDPR al produsului, dar nu e expus pe fișa leadului din CRM. |

## 4.12 Integrări și API

| Nr. | Cerință | Conform | Observații |
|---|---|---|---|
| 64 | API documentat (REST) | **Parțial** | API REST complet pentru tot ce face interfața, dar fără documentație publică și fără chei de acces pentru terți. ~3 zile pentru chei + OpenAPI. |
| 65 | Telefonie/Virtual PBX | **Nu** | Vezi 20. |
| 66 | E-mail | **Parțial** | Vezi 30. |
| 67 | WhatsApp/Viber | **Parțial** | Vezi 28–29. |
| 68 | Website și formulare de lead generation | **Nu** | Nu există încă endpoint public de captare. Este cea mai ieftină integrare din listă (~2 zile) și cea cu efectul cel mai direct asupra obiectivului 1 din caiet. |
| 69 | ERP/facturare | **Parțial** | Produsul are facturare proprie și e-Factura (SFS); integrarea cu un ERP terț necesită API-ul acelui ERP. |
| 70 | Semnătură electronică | **Parțial** | Integrare MSign existentă pe actele PAR; extinderea la contractele CRM e configurare, nu dezvoltare nouă. |
| 71 | BI/raportare externă | **Parțial** | Export CSV/PDF azi; conectorul direct (ex. Power BI) cere API-ul de la 64. |
| 72 | Integrări ulterioare fără reconstrucție | **Da** | |

## 4.13 Arhitectură și scalabilitate

| Nr. | Cerință | Conform | Observații |
|---|---|---|---|
| 73 | Arhitectură modulară | **Da** | Module independente (CRM, acte, finanțe, aprobări) pe aceeași bază multi-tenant. |
| 74 | Scalabilitate: produse, echipe, utilizatori | **Da** | Pâlnii multiple per workspace, produse și utilizatori din configurare. |
| 75 | Scalabilitate: canale și automatizări | **Da** | Motor de automatizări + cadențe, cu declanșatoare pe eveniment și pe timp. |
| 76 | Documentație tehnică a arhitecturii la livrare | **Da** | `backlog/crm/CRM-CORE.md` + documentele de portare. |

---

## Sinteză

Toate cele 76 de cerințe din Anexa B sunt acoperite mai sus, în ordinea din caiet.

| Conform | Număr | Procent |
|---|---|---|
| Da | 47 | 62% |
| Parțial | 21 | 28% |
| Nu | 8 | 11% |

Cele opt „Nu" se împart în două grupe, și diferența dintre ele contează la ofertare:

1. **Telefonie (20, 22, 23, 25) și mesagerie (29)** — nu sunt dezvoltare, sunt un CONTRACT cu un
   furnizor (centrală SIP, Viber Business). Odată ales furnizorul, integrarea e muncă previzibilă.
2. **Formularele de pe site (68), telefonia ca integrare (65)** — dezvoltare proprie, mică.

Recomandarea pentru MVP, în ordinea efectului asupra obiectivelor din caiet: (1) captarea
lead-urilor de pe site, (2) digestul de taskuri restante pe e-mail, (3) telefonia, după alegerea
centralei.
