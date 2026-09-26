/**
 * NAV-09 — gărzi pentru mutarea FinDesk de pe /app/fin pe /business/fin.
 *
 * Aceeași clasă de bug a scăpat de trei ori: ParDetail (iunie), IT Park (septembrie: spinner infinit,
 * 9 pagini nerutate) și 23 de linkuri `/app/fin/*` care aruncau omul pe tabloul general. Plus trei
 * pagini întregi (registrul contabil, cartea mare, termenele fiscale) care existau pe disc fără rută.
 * Testele de mai jos fac clasa asta imposibilă de reintrodus în tăcere.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const SRC = path.resolve(__dirname, "../..");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return name === "__tests__" ? [] : walk(full);
    return /\.(ts|tsx)$/.test(name) && !/\.test\./.test(name) ? [full] : [];
  });
}

/** Liniile de cod (nu comentariile) — un comentariu poate cita ruta veche ca istorie. */
function codeLines(file: string): string[] {
  return readFileSync(file, "utf-8")
    .split("\n")
    .filter((l) => !/^\s*(\*|\/\/|\/\*|\{\/\*)/.test(l));
}

describe("NAV-09 — fără linkuri spre aplicația veche /app/fin", () => {
  it("[blocant] niciun link, navigare sau regex de rută nu mai folosește /app/fin", () => {
    const offenders: string[] = [];
    for (const file of walk(SRC)) {
      const rel = path.relative(SRC, file);
      codeLines(file).forEach((line) => {
        if (!/[#"`/]\/?app\/fin\b|\\\/app\\\/fin/.test(line)) return;
        // Căile de import („./pages/app/fin/…") sunt directoare pe disc, nu rute.
        if (/import\(|from "/.test(line)) return;
        // Singura excepție legitimă: redirecționarea din dispecer, care EXISTĂ ca să le prindă pe vechi.
        if (rel === "App.tsx" && line.includes('path.replace("/app/fin", "/business/fin")')) return;
        if (rel === "App.tsx" && line.includes('path.startsWith("/app/fin")')) return;
        offenders.push(`${rel}: ${line.trim().slice(0, 120)}`);
      });
    }
    expect(offenders).toEqual([]);
  });

  it("[blocant] dispecerul redirecționează /app/fin/* spre /business/fin/*", () => {
    const app = readFileSync(path.join(SRC, "App.tsx"), "utf-8");
    expect(app).toContain('if (path.startsWith("/app/fin")) return <RedirectHash to={path.replace("/app/fin", "/business/fin")} />;');
  });
});

describe("NAV-09 — nicio pagină FinDesk orfană", () => {
  it("[blocant] fiecare pagină din src/pages/fin e importată de cod care rulează", () => {
    const pagesDir = path.join(SRC, "pages", "fin");
    const pages = readdirSync(pagesDir).filter((f) => f.endsWith(".tsx"));
    const all = walk(SRC);
    const orphans = pages.filter((file) => {
      const base = file.replace(/\.tsx$/, "");
      return !all.some(
        (other) => path.basename(other) !== file && new RegExp(`["'/]${base}["']`).test(readFileSync(other, "utf-8")),
      );
    });
    expect(orphans).toEqual([]);
  });
});
