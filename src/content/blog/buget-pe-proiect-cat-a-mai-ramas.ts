import type { Article } from "./types";

export const article: Article = {
  slug: "buget-pe-proiect-cat-a-mai-ramas",
  title: "„Cât a mai rămas pe linia asta?” — de ce nimeni nu poate răspunde din prima",
  metaTitle: "Buget pe proiect: de ce soldul din contabilitate nu e banul disponibil",
  metaDescription:
    "Contabilitatea arată ce s-a plătit. Bugetul disponibil înseamnă ce s-a plătit minus ce ai promis deja. Registrul de angajamente, în trei coloane, și cum îl ții fără sistem.",
  lang: "ro",
  market: "Republica Moldova",
  cluster: "operational",
  addressesFear:
    "Că descoperi depășirea de buget la raportare, când nu mai poți corecta nimic, și că trebuie să explici finanțatorului o cheltuială pe care n-o mai acoperă nimeni.",
  stage: 1,
  primaryQuery: "buget pe proiect cat a mai ramas angajamente",
  author: "Echipa editorială FinFlow",
  datePublished: "2026-08-29",
  lastVerified: "2026-08-29",
  refreshEvery: 12,
  requiresExpertReview: false,
  reviewStatus: "not-applicable",
  published: true,
  leadMagnet: {
    ask: "evaluare-flux",
    heading: "Vrei registrul de angajamente pe structura bugetului tău?",
    promise:
      "Spune-ne câte proiecte urmăriți și pe ce categorii de cheltuieli raportați. Îți trimitem registrul ca foaie de calcul, cu formulele de disponibil deja scrise, în două zile lucrătoare. Nu ne trimite sume — structura e de ajuns.",
    buttonLabel: "Cere registrul de angajamente",
    emailSubject: "Registrul de angajamente — din ghidul despre bugetul pe proiect",
  },
  sources: [],
  body: [
    {
      kind: "answer",
      text:
        "Întrebarea nu primește răspuns pentru că se pune unui sistem care măsoară altceva. Contabilitatea îți spune ce a ieșit din cont. Ce te interesează pe tine e ce a ieșit plus ce ai promis deja și n-a ieșit încă: contractul semnat luna trecută, comanda plasată ieri, factura primită și neplătită. Diferența dintre cele două cifre e locul unde se nasc depășirile de buget, iar ea se închide cu un singur instrument: un registru al angajamentelor.",
    },
    {
      kind: "takeaways",
      items: [
        "Trei cifre diferite pe aceeași linie: bugetat, angajat, plătit. Doar prima e în buget, doar ultima e în contabilitate; a doua nu e nicăieri.",
        "Disponibilul real = bugetat − angajat, nu bugetat − plătit. Diferența e exact ce te surprinde la sfârșitul proiectului.",
        "Angajamentul se înregistrează când semnezi, nu când plătești. Un contract semnat a consumat deja bugetul.",
        "Fără un loc unde angajamentele sunt vizibile, doi manageri de proiect pot cheltui aceiași bani, fiecare crezând că sunt liberi.",
        "Se ține și în foaie de calcul. Ce nu merge în foaie de calcul e menținerea ei la zi de către mai mult de doi oameni.",
      ],
    },

    { kind: "heading", id: "trei-cifre", text: "Cele trei cifre care nu sunt aceeași cifră" },
    {
      kind: "paragraph",
      text:
        "Ia o linie oarecare: „Servicii de traducere — 120.000 MDL”. La jumătatea proiectului, contabila spune că s-au plătit 45.000. Managerul de proiect spune că mai are 75.000 și planifică o conferință. Amândoi au dreptate, în raport cu ce văd. Ce nu vede niciunul e contractul-cadru semnat în martie, care angajează 60.000 până la finalul anului. Disponibilul real nu e 75.000, e 15.000.",
    },
    {
      kind: "table",
      caption:
        "Aceeași linie, trei perspective. Coloana din mijloc e cea care lipsește din majoritatea organizațiilor — și e singura care răspunde la întrebarea din titlu.",
      head: ["Cifra", "De unde vine", "Ce răspunde", "Când se schimbă"],
      rows: [
        [
          "Bugetat",
          "Bugetul aprobat al proiectului",
          "Cât am voie să cheltui în total",
          "La aprobare și la fiecare revizuire acceptată de finanțator.",
        ],
        [
          "Angajat",
          "Contracte, comenzi, cereri aprobate",
          "Cât am promis deja cuiva",
          "În ziua în care semnezi, nu în ziua în care plătești.",
        ],
        [
          "Plătit",
          "Extrasul de cont / contabilitate",
          "Cât a ieșit efectiv",
          "La execuția plății. Cea mai exactă cifră și cea mai puțin utilă pentru decizie.",
        ],
      ],
    },
    {
      kind: "note",
      tone: "neutral",
      text:
        "Un test de trei minute: ia ultimul contract semnat de organizația ta. Întreabă unde e înregistrat faptul că suma lui e deja promisă. Dacă răspunsul e „în dosarul cu contracte”, angajamentele tale nu sunt urmărite — sunt arhivate.",
    },

    { kind: "heading", id: "registrul", text: "Registrul de angajamente, cu formulele scrise" },
    {
      kind: "paragraph",
      text:
        "Nu ai nevoie de un sistem ca să începi. Ai nevoie de o foaie unde fiecare rând e un angajament, nu o plată, și de trei formule. Structura de mai jos e minimul care funcționează; orice coloană în plus se adaugă doar dacă cineva chiar o citește.",
    },
    {
      kind: "template",
      heading: "Structura foii de angajamente",
      intro:
        "O linie per angajament. Plățile se scad din angajament pe măsură ce se execută, nu formează rânduri noi — altfel nu mai știi ce a rămas de plătit dintr-un contract.",
      text: `COLOANE (una pe angajament):

  A  Data angajamentului        (ziua semnării, nu a plății)
  B  Proiect / finanțator
  C  Linia de buget             (exact denumirea din bugetul aprobat)
  D  Furnizor
  E  Document                   (contract nr., comandă, cerere aprobată)
  F  Suma angajată
  G  Suma plătită până acum     (se actualizează la fiecare plată)
  H  Rest de plătit             = F - G
  I  Statut                     (activ / finalizat / anulat)

FORMULE PE LINIA DE BUGET:

  Angajat total     = SUMIF(C; "<linia>"; F)   pentru statut ≠ anulat
  Plătit total      = SUMIF(C; "<linia>"; G)
  DISPONIBIL REAL   = Bugetat − Angajat total
  Cash de pregătit  = Angajat total − Plătit total

REGULA CARE ȚINE FOAIA VIE:
  Niciun contract nu se semnează înainte să existe rândul în această foaie.
  Nu „după ce îl semnăm îl trecem” — înainte. Rândul e ce dovedește că
  banii erau liberi în momentul semnării.`,
    },
    {
      kind: "paragraph",
      text:
        "Ultima regulă e cea care decide dacă registrul trăiește. Un registru completat după semnare devine, în trei luni, o listă incompletă în care nimeni nu mai are încredere — și un registru în care nu ai încredere e mai rău decât niciunul, pentru că te face să iei decizii pe o cifră falsă.",
    },

    { kind: "heading", id: "cine-ce-vede", text: "Cine trebuie să vadă ce" },
    {
      kind: "steps",
      items: [
        {
          role: "Managerul de proiect",
          action: "Vede disponibilul real pe liniile lui, în orice moment",
          detail:
            "Nu are nevoie de întreaga contabilitate. Are nevoie de un singur număr, corect, pe care să nu-l ceară prin email de fiecare dată când planifică ceva.",
        },
        {
          role: "Responsabilul financiar",
          action: "Vede angajamentele care depășesc disponibilul, înainte de semnare",
          detail:
            "Acesta e momentul în care depășirea se poate încă opri. După semnare, alegerile rămase sunt toate proaste: renegociezi, reloci bani din altă linie sau plătești din fonduri proprii.",
        },
        {
          role: "Directorul",
          action: "Vede cash-ul de pregătit pe următoarele 60 de zile",
          detail:
            "Suma angajată și neplătită e obligația care urmează. E cifra care spune dacă vine o problemă de lichiditate, cu două luni înainte să vină.",
        },
      ],
    },

    { kind: "heading", id: "cand-se-rupe-excelul", text: "Când foaia de calcul nu mai ajunge" },
    {
      kind: "paragraph",
      text:
        "Foaia funcționează perfect până la un punct, iar punctul acela nu e legat de mărimea bugetului, ci de numărul de oameni care trebuie să o modifice. Cu un singur responsabil financiar care ține foaia, merge ani de zile. Cu patru manageri de proiect care adaugă rânduri, apar versiuni paralele, un „copie a copiei (2)” pe desktop și, la un moment dat, două angajamente pe aceeași linie făcute de doi oameni în aceeași săptămână.",
    },
    {
      kind: "paragraph",
      text:
        "Al doilea semn e legătura ruptă cu documentele: în foaie scrie „contract nr. 47”, dar contractul e într-un dosar fizic, iar factura care îl execută e în emailul cuiva. Din momentul în care cineva trebuie să caute în trei locuri ca să răspundă la o întrebare, întrebarea nu se mai pune — și asta e mai rău decât să primești un răspuns greșit.",
      links: [{ phrase: "caute în trei locuri", href: "/blog/dosarul-unei-plati" }],
    },

    {
      kind: "faq",
      items: [
        {
          q: "Care e diferența dintre angajament și cheltuială?",
          a: "Angajamentul e promisiunea de a plăti — semnătura pe un contract sau o comandă. Cheltuiala e consumul efectiv. Pentru controlul bugetului contează angajamentul, pentru că din momentul semnării nu mai poți dispune liber de acei bani.",
        },
        {
          q: "Ce fac cu un contract-cadru fără sumă fixă?",
          a: "Îl înregistrezi cu plafonul maxim, dacă are unul, sau cu estimarea pe perioada rămasă, marcată ca estimare. O linie cu „nedeterminat” e o gaură prin care va trece exact depășirea pe care încerci să o previi.",
        },
        {
          q: "Trebuie ca registrul să se potrivească cu contabilitatea?",
          a: "Coloana „plătit” trebuie să se potrivească, și e verificarea lunară care ține registrul onest. Coloana „angajat” nu are corespondent în contabilitatea financiară — tocmai de asta există registrul.",
        },
        {
          q: "Finanțatorii cer așa ceva?",
          a: "Ce cere finanțatorul tău scrie în contractul tău de grant, iar cerințele diferă mult între donatori. Independent de cerință, un registru de angajamente e instrumentul care îți permite să nu ajungi în situația de a raporta o depășire.",
        },
      ],
    },
    {
      kind: "cta",
      text:
        "În FinFlow, o cerere de plată consumă linia de buget în momentul aprobării, iar disponibilul se vede înainte de a apăsa „aprob” — nu la raportare.",
      label: "Intră în FinFlow și vezi controlul de buget",
      href: "/#/business/login",
    },
    {
      kind: "related",
      slugs: [
        "cine-aproba-platile-limite-de-aprobare",
        "inchiderea-lunii-fara-vanatoare-de-documente",
        "cat-costa-aprobarea-pe-email-si-excel",
      ],
    },
  ],
};
