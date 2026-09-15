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
| 1 | Import masiv Excel/CSV, mapare configurabilă | **Da** | CSV, TSV, text lipit ȘI `.xlsx`/`.xls`, cu previzualizare înainte de scriere și mapări salvate per workspace. Registrul se citește pe server (`exceljs`, dependință deja existentă — nu SheetJS, care are istoric de CVE-uri); browserul nu parsează Excel, ca să nu plătească toată lumea 800 KB de bibliotecă pentru o funcție lunară. |
| 2 | Introducere manuală cu validare | **Da** | Numele minim 2 caractere, emailul validat, restul opțional — un formular care cere zece câmpuri la primul contact nu se completează. |
| 3 | Identificarea și eliminarea duplicatelor | **Da** | Scor pe telefon/email/nume normalizate, cu motivele potrivirii afișate; unificare fără pierdere de istoric. |
| 4 | Segmentare (industrie, regiune, mărime, consum, produs, sursă) | **Da** | Bara „Segmentare" de pe tabla de leaduri filtrează după industrie, regiune, mărime și consum anual (prin firma leadului), plus produs din catalog și sursă. Aceleași filtre în kanban și în listă, cernute PE SERVER — numărătorile pe coloană descriu segmentul, nu pâlnia întreagă. Opțiunile sunt valorile care chiar există în baza workspace-ului, nu un nomenclator impus. Segmentul se salvează într-o vizualizare. Leadul fără firmă atașată nu intră în filtrele firmografice (e scris explicit sub bară). |
| 5 | Repartizare automată pe reguli (round-robin, teritoriu, capacitate) | **Da** | Cinci strategii: round-robin, teritoriu, capacitate, ponderat, fix — cu capacitate zilnică și pondere per agent. Se pot aplica și pe o selecție întreagă („Repartizează după reguli"), rând pe rând ca round-robin-ul să rămână corect; leadurile care au deja responsabil sunt sărite, explicit, nu rescrise. |
| 6 | Repartizare manuală | **Da** | Din fișa leadului ȘI în masă, din vederea listă: bifezi leadurile (max o pagină, 100) și schimbi responsabilul, muți în etapă sau adaugi etichetă dintr-o singură acțiune. Regulile rămân aceleași ca pe un lead singur — etapa trebuie să existe în pâlnia leadului, „pierdut" cere motiv — iar răspunsul spune ce NU s-a putut face și de ce. |
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
| 18 | Notificări automate pentru task-uri restante (in-app, e-mail) | **Da** | In-app: clopoțel cu insignă. Pe e-mail: digest zilnic la 08:00 local, cu taskurile restante ale fiecărui agent. Fereastra orară se decide în cod (cronul lovește în UTC), iar un digest deja trimis îl oprește pe al doilea — oricâte ori ar rula. |
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
| 42 | Urmărire: transmisă, vizualizată, acceptată, respinsă | **Parțial** | Transmisă (se scrie singură la trimiterea pe e-mail), acceptată și respinsă (se marchează din fișa leadului, cu motiv obligatoriu la refuz) — da. „Vizualizată" rămâne descoperită: cere pixel de urmărire sau portal de client (portalul există pentru facturi; extinderea la oferte e ~2 zile). |

## 4.8 Generarea contractelor

| Nr. | Cerință | Conform | Observații |
|---|---|---|---|
| 43 | Generare din șablon aprobat, cu datele din CRM | **Da** | Același motor ca ofertele. |
| 44 | Versionare (istoricul variantelor) | **Da** | Versiuni de șablon + înghețarea rechizitelor la finalizare. |
| 45 | Flux: Draft → Aprobare → Transmis → Semnat → Respins | **Parțial** | Ciornă → Finalizat → **Trimis → Semnat / Refuzat** → (Anulat). „Trimis" se scrie singur când pleacă e-mailul — singurul semnal adevărat; „Semnat"/„Refuzat" le marchează omul care a vorbit cu clientul. Pasul intern „Aprobare" rămâne descoperit ca stare a actului: aprobările trăiesc în modulul PAR, cu flux multi-nivel, iar un act se poate trimite acolo (`/documents/:id/to-par`). Un al doilea mecanism de aprobare, mai slab, ar concura cu el. |
| 46 | Notificări la schimbarea statusului | **Da** | Cine a făcut actul primește notificare in-app când clientul semnează sau refuză, chiar dacă răspunsul l-a primit altcineva. Fiecare schimbare lasă și urmă în jurnalul actului. |

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
| 58 | Export Excel și PDF | **Da** | Rapoartele: CSV pentru Excel (separator `;` + BOM, cum îl cere Excel-ul în română) și PDF cu perioada și agentul în antet. Baza de leaduri: „Exportă CSV" de pe tabla de leaduri scoate EXACT ce trece de filtrele de pe ecran (inclusiv segmentul firmografic), cu industria/regiunea/mărimea/consumul firmei în fișier. Cere dreptul `leads.export`, se scrie în jurnal (cine, câte rânduri, cu ce filtru) și duce cu el starea consimțământului — un lead cu consimțământul retras pleacă marcat „RETRAS", nu curat. Plafon 10.000 de rânduri per fișier, anunțat, nu tăiat în tăcere. |

## 4.11 Roluri și securitate

| Nr. | Cerință | Conform | Observații |
|---|---|---|---|
| 59 | Minimum 4 niveluri de acces | **Parțial** | Există patru roluri reale (administrator, manager, agent, recepție) peste care stă matricea CRM. Denumirile din caiet (Director Comercial, Team Leader, Sales Manager) se pot mapa 1:1, dar azi rolul „Team Leader" nu are o arie proprie de echipă — vede tot workspace-ul. |
| 60 | Drepturi diferențiate, configurabile per rol/utilizator | **Da** | 14 drepturi, verificate pe server la fiecare cerere. Rolul dă temelia (rămâne cod: așa un rol nou nu primește din greșeală drepturi), iar excepțiile se scriu pe OM, din ecranul „Drepturi": acordat anume, sau retras deși rolul îl are. Un drept retras se aplică imediat — verificarea nu e memorată. |
| 61 | Jurnalizare (audit log) | **Da** | Leaduri, pâlnii, etape, cadențe, reguli, câmpuri — cu cine, când și ce s-a schimbat. Inclusiv acțiunile în masă și exportul bazei (cu numărul de rânduri și filtrul folosit): o bază de clienți care pleacă pe un stick e un eveniment, nu o descărcare oarecare. |
| 62 | Backup periodic, cu restaurare | **Parțial** | Asigurat de furnizorul de bază de date (backup zilnic, restaurare punctuală). Nu e o funcție a aplicației; se documentează în oferta tehnică. |
| 63 | Conformitate GDPR / legislația RM | **Da** | Pe fișa leadului: export JSON al tuturor datelor (acces + portabilitate), retragerea consimțământului (nu șterge nimic — e alt drept) și ștergerea datelor personale prin anonimizare. Anonimizarea scoate numele, telefonul, emailul, notele și contactele, dar păstrează valoarea, etapa și motivul pierderii: sunt fapte ale firmei, nu date ale persoanei — altfel rapoartele de anul trecut s-ar schimba retroactiv. |

## 4.12 Integrări și API

| Nr. | Cerință | Conform | Observații |
|---|---|---|---|
| 64 | API documentat (REST) | **Parțial** | API REST complet pentru tot ce face interfața, dar fără documentație publică și fără chei de acces pentru terți. ~3 zile pentru chei + OpenAPI. |
| 65 | Telefonie/Virtual PBX | **Nu** | Vezi 20. |
| 66 | E-mail | **Parțial** | Vezi 30. |
| 67 | WhatsApp/Viber | **Parțial** | Vezi 28–29. |
| 68 | Website și formulare de lead generation | **Da** | Endpoint public `/api/crm/intake/webform`, cu token per formular (nu per workspace: dacă un site e compromis, se stinge doar formularul lui), listă de domenii permise, limitare pe IP și consimțământ care expiră în 5 minute. Duplicatele adaugă o cerere pe leadul existent, nu un al doilea lead. Interfața dă codul gata de lipit în pagină, cu UTM-urile preluate din URL. |
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
| Da | 53 | 70% |
| Parțial | 16 | 21% |
| Nu | 7 | 9% |

Cele șapte „Nu" rămase sunt, toate, același lucru: **telefonia (20, 22, 23, 25, 65) și mesageria
(29)**. Nu sunt dezvoltare — sunt un CONTRACT cu un furnizor (centrală SIP, Viber Business).
Odată ales furnizorul, integrarea e muncă previzibilă, iar arhitectura o primește fără
reconstrucție (cerința 27 e deja „Da").

Recomandarea pentru MVP, în ordinea efectului asupra obiectivelor din caiet: (1) digestul de
taskuri restante pe e-mail (cerința 18), (2) telefonia, după alegerea centralei, (3) documentarea
publică a API-ului (cerința 64), care deblochează și conectorul BI.
