/**
 * Alimentează oglinda locală a cursului BNM (`bnm_rates`) DINTR-O REȚEA CARE AJUNGE LA bnm.md.
 *
 * De ce există un script separat, în loc să descarce aplicația singură (cum făcea până acum):
 * din 25.09.2026 bnm.md nu mai răspunde cererilor venite din centre de date. Verificat în aceeași
 * zi, cu aceleași URL-uri: din Vercel → conexiunea expiră; de pe un runner GitHub → expiră; dintr-o
 * rețea obișnuită (laptopul) → 200 în ~200 ms. Nu e o pană a BNM și nu e ceva ce putem repara în
 * cod: e un filtru pe partea lor. Aplicația se descurcă și fără (servește ultimul curs memorat și
 * spune pe față că n-a ajuns la sursă — vezi server/lib/bnm/rates.ts), dar cineva tot trebuie să-i
 * aducă zilele noi. Acel „cineva" e scriptul ăsta, rulat de pe o mașină care are acces.
 *
 *   npm run fx:sync -- --env-file=.env.prodpull          # ultimele 10 zile
 *   npm run fx:sync -- --env-file=.env.prodpull --days=30
 *
 * Conexiunea la bază se dă explicit (FX_SYNC_DATABASE_URL, altfel URL-ul non-pooling din env-ul
 * tras cu `vercel env pull`), ca să nu se poată întâmpla din greșeală pe baza locală de dezvoltare.
 * Parsarea vine din server/lib/fx.ts — aceleași funcții pe care le folosește aplicația, ca formatul
 * să nu se poată despărți în două implementări.
 */
import fs from "node:fs";
import postgres from "postgres";
import {
  bnmCsvUrl,
  bnmXmlUrl,
  parseBnmCsv,
  parseBnmRates,
  type BnmQuote,
} from "../server/lib/fx";

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : undefined;
}

/** Citește un fișier în format .env (ce scoate `vercel env pull`) în process.env, fără să suprascrie. */
function loadEnvFile(file: string): void {
  if (!fs.existsSync(file)) throw new Error(`fișierul de mediu nu există: ${file}`);
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const i = line.indexOf("=");
    if (i < 1 || line.trimStart().startsWith("#")) continue;
    const key = line.slice(0, i).trim();
    const value = line.slice(i + 1).trim().replace(/^"(.*)"$/s, "$1");
    if (value && !process.env[key]) process.env[key] = value;
  }
}

function isoDate(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/** Ziua de la BNM: XML pentru zilele recente (lista completă), CSV pentru arhivă. */
async function fetchDay(iso: string): Promise<BnmQuote[]> {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, (m ?? 1) - 1, d ?? 1);
  try {
    const xml = await fetch(bnmXmlUrl(date), { signal: AbortSignal.timeout(20_000) });
    if (xml.ok) {
      const quotes = parseBnmRates(await xml.text());
      if (quotes.length > 0) return quotes;
    }
  } catch {
    /* cădem pe CSV */
  }
  const csv = await fetch(bnmCsvUrl(date), { signal: AbortSignal.timeout(20_000) });
  if (!csv.ok) return [];
  return parseBnmCsv(await csv.text());
}

async function main(): Promise<void> {
  const envFile = arg("env-file");
  if (envFile) loadEnvFile(envFile);

  const url =
    process.env.FX_SYNC_DATABASE_URL ??
    process.env.learningvectortop_POSTGRES_URL_NON_POOLING ??
    process.env.POSTGRES_URL_NON_POOLING;
  if (!url) {
    console.error(
      "❌ Lipsește conexiunea. Dă-i --env-file=<fișier de la `vercel env pull`> sau FX_SYNC_DATABASE_URL."
    );
    process.exit(1);
  }

  const days = Math.max(1, Math.min(Number(arg("days") ?? "10"), 400));
  const wanted: string[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    wanted.push(isoDate(d));
  }

  const sql = postgres(url, { ssl: "require", max: 1 });
  try {
    const present = new Set(
      (
        await sql<{ d: string }[]>`
          select distinct to_char(rate_date, 'YYYY-MM-DD') as d
          from bnm_rates
          where rate_date >= ${wanted[wanted.length - 1]}
        `
      ).map((r) => r.d)
    );

    const missing = wanted.filter((d) => !present.has(d)).sort();
    if (missing.length === 0) {
      console.log(`✅ Oglinda e la zi — ultimele ${days} zile sunt toate memorate.`);
      return;
    }
    console.log(`Lipsesc ${missing.length} zile: ${missing.join(", ")}`);

    let inserted = 0;
    let reached = 0;
    for (const iso of missing) {
      let quotes: BnmQuote[] = [];
      try {
        quotes = await fetchDay(iso);
        reached++;
      } catch (err) {
        console.log(`  ${iso}: n-am ajuns la bnm.md (${(err as Error).message})`);
        continue;
      }
      if (quotes.length === 0) {
        // Normal pentru o zi pe care BNM chiar n-o publică (zi viitoare, arhivă lipsă).
        console.log(`  ${iso}: BNM n-are curs pentru ziua asta`);
        continue;
      }
      const rows = quotes.map((q) => ({
        rate_date: iso,
        code: q.code,
        name: q.name.slice(0, 120),
        nominal: String(q.nominal),
        value: String(q.value),
        mdl_per_unit: q.mdlPerUnit.toFixed(8),
      }));
      const res = await sql`
        insert into bnm_rates ${sql(rows, "rate_date", "code", "name", "nominal", "value", "mdl_per_unit")}
        on conflict do nothing
      `;
      inserted += res.count ?? 0;
      console.log(`  ${iso}: ${quotes.length} valute (${res.count ?? 0} rânduri noi)`);
    }

    if (reached === 0) {
      console.error(
        "\n❌ Nu s-a ajuns la bnm.md din rețeaua asta. Rulează scriptul de pe o mașină cu acces (vezi antetul)."
      );
      process.exit(1);
    }
    console.log(`\n✅ Gata — ${inserted} rânduri noi în oglindă.`);
  } finally {
    await sql.end();
  }
}

void main();
