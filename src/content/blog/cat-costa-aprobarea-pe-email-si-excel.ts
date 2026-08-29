import type { Article } from "./types";

export const article: Article = {
  slug: "cat-costa-aprobarea-pe-email-si-excel",
  title: "Cât costă, în bani, să aprobi plățile pe email și în Excel",
  metaTitle: "Costul real al aprobărilor pe email: aritmetica, cu ipotezele scrise",
  metaDescription:
    "Nu costă nimic — până când aduni orele. Calculul complet pentru o organizație de 30 de oameni, cu fiecare ipoteză vizibilă, ca să-l poți reface cu cifrele tale.",
  lang: "ro",
  market: "Republica Moldova",
  cluster: "decizie",
  addressesFear:
    "Că schimbi un sistem care „merge” pe unul care costă lunar, și nu poți justifica diferența în fața celui care aprobă bugetul.",
  stage: 4,
  primaryQuery: "cat costa aprobarea platilor pe email excel",
  author: "Echipa editorială FinFlow",
  datePublished: "2026-08-29",
  lastVerified: "2026-08-29",
  refreshEvery: 12,
  requiresExpertReview: false,
  reviewStatus: "not-applicable",
  published: true,
  leadMagnet: {
    ask: "evaluare-flux",
    heading: "Vrei calculul refăcut cu cifrele organizației tale?",
    promise:
      "Trimite-ne trei numere: câte plăți pe lună, câți oameni sunt implicați în aprobare și salariul mediu brut al celor implicați. Îți întoarcem același tabel, cu cifrele voastre și cu ipotezele marcate, în două zile lucrătoare.",
    buttonLabel: "Cere calculul pe cifrele mele",
    emailSubject: "Calculul costului aprobărilor — din ghidul despre email și Excel",
  },
  sources: [],
  body: [
    {
      kind: "answer",
      text:
        "Aprobarea pe email nu are un preț pe factură, are unul pe oră. Pentru o organizație de circa 30 de oameni care procesează 120 de plăți pe lună, timpul consumat de căutat, întrebat, reamintit și reconstituit se apropie de 200.000 de lei pe an în salarii — fără să pui la socoteală nimic din ce se întâmplă când ceva merge prost. Cifra nu e o statistică de piață, e o aritmetică pe care o poți reface în cinci minute cu numerele tale; toate ipotezele sunt mai jos.",
    },
    {
      kind: "takeaways",
      items: [
        "Costul nu e în aprobarea propriu-zisă — aceea durează un minut. E în tot ce se face ca aprobarea să poată avea loc.",
        "Trei categorii: timpul de pregătire și urmărire, timpul de căutare la raportare și audit, și costul erorilor care ajung să fie plătite.",
        "Aritmetica de mai jos folosește un cost orar de 150 MDL, adică aproximativ un salariu brut de 25.000 MDL pe lună. Înlocuiește-l cu al tău.",
        "Cifra pe care nu o poți calcula, dar o simți: deciziile amânate pentru că nimeni nu știe dacă mai sunt bani pe linie.",
        "Comparația onestă nu e „sistem contra gratis”. E „sistem contra ore de om plătite oricum”.",
      ],
    },

    { kind: "heading", id: "ipoteze", text: "Ipotezele. Schimbă-le și se schimbă totul" },
    {
      kind: "paragraph",
      text:
        "Orice calcul de tipul ăsta e la fel de credibil ca ipotezele lui, așa că le punem primele, nu la subsol. Organizația din exemplu: 30 de angajați, 4 proiecte cu finanțare externă, 120 de plăți pe lună, 6 persoane implicate în lanțul de aprobare, cost orar mediu 150 MDL pentru cei implicați. Nimic din ce urmează nu e măsurat de noi la un client anume — sunt estimări de timp pe care le poți verifica cronometrând o săptămână.",
    },
    {
      kind: "costCase",
      heading: "Costul anual al fluxului pe email și foaie de calcul",
      assumption:
        "30 de angajați, 120 de plăți pe lună, 6 persoane în lanțul de aprobare, cost orar 150 MDL. Estimările de timp sunt conservatoare: presupun că lucrurile merg bine.",
      currency: "MDL",
      lines: [
        {
          label: "Pregătirea și trimiterea cererilor de plată",
          amount: 64800,
          note: "120 plăți × 18 min × 12 luni ÷ 60 × 150 MDL — atașat documente, scris emailul, ales destinatarii.",
        },
        {
          label: "Urmărirea aprobărilor („ai apucat să te uiți?”)",
          amount: 43200,
          note: "120 plăți × 12 min × 12 luni — reamintiri, telefoane, căutat cine e la rând.",
        },
        {
          label: "Actualizarea manuală a foilor de buget",
          amount: 21600,
          note: "4 proiecte × 3 ore/lună × 12 luni — copiat sume, refăcut totaluri, reconciliat versiuni.",
        },
        {
          label: "Căutarea documentelor la raportare",
          amount: 28800,
          note: "4 rapoarte × 2 zile-om × 4 proiecte ÷ 2 — reconstituit ce a fost aprobat și de cine.",
        },
        {
          label: "Reconstituirea dosarelor pentru audit sau control",
          amount: 21600,
          note: "12 zile-om pe an, la 8 ore × 150 MDL — găsit documentul care lipsește dintr-un dosar de acum doi ani.",
        },
        {
          label: "Corectarea a două plăți greșite pe an",
          amount: 19200,
          note: "8 zile-om cumulat — identificare, corespondență, stornare, explicații. Nu include suma pierdută, dacă se pierde.",
        },
      ],
      excluded: [
        "O plată dublă sau deviată care nu se recuperează. Aici intervalul e prea larg ca să fie o estimare onestă.",
        "O cheltuială declarată neeligibilă de finanțator pentru documentație incompletă.",
        "Costul deciziilor amânate: achiziții făcute târziu pentru că nu se știa dacă bugetul permite.",
        "Timpul directorului, care e cel mai scump din lanț și pe care nu l-am inclus deloc.",
      ],
    },
    {
      kind: "note",
      tone: "caution",
      text:
        "Obiecția corectă la calculul de mai sus: orele astea sunt deja plătite, oamenii sunt oricum la birou. Adevărat — de aceea economia nu apare ca bani în cont, ci ca timp eliberat. Argumentul e onest doar dacă știi ce faci cu timpul acela; altfel spui doar că oamenii vor fi mai puțin obosiți, ceea ce e o afirmație reală, dar nu una financiară.",
    },

    { kind: "heading", id: "unde-se-duce", text: "Unde se duce, de fapt, timpul" },
    {
      kind: "paragraph",
      text:
        "Dacă cronometrezi o săptămână, tiparul e aproape întotdeauna același. Aprobarea în sine — cititul și decizia — ia sub un minut. Restul e infrastructură lipsă: căutat ultima versiune a bugetului, întrebat dacă furnizorul e cel de anul trecut, aflat dacă directorul a văzut emailul, recuperat atașamentul dintr-un fir cu 14 mesaje.",
    },
    {
      kind: "table",
      caption:
        "Distribuția tipică a timpului pe o plată. Numai ultimul rând e muncă de aprobare; restul e pregătirea condițiilor ca aprobarea să fie posibilă.",
      head: ["Activitate", "Timp per plată", "Cine îl consumă", "Dispare dacă…"],
      rows: [
        ["Adunat documentele și scris cererea", "12–20 min", "Solicitantul", "…formularul cere de la început ce trebuie."],
        ["Găsit linia de buget și disponibilul", "3–10 min", "Solicitantul, financiarul", "…disponibilul e vizibil la completare."],
        ["Urmărit unde s-a blocat aprobarea", "5–15 min", "Solicitantul", "…se vede la cine stă cererea."],
        ["Verificat furnizorul și rechizitele", "2–5 min", "Financiarul", "…datele vin din fișa furnizorului."],
        ["Citit și decis", "sub 1 min", "Aprobatorul", "…nu dispare. Asta e munca reală."],
      ],
    },

    { kind: "heading", id: "comparatia", text: "Comparația corectă" },
    {
      kind: "paragraph",
      text:
        "Un sistem de aprobări costă lunar, per utilizator, și costul e vizibil în buget — de aceea pare mai scump decât alternativa, al cărei cost e ascuns în salarii. Ca să compari cinstit, pune ambele în aceeași unitate: ore de om pe an, la același cost orar. Apoi scade din economie timpul de implementare și de învățare, care e real și pe care furnizorii îl trec de obicei sub tăcere.",
    },
    {
      kind: "paragraph",
      text:
        "Și mai important: nu promite economii care depind de disciplină. Un sistem nu recuperează timpul dacă oamenii continuă să trimită cereri și pe email „ca să fie sigur”. Câștigul apare când există un singur drum, iar asta e o decizie de conducere, nu o funcționalitate.",
      links: [{ phrase: "o decizie de conducere", href: "/blog/cine-aproba-platile-limite-de-aprobare" }],
    },

    {
      kind: "faq",
      items: [
        {
          q: "De unde ați luat cele 18 minute pe cerere?",
          a: "Este o estimare, nu o măsurătoare — și e marcată ca atare în tabel. O poți verifica într-o săptămână: cere celor care pregătesc plăți să noteze ora de start și de final pentru zece cereri. Rezultatul tău e mai valoros decât orice cifră citată din altă parte.",
        },
        {
          q: "Suntem 8 oameni. Se schimbă concluzia?",
          a: "Da, semnificativ. Sub un anumit volum — sub vreo 30 de plăți pe lună și doi aprobatori — costul coordonării e mic, iar emailul e o soluție rezonabilă. Calculul de mai sus devine relevant undeva peste 60–80 de plăți lunare sau peste patru persoane în lanț.",
        },
        {
          q: "Cum justific costul dacă economia e doar în timp?",
          a: "Nu o prezenta ca economie de bani, pentru că nu e. Prezint-o ca eliberare de capacitate și ca reducere de risc, cu cifra timpului alături. Un board acceptă un argument corect mai ușor decât unul umflat.",
        },
        {
          q: "Care e cel mai mare cost pe care nu l-ați calculat?",
          a: "Cheltuiala declarată neeligibilă de un finanțator pentru documentație incompletă. Nu am inclus-o pentru că variază de la zero la sume care depășesc tot restul calculului, iar o estimare atât de largă nu ar fi fost onestă.",
        },
      ],
    },
    {
      kind: "cta",
      text:
        "FinFlow costă 20 $ pe lună per aprobator și 5 $ per solicitant. Pune cifra asta lângă orele de mai sus, cu numerele tale, și vei ști singur dacă merită.",
      label: "Intră în FinFlow",
      href: "/#/business/login",
    },
    {
      kind: "related",
      slugs: [
        "cine-aproba-platile-limite-de-aprobare",
        "verificarea-facturii-inainte-de-plata",
        "dosarul-unei-plati",
      ],
    },
  ],
};
