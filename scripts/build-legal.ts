/**
 * Pre-randează paginile legale ca HTML static: `dist/confidentialitate.html`, `dist/termeni.html`.
 *
 * De ce nu sunt rute din aplicație: ecranul de consimțământ Google cere politici publice, pe domeniul
 * autorizat, care răspund cu conținut la un singur fetch. Aplicația e un SPA cu hash routing, deci o
 * rută `#/confidentialitate` i-ar da verificatorului un document gol. Aceeași soluție ca la blog.
 *
 * Rulează DUPĂ `vite build` (are nevoie de `dist/`) și după `build-blog` (refolosește `/blog/blog.css`).
 */
import { existsSync, writeFileSync } from "node:fs";
import path from "node:path";
import { LEGAL_PAGES } from "../src/content/legal";
import { renderDocument, DEFAULT_BASE_URL } from "../src/content/blog/render";

const BASE_URL = (process.env.BLOG_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/$/, "");
const DIST = path.resolve(process.cwd(), "dist");

if (!existsSync(DIST)) {
  console.error("dist/ lipsește — rulează `vite build` înainte de build-legal.");
  process.exit(1);
}

/** Subsolul paginilor legale: trimiteri între ele, fără nota de marketing a blogului. */
const FOOTER = `<footer class="site-foot">
  <div class="site-foot__inner">
    <p style="margin:0">
      <a href="/confidentialitate">Confidențialitate</a> · <a href="/termeni">Termeni</a> ·
      <a href="/business">Produsul</a> · <a href="mailto:contact@finflow.best">contact@finflow.best</a>
    </p>
    <p style="margin:0">© ${new Date().getFullYear()} Vector Academy SRL</p>
  </div>
</footer>`;

for (const page of LEGAL_PAGES) {
  const canonical = `${BASE_URL}/${page.slug}`;
  const html = renderDocument({
    title: page.title,
    description: page.description,
    canonical,
    body: page.body,
    footer: FOOTER,
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: page.title,
      description: page.description,
      url: canonical,
      inLanguage: "ro",
      dateModified: page.updated,
      publisher: { "@type": "Organization", name: "FinFlow" },
    },
  });
  writeFileSync(path.join(DIST, `${page.slug}.html`), html, "utf8");
  console.log(`[build-legal] ${page.slug}.html — ${(html.length / 1024).toFixed(1)} KB`);
}
