#!/usr/bin/env node
/**
 * Testează extragerea PAR pe un document REAL și, opțional, salvează-l în corpus.
 *
 *   npm run par:extract -- ~/Downloads/factura.pdf
 *   npm run par:extract -- ~/Downloads/factura.pdf --save 12-nume-scurt
 *
 * Rulează exact aceeași cale ca aplicația (același extractor de text din PDF + același
 * parser determinist), ca ce vezi aici să fie ce vezi în ecran. Cu `--save` scrie perechea
 * `<slug>.txt` + `<slug>.json` în corpus, cu așteptările PRE-COMPLETATE din rezultatul
 * curent — le corectezi manual pe cele greșite, apoi `npm run par:corpus` pică până repari
 * codul. Așa un document raportat devine regresie permanentă.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { basename, extname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(import.meta.url), "..", "..");
const CORPUS = join(ROOT, "server", "lib", "par", "__tests__", "fixtures", "documents");

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--"));
const saveIdx = args.indexOf("--save");
const saveSlug = saveIdx !== -1 ? args[saveIdx + 1] : null;
const orgName = (() => {
  const i = args.indexOf("--org");
  return i !== -1 ? args[i + 1] : "VECTOR ACADEMY S.R.L.";
})();

if (!file) {
  console.error(`Utilizare:
  npm run par:extract -- <fișier.pdf|.txt> [--save <slug>] [--org "<denumirea ta legală>"]

  --save <slug>  salvează documentul în corpus ca regresie permanentă
  --org  <nume>  denumirea propriei organizații (exclusă ca beneficiar). Implicit: ${orgName}`);
  process.exit(1);
}
if (!existsSync(file)) {
  console.error(`Nu găsesc fișierul: ${file}`);
  process.exit(1);
}

// tsx e deja o dependință a proiectului; importă direct sursele TypeScript.
const { register } = await import("tsx/esm/api");
const unregister = register();

const { parsePartiesFromText } = await import(
  join(ROOT, "server", "lib", "par", "stubPartyParser.ts")
);
const { choosePayee } = await import(join(ROOT, "server", "lib", "par", "choosePayee.ts"));

let text;
if (extname(file).toLowerCase() === ".pdf") {
  const { extractPdfText } = await import(join(ROOT, "server", "lib", "ai", "pdfText.ts"));
  text = await extractPdfText(readFileSync(file));
} else {
  text = readFileSync(file, "utf8");
}

const ext = parsePartiesFromText(text);
const choice = choosePayee({ ...ext, isStub: true }, orgName);
const p = choice.payee;

const line = "─".repeat(76);
console.log(`\n${line}\n  ${basename(file)}   (${text.length} caractere de text)\n${line}`);
console.log("\nPĂRȚI GĂSITE:");
for (const party of ext.parties) {
  console.log(`  • [${party.role}] ${party.name}`);
  console.log(
    `      idno=${party.idno ?? "—"}  iban=${party.iban ?? "—"}  bic=${party.bic ?? "—"}`,
  );
  console.log(`      bancă=${party.bank ?? "—"}`);
  console.log(`      adresă=${party.legalAddress ?? "—"}  admin=${party.administratorName ?? "—"}`);
}

console.log(`\nBENEFICIAR PROPUS: ${p ? p.name : choice.needsClarification ? "(întreabă utilizatorul — ambiguu)" : "(niciunul)"}`);
if (p) {
  console.log(`  IDNO/IDNP : ${p.idno ?? "— (gol)"}`);
  console.log(`  IBAN      : ${p.iban ?? "— (gol)"}`);
  console.log(`  BIC/SWIFT : ${p.bic ?? "— (gol)"}`);
  console.log(`  Bancă     : ${p.bank ?? "— (gol)"}`);
  console.log(`  Adresă    : ${p.legalAddress ?? "— (gol)"}`);
  console.log(`  Admin     : ${p.administratorName ?? "— (gol)"}`);
}
console.log(`\n  Sumă  : ${ext.amountCents != null ? (ext.amountCents / 100).toFixed(2) : "— (gol)"} ${ext.currency ?? ""}`);
console.log(`  Scop  : ${ext.scope ?? "— (gol)"}`);
console.log(`  Clasă : ${ext.documentClass ?? "—"}`);
console.log(`\n  Câmpuri marcate „de verificat”: ${
  Object.entries(choice.lowConfidence).filter(([, v]) => v).map(([k]) => k).join(", ") || "niciunul"
}`);

if (saveSlug) {
  if (!/^[\w-]+$/.test(saveSlug)) {
    console.error(`\nSlug invalid: „${saveSlug}" — folosește litere, cifre și „-".`);
    process.exit(1);
  }
  const txtPath = join(CORPUS, `${saveSlug}.txt`);
  const jsonPath = join(CORPUS, `${saveSlug}.json`);
  if (existsSync(txtPath) || existsSync(jsonPath)) {
    console.error(`\nExistă deja un document cu slug-ul „${saveSlug}" în corpus. Alege altul.`);
    process.exit(1);
  }
  writeFileSync(txtPath, text, "utf8");
  const asteptari = {
    payeeName: p?.name ?? null,
    payeeIdno: p?.idno ?? null,
    payeeIban: p?.iban ?? null,
    payeeBic: p?.bic ?? null,
    ...(p?.bank ? { payeeBankContains: p.bank } : {}),
    ...(p?.legalAddress ? { payeeLegalAddressContains: p.legalAddress } : {}),
    amountCents: ext.amountCents,
    currency: ext.currency,
    ...(ext.scope ? { scopeMatches: ext.scope.slice(0, 30).replace(/[.*+?^${}()|[\]\\]/g, "\\$&") } : {}),
    documentClass: ext.documentClass,
    needsClarification: choice.needsClarification,
  };
  writeFileSync(
    jsonPath,
    `${JSON.stringify(
      {
        name: saveSlug.replace(/-/g, " "),
        sursa: `Document real, adăugat cu par:extract din ${basename(file)}`,
        deCeConteaza: "TODO: scrie ce anume rupe acest document (layout, limbă, diacritice…)",
        asteptari,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  console.log(`\n✅ Salvat în corpus:
   ${txtPath}
   ${jsonPath}

   ATENȚIE: așteptările sunt pre-completate cu rezultatul de ACUM, care poate fi GREȘIT.
   Deschide fișierul .json, corectează valorile la ce TREBUIE să iasă, apoi rulează:
       npm run par:corpus
   Testul trebuie să PICE (dovedind bug-ul), apoi repari codul până trece.`);
}

await unregister();
