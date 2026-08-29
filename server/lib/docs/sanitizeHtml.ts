/**
 * DG-104 — curățarea corpului de șablon scris în editor.
 *
 * De ce pe server, deși curățăm și la lipire în editor: corpul unui șablon ajunge randat în
 * aplicație ȘI în PDF, iar API-ul poate fi apelat direct, ocolind editorul. Un `<img onerror>`
 * salvat într-un șablon s-ar executa la fiecare deschidere a unui act, pentru fiecare coleg —
 * adică XSS persistent cu difuzare largă. Deci: listă albă de etichete și atribute, tot restul
 * dispare. Regula e „ce nu e permis explicit, nu trece".
 *
 * Nu e un parser HTML complet și nici nu vrea să fie: acceptă structura pe care o produce editorul
 * (paragrafe, titluri, liste, tabele, aliniere) și aruncă orice altceva.
 */

/** Etichetele pe care le poate conține un act. Fără `script`, `style`, `iframe`, `img`, `form`. */
const ALLOWED_TAGS = new Set([
  "p", "br", "hr", "div", "span",
  "strong", "b", "em", "i", "u", "s", "sub", "sup",
  "h1", "h2", "h3", "h4",
  "ul", "ol", "li",
  "table", "thead", "tbody", "tfoot", "tr", "td", "th",
  "blockquote", "a",
]);

/** Atributele permise, per etichetă. `data-field` e cipul de câmp din editor (DG-105). */
const ALLOWED_ATTRS: Record<string, Set<string>> = {
  "*": new Set(["data-field"]),
  a: new Set(["href", "title"]),
  td: new Set(["colspan", "rowspan"]),
  th: new Set(["colspan", "rowspan"]),
  p: new Set(["data-align"]),
  h1: new Set(["data-align"]),
  h2: new Set(["data-align"]),
  h3: new Set(["data-align"]),
  h4: new Set(["data-align"]),
  div: new Set(["data-align", "data-page-break"]),
};

/** Etichete al căror CONȚINUT trebuie aruncat, nu doar eticheta. */
const DROP_WITH_CONTENT = ["script", "style", "iframe", "object", "embed", "noscript", "template"];

const VOID_TAGS = new Set(["br", "hr"]);

function isSafeHref(value: string): boolean {
  const v = value.trim().toLowerCase();
  // `javascript:`, `data:` și `vbscript:` sunt vectorii clasici; permitem doar linkuri utile.
  return (
    v.startsWith("http://") ||
    v.startsWith("https://") ||
    v.startsWith("mailto:") ||
    v.startsWith("#") ||
    v.startsWith("/")
  );
}

function cleanAttributes(tag: string, raw: string): string {
  const allowed = ALLOWED_ATTRS[tag] ?? new Set<string>();
  const global = ALLOWED_ATTRS["*"];
  const out: string[] = [];
  const attrRe = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
  let m: RegExpExecArray | null;
  while ((m = attrRe.exec(raw))) {
    const name = m[1].toLowerCase();
    const value = m[3] ?? m[4] ?? m[5] ?? "";
    // Orice handler de eveniment cade, indiferent de etichetă.
    if (name.startsWith("on")) continue;
    if (!allowed.has(name) && !global.has(name)) continue;
    if (name === "href" && !isSafeHref(value)) continue;
    out.push(`${name}="${value.replace(/"/g, "&quot;")}"`);
  }
  return out.length > 0 ? ` ${out.join(" ")}` : "";
}

/**
 * Întoarce HTML-ul curățat. Textul rămâne neatins; doar etichetele și atributele sunt filtrate.
 */
export function sanitizeTemplateHtml(input: string): string {
  if (!input) return "";
  let html = input;

  // 1. Elementele periculoase pleacă cu tot cu conținut (inclusiv nedeschise/neînchise corect).
  for (const tag of DROP_WITH_CONTENT) {
    html = html.replace(new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}\\s*>`, "gi"), "");
    html = html.replace(new RegExp(`<\\/?${tag}\\b[^>]*>`, "gi"), "");
  }

  // 2. Comentariile (inclusiv gunoiul „<!--[if gte mso 9]>" lipit din Word).
  html = html.replace(/<!--[\s\S]*?-->/g, "");
  html = html.replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, "");
  html = html.replace(/<![^>]*>/g, "");

  // 3. Restul etichetelor: cele din lista albă se păstrează curățate, celelalte dispar
  //    (conținutul lor rămâne — un `<font>` în plus nu trebuie să șteargă textul actului).
  html = html.replace(
    /<\/?([a-zA-Z][a-zA-Z0-9-]*)((?:[^>"']|"[^"]*"|'[^']*')*)\/?>/g,
    (_full, rawTag: string, rawAttrs: string) => {
      const tag = rawTag.toLowerCase();
      if (!ALLOWED_TAGS.has(tag)) return "";
      const closing = _full.startsWith("</");
      if (closing) return `</${tag}>`;
      if (VOID_TAGS.has(tag)) return `<${tag}>`;
      return `<${tag}${cleanAttributes(tag, rawAttrs)}>`;
    }
  );

  return html;
}

/**
 * Curățarea la lipire din Word: pe lângă filtrarea de mai sus, scoate spațiile insecabile în
 * lanț și paragrafele goale pe care Word le presară între rânduri.
 */
export function cleanPastedHtml(input: string): string {
  return sanitizeTemplateHtml(input)
    .replace(/&nbsp;/g, " ")
    .replace(/<p>\s*<\/p>/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}
