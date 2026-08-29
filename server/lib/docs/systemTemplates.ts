/**
 * DG-106 — biblioteca de șabloane livrate cu produsul.
 *
 * Rostul lor: organizația începe cu acte gata scrise în română, nu cu o pagină goală. Primul act
 * util iese în ziua instalării. Sunt marcate `is_system` — se folosesc și se clonează, dar nu se
 * editează și nu se șterg, ca nimeni să nu strice, în trei click-uri, formularea pe care se
 * sprijină toate actele viitoare.
 *
 * Câmpurile folosite sunt EXACT cele din catalogul editorului (src/lib/docs/fieldCatalog.ts), ca
 * un șablon standard să se completeze singur din registrul de furnizori.
 */

export interface SystemTemplate {
  kind: string;
  name: string;
  category: string;
  bodyHtml: string;
}

const PARTIES = `
<p><strong>{{noi.denumire}}</strong>, IDNO {{noi.idno}}, cu sediul în {{noi.adresa}}, reprezentată de {{noi.administrator}}, denumită în continuare <em>Predător</em>, pe de o parte, și</p>
<p><strong>{{contraparte.denumire}}</strong>, cod fiscal {{contraparte.idno}}, cu sediul în {{contraparte.adresa}}, cont IBAN {{contraparte.iban}}, deschis la {{contraparte.banca}} (cod bancar {{contraparte.bic}}), reprezentată de {{contraparte.administrator}}, denumită în continuare <em>Primitor</em>, pe de altă parte,</p>
`;

const SIGNATURES = `
<hr>
<table><tbody><tr>
<td><p><strong>Predător</strong></p><p>{{noi.denumire}}</p><p>{{noi.administrator}}</p><p>_______________________</p><p>L.Ș.</p></td>
<td><p><strong>Primitor</strong></p><p>{{contraparte.denumire}}</p><p>{{contraparte.administrator}}</p><p>_______________________</p><p>L.Ș.</p></td>
</tr></tbody></table>
`;

export const SYSTEM_TEMPLATES: SystemTemplate[] = [
  {
    kind: "act_primire_predare",
    name: "Act de primire-predare — bunuri",
    category: "Acte de predare",
    bodyHtml: `
<h1>ACT DE PRIMIRE-PREDARE nr. {{document.numar}}</h1>
<p>{{document.loc}}, {{document.data}}</p>
${PARTIES}
<p>au încheiat prezentul act, prin care Predătorul a predat, iar Primitorul a primit următoarele bunuri:</p>
<p>{{tabel.pozitii}}</p>
<p>Valoarea totală: <strong>{{total.suma}} {{total.valuta}}</strong> ({{total.in_litere}}).</p>
<p>Bunurile au fost predate în stare corespunzătoare, fără obiecții din partea Primitorului.</p>
<p>Prezentul act a fost întocmit în două exemplare, câte unul pentru fiecare parte.</p>
<p>În baza: {{document.baza}}. Proiect: {{proiect.nume}} ({{proiect.donator}}).</p>
${SIGNATURES}`.trim(),
  },
  {
    kind: "act_primire_predare",
    name: "Act de primire-predare — servicii prestate",
    category: "Acte de predare",
    bodyHtml: `
<h1>ACT DE PRIMIRE-PREDARE A SERVICIILOR nr. {{document.numar}}</h1>
<p>{{document.loc}}, {{document.data}}</p>
${PARTIES}
<p>au încheiat prezentul act, prin care Primitorul confirmă prestarea integrală a serviciilor și lipsa obiecțiilor privind volumul, termenele și calitatea acestora:</p>
<p>{{tabel.pozitii}}</p>
<p>Valoarea serviciilor: <strong>{{total.suma}} {{total.valuta}}</strong> ({{total.in_litere}}).</p>
<p>În baza: {{document.baza}}. Proiect: {{proiect.nume}}, eveniment: {{eveniment.nume}}.</p>
${SIGNATURES}`.trim(),
  },
  {
    kind: "contract_servicii",
    name: "Contract de prestări servicii",
    category: "Contracte",
    bodyHtml: `
<h1>CONTRACT DE PRESTĂRI SERVICII nr. {{document.numar}}</h1>
<p>{{document.loc}}, {{document.data}}</p>
${PARTIES}
<h2>1. Obiectul contractului</h2>
<p>Prestatorul se obligă să presteze serviciile convenite, iar Beneficiarul să le recepționeze și să le achite în condițiile prezentului contract.</p>
<h2>2. Valoarea contractului și modul de plată</h2>
<p>Valoarea totală: <strong>{{total.suma}} {{total.valuta}}</strong> ({{total.in_litere}}). Plata se efectuează prin transfer la contul IBAN {{contraparte.iban}}, deschis la {{contraparte.banca}}, în termen de 10 zile lucrătoare de la semnarea actului de primire-predare.</p>
<h2>3. Termenele</h2>
<p>Serviciile se prestează până la data convenită de părți, confirmată prin act de primire-predare.</p>
<h2>4. Răspunderea părților</h2>
<p>Părțile răspund pentru neexecutarea obligațiilor conform legislației Republicii Moldova.</p>
<h2>5. Dispoziții finale</h2>
<p>Contractul intră în vigoare la data semnării și este întocmit în două exemplare, câte unul pentru fiecare parte. Sursa de finanțare: {{proiect.nume}} ({{proiect.donator}}).</p>
${SIGNATURES}`.trim(),
  },
  {
    kind: "contract_vanzare",
    name: "Contract de vânzare-cumpărare",
    category: "Contracte",
    bodyHtml: `
<h1>CONTRACT DE VÂNZARE-CUMPĂRARE nr. {{document.numar}}</h1>
<p>{{document.loc}}, {{document.data}}</p>
${PARTIES}
<h2>1. Obiectul contractului</h2>
<p>Vânzătorul se obligă să transmită în proprietate bunurile indicate în anexa la prezentul contract, iar Cumpărătorul să le primească și să achite prețul convenit.</p>
<h2>2. Prețul și plata</h2>
<p>Prețul total: <strong>{{total.suma}} {{total.valuta}}</strong> ({{total.in_litere}}), achitat prin transfer la contul {{contraparte.iban}}.</p>
<h2>3. Predarea bunurilor</h2>
<p>Predarea se confirmă prin act de primire-predare semnat de ambele părți.</p>
${SIGNATURES}`.trim(),
  },
  {
    kind: "act_aditional",
    name: "Act adițional la contract",
    category: "Contracte",
    bodyHtml: `
<h1>ACT ADIȚIONAL nr. {{document.numar}}</h1>
<p>la {{document.baza}}</p>
<p>{{document.loc}}, {{document.data}}</p>
${PARTIES}
<p>au convenit modificarea contractului menționat, după cum urmează:</p>
<p>{{tabel.pozitii}}</p>
<p>Celelalte clauze ale contractului rămân neschimbate. Prezentul act adițional face parte integrantă din contract.</p>
${SIGNATURES}`.trim(),
  },
  {
    kind: "proces_verbal",
    name: "Proces-verbal de recepție",
    category: "Acte de predare",
    bodyHtml: `
<h1>PROCES-VERBAL DE RECEPȚIE nr. {{document.numar}}</h1>
<p>{{document.loc}}, {{document.data}}</p>
${PARTIES}
<p>Comisia de recepție a examinat bunurile/lucrările predate în baza {{document.baza}}:</p>
<p>{{tabel.pozitii}}</p>
<p>și a constatat:</p>
<ul><li>corespunderea cantitativă și calitativă cu cele contractate;</li><li>lipsa deficiențelor care ar împiedica recepția.</li></ul>
<p>Valoarea recepționată: <strong>{{total.suma}} {{total.valuta}}</strong> ({{total.in_litere}}).</p>
${SIGNATURES}`.trim(),
  },
  {
    kind: "act_compensare",
    name: "Act de compensare a creanțelor",
    category: "Financiare",
    bodyHtml: `
<h1>ACT DE COMPENSARE nr. {{document.numar}}</h1>
<p>{{document.loc}}, {{document.data}}</p>
${PARTIES}
<p>au constatat existența unor creanțe reciproce și au convenit stingerea lor prin compensare, în sumă de <strong>{{total.suma}} {{total.valuta}}</strong> ({{total.in_litere}}).</p>
<p>După compensare, părțile nu au pretenții reciproce în limita sumei compensate.</p>
${SIGNATURES}`.trim(),
  },
  {
    kind: "other",
    name: "Cerere de ofertă",
    category: "Achiziții",
    bodyHtml: `
<h1>CERERE DE OFERTĂ nr. {{document.numar}}</h1>
<p>{{document.loc}}, {{document.data}}</p>
<p>Către: <strong>{{contraparte.denumire}}</strong>, cod fiscal {{contraparte.idno}}</p>
<p>{{noi.denumire}} (IDNO {{noi.idno}}) solicită prezentarea ofertei de preț pentru bunurile/serviciile de mai jos, în cadrul proiectului {{proiect.nume}}.</p>
<p>{{tabel.pozitii}}</p>
<p>Oferta se transmite până la data indicată, cu specificarea prețului unitar, termenului de livrare și condițiilor de plată.</p>
<p>Persoana de contact: {{utilizator.nume}}, {{utilizator.functie}}.</p>`.trim(),
  },
  {
    kind: "other",
    name: "Invitație de participare",
    category: "Achiziții",
    bodyHtml: `
<h1>INVITAȚIE DE PARTICIPARE nr. {{document.numar}}</h1>
<p>{{document.loc}}, {{document.data}}</p>
<p>{{noi.denumire}} invită {{contraparte.denumire}} să participe la procedura de achiziție din cadrul proiectului {{proiect.nume}}, finanțat de {{proiect.donator}}.</p>
<p>Valoarea estimată: {{total.suma}} {{total.valuta}}.</p>
<p>Persoana de contact: {{utilizator.nume}}, {{utilizator.functie}}.</p>`.trim(),
  },
  {
    kind: "other",
    name: "Procură",
    category: "Împuterniciri",
    bodyHtml: `
<h1>PROCURĂ nr. {{document.numar}}</h1>
<p>{{document.loc}}, {{document.data}}</p>
<p>{{noi.denumire}}, IDNO {{noi.idno}}, cu sediul în {{noi.adresa}}, reprezentată de {{noi.administrator}}, împuternicește pe {{utilizator.nume}}, {{utilizator.functie}}, să reprezinte organizația în raporturile cu {{contraparte.denumire}}, cu dreptul de a semna documentele necesare.</p>
<p>Prezenta procură este valabilă până la revocarea ei expresă.</p>
<hr>
<p>{{noi.administrator}}</p><p>_______________________</p><p>L.Ș.</p>`.trim(),
  },
  {
    kind: "other",
    name: "Ordin / dispoziție internă",
    category: "Împuterniciri",
    bodyHtml: `
<h1>ORDIN nr. {{document.numar}}</h1>
<p>{{document.loc}}, {{document.data}}</p>
<p>În temeiul competențelor sale, {{noi.denumire}} dispune:</p>
<ol><li><em>[dispoziția]</em></li><li>Controlul executării se pune în sarcina {{utilizator.nume}}, {{utilizator.functie}}.</li></ol>
<hr>
<p>{{noi.administrator}}</p><p>_______________________</p>`.trim(),
  },
];
