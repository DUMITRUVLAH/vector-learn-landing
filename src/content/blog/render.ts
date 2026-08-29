import { coverFor, type CoverSpec } from "./cover";
import { coverSvg } from "./motifs";
import { BLOG_CSS } from "./styles";
import { TEASERS } from "./teasers";
import type { Article, Block, Source } from "./types";
import {
  EVIDENCE_LABEL,
  EVIDENCE_MEANING,
  figuresByIds,
  formatAmount,
  sourcesOfFigures,
} from "../data/figures";

/**
 * Randare în HTML, la build. Zero JavaScript pe pagina livrată.
 *
 * De ce nu React: aplicația e un SPA cu hash routing (`#/business/...`), deci conținutul ei nu
 * există pentru un crawler care face un singur fetch și nu execută JS. Un blog randat de aceeași
 * aplicație ar fi invizibil exact pentru cine trebuie să-l vadă. Aici textul e în HTML de la primul
 * octet, iar pagina se citește și cu JavaScript blocat.
 *
 * Consecința asupra designului: nimic nu se ascunde în spatele hidratării. Fără acordeoane pe JS,
 * fără „citește mai mult”, fără filtre de client. Singura excepție e `<details>` la FAQ — element
 * nativ, al cărui conținut e oricum în DOM.
 */

const SITE = {
  name: "FinFlow",
  tagline: "Cereri de plată, aprobări și control financiar",
  /** Pagina publică de prezentare. */
  appUrl: "/business",
  /**
   * Intrarea în aplicație.
   *
   * Aplicația folosește hash routing (`HashRouter`), deci linkul dintr-o pagină statică TREBUIE
   * să conțină `#`. Un `/business/login` fără diez ar cădea în fallback-ul SPA și ar deschide
   * pagina de start, nu autentificarea — greșeala e invizibilă la citit și evidentă la click.
   */
  loginUrl: "/#/business/login",
  contactEmail: "contact@finflow.best",
};

export const DEFAULT_BASE_URL = "https://finflow.best";

/* ────────────────────────────── utilitare ────────────────────────────── */

/** Escape pentru text în HTML. Tot ce vine din conținut trece pe aici. */
export function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const RO_DATE = new Intl.DateTimeFormat("ro-MD", { day: "numeric", month: "long", year: "numeric" });
const RO_MONTH = new Intl.DateTimeFormat("ro-MD", { month: "short", year: "numeric" });

function fmtDate(iso: string): string {
  return RO_DATE.format(new Date(`${iso}T00:00:00Z`));
}

/** Cuvintele din corpul articolului — pentru „N minute de citit”. */
export function wordCount(article: Article): number {
  let text = "";
  const add = (s?: string) => {
    if (s) text += ` ${s}`;
  };
  for (const b of article.body) {
    switch (b.kind) {
      case "answer":
      case "paragraph":
      case "note":
        add(b.text);
        break;
      case "heading":
      case "subheading":
        add(b.text);
        break;
      case "takeaways":
      case "list":
        b.items.forEach(add);
        break;
      case "steps":
        b.items.forEach((i) => {
          add(i.role);
          add(i.action);
          add(i.detail);
        });
        break;
      case "checklist":
        b.items.forEach((i) => {
          add(i.check);
          add(i.why);
        });
        break;
      case "table":
        b.head.forEach(add);
        b.rows.flat().forEach(add);
        break;
      case "costCase":
        add(b.assumption);
        b.lines.forEach((l) => add(l.label));
        b.excluded.forEach(add);
        break;
      case "template":
        add(b.intro);
        add(b.text);
        break;
      case "faq":
        b.items.forEach((i) => {
          add(i.q);
          add(i.a);
        });
        break;
      case "cta":
        add(b.text);
        break;
      default:
        break;
    }
  }
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/** 200 de cuvinte pe minut, minimum 1. Cifra e o convenție, nu o măsurătoare — de aceea e aici. */
export function readingMinutes(article: Article): number {
  return Math.max(1, Math.round(wordCount(article) / 200));
}

/** Sursele scrise de mână PLUS cele aduse de cifrele citate, deduplicate. */
export function allSourcesFor(article: Article): Source[] {
  const figureIds = article.body.flatMap((b) => (b.kind === "figureTable" ? b.figureIds : []));
  const seen = new Map<string, Source>();
  for (const s of [...article.sources, ...sourcesOfFigures(figureIds)]) {
    if (!seen.has(s.url)) seen.set(s.url, s);
  }
  return [...seen.values()];
}

/* ───────────────────────── blocuri de conținut ───────────────────────── */

/**
 * Text cu legături interne inline.
 *
 * Fraza se caută în text și se învelește; ce nu se potrivește rămâne text simplu. Nu aruncă pe o
 * frază lipsă — un link care nu se randează e o pagină mai săracă, nu o pagină ruptă — dar testul
 * de corpus pică, deci greșeala se vede la commit, nu la cititor.
 */
function linked(text: string, links?: { phrase: string; href: string }[]): string {
  if (!links?.length) return esc(text);
  // Cele mai lungi întâi: altfel o frază scurtă taie în mijlocul uneia lungi care o conține.
  const ordered = [...links].sort((a, b) => b.phrase.length - a.phrase.length);
  let parts: (string | { phrase: string; href: string })[] = [text];
  for (const link of ordered) {
    parts = parts.flatMap((part) => {
      if (typeof part !== "string") return [part];
      const at = part.indexOf(link.phrase);
      if (at === -1) return [part];
      return [part.slice(0, at), link, part.slice(at + link.phrase.length)].filter((p) => p !== "");
    });
  }
  return parts
    .map((p) =>
      typeof p === "string"
        ? esc(p)
        : `<a href="${esc(p.href)}">${esc(p.phrase)}</a>`,
    )
    .join("");
}

function renderBlock(block: Block): string {
  switch (block.kind) {
    case "answer":
      return `<p class="answer">${esc(block.text)}</p>`;

    case "takeaways":
      return `<aside class="panel" aria-labelledby="pe-scurt">
        <h2 id="pe-scurt">Pe scurt</h2>
        <ul class="bullets">${block.items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>
      </aside>`;

    case "heading":
      return `<h2 id="${esc(block.id)}">${esc(block.text)}</h2>`;

    case "subheading":
      return `<h3>${esc(block.text)}</h3>`;

    case "paragraph":
      return `<p>${linked(block.text, block.links)}</p>`;

    case "list": {
      const tag = block.ordered ? "ol" : "ul";
      return `<${tag} class="plain">${block.items.map((i) => `<li>${esc(i)}</li>`).join("")}</${tag}>`;
    }

    case "steps":
      return `<section class="panel panel--wide">
        ${block.heading ? `<h3>${esc(block.heading)}</h3>` : ""}
        <ol class="steps">${block.items
          .map(
            (i) => `<li>
              <span class="role">${esc(i.role)}</span>
              <span class="action">${esc(i.action)}</span>
              ${i.detail ? `<span class="detail">${esc(i.detail)}</span>` : ""}
            </li>`,
          )
          .join("")}</ol>
      </section>`;

    case "checklist":
      return `<section class="panel panel--wide">
        <h3>${esc(block.heading)}</h3>
        <ul class="checklist">${block.items
          .map(
            (i) => `<li><span><span class="what">${esc(i.check)}</span><span class="why">${esc(i.why)}</span></span></li>`,
          )
          .join("")}</ul>
      </section>`;

    case "table":
      return `<figure>
        <div class="table-scroll"><table>
          <thead><tr>${block.head.map((h) => `<th scope="col">${esc(h)}</th>`).join("")}</tr></thead>
          <tbody>${block.rows
            .map((row) => `<tr>${row.map((cell) => `<td>${esc(cell)}</td>`).join("")}</tr>`)
            .join("")}</tbody>
        </table></div>
        ${block.caption ? `<figcaption>${esc(block.caption)}</figcaption>` : ""}
      </figure>`;

    case "figureTable": {
      const figures = figuresByIds(block.figureIds);
      if (figures.length === 0) return "";
      return `<figure>
        <div class="table-scroll"><table>
          <thead><tr>
            <th scope="col">Ce măsoară</th>
            <th scope="col">Cifra</th>
            <th scope="col">Cui i se aplică</th>
            <th scope="col">De unde vine</th>
          </tr></thead>
          <tbody>${figures
            .map(
              (f) => `<tr>
                <td>${esc(f.label)}</td>
                <td class="num"><strong>${esc(f.value)}</strong></td>
                <td>${esc(f.scope)}${f.caveat ? `<br><span>${esc(f.caveat)}</span>` : ""}</td>
                <td>
                  <span class="evidence" title="${esc(EVIDENCE_MEANING[f.evidence])}">${esc(EVIDENCE_LABEL[f.evidence])}</span><br>
                  <a href="${esc(f.source.url)}" rel="nofollow noopener" target="_blank">${esc(f.source.label)}</a><br>
                  <span>Verificat ${esc(f.source.checked)}</span>
                </td>
              </tr>`,
            )
            .join("")}</tbody>
        </table></div>
        ${block.caption ? `<figcaption>${esc(block.caption)}</figcaption>` : ""}
      </figure>`;
    }

    case "costCase": {
      const total = block.lines.reduce((sum, l) => sum + l.amount, 0);
      return `<section class="panel panel--wide case">
        <h3>${esc(block.heading)}</h3>
        <p>${esc(block.assumption)}</p>
        <dl>${block.lines
          .map(
            (l) => `<div class="line">
              <dt>${esc(l.label)}${l.note ? `<small>${esc(l.note)}</small>` : ""}</dt>
              <dd>${esc(formatAmount(l.amount, block.currency))}</dd>
            </div>`,
          )
          .join("")}</dl>
        <p class="total"><span>Total pe an</span><b>${esc(formatAmount(total, block.currency))}</b></p>
        <p class="excluded-title">Ce nu intră în acest total</p>
        <ul class="bullets">${block.excluded.map((e) => `<li>${esc(e)}</li>`).join("")}</ul>
      </section>`;
    }

    case "template":
      return `<section class="tpl">
        <div class="tpl__head">
          <h3>${esc(block.heading)}</h3>
          ${block.intro ? `<p>${esc(block.intro)}</p>` : ""}
        </div>
        <pre>${esc(block.text)}</pre>
      </section>`;

    case "note":
      return `<p class="note note--${block.tone === "caution" ? "caution" : "neutral"}">${esc(block.text)}</p>`;

    case "faq":
      return `<section aria-labelledby="faq">
        <h2 id="faq">Întrebări frecvente</h2>
        ${block.items
          .map(
            (i) => `<details>
              <summary>${esc(i.q)}</summary>
              <p>${esc(i.a)}</p>
            </details>`,
          )
          .join("")}
      </section>`;

    case "cta":
      return `<div class="cta">
        <p>${esc(block.text)}</p>
        <a class="btn" href="${esc(block.href)}">${esc(block.label)}</a>
      </div>`;

    case "related":
      return ""; // randat separat, are nevoie de registru — vezi renderRelated
  }
}

function renderRelated(slugs: string[], all: Article[]): string {
  const items = slugs
    .map((slug) => all.find((a) => a.slug === slug && a.published))
    .filter((a): a is Article => Boolean(a));
  if (items.length === 0) return "";
  return `<nav class="next" aria-labelledby="mai-departe">
    <h2 id="mai-departe">Mai departe</h2>
    <ul>${items
      .map(
        (a) => `<li><a href="/blog/${esc(a.slug)}">
          <span class="t">${esc(a.title)}</span>
          ${TEASERS[a.slug] ? `<span class="d">${esc(TEASERS[a.slug])}</span>` : ""}
        </a></li>`,
      )
      .join("")}</ul>
  </nav>`;
}

/* ─────────────────────────── documentul HTML ─────────────────────────── */

type DocOptions = {
  title: string;
  description: string;
  canonical: string;
  body: string;
  jsonLd?: unknown;
  ogType?: "website" | "article";
};

function renderDocument(o: DocOptions): string {
  return `<!doctype html>
<html lang="ro">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(o.title)}</title>
<meta name="description" content="${esc(o.description)}">
<link rel="canonical" href="${esc(o.canonical)}">
<meta property="og:site_name" content="${SITE.name}">
<meta property="og:type" content="${o.ogType ?? "website"}">
<meta property="og:title" content="${esc(o.title)}">
<meta property="og:description" content="${esc(o.description)}">
<meta property="og:url" content="${esc(o.canonical)}">
<meta name="twitter:card" content="summary">
<link rel="icon" href="/favicon.svg">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Onest:wght@400;500;600;700&display=swap">
<link rel="stylesheet" href="/blog/blog.css">
${o.jsonLd ? `<script type="application/ld+json">${JSON.stringify(o.jsonLd)}</script>` : ""}
</head>
<body>
<header class="site-head">
  <div class="site-head__inner">
    <a class="brand" href="/blog">FinFlow <span>· ghiduri</span></a>
    <a class="nav-cta" href="${SITE.loginUrl}">Intră în FinFlow</a>
  </div>
</header>
${o.body}
<footer class="site-foot">
  <div class="site-foot__inner">
    <p style="margin:0">
      Scris de echipa ${SITE.name}, care vinde software de aprobare a plăților. Recomandăm, la final,
      propriul produs — o spunem aici, ca să o poți lua în calcul când citești.
    </p>
    <p style="margin:0">
      <a href="${SITE.appUrl}">Despre FinFlow</a> · <a href="mailto:${SITE.contactEmail}">${SITE.contactEmail}</a>
    </p>
  </div>
</footer>
</body>
</html>`;
}

/* ────────────────────────────── paginile ─────────────────────────────── */

function chip(spec: CoverSpec): string {
  return `<span class="chip" style="background: var(${spec.bgToken}, ${spec.bgLiteral}); color: var(${spec.inkToken}, ${spec.inkLiteral})">${esc(spec.label)}</span>`;
}

export function renderArticlePage(
  article: Article,
  all: Article[],
  baseUrl = DEFAULT_BASE_URL,
): string {
  const spec = coverFor(article);
  const canonical = `${baseUrl}/blog/${article.slug}`;
  const sources = allSourcesFor(article);

  // JSON-LD care reflectă exact ce e vizibil pe pagină. `reviewedBy` apare doar când există un om
  // real care a avizat — un markup care minte e mai rău decât unul absent.
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: article.title,
    description: article.metaDescription,
    inLanguage: article.lang,
    datePublished: article.datePublished,
    dateModified: article.lastVerified,
    mainEntityOfPage: canonical,
    author: { "@type": "Organization", name: article.author },
    publisher: { "@type": "Organization", name: SITE.name },
    ...(article.requiresExpertReview && article.expertReviewer
      ? { reviewedBy: { "@type": "Person", name: article.expertReviewer } }
      : {}),
    citation: sources.map((s) => ({ "@type": "CreativeWork", name: s.label, url: s.url })),
  };

  const bodyBlocks = article.body
    .map((b) => (b.kind === "related" ? renderRelated(b.slugs, all) : renderBlock(b)))
    .join("\n");

  const magnetSubject = encodeURIComponent(article.leadMagnet.emailSubject);
  const body = `<main class="wrap wrap--article">
  <article>
    <nav class="breadcrumb" aria-label="Firul Ariadnei">
      <a href="/blog">Ghiduri</a> · ${esc(spec.label)}
    </nav>

    <div style="margin-top:1.25rem">${chip(spec)}</div>
    <h1 style="margin-top:1rem">${esc(article.title)}</h1>

    <div class="meta meta--row">
      <span>${esc(article.author)}</span>
      <span aria-hidden="true">·</span>
      <span>Publicat <time datetime="${esc(article.datePublished)}">${esc(fmtDate(article.datePublished))}</time></span>
      <span aria-hidden="true">·</span>
      <span>Verificat <time datetime="${esc(article.lastVerified)}">${esc(fmtDate(article.lastVerified))}</time></span>
      <span aria-hidden="true">·</span>
      <span>${readingMinutes(article)} min de citit</span>
    </div>

    <p class="meta" style="margin-top:0.5rem">${
      article.requiresExpertReview && article.expertReviewer
        ? `Verificat de specialitate de ${esc(article.expertReviewer)}.`
        : "Ghid despre proces și organizare internă. Nu ține locul unei consultații fiscale sau juridice."
    }</p>

    ${coverSvg(spec, { className: "cover cover--article" })}

    ${bodyBlocks}

    <section class="magnet" style="background: var(${spec.bgToken}, ${spec.bgLiteral})">
      <h2 style="color: var(${spec.inkToken}, ${spec.inkLiteral})">${esc(article.leadMagnet.heading)}</h2>
      <p style="color: var(${spec.inkToken}, ${spec.inkLiteral}); opacity:.85">${esc(article.leadMagnet.promise)}</p>
      <div class="actions" style="margin-top:1.25rem">
        <a class="btn" href="${SITE.loginUrl}">Intră în FinFlow</a>
        <a class="btn btn--ghost" href="mailto:${SITE.contactEmail}?subject=${magnetSubject}">${esc(article.leadMagnet.buttonLabel)}</a>
      </div>
      <p class="meta" style="margin-top:1rem; color: var(${spec.inkToken}, ${spec.inkLiteral}); opacity:.75">
        Ai deja cont? Intri direct. Dacă nu, scrie-ne — îți deschidem un email gol, în clientul tău.
        Nu trimite documente, sume sau IBAN-uri: nu ne trebuie ca să răspundem.
      </p>
    </section>

    <section class="sources" aria-labelledby="surse">
      <h2 id="surse">${sources.length > 0 ? "Surse" : "Verificare"}</h2>
      ${sources.length === 0 ? `<p>Acest ghid descrie un proces intern și nu se sprijină pe nicio sursă externă: nu conține afirmații despre lege, fisc sau regulile unui finanțator. Tot ce recomandă poate fi verificat în propria organizație.</p>` : ""}
      <ol>${sources
        .map(
          (s) => `<li>
            <a href="${esc(s.url)}" rel="nofollow noopener" target="_blank">${esc(s.label)}</a>
            ${s.locator ? ` — ${esc(s.locator)}` : ""} — citită ${esc(s.checked)}
          </li>`,
        )
        .join("")}</ol>
      <p class="disclosure">
        Reverificăm acest ghid la fiecare ${article.refreshEvery} luni, sau mai devreme dacă se
        schimbă o sursă. Ultima verificare: ${esc(fmtDate(article.lastVerified))}.
      </p>
    </section>
  </article>
</main>`;

  return renderDocument({
    title: article.metaTitle,
    description: article.metaDescription,
    canonical,
    body,
    jsonLd,
    ogType: "article",
  });
}

export function renderListingPage(articles: Article[], baseUrl = DEFAULT_BASE_URL): string {
  const published = articles.filter((a) => a.published);
  const pending = articles.length - published.length;
  const [lead, ...rest] = published;

  const leadSpec = lead ? coverFor(lead) : undefined;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Blog",
    name: `Ghiduri ${SITE.name}`,
    inLanguage: "ro",
    url: `${baseUrl}/blog`,
    blogPost: published.map((a) => ({
      "@type": "BlogPosting",
      headline: a.title,
      url: `${baseUrl}/blog/${a.slug}`,
      datePublished: a.datePublished,
    })),
  };

  const body = `<main class="wrap">
  <header style="max-width:46rem">
    <h1>Cum ții banii sub control când nu poți verifica tu fiecare plată</h1>
    <p class="lede">
      Ghiduri despre coordonarea plăților: cine aprobă și până la ce sumă, ce se verifică înainte
      de plată, unde se pierd banii între oameni și ce rămâne în dosar pentru audit. Fiecare pagină
      spune de unde știe ce scrie, poartă data ultimei verificări și e reverificată la termen.
    </p>
  </header>

  ${
    lead && leadSpec
      ? `<a class="lead-card" href="/blog/${esc(lead.slug)}" style="background: var(${leadSpec.bgToken}, ${leadSpec.bgLiteral})">
      <div class="lead-card__body">
        <div>
          <span class="chip" style="background: hsl(var(--card)); color: var(${leadSpec.inkToken}, ${leadSpec.inkLiteral})">${esc(leadSpec.label)}</span>
          <h2 style="color: var(${leadSpec.inkToken}, ${leadSpec.inkLiteral})">${esc(lead.title)}</h2>
          <p style="color: var(${leadSpec.inkToken}, ${leadSpec.inkLiteral})">${esc(lead.metaDescription)}</p>
        </div>
        <span class="go" style="color: var(${leadSpec.inkToken}, ${leadSpec.inkLiteral})">Citește ghidul →</span>
      </div>
      <div class="lead-card__art">${coverSvg(leadSpec)}</div>
    </a>`
      : ""
  }

  <ul class="rows">
    ${rest
      .map((a) => {
        const spec = coverFor(a);
        return `<li><a class="row" href="/blog/${esc(a.slug)}">
          <span class="row__art">${coverSvg(spec)}</span>
          <span class="row__body">
            <span class="row__head">
              ${chip(spec)}
              <span class="meta">${readingMinutes(a)} min · verificat <time datetime="${esc(a.lastVerified)}">${esc(RO_MONTH.format(new Date(`${a.lastVerified}T00:00:00Z`)))}</time></span>
            </span>
            <h2>${esc(a.title)}</h2>
            <p>${esc(a.metaDescription)}</p>
          </span>
        </a></li>`;
      })
      .join("")}
  </ul>

  ${
    pending > 0
      ? `<p class="meta" style="margin-top:2.5rem; max-width:42rem; line-height:1.6">
      ${pending} ${pending === 1 ? "ghid este scris, dar nepublicat" : "ghiduri sunt scrise, dar nepublicate"}:
      ${pending === 1 ? "conține" : "conțin"} afirmații fiscale, iar la noi nimic fiscal nu se publică
      până nu îl verifică un contabil autorizat, cu numele pe pagină.
    </p>`
      : ""
  }
</main>`;

  return renderDocument({
    title: `Ghiduri de control financiar — ${SITE.name}`,
    description:
      "Ghiduri practice despre aprobarea plăților, verificarea facturilor, bugetul pe proiect și dosarul de audit. Cu surse citate și data ultimei verificări.",
    canonical: `${baseUrl}/blog`,
    body,
    jsonLd,
  });
}

export { BLOG_CSS };
