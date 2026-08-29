import type { Article } from "./types";

export const article: Article = {
  slug: "verificarea-facturii-inainte-de-plata",
  title: "Ce verifici pe o factură înainte să o plătești (și ce nu are rost să verifici)",
  metaTitle: "Verificarea facturii înainte de plată: checklistul celor trei potriviri",
  metaDescription:
    "O factură corectă aritmetic poate fi complet nelivrată. Cele trei potriviri care prind problema reală, cine le face și de ce controlul aritmetic e cel mai puțin util pas.",
  lang: "ro",
  market: "Republica Moldova",
  cluster: "operational",
  addressesFear:
    "Că plătești ceva ce nu ai primit, sau plătești de două ori, și afli abia la inventar sau la audit.",
  stage: 2,
  primaryQuery: "verificare factura inainte de plata",
  author: "Echipa editorială FinFlow",
  datePublished: "2026-08-29",
  lastVerified: "2026-08-29",
  refreshEvery: 12,
  requiresExpertReview: false,
  reviewStatus: "not-applicable",
  published: true,
  leadMagnet: {
    ask: "checklist-verificare",
    heading: "Vrei checklistul ca formular pe care echipa chiar îl completează?",
    promise:
      "Spune-ne câte facturi procesați pe lună și cine le verifică azi. Îți trimitem checklistul ca formular de o pagină, adaptat tipurilor voastre de cheltuieli, în două zile lucrătoare.",
    buttonLabel: "Cere checklistul ca formular",
    emailSubject: "Checklistul de verificare a facturii — din ghidul despre cele trei potriviri",
  },
  sources: [],
  body: [
    {
      kind: "answer",
      text:
        "Verificarea utilă nu se uită la factură, ci o compară cu alte două lucruri: cu ce ați comandat și cu ce ați primit. Dacă cele trei se potrivesc — cantitate, preț, condiții — factura e bună de plată. Dacă nu, ai găsit exact problema pe care controlul aritmetic nu o găsește niciodată: o factură poate fi perfect calculată și complet nelivrată.",
    },
    {
      kind: "takeaways",
      items: [
        "Cele trei potriviri: comanda (ce am cerut), recepția (ce a venit), factura (ce ni se cere să plătim).",
        "Verificarea aritmetică prinde cea mai rară eroare. Furnizorii greșesc rar la înmulțire; greșesc la cantitate, la preț față de ofertă și la ce s-a livrat efectiv.",
        "Duplicatele se prind pe numărul de document și pe sumă, nu din memorie — aceeași factură retrimisă „pentru siguranță” e cea mai frecventă plată dublă.",
        "Cine confirmă recepția nu poate fi cine aprobă plata. Altfel, potrivirea se face cu sine.",
        "Verificarea are sens înainte de plată. După plată nu mai e verificare, e reconciliere — și costă de zece ori mai mult.",
      ],
    },

    { kind: "heading", id: "trei-potriviri", text: "Cele trei potriviri" },
    {
      kind: "paragraph",
      text:
        "Ideea vine din controlul intern clasic și e mai simplă decât numele ei: nicio plată nu pleacă până când trei documente independente nu spun același lucru. Independente e cuvântul care contează — dacă toate trei vin de la furnizor, nu ai verificat nimic, ai citit aceeași informație de trei ori.",
    },
    {
      kind: "table",
      caption:
        "Într-o organizație mică, „comanda” poate fi un email de acceptare a ofertei, iar „recepția” o confirmare scrisă a celui care a primit marfa. Forma contează mai puțin decât faptul că sunt trei surse diferite.",
      head: ["Documentul", "De la cine vine", "Ce dovedește", "Ce prinde"],
      rows: [
        [
          "Comanda / contractul",
          "De la voi",
          "Ce ați cerut, în ce cantitate și la ce preț",
          "Preț mai mare decât cel din ofertă; cantități care nu au fost comandate niciodată.",
        ],
        [
          "Confirmarea de primire",
          "De la cel care a primit efectiv",
          "Ce a ajuns, când și în ce stare",
          "Servicii nelivrate, marfă parțială, lucrări facturate integral și executate pe jumătate.",
        ],
        [
          "Factura",
          "De la furnizor",
          "Ce vi se cere să plătiți",
          "Nimic, singură. Devine utilă doar comparată cu celelalte două.",
        ],
      ],
    },
    {
      kind: "note",
      tone: "caution",
      text:
        "Cel mai frecvent mod de a rata potrivirea: recepția e confirmată de aceeași persoană care a cerut achiziția și care aprobă plata. Nu pentru că ar fi rea-credință, ci pentru că omul care a cerut ceva e ultimul care observă că nu a primit tot.",
    },

    { kind: "heading", id: "checklist", text: "Checklistul, pe ordinea în care prinde cele mai multe probleme" },
    {
      kind: "checklist",
      heading: "Înainte să apeși „aprob”",
      items: [
        {
          check: "Furnizorul de pe factură e cel cu care avem contract",
          why: "Grupurile de firme facturează uneori dintr-o altă entitate decât cea care a semnat. Nu e neapărat o problemă, dar e o întrebare — iar la audit devine una fără răspuns.",
        },
        {
          check: "IBAN-ul de pe factură e cel din fișa furnizorului",
          why: "Nu cel din emailul curent. Diferența dintre cele două e mecanismul prin care pleacă plățile spre conturi străine.",
        },
        {
          check: "Numărul și data facturii nu mai există în evidența noastră",
          why: "Aceeași factură trimisă de două ori, o dată de contabilitate și o dată de comercial, e cea mai comună plată dublă. Se prinde mecanic, nu din memorie.",
        },
        {
          check: "Prețul unitar e cel din ofertă sau din contract",
          why: "Aici apar cele mai multe diferențe reale: majorări netransmise, tarife vechi, cursuri aplicate altfel decât s-a convenit.",
        },
        {
          check: "Cantitatea facturată = cantitatea confirmată la recepție",
          why: "Diferența dintre „livrat” și „facturat” e problema pe care nimeni nu o găsește citind doar factura.",
        },
        {
          check: "Cheltuiala are o linie de buget cu sold disponibil",
          why: "Dacă afli abia la raportare că linia era epuizată, nu mai ai ce corecta — banii au plecat.",
        },
        {
          check: "Există documentul care justifică cheltuiala, atașat cererii",
          why: "Contract, ofertă acceptată, act de predare-primire. Peste doi ani, factura singură nu explică nimănui de ce ați plătit.",
        },
        {
          check: "Termenul de plată din factură coincide cu cel din contract",
          why: "Un furnizor poate scrie pe factură un termen mai scurt decât cel convenit. Plătit la termenul lui, ai renunțat tacit la al tău.",
        },
      ],
    },

    { kind: "heading", id: "ce-nu-verifici", text: "Ce nu merită verificat de fiecare dată" },
    {
      kind: "paragraph",
      text:
        "Controlul care se face pe tot, la fel de atent, nu e control — e ritual. Recalcularea manuală a totalului pe fiecare factură consumă timpul care ar trebui să meargă în potrivirea cu recepția, unde stau problemele adevărate. La fel, verificarea datelor de identificare ale unui furnizor cu care lucrați de patru ani: se face o dată, la deschiderea fișei, și se reface doar când se schimbă ceva.",
    },
    {
      kind: "paragraph",
      text:
        "Un principiu care ajută: verifică proporțional cu ce se poate pierde. O factură de 1.200 de lei de la un furnizor recurent nu merită același traseu ca una de 90.000 de la cineva nou. Dacă procedura ta le tratează identic, oamenii vor începe să sară pași — și îi vor sări exact acolo unde nu trebuie, pentru că obișnuința nu face diferența.",
      links: [{ phrase: "proporțional cu ce se poate pierde", href: "/blog/cine-aproba-platile-limite-de-aprobare" }],
    },

    { kind: "heading", id: "cine-face", text: "Cine face fiecare verificare" },
    {
      kind: "steps",
      items: [
        {
          role: "Solicitantul",
          action: "Confirmă că a primit ce a cerut",
          detail:
            "Singurul care poate spune dacă serviciul a fost prestat sau marfa a ajuns. Nu poate spune dacă prețul e cel convenit — de multe ori nici nu a văzut contractul.",
        },
        {
          role: "Responsabilul financiar",
          action: "Compară factura cu contractul și cu bugetul",
          detail:
            "Preț, termen, linie bugetară, sold disponibil, duplicat. Verificările care cer acces la documente, nu la marfă.",
        },
        {
          role: "Aprobatorul",
          action: "Decide, nu reverifică",
          detail:
            "Dacă aprobatorul trebuie să refacă munca celorlalți doi, fluxul e stricat. El se uită la ce nu se poate automatiza: dacă cheltuiala are sens acum, în contextul organizației.",
        },
      ],
    },

    {
      kind: "faq",
      items: [
        {
          q: "Ce fac dacă factura și recepția nu se potrivesc?",
          a: "Nu plătești parțial „ca să nu supărăm furnizorul”. Ceri factură corectată sau document de stornare. O plată parțială pe o factură necorectată produce o diferență care va supraviețui în evidență ani de zile.",
        },
        {
          q: "La servicii, ce ține loc de recepție?",
          a: "O confirmare scrisă a celui care a beneficiat: raportul consultantului, sesiunea ținută, orele acceptate. Formularea contează mai puțin decât existența unui om care își pune numele lângă „da, s-a livrat”.",
        },
        {
          q: "Cât timp în plus înseamnă checklistul ăsta?",
          a: "Pentru o factură recurentă, sub un minut — majoritatea punctelor sunt deja adevărate și se văd dintr-o privire. Timpul se duce pe facturile problematice, adică exact pe cele care merită.",
        },
        {
          q: "Merită să verificăm și după plată?",
          a: "Verificarea de după plată nu mai poate opri nimic; poate doar să constate. E utilă ca eșantion lunar, ca să vezi dacă procedura chiar se aplică — nu ca înlocuitor al pasului dinainte.",
        },
      ],
    },
    {
      kind: "cta",
      text:
        "În FinFlow, cererea de plată vine cu documentul atașat, cu linia de buget și cu istoricul furnizorului. Aprobatorul vede cele trei potriviri deja făcute, nu trei fișiere de deschis.",
      label: "Intră în FinFlow și deschide o cerere",
      href: "/#/business/login",
    },
    {
      kind: "related",
      slugs: [
        "frauda-prin-schimbarea-ibanului",
        "buget-pe-proiect-cat-a-mai-ramas",
        "dosarul-unei-plati",
      ],
    },
  ],
};
