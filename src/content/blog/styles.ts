/**
 * Foaia de stil a blogului, emisă ca fișier propriu (`/blog/blog.css`).
 *
 * De ce NU folosim CSS-ul aplicației: `dist/assets/index-*.css` conține tot Tailwind-ul aplicației
 * (peste 100 KB) pentru un document care are nevoie de vreo trei duzini de reguli, iar numele
 * fișierului conține un hash care se schimbă la fiecare build — deci pagina statică ar depinde de
 * un artefact instabil. Un fișier propriu, mic, ține paginile de conținut rapide și independente
 * de bundle-ul aplicației.
 *
 * De ce valorile sunt scrise aici, deși regula repo-ului cere tokeni: acesta ESTE locul unde se
 * definesc tokenii pentru documentele statice. Valorile sunt copiate din `src/index.css` — aceleași
 * nume, aceleași triplete HSL — ca blogul și aplicația să fie vizibil același produs. Dacă se
 * schimbă kitul, se schimbă în ambele locuri; `src/content/blog/__tests__/tokens.test.ts` compară
 * mecanic cele două fișiere și pică dacă au divergat.
 *
 * Temă: aceeași pagină în light și dark, după preferința sistemului. Nu există comutator — ar cere
 * JavaScript, iar pe o pagină de conținut JavaScript-ul nu-și plătește costul.
 */
export const BLOG_CSS = `
:root {
  --background: 220 20% 97%;
  --foreground: 222 47% 11%;
  --card: 0 0% 100%;
  --primary: 228 76% 52%;
  --primary-foreground: 0 0% 100%;
  --muted: 220 14% 96%;
  --muted-foreground: 220 9% 46%;
  --border: 220 13% 91%;
  --radius: 0.875rem;

  --module-indigo-bg: #E0E7FF;  --module-indigo-fg: #4338CA;
  --module-violet-bg: #EDE9FE;  --module-violet-fg: #6D28D9;
  --module-cyan-bg: #CFFAFE;    --module-cyan-fg: #155E75;
  --module-emerald-bg: #D1FAE5; --module-emerald-fg: #047857;
  --module-orange-bg: #FFEDD5;  --module-orange-fg: #C2410C;
  --module-teal-bg: #CCFBF1;    --module-teal-fg: #0F766E;
  --module-sky-bg: #E0F2FE;     --module-sky-fg: #0369A1;
  --module-rose-bg: #FFE4E6;    --module-rose-fg: #BE123C;
  --module-amber-bg: #FEF3C7;   --module-amber-fg: #92400E;
}

@media (prefers-color-scheme: dark) {
  :root {
    --background: 222 47% 6%;
    --foreground: 220 14% 96%;
    --card: 222 47% 9%;
    --primary: 228 76% 60%;
    --muted: 222 30% 16%;
    --muted-foreground: 220 9% 60%;
    --border: 222 30% 20%;

    --module-indigo-bg: hsl(239 38% 18%);  --module-indigo-fg: hsl(239 85% 82%);
    --module-violet-bg: hsl(258 38% 18%);  --module-violet-fg: hsl(258 85% 84%);
    --module-cyan-bg: hsl(188 38% 16%);    --module-cyan-fg: hsl(188 75% 74%);
    --module-emerald-bg: hsl(160 38% 15%); --module-emerald-fg: hsl(160 70% 70%);
    --module-orange-bg: hsl(25 38% 18%);   --module-orange-fg: hsl(25 90% 74%);
    --module-teal-bg: hsl(174 38% 15%);    --module-teal-fg: hsl(174 70% 68%);
    --module-sky-bg: hsl(200 38% 17%);     --module-sky-fg: hsl(200 85% 78%);
    --module-rose-bg: hsl(350 38% 18%);    --module-rose-fg: hsl(350 85% 82%);
    --module-amber-bg: hsl(38 38% 17%);    --module-amber-fg: hsl(38 90% 72%);
  }
}

*, *::before, *::after { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; }
body {
  margin: 0;
  background: hsl(var(--background));
  color: hsl(var(--foreground));
  font-family: Onest, system-ui, -apple-system, "Segoe UI", sans-serif;
  font-size: 17px;
  line-height: 1.6;
  -webkit-font-smoothing: antialiased;
}
::selection { background: hsl(var(--primary) / 0.2); }
:focus-visible { outline: 2px solid hsl(var(--primary)); outline-offset: 2px; border-radius: 4px; }
img, svg { max-width: 100%; }

.wrap { max-width: 76rem; margin: 0 auto; padding: 4rem 1.25rem 5rem; }
.wrap--article { max-width: 44rem; padding-top: 3rem; }
@media (min-width: 640px) { .wrap { padding-left: 2rem; padding-right: 2rem; } }

/* ── antet + subsol, comune ─────────────────────────────────────────────── */
.site-head {
  border-bottom: 1px solid hsl(var(--border));
  background: hsl(var(--card) / 0.8);
  backdrop-filter: blur(8px);
  position: sticky; top: 0; z-index: 10;
}
.site-head__inner {
  max-width: 76rem; margin: 0 auto; padding: 0 1.25rem;
  height: 3.5rem; display: flex; align-items: center; justify-content: space-between; gap: 1rem;
}
.brand { font-weight: 700; letter-spacing: -0.02em; text-decoration: none; color: inherit; font-size: 1.05rem; }
.brand span { color: hsl(var(--muted-foreground)); font-weight: 500; }
.site-head a.nav-cta {
  display: inline-flex; align-items: center; min-height: 2.25rem; padding: 0 0.9rem;
  border-radius: 0.6rem; background: hsl(var(--primary)); color: hsl(var(--primary-foreground));
  text-decoration: none; font-size: 0.875rem; font-weight: 600;
}
.site-foot {
  border-top: 1px solid hsl(var(--border)); margin-top: 4rem;
  padding: 2.5rem 1.25rem 3rem; color: hsl(var(--muted-foreground)); font-size: 0.875rem;
}
.site-foot__inner { max-width: 76rem; margin: 0 auto; display: flex; flex-wrap: wrap; gap: 1rem 2rem; justify-content: space-between; }
.site-foot a { color: inherit; }

/* ── tipografie ─────────────────────────────────────────────────────────── */
h1 { font-size: clamp(2rem, 5vw, 2.75rem); line-height: 1.1; letter-spacing: -0.03em; font-weight: 700; margin: 0; }
h2 { font-size: 1.5rem; line-height: 1.25; letter-spacing: -0.02em; font-weight: 700; margin: 3rem 0 0; scroll-margin-top: 5rem; }
h3 { font-size: 1.125rem; letter-spacing: -0.01em; font-weight: 600; margin: 2rem 0 0; }
p { margin: 1rem 0 0; color: hsl(var(--muted-foreground)); }
a { color: inherit; }
.lede { font-size: 1.125rem; color: hsl(var(--muted-foreground)); max-width: 38rem; margin-top: 1.5rem; }

/* ── etichete, meta ─────────────────────────────────────────────────────── */
.chip {
  display: inline-flex; align-items: center; border-radius: 999px; padding: 0.25rem 0.65rem;
  font-size: 0.6875rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em;
}
.meta { font-size: 0.8125rem; color: hsl(var(--muted-foreground)); font-variant-numeric: tabular-nums; }
.meta--row { display: flex; flex-wrap: wrap; gap: 0.25rem 0.75rem; margin-top: 1.25rem; }
.breadcrumb { font-size: 0.8125rem; color: hsl(var(--muted-foreground)); }
.breadcrumb a { text-decoration: none; }
.breadcrumb a:hover { color: hsl(var(--foreground)); }

/* ── coperți ────────────────────────────────────────────────────────────── */
.cover { display: block; width: 100%; height: 100%; }
.cover--article { height: 11rem; border-radius: 1rem; margin-top: 2rem; }
@media (min-width: 640px) { .cover--article { height: 14rem; } }

/* ── listare ────────────────────────────────────────────────────────────── */
.lead-card {
  display: grid; margin-top: 2rem; border-radius: 1.75rem; overflow: hidden; text-decoration: none;
  transition: transform .2s ease, box-shadow .2s ease;
}
.lead-card:hover { transform: translateY(-2px); box-shadow: 0 12px 32px hsl(222 47% 11% / 0.12); }
@media (min-width: 768px) { .lead-card { grid-template-columns: 1.15fr 1fr; } }
.lead-card__body { padding: 1.75rem; display: flex; flex-direction: column; justify-content: space-between; gap: 2rem; }
@media (min-width: 640px) { .lead-card__body { padding: 2.5rem; } }
.lead-card h2 { margin: 1.5rem 0 0; font-size: clamp(1.5rem, 3.5vw, 2.1rem); }
.lead-card p { opacity: 0.8; }
.lead-card .go { font-weight: 600; font-size: 0.9375rem; }
.lead-card__art { min-height: 12rem; }

.rows { list-style: none; margin: 1.5rem 0 0; padding: 0; display: flex; flex-direction: column; gap: 0.75rem; }
.row {
  display: flex; align-items: center; gap: 1.25rem; padding: 1rem; border-radius: 1rem;
  background: hsl(var(--muted) / 0.5); text-decoration: none; transition: background .2s ease;
}
.row:hover { background: hsl(var(--muted)); }
.row__art { display: none; flex: 0 0 10rem; height: 6rem; border-radius: 0.75rem; overflow: hidden; }
@media (min-width: 640px) { .row__art { display: block; } .row { padding: 1.25rem; } }
.row__body { min-width: 0; }
.row h2 { margin: 0.6rem 0 0; font-size: 1.125rem; line-height: 1.35; letter-spacing: -0.015em; color: hsl(var(--foreground)); }
.row p { margin: 0.4rem 0 0; font-size: 0.9375rem; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.row__head { display: flex; flex-wrap: wrap; align-items: center; gap: 0.4rem 0.75rem; }

/* ── blocuri de articol ─────────────────────────────────────────────────── */
.answer { font-size: 1.15rem; font-weight: 500; line-height: 1.55; color: hsl(var(--foreground)); margin-top: 1.75rem; }
.panel { margin-top: 2rem; border-radius: 1rem; background: hsl(var(--muted) / 0.5); padding: 1.25rem 1.35rem; }
.panel > h2, .panel > h3 { margin-top: 0; }
.panel--wide { border-radius: 1.5rem; padding: 1.5rem; }
.panel h2 { font-size: 0.875rem; letter-spacing: -0.01em; }
.bullets { list-style: none; margin: 0.75rem 0 0; padding: 0; display: flex; flex-direction: column; gap: 0.6rem; }
.bullets li { display: flex; gap: 0.65rem; font-size: 0.9375rem; color: hsl(var(--muted-foreground)); }
.bullets li::before { content: ""; flex: 0 0 auto; width: 6px; height: 6px; border-radius: 999px; background: hsl(var(--primary)); margin-top: 0.55rem; }
ul.plain, ol.plain { color: hsl(var(--muted-foreground)); padding-left: 1.15rem; margin-top: 1rem; }
ul.plain li, ol.plain li { margin-top: 0.4rem; }

.steps { list-style: none; margin: 1.25rem 0 0; padding: 0; counter-reset: step; }
.steps li { position: relative; padding: 0 0 1.1rem 2.6rem; counter-increment: step; }
.steps li::before {
  content: counter(step); position: absolute; left: 0; top: 0;
  width: 1.75rem; height: 1.75rem; border-radius: 999px;
  background: hsl(var(--primary) / 0.12); color: hsl(var(--primary));
  display: flex; align-items: center; justify-content: center; font-size: 0.8125rem; font-weight: 700;
}
.steps li:not(:last-child)::after {
  content: ""; position: absolute; left: 0.85rem; top: 2rem; bottom: 0.35rem;
  width: 1px; background: hsl(var(--border));
}
.steps .role { display: block; font-size: 0.75rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: hsl(var(--muted-foreground)); }
.steps .action { display: block; margin-top: 0.15rem; font-weight: 600; color: hsl(var(--foreground)); }
.steps .detail { display: block; margin-top: 0.25rem; font-size: 0.9375rem; color: hsl(var(--muted-foreground)); }

.checklist { list-style: none; margin: 1rem 0 0; padding: 0; display: flex; flex-direction: column; gap: 0.85rem; }
.checklist li { display: grid; grid-template-columns: 1.35rem 1fr; gap: 0.65rem; }
.checklist li::before {
  content: ""; margin-top: 0.35rem; width: 1.1rem; height: 1.1rem; border-radius: 0.35rem;
  border: 2px solid hsl(var(--border));
}
.checklist .what { font-weight: 600; color: hsl(var(--foreground)); font-size: 0.9375rem; }
.checklist .why { display: block; margin-top: 0.15rem; font-size: 0.9375rem; color: hsl(var(--muted-foreground)); }

figure { margin: 2rem 0 0; }
.table-scroll { overflow-x: auto; border: 1px solid hsl(var(--border)); border-radius: 1rem; }
table { width: 100%; min-width: 34rem; border-collapse: collapse; text-align: left; font-size: 0.875rem; }
th { font-weight: 600; color: hsl(var(--foreground)); background: hsl(var(--muted) / 0.5); }
th, td { padding: 0.7rem 0.9rem; border-bottom: 1px solid hsl(var(--border) / 0.6); vertical-align: top; line-height: 1.5; }
tbody tr:last-child td { border-bottom: 0; }
td { color: hsl(var(--muted-foreground)); }
td:first-child { color: hsl(var(--foreground)); font-weight: 500; }
figcaption { margin-top: 0.75rem; font-size: 0.8125rem; color: hsl(var(--muted-foreground)); }
.num { font-variant-numeric: tabular-nums; }
.evidence {
  display: inline-flex; border-radius: 0.4rem; padding: 0.1rem 0.4rem; font-size: 0.6875rem;
  font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em;
  background: hsl(var(--foreground) / 0.08); color: hsl(var(--foreground));
}

.case dl { margin: 1.25rem 0 0; }
.case .line { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 0.25rem 1rem; border-bottom: 1px solid hsl(var(--border) / 0.6); padding-bottom: 0.6rem; margin-bottom: 0.6rem; }
.case .line:last-of-type { border-bottom: 0; }
.case dt { font-size: 0.9375rem; color: hsl(var(--foreground)); }
.case dt small { display: block; color: hsl(var(--muted-foreground)); font-size: 0.8125rem; }
.case dd { margin: 0; font-size: 0.9375rem; color: hsl(var(--muted-foreground)); font-variant-numeric: tabular-nums; }
.case .total { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: baseline; gap: 1rem; margin-top: 1rem; color: hsl(var(--foreground)); }
.case .total b { font-size: 1.25rem; font-variant-numeric: tabular-nums; }
.case .excluded-title { margin-top: 1.25rem; font-size: 0.8125rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: hsl(var(--muted-foreground)); }

.tpl { margin-top: 2rem; border-radius: 1rem; border: 1px solid hsl(var(--border)); overflow: hidden; }
.tpl__head { padding: 0.9rem 1.15rem; background: hsl(var(--muted) / 0.5); border-bottom: 1px solid hsl(var(--border)); }
.tpl__head h3 { margin: 0; font-size: 0.9375rem; }
.tpl__head p { margin: 0.3rem 0 0; font-size: 0.875rem; }
.tpl pre {
  margin: 0; padding: 1.15rem; overflow-x: auto; white-space: pre-wrap; word-break: break-word;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.85rem; line-height: 1.65;
  color: hsl(var(--foreground)); background: hsl(var(--card));
}

.note { margin-top: 1.75rem; border-radius: 1rem; padding: 1rem 1.25rem; font-size: 0.9375rem; }
.note--neutral { background: hsl(var(--muted) / 0.5); color: hsl(var(--muted-foreground)); }
.note--caution { background: hsl(var(--primary) / 0.09); color: hsl(var(--foreground)); font-weight: 500; }

details {
  border-radius: 1rem; background: hsl(var(--muted) / 0.5); margin-top: 0.5rem;
}
summary {
  list-style: none; cursor: pointer; display: flex; align-items: center; justify-content: space-between;
  gap: 1rem; min-height: 2.75rem; padding: 0.8rem 1.15rem; font-weight: 600; color: hsl(var(--foreground));
}
summary::-webkit-details-marker { display: none; }
summary::after { content: "→"; color: hsl(var(--muted-foreground)); transition: transform .2s ease; }
details[open] summary::after { transform: rotate(90deg); }
details p { margin: 0; padding: 0 1.15rem 1rem; }

.cta { margin-top: 3rem; border-radius: 1rem; background: hsl(var(--muted) / 0.5); padding: 1.5rem; }
.cta p { margin: 0; color: hsl(var(--foreground)); }
.btn {
  display: inline-flex; align-items: center; min-height: 2.75rem; padding: 0 1.25rem; margin-top: 1rem;
  border-radius: 0.75rem; background: hsl(var(--primary)); color: hsl(var(--primary-foreground));
  text-decoration: none; font-weight: 600; font-size: 0.9375rem;
}
.btn--ghost { background: transparent; color: hsl(var(--foreground)); border: 1px solid hsl(var(--border)); }

.magnet { margin-top: 3.5rem; border-radius: 1.5rem; padding: 1.75rem; }
.magnet h2 { margin: 0; font-size: 1.25rem; }
.magnet p { margin-top: 0.75rem; }
.magnet .actions { display: flex; flex-wrap: wrap; gap: 0.75rem; align-items: center; }

.next { margin-top: 3.5rem; }
.next h2 { font-size: 0.875rem; text-transform: uppercase; letter-spacing: 0.06em; color: hsl(var(--muted-foreground)); font-weight: 600; }
.next ul { list-style: none; margin: 1rem 0 0; padding: 0; display: flex; flex-direction: column; gap: 0.6rem; }
.next a { display: block; border-radius: 1rem; background: hsl(var(--muted) / 0.5); padding: 0.9rem 1.15rem; text-decoration: none; }
.next a:hover { background: hsl(var(--muted)); }
.next .t { font-weight: 600; color: hsl(var(--foreground)); font-size: 0.9375rem; }
.next .d { display: block; margin-top: 0.2rem; font-size: 0.875rem; color: hsl(var(--muted-foreground)); }

.sources { margin-top: 3rem; border-top: 1px solid hsl(var(--border)); padding-top: 2rem; }
.sources h2 { margin: 0; font-size: 1.125rem; }
.sources ol { margin: 1rem 0 0; padding-left: 1.15rem; font-size: 0.875rem; color: hsl(var(--muted-foreground)); }
.sources li { margin-top: 0.65rem; }
.sources a { color: hsl(var(--foreground)); }
.disclosure { margin-top: 2rem; font-size: 0.8125rem; color: hsl(var(--muted-foreground)); }

@media (prefers-reduced-motion: reduce) {
  * { transition: none !important; animation: none !important; }
}
`.trim();
