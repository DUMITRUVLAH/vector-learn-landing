/**
 * Contractul de conținut editorial al blogului FinFlow.
 *
 * Bariera din `.claude/agents/seo-writer.md` (Gate 1: AI → expert uman → cititor) e impusă aici de
 * TIPURI, nu de convenție: un articol care conține afirmații fiscale, contabile sau juridice nu se
 * poate publica fără un expert numit, pentru că `ReviewedArticle` cere `expertReviewer` atunci când
 * `requiresExpertReview` e `true`. Un draft care încearcă să sară peste asta nu compilează — nimeni
 * nu trebuie să-și amintească regula la ora 23:00.
 *
 * Al doilea lucru impus de tipuri: fiecare cifră citată vine din `src/content/data/figures.ts`, cu
 * sursa și data citirii atașate. „Cifră fără sursă” nu e interzisă, e imposibilă.
 */

/** Un bloc de conținut. Fiecare se randează în HTML semantic, la build, fără JavaScript. */
export type Block =
  /** Răspunsul complet la întrebarea din titlu, în primul ecran. Nu se amână „mai jos”. */
  | { kind: "answer"; text: string }
  | { kind: "takeaways"; items: string[] }
  | { kind: "heading"; id: string; text: string }
  | { kind: "subheading"; text: string }
  /**
   * Paragraf, cu legături interne opționale în interiorul textului.
   *
   * `text` rămâne un șir simplu, iar linkurile se declară separat prin fraza pe care o acoperă.
   * Textul rămâne măsurabil (cuvinte, repetiție, timp de citit) fără să parsăm markup, iar un test
   * verifică mecanic că fiecare frază chiar apare în paragraf — altfel linkul dispare tăcut.
   */
  | { kind: "paragraph"; text: string; links?: { phrase: string; href: string }[] }
  | { kind: "list"; ordered?: boolean; items: string[] }
  /**
   * Un proces, pas cu pas, cu rolul responsabil scris lângă fiecare pas.
   *
   * Blocul ăsta există pentru că un proces fără „cine răspunde” e un desen, nu o procedură: exact
   * eroarea pe care o repetă articolele concurente („se verifică factura” — de către cine?).
   */
  | {
      kind: "steps";
      heading?: string;
      items: { role: string; action: string; detail?: string }[];
    }
  /**
   * Materialul pe care cititorul îl folosește azi: checklist cu ce se compară cu ce.
   *
   * `check` e ce faci, `why` e ce prinde. Un checklist fără a doua coloană se citește ca birocrație
   * și nu se folosește niciodată.
   */
  | { kind: "checklist"; heading: string; items: { check: string; why: string }[] }
  | { kind: "table"; caption?: string; head: string[]; rows: string[][] }
  /**
   * Cifre reale, compuse din `content/data/figures.ts` — nu scrise în proză.
   *
   * O cifră citată aici își aduce cu ea sursa, ce măsoară exact, jurisdicția și data la care a fost
   * citită, iar sursa se atașează automat la lista de la subsolul articolului.
   */
  | { kind: "figureTable"; caption?: string; figureIds: string[] }
  /**
   * Aritmetica unui caz concret, cu ipotezele vizibile.
   *
   * Un tabel arată piesele; asta le adună. Cititorul care întreabă „cât mă costă pe mine” primește
   * totalul făcut, nu metoda de a-l face singur. Ipoteza e deasupra, excluderile sunt dedesubt: un
   * total fără limite e o promisiune, nu o estimare.
   */
  | {
      kind: "costCase";
      heading: string;
      assumption: string;
      lines: { label: string; amount: number; note?: string }[];
      currency: "MDL" | "EUR" | "USD";
      excluded: string[];
    }
  /**
   * Text gata de copiat: o clauză, un email, un rând de politică internă.
   *
   * Se randează monospațiat și selectabil. Fără buton de copiere: pagina nu are JavaScript, iar un
   * buton mort e mai rău decât niciunul.
   */
  | { kind: "template"; heading: string; intro?: string; text: string }
  | { kind: "note"; tone: "neutral" | "caution"; text: string }
  | { kind: "faq"; items: { q: string; a: string }[] }
  | { kind: "cta"; text: string; label: string; href: string }
  /**
   * Trei drumuri mai departe, referite doar prin slug.
   *
   * Titlul și rândul explicativ se rezolvă la randare din registru și din `teasers.ts`. Copiate în
   * fiecare articol care leagă, o redenumire ar lăsa în urmă zece descrieri false.
   */
  | { kind: "related"; slugs: string[] };

export type Source = {
  label: string;
  url: string;
  /** Data la care sursa a fost CITITĂ. Obligatorie: legislația fiscală se schimbă cu anul. */
  checked: string;
  /** Articolul / secțiunea care susține afirmația. Un act întreg nu e o citare. */
  locator?: string;
};

/**
 * Ce cere articolul de la cititor, la final.
 *
 * Nu e o taxonomie decorativă: știm din ce întrebare vine omul, deci primul răspuns poate fi despre
 * asta. Cineva care vine din „mi-a fost respins decontul de finanțator” nu se tratează ca unul din
 * „caut alternativă la Excel”.
 */
export type Ask =
  | "demo"
  | "model-politica"
  | "checklist-verificare"
  | "evaluare-flux"
  | "pregatire-audit";

/**
 * CTA-ul propriu articolului. Obligatoriu prin tip.
 *
 * Un câmp opțional se completează pe articolele la care cineva s-a gândit și lipsește tăcut de pe
 * restul. Cerut de tip, un articol fără CTA nu compilează.
 *
 * Gate 2 (confidențialitate): CTA-ul deschide un email pe care îl scrie cititorul, în clientul lui.
 * Nu colectăm noi documente, sume, IBAN-uri sau date de beneficiari printr-un formular public.
 */
export type LeadMagnet = {
  ask: Ask;
  /** Promisiunea concretă, în vocabularul articolului. */
  heading: string;
  /** Ce primește și în cât timp. Niciodată „vă contactăm în curând”. */
  promise: string;
  /** Eticheta butonului: verb + obiect. Niciodată „Trimite” sau „Află mai multe”. */
  buttonLabel: string;
  /** Subiectul preumplut al emailului. Ne spune din ce articol vine omul. */
  emailSubject: string;
};

export type Cluster =
  | "control"      // cine aprobă, limite, delegare, separarea atribuțiilor
  | "conformitate" // fisc, e-Factura, documente justificative, audit de grant
  | "risc"         // fraudă, erori de plată, ce se pierde și cum
  | "operational"  // închiderea lunii, reconciliere, dosare, decontări
  | "decizie";     // comparații, costuri, cum justifici intern o schimbare

type ArticleBase = {
  slug: string;
  title: string;
  /** Titlul din SERP. Scris ca răspuns, nu umplut până la 60 de caractere. */
  metaTitle: string;
  /** Conține răspunsul, nu îl promite. */
  metaDescription: string;
  lang: "ro";
  market: string;
  cluster: Cluster;
  /** Frica sau blocajul pe care articolul îl demontează. Vezi agentul `psychological-seo`. */
  addressesFear: string;
  /** Stadiul din harta deciziei (1–5). Decide tonul și fricțiunea CTA-ului. */
  stage: 1 | 2 | 3 | 4 | 5;
  primaryQuery: string;
  author: string;
  datePublished: string;
  lastVerified: string;
  /** Luni până la următoarea reverificare. ≤ 6 pentru orice articol cu obligații legale. */
  refreshEvery: number;
  sources: Source[];
  body: Block[];
  leadMagnet: LeadMagnet;
  /** Ce lipsește ca articolul să fie complet. Apare în raport, niciodată în pagină. */
  pendingData?: string[];
};

/** Articol cu afirmații fiscale, contabile sau juridice: nepublicabil fără expert numit. */
type ReviewedArticle = ArticleBase & {
  requiresExpertReview: true;
  expertReviewer: string;
  reviewStatus: "approved";
  published: boolean;
};

/** Articol despre proces, organizare și decizie internă: fără afirmații de specialitate. */
type EditorialArticle = ArticleBase & {
  requiresExpertReview: false;
  expertReviewer?: never;
  reviewStatus: "not-applicable";
  published: boolean;
};

/** Draft în așteptarea expertului. Nu se pre-randează și nu intră în sitemap. */
type PendingArticle = ArticleBase & {
  requiresExpertReview: true;
  expertReviewer?: string;
  reviewStatus: "pending";
  published: false;
};

export type Article = ReviewedArticle | EditorialArticle | PendingArticle;
