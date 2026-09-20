/**
 * Paginile legale publice ale FinFlow — confidențialitate și termeni.
 *
 * De ce sunt HTML static pre-randat și nu rute din aplicație: ecranul de consimțământ Google cere
 * ca linkurile de politică să fie publice, pe domeniul autorizat, și să răspundă cu conținut la un
 * singur fetch, fără JavaScript. Aplicația e un SPA cu hash routing, deci o rută `#/confidentialitate`
 * i-ar întoarce verificatorului un shell gol. Aceeași cale ca la blog (`scripts/build-blog.ts`).
 *
 * Regula de conținut: **nimic inventat**. Fiecare afirmație de aici se poate verifica în cod sau în
 * configurația de producție — furnizorii sunt cei din variabilele de mediu reale (Vercel, Supabase
 * eu-central-2, Resend, OpenAI), scope-ul Google e cel cerut de `server/lib/par/googleDrive.ts`,
 * criptarea e cea din `server/lib/crypto.ts`. Dacă schimbi unul dintre ele în cod, schimbă-l și aici.
 */

export interface LegalPage {
  /** Ruta publică, fără slash: `/confidentialitate`. */
  slug: string;
  title: string;
  description: string;
  /** ISO, afișată ca „Ultima actualizare". */
  updated: string;
  /** Corpul paginii, HTML gata scris. */
  body: string;
}

const UPDATED = "2026-09-20";

/** Blocul de identificare a operatorului — același în ambele documente. */
const OPERATOR = `
<p>
  FinFlow este operat de <strong>Vector Academy SRL</strong>, care funcționează prin două entități:
</p>
<ul>
  <li><strong>România</strong> — București, Sector 4, Str. Povestei nr. 10 · +40 750 263 177</li>
  <li><strong>Republica Moldova</strong> — mun. Chișinău, sec. Centru, str. 31 August 1989 nr. 78 · +373 696 76 588</li>
</ul>
<p>
  Pentru orice întrebare legată de acest document, inclusiv exercitarea drepturilor descrise mai jos,
  scrie la <a href="mailto:contact@finflow.best">contact@finflow.best</a>.
</p>`;

const PRIVACY_BODY = `<main class="wrap wrap--article">
  <article>
    <nav class="breadcrumb" aria-label="Firul Ariadnei">
      <a href="/business">FinFlow</a> · Confidențialitate
    </nav>

    <h1 style="margin-top:1rem">Politica de confidențialitate</h1>
    <div class="meta meta--row">
      <span>Ultima actualizare <time datetime="${UPDATED}">20 septembrie 2026</time></span>
    </div>

    <p>
      FinFlow este o aplicație de business prin care o organizație își gestionează cererile interne
      de plată: cine cere, cine aprobă, ce documente justifică plata și când s-a plătit. Documentul
      de față explică ce date ajung la noi, de ce, cu cine le împărțim și ce poți cere să facem cu ele.
    </p>

    <h2>1. Cine suntem</h2>
    ${OPERATOR}
    <p>
      În raport cu datele introduse de angajații unei organizații în propriul spațiu de lucru, acea
      organizație este <em>operatorul</em>, iar noi suntem <em>persoana împuternicită</em>: prelucrăm
      datele la instrucțiunea ei, ca să funcționeze serviciul.
    </p>

    <h2>2. Ce date prelucrăm</h2>
    <ul>
      <li><strong>Date de cont</strong> — nume, adresă de e-mail, rolul în organizație, jurnalul autentificărilor.</li>
      <li><strong>Datele cererilor de plată</strong> — sume, furnizori, proiecte, coduri bugetare, rechizitele
        beneficiarului (inclusiv IBAN și, unde organizația îl completează, IDNP), deciziile de aprobare
        și comentariile.</li>
      <li><strong>Documentele atașate</strong> — contracte, facturi, acte de recepție, ordine de plată,
        încărcate de utilizatori.</li>
      <li><strong>Date tehnice</strong> — adresa IP, tipul browserului și jurnale de eroare, păstrate
        pentru securitate și depanare.</li>
    </ul>
    <p>
      Nu folosim cookie-uri de publicitate și nu urmărim comportamentul pe alte site-uri. Cookie-urile
      pe care le punem țin exclusiv de sesiunea de autentificare și de protecția împotriva CSRF.
    </p>

    <h2>3. Pe ce temei</h2>
    <ul>
      <li><strong>Executarea contractului</strong> — ca serviciul să funcționeze pentru organizația care l-a contractat.</li>
      <li><strong>Interes legitim</strong> — securitatea sistemului, prevenirea fraudei, jurnalele de audit.</li>
      <li><strong>Consimțământ</strong> — pentru integrările opționale, cum e conectarea Google Drive de mai jos.
        Consimțământul poate fi retras oricând, fără să afecteze restul serviciului.</li>
    </ul>

    <h2 id="integrarea-google-drive">4. Integrarea cu Google Drive și datele din contul tău Google</h2>
    <p>
      Conectarea Google Drive este <strong>opțională</strong> și o pornește doar un administrator al
      spațiului de lucru. Ea există pentru un singur lucru: ca dosarele cererilor <em>plătite</em> să
      fie copiate săptămânal, ca fișiere PDF, în Drive-ul organizației.
    </p>
    <h3>Ce permisiune cerem</h3>
    <p>
      Cerem un singur domeniu de acces Google: <code>https://www.googleapis.com/auth/drive.file</code>.
      El permite aplicației să vadă și să modifice <strong>exclusiv fișierele și folderele create de ea</strong>.
      Nu cerem și nu putem obține acces la restul documentelor din Drive-ul tău, la Gmail, la Contacte
      sau la Calendar.
    </p>
    <h3>Ce facem concret cu el</h3>
    <ul>
      <li>Creăm un folder-rădăcină (implicit „Dosare PAR plătite") și, în el, subfoldere pe proiect,
        eveniment și status, identice cu cele din aplicație.</li>
      <li>Urcăm în ele dosarul PDF al fiecărei cereri plătite. Un dosar deja urcat se actualizează în
        același fișier, nu se duplică.</li>
      <li>Citim doar metadatele fișierelor create de noi (existență, identificator), ca să știm ce am
        urcat deja. Nu citim conținutul altor fișiere.</li>
    </ul>
    <h3>Ce stocăm de la Google</h3>
    <p>
      Păstrăm adresa de e-mail a contului conectat (ca să știi în al cui Drive scriem), identificatorii
      folderelor și fișierelor create de noi, și un token de reîmprospătare care ne permite să rulăm
      sincronizarea săptămânală fără să te logăm de fiecare dată. Token-ul este
      <strong>criptat cu AES-256-GCM</strong> înainte de a fi scris în baza de date și nu părăsește
      niciodată serverul.
    </p>
    <h3>Cum retragi accesul</h3>
    <p>
      Din aplicație, pagina <em>Google Drive</em> → <strong>Deconectează</strong>: revocăm token-ul la
      Google și ștergem tot ce știam despre Drive-ul tău. Fișierele deja urcate rămân în Drive — sunt
      documentele organizației, nu ale noastre. Poți revoca accesul și direct din
      <a href="https://myaccount.google.com/permissions" rel="noopener">contul tău Google</a>.
    </p>
    <h3>Limited Use</h3>
    <p>
      Utilizarea și transferul de către FinFlow al informațiilor primite prin API-urile Google respectă
      <a href="https://developers.google.com/terms/api-services-user-data-policy" rel="noopener">Google API Services User Data Policy</a>,
      inclusiv cerințele privind utilizarea limitată (<em>Limited Use</em>). Concret: nu vindem aceste
      date, nu le folosim pentru publicitate, nu le transferăm altcuiva în afara cazurilor necesare
      furnizării serviciului sau impuse de lege și nu le folosim pentru antrenarea unor modele de
      inteligență artificială.
    </p>
    <p class="note note--neutral">
      <em>
        FinFlow's use and transfer of information received from Google APIs to any other app will
        adhere to the Google API Services User Data Policy, including the Limited Use requirements.
      </em>
    </p>

    <h2>5. Cu cine împărțim datele</h2>
    <p>Folosim furnizori de infrastructură, fiecare cu un rol strict:</p>
    <ul>
      <li><strong>Vercel</strong> — găzduirea aplicației și livrarea paginilor.</li>
      <li><strong>Supabase</strong> — baza de date. Instanța de producție rulează în Europa, regiunea
        AWS <code>eu-central-2</code> (Zürich).</li>
      <li><strong>Resend</strong> — trimiterea e-mailurilor tranzacționale (invitații, notificări de aprobare).</li>
      <li><strong>OpenAI</strong> — extragerea automată a datelor din documentele încărcate (de exemplu
        rechizitele dintr-o factură), atunci când utilizatorul cere asta. Fiecare apel este înregistrat
        în jurnalul intern de audit. Furnizorul este stabilit în Statele Unite, iar transferul se face
        în temeiul clauzelor contractuale standard ale Comisiei Europene.</li>
      <li><strong>Google</strong> — doar dacă ai conectat Drive-ul, și doar în limitele de la punctul 4.</li>
    </ul>
    <p>Nu vindem date și nu le dăm agențiilor de publicitate. Nu există așa ceva în modelul nostru de business.</p>

    <h2>6. Cât timp păstrăm datele</h2>
    <p>
      Datele unui spațiu de lucru se păstrează cât timp organizația folosește serviciul. La încetarea
      contractului le ștergem în cel mult 90 de zile, cu excepția a ceea ce trebuie păstrat prin lege
      (de exemplu documente contabile). Jurnalele tehnice se păstrează maximum 12 luni. Jurnalul de
      audit al cererilor este, prin natura lui, append-only: el arată cine ce a aprobat și când, iar
      ștergerea lui ar goli de sens controlul financiar.
    </p>

    <h2>7. Securitate</h2>
    <ul>
      <li>Traficul este criptat în tranzit (HTTPS/TLS).</li>
      <li>Secretele la rest — token-uri de integrare, credențiale — sunt criptate cu AES-256-GCM.</li>
      <li>Parolele sunt stocate ca hash, niciodată în clar. Autentificarea în doi pași este disponibilă.</li>
      <li>Accesul la date este limitat pe rol: rechizitele bancare ale unui beneficiar le vede doar cine
        are treabă cu cererea respectivă.</li>
      <li>Fiecare descărcare a unui dosar complet este înregistrată.</li>
    </ul>

    <h2>8. Drepturile tale</h2>
    <p>
      Conform Regulamentului (UE) 2016/679 și Legii nr. 133/2011 a Republicii Moldova privind protecția
      datelor cu caracter personal, ai dreptul de acces, rectificare, ștergere, restricționare,
      portabilitate și opoziție. Cererile se trimit la
      <a href="mailto:contact@finflow.best">contact@finflow.best</a> și primesc răspuns în cel mult 30 de zile.
    </p>
    <p>
      Dacă ești angajatul unei organizații care folosește FinFlow, adresează-te întâi organizației tale:
      ea decide ce date introduce în sistem. Ai dreptul de a depune plângere la autoritatea de
      supraveghere competentă — ANSPDCP în România, Centrul Național pentru Protecția Datelor cu
      Caracter Personal în Republica Moldova.
    </p>

    <h2>9. Modificări</h2>
    <p>
      Când schimbăm acest document, actualizăm data de sus. Modificările importante — furnizori noi,
      categorii noi de date, permisiuni noi cerute — sunt anunțate în aplicație înainte să intre în vigoare.
    </p>
  </article>
</main>`;

const TERMS_BODY = `<main class="wrap wrap--article">
  <article>
    <nav class="breadcrumb" aria-label="Firul Ariadnei">
      <a href="/business">FinFlow</a> · Termeni
    </nav>

    <h1 style="margin-top:1rem">Termeni și condiții de utilizare</h1>
    <div class="meta meta--row">
      <span>Ultima actualizare <time datetime="${UPDATED}">20 septembrie 2026</time></span>
    </div>

    <p>
      Acești termeni guvernează folosirea aplicației FinFlow, disponibilă la
      <a href="https://www.finflow.best/business">finflow.best</a>. Prin crearea unui cont sau prin
      folosirea serviciului, organizația ta și utilizatorii ei acceptă cele de mai jos.
    </p>

    <h2>1. Cine oferă serviciul</h2>
    ${OPERATOR}

    <h2>2. Ce este FinFlow</h2>
    <p>
      O aplicație web prin care o organizație înregistrează cereri interne de plată, le trimite pe un
      traseu de aprobare, atașează documentele justificative și ține evidența plăților. Serviciul este
      un instrument de organizare și control intern. <strong>Nu este un serviciu de plăți</strong>: nu
      inițiem și nu executăm transferuri de bani, nu ținem fonduri și nu înlocuim banca sau contabilul
      organizației.
    </p>

    <h2>3. Conturi și acces</h2>
    <ul>
      <li>Conturile sunt nominale. Nu împărți credențialele cu alte persoane.</li>
      <li>Administratorul spațiului de lucru decide cine intră, cu ce rol și ce limite de aprobare are.</li>
      <li>Ești responsabil de acuratețea datelor introduse și de păstrarea în siguranță a parolei.</li>
      <li>Ne anunți fără întârziere la <a href="mailto:contact@finflow.best">contact@finflow.best</a>
        dacă bănuiești un acces neautorizat.</li>
    </ul>

    <h2>4. Prețuri și plată</h2>
    <p>
      Abonamentul se calculează lunar, pe utilizator activ: 20 USD pentru utilizatorii cu rol de decizie
      (aprobator, finanțe, administrator) și 5 USD pentru ceilalți membri ai echipei. Prețurile afișate
      nu includ taxele aplicabile. Orice schimbare de preț se anunță cu cel puțin 30 de zile înainte și
      nu se aplică perioadei deja plătite.
    </p>

    <h2>5. Utilizare acceptabilă</h2>
    <p>Folosind serviciul, te angajezi să nu:</p>
    <ul>
      <li>încarci conținut ilegal sau date pentru care nu ai temei legal de prelucrare;</li>
      <li>încerci să accesezi spații de lucru sau conturi care nu îți aparțin;</li>
      <li>supui infrastructura unor sarcini automate care o degradează pentru ceilalți;</li>
      <li>revinzi sau redistribui serviciul fără acordul nostru scris.</li>
    </ul>

    <h2>6. Datele tale rămân ale tale</h2>
    <p>
      Conținutul introdus în spațiul de lucru aparține organizației. Noi îl prelucrăm doar ca să
      furnizăm serviciul, conform
      <a href="/confidentialitate">Politicii de confidențialitate</a>. Poți exporta datele în orice
      moment din aplicație și poți cere ștergerea lor la încetarea contractului.
    </p>

    <h2>7. Integrări opționale</h2>
    <p>
      Serviciul poate fi conectat la Google Drive, pentru copierea automată a dosarelor plătite.
      Conectarea o pornește un administrator, cere consimțământ explicit în ecranul Google și poate fi
      revocată oricând din aplicație sau din contul Google. Detaliile permisiunii cerute sunt în
      <a href="/confidentialitate#integrarea-google-drive">Politica de confidențialitate</a>.
    </p>

    <h2>8. Disponibilitate</h2>
    <p>
      Depunem eforturi rezonabile ca serviciul să fie disponibil continuu, dar nu garantăm funcționare
      neîntreruptă. Putem face întreruperi programate pentru mentenanță, anunțate în prealabil când
      sunt previzibile. Serviciul este furnizat „ca atare", fără garanții implicite de potrivire pentru
      un scop anume.
    </p>

    <h2>9. Limitarea răspunderii</h2>
    <p>
      Deciziile financiare rămân ale organizației: FinFlow arată, ordonează și păstrează informația, dar
      nu verifică realitatea economică a unei plăți. În limitele permise de lege, răspunderea noastră
      totală pentru orice pretenție legată de serviciu este limitată la suma plătită de organizație în
      ultimele 12 luni. Nu răspundem pentru pierderi indirecte, beneficii nerealizate sau pierderi de
      date rezultate din folosirea greșită a serviciului.
    </p>

    <h2>10. Încetare</h2>
    <p>
      Poți înceta folosirea serviciului oricând, anunțându-ne. Putem suspenda un cont care încalcă
      punctul 5 sau care are facturi neachitate, după o notificare prealabilă. După încetare, datele se
      păstrează și se șterg conform termenelor din Politica de confidențialitate.
    </p>

    <h2>11. Legea aplicabilă și modificări</h2>
    <p>
      Raportul contractual este guvernat de legea română, iar litigiile care nu se pot rezolva pe cale
      amiabilă se soluționează de instanțele competente de la sediul Vector Academy SRL România, cu
      excepția cazului în care contractul semnat cu organizația prevede altceva — acel contract
      prevalează față de prezentul document. Când modificăm acești termeni, actualizăm data de sus și
      anunțăm schimbările importante în aplicație.
    </p>

    <h2>12. Contact</h2>
    <p>
      <a href="mailto:contact@finflow.best">contact@finflow.best</a>
    </p>
  </article>
</main>`;

export const LEGAL_PAGES: LegalPage[] = [
  {
    slug: "confidentialitate",
    title: "Politica de confidențialitate — FinFlow",
    description:
      "Ce date prelucrează FinFlow, pe ce temei, cu cine le împarte și ce permisiuni cere la conectarea Google Drive.",
    updated: UPDATED,
    body: PRIVACY_BODY,
  },
  {
    slug: "termeni",
    title: "Termeni și condiții — FinFlow",
    description:
      "Condițiile de utilizare a FinFlow: conturi, prețuri, utilizare acceptabilă, disponibilitate și răspundere.",
    updated: UPDATED,
    body: TERMS_BODY,
  },
];
