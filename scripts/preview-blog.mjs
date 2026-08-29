/**
 * Server de previzualizare pentru blogul pre-randat: `node scripts/preview-blog.mjs [port]`.
 *
 * Există pentru că URL-urile publice nu poartă `.html`, iar orice server static simplu întoarce
 * 404 pe `/blog/<slug>` — deci o previzualizare cu linkuri moarte, care nu seamănă cu producția.
 * Aici maparea e aceeași ca pe Vercel (scripts/build-vercel.mjs) și ca în server/index.ts.
 */
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";

const DIST = path.resolve(process.cwd(), "dist");
const PORT = Number(process.argv[2] ?? 4174);
const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".xml": "application/xml", ".svg": "image/svg+xml", ".txt": "text/plain; charset=utf-8" };

async function resolveFile(urlPath) {
  const clean = decodeURIComponent(urlPath.split("?")[0]);
  const candidates =
    clean === "/" || clean === "/blog" || clean === "/blog/"
      ? ["blog/index.html"]
      : [clean.replace(/^\//, ""), `${clean.replace(/^\//, "")}.html`];
  for (const c of candidates) {
    const file = path.join(DIST, c);
    if (!file.startsWith(DIST)) continue;
    try {
      if ((await stat(file)).isFile()) return file;
    } catch {
      /* încearcă următorul candidat */
    }
  }
  return null;
}

createServer(async (req, res) => {
  const file = await resolveFile(req.url ?? "/");
  if (!file) {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("404 — nu există în dist/. Ai rulat `npm run build:blog`?");
    return;
  }
  res.writeHead(200, { "content-type": TYPES[path.extname(file)] ?? "application/octet-stream" });
  res.end(await readFile(file));
}).listen(PORT, () => console.log(`📄 Previzualizare blog: http://localhost:${PORT}/blog`));
