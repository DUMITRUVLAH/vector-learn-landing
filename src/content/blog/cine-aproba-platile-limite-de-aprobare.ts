import type { Article } from "./types";

export const article: Article = {
  slug: "cine-aproba-platile-limite-de-aprobare",
  title: "Cine are voie să aprobe o plată și până la ce sumă",
  metaTitle: "Limite de aprobare a plăților: matricea, pragurile și politica scrisă",
  metaDescription:
    "Întrebarea nu e pe cine te bazezi, e până la ce sumă. Matricea de limite completabilă, cele patru praguri care contează și textul politicii interne, gata de adaptat.",
  lang: "ro",
  market: "Republica Moldova",
  cluster: "control",
  addressesFear:
    "Că delegarea dreptului de a aproba plăți înseamnă pierderea controlului — și că răspunderea rămâne tot a directorului.",
  stage: 3,
  primaryQuery: "limite de aprobare plati politica de semnaturi",
  author: "Echipa editorială FinFlow",
  datePublished: "2026-08-29",
  lastVerified: "2026-08-29",
  refreshEvery: 12,
  requiresExpertReview: false,
  reviewStatus: "not-applicable",
  published: true,
  leadMagnet: {
    ask: "model-politica",
    heading: "Vrei matricea completată pe organizația ta?",
    promise:
      "Scrie-ne câte persoane aprobă azi, câte proiecte aveți și dacă lucrați cu finanțatori. Îți trimitem matricea cu praguri propuse și politica adaptată, în două zile lucrătoare — fără să ne trimiți cifre din buget.",
    buttonLabel: "Cere matricea pe organizația mea",
    emailSubject: "Matricea de limite de aprobare — din ghidul despre cine aprobă plățile",
  },
  sources: [],
  body: [
    {
      kind: "answer",
      text:
        "O matrice de limite răspunde o dată la întrebarea pe care altfel o pui de zece ori pe lună: cine poate aproba singur, de la ce sumă e nevoie de a doua semnătură și ce nu se aprobă niciodată fără board. Nu are nevoie de software ca să existe și nici de zece pagini. Are nevoie de patru praguri, de o regulă pentru absențe și de un loc unde e scrisă, altul decât memoria contabilei.",
    },
    {
      kind: "takeaways",
      items: [
        "Delegarea fără praguri nu e delegare, e speranță. Pragul e ceea ce face delegarea reversibilă.",
        "Patru praguri acoperă aproape orice organizație sub 100 de oameni: până unde decide solicitantul, până unde decide managerul de linie, de unde intră finanțele, de unde intră conducerea.",
        "Regula pentru absențe se scrie odată cu matricea. Altfel, prima vacanță o suspendă.",
        "Excepțiile (urgențe, plăți recurente, avansuri) se scriu explicit, altfel devin normă tăcută.",
        "Matricea are valoare doar dacă e cerută înainte de plată, nu verificată după.",
      ],
    },

    { kind: "heading", id: "de-ce-praguri", text: "De ce pragul, și nu încrederea" },
    {
      kind: "paragraph",
      text:
        "Cele mai multe organizații mici nu au o problemă de încredere. Oamenii se cunosc, lucrează împreună de ani, nimeni nu suspectează pe nimeni. Problema apare altundeva: directorul semnează tot, pentru că nu există o regulă care să spună ce nu trebuie să semneze. Așa se ajunge la un om care aprobă și achiziția de 80.000 de lei, și cutia de pixuri, dedicând ambelor exact aceeași atenție — adică aproape niciuna.",
    },
    {
      kind: "paragraph",
      text:
        "Un prag rezolvă asta fără să ceară nimănui să aibă mai multă încredere în nimeni. Sub 5.000 de lei decide managerul de proiect, și decide repede. Peste 50.000 semnează două persoane, dintre care una din finanțe. Nu pentru că a doua persoană se pricepe mai bine, ci pentru că două persoane nu greșesc simultan la fel de des ca una — și pentru că plata mare merită cele cinci minute pe care cea mică nu le merită.",
    },
    {
      kind: "note",
      tone: "neutral",
      text:
        "Testul care arată dacă ai nevoie de matrice: întreabă trei colegi, separat, până la ce sumă pot aproba singuri. Dacă primești trei răspunsuri, nu ai o politică — ai trei interpretări ale unei politici care nu există.",
    },

    { kind: "heading", id: "matricea", text: "Matricea, cu praguri de pornire" },
    {
      kind: "paragraph",
      text:
        "Cifrele de mai jos sunt un punct de plecare pentru o organizație cu buget anual de câteva milioane de lei și 10–40 de oameni. Nu sunt un standard și nu au de unde să fie: pragul corect depinde de mărimea bugetului, de câte plăți faci pe lună și de cât de scump e pentru tine ca o plată să întârzie două zile. Înlocuiește-le cu ale tale — important e că există și că toată lumea le vede.",
    },
    {
      kind: "table",
      caption:
        "Regula de calibrare: dacă peste 70% dintre plăți cad în banda de sus, pragurile sunt prea mici și ai construit un ghișeu. Dacă sub 5% ajung acolo, sunt prea mari și nivelul de sus nu se uită la nimic.",
      head: ["Valoarea plății", "Cine aprobă", "A doua semnătură", "Ce se verifică la acest nivel"],
      rows: [
        [
          "până la 5.000 MDL",
          "Managerul de proiect / de departament",
          "nu",
          "Că există un buget cu linia respectivă și un document justificativ.",
        ],
        [
          "5.000 – 25.000 MDL",
          "Managerul de proiect",
          "Responsabil financiar",
          "Că suma se încadrează în buget, că furnizorul e cunoscut și că IBAN-ul e cel din fișă.",
        ],
        [
          "25.000 – 100.000 MDL",
          "Responsabil financiar",
          "Director executiv",
          "Că achiziția a respectat regula de selecție a furnizorului și că plata nu duce linia peste buget.",
        ],
        [
          "peste 100.000 MDL",
          "Director executiv",
          "Președinte / board / consiliu",
          "Că angajamentul e aprobat ca decizie, nu doar ca plată. Aici se aprobă contractul, nu factura.",
        ],
        [
          "Orice sumă, furnizor nou",
          "Ca mai sus, plus",
          "Verificare de rechizite pe canal secundar",
          "Că IBAN-ul a fost confirmat altfel decât prin emailul care l-a trimis.",
        ],
      ],
    },
    {
      kind: "paragraph",
      text:
        "Ultimul rând nu e despre bani, e despre riscul cel mai frecvent. Un furnizor nou, sau unul care tocmai și-a „schimbat banca”, e situația în care se pierd cele mai multe plăți — și pragul valoric nu te apără deloc acolo.",
      links: [
        { phrase: "și-a „schimbat banca”", href: "/blog/frauda-prin-schimbarea-ibanului" },
      ],
    },

    { kind: "heading", id: "reguli-care-lipsesc", text: "Cele patru reguli pe care le uită toată lumea" },
    {
      kind: "steps",
      heading: "Se scriu odată cu matricea, nu după primul incident",
      items: [
        {
          role: "Absențe",
          action: "Cine aprobă când aprobatorul e plecat",
          detail:
            "Delegarea se face nominal și pe perioadă determinată, în scris. „Îl înlocuiește cine e la birou” nu e o regulă, e o portiță. Dacă delegarea nu are dată de sfârșit, devine permanentă fără ca cineva să fi decis asta.",
        },
        {
          role: "Conflict de interese",
          action: "Nimeni nu aprobă o plată către sine sau către o rudă",
          detail:
            "Include decontul propriu, avansul propriu și plata către o firmă a unui apropiat. Regula se scrie chiar dacă pare jignitoare — mai ales atunci: scrisă, îl protejează pe cel corect de bănuială.",
        },
        {
          role: "Urgențe",
          action: "Ce se întâmplă când chiar nu se poate aștepta",
          detail:
            "Definește „urgență” prin exemple (avarie, termen legal care expiră azi), stabilește cine poate aproba singur în acest regim și cere regularizarea în 48 de ore. O procedură de urgență nescrisă se folosește oricum — doar că fără urmă.",
        },
        {
          role: "Plăți recurente",
          action: "Chiria, salariile, utilitățile nu trec de fiecare dată prin lanț",
          detail:
            "Se aprobă o dată, ca angajament, cu suma și perioada. Reintră în lanț doar când se schimbă suma sau contractul. Altfel, aprobatorii se obișnuiesc să apese „aprob” pe pilot automat, și obiceiul ăsta se mută și pe plățile care contează.",
        },
      ],
    },

    { kind: "heading", id: "politica", text: "Textul politicii, gata de adaptat" },
    {
      kind: "paragraph",
      text:
        "O politică de o pagină se citește. Una de zece se arhivează. Textul de mai jos e scris ca să încapă pe o pagină și să poată fi aprobat de un consiliu fără trei runde de comentarii.",
    },
    {
      kind: "template",
      heading: "Politică internă privind aprobarea plăților",
      intro:
        "Înlocuiește denumirile rolurilor și pragurile cu ale tale. Aprobată prin decizia organului competent, cu dată — o politică fără dată nu se poate invoca.",
      text: `POLITICA DE APROBARE A PLĂȚILOR
Aprobată prin Decizia nr. ____ din ____________
Se revizuiește anual sau la schimbarea structurii de conducere.

1. SCOP
Prezenta politică stabilește cine poate angaja cheltuieli și cine poate aproba
plăți în numele organizației, precum și limitele valorice ale acestor drepturi.

2. PRINCIPII
2.1. Persoana care solicită o plată nu este persoana care o aprobă.
2.2. Persoana care aprobă o plată nu este persoana care o execută în bancă.
2.3. Nicio plată nu se execută fără document justificativ atașat cererii.
2.4. Nicio persoană nu aprobă plăți către sine, către rude sau către entități
     în care are un interes patrimonial.

3. LIMITE DE APROBARE
   până la _______ MDL ....... [rol], semnătură unică
   _______ – _______ MDL ..... [rol] + [rol financiar]
   _______ – _______ MDL ..... [rol financiar] + [director]
   peste _______ MDL ......... [director] + [organul de conducere]

4. FURNIZORI NOI ȘI MODIFICĂRI DE RECHIZITE
Orice furnizor nou și orice modificare a contului bancar al unui furnizor
existent se confirmă printr-un canal diferit de cel prin care a fost primită
solicitarea, la un contact cunoscut anterior. Confirmarea se consemnează.

5. ÎNLOCUIRE
Delegarea dreptului de aprobare se face în scris, nominal, pe perioadă
determinată, și nu poate depăși limita valorică a celui care deleagă.

6. URGENȚE
În situații care nu permit parcurgerea fluxului normal, [rol] poate aproba
singur plăți de până la _______ MDL, cu regularizare în termen de 48 de ore.

7. EVIDENȚĂ
Fiecare aprobare consemnează: cine a cerut, pe ce document, cine a aprobat,
la ce dată. Evidența se păstrează împreună cu documentele justificative.`,
    },

    { kind: "heading", id: "de-la-hartie-la-fapt", text: "De la politică scrisă la control real" },
    {
      kind: "paragraph",
      text:
        "Diferența dintre o politică și un control e locul unde e cerută regula. O politică pe intranet se respectă cât ține atenția. Un control cere regula înainte să lase plata mai departe: dacă suma trece de prag, cererea nu ajunge la bancă până nu are a doua semnătură — nu pentru că cineva își amintește, ci pentru că altfel nu se poate.",
    },
    {
      kind: "paragraph",
      text:
        "Asta se poate obține și fără software, cu un registru și disciplină. Devine greu la trei lucruri: când echipa crește peste vreo zece aprobatori, când plățile depășesc câteva zeci pe lună, și când cineva trebuie să răspundă peste doi ani cine a aprobat o anumită factură. Primele două se rezolvă cu efort. A treia, aproape niciodată — pentru că răspunsul e într-un email pe care nimeni nu-l mai găsește.",
      links: [
        { phrase: "cine a aprobat o anumită factură", href: "/blog/dosarul-unei-plati" },
      ],
    },

    {
      kind: "faq",
      items: [
        {
          q: "Câte niveluri de aprobare sunt prea multe?",
          a: "Când al treilea aprobator nu se mai uită la nimic pentru că presupune că s-au uitat ceilalți doi. Practic, peste două semnături pe o plată obișnuită începe difuzia responsabilității: fiecare semnează pentru că ceilalți au semnat.",
        },
        {
          q: "Pragurile se stabilesc pe factură sau pe contract?",
          a: "Pe angajament, adică pe contract sau comandă. Altfel, un contract de 300.000 de lei facturat lunar în tranșe de 25.000 nu ajunge niciodată la nivelul care ar fi trebuit să-l aprobe. Factura care execută un contract deja aprobat se verifică, nu se re-decide.",
        },
        {
          q: "Ce fac dacă suntem patru oameni și nu am cum să separ rolurile?",
          a: "Separi ce se poate și compensezi restul cu vizibilitate: cel care nu poate fi scos din lanț nu execută singur și în tăcere, ci raportează lunar către board o listă a plăților. Detaliile sunt în ghidul despre separarea atribuțiilor într-o echipă mică.",
        },
        {
          q: "Ne cere un finanțator să avem așa ceva?",
          a: "Majoritatea finanțatorilor cer să existe controale interne asupra cheltuielilor și pot cere să vadă politica. Ce anume cere finanțatorul tău scrie în contractul tău de grant — acolo se verifică, nu în articole generale.",
        },
      ],
    },
    {
      kind: "cta",
      text:
        "În FinFlow, pragurile nu sunt un document, sunt regula prin care trece cererea: sub prag pleacă singură, peste prag așteaptă semnătura care lipsește.",
      label: "Intră în FinFlow și vezi aprobările",
      href: "/#/business/login",
    },
    {
      kind: "related",
      slugs: [
        "separarea-atributiilor-in-echipa-mica",
        "verificarea-facturii-inainte-de-plata",
        "cum-justifici-in-fata-boardului-un-sistem-de-aprobari",
      ],
    },
  ],
};
