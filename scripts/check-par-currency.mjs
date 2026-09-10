/**
 * Poartă de build: o sumă care aparține UNEI cereri nu se scrie niciodată în lei „din oficiu".
 *
 * Bug-ul pe care îl oprește (ATIC, PAR-2026-0027): cererea era de 1.500 USD, dar inboxul
 * aprobatorului, coada de finanțe și PDF-ul oficial o scriau „1.500,00 L" — pentru că treceau
 * suma prin `formatMDL()`, care are moneda scrisă în corpul funcției. Aceeași cifră, patru
 * ecrane, două monede. Cine aprobă semnează un act care spune altceva decât ecranul de alături.
 *
 * Regula, în două rânduri:
 *   • suma UNEI cereri / linii / oferte / plăți   → `formatCurrency(cents, <obiect>.currency)`
 *   • un TOTAL peste mai multe cereri              → în lei, din `totalMdlCents` (cursul e fixat
 *     la depunere), iar `formatMDL()` e formatarea potrivită exact acolo.
 *
 * Poarta caută apeluri `formatMDL(<expresie care conține un câmp de sumă per-cerere>)` în modulul
 * PAR, plus etichete de monedă scrise de mână în PDF-ul formularului. Dacă un caz e legitim
 * (valoarea E deja în lei), se anotează linia — sau linia de deasupra — cu:
 *   // currency-exempt: <motivul, în clar>
 *
 * Rulează în `scripts/vercel-build.mjs`, printre porțile statice.
 */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

/** Fișierele care afișează cereri PAR. */
const SCAN_DIRS = ["src/pages/par", "src/components/par"];
const SCAN_FILES = ["src/lib/parPdf.ts", "src/lib/poPdf.ts", "src/components/business/ParFocusDashboard.tsx"];

/**
 * Câmpuri care poartă o sumă în MONEDA CERERII. `totalMdlCents` lipsește intenționat din listă:
 * el ESTE în lei, deci `formatMDL(x.totalMdlCents)` e corect.
 */
const NATIVE_AMOUNT_FIELDS = [
  "totalEstimatedCents",
  "actualAmountCents",
  "unitPriceCents",
  "lineTotalCents",
  "totalCents",
  "amountCents",
];

const EXEMPT_MARKER = "currency-exempt:";
const violations = [];

function filesToScan() {
  // Argumentele de linie de comandă înlocuiesc setul implicit — testul de regresie îi dă o
  // fixtură cu violarea reintrodusă, ca să dovedească faptul că poarta chiar cade.
  const explicit = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  if (explicit.length > 0) return explicit;

  const out = [...SCAN_FILES];
  for (const dir of SCAN_DIRS) {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      continue; // directorul poate lipsi într-un checkout parțial
    }
    for (const e of entries) {
      if (e.isDirectory()) continue; // __tests__ nu ajunge la utilizator
      if (!/\.(ts|tsx)$/.test(e.name)) continue;
      out.push(path.join(dir, e.name));
    }
  }
  return out;
}

/** Argumentul lui `formatMDL(` care începe la `start`, echilibrat pe paranteze. */
function argumentAt(src, start) {
  let depth = 0;
  for (let i = start; i < src.length; i++) {
    const ch = src[i];
    if (ch === "(") depth++;
    else if (ch === ")") {
      depth--;
      if (depth === 0) return src.slice(start + 1, i);
    }
  }
  return src.slice(start, start + 200);
}

function lineOf(src, index) {
  return src.slice(0, index).split("\n").length;
}

function exempted(lines, lineNo) {
  return [lines[lineNo - 1], lines[lineNo - 2], lines[lineNo - 3]]
    .some((l) => (l ?? "").includes(EXEMPT_MARKER));
}

for (const file of filesToScan()) {
  let src;
  try {
    src = readFileSync(file, "utf8");
  } catch {
    continue;
  }
  const lines = src.split("\n");

  // 1. formatMDL() peste o sumă care e în moneda cererii.
  const re = /\bformatMDL\s*\(/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    const open = m.index + m[0].length - 1;
    const arg = argumentAt(src, open);
    const field = NATIVE_AMOUNT_FIELDS.find((f) => arg.includes(f));
    if (!field) continue;
    // `x.totalMdlCents ?? x.totalEstimatedCents` rămâne o violare: al doilea operand e în moneda
    // cererii, deci pe o cerere fără curs fixat se tipărește tot dolari cu „L" lângă.
    const lineNo = lineOf(src, m.index);
    if (exempted(lines, lineNo)) continue;
    violations.push({
      file,
      line: lineNo,
      what: `formatMDL(… ${field} …)`,
      fix: `folosește formatCurrency(${field}, <obiect>.currency), sau adună în lei din totalMdlCents`,
    });
  }

  // 2. Eticheta de monedă scrisă de mână în formularul tipărit.
  if (/(parPdf|poPdf)[\w.-]*\.ts$/.test(file)) {
    lines.forEach((line, i) => {
      const lineNo = i + 1;
      if (!/>\s*MDL\s*<|:\s*&nbsp;MDL|>\s*L\s*</.test(line)) return;
      if (exempted(lines, lineNo)) return;
      violations.push({
        file,
        line: lineNo,
        what: "etichetă de monedă scrisă direct în HTML-ul formularului",
        fix: "scrie moneda cererii (req.currency), nu 'MDL'",
      });
    });
  }
}

if (violations.length > 0) {
  console.error("\n❌ Sume per-cerere formatate ca lei (vezi CLAUDE.md §3.8 — Moneda cererii):\n");
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line}`);
    console.error(`      ${v.what}`);
    console.error(`      → ${v.fix}\n`);
  }
  console.error(
    `  ${violations.length} loc(uri). Dacă valoarea E deja în lei, marchează linia cu\n` +
    `  \`// ${EXEMPT_MARKER} <motiv>\` — exemptarea cere un motiv scris, nu o bifă.\n`
  );
  process.exit(1);
}

console.log("✅ moneda cererii: nicio sumă per-cerere nu e formatată ca lei din oficiu");
