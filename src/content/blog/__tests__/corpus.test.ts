import { describe, expect, it } from "vitest";
import { ARTICLES, publishedArticles } from "..";
import { coverFor } from "../cover";
import { TEASERS } from "../teasers";
import { allSourcesFor, readingMinutes, renderArticlePage, renderListingPage } from "../render";
import { figureById } from "../../data/figures";

/**
 * Invariantele de corpus.
 *
 * Fiecare test de aici există pentru că verificarea corespunzătoare NU se poate face la citit:
 * un link intern spre un articol nepublicat arată identic cu unul bun, o cifră fără sursă arată
 * identic cu una citată, iar un schelet repetat se vede abia când ai zece articole în față.
 */

const published = publishedArticles();
const slugs = new Set(published.map((a) => a.slug));

describe("registru", () => {
  it("are cel puțin un articol publicat", () => {
    expect(published.length).toBeGreaterThan(0);
  });

  it("nu are slug-uri, titluri sau meta-titluri duplicate", () => {
    for (const key of ["slug", "title", "metaTitle", "primaryQuery"] as const) {
      const values = ARTICLES.map((a) => a[key]);
      expect(new Set(values).size, `${key} duplicat`).toBe(values.length);
    }
  });

  it("fiecare articol publicat are un cover propriu, nu pe cel implicit", () => {
    // Coverul implicit e o plasă de siguranță la randare; într-un articol publicat înseamnă că
    // cineva a uitat rândul din `cover.ts`, iar lista ar afișa două desene identice.
    for (const a of published) {
      const spec = coverFor(a);
      expect(spec.label, `${a.slug}: eticheta lipsește`).toBeTruthy();
      expect(spec.motif, `${a.slug}: motiv lipsă`).toBeTruthy();
    }
    const motifs = published.map((a) => coverFor(a).motif);
    expect(new Set(motifs).size, "două articole publicate au același motiv").toBe(motifs.length);
  });
});

describe("legături interne", () => {
  it("orice link /blog/... din text duce la un articol publicat", () => {
    for (const a of published) {
      for (const block of a.body) {
        const links =
          block.kind === "paragraph" ? (block.links ?? []) : block.kind === "cta" ? [{ href: block.href, phrase: "" }] : [];
        for (const l of links) {
          if (!l.href.startsWith("/blog/")) continue;
          const target = l.href.replace("/blog/", "");
          expect(slugs.has(target), `${a.slug} → ${l.href} nu există sau nu e publicat`).toBe(true);
        }
      }
    }
  });

  it("fraza fiecărui link inline chiar apare în paragraf", () => {
    // Altfel linkul dispare tăcut la randare: pagina rămâne întreagă, dar mai săracă.
    for (const a of published) {
      for (const block of a.body) {
        if (block.kind !== "paragraph" || !block.links) continue;
        for (const l of block.links) {
          expect(block.text.includes(l.phrase), `${a.slug}: fraza „${l.phrase}” lipsește din paragraf`).toBe(true);
        }
      }
    }
  });

  it("blocurile „Mai departe” trimit doar la articole publicate, cu teaser", () => {
    for (const a of published) {
      for (const block of a.body) {
        if (block.kind !== "related") continue;
        const live = block.slugs.filter((s) => slugs.has(s));
        expect(live.length, `${a.slug}: niciun articol publicat în „Mai departe”`).toBeGreaterThan(0);
        for (const s of live) {
          expect(TEASERS[s], `teaser lipsă pentru ${s}`).toBeTruthy();
        }
      }
    }
  });

  it("fiecare articol se termină cu o direcție spre aplicație", () => {
    // Cerință de produs: cititorul trebuie să aibă unde intra, nu doar ce citi.
    for (const a of published) {
      const html = renderArticlePage(a, published);
      expect(html, `${a.slug}: lipsește linkul de autentificare`).toContain("/#/business/login");
    }
  });
});

describe("dovezi", () => {
  it("fiecare cifră citată există în registrul de cifre", () => {
    for (const a of published) {
      for (const block of a.body) {
        if (block.kind !== "figureTable") continue;
        for (const id of block.figureIds) {
          expect(figureById(id), `${a.slug}: cifra „${id}” nu există`).toBeDefined();
        }
      }
    }
  });

  it("fiecare sursă are dată de verificare validă, în trecut", () => {
    const today = new Date().toISOString().slice(0, 10);
    for (const a of published) {
      const sources = allSourcesFor(a);
      // Un ghid pur editorial (proces intern) poate să nu citeze pe nimeni. Dar dacă citează o
      // cifră sau atinge conformitatea ori riscul, afirmațiile lui vin din afară și trebuie dovedite.
      const citesFigures = a.body.some((b) => b.kind === "figureTable");
      const needsSources = citesFigures || a.cluster === "conformitate" || a.cluster === "risc";
      if (needsSources) {
        expect(sources.length, `${a.slug}: face afirmații externe fără nicio sursă`).toBeGreaterThan(0);
      }
      for (const s of sources) {
        expect(s.checked, `${a.slug}: dată invalidă „${s.checked}”`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(s.checked <= today, `${a.slug}: sursă verificată în viitor`).toBe(true);
        expect(s.url.startsWith("https://"), `${a.slug}: sursă fără https`).toBe(true);
      }
    }
  });

  it("articolele cu afirmații de specialitate nu se publică fără expert numit", () => {
    for (const a of ARTICLES) {
      if (!a.published) continue;
      if (a.requiresExpertReview) {
        expect(a.expertReviewer, `${a.slug}: publicat fără expert`).toBeTruthy();
        expect(a.reviewStatus).toBe("approved");
      }
    }
  });

  it("un articol cu obligații se reverifică cel mult la 6 luni", () => {
    for (const a of published) {
      if (a.cluster !== "conformitate") continue;
      expect(a.refreshEvery, `${a.slug}: interval de reverificare prea mare`).toBeLessThanOrEqual(6);
    }
  });
});

describe("scheletul nu se repetă", () => {
  it("niciun articol nu începe cu același răspuns ca altul", () => {
    const openings = published.map(
      (a) => a.body.find((b) => b.kind === "answer")?.text.slice(0, 80) ?? "",
    );
    expect(new Set(openings).size).toBe(openings.length);
  });

  it("articolele nu au toate exact aceeași succesiune de blocuri", () => {
    // Corpusul din care ne inspirăm a picat exact aici: 42 de articole cu aceeași structură.
    const shapes = published.map((a) => a.body.map((b) => b.kind).join(">"));
    expect(new Set(shapes).size, "toate articolele au același schelet").toBeGreaterThan(1);
  });

  it("fiecare articol livrează ceva concret, nu doar proză", () => {
    const deliverables = new Set(["checklist", "steps", "table", "template", "costCase", "figureTable"]);
    for (const a of published) {
      const has = a.body.some((b) => deliverables.has(b.kind));
      expect(has, `${a.slug}: niciun material folosibil (checklist, tabel, model, calcul)`).toBe(true);
    }
  });
});

describe("randare", () => {
  it("produce HTML complet, cu canonical și fără JavaScript", () => {
    for (const a of published) {
      const html = renderArticlePage(a, published);
      expect(html.startsWith("<!doctype html>")).toBe(true);
      expect(html).toContain(`<link rel="canonical" href="https://finflow.best/blog/${a.slug}">`);
      expect(html).toContain('"@type":"Article"');
      // Singurul <script> permis e JSON-LD: pagina trebuie să se citească fără JS.
      const scripts = html.match(/<script[^>]*>/g) ?? [];
      expect(scripts.every((s) => s.includes("application/ld+json")), `${a.slug}: script executabil`).toBe(true);
      expect(readingMinutes(a)).toBeGreaterThan(0);
    }
  });

  it("listarea conține fiecare articol publicat", () => {
    const html = renderListingPage(published);
    for (const a of published) expect(html).toContain(`/blog/${a.slug}`);
  });
});
