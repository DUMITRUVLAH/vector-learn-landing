/**
 * Verifică faptul că blogul e SERVIT, nu doar că răspunde.
 *
 * De ce există: pe 29 august 2026 am declarat deploy-ul reușit pentru că `/blog/<slug>` întorcea
 * 200. Întorcea 200 pentru că fallback-ul SPA răspunde 200 la absolut orice cale — pagina servită
 * era shell-ul aplicației, fără o vorbă din articol. O verificare care nu poate pica nu e o
 * verificare. Aici asertăm CONȚINUT: canonicalul propriu al paginii și titlul ei, care nu au cum
 * să apară în shell.
 *
 * Include și testul negativ: o rută inexistentă TREBUIE să cadă în shell. Fără el, un script care
 * ar considera orice 200 drept succes ar trece și pe un deploy complet gol.
 *
 *   node scripts/check-blog-live.mjs                      # https://www.finflow.best
 *   BASE_URL=https://preview.vercel.app node scripts/check-blog-live.mjs
 */
import { execFileSync } from "node:child_process";

const BASE = (process.env.BASE_URL ?? "https://www.finflow.best").replace(/\/$/, "");

// Citim registrul prin tsx: slug-urile și titlurile trăiesc într-un singur loc, deci lista de
// verificat nu poate rămâne în urmă față de articolele publicate.
const listed = execFileSync(
  "npx",
  [
    "tsx",
    "-e",
    `import { publishedArticles } from "./src/content/blog";
     console.log(JSON.stringify(publishedArticles().map((a) => ({ slug: a.slug, title: a.title }))));`,
  ],
  { encoding: "utf8" },
);
const articles = JSON.parse(listed.trim().split("\n").at(-1));

async function get(path) {
  const res = await fetch(`${BASE}${path}`, { redirect: "follow" });
  return { status: res.status, body: await res.text() };
}

const failures = [];
const ok = (label) => console.log(`  ✅ ${label}`);
const bad = (label, why) => {
  failures.push(`${label} — ${why}`);
  console.log(`  ❌ ${label}: ${why}`);
};

console.log(`\n═══ Blog live pe ${BASE} ═══\n`);

const listing = await get("/blog");
if (listing.status !== 200) bad("/blog", `status ${listing.status}`);
else if (!listing.body.includes('rel="canonical"') || !listing.body.includes("/blog/"))
  bad("/blog", "răspunde 200, dar nu e listarea (probabil shell-ul SPA)");
else ok(`/blog (${articles.length} articole publicate)`);

for (const a of articles) {
  const r = await get(`/blog/${a.slug}`);
  if (r.status !== 200) bad(`/blog/${a.slug}`, `status ${r.status}`);
  // Canonicalul se compară pe CALE, nu pe gazdă: pe un preview, paginile poartă domeniul de
  // producție cu care au fost construite, iar o verificare pe gazdă ar pica fals exact acolo
  // unde vrei s-o folosești. Titlul e al doilea martor — shell-ul SPA nu are cum să-l conțină.
  else if (!r.body.includes(`/blog/${a.slug}">`) || !r.body.includes("<h1"))
    bad(`/blog/${a.slug}`, "200, dar fără canonicalul propriu — se servește shell-ul SPA");
  else if (!r.body.includes(a.title.slice(0, 24)))
    bad(`/blog/${a.slug}`, "200, dar pagina nu conține titlul articolului");
  else if (!r.body.includes("/#/business/login"))
    bad(`/blog/${a.slug}`, "lipsește direcția spre autentificare");
  else ok(`/blog/${a.slug}`);
}

const css = await get("/blog/blog.css");
if (!css.body.startsWith(":root")) bad("/blog/blog.css", "nu e foaia de stil (shell SPA?)");
else ok("/blog/blog.css");

const sitemap = await get("/sitemap.xml");
if (!sitemap.body.includes("<urlset")) bad("/sitemap.xml", "nu e un sitemap");
else if (!articles.every((a) => sitemap.body.includes(`/blog/${a.slug}`)))
  bad("/sitemap.xml", "nu conține toate articolele publicate");
else ok("/sitemap.xml");

// Testul negativ: dacă și asta „trece", verificarea de mai sus nu demonstrează nimic.
const ghost = await get("/blog/aceasta-pagina-nu-exista-niciodata");
if (ghost.body.includes("/blog/aceasta-pagina-nu-exista-niciodata\">"))
  bad("test negativ", "o rută inexistentă e servită ca articol");
else ok("test negativ (ruta inexistentă nu e articol)");

console.log(
  failures.length === 0
    ? `\n═══ Blogul e servit corect pe ${BASE} ═══\n`
    : `\n═══ ${failures.length} probleme ═══\n${failures.map((f) => ` · ${f}`).join("\n")}\n`,
);
process.exit(failures.length === 0 ? 0 : 1);
