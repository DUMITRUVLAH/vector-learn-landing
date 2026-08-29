import type { Article } from "./types";

/**
 * Specul de cover, per ARTICOL — nu per cluster.
 *
 * Derivat din cluster, coverul încetează să fie informație și devine tapet: patru articole
 * operaționale ar purta același desen. Aici fiecare articol are motivul lui, desenat pentru
 * subiectul lui, iar culoarea alternează în interiorul familiei ca două rânduri vecine din listă
 * să nu poarte același pastel.
 *
 * De ce apar valori literale lângă tokeni, când regula repo-ului interzice hex în `.tsx`: paginile
 * de blog sunt pre-randate ca HTML static, în afara cascadei aplicației (`src/index.css`). Perechea
 * `token` / `literal` ține legătura explicită — literalul e copiat din `src/index.css`, iar numele
 * tokenului stă lângă el, ca o schimbare de kit să se vadă la `grep`.
 */

export type Motif =
  // control — cine aprobă, limite, delegare
  | "threshold"      // praguri: trepte tăiate de o linie de limită
  | "split-duties"   // două cercuri disjuncte, cu un pod între ele
  | "chain"          // lanț de decizie: noduri legate, unul plin
  // risc — fraudă, erori
  | "swap"           // două trasee identice, unul deviat
  | "match-rows"     // trei rânduri care se potrivesc, unul care nu
  // operațional — buget, lună, reconciliere
  | "ledger-grid"    // registru: grilă cu o coloană consumată
  | "pairing"        // reconciliere: două șiruri care se împerechează
  | "month-arc"      // ciclul lunii, cu ultimul segment marcat
  // decizie — cost, comparație, justificare intern
  | "stack-total"    // coloane care cresc spre un total
  | "two-paths"      // două drumuri din același punct
  // conformitate
  | "seal";          // inele concentrice cu o bifă — verificare, semnătură

type Palette = { bgToken: string; bgLiteral: string; inkToken: string; inkLiteral: string };

/**
 * Perechile din kitul HR365 (`src/index.css`), pastel plin + cerneală.
 *
 * `-fg` e numele tokenului în acest repo (în kitul original era `-ink`). Niciun token nou:
 * dacă o culoare nu există aici, nu se folosește pe blog.
 */
const P = {
  indigo: { bgToken: "--module-indigo-bg", bgLiteral: "#E0E7FF", inkToken: "--module-indigo-fg", inkLiteral: "#4338CA" },
  violet: { bgToken: "--module-violet-bg", bgLiteral: "#EDE9FE", inkToken: "--module-violet-fg", inkLiteral: "#6D28D9" },
  cyan: { bgToken: "--module-cyan-bg", bgLiteral: "#CFFAFE", inkToken: "--module-cyan-fg", inkLiteral: "#155E75" },
  emerald: { bgToken: "--module-emerald-bg", bgLiteral: "#D1FAE5", inkToken: "--module-emerald-fg", inkLiteral: "#047857" },
  orange: { bgToken: "--module-orange-bg", bgLiteral: "#FFEDD5", inkToken: "--module-orange-fg", inkLiteral: "#C2410C" },
  teal: { bgToken: "--module-teal-bg", bgLiteral: "#CCFBF1", inkToken: "--module-teal-fg", inkLiteral: "#0F766E" },
  sky: { bgToken: "--module-sky-bg", bgLiteral: "#E0F2FE", inkToken: "--module-sky-fg", inkLiteral: "#0369A1" },
  rose: { bgToken: "--module-rose-bg", bgLiteral: "#FFE4E6", inkToken: "--module-rose-fg", inkLiteral: "#BE123C" },
  amber: { bgToken: "--module-amber-bg", bgLiteral: "#FEF3C7", inkToken: "--module-amber-fg", inkLiteral: "#92400E" },
} satisfies Record<string, Palette>;

export type PaletteKey = keyof typeof P;
export const MODULE_PALETTES = P;

export type CoverSpec = Palette & {
  motif: Motif;
  /** Eticheta scurtă de pe cover și de pe chip. Clasifică articolul, nu îi repetă titlul. */
  label: string;
};

export const CLUSTER_LABEL: Record<Article["cluster"], string> = {
  control: "Control",
  conformitate: "Conformitate",
  risc: "Risc",
  operational: "Operațional",
  decizie: "Decizie",
};

/**
 * Un rând per articol: motivul desenat pentru subiectul lui, plus paleta.
 *
 * Culorile alternează deliberat, ca lista să nu producă doi vecini identici la nicio sortare
 * rezonabilă. Un slug fără intrare aici cade pe un cover neutru și PICĂ testul de corpus — deci
 * lipsa se vede la commit, nu la cititor.
 */
const BY_SLUG: Record<string, { motif: Motif; palette: PaletteKey }> = {
  "cine-aproba-platile-limite-de-aprobare": { motif: "threshold", palette: "indigo" },
  "separarea-atributiilor-in-echipa-mica": { motif: "split-duties", palette: "teal" },
  "frauda-prin-schimbarea-ibanului": { motif: "swap", palette: "rose" },
  "verificarea-facturii-inainte-de-plata": { motif: "match-rows", palette: "amber" },
  "dosarul-unei-plati": { motif: "seal", palette: "sky" },
  "buget-pe-proiect-cat-a-mai-ramas": { motif: "ledger-grid", palette: "violet" },
  "reconcilierea-extrasului-bancar": { motif: "pairing", palette: "cyan" },
  "inchiderea-lunii-fara-vanatoare-de-documente": { motif: "month-arc", palette: "emerald" },
  "cat-costa-aprobarea-pe-email-si-excel": { motif: "stack-total", palette: "orange" },
  "cum-justifici-in-fata-boardului-un-sistem-de-aprobari": { motif: "two-paths", palette: "indigo" },
  "e-factura-moldova-cine-este-obligat": { motif: "chain", palette: "sky" },
};

const FALLBACK: { motif: Motif; palette: PaletteKey } = { motif: "chain", palette: "indigo" };

export function coverFor(article: Pick<Article, "slug" | "cluster">): CoverSpec {
  const spec = BY_SLUG[article.slug] ?? FALLBACK;
  return { ...P[spec.palette], motif: spec.motif, label: CLUSTER_LABEL[article.cluster] };
}

/** Slug-urile care au cover propriu. Folosit de testul de corpus. */
export function slugsWithCover(): string[] {
  return Object.keys(BY_SLUG);
}
