import type { Article } from "./types";

export const article: Article = {
  slug: "separarea-atributiilor-in-echipa-mica",
  title: "Separarea atribuțiilor când sunteți patru oameni",
  metaTitle: "Separarea atribuțiilor în echipe mici: ce faci când nu ai pe cine separa",
  metaDescription:
    "Regula spune că cine aprobă plata nu o execută. Într-o echipă de patru, asta e imposibil. Ce compensezi, cum, și ce spun standardele exact pentru acest caz.",
  lang: "ro",
  market: "Republica Moldova",
  cluster: "control",
  addressesFear:
    "Că regula de control intern e scrisă pentru organizații mari și că, fiind mici, sunteți automat în neregulă — fără să știți ce se poate face concret.",
  stage: 3,
  primaryQuery: "separarea atributiilor control intern organizatie mica",
  author: "Echipa editorială FinFlow",
  datePublished: "2026-08-29",
  lastVerified: "2026-08-29",
  refreshEvery: 12,
  requiresExpertReview: false,
  reviewStatus: "not-applicable",
  published: true,
  leadMagnet: {
    ask: "evaluare-flux",
    heading: "Vrei harta rolurilor pentru echipa ta, așa cum e ea acum?",
    promise:
      "Spune-ne câți oameni sunteți și cine face azi fiecare pas (cere, verifică, aprobă, plătește, înregistrează). Îți trimitem harta cu conflictele marcate și controalele compensatorii propuse, în două zile lucrătoare.",
    buttonLabel: "Cere harta rolurilor",
    emailSubject: "Harta rolurilor — din ghidul despre separarea atribuțiilor",
  },
  sources: [
    {
      label:
        "Standardele naționale de control intern în sectorul public (anexă la Ordinul ministrului finanțelor nr. 189 din 05.11.2015)",
      url: "https://www.legis.md/cautare/getResults?doc_id=119965&lang=ro",
      checked: "2026-08-29",
      locator: "SNCI 12 „Divizarea obligațiilor și responsabilităților”; SNCI 6 „Împuterniciri delegate”",
    },
    {
      label: "GAO — Standards for Internal Control in the Federal Government (Green Book, GAO-14-704G)",
      url: "https://www.gao.gov/assets/gao-14-704g.pdf",
      checked: "2026-08-29",
      locator: "Paragrafele 10.12–10.14 și Figura 6",
    },
    {
      label: "INTOSAI — Guidelines for Internal Control Standards for the Public Sector (GOV 9100)",
      url: "https://www.issai.org/wp-content/uploads/2019/08/intosai_gov_9100_e.pdf",
      checked: "2026-08-29",
      locator: "Capitolul 2.3, punctul 2 „Segregation of duties”",
    },
    {
      label: "COSO — Internal Control — Integrated Framework, Executive Summary (2013)",
      url: "https://www.coso.org/_files/ugd/3059fc_1df7d5dd38074006bce8fdf621a942cf.pdf",
      checked: "2026-08-29",
      locator: "Secțiunea „Control Activities”",
    },
    {
      label: "Ministerul Finanțelor al RM — Manual de Control Intern Managerial (ed. 2021)",
      url: "https://mf.gov.md/sites/default/files/documente%20relevante/Manual%20CIM_2021_m.pdf",
      checked: "2026-08-29",
      locator: "Pagina 57–58, „Divizarea/segregarea obligațiilor și responsabilităților”",
    },
  ],
  body: [
    {
      kind: "answer",
      text:
        "Standardele nu îți cer să faci imposibilul. Spun explicit că, într-o organizație mică, separarea completă poate fi impracticabilă — și că atunci conducerea trebuie să proiecteze controale alternative. Deci întrebarea nu e „cum separăm cinci funcții între patru oameni”, ci „care combinație de roluri e cea mai periculoasă la noi și cu ce o compensăm”. Răspunsul practic: cel care execută plata în bancă nu trebuie să fie și cel care poate modifica datele furnizorului.",
    },
    {
      kind: "takeaways",
      items: [
        "Cele patru funcții care nu ar trebui să se adune la o singură persoană: autorizarea, execuția, înregistrarea și custodia.",
        "Ghidul GAO spune direct: dacă separarea nu e practicabilă din cauza personalului limitat, se proiectează controale alternative. Nu e o portiță, e norma.",
        "Cea mai periculoasă combinație într-un ONG mic: aceeași persoană schimbă datele furnizorului și execută plata.",
        "Controalele compensatorii care chiar funcționează: revizuirea de către un terț, vizibilitatea către board, rotația, și confirmarea independentă a soldurilor.",
        "Standardele naționale de control intern sunt scrise pentru sectorul public. Pentru un ONG sunt reper de bună practică, nu obligație legală.",
      ],
    },

    { kind: "heading", id: "ce-se-separa", text: "Ce se separă, de fapt" },
    {
      kind: "paragraph",
      text:
        "Regula nu e despre persoane, e despre funcții. Ghidul GAO le enumeră în patru: autorizarea tranzacției, procesarea și înregistrarea ei, revizuirea, și manipularea activelor implicate — astfel încât nicio persoană să nu controleze toate aspectele-cheie ale unei operațiuni. INTOSAI o formulează aproape identic: nicio persoană și nicio echipă nu ar trebui să controleze toate etapele-cheie ale unei tranzacții.",
    },
    {
      kind: "paragraph",
      text:
        "Standardele naționale de control intern din Republica Moldova, aprobate prin ordin al ministrului finanțelor, coboară principiul la exemplul care ne interesează: divizarea presupune, în primul rând, persoane sau subdiviziuni separate responsabile de autorizarea plăților pentru bunuri și servicii, respectiv de efectuarea plăților în conformitate cu documentația corespunzătoare. Textul acela e scris pentru entități publice; pentru o asociație obștească e un reper recunoscut, nu o obligație — dar e reperul pe care îl va avea în minte oricine îți va audita procesele.",
    },
    {
      kind: "table",
      caption:
        "Combinațiile din coloana a treia sunt cele care produc pierderi fără să fie nevoie de rea-credință: e de ajuns o eroare pe care nimeni nu o mai poate observa.",
      head: ["Funcția", "Ce înseamnă concret", "Nu ar trebui combinată cu", "De ce"],
      rows: [
        [
          "Autorizare",
          "Aprobă că plata se poate face",
          "Execuția în bancă",
          "Cine decide și execută nu are pe nimeni deasupra tranzacției.",
        ],
        [
          "Execuție",
          "Introduce ordinul de plată, semnează în bancă",
          "Modificarea datelor furnizorului",
          "Poate schimba destinatarul și trimite banii, în același minut.",
        ],
        [
          "Înregistrare",
          "Trece operațiunea în evidență",
          "Execuția plății",
          "Poate ascunde o plată prin modul în care o înregistrează.",
        ],
        [
          "Custodie",
          "Ține numerarul, cardurile, accesul la bancă",
          "Înregistrarea",
          "Lipsa din casă nu se vede dacă tot el ține evidența casei.",
        ],
      ],
    },
    {
      kind: "note",
      tone: "caution",
      text:
        "Dacă ai timp să repari o singură combinație, repar-o pe a doua: aceeași persoană care poate modifica IBAN-ul unui furnizor și poate executa plata. E singura combinație în care o singură acțiune, făcută de un singur om, mută banii în afara organizației fără să lase nimic în urmă.",
    },

    { kind: "heading", id: "ce-faci-cu-patru-oameni", text: "Ce faci concret când sunteți patru" },
    {
      kind: "paragraph",
      text:
        "Ghidul GAO tratează situația explicit: dacă separarea sarcinilor nu e practicabilă într-un proces din cauza personalului limitat sau a altor factori, conducerea proiectează activități de control alternative care să adreseze riscul. INTOSAI adaugă rotația angajaților ca măsură concretă. Deci nu ești în afara standardului pentru că ești mic — ești în afara lui dacă nu compensezi.",
    },
    {
      kind: "steps",
      heading: "Cele patru controale compensatorii care se pot aplica luni dimineață",
      items: [
        {
          role: "Vizibilitate",
          action: "O listă lunară a tuturor plăților, către cineva din afara execuției",
          detail:
            "Președintele, un membru al consiliului, un cenzor. Nu trebuie să aprobe nimic — trebuie doar să existe cineva care vede toate plățile și care ar observa un furnizor pe care nu-l cunoaște. Un control care se bazează pe faptul că cineva se uită e mai slab decât unul preventiv, dar e mult mai puternic decât nimic.",
        },
        {
          role: "Confirmare independentă",
          action: "Extrasul bancar ajunge la altcineva decât cel care face plățile",
          detail:
            "Direct de la bancă, pe emailul directorului sau al unui membru al consiliului. Dacă cel care plătește e și cel care aduce dovada plății, dovada nu mai dovedește nimic.",
        },
        {
          role: "A doua semnătură la bancă",
          action: "Două semnături pe ordinele peste un prag",
          detail:
            "Se stabilește direct cu banca, în fișa specimenelor de semnături. E controlul cu cel mai bun raport efort/efect dintre toate: se face o dată și funcționează în afara organizației, deci nu poate fi ocolit intern.",
        },
        {
          role: "Rotație",
          action: "Schimbă periodic cine face reconcilierea",
          detail:
            "Recomandată explicit de INTOSAI pentru organizațiile mici. O eroare sau un tipar de plăți care rezistă unei singure perechi de ochi rareori rezistă la a doua, chiar dacă a doua se uită abia peste șase luni.",
        },
      ],
    },

    { kind: "heading", id: "delegarea", text: "Delegarea, în scris și cu dată de sfârșit" },
    {
      kind: "paragraph",
      text:
        "Standardele naționale cer ca împuternicirile delegate să fie înregistrate în scris, confirmate prin semnătura celui care deleagă și a celui delegat, și evidențiate într-un tabel, tocmai ca să se poată monitoriza. Adaugă o precizare pe care organizațiile o uită constant: subdelegarea e posibilă cu acordul celui care a delegat inițial, dar nu îl scutește de responsabilitate.",
    },
    {
      kind: "paragraph",
      text:
        "În practică, asta se traduce în trei propoziții pe care le poți scrie azi: cine deleagă, cui, până la ce sumă și până la ce dată. O delegare fără dată de sfârșit devine permanentă fără ca cineva să fi decis vreodată asta — și e cel mai frecvent mod prin care o structură de aprobare atent construită se erodează în tăcere.",
      links: [{ phrase: "până la ce sumă", href: "/blog/cine-aproba-platile-limite-de-aprobare" }],
    },

    {
      kind: "faq",
      items: [
        {
          q: "Suntem trei. Chiar putem respecta ceva din toate astea?",
          a: "Da: a doua semnătură la bancă și extrasul trimis direct unui membru al consiliului se pot face cu trei oameni și fără niciun cost. Ce nu poți face este să separi complet toate cele patru funcții — și nici nu ți se cere, atâta timp cât conducerea știe ce riscuri rămân și le compensează.",
        },
        {
          q: "Contabilul extern rezolvă problema?",
          a: "Rezolvă separarea înregistrării de execuție, ceea ce e util. Nu rezolvă autorizarea: contabilul extern înregistrează ce i se trimite și, de regulă, nu are cum să știe dacă serviciul a fost livrat sau dacă prețul e cel convenit.",
        },
        {
          q: "Standardele astea ni se aplică legal, ca ONG?",
          a: "Standardele naționale de control intern sunt aprobate pentru sectorul public. Pentru o asociație obștească sunt un reper de bună practică. Ce ți se cere legal ție ține de legislația contabilă și de contractele tale de finanțare — verifică-le cu contabilul tău, nu cu un articol.",
        },
        {
          q: "Cum arată asta într-un sistem?",
          a: "Rolurile devin drepturi diferite: cine creează cererea nu are dreptul de a o aproba, cine aprobă nu are dreptul de a modifica fișa furnizorului. Diferența față de hârtie nu e că regula devine mai bună, ci că nu mai poate fi uitată într-o zi aglomerată.",
        },
      ],
    },
    {
      kind: "cta",
      text:
        "În FinFlow, rolurile sunt drepturi, nu convenții: solicitantul nu poate aproba, aprobatorul nu poate schimba rechizitele, iar fiecare acțiune rămâne în istoricul cererii.",
      label: "Intră în FinFlow și vezi rolurile",
      href: "/#/business/login",
    },
    {
      kind: "related",
      slugs: [
        "cine-aproba-platile-limite-de-aprobare",
        "frauda-prin-schimbarea-ibanului",
        "dosarul-unei-plati",
      ],
    },
  ],
};
