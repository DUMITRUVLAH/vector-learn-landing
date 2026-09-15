/**
 * Împrospătează șabloanele de sistem în toate workspace-urile, acum, în loc să aștepte.
 *
 * Aplicația face asta singură: `ensureSystemTemplates` (server/routes/docs.ts) compară corpul
 * livrat de produs cu cel din bază și îl actualizează când diferă. Dar rulează abia când cineva
 * deschide biblioteca de șabloane — deci un workspace în care nimeni n-a intrat luna asta rămâne
 * cu textul vechi, chiar dacă produsul a livrat unul mai bun.
 *
 * Scriptul face exact ce face serverul, cu ACELEAȘI funcții (nu o a doua implementare care ar
 * diverge): aceeași potrivire pe nume, aceeași ridicare de versiune, aceiași placeholderi
 * recalculați. Atinge doar rândurile `is_system = true` — pe acelea nimeni nu le poate edita
 * (serverul răspunde 403), deci nu se suprascrie munca nimănui; copiile clonate de organizații
 * rămân neatinse.
 *
 *   npx tsx scripts/refresh-system-templates.ts              # dry-run
 *   npx tsx scripts/refresh-system-templates.ts --apply
 *   npx tsx scripts/refresh-system-templates.ts --tenant <uuid> --apply
 */
import postgres from "postgres";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { SYSTEM_TEMPLATES } from "../server/lib/docs/systemTemplates";
import { extractPlaceholders } from "../server/lib/docmerge/placeholders";

const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : null;
};
const APPLY = args.includes("--apply");
const ONLY_TENANT = flag("tenant");
const ENV_FILE = flag("env-file") ?? path.join(process.env.HOME ?? "", "vector-learn-landing/.env.vercel");

function connectionString(): string | null {
  const direct = flag("url") ?? process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
  if (direct) return direct;
  if (existsSync(ENV_FILE)) {
    const env = Object.fromEntries(
      readFileSync(ENV_FILE, "utf8")
        .split("\n")
        .filter((l) => l.includes("=") && !l.trimStart().startsWith("#"))
        .map((l) => {
          const i = l.indexOf("=");
          return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")];
        })
    );
    const key =
      Object.keys(env).find((k) => k.endsWith("POSTGRES_URL_NON_POOLING")) ??
      Object.keys(env).find((k) => k.endsWith("POSTGRES_URL"));
    if (key) return env[key];
  }
  return null;
}

async function main() {
  const conn = connectionString();
  if (!conn) throw new Error("Nicio conexiune: dă `--url`, `DATABASE_URL` sau `--env-file`.");
  const sql = postgres(conn, { ssl: conn.includes("localhost") ? false : "require", max: 1, connect_timeout: 20 });

  try {
    const shipped = new Map(SYSTEM_TEMPLATES.map((t) => [t.name, t]));

    const rows = ONLY_TENANT
      ? await sql`select id, tenant_id, name, version, length(body_html) len, body_html from docmerge_templates
                  where is_system = true and tenant_id = ${ONLY_TENANT}`
      : await sql`select id, tenant_id, name, version, length(body_html) len, body_html from docmerge_templates
                  where is_system = true`;

    console.log(`\nȘabloane de sistem în bază: ${rows.length}`);
    console.log(APPLY ? "Mod: SCRIE ÎN BAZĂ (--apply)\n" : "Mod: simulare (fără --apply nu se scrie nimic)\n");

    const byTenant = new Map<string, number>();
    let changed = 0;
    let missing = 0;

    for (const row of rows) {
      const tpl = shipped.get(row.name);
      if (!tpl) {
        // Un șablon marcat „de sistem" care nu mai e livrat de produs: îl lăsăm în pace. Poate fi
        // dintr-o versiune veche, iar ștergerea ar lua acte din mâna cuiva.
        missing++;
        continue;
      }
      if (row.body_html === tpl.bodyHtml) continue;

      changed++;
      byTenant.set(row.tenant_id, (byTenant.get(row.tenant_id) ?? 0) + 1);
      if (APPLY) {
        await sql`
          update docmerge_templates
          set body_html = ${tpl.bodyHtml},
              placeholders = ${JSON.stringify(extractPlaceholders(tpl.bodyHtml))},
              kind = ${tpl.kind},
              category = ${tpl.category},
              version = ${(row.version ?? 1) + 1},
              updated_at = now()
          where id = ${row.id}`;
      }
      console.log(`  ${APPLY ? "✓" : "·"} ${row.name}: ${row.len} → ${tpl.bodyHtml.length} caractere (v${row.version} → v${(row.version ?? 1) + 1})`);
    }

    console.log("─".repeat(60));
    console.log(`${APPLY ? "Actualizate" : "S-ar actualiza"}: ${changed} șabloane, în ${byTenant.size} workspace-uri.`);
    if (missing > 0) {
      console.log(`Lăsate neatinse: ${missing} șabloane marcate „de sistem" pe care produsul nu le mai livrează.`);
    }
    console.log("");
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error("\nEȘEC:", err instanceof Error ? err.message : err);
  process.exit(1);
});
