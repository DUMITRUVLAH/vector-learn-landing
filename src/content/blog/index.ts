import type { Article, Cluster } from "./types";

// Registrul de articole. Ordinea din `ARTICLES` e ordinea implicită din listare.
//
// Prima serie, publicată pentru validare: cinci ghiduri despre coordonarea plăților — cine aprobă,
// ce se verifică, unde se pierd banii, ce rămâne în dosar și cât costă coordonarea pe email.
//
// Scrise, dar NEÎNREGISTRATE deliberat (așteaptă runda a doua, după feedback):
//   · separarea-atributiilor-in-echipa-mica.ts
//   · buget-pe-proiect-cat-a-mai-ramas.ts
// Nu sunt importate aici, deci nu se pre-randează și nu intră în sitemap. Fișierele rămân în repo
// pentru că sunt complete și verificate; ștergerea lor ar însemna refacerea cercetării.
import { article as limiteAprobare } from "./cine-aproba-platile-limite-de-aprobare";
import { article as fraudaIban } from "./frauda-prin-schimbarea-ibanului";
import { article as verificareFactura } from "./verificarea-facturii-inainte-de-plata";
import { article as dosarPlata } from "./dosarul-unei-plati";
import { article as costEmail } from "./cat-costa-aprobarea-pe-email-si-excel";

export const ARTICLES: Article[] = [
  limiteAprobare,
  fraudaIban,
  verificareFactura,
  dosarPlata,
  costEmail,
];

export type { Article, Block, Cluster, Source } from "./types";

/** Doar ce e publicat. Singura listă folosită la pre-randare și în sitemap. */
export function publishedArticles(): Article[] {
  return ARTICLES.filter((a) => a.published);
}

export function findPublishedArticle(slug: string): Article | undefined {
  return publishedArticles().find((a) => a.slug === slug);
}

/** Câte articole sunt scrise, dar așteaptă un aviz. Apare ca notă în listare. */
export function pendingReviewCount(): number {
  return ARTICLES.filter((a) => !a.published).length;
}

export function clusterCounts(articles: Article[]): Map<Cluster, number> {
  const counts = new Map<Cluster, number>();
  for (const a of articles) counts.set(a.cluster, (counts.get(a.cluster) ?? 0) + 1);
  return counts;
}
