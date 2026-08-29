import type { Article } from "./types";

export const article: Article = {
  slug: "frauda-prin-schimbarea-ibanului",
  title: "„Am schimbat banca, plătiți în contul nou” — cum se fură o plată dintr-un email",
  metaTitle: "Frauda prin schimbarea IBAN-ului: cum funcționează și cum o oprești",
  metaDescription:
    "Nu-ți sparge nimeni contul: ți se schimbă contul furnizorului dintr-un email. Cum arată atacul, de ce banca nu îți întoarce banii și procedura de verificare care îl oprește.",
  lang: "ro",
  market: "Republica Moldova",
  cluster: "risc",
  addressesFear:
    "Că o plată aprobată corect, de omul potrivit, poate pleca spre contul unui escroc — și că nimeni nu o mai poate întoarce.",
  stage: 2,
  primaryQuery: "frauda schimbarea ibanului factura",
  author: "Echipa editorială FinFlow",
  datePublished: "2026-08-29",
  lastVerified: "2026-08-29",
  refreshEvery: 6,
  requiresExpertReview: false,
  reviewStatus: "not-applicable",
  published: true,
  leadMagnet: {
    ask: "checklist-verificare",
    heading: "Vrei procedura de verificare adaptată echipei tale?",
    promise:
      "Scrie-ne câți oameni pregătesc plăți și câți le aprobă. Îți trimitem procedura de mai jos rescrisă pe rolurile voastre reale, în două zile lucrătoare, ca document pe care îl poți aproba intern.",
    buttonLabel: "Cere procedura pe rolurile mele",
    emailSubject: "Procedura de verificare a rechizitelor — din ghidul despre frauda cu IBAN",
  },
  sources: [
    {
      label: "Europol & European Banking Federation — fișa „Invoice fraud” (campania #CyberScams)",
      url: "https://www.europol.europa.eu/cms/sites/default/files/documents/ie.pdf",
      checked: "2026-08-29",
      locator: "Secțiunile „How does it work?” și „What can you do?”",
    },
    {
      label: "Europol — European Financial and Economic Crime Threat Assessment",
      url: "https://www.europol.europa.eu/cms/sites/default/files/documents/The%20Other%20Side%20of%20the%20Coin%20-%20Analysis%20of%20Financial%20and%20Economic%20Crime%20(EN).pdf",
      checked: "2026-08-29",
      locator: "Secțiunea Business Email Compromise / payment diversion fraud",
    },
    {
      label: "Poliția Română — Recomandări pentru prevenirea Business E-mail Compromise Fraud",
      url: "https://politiaromana.ro/ro/comunicate/recomandari-pentru-prevenirea-business-e-mail-compromise-fraud",
      checked: "2026-08-29",
    },
    {
      label: "Poliția Republicii Moldova — „Atenție la frauda «BEC Fraud»”, 4 noiembrie 2020 (pagina originală nu mai răspunde; link către arhivă)",
      url: "https://web.archive.org/web/20241101145254/https://politia.md/ro/content/atentie-la-frauda-bec-fraud",
      checked: "2026-08-29",
    },
  ],
  body: [
    {
      kind: "answer",
      text:
        "Atacul nu are nevoie să spargă contul tău. Îi ajunge să intre pe emailul furnizorului tău — sau doar să imite adresa lui — și să trimită, la momentul potrivit, o factură reală cu un IBAN schimbat. Plata pleacă aprobată corect, de omul potrivit, la suma potrivită, spre contul greșit. Singurul lucru care o oprește este o regulă banală: orice schimbare de rechizite se confirmă pe alt canal decât cel prin care a venit, la un contact pe care îl aveai dinainte.",
    },
    {
      kind: "takeaways",
      items: [
        "Nu e o spargere de cont. Europol numește mecanismul „payment diversion fraud”: aceeași factură, contul modificat.",
        "Poliția Română a constatat că, în aproape toate cazurile semnalate, sistemul compromis a fost al partenerului extern — nu al firmei din țară.",
        "În Spațiul Economic European, manipularea plătitorului a ajuns la 74% din valoarea transferurilor frauduloase în 2024, iar circa 85% din pierderi rămân la client, nu la bancă.",
        "În UE, băncile vor fi obligate să verifice potrivirea IBAN–nume; pentru statele din afara zonei euro termenul e 9 iulie 2027. În Moldova nu există o obligație echivalentă — verificarea rămâne integral la tine.",
        "Apărarea care funcționează are trei părți: un canal secundar de confirmare, un prag de la care confirmarea e obligatorie, și un om diferit de cel care a primit emailul.",
      ],
    },

    { kind: "heading", id: "cum-arata", text: "Cum arată atacul, pas cu pas" },
    {
      kind: "paragraph",
      text:
        "Descrierea de mai jos nu e o reconstituire de-a noastră. E mecanismul pe care Europol îl documentează în fișa despre frauda cu facturi: cineva se prezintă drept furnizorul, creditorul sau prestatorul tău și cere ca rechizitele bancare pentru facturile viitoare să fie schimbate, iar contul propus e controlat de el.",
    },
    {
      kind: "steps",
      heading: "Cele patru mișcări",
      items: [
        {
          role: "Atacatorul",
          action: "Intră în corespondența dintre voi",
          detail:
            "Fie compromite căsuța de email a cuiva din firma furnizorului, fie înregistrează un domeniu care seamănă cu al lui — o literă în plus, un „rn” în loc de „m”, .net în loc de .md. Poliția Republicii Moldova descria exact acest tipar în 2020: monitorizarea corespondenței reale și simularea ei printr-o adresă asemănătoare sau identică.",
        },
        {
          role: "Atacatorul",
          action: "Așteaptă. Uneori săptămâni",
          detail:
            "Nu inventează o factură. Așteaptă una reală, dintr-un contract real, cu o sumă pe care o așteptai oricum. Asta e diferența față de spam: nimic nu pare neobișnuit, pentru că nimic nu este neobișnuit, în afară de o linie.",
        },
        {
          role: "Atacatorul",
          action: "Trimite schimbarea de rechizite",
          detail:
            "„Ne-am schimbat banca”, „contul vechi e blocat de un control”, „vă rugăm plătiți în noul cont, atașăm factura corectată”. Adesea cu grabă și cu o justificare care descurajează întrebările.",
        },
        {
          role: "Tu",
          action: "Plătești, corect, în contul greșit",
          detail:
            "Contabila pregătește ordinul, directorul îl semnează, banca îl execută. Nimeni nu a greșit nimic în procesul intern. Procesul intern pur și simplu nu avea un pas care să verifice IBAN-ul.",
        },
      ],
    },
    {
      kind: "note",
      tone: "caution",
      text:
        "Nuanța care schimbă totul: nu trebuie să fii tu spart. Poliția Română a constatat că, în aproape toate cazurile semnalate, compromiterea emailului a avut loc la societățile străine partenere. Securitatea ta informatică poate fi impecabilă și tot pierzi banii, pentru că punctul slab e căsuța de email a altcuiva.",
    },

    { kind: "heading", id: "cine-plateste", text: "Cine rămâne cu paguba" },
    {
      kind: "paragraph",
      text:
        "Aici e partea pe care oamenii o află prea târziu. Plata a fost autorizată de persoana îndreptățită, către un IBAN valid, cu suma corectă. Din perspectiva băncii, ordinul a fost executat exact cum a fost dat. Cifrele europene arată unde cade paguba în acest tip de fraudă.",
    },
    {
      kind: "figureTable",
      caption:
        "Citește a treia coloană înainte de a doua: fiecare cifră descrie alt teritoriu și alt an. Niciuna nu e o statistică despre Moldova de azi.",
      figureIds: [
        "eba-manipulation-share-2024",
        "eba-loss-borne-by-user-2024",
        "ic3-bec-loss-2025",
        "politia-md-bec-2020",
        "politia-md-bec-2020-prejudiciu",
      ],
    },
    {
      kind: "paragraph",
      text:
        "Din 2027, băncile din statele UE din afara zonei euro vor fi obligate să te avertizeze când numele beneficiarului nu se potrivește cu IBAN-ul introdus. Moldova nu intră sub acea obligație, deși din 6 octombrie 2025 face parte din SEPA — sunt lucruri diferite, iar aderarea la SEPA nu aduce cu ea verificarea beneficiarului. Concluzia practică pentru o organizație din Chișinău: nu aștepta ca banca să prindă greșeala. Nu are cum și, deocamdată, nici obligația.",
    },
    {
      kind: "figureTable",
      caption: "Ce se schimbă în UE și ce nu se schimbă, deocamdată, la noi.",
      figureIds: ["vop-termen-non-euro", "moldova-sepa"],
    },

    { kind: "heading", id: "procedura", text: "Procedura care oprește atacul" },
    {
      kind: "paragraph",
      text:
        "Recomandarea autorităților e remarcabil de constantă, indiferent de țară. Europol: nu folosi datele de contact din scrisoarea, faxul sau emailul care cere schimbarea; folosește-le pe cele din corespondența anterioară. Poliția Română: verifică telefonic la un număr deținut anterior și verificat, și nu răspunde cu „Reply”, ci cu „Forward” și adresa scrisă manual. Poliția Republicii Moldova: informația despre schimbarea rechizitelor se verifică repetat și prin surse de comunicație diferite.",
    },
    {
      kind: "checklist",
      heading: "Ce pui în procedura internă",
      items: [
        {
          check: "Orice schimbare de IBAN se confirmă telefonic, la numărul din contract",
          why: "Numărul din emailul care cere schimbarea aparține, cu mare probabilitate, celui care a scris emailul. Numărul din contractul semnat acum doi ani nu.",
        },
        {
          check: "Confirmarea o face altcineva decât persoana care a primit cererea",
          why: "Cine e deja în conversație a acceptat implicit premisa. Un coleg care sună fără context întreabă altfel.",
        },
        {
          check: "Răspunzi cu „Forward” și adresa tastată manual, nu cu „Reply”",
          why: "„Reply” trimite la adresa din antet — exact cea falsificată. Recomandare explicită a Poliției Române.",
        },
        {
          check: "Peste un prag stabilit, prima plată către un IBAN nou se face de probă",
          why: "O sumă mică, urmată de confirmarea încasării de la furnizor, costă un comision și elimină pierderea totală.",
        },
        {
          check: "IBAN-ul furnizorului trăiește în fișa lui, nu în ultimul email",
          why: "Dacă plata se pregătește copiind din email, atacul are un singur pas de trecut. Dacă se pregătește din fișa furnizorului, atacatorul trebuie să treacă și de procedura de modificare a fișei.",
        },
        {
          check: "Schimbarea fișei lasă urmă: cine, când, pe baza cărui document",
          why: "Fără urmă, după incident nu poți răspunde la singura întrebare care contează — de la ce moment plățile mergeau în altă parte.",
        },
      ],
    },
    {
      kind: "template",
      heading: "Emailul de confirmare, gata de copiat",
      intro:
        "Trimis prin „Forward”, către adresa din contract, nu către cea din cererea de schimbare. Scurt intenționat: nu ceri explicații, ceri o confirmare.",
      text: `Subiect: Confirmare rechizite bancare — contract nr. ____ / ____

Bună ziua,

Am primit pe email o solicitare de modificare a contului bancar pentru facturile
emise de dumneavoastră. Înainte de a opera schimbarea, avem nevoie de o confirmare
pe canal separat.

Vă rugăm să confirmați telefonic, la numărul din contract, sau printr-un email
trimis de la adresa cu care corespondăm din ____ (anul):

1. dacă solicitarea de schimbare a contului vă aparține;
2. ultimele patru cifre ale IBAN-ului corect;
3. persoana din organizația dumneavoastră care a inițiat schimbarea.

Până la confirmare, plățile rămân programate pe contul din contract.

Cu respect,
____________`,
    },
    {
      kind: "note",
      tone: "neutral",
      text:
        "Dacă banii au plecat deja: sună banca în aceeași oră și cere rechemarea transferului, apoi depune plângere la poliție. Recuperarea depinde aproape exclusiv de cât de repede se blochează contul destinatar — orele contează mai mult decât argumentele.",
    },

    { kind: "heading", id: "unde-se-rupe", text: "De ce procedura există pe hârtie și nu se aplică" },
    {
      kind: "paragraph",
      text:
        "Aproape orice organizație pe care o întrebi îți spune că „bineînțeles, verificăm”. Când ceri să vezi unde e scris cine verifică și la ce prag, urmează o pauză. Regula trăiește în capul contabilei, iar în ziua în care contabila e în concediu, plata o pregătește altcineva care nu a auzit niciodată de ea.",
    },
    {
      kind: "paragraph",
      text:
        "De aceea partea care contează nu e textul procedurii, ci locul unde e cerută. O regulă pe care sistemul o cere înainte să lase plata mai departe se aplică singură; una care depinde de memorie se aplică până la primul concediu. Asta e diferența dintre a scrie o politică și a avea un control.",
      links: [
        { phrase: "un control", href: "/blog/cine-aproba-platile-limite-de-aprobare" },
      ],
    },

    {
      kind: "faq",
      items: [
        {
          q: "Banca îmi întoarce banii dacă am plătit într-un cont fals?",
          a: "Nu automat. Ordinul a fost dat de persoana îndreptățită, către un IBAN valid — din perspectiva băncii, execuția a fost corectă. Datele europene arată că, pe transferuri credit, circa 85% din pierderi rămân la client. Recuperarea depinde de rechemarea rapidă a transferului și de blocarea contului destinatar.",
        },
        {
          q: "Cum îmi dau seama că emailul e fals dacă adresa arată identic?",
          a: "De multe ori nu poți, la citire. Tocmai de asta verificarea nu se face în email, ci în afara lui: un telefon la numărul din contract răspunde la întrebare fără să depindă de cât de bine arată adresa expeditorului.",
        },
        {
          q: "Nu e exagerat să sun pentru fiecare schimbare de cont?",
          a: "Schimbările de IBAN sunt rare — de câteva ori pe an, într-o organizație obișnuită. Costul e câteva minute pe an. Comparația corectă nu e cu efortul, ci cu valoarea unei singure facturi plătite greșit.",
        },
        {
          q: "Am nevoie de un sistem ca să fac asta?",
          a: "Nu. Procedura de mai sus funcționează pe hârtie și pe email. Un sistem schimbă un singur lucru, dar unul important: face pasul obligatoriu în loc de recomandat, și lasă urmă cine l-a făcut.",
        },
      ],
    },
    {
      kind: "cta",
      text:
        "În FinFlow, IBAN-ul stă în fișa furnizorului, iar modificarea lui cere confirmare și lasă urmă. Plata nu se pregătește copiind dintr-un email.",
      label: "Intră în FinFlow și vezi fluxul de plată",
      href: "/#/business/login",
    },
    {
      kind: "related",
      slugs: [
        "verificarea-facturii-inainte-de-plata",
        "cine-aproba-platile-limite-de-aprobare",
        "separarea-atributiilor-in-echipa-mica",
      ],
    },
  ],
};
