import type { Article } from "./types";

export const article: Article = {
  slug: "dosarul-unei-plati",
  title: "Ce trebuie să conțină dosarul unei plăți ca să reziste peste doi ani",
  metaTitle: "Dosarul unei plăți: ce documente aduni ca să treci de un audit de grant",
  metaDescription:
    "Cheltuiala corectă, dar nedocumentată, devine cheltuială respinsă. Ce cer efectiv contractele-tip ale finanțatorilor mari, citat, și ce pui în dosar la fiecare plată.",
  lang: "ro",
  market: "Republica Moldova",
  cluster: "conformitate",
  addressesFear:
    "Că banii au fost cheltuiți corect, dar peste doi ani nu mai poți demonstra asta — și cheltuiala e declarată neeligibilă.",
  stage: 5,
  primaryQuery: "documente justificative audit grant ong",
  author: "Echipa editorială FinFlow",
  datePublished: "2026-08-29",
  lastVerified: "2026-08-29",
  refreshEvery: 6,
  requiresExpertReview: false,
  reviewStatus: "not-applicable",
  published: true,
  leadMagnet: {
    ask: "pregatire-audit",
    heading: "Vrei lista de dosar pe tipurile tale de cheltuieli?",
    promise:
      "Spune-ne ce categorii de cheltuieli aveți (personal, servicii, deplasări, echipamente) și cine e finanțatorul. Îți trimitem lista de documente per categorie, cu trimitere la clauza din contractul-tip, în trei zile lucrătoare. Nu ne trimite documente reale.",
    buttonLabel: "Cere lista pe cheltuielile mele",
    emailSubject: "Lista de documente per cheltuială — din ghidul despre dosarul unei plăți",
  },
  sources: [
    {
      label:
        "Comisia Europeană — Annotated Grant Agreement (AGA), versiunea 2.0 din 1 aprilie 2025",
      url: "https://ec.europa.eu/info/funding-tenders/opportunities/docs/2021-2027/common/guidance/aga_en.pdf",
      checked: "2026-08-29",
      locator: "Articolul 20.1 din modelul de grant și adnotările la articolul 20",
    },
    {
      label:
        "Condițiile generale aplicabile contractelor de grant finanțate de UE pentru acțiuni externe (Anexa II)",
      url: "https://www.eeas.europa.eu/sites/default/files/e3h2_gencond_en_0.pdf",
      checked: "2026-08-29",
      locator: "Articolele 16.1, 16.9 și 16.10",
    },
    {
      label: "Regulamentul financiar al UE — Regulamentul (UE, Euratom) 2024/2509",
      url: "https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX%3A32024R2509",
      checked: "2026-08-29",
      locator: "Articolul 189 alineatul (3) și articolul 133",
    },
    {
      label: "2 CFR § 200.403 — criteriile de eligibilitate a costurilor (Uniform Guidance, SUA)",
      url: "https://www.law.cornell.edu/cfr/text/2/200.403",
      checked: "2026-08-29",
      locator: "Litera (g): „Be adequately documented”",
    },
    {
      label:
        "Indicații metodice privind particularitățile contabilității în organizațiile necomerciale (Ordinul ministrului finanțelor nr. 188 din 30.12.2014)",
      url: "https://mf.gov.md/ro/content/ordin-cu-privire-la-aprobarea-indica%C5%A3iilor-metodice-privind-particularit%C4%83%C5%A3ile-contabilit%C4%83%C5%A3ii",
      checked: "2026-08-29",
      locator: "Punctul 16 — delimitarea și înregistrarea separată a mijloacelor cu destinație specială",
    },
  ],
  body: [
    {
      kind: "answer",
      text:
        "Un dosar rezistă dacă un om care nu a fost acolo poate reface, din el singur, întregul traseu: de ce s-a cheltuit, cine a decis, ce s-a primit, cât s-a plătit și din ce bani. Practic, asta înseamnă cinci documente legate între ele prin același număr de referință. Regula pe care o testează auditorul nu e „aveți factura”, ci dacă suma din raport se poate reconcilia direct cu contabilitatea și cu documentele — reconcilierea e chiar cuvântul folosit în contractul-tip al Comisiei Europene.",
    },
    {
      kind: "takeaways",
      items: [
        "Contractul-tip al Comisiei cere ca procedurile interne să permită reconcilierea directă între suma declarată, cea din contabilitate și cea din documentele justificative.",
        "Regulile americane spun același lucru în trei cuvinte: costul trebuie să fie „adequately documented” ca să fie eligibil.",
        "Condițiile pentru acțiuni externe enumeră explicit ce se cere la verificare, inclusiv dovada plății — extras de cont, nu doar factura.",
        "Pentru un ONG din Moldova, separarea pe proiect nu e doar o cerință a donatorului: contabilitatea trebuie să delimiteze mijloacele cu destinație specială.",
        "Documentul care lipsește cel mai des nu e factura, e dovada că cineva a primit ce s-a plătit.",
      ],
    },

    { kind: "heading", id: "ce-cere-finantatorul", text: "Ce cer, textual, contractele-tip" },
    {
      kind: "paragraph",
      text:
        "Merită citite în original, pentru că formulările sunt mai concrete decât se așteaptă majoritatea. Modelul de grant al Comisiei Europene cere beneficiarului să păstreze evidențe și documente justificative adecvate — contracte, subcontracte, facturi, înregistrări contabile — și, în plus, ca procedurile obișnuite de contabilitate și de control intern să permită reconcilierea directă între sumele declarate, sumele din conturi și sumele din documentele justificative. Adnotările merg mai departe: dovezile trebuie să fie suficiente și adecvate, iar costurile nesusținute de dovezi adecvate se resping.",
    },
    {
      kind: "paragraph",
      text:
        "Condițiile generale pentru acțiuni externe sunt și mai explicite despre ce anume se cere la o verificare: registre contabile, dovada plății sub formă de extrase de cont sau avize de debit, contracte, state de plată și fișe de pontaj. Iar nerespectarea acestor obligații e calificată în contract drept încălcarea unei obligații substanțiale — cu efecte care merg până la reducerea grantului.",
    },
    {
      kind: "note",
      tone: "caution",
      text:
        "Toate citatele de mai sus sunt din contracte-tip publice. Contractul tău poate să difere, iar ce contează pentru tine e textul din anexa ta, nu modelul general. Deschide-l o dată, la începutul proiectului, nu în săptămâna auditului.",
    },

    { kind: "heading", id: "cele-cinci", text: "Cele cinci documente, legate prin aceeași referință" },
    {
      kind: "checklist",
      heading: "Dosarul unei plăți",
      items: [
        {
          check: "Documentul care justifică angajamentul",
          why: "Contract, comandă acceptată sau ofertă aprobată. Explică de ce datorați banii. Fără el, plata pare o decizie spontană.",
        },
        {
          check: "Dovada că selecția furnizorului a respectat regula voastră",
          why: "Trei oferte, notă de justificare sau referință la procedură. E documentul pe care organizațiile îl produc cel mai greu retroactiv, pentru că datele nu se mai pot inventa credibil.",
        },
        {
          check: "Confirmarea că s-a primit ce s-a comandat",
          why: "Act de predare-primire, raport acceptat, listă de participanți. Documentul lipsă în cele mai multe dosare respinse.",
        },
        {
          check: "Factura sau documentul primar echivalent",
          why: "Singurul pe care toată lumea îl are. Singur, nu dovedește nici livrarea, nici decizia.",
        },
        {
          check: "Dovada plății",
          why: "Extras de cont sau ordin de plată executat. Condițiile pentru acțiuni externe îl cer nominal: „proof of payment such as bank statements”.",
        },
        {
          check: "Urma aprobării: cine a cerut, cine a aprobat, când",
          why: "Nu apare în lista clasică de documente, dar e ce transformă un teanc într-un dosar. Fără el, nu poți răspunde la întrebarea pe care o pune orice auditor: cine a decis asta?",
        },
      ],
    },
    {
      kind: "paragraph",
      text:
        "Legătura dintre ele contează la fel de mult ca existența lor. Dacă fiecare document poartă aceeași referință — numărul cererii de plată — dosarul se poate reconstitui în cinci minute, chiar de către cineva nou. Dacă nu, cineva va petrece o zi punând în ordine cinci fișiere care se referă la aceeași plată sub cinci nume diferite.",
      links: [{ phrase: "numărul cererii de plată", href: "/blog/verificarea-facturii-inainte-de-plata" }],
    },

    { kind: "heading", id: "separarea-pe-proiect", text: "Separarea pe proiect nu e doar cerința donatorului" },
    {
      kind: "paragraph",
      text:
        "Mulți directori de ONG cred că evidența pe proiect e o pretenție a finanțatorului. În Republica Moldova există și o cerință proprie: indicațiile metodice privind particularitățile contabilității în organizațiile necomerciale prevăd că evidența trebuie să asigure delimitarea și înregistrarea separată a mijloacelor cu destinație specială, a căror utilizare e condiționată de realizarea unor misiuni speciale — inclusiv finanțarea unor programe sau proiecte concrete.",
    },
    {
      kind: "paragraph",
      text:
        "Consecința practică e simplă și e ușor de ratat: dacă evidența ta nu poate arăta separat ce s-a cheltuit din fiecare finanțare, problema nu apare doar la raportarea către donator. Apare și în propria contabilitate, iar acolo nu ai cui să ceri o prelungire de termen.",
    },

    { kind: "heading", id: "cat-pastrezi", text: "Cât timp păstrezi" },
    {
      kind: "paragraph",
      text:
        "Termenele diferă și nu se anulează unele pe altele. Regulamentul financiar al UE cere cinci ani de la plata soldului, sau trei ani pentru finanțări sub 60.000 de euro, cu prelungire până la închiderea oricărui audit sau litigiu. Contractele-tip americane pentru organizații neamericane cer trei ani de la raportul financiar final. Adnotările Comisiei precizează explicit că regulile grantului nu absolvă beneficiarul de obligațiile din legislația națională, de exemplu acolo unde legea națională cere o perioadă mai lungă.",
    },
    {
      kind: "note",
      tone: "caution",
      text:
        "Pentru termenul din legislația Republicii Moldova nu îți dăm o cifră aici. Legea contabilității trimite la regulile organului de stat pentru arhive, iar noi nu am putut deschide actul arhivistic în original ca să-l cităm corect. Surse publice indică un termen mai lung decât cel cerut de donatori — deci întreabă-ți contabilul înainte să distrugi ceva, nu articolul de față. Un dosar distrus la trei ani „pentru că așa scria în contractul de grant” poate încălca o regulă națională care cere mai mult.",
    },

    {
      kind: "faq",
      items: [
        {
          q: "Scanarea ține loc de original?",
          a: "Depinde de finanțator și de regulile naționale de arhivare, iar cele două pot să nu coincidă. Regula sigură pentru un ONG din Moldova: păstrează originalele documentelor primare și lucrează cu copii digitale pentru fluxul zilnic, până când contabilul tău confirmă altceva în scris.",
        },
        {
          q: "Ce fac dacă lipsește un document dintr-o cheltuială veche?",
          a: "Îl reconstitui în ordinea în care se poate: extras bancar de la bancă, duplicat de factură de la furnizor, declarație internă pentru confirmarea primirii. Ce nu se poate reconstitui — de regulă dovada selecției furnizorului — se semnalează, nu se fabrică. O notă explicativă onestă costă mai puțin decât un document creat retroactiv și descoperit ca atare.",
        },
        {
          q: "Auditorul chiar cere toate cele cinci documente?",
          a: "Auditorul verifică pe eșantion, dar pentru operațiunile din eșantion cere tot traseul. De aceea nu ajută să ai dosare complete pentru plățile mari și incomplete pentru cele mici: nu tu alegi eșantionul.",
        },
        {
          q: "Cum arată asta într-un sistem?",
          a: "Dosarul se formează pe măsură ce plata trece prin flux: documentul se atașează la cerere, aprobarea rămâne în istoric, plata se leagă de extras. Diferența nu e că documentele apar din senin, ci că nu mai trebuie adunate din trei locuri peste doi ani.",
        },
      ],
    },
    {
      kind: "cta",
      text:
        "În FinFlow, dosarul se construiește singur: cererea, documentul, aprobarea și plata rămân legate sub aceeași referință, iar exportul pentru audit e o listă, nu o arheologie.",
      label: "Intră în FinFlow și vezi dosarul unei plăți",
      href: "/#/business/login",
    },
    {
      kind: "related",
      slugs: [
        "verificarea-facturii-inainte-de-plata",
        "separarea-atributiilor-in-echipa-mica",
        "inchiderea-lunii-fara-vanatoare-de-documente",
      ],
    },
  ],
};
