/**
 * Pre-randează blogul ca HTML static, în `dist/blog/`.
 *
 * De ce există: aplicația e un SPA cu hash routing, deci conținutul ei nu apare în HTML-ul inițial.
 * Un crawler face un singur fetch și nu execută JavaScript — o pagină de conținut randată din client
 * nu există pentru el. Blogul trăiește, deci, pe rute reale (`/blog/<slug>`), ca fișiere complete.
 *
 * Rulează DUPĂ `vite build` (are nevoie de `dist/`) și înainte de împachetarea pentru Vercel.
 * Scrie și `sitemap.xml` + `robots.txt`: un sitemap generat din registru nu poate rămâne în urmă
 * față de articole, spre deosebire de unul întreținut manual.
 */
import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { publishedArticles } from "../src/content/blog";
import { BLOG_CSS, renderArticlePage, renderListingPage, DEFAULT_BASE_URL } from "../src/content/blog/render";

const BASE_URL = (process.env.BLOG_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/$/, "");
const DIST = path.resolve(process.cwd(), "dist");
const OUT = path.join(DIST, "blog");

if (!existsSync(DIST)) {
  console.error("dist/ lipsește — rulează `vite build` înainte de build-blog.");
  process.exit(1);
}

mkdirSync(OUT, { recursive: true });

const articles = publishedArticles();
if (articles.length === 0) {
  console.error("Niciun articol publicat. Nu are sens un blog gol în dist/.");
  process.exit(1);
}

writeFileSync(path.join(OUT, "blog.css"), BLOG_CSS, "utf8");
writeFileSync(path.join(OUT, "index.html"), renderListingPage(articles, BASE_URL), "utf8");

for (const article of articles) {
  writeFileSync(
    path.join(OUT, `${article.slug}.html`),
    renderArticlePage(article, articles, BASE_URL),
    "utf8",
  );
}

/**
 * Sitemap-ul acoperă doar ce e indexabil: prezentarea publică și articolele.
 * Rutele aplicației sunt în spatele autentificării și nu au ce căuta aici.
 */
const urls = [
  { loc: `${BASE_URL}/business`, lastmod: undefined as string | undefined, priority: "1.0" },
  { loc: `${BASE_URL}/blog`, lastmod: articles[0]?.lastVerified, priority: "0.8" },
  ...articles.map((a) => ({ loc: `${BASE_URL}/blog/${a.slug}`, lastmod: a.lastVerified, priority: "0.7" })),
];

writeFileSync(
  path.join(DIST, "sitemap.xml"),
  `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    (u) =>
      `  <url><loc>${u.loc}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ""}<priority>${u.priority}</priority></url>`,
  )
  .join("\n")}
</urlset>
`,
  "utf8",
);

// Robots: aplicația (tot ce e sub `#`) nu se indexează oricum — hash-ul nu ajunge la server.
// Ce contează aici e ca sitemap-ul să fie găsit.
const robotsPath = path.join(DIST, "robots.txt");
if (!existsSync(robotsPath) || readFileSync(robotsPath, "utf8").includes("Sitemap:") === false) {
  writeFileSync(robotsPath, `User-agent: *\nAllow: /\n\nSitemap: ${BASE_URL}/sitemap.xml\n`, "utf8");
}

console.log(
  `✅ Blog pre-randat: ${articles.length} articole + listare → dist/blog/ (bază: ${BASE_URL})`,
);
