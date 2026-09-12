/**
 * Mută atașamentele vechi din Postgres în Supabase Storage.
 *
 * Contextul: până la migrarea 0158, conținutul fișierelor stătea ca data-URL base64 în
 * `par_attachments.file_url` și în `fin_client_portal_documents.storage_path`. Codul nou scrie
 * direct în Storage, dar rândurile deja existente rămân în bază și ocupă exact spațiul din cauza
 * căruia s-a făcut mutarea. Scriptul ăsta le urcă și golește coloana.
 *
 * DOCUMENTE SEMNATE (MSign): transferul e byte-cu-byte. Se decodează base64-ul și se urcă exact
 * octeții rezultați — fără recompresie, fără rescrierea structurii PDF-ului. O semnătură validă
 * înainte rămâne validă după.
 *
 * Siguranță:
 *   - dry-run implicit: fără `--apply` doar numără și raportează, nu scrie nimic;
 *   - urcă ÎNTÂI în Storage, abia apoi golește coloana din DB, rând cu rând. Dacă scriptul moare
 *     la jumătate, în cel mai rău caz rămâne un obiect urcat degeaba — niciodată un rând fără
 *     conținut nicăieri;
 *   - lucrează în loturi mici, ca să nu tragă toată tabela în memorie (exact tabela grea e);
 *   - se poate relua: rândurile deja mutate nu mai sunt selectate.
 *
 * Rulare:
 *   node scripts/backfill-attachments-storage.mjs            # dry-run
 *   node scripts/backfill-attachments-storage.mjs --apply    # mută efectiv
 *
 * După ce termină, spațiul NU se întoarce singur: Postgres păstrează rândurile moarte. Vezi
 * instrucțiunea de VACUUM FULL tipărită la final.
 */
import "dotenv/config";
import postgres from "postgres";

const APPLY = process.argv.includes("--apply");
const BATCH = 20;

const PAR_BUCKET = "par-attachments";
const PORTAL_BUCKET = "fin-client-portal";

function bySuffix(suffix) {
  if (process.env[suffix]) return process.env[suffix];
  const key = Object.keys(process.env).find((k) => k.endsWith(suffix) && process.env[k]);
  return key ? process.env[key] : undefined;
}

const dbUrl =
  process.env.DATABASE_URL ?? bySuffix("POSTGRES_URL_NON_POOLING") ?? bySuffix("POSTGRES_URL");
const storageUrl = bySuffix("SUPABASE_URL");
const storageKey = bySuffix("SUPABASE_SERVICE_ROLE_KEY") ?? bySuffix("SUPABASE_SECRET_KEY");

if (!dbUrl) {
  console.error("Nicio bază de date configurată (DATABASE_URL / *_POSTGRES_URL). Opresc.");
  process.exit(1);
}
if (!storageUrl || !storageKey) {
  console.error("Storage neconfigurat (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY). Opresc.");
  process.exit(1);
}

const sql = postgres(dbUrl, { max: 1 });
const headers = { Authorization: `Bearer ${storageKey}`, apikey: storageKey };

async function ensureBucket(bucket) {
  const r = await fetch(`${storageUrl.replace(/\/$/, "")}/storage/v1/bucket`, {
    method: "POST",
    headers: { ...headers, "content-type": "application/json" },
    body: JSON.stringify({ id: bucket, name: bucket, public: false }),
  });
  if (!r.ok && r.status !== 400 && r.status !== 409) throw new Error(`bucket_${bucket}_${r.status}`);
}

async function upload(bucket, path, bytes, contentType) {
  const r = await fetch(`${storageUrl.replace(/\/$/, "")}/storage/v1/object/${bucket}/${path}`, {
    method: "POST",
    headers: { ...headers, "content-type": contentType || "application/octet-stream", "x-upsert": "true" },
    body: bytes,
  });
  if (!r.ok) throw new Error(`upload_${r.status}`);
}

function objectPath(tenantId, fileName) {
  const safe = String(fileName ?? "fisier").replace(/[^\w.\- ]+/g, "_").slice(-120) || "fisier";
  return `${tenantId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safe}`;
}

function parseDataUrl(value) {
  const m = typeof value === "string" ? value.match(/^data:([^;]+);base64,(.*)$/s) : null;
  if (!m) return null;
  return { mime: m[1], bytes: Buffer.from(m[2], "base64") };
}

const mb = (n) => `${(Number(n) / 1024 / 1024).toFixed(1)} MB`;

async function report() {
  const [par] = await sql`
    SELECT count(*)::int AS rows, COALESCE(sum(octet_length(file_url)), 0)::bigint AS bytes
    FROM par_attachments WHERE storage_path IS NULL AND file_url LIKE 'data:%'`;
  const [portal] = await sql`
    SELECT count(*)::int AS rows, COALESCE(sum(octet_length(storage_path)), 0)::bigint AS bytes
    FROM fin_client_portal_documents WHERE in_object_store = false AND storage_path LIKE 'data:%'`;
  console.log(`par_attachments           : ${par.rows} rânduri, ${mb(par.bytes)} în baza de date`);
  console.log(`fin_client_portal_documents: ${portal.rows} rânduri, ${mb(portal.bytes)} în baza de date`);
  return Number(par.bytes) + Number(portal.bytes);
}

async function migrateParAttachments() {
  let moved = 0;
  for (;;) {
    const rows = await sql`
      SELECT id, tenant_id, file_name, file_url
      FROM par_attachments
      WHERE storage_path IS NULL AND file_url LIKE 'data:%'
      LIMIT ${BATCH}`;
    if (rows.length === 0) break;

    for (const row of rows) {
      const parsed = parseDataUrl(row.file_url);
      if (!parsed) {
        // Nu e base64 (poate un http(s) extern) — îl lăsăm exact cum e.
        console.warn(`  ~ sar peste ${row.id}: file_url nu e data-URL`);
        continue;
      }
      const path = objectPath(row.tenant_id, row.file_name);
      await upload(PAR_BUCKET, path, parsed.bytes, parsed.mime);
      // Abia după ce obiectul e sus: rândul primește calea și scapă de conținut.
      await sql`
        UPDATE par_attachments
        SET storage_path = ${path}, mime_type = ${parsed.mime},
            size_bytes = ${parsed.bytes.byteLength}, file_url = NULL
        WHERE id = ${row.id}`;
      moved++;
      console.log(`  → ${row.file_name} (${mb(parsed.bytes.byteLength)})`);
    }
    // Dacă tot lotul a fost sărit, ieșim ca să nu buclăm la infinit pe aceleași rânduri.
    if (rows.every((r) => !parseDataUrl(r.file_url))) break;
  }
  return moved;
}

async function migratePortalDocuments() {
  let moved = 0;
  for (;;) {
    const rows = await sql`
      SELECT id, tenant_id, original_name, mime_type, storage_path
      FROM fin_client_portal_documents
      WHERE in_object_store = false AND storage_path LIKE 'data:%'
      LIMIT ${BATCH}`;
    if (rows.length === 0) break;

    for (const row of rows) {
      const parsed = parseDataUrl(row.storage_path);
      if (!parsed) continue;
      const path = objectPath(row.tenant_id, row.original_name);
      await upload(PORTAL_BUCKET, path, parsed.bytes, row.mime_type || parsed.mime);
      await sql`
        UPDATE fin_client_portal_documents
        SET storage_path = ${path}, in_object_store = true
        WHERE id = ${row.id}`;
      moved++;
      console.log(`  → ${row.original_name} (${mb(parsed.bytes.byteLength)})`);
    }
    if (rows.every((r) => !parseDataUrl(r.storage_path))) break;
  }
  return moved;
}

try {
  console.log(APPLY ? "MUT fișierele în Storage.\n" : "DRY-RUN — nu scriu nimic. Adaugă --apply.\n");
  const before = await report();

  if (!APPLY) {
    console.log(`\nDe eliberat din baza de date: ~${mb(before)}.`);
    process.exit(0);
  }

  await ensureBucket(PAR_BUCKET);
  await ensureBucket(PORTAL_BUCKET);

  console.log("\npar_attachments:");
  const a = await migrateParAttachments();
  console.log("\nfin_client_portal_documents:");
  const b = await migratePortalDocuments();

  console.log(`\nGata: ${a + b} fișiere mutate.\n`);
  await report();
  console.log(
    "\nSpațiul NU s-a întors încă: Postgres păstrează rândurile moarte până la un VACUUM.\n" +
    "Rulează în SQL Editor pe Supabase (blochează tabela câteva secunde, deci în afara orelor de lucru):\n" +
    "  VACUUM FULL par_attachments;\n" +
    "  VACUUM FULL fin_client_portal_documents;"
  );
} catch (e) {
  console.error("\nEroare:", e instanceof Error ? e.message : e);
  console.error("Nimic nu s-a pierdut: rândurile negolite încă au conținutul în baza de date. Reia scriptul.");
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}
