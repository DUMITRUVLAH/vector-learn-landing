/**
 * Micșorează documentele DEJA urcate în Supabase Storage.
 *
 * `src/lib/upload/compressForUpload.ts` are grijă de ce se încarcă de acum încolo. Scriptul ăsta
 * se ocupă de trecut: pe 23.09.2026 bucket-urile țineau 92,6 MB din cei 5 GB ai planului, iar
 * 86 MB erau PDF-uri — în bună parte chitanțe cu fonturi încorporate necomprimate și contracte
 * scanate la 200 DPI.
 *
 * Ce NU face, niciodată:
 *   • nu atinge un act semnat electronic (vezi `signedDocs.ts`) — rescrierea i-ar rupe semnătura;
 *   • nu scrie nimic fără `--apply` (implicit doar raportează);
 *   • nu suprascrie fără să pună mai întâi originalul pe disc (`--backup-dir`, dezactivabil
 *     explicit cu `--no-backup`) — o suprascriere în Storage nu are „undo".
 *
 * După ce înlocuiește obiectul, actualizează și mărimea din baza de date (`size_bytes`), altfel
 * interfața ar continua să scrie „1,2 MB" sub un fișier de 120 KB. Merge prin PostgREST cu cheia
 * service-role, aceeași pe care o folosește și aplicația — fără parolă de bază de date.
 *
 * Folosire:
 *   npx tsx scripts/storage-compress.ts                 # raport, nu schimbă nimic
 *   npx tsx scripts/storage-compress.ts --apply         # micșorează efectiv
 *   npx tsx scripts/storage-compress.ts --apply --lossless-only   # doar ce e garantat identic
 *   npx tsx scripts/storage-compress.ts --sync-sizes --apply      # doar aliniază mărimile din DB
 *   npx tsx scripts/storage-compress.ts --apply --bucket=par-attachments --limit=20
 */
import fs from "node:fs";
import path from "node:path";
import { isSignedPdf } from "../src/lib/upload/signedDocs";
import { rasterizeScannedPdf, shrinkPdfStreams } from "../src/lib/upload/pdfShrink";

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const value = (name: string, fallback: string) =>
  args.find((a) => a.startsWith(`--${name}=`))?.split("=").slice(1).join("=") ?? fallback;

const APPLY = flag("apply");
/** Doar trecerea fără pierderi (stream-uri recomprimate) — scanurile rămân neatinse. */
const LOSSLESS_ONLY = flag("lossless-only");
/** Doar aliniază mărimile din baza de date cu fișierele reale, fără să comprime nimic. */
const SYNC_SIZES = flag("sync-sizes");
const NO_BACKUP = flag("no-backup");
const ONLY_BUCKET = value("bucket", "");
const LIMIT = Number(value("limit", "0")) || Infinity;
const MIN_BYTES = Number(value("min-kb", "300")) * 1024;
const MIN_GAIN = Number(value("min-gain", "0.15"));
const BACKUP_DIR = value("backup-dir", path.resolve(process.cwd(), ".storage-backup"));

/**
 * Unde e scrisă mărimea unui obiect, ca să nu rămână o cifră veche sub un fișier nou.
 *
 * Bucket-ul `par-attachments` are TREI locuri, nu unul: dosarul propriu-zis, plus copia patentei,
 * care e ținută și pe beneficiarul din registru și pe cerere (snapshot). Același obiect din
 * Storage poate fi referit de ambele — de asta se actualizează toate, nu prima care se potrivește.
 */
const SIZE_COLUMNS: Record<string, Array<{ table: string; pathColumn: string; sizeColumn: string }>> = {
  "par-attachments": [
    { table: "par_attachments", pathColumn: "storage_path", sizeColumn: "size_bytes" },
    { table: "par_vendors", pathColumn: "patent_file_path", sizeColumn: "patent_file_size" },
    { table: "par_requests", pathColumn: "payee_patent_file_path", sizeColumn: "payee_patent_file_size" },
  ],
  "fin-captures": [{ table: "fin_captures", pathColumn: "file_key", sizeColumn: "size_bytes" }],
  "crm-lead-files": [{ table: "lead_attachments", pathColumn: "storage_path", sizeColumn: "size_bytes" }],
};

function env(): { url: string; key: string } {
  for (const file of [".env.local", ".env"]) {
    const full = path.resolve(process.cwd(), file);
    if (!fs.existsSync(full)) continue;
    for (const line of fs.readFileSync(full, "utf8").split("\n")) {
      const i = line.indexOf("=");
      if (i < 0 || line.trim().startsWith("#")) continue;
      const k = line.slice(0, i).trim();
      if (!process.env[k]) process.env[k] = line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
    }
  }
  const pick = (suffix: string) =>
    Object.entries(process.env).find(([k]) => k === suffix || k.endsWith(`_${suffix}`))?.[1];
  const url = pick("SUPABASE_URL");
  const key = pick("SUPABASE_SERVICE_ROLE_KEY") ?? pick("SUPABASE_SECRET_KEY");
  if (!url || !key) throw new Error("Lipsesc SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY din .env");
  return { url: url.replace(/\/$/, ""), key };
}

const { url: SUPABASE_URL, key: SERVICE_KEY } = env();
const H = { Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY };
const encodePath = (p: string) => p.split("/").map(encodeURIComponent).join("/");

interface StoredObject {
  bucket: string;
  path: string;
  size: number;
  mime: string;
}

async function listBuckets(): Promise<string[]> {
  const r = await fetch(`${SUPABASE_URL}/storage/v1/bucket`, { headers: H });
  const buckets = (await r.json()) as Array<{ id: string }>;
  return buckets.map((b) => b.id).filter((id) => !ONLY_BUCKET || id === ONLY_BUCKET);
}

async function listObjects(bucket: string, prefix = "", depth = 0): Promise<StoredObject[]> {
  const out: StoredObject[] = [];
  let offset = 0;
  for (;;) {
    const r = await fetch(`${SUPABASE_URL}/storage/v1/object/list/${bucket}`, {
      method: "POST",
      headers: { ...H, "content-type": "application/json" },
      body: JSON.stringify({ prefix, limit: 1000, offset, sortBy: { column: "name", order: "asc" } }),
    });
    const items = (await r.json()) as Array<{ name: string; id: string | null; metadata: { size?: number; mimetype?: string } | null }>;
    if (!Array.isArray(items) || items.length === 0) break;
    for (const it of items) {
      if (it.id === null || it.metadata === null) {
        // Folder: Storage nu întoarce obiectele în adâncime, deci coborâm noi.
        if (depth < 4) out.push(...(await listObjects(bucket, `${prefix}${it.name}/`, depth + 1)));
      } else {
        out.push({ bucket, path: `${prefix}${it.name}`, size: it.metadata.size ?? 0, mime: it.metadata.mimetype ?? "" });
      }
    }
    if (items.length < 1000) break;
    offset += 1000;
  }
  return out;
}

async function download(o: StoredObject): Promise<Uint8Array> {
  const r = await fetch(`${SUPABASE_URL}/storage/v1/object/${o.bucket}/${encodePath(o.path)}`, { headers: H });
  if (!r.ok) throw new Error(`download_${r.status}`);
  return new Uint8Array(await r.arrayBuffer());
}

async function upload(o: StoredObject, bytes: Uint8Array): Promise<void> {
  const r = await fetch(`${SUPABASE_URL}/storage/v1/object/${o.bucket}/${encodePath(o.path)}`, {
    method: "POST",
    headers: { ...H, "content-type": o.mime || "application/octet-stream", "x-upsert": "true" },
    body: bytes as unknown as BodyInit,
  });
  if (!r.ok) throw new Error(`upload_${r.status}: ${await r.text()}`);
}

/** Aliniază mărimea din baza de date la fișierul real. Nereușita nu oprește rularea. */
async function updateSize(o: StoredObject, size: number): Promise<string> {
  const targets = SIZE_COLUMNS[o.bucket];
  if (!targets) return "fără tabelă";
  const parts: string[] = [];
  for (const t of targets) {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/${t.table}?${t.pathColumn}=eq.${encodeURIComponent(o.path)}&${t.sizeColumn}=neq.${size}`,
      {
        method: "PATCH",
        headers: { ...H, "content-type": "application/json", Prefer: "return=representation" },
        body: JSON.stringify({ [t.sizeColumn]: size }),
      },
    );
    if (!r.ok) {
      parts.push(`${t.table}:eroare_${r.status}`);
      continue;
    }
    const rows = (await r.json()) as unknown[];
    if (rows.length > 0) parts.push(`${t.table}:${rows.length}`);
  }
  return parts.length > 0 ? parts.join(" ") : "nimic de actualizat";
}

/* ── Reîncodarea JPEG pentru scanuri: Chromium, pornit doar dacă chiar dăm de un scan ── */

let browserHandle: { encode: (jpeg: Uint8Array, opts: { maxLongEdge: number; quality: number }) => Promise<Uint8Array | null>; close: () => Promise<void> } | null = null;

async function jpegEncoder(jpeg: Uint8Array, opts: { maxLongEdge: number; quality: number }): Promise<Uint8Array | null> {
  if (!browserHandle) browserHandle = await startBrowser();
  return browserHandle.encode(jpeg, opts);
}

async function startBrowser() {
  // Node nu are canvas; reîncodarea o face exact motorul care o va face și în browserul
  // utilizatorului, ca rezultatul din backfill să fie același cu cel de la upload.
  const { chromium } = await import("playwright-core");
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto("about:blank");
  return {
    async encode(jpeg: Uint8Array, opts: { maxLongEdge: number; quality: number }) {
      const b64 = Buffer.from(jpeg).toString("base64");
      const out = await page.evaluate(
        async ([data, maxLongEdge, quality]: [string, number, number]) => {
          const bin = atob(data);
          const bytes = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
          const bitmap = await createImageBitmap(new Blob([bytes], { type: "image/jpeg" }), { imageOrientation: "from-image" }).catch(() => null);
          if (!bitmap) return null;
          const scale = Math.min(1, maxLongEdge / Math.max(bitmap.width, bitmap.height));
          const canvas = new OffscreenCanvas(Math.max(1, Math.round(bitmap.width * scale)), Math.max(1, Math.round(bitmap.height * scale)));
          const ctx = canvas.getContext("2d");
          if (!ctx) return null;
          ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
          const blob = await canvas.convertToBlob({ type: "image/jpeg", quality });
          const result = new Uint8Array(await blob.arrayBuffer());
          let s = "";
          for (let i = 0; i < result.length; i += 8192) s += String.fromCharCode(...result.subarray(i, i + 8192));
          return btoa(s);
        },
        [b64, opts.maxLongEdge, opts.quality] as [string, number, number],
      );
      return out ? new Uint8Array(Buffer.from(out, "base64")) : null;
    },
    close: async () => void (await browser.close()),
  };
}

/**
 * Ce am scris chiar se citește la fel? Compară textul și numărul de paginilor cu originalul,
 * folosind pdf.js — alt parser decât pdf-lib, cel care a făcut rescrierea. O verificare făcută
 * cu aceeași unealtă care a produs fișierul nu verifică nimic.
 *
 * Întoarce `null` când totul e în regulă, sau motivul pentru care trebuie restaurat originalul.
 * Un scan reîncodat nu se compară pe text (nu are), doar pe pagini.
 */
async function verifyWritten(o: StoredObject, original: Uint8Array, method: string): Promise<string | null> {
  if (o.mime !== "application/pdf") return null;
  const { extractText, getDocumentProxy } = await import("unpdf");
  const read = async (bytes: Uint8Array) => {
    const pdf = await getDocumentProxy(new Uint8Array(bytes));
    const { text, totalPages } = await extractText(pdf, { mergePages: true });
    return { text: String(text).replace(/\s+/g, " ").trim(), pages: totalPages };
  };
  try {
    const written = await read(await download(o));
    const before = await read(original);
    if (written.pages !== before.pages) return `pagini ${before.pages} → ${written.pages}`;
    if (method !== "scan reîncodat" && written.text !== before.text) return "textul extras diferă";
    return null;
  } catch (err) {
    return `nu s-a putut reciti (${String(err)})`;
  }
}

/* ─────────────────────────────── Rularea ─────────────────────────────── */

const MB = (n: number) => `${(n / 1024 / 1024).toFixed(2)} MB`;
const KB = (n: number) => `${(n / 1024).toFixed(0)} KB`;

async function main() {
  const buckets = await listBuckets();
  const all: StoredObject[] = [];
  for (const b of buckets) all.push(...(await listObjects(b)));
  const totalBefore = all.reduce((s, o) => s + o.size, 0);

  const candidates = all
    .filter((o) => o.size >= MIN_BYTES)
    .filter((o) => o.mime === "application/pdf" || o.mime.startsWith("image/"))
    .sort((a, b) => b.size - a.size)
    .slice(0, LIMIT === Infinity ? undefined : LIMIT);

  console.log(`Storage: ${all.length} obiecte, ${MB(totalBefore)} în ${buckets.length} bucket-uri`);
  console.log(`Candidați (≥ ${KB(MIN_BYTES)}, PDF/imagine): ${candidates.length}, ${MB(candidates.reduce((s, o) => s + o.size, 0))}`);
  console.log(APPLY ? "MOD: --apply (se SCRIE în Storage)\n" : "MOD: raport (nu se scrie nimic; adaugă --apply)\n");

  if (SYNC_SIZES) {
    // Reparația de drift: mărimea din interfață trebuie să fie a fișierului, nu una veche.
    let fixed = 0;
    for (const o of all) {
      if (!SIZE_COLUMNS[o.bucket]) continue;
      if (!APPLY) continue;
      const res = await updateSize(o, o.size);
      if (res !== "nimic de actualizat" && res !== "fără tabelă") {
        console.log(`  ${KB(o.size).padStart(8)}  ${res}  ${(o.path.split("/").pop() ?? "").slice(0, 55)}`);
        fixed++;
      }
    }
    console.log(`\n${fixed} rânduri aliniate la fișierul real${APPLY ? "" : " (adaugă --apply)"}`);
    return;
  }

  if (APPLY && !NO_BACKUP) fs.mkdirSync(BACKUP_DIR, { recursive: true });

  let saved = 0;
  let changed = 0;
  const skipped: Record<string, number> = {};

  for (const o of candidates) {
    const name = o.path.split("/").pop() ?? o.path;
    let bytes: Uint8Array;
    try {
      bytes = await download(o);
    } catch (err) {
      console.log(`  ✗ ${name.slice(0, 60)} — nu s-a putut descărca (${String(err)})`);
      continue;
    }

    if (o.mime === "application/pdf" && isSignedPdf(bytes, name)) {
      skipped.semnat = (skipped.semnat ?? 0) + 1;
      continue;
    }

    let result: Uint8Array | null = null;
    let method = "";
    if (o.mime === "application/pdf") {
      const lossless = await shrinkPdfStreams(bytes);
      if (lossless.bytes) {
        result = lossless.bytes;
        method = "fără pierderi";
      } else if (LOSSLESS_ONLY) {
        skipped.doar_fara_pierderi = (skipped.doar_fara_pierderi ?? 0) + 1;
      } else {
        const raster = await rasterizeScannedPdf(bytes, jpegEncoder);
        if (raster.bytes) {
          result = raster.bytes;
          method = "scan reîncodat";
        } else {
          skipped[raster.reason ?? lossless.reason ?? "fara_castig"] = (skipped[raster.reason ?? lossless.reason ?? "fara_castig"] ?? 0) + 1;
        }
      }
    } else if (LOSSLESS_ONLY) {
      skipped.doar_fara_pierderi = (skipped.doar_fara_pierderi ?? 0) + 1;
    } else {
      // Imaginile de sine stătătoare se reîncodează cu același motor ca scanurile din PDF.
      const encoded = o.mime === "image/jpeg" ? await jpegEncoder(bytes, { maxLongEdge: 1754, quality: 0.62 }) : null;
      if (encoded) {
        result = encoded;
        method = "imagine reîncodată";
      } else {
        skipped[o.mime] = (skipped[o.mime] ?? 0) + 1;
      }
    }

    if (!result || result.length > o.size * (1 - MIN_GAIN)) {
      if (result) skipped.castig_prea_mic = (skipped.castig_prea_mic ?? 0) + 1;
      continue;
    }

    const gain = o.size - result.length;
    saved += gain;
    changed++;
    const line = `  ${KB(o.size).padStart(8)} → ${KB(result.length).padStart(8)}  (−${Math.round((100 * gain) / o.size)}%, ${method})  ${name.slice(0, 55)}`;

    if (!APPLY) {
      console.log(line);
      continue;
    }

    if (!NO_BACKUP) {
      const backup = path.join(BACKUP_DIR, o.bucket, o.path);
      fs.mkdirSync(path.dirname(backup), { recursive: true });
      fs.writeFileSync(backup, bytes);
    }
    try {
      await upload(o, result);
      // Verificare cu un parser INDEPENDENT (pdf.js, prin unpdf), nu cu al nostru: citim înapoi
      // ce am scris și cerem același text și același număr de pagini ca originalul. Dacă nu se
      // potrivesc, punem originalul la loc pe loc — nu raportăm o pierdere, o reparăm.
      const problem = await verifyWritten(o, bytes, method);
      if (problem) {
        await upload(o, bytes);
        console.log(`  ↩ ${name.slice(0, 55)} — RESTAURAT (${problem})`);
        saved -= gain;
        changed--;
        continue;
      }
      const db = await updateSize(o, result.length);
      console.log(`${line}  [scris + verificat, db: ${db}]`);
    } catch (err) {
      console.log(`  ✗ ${name.slice(0, 55)} — nu s-a putut scrie (${String(err)})`);
      saved -= gain;
      changed--;
    }
  }

  await browserHandle?.close();

  console.log(`\n${changed} obiecte ${APPLY ? "micșorate" : "micșorabile"} · ${MB(saved)} ${APPLY ? "eliberați" : "de eliberat"}`);
  console.log(`Total storage: ${MB(totalBefore)} → ${MB(totalBefore - saved)}`);
  const skipLine = Object.entries(skipped).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}: ${v}`).join(" · ");
  if (skipLine) console.log(`Neatinse — ${skipLine}`);
  if (APPLY && !NO_BACKUP && changed > 0) console.log(`Originalele: ${BACKUP_DIR}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
