#!/usr/bin/env node
/**
 * Inventarul textului rămas netradus — lista de lucru pentru pasul de traducere.
 *
 * Nu e un traducător automat și nu modifică nimic. Trece prin `.tsx`-urile din
 * domeniile configurate și scoate, cu `fișier:linie`, textul care se vede pe ecran
 * și care încă nu trece prin `t()`. Fără el, pasul de traducere înseamnă citit
 * 16.000 de linii ca să găsești 1.500 care contează.
 *
 * Ce raportează:
 *   - text JSX între taguri:            <p>Cereri de plată</p>
 *   - proprietăți de interfață:         placeholder="Caută…"  aria-label="Închide"
 *   - literali în tablouri de etichete: { label: "Aprobări" }
 *
 * Ce ignoră deliberat, ca lista să rămână acționabilă:
 *   - comentarii și JSDoc (documentația rămâne în română — e pentru dezvoltatori)
 *   - clase Tailwind, importuri, chei de obiect, rute, `data-*`
 *   - texte deja trecute prin `t(...)`
 *
 * Utilizare:
 *   node scripts/i18n-scan.mjs                 # toate domeniile, rezumat
 *   node scripts/i18n-scan.mjs --area=par      # doar PAR
 *   node scripts/i18n-scan.mjs --list          # fiecare apariție, fișier:linie
 *   node scripts/i18n-scan.mjs --json          # pentru unelte
 */
/* eslint-disable no-console -- unealta de linie de comandă: raportul ei ESTE ieșirea la consolă */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();

/** Domeniile de tradus. Un domeniu nou = o linie aici. */
const AREAS = {
  landing: ["src/pages/business/BusinessLandingPage.tsx", "src/pages/business/features"],
  par: ["src/pages/par", "src/components/par"],
  shell: ["src/components/business/BusinessShell.tsx", "src/components/ds"],
};

const args = process.argv.slice(2);
const wantJson = args.includes("--json");
const wantList = args.includes("--list") || wantJson;
const areaArg = args.find((a) => a.startsWith("--area="))?.slice("--area=".length);

/** Un caracter românesc e semnalul cel mai sigur că un literal e text pentru ochi. */
const ROMANIAN = /[ăâîșțĂÂÎȘȚ]/;

/** Cuvinte românești frecvente fără diacritice — prind „Total plati" și „Cerere noua". */
const ROMANIAN_WORDS =
  /\b(și|sau|pentru|este|sunt|către|dintre|fără|după|cerere|cereri|plată|plăți|aprobare|aprobări|factură|facturi|document|documente|adaugă|salvează|trimite|anulează|caută|toate|nicio|niciun|selectează|alege|introdu|nume|dată|sumă|total|furnizor|proiect|utilizator|setări)\b/i;

function looksLikeUiText(value) {
  const text = value.trim();
  if (text.length < 2) return false;
  // Un singur cuvânt fără spațiu și fără diacritice e mai probabil o cheie sau o clasă.
  if (!/\s/.test(text) && !ROMANIAN.test(text)) return false;
  if (/^[\w-]+$/.test(text)) return false;
  // Clase Tailwind, rute, url-uri, formate.
  if (/^[a-z0-9-]+(\s+[a-z0-9:/[\]-]+)+$/.test(text)) return false;
  if (/^[/#.]/.test(text) || /^https?:/.test(text)) return false;
  return ROMANIAN.test(text) || ROMANIAN_WORDS.test(text);
}

/** Șterge comentariile ca să nu raportăm documentația drept text de tradus. */
function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, p1) => p1 + " ".repeat(Math.max(0, m.length - p1.length)));
}

const PROP_NAMES =
  "placeholder|title|aria-label|aria-description|alt|label|description|subtitle|heading|text|message|tooltip|emptyLabel|pageTitle|pageDescription|confirmLabel|cancelLabel";

function scanFile(absolute) {
  const source = readFileSync(absolute, "utf8");
  const cleaned = stripComments(source);
  const lines = cleaned.split("\n");
  const rawLines = source.split("\n");
  const hits = [];

  lines.forEach((line, index) => {
    // Ce trece deja prin `t(...)` nu mai e de tradus.
    const withoutTranslated = line.replace(/\bt\(\s*[`"'][^`"']*[`"']/g, "t(KEY");

    // 1. Proprietăți de interfață cu literal.
    const propRe = new RegExp(`\\b(${PROP_NAMES})\\s*=\\s*["']([^"']+)["']`, "g");
    for (const match of withoutTranslated.matchAll(propRe)) {
      if (looksLikeUiText(match[2])) {
        hits.push({ line: index + 1, kind: `prop:${match[1]}`, text: match[2] });
      }
    }

    // 2. Literali în obiecte de etichete: label: "…", title: "…"
    const objRe = new RegExp(`\\b(${PROP_NAMES})\\s*:\\s*["']([^"']+)["']`, "g");
    for (const match of withoutTranslated.matchAll(objRe)) {
      if (looksLikeUiText(match[2])) {
        hits.push({ line: index + 1, kind: `obj:${match[1]}`, text: match[2] });
      }
    }

    // 3. Text JSX: ce rămâne pe linie după ce scoatem tagurile și expresiile.
    //    Fraza se raportează întreagă — spartă în cuvinte, lista devine inutilizabilă.
    const jsxText = withoutTranslated
      .replace(/<[^>]*>/g, "")
      .replace(/\{[^}]*\}/g, "")
      .trim();
    if (looksLikeUiText(jsxText) && !/[=;{}<>]/.test(jsxText)) {
      hits.push({ line: index + 1, kind: "jsx", text: jsxText });
    }
  });

  // Deduplică pe (linie, text): un literal poate fi prins de două reguli.
  const seen = new Set();
  return hits.filter((hit) => {
    const id = `${hit.line}|${hit.text}`;
    if (seen.has(id)) return false;
    seen.add(id);
    return rawLines[hit.line - 1] !== undefined;
  });
}

function walk(target) {
  const absolute = join(ROOT, target);
  let stats;
  try {
    stats = statSync(absolute);
  } catch {
    return [];
  }
  if (stats.isFile()) return absolute.endsWith(".tsx") ? [absolute] : [];
  return readdirSync(absolute).flatMap((entry) => {
    if (entry === "__tests__" || entry === "node_modules") return [];
    return walk(join(target, entry));
  });
}

const areas = areaArg ? { [areaArg]: AREAS[areaArg] } : AREAS;
if (areaArg && !AREAS[areaArg]) {
  console.error(`Domeniu necunoscut „${areaArg}". Disponibile: ${Object.keys(AREAS).join(", ")}`);
  process.exit(2);
}

const report = {};
let total = 0;

for (const [area, targets] of Object.entries(areas)) {
  const files = targets.flatMap(walk);
  const entries = [];
  for (const file of files) {
    const hits = scanFile(file);
    if (hits.length) entries.push({ file: relative(ROOT, file), hits });
  }
  entries.sort((a, b) => b.hits.length - a.hits.length);
  report[area] = entries;
  total += entries.reduce((sum, entry) => sum + entry.hits.length, 0);
}

if (wantJson) {
  console.log(JSON.stringify({ total, areas: report }, null, 2));
  process.exit(0);
}

console.log(`\nText netradus — ${total} apariții\n`);
for (const [area, entries] of Object.entries(report)) {
  const areaTotal = entries.reduce((sum, entry) => sum + entry.hits.length, 0);
  console.log(`  ${area.padEnd(10)} ${String(areaTotal).padStart(5)}`);
  for (const entry of entries) {
    console.log(`    ${String(entry.hits.length).padStart(5)}  ${entry.file}`);
    if (!wantList) continue;
    for (const hit of entry.hits) {
      console.log(`           ${entry.file}:${hit.line}  [${hit.kind}] ${hit.text}`);
    }
  }
  console.log("");
}
console.log("Traduci un fișier: adaugi cheile în src/lib/i18n/dictionaries/<modul>.ts (ro + en),");
console.log('apoi înlocuiești literalul cu t("<cheie>"). `npm run test:run -- i18n` verifică paritatea.\n');
