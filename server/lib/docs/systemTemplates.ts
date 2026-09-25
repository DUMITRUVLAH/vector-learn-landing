/**
 * DG-106 — biblioteca de șabloane livrate cu produsul.
 *
 * Rostul lor: organizația începe cu acte gata scrise în română, nu cu o pagină goală. Primul act
 * util iese în ziua instalării. Sunt marcate `is_system` — se folosesc și se clonează, dar nu se
 * editează și nu se șterg, ca nimeni să nu strice, în trei click-uri, formularea pe care se
 * sprijină toate actele viitoare.
 *
 * Câmpurile folosite sunt EXACT cele din catalogul editorului (src/lib/docs/fieldCatalog.ts), ca
 * un șablon standard să se completeze singur din registrul de furnizori. Un câmp fără sursă NU
 * ajunge pe hârtie ca `{{...}}`: `blanks.ts` îl tipărește ca rând de completat cu pixul, deci un
 * șablon poate cere liniștit date pe care sistemul nu le știe (numele administratorului, contul
 * bancar al părții noastre) — ies ca spații de completat, ca pe orice formular tipizat.
 *
 * **De ce sunt lungi.** Prima versiune avea 6–8 rânduri per act: părțile, o frază despre obiect și
 * semnăturile. Arătau a schiță, nu a act — un contract fără clauză de plată, de răspundere, de
 * confidențialitate sau de protecție a datelor nu poate fi dus la semnat, așa că omul îl rescria
 * în Word, adică exact ce trebuia să înlăture produsul. Textele de aici sunt scrise ca să poată fi
 * semnate ca atare: obiect, preț și termene de plată, obligațiile fiecărei părți, recepție,
 * răspundere cu penalități cifrate, forță majoră, confidențialitate, date cu caracter personal
 * (Legea nr. 133/2011), proprietate intelectuală, încetare, notificări, litigii.
 *
 * Ce NU fac: nu sunt consultanță juridică și nu acoperă orice situație. Sunt un punct de plecare
 * onest, pe dreptul Republicii Moldova, pe care juristul organizației îl ajustează o dată, nu la
 * fiecare act. Sumele de penalitate și termenele sunt cele uzuale în comerțul intern (0,1%/zi,
 * plafonat la valoarea contractului) și se pot schimba prin clonarea șablonului.
 */

export interface SystemTemplate {
  kind: string;
  name: string;
  category: string;
  bodyHtml: string;
}

/** Antetul de părți pentru actele de predare: cine predă și cine primește. */
const PARTIES_DELIVERY = `
<p><strong>{{noi.denumire}}</strong>, IDNO {{noi.idno}}, cu sediul în {{noi.adresa}}, reprezentată de {{noi.administrator}}, denumită în continuare <em>Predător</em>, pe de o parte, și</p>
<p><strong>{{contraparte.denumire}}</strong>, cod fiscal {{contraparte.idno}}, cu sediul în {{contraparte.adresa}}, cont IBAN {{contraparte.iban}}, deschis la {{contraparte.banca}} (cod bancar {{contraparte.bic}}), reprezentată de {{contraparte.administrator}}, denumită în continuare <em>Primitor</em>, pe de altă parte,</p>
`;

/** Antetul de părți pentru contracte: Prestator / Beneficiar. */
const PARTIES_CONTRACT = `
<p><strong>{{noi.denumire}}</strong>, IDNO {{noi.idno}}, cu sediul în {{noi.adresa}}, reprezentată de {{noi.administrator}}, care acționează în baza statutului, denumită în continuare <em>Prestator</em>, pe de o parte, și</p>
<p><strong>{{contraparte.denumire}}</strong>, cod fiscal {{contraparte.idno}}, cod TVA {{contraparte.cod_tva}}, cu sediul în {{contraparte.adresa}}, cont IBAN {{contraparte.iban}}, deschis la {{contraparte.banca}} (cod bancar {{contraparte.bic}}), reprezentată de {{contraparte.administrator}}, denumită în continuare <em>Beneficiar</em>, pe de altă parte,</p>
<p>denumite în continuare împreună <em>Părțile</em>, iar separat <em>Partea</em>, au încheiat prezentul contract în următoarele condiții:</p>
`;

const SIGNATURES_DELIVERY = `
<hr>
<table data-role="signatures"><tbody><tr>
<td><p><strong>Predător</strong></p><p>{{noi.denumire}}</p><p>{{noi.administrator}}</p><p>_______________________</p><p>L.Ș.</p></td>
<td><p><strong>Primitor</strong></p><p>{{contraparte.denumire}}</p><p>{{contraparte.administrator}}</p><p>_______________________</p><p>L.Ș.</p></td>
</tr></tbody></table>
`;

const SIGNATURES_CONTRACT = `
<hr>
<h3>Rechizitele și semnăturile Părților</h3>
<table data-role="signatures"><tbody><tr>
<td><p><strong>PRESTATOR</strong></p><p>{{noi.denumire}}</p><p>IDNO: {{noi.idno}}</p><p>Adresa: {{noi.adresa}}</p><p>IBAN: {{noi.iban}}</p><p>Banca: {{noi.banca}}</p><p>&nbsp;</p><p>{{noi.administrator}}</p><p>_______________________</p><p>L.Ș.</p></td>
<td><p><strong>BENEFICIAR</strong></p><p>{{contraparte.denumire}}</p><p>IDNO: {{contraparte.idno}}</p><p>Adresa: {{contraparte.adresa}}</p><p>IBAN: {{contraparte.iban}}</p><p>Banca: {{contraparte.banca}}</p><p>&nbsp;</p><p>{{contraparte.administrator}}</p><p>_______________________</p><p>L.Ș.</p></td>
</tr></tbody></table>
`;

/** Clauza de date cu caracter personal — aceeași în toate contractele, o singură sursă. */
const GDPR_CLAUSE = `
<p>Părțile prelucrează datele cu caracter personal ale reprezentanților și ale persoanelor implicate în executarea prezentului contract exclusiv în scopul executării lui, în conformitate cu Legea nr. 133/2011 privind protecția datelor cu caracter personal.</p>
<p>Fiecare Parte răspunde pentru legalitatea datelor pe care le transmite celeilalte Părți și aplică măsurile tehnice și organizatorice necesare pentru protecția lor. Datele se păstrează pe durata contractului și pe durata termenelor legale de arhivare, după care se șterg sau se anonimizează.</p>
`;

const FORCE_MAJEURE = `
<p>Partea care invocă forța majoră este obligată să notifice cealaltă Parte în termen de 5 (cinci) zile calendaristice de la producerea evenimentului și să prezinte, în termen de 15 (cincisprezece) zile, actul confirmativ eliberat de Camera de Comerț și Industrie a Republicii Moldova.</p>
<p>Executarea obligațiilor se suspendă pe durata forței majore. Dacă aceasta durează mai mult de 60 (șaizeci) de zile calendaristice, oricare dintre Părți poate rezilia contractul fără plata de despăgubiri, cu decontarea serviciilor prestate până la acea dată.</p>
`;

export const SYSTEM_TEMPLATES: SystemTemplate[] = [
  {
    kind: "act_primire_predare",
    name: "Act de primire-predare — bunuri",
    category: "Acte de predare",
    bodyHtml: `
<h1>ACT DE PRIMIRE-PREDARE nr. {{document.numar}}</h1>
<p>{{document.loc}}, {{document.data}}</p>
${PARTIES_DELIVERY}
<p>au încheiat prezentul act, prin care Predătorul a predat, iar Primitorul a primit următoarele bunuri:</p>
<p>{{tabel.pozitii}}</p>
<p>Valoarea totală a bunurilor predate: <strong>{{total.suma}} {{total.valuta}}</strong> ({{total.in_litere}}).</p>
<h3>1. Constatările Părților</h3>
<p>1.1. Bunurile au fost predate în starea și cantitatea indicate mai sus, împreună cu documentele care le însoțesc (certificate de garanție, instrucțiuni de exploatare, fișe tehnice), acolo unde acestea există.</p>
<p>1.2. Primitorul a verificat bunurile la momentul predării și confirmă că acestea corespund cantitativ și calitativ. Obiecții la momentul semnării: nu există / <em>se indică mai jos, dacă există</em>.</p>
<p>1.3. Viciile ascunse, care nu puteau fi constatate la o verificare obișnuită, se reclamă în termen de 10 (zece) zile lucrătoare de la descoperire, printr-o notificare scrisă adresată Predătorului.</p>
<h3>2. Transmiterea dreptului de proprietate și a riscului</h3>
<p>2.1. Dreptul de proprietate și riscul pieirii fortuite a bunurilor trec de la Predător la Primitor la data semnării prezentului act de către ambele Părți.</p>
<p>2.2. Din acest moment, cheltuielile de păstrare, transport și exploatare a bunurilor sunt suportate de Primitor.</p>
<h3>3. Dispoziții finale</h3>
<p>3.1. Prezentul act este întocmit în baza: {{document.baza}}.</p>
<p>3.2. Actul se referă la proiectul {{proiect.nume}}, finanțat de {{proiect.donator}}.</p>
<p>3.3. Actul a fost întocmit în 2 (două) exemplare originale, cu aceeași putere juridică, câte unul pentru fiecare Parte, și constituie parte integrantă a documentului în baza căruia a fost emis.</p>
<p>3.4. Actul intră în vigoare la data semnării lui de către ambele Părți.</p>
${SIGNATURES_DELIVERY}`.trim(),
  },
  {
    kind: "act_primire_predare",
    name: "Act de primire-predare — servicii prestate",
    category: "Acte de predare",
    bodyHtml: `
<h1>ACT DE PRIMIRE-PREDARE A SERVICIILOR nr. {{document.numar}}</h1>
<p>{{document.loc}}, {{document.data}}</p>
${PARTIES_DELIVERY}
<p>au încheiat prezentul act, prin care Părțile constată executarea serviciilor și lipsa pretențiilor reciproce privind volumul, termenele și calitatea acestora:</p>
<p>{{tabel.pozitii}}</p>
<p>Valoarea totală a serviciilor prestate: <strong>{{total.suma}} {{total.valuta}}</strong> ({{total.in_litere}}).</p>
<h3>1. Constatările Părților</h3>
<p>1.1. Serviciile au fost prestate integral, în volumul și la termenele convenite, în conformitate cu documentul în baza căruia se emite prezentul act: {{document.baza}}.</p>
<p>1.2. Beneficiarul (Primitorul) a verificat rezultatul serviciilor și îl acceptă fără obiecții. Eventualele obiecții se consemnează în prezentul act sau într-o anexă la el, semnată de ambele Părți.</p>
<p>1.3. Rezultatele livrate (materiale, rapoarte, înregistrări, fișiere) au fost transmise Primitorului până la data semnării prezentului act.</p>
<h3>2. Efectele actului</h3>
<p>2.1. Prezentul act confirmă executarea obligațiilor Prestatorului și constituie temeiul pentru emiterea facturii și efectuarea plății, în condițiile prevăzute de contract.</p>
<p>2.2. Semnarea actului fără obiecții stinge orice pretenție a Primitorului privind volumul și calitatea serviciilor consemnate aici, cu excepția viciilor ascunse.</p>
<h3>3. Dispoziții finale</h3>
<p>3.1. Actul se referă la proiectul {{proiect.nume}}, eveniment: {{eveniment.nume}}.</p>
<p>3.2. Actul a fost întocmit în 2 (două) exemplare originale, cu aceeași putere juridică, câte unul pentru fiecare Parte.</p>
${SIGNATURES_DELIVERY}`.trim(),
  },
  {
    kind: "contract_servicii",
    name: "Contract de prestări servicii",
    category: "Contracte",
    bodyHtml: `
<h1>CONTRACT DE PRESTĂRI SERVICII nr. {{document.numar}}</h1>
<p>{{document.loc}}, {{document.data}}</p>
${PARTIES_CONTRACT}
<h3>1. Obiectul contractului</h3>
<p>1.1. Prestatorul se obligă să presteze, iar Beneficiarul să recepționeze și să achite serviciile descrise mai jos:</p>
<p>{{tabel.pozitii}}</p>
<p>1.2. Volumul, conținutul și termenele de prestare se stabilesc prin prezentul contract și, după caz, prin anexe semnate de ambele Părți, care devin parte integrantă a acestuia.</p>
<p>1.3. Locul prestării serviciilor: sediul Beneficiarului, sediul Prestatorului sau mediul online, conform înțelegerii Părților pentru fiecare etapă.</p>
<h3>2. Prețul și modalitatea de plată</h3>
<p>2.1. Valoarea totală a contractului constituie <strong>{{total.suma}} {{total.valuta}}</strong> ({{total.in_litere}}).</p>
<p>2.2. Plata se efectuează prin transfer bancar, în contul indicat în rechizitele Prestatorului, în termen de 10 (zece) zile lucrătoare de la semnarea actului de primire-predare a serviciilor și primirea facturii.</p>
<p>2.3. Data plății se consideră data înregistrării mijloacelor bănești în contul Prestatorului. Comisioanele bancare ale băncii plătitoare sunt suportate de Beneficiar.</p>
<p>2.4. Prețul este ferm pe toată durata contractului. Orice modificare a prețului se face doar prin act adițional semnat de ambele Părți.</p>
<h3>3. Obligațiile Prestatorului</h3>
<p>3.1. Să presteze serviciile cu diligența și competența profesională cuvenite, în termenele convenite.</p>
<p>3.2. Să informeze fără întârziere Beneficiarul despre orice împrejurare care poate afecta termenul sau calitatea serviciilor.</p>
<p>3.3. Să transmită Beneficiarului rezultatul serviciilor și să semneze actul de primire-predare.</p>
<p>3.4. Să păstreze confidențialitatea informațiilor obținute în legătură cu executarea contractului.</p>
<h3>4. Obligațiile Beneficiarului</h3>
<p>4.1. Să pună la dispoziția Prestatorului informațiile, documentele și accesul necesare prestării serviciilor, în termen util.</p>
<p>4.2. Să desemneze o persoană de contact împuternicită să comunice cu Prestatorul și să recepționeze serviciile.</p>
<p>4.3. Să recepționeze serviciile și să achite prețul în condițiile pct. 2.</p>
<p>4.4. Întârzierea Beneficiarului în furnizarea informațiilor sau a accesului prelungește corespunzător termenele Prestatorului, fără penalități pentru acesta din urmă.</p>
<h3>5. Recepția serviciilor</h3>
<p>5.1. La finalizarea serviciilor sau a unei etape, Prestatorul prezintă actul de primire-predare.</p>
<p>5.2. Beneficiarul semnează actul sau formulează obiecții motivate în scris în termen de 5 (cinci) zile lucrătoare de la primirea acestuia. Lipsa unui răspuns în acest termen echivalează cu acceptarea fără obiecții.</p>
<p>5.3. Obiecțiile întemeiate se remediază de Prestator într-un termen rezonabil, convenit de Părți, fără costuri suplimentare pentru Beneficiar.</p>
<h3>6. Răspunderea Părților</h3>
<p>6.1. Pentru neexecutarea sau executarea necorespunzătoare a obligațiilor, Părțile răspund conform prezentului contract și legislației Republicii Moldova.</p>
<p>6.2. Pentru întârzierea plății, Beneficiarul achită o penalitate de 0,1% din suma restantă pentru fiecare zi de întârziere, dar nu mai mult de valoarea totală a contractului.</p>
<p>6.3. Pentru întârzierea prestării serviciilor din culpa sa, Prestatorul achită o penalitate calculată în aceleași condiții.</p>
<p>6.4. Achitarea penalităților nu scutește Partea în culpă de executarea obligației.</p>
<h3>7. Forța majoră</h3>
${FORCE_MAJEURE}
<h3>8. Confidențialitatea</h3>
<p>8.1. Părțile se obligă să nu divulge terților informațiile comerciale, tehnice, financiare și organizatorice obținute în legătură cu executarea contractului, fără acordul scris prealabil al celeilalte Părți.</p>
<p>8.2. Obligația de confidențialitate se menține pe durata contractului și 3 (trei) ani după încetarea lui.</p>
<p>8.3. Nu constituie încălcare divulgarea impusă de lege sau de o autoritate competentă, cu informarea prealabilă a celeilalte Părți, în măsura permisă.</p>
<h3>9. Date cu caracter personal</h3>
${GDPR_CLAUSE}
<h3>10. Drepturile asupra rezultatelor</h3>
<p>10.1. Materialele, metodologia și instrumentele proprii ale Prestatorului rămân proprietatea acestuia; Beneficiarul primește dreptul de a le utiliza în interiorul organizației sale, fără drept de comercializare sau de transmitere către terți.</p>
<p>10.2. Rezultatele elaborate special pentru Beneficiar (rapoarte, analize, proceduri) aparțin Beneficiarului de la data achitării integrale a prețului.</p>
<h3>11. Durata, modificarea și încetarea contractului</h3>
<p>11.1. Contractul intră în vigoare la data semnării de către ambele Părți și acționează până la executarea integrală a obligațiilor asumate.</p>
<p>11.2. Contractul se modifică doar prin act adițional scris, semnat de ambele Părți.</p>
<p>11.3. Oricare Parte poate rezilia contractul cu un preaviz scris de 15 (cincisprezece) zile calendaristice, cu condiția decontării serviciilor prestate până la data rezilierii.</p>
<p>11.4. Partea prejudiciată poate rezilia contractul fără preaviz în cazul încălcării grave a obligațiilor de către cealaltă Parte, dacă încălcarea nu este remediată în 10 (zece) zile de la notificare.</p>
<h3>12. Notificări</h3>
<p>12.1. Orice comunicare între Părți se face în scris, la adresele și adresele de e-mail indicate în rechizite. Comunicările transmise prin e-mail se consideră primite în ziua lucrătoare următoare expedierii.</p>
<p>12.2. Schimbarea rechizitelor se comunică celeilalte Părți în termen de 5 (cinci) zile lucrătoare. Până la comunicare, sunt valabile rechizitele din prezentul contract.</p>
<h3>13. Soluționarea litigiilor</h3>
<p>13.1. Litigiile se soluționează pe cale amiabilă, prin negocieri, în termen de 30 (treizeci) de zile de la formularea pretenției scrise.</p>
<p>13.2. În lipsa unei înțelegeri, litigiul se transmite spre soluționare instanțelor judecătorești competente din Republica Moldova, dreptul aplicabil fiind cel al Republicii Moldova.</p>
<h3>14. Dispoziții finale</h3>
<p>14.1. Contractul este întocmit în 2 (două) exemplare originale, în limba română, cu aceeași putere juridică, câte unul pentru fiecare Parte.</p>
<p>14.2. Nulitatea unei clauze nu afectează valabilitatea celorlalte clauze ale contractului.</p>
<p>14.3. Anexele semnate de Părți fac parte integrantă din prezentul contract.</p>
<p>14.4. Contract încheiat în baza: {{document.baza}}. Proiect: {{proiect.nume}} ({{proiect.donator}}).</p>
${SIGNATURES_CONTRACT}`.trim(),
  },
  {
    kind: "contract_vanzare",
    name: "Contract de vânzare-cumpărare",
    category: "Contracte",
    bodyHtml: `
<h1>CONTRACT DE VÂNZARE-CUMPĂRARE nr. {{document.numar}}</h1>
<p>{{document.loc}}, {{document.data}}</p>
<p><strong>{{noi.denumire}}</strong>, IDNO {{noi.idno}}, cu sediul în {{noi.adresa}}, reprezentată de {{noi.administrator}}, denumită în continuare <em>Vânzător</em>, pe de o parte, și</p>
<p><strong>{{contraparte.denumire}}</strong>, cod fiscal {{contraparte.idno}}, cod TVA {{contraparte.cod_tva}}, cu sediul în {{contraparte.adresa}}, cont IBAN {{contraparte.iban}}, deschis la {{contraparte.banca}} (cod bancar {{contraparte.bic}}), reprezentată de {{contraparte.administrator}}, denumită în continuare <em>Cumpărător</em>, pe de altă parte,</p>
<p>au încheiat prezentul contract în următoarele condiții:</p>
<h3>1. Obiectul contractului</h3>
<p>1.1. Vânzătorul se obligă să transmită în proprietate, iar Cumpărătorul să preia și să achite următoarele bunuri:</p>
<p>{{tabel.pozitii}}</p>
<p>1.2. Bunurile sunt libere de orice sarcini, sechestre sau drepturi ale terților, fapt garantat de Vânzător.</p>
<h3>2. Prețul și modalitatea de plată</h3>
<p>2.1. Valoarea totală a contractului constituie <strong>{{total.suma}} {{total.valuta}}</strong> ({{total.in_litere}}).</p>
<p>2.2. Plata se efectuează prin transfer bancar, în termen de 10 (zece) zile lucrătoare de la semnarea actului de primire-predare și primirea facturii, dacă Părțile nu convin altfel în scris.</p>
<p>2.3. Prețul include toate cheltuielile Vânzătorului legate de pregătirea bunurilor pentru predare.</p>
<h3>3. Predarea bunurilor</h3>
<p>3.1. Predarea se efectuează la {{document.loc}}, în termenul convenit de Părți, pe bază de act de primire-predare și factură fiscală.</p>
<p>3.2. Dreptul de proprietate și riscul pieirii fortuite trec la Cumpărător la momentul semnării actului de primire-predare.</p>
<p>3.3. Cumpărătorul verifică bunurile la predare. Neconformitățile vizibile se consemnează în actul de primire-predare; viciile ascunse se reclamă în 10 (zece) zile lucrătoare de la descoperire.</p>
<h3>4. Garanția</h3>
<p>4.1. Vânzătorul garantează calitatea bunurilor conform documentelor însoțitoare și a termenelor de garanție indicate de producător.</p>
<p>4.2. În perioada de garanție, bunurile neconforme se înlocuiesc sau se repară pe cheltuiala Vânzătorului, într-un termen rezonabil.</p>
<h3>5. Răspunderea Părților</h3>
<p>5.1. Pentru întârzierea plății, Cumpărătorul achită o penalitate de 0,1% din suma restantă pentru fiecare zi de întârziere, dar nu mai mult de valoarea contractului.</p>
<p>5.2. Pentru întârzierea predării bunurilor, Vânzătorul achită o penalitate calculată în aceleași condiții.</p>
<h3>6. Forța majoră</h3>
${FORCE_MAJEURE}
<h3>7. Date cu caracter personal</h3>
${GDPR_CLAUSE}
<h3>8. Soluționarea litigiilor și dispoziții finale</h3>
<p>8.1. Litigiile se soluționează pe cale amiabilă, iar în lipsa unei înțelegeri — de instanțele judecătorești competente din Republica Moldova.</p>
<p>8.2. Contractul intră în vigoare la data semnării de către ambele Părți și se modifică doar prin act adițional scris.</p>
<p>8.3. Contractul este întocmit în 2 (două) exemplare originale, cu aceeași putere juridică, câte unul pentru fiecare Parte.</p>
<p>8.4. Contract încheiat în baza: {{document.baza}}.</p>
${SIGNATURES_CONTRACT}`.trim(),
  },
  {
    kind: "act_aditional",
    name: "Act adițional la contract",
    category: "Contracte",
    bodyHtml: `
<h1>ACT ADIȚIONAL nr. {{document.numar}}</h1>
<p>la contractul {{document.baza}}</p>
<p>{{document.loc}}, {{document.data}}</p>
${PARTIES_CONTRACT}
<h3>1. Temeiul</h3>
<p>1.1. Părțile, de comun acord, modifică contractul indicat mai sus, în condițiile convenite prin prezentul act adițional.</p>
<h3>2. Modificările convenite</h3>
<p>2.1. Se modifică obiectul/volumul, după cum urmează:</p>
<p>{{tabel.pozitii}}</p>
<p>2.2. Valoarea aferentă prezentului act adițional constituie <strong>{{total.suma}} {{total.valuta}}</strong> ({{total.in_litere}}).</p>
<p>2.3. Termenul de executare se modifică astfel: __________.</p>
<h3>3. Clauze neschimbate</h3>
<p>3.1. Celelalte clauze ale contractului rămân neschimbate și pe deplin valabile.</p>
<p>3.2. Prezentul act adițional face parte integrantă din contractul menționat și se interpretează împreună cu acesta.</p>
<h3>4. Intrarea în vigoare</h3>
<p>4.1. Actul adițional intră în vigoare la data semnării lui de către ambele Părți și este întocmit în 2 (două) exemplare originale, câte unul pentru fiecare Parte.</p>
${SIGNATURES_CONTRACT}`.trim(),
  },
  {
    kind: "proces_verbal",
    name: "Proces-verbal de recepție",
    category: "Acte de predare",
    bodyHtml: `
<h1>PROCES-VERBAL DE RECEPȚIE nr. {{document.numar}}</h1>
<p>{{document.loc}}, {{document.data}}</p>
${PARTIES_DELIVERY}
<p>au procedat la recepția următoarelor bunuri/lucrări/servicii:</p>
<p>{{tabel.pozitii}}</p>
<p>Valoarea totală: <strong>{{total.suma}} {{total.valuta}}</strong> ({{total.in_litere}}).</p>
<h3>1. Verificările efectuate</h3>
<p>1.1. S-a verificat corespunderea cantitativă cu documentele însoțitoare.</p>
<p>1.2. S-a verificat corespunderea calitativă și funcționarea, acolo unde aceasta este aplicabilă.</p>
<p>1.3. S-a verificat existența documentelor care însoțesc obiectul recepției (certificate, garanții, instrucțiuni).</p>
<h3>2. Constatări</h3>
<p>2.1. Obiectul recepției corespunde condițiilor din {{document.baza}}.</p>
<p>2.2. Neconformități constatate: nu au fost constatate / <em>se enumeră mai jos, cu termenul de remediere</em>.</p>
<p>2.3. Termenul de remediere a neconformităților, dacă există: __________.</p>
<h3>3. Concluzia comisiei</h3>
<p>3.1. Obiectul recepției <strong>se admite</strong> spre exploatare/decontare, în starea constatată la data prezentului proces-verbal.</p>
<p>3.2. Prezentul proces-verbal constituie temei pentru efectuarea decontărilor, în condițiile documentului în baza căruia a fost emis.</p>
<p>3.3. Proiect: {{proiect.nume}} ({{proiect.donator}}), eveniment: {{eveniment.nume}}.</p>
<p>3.4. Întocmit în 2 (două) exemplare originale, câte unul pentru fiecare Parte.</p>
${SIGNATURES_DELIVERY}`.trim(),
  },
  {
    kind: "act_compensare",
    name: "Act de compensare a creanțelor",
    category: "Financiare",
    bodyHtml: `
<h1>ACT DE COMPENSARE A CREANȚELOR RECIPROCE nr. {{document.numar}}</h1>
<p>{{document.loc}}, {{document.data}}</p>
${PARTIES_CONTRACT}
<h3>1. Constatarea creanțelor</h3>
<p>1.1. Părțile constată existența unor creanțe reciproce, certe, lichide și exigibile, rezultate din următoarele documente:</p>
<p>{{tabel.pozitii}}</p>
<p>1.2. Suma supusă compensării constituie <strong>{{total.suma}} {{total.valuta}}</strong> ({{total.in_litere}}).</p>
<h3>2. Compensarea</h3>
<p>2.1. Părțile convin să stingă prin compensare creanțele reciproce până la concurența celei mai mici dintre ele, în temeiul art. 651–659 din Codul civil al Republicii Moldova.</p>
<p>2.2. Soldul rămas după compensare se achită de Partea debitoare în termen de 10 (zece) zile lucrătoare de la semnarea prezentului act.</p>
<p>2.3. Compensarea produce efecte la data semnării prezentului act de către ambele Părți.</p>
<h3>3. Dispoziții finale</h3>
<p>3.1. Părțile confirmă că, după compensarea operată, nu au alte pretenții reciproce privind obligațiile stinse prin prezentul act.</p>
<p>3.2. Actul se reflectă în evidența contabilă a fiecărei Părți la data semnării.</p>
<p>3.3. Întocmit în 2 (două) exemplare originale, câte unul pentru fiecare Parte.</p>
${SIGNATURES_CONTRACT}`.trim(),
  },
  {
    kind: "other",
    name: "Cerere de ofertă",
    category: "Achiziții",
    bodyHtml: `
<h1>CERERE DE OFERTĂ nr. {{document.numar}}</h1>
<p>{{document.loc}}, {{document.data}}</p>
<p>Către: <strong>{{contraparte.denumire}}</strong>, cod fiscal {{contraparte.idno}}, {{contraparte.adresa}}</p>
<p>În atenția: {{contraparte.administrator}}</p>
<p>Stimate domn/Stimată doamnă,</p>
<p><strong>{{noi.denumire}}</strong> (IDNO {{noi.idno}}, {{noi.adresa}}) solicită oferta dumneavoastră de preț pentru următoarele bunuri/servicii:</p>
<p>{{tabel.pozitii}}</p>
<h3>1. Ce trebuie să conțină oferta</h3>
<p>1.1. Prețul unitar și valoarea totală, cu indicarea monedei și a includerii sau neincluderii TVA.</p>
<p>1.2. Termenul de livrare/prestare și condițiile de livrare.</p>
<p>1.3. Termenul de valabilitate a ofertei, care nu poate fi mai mic de 15 (cincisprezece) zile calendaristice.</p>
<p>1.4. Condițiile de plată propuse și rechizitele bancare ale ofertantului.</p>
<p>1.5. Garanția acordată, acolo unde este aplicabilă.</p>
<h3>2. Termen și modalitate de transmitere</h3>
<p>2.1. Oferta se transmite în formă scrisă, semnată de persoana împuternicită, până la data de __________.</p>
<p>2.2. Oferta se transmite la adresa {{noi.adresa}} sau prin e-mail, la adresa de contact indicată mai jos.</p>
<h3>3. Precizări</h3>
<p>3.1. Prezenta cerere nu constituie angajament de achiziție și nu obligă solicitantul să încheie contract.</p>
<p>3.2. Achiziția se realizează în cadrul proiectului {{proiect.nume}}, finanțat de {{proiect.donator}}.</p>
<p>3.3. Persoana de contact: {{utilizator.nume}}, {{utilizator.functie}}.</p>
<p>Cu respect,</p>
<p>{{noi.administrator}}<br>{{noi.denumire}}</p>`.trim(),
  },
  {
    kind: "other",
    name: "Invitație de participare",
    category: "Achiziții",
    bodyHtml: `
<h1>INVITAȚIE DE PARTICIPARE nr. {{document.numar}}</h1>
<p>{{document.loc}}, {{document.data}}</p>
<p>Către: <strong>{{contraparte.denumire}}</strong>, {{contraparte.adresa}}</p>
<p><strong>{{noi.denumire}}</strong> vă invită să participați la procedura de selectare a ofertelor pentru:</p>
<p>{{tabel.pozitii}}</p>
<h3>1. Contextul</h3>
<p>1.1. Achiziția se desfășoară în cadrul proiectului {{proiect.nume}}, finanțat de {{proiect.donator}}.</p>
<p>1.2. Valoarea estimată a achiziției: {{total.suma}} {{total.valuta}}.</p>
<h3>2. Criteriile de evaluare</h3>
<p>2.1. Corespunderea cu cerințele tehnice solicitate.</p>
<p>2.2. Prețul ofertat.</p>
<p>2.3. Termenul de livrare/prestare.</p>
<p>2.4. Experiența relevantă a ofertantului.</p>
<h3>3. Documentele solicitate</h3>
<p>3.1. Oferta tehnică și financiară, semnată de persoana împuternicită.</p>
<p>3.2. Copia certificatului de înregistrare a ofertantului.</p>
<p>3.3. Alte documente relevante, la discreția ofertantului.</p>
<h3>4. Termenul-limită</h3>
<p>4.1. Ofertele se depun până la data de __________, la adresa {{noi.adresa}} sau prin e-mail.</p>
<p>4.2. Ofertele primite după termenul-limită nu se examinează.</p>
<p>4.3. Persoana de contact: {{utilizator.nume}}, {{utilizator.functie}}.</p>
<p>Cu respect,</p>
<p>{{noi.administrator}}<br>{{noi.denumire}}</p>`.trim(),
  },
  {
    kind: "other",
    name: "Procură",
    category: "Împuterniciri",
    bodyHtml: `
<h1>PROCURĂ nr. {{document.numar}}</h1>
<p>{{document.loc}}, {{document.data}}</p>
<p><strong>{{noi.denumire}}</strong>, IDNO {{noi.idno}}, cu sediul în {{noi.adresa}}, reprezentată de {{noi.administrator}}, care acționează în baza statutului, împuternicește prin prezenta pe:</p>
<p><strong>{{utilizator.nume}}</strong>, {{utilizator.functie}}, act de identitate seria __________ nr. __________, IDNP __________,</p>
<h3>1. Împuternicirile acordate</h3>
<p>1.1. Să reprezinte interesele organizației în relația cu {{contraparte.denumire}} și cu orice altă persoană fizică sau juridică, în limitele prezentei procuri.</p>
<p>1.2. Să primească și să predea bunuri, valori materiale și documente, semnând actele de primire-predare aferente.</p>
<p>1.3. Să semneze facturi, procese-verbale și alte documente necesare executării împuternicirii.</p>
<p>1.4. Să efectueze orice alte acțiuni legale necesare realizării împuternicirilor de mai sus.</p>
<p>1.5. Obiectul concret al împuternicirii:</p>
<p>{{tabel.pozitii}}</p>
<h3>2. Termenul și condițiile</h3>
<p>2.1. Prezenta procură este valabilă până la data de __________.</p>
<p>2.2. Împuternicirile nu pot fi transmise altei persoane.</p>
<p>2.3. Procura poate fi revocată oricând de organizația care a eliberat-o, cu informarea persoanei împuternicite.</p>
<p>2.4. Semnătura persoanei împuternicite se certifică prin prezenta: _______________________</p>
<p>&nbsp;</p>
<p>{{noi.administrator}}<br>{{noi.denumire}}</p>
<p>_______________________</p>
<p>L.Ș.</p>`.trim(),
  },
  {
    kind: "other",
    name: "Ordin / dispoziție internă",
    category: "Împuterniciri",
    bodyHtml: `
<h1>ORDIN nr. {{document.numar}}</h1>
<p>{{noi.denumire}}</p>
<p>{{document.loc}}, {{document.data}}</p>
<h3>Temei</h3>
<p>În temeiul {{document.baza}} și al competențelor conferite de statutul organizației,</p>
<h3>ORDON:</h3>
<p>1. Se dispune:</p>
<p>{{tabel.pozitii}}</p>
<p>2. Responsabil de executarea prezentului ordin se desemnează {{utilizator.nume}}, {{utilizator.functie}}.</p>
<p>3. Termenul de executare: __________.</p>
<p>4. Cheltuielile aferente, în sumă de {{total.suma}} {{total.valuta}}, se suportă din bugetul proiectului {{proiect.nume}}.</p>
<p>5. Controlul asupra executării prezentului ordin îmi revine.</p>
<p>&nbsp;</p>
<p>{{noi.administrator}}<br>Administrator</p>
<p>_______________________</p>
<p>L.Ș.</p>
<p>&nbsp;</p>
<p><em>Am luat cunoștință:</em></p>
<p>{{utilizator.nume}} _______________________ data __________</p>`.trim(),
  },
  {
    // CRM-D03: oferta arată ca documentul unei firme, nu ca o scrisoare tipărită — fișă-rezumat sub
    // titlu (cine, cui, cât, până când), secțiuni numerotate și loc de acceptare pentru client,
    // după modelul contractelor Vector Academy. Tabelul pozițiilor are TVA când produsele au.
    kind: "oferta_comerciala",
    name: "Ofertă comercială",
    category: "Vânzări",
    bodyHtml: `
<h1>Ofertă comercială nr. {{document.numar}}</h1>
<p>{{document.loc}}, {{document.data}}</p>
<table data-role="meta"><tbody>
<tr><td>Furnizor</td><td>{{noi.denumire}}, IDNO {{noi.idno}}</td></tr>
<tr><td>Client</td><td>{{contraparte.denumire}}</td></tr>
<tr><td>În atenția</td><td>{{contraparte.administrator}}</td></tr>
<tr><td>Valoarea ofertei</td><td><strong>{{total.suma}} {{total.valuta}}</strong>, fără TVA</td></tr>
<tr><td>Valabilă</td><td>15 zile calendaristice de la emitere</td></tr>
</tbody></table>
<p>Stimate domn/Stimată doamnă,</p>
<p>Vă mulțumim pentru interesul acordat. În urma discuției noastre, vă prezentăm oferta pentru serviciile solicitate.</p>
<h2>1. Ce include oferta</h2>
<p>{{tabel.pozitii}}</p>
<p>Valoarea totală: <strong>{{total.suma}} {{total.valuta}}</strong> ({{total.in_litere}}), fără TVA. Unde se aplică, TVA-ul și totalul cu TVA sunt indicate în tabel.</p>
<h2>2. Condiții comerciale</h2>
<p>2.1. Prețurile sunt exprimate în {{total.valuta}}.</p>
<p>2.2. Termenul de valabilitate a ofertei: 15 (cincisprezece) zile calendaristice de la data emiterii.</p>
<p>2.3. Termenul de prestare/livrare se convine la semnarea contractului, în funcție de disponibilitatea ambelor părți.</p>
<p>2.4. Plata: prin transfer bancar, în termen de 10 (zece) zile lucrătoare de la semnarea actului de primire-predare, dacă nu se convine altfel.</p>
<h2>3. Ce nu include oferta</h2>
<p>3.1. Cheltuielile de deplasare în afara localității furnizorului ({{document.loc}}), dacă acestea sunt necesare.</p>
<p>3.2. Serviciile suplimentare solicitate ulterior, care se ofertează separat.</p>
<h2>4. Pașii următori</h2>
<p>4.1. Confirmarea ofertei prin e-mail sau semnarea ei mai jos este suficientă pentru a trece la contract.</p>
<p>4.2. După confirmare, transmitem contractul și stabilim calendarul de lucru.</p>
<p>4.3. Persoana de contact: {{utilizator.nume}}.</p>
<p>Vă stăm la dispoziție pentru orice precizare.</p>
<table data-role="signatures"><tbody><tr>
<td><p><strong>Furnizor</strong></p><p>{{noi.denumire}}</p><p>{{noi.administrator}}</p><p>&nbsp;</p><p>Semnătura _______________________</p></td>
<td><p><strong>Acceptat de client</strong></p><p>{{contraparte.denumire}}</p><p>{{contraparte.administrator}}</p><p>&nbsp;</p><p>Semnătura _______________________</p><p>Data ______________</p></td>
</tr></tbody></table>`.trim(),
  },
  {
    kind: "contract_servicii",
    name: "Contract în baza ofertei acceptate",
    category: "Vânzări",
    bodyHtml: `
<h1>Contract de prestări servicii nr. {{document.numar}}</h1>
<p>{{document.loc}}, {{document.data}}</p>
<table data-role="meta"><tbody>
<tr><td>Prestator</td><td>{{noi.denumire}}, IDNO {{noi.idno}}</td></tr>
<tr><td>Beneficiar</td><td>{{contraparte.denumire}}, cod fiscal {{contraparte.idno}}</td></tr>
<tr><td>În baza</td><td>ofertei acceptate {{document.baza}}</td></tr>
<tr><td>Valoarea contractului</td><td><strong>{{total.suma}} {{total.valuta}}</strong>, fără TVA</td></tr>
</tbody></table>
${PARTIES_CONTRACT}
<h2>1. Obiectul contractului</h2>
<p>1.1. Prestatorul se obligă să presteze serviciile acceptate de Beneficiar prin oferta indicată mai sus:</p>
<p>{{tabel.pozitii}}</p>
<p>1.2. Oferta acceptată face parte integrantă din prezentul contract. În caz de neconcordanță între ofertă și contract, prevalează contractul.</p>
<h2>2. Prețul și plata</h2>
<p>2.1. Valoarea contractului: <strong>{{total.suma}} {{total.valuta}}</strong> ({{total.in_litere}}), conform prețurilor din oferta acceptată.</p>
<p>2.2. Plata se efectuează prin transfer bancar, în termen de 10 (zece) zile lucrătoare de la semnarea actului de primire-predare și primirea facturii.</p>
<p>2.3. Pentru întârzierea plății se aplică o penalitate de 0,1% din suma restantă pentru fiecare zi de întârziere, fără a depăși valoarea contractului.</p>
<h2>3. Termene și recepție</h2>
<p>3.1. Calendarul de prestare se convine în scris de Părți în termen de 5 (cinci) zile lucrătoare de la semnarea contractului.</p>
<p>3.2. La finalizare, Prestatorul prezintă actul de primire-predare, pe care Beneficiarul îl semnează sau la care formulează obiecții motivate în 5 (cinci) zile lucrătoare. Lipsa răspunsului în acest termen echivalează cu acceptarea.</p>
<h2>4. Obligațiile Părților</h2>
<p>4.1. Prestatorul prestează serviciile cu competență profesională și informează Beneficiarul despre orice împrejurare care afectează termenul sau calitatea.</p>
<p>4.2. Beneficiarul asigură accesul, informațiile și persoana de contact necesare, iar întârzierea acestora prelungește corespunzător termenele Prestatorului.</p>
<h2>5. Confidențialitate și date cu caracter personal</h2>
<p>5.1. Părțile păstrează confidențialitatea informațiilor obținute în executarea contractului, pe durata acestuia și 3 (trei) ani după încetarea lui.</p>
${GDPR_CLAUSE}
<h2>6. Forța majoră</h2>
${FORCE_MAJEURE}
<h2>7. Încetarea contractului</h2>
<p>7.1. Contractul încetează prin executarea integrală a obligațiilor, prin acordul Părților sau prin reziliere, cu preaviz scris de 15 (cincisprezece) zile calendaristice și decontarea serviciilor prestate.</p>
<h2>8. Dispoziții finale</h2>
<p>8.1. Litigiile se soluționează pe cale amiabilă, iar în lipsa unei înțelegeri — de instanțele judecătorești competente din Republica Moldova.</p>
<p>8.2. Contractul intră în vigoare la data semnării de către ambele Părți, se modifică doar prin act adițional scris și este întocmit în 2 (două) exemplare originale.</p>
${SIGNATURES_CONTRACT}`.trim(),
  },
];
