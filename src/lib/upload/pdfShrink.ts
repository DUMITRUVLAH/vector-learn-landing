/**
 * Micșorarea unui PDF, în două treceri cu riscuri foarte diferite.
 *
 * De ce există: storage-ul Supabase al proiectului ține 92 MB, din care 86 MB sunt PDF-uri, iar
 * planul are 5 GB. Măsurat pe fișierele reale din bucket (23.09.2026):
 *   • chitanțele Meta Ads (1,01 MB × 35 = 35 MB) sunt 99% stream-uri NECOMPRIMATE — fonturi
 *     încorporate de TCPDF fără filtru. Comprimarea lor cu Flate scoate 69% fără să schimbe
 *     un pixel sau o literă: 1033 KB → ~320 KB.
 *   • contractele scanate („Contract Fox.pdf", 3,11 MB, 6 pagini) sunt 100% JPEG la 200 DPI,
 *     fără strat de text. Reîncodate la 150 DPI scad de ~8×.
 *
 * Trecerea 1 — `shrinkPdfStreams` — e FĂRĂ PIERDERI: comprimă doar stream-urile care nu aveau
 * niciun filtru și verifică fiecare prin decomprimare inversă. Textul, fonturile, imaginile și
 * randarea rămân identice; se schimbă doar cum sunt împachetați octeții.
 *
 * Trecerea 2 — `rasterizeScannedPdf` — are pierderi și se aplică DOAR paginilor care sunt deja
 * doar o fotografie: fără fonturi în resurse (deci fără strat de text de pierdut) și cu o singură
 * imagine JPEG. Un PDF cu text NU intră niciodată pe aici — ar distruge exact stratul din care
 * aplicația extrage suma, IBAN-ul și codul fiscal (vezi `readUploadedDoc`), adică ar strica
 * pre-completarea AI ca să câștige spațiu.
 *
 * Nimic din ce e semnat electronic nu ajunge aici — vezi `signedDocs.ts`, verificat de apelant.
 *
 * Modulul nu atinge `document` sau `canvas`: reîncodarea imaginii vine ca funcție injectată
 * (`RasterEncoder`), ca logica să poată fi rulată și testată în Node pe fișiere reale, nu doar
 * în browser.
 */
import type { PDFDocument, PDFRawStream } from "pdf-lib";

/** Sub atâția octeți un stream nu merită comprimat (antetul Flate + CPU-ul mănâncă câștigul). */
const MIN_STREAM_BYTES = 1024;

/** Câștigul minim ca să acceptăm rezultatul; sub el păstrăm originalul, intact. */
const MIN_GAIN = 0.1;

export interface PdfShrinkResult {
  /** Octeții rezultați — sau `null` dacă nu s-a câștigat nimic de încredere. */
  bytes: Uint8Array | null;
  method: "pdf-streams" | "pdf-scan" | "none";
  /** De ce nu s-a comprimat, când `bytes` e `null`. */
  reason?: string;
}

/** Reîncodează un JPEG (micșorat + recomprimat). `null` = nu s-a putut decoda → renunțăm. */
export type RasterEncoder = (
  jpeg: Uint8Array,
  opts: { maxLongEdge: number; quality: number },
) => Promise<Uint8Array | null>;

export interface RasterOptions {
  /** Latura lungă maximă în pixeli. Implicit 1754 = A4 la 150 DPI (vezi `imageShrink.ts`). */
  maxLongEdge?: number;
  quality?: number;
}

/* ────────────────────────── Trecerea 1: fără pierderi ────────────────────────── */

/**
 * Comprimă cu Flate stream-urile care au ajuns în fișier necomprimate.
 *
 * Fiecare stream atins e verificat prin decomprimare inversă și comparare octet cu octet: dacă
 * round-trip-ul nu dă exact conținutul inițial, stream-ul rămâne cum era. La final, documentul
 * rezultat e redeschis și i se compară numărul de pagini, dimensiunile și numărul de operatori de
 * text cu originalul (`verifyStructurallyEqual`) — o rescriere care ar fi pierdut o pagină sau
 * stratul de text e aruncată, nu livrată.
 */
export async function shrinkPdfStreams(bytes: Uint8Array): Promise<PdfShrinkResult> {
  const { PDFDocument, PDFName, PDFRawStream } = await import("pdf-lib");

  let doc: PDFDocument;
  try {
    doc = await PDFDocument.load(bytes, { ignoreEncryption: false, updateMetadata: false });
  } catch {
    return { bytes: null, method: "none", reason: "pdf_illizibil" };
  }

  for (const [ref, obj] of doc.context.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFRawStream)) continue;
    const dict = obj.dict;
    if (dict.get(PDFName.of("Filter"))) continue; // deja comprimat
    if (dict.get(PDFName.of("DecodeParms"))) continue; // filtru implicit cu parametri — nu ne băgăm
    const type = dict.get(PDFName.of("Type"))?.toString();
    // `/XRef` și `/ObjStm` sunt regenerate de pdf-lib la salvare; `/Metadata` XMP trebuie să rămână
    // citibil de unelte care nu decomprimă nimic (cerința XMP), și oricum are câțiva KB.
    if (type === "/XRef" || type === "/ObjStm" || type === "/Metadata") continue;

    const original = obj.contents;
    if (original.length < MIN_STREAM_BYTES) continue;

    const deflated = await deflate(original);
    if (deflated.length >= original.length * 0.95) continue;
    if (!sameBytes(await inflate(deflated), original)) continue; // round-trip obligatoriu

    // Înlocuim obiectul, nu îi mutăm conținutul pe sub mână: `contents` e declarat read-only în
    // pdf-lib, iar `context.assign` e exact calea prin care biblioteca se așteaptă să fie schimbat.
    dict.set(PDFName.of("Filter"), PDFName.of("FlateDecode"));
    doc.context.assign(ref, PDFRawStream.of(dict, deflated));
  }

  // Salvăm chiar și când n-am comprimat niciun stream: rescrierea singură
  // curăță ce nu ține de document — octeți rămași după `%%EOF`, obiecte orfane, tabele xref
  // succesive. Pe „Patenta AB 282679…pdf" din storage asta înseamnă 1,27 MB → 2 KB, fiindcă
  // fișierul era o pagină reală urmată de 1,3 MB de umplutură. Rezultatul trece prin aceeași
  // verificare ca orice altă rescriere, deci nu e o scurtătură, ci același drum.
  const out = await doc.save({ useObjectStreams: true });
  if (out.length >= bytes.length * (1 - MIN_GAIN)) {
    return { bytes: null, method: "none", reason: "castig_prea_mic" };
  }
  if (!(await verifyStructurallyEqual(bytes, out))) {
    return { bytes: null, method: "none", reason: "verificare_esuata" };
  }
  return { bytes: out, method: "pdf-streams" };
}

/* ───────────────────────── Trecerea 2: pagini scanate ───────────────────────── */

/**
 * Reconstruiește un PDF scanat din imaginile lui, reîncodate mai mic.
 *
 * Condiția de intrare e strictă și se verifică pagină cu pagină: resursele paginii nu au niciun
 * font (deci nu există text de pierdut) și au exact o imagine JPEG (`/DCTDecode`) destul de mare
 * cât să fie chiar scanul paginii. Dacă o singură pagină nu se califică, renunțăm la tot fișierul —
 * un PDF jumătate text, jumătate scan rămâne neatins.
 */
export async function rasterizeScannedPdf(
  bytes: Uint8Array,
  encode: RasterEncoder,
  opts: RasterOptions = {},
): Promise<PdfShrinkResult> {
  const maxLongEdge = opts.maxLongEdge ?? 1754;
  const quality = opts.quality ?? 0.62;
  const { PDFDocument, PDFName, PDFRawStream, PDFDict } = await import("pdf-lib");

  let doc: PDFDocument;
  try {
    doc = await PDFDocument.load(bytes, { ignoreEncryption: false, updateMetadata: false });
  } catch {
    return { bytes: null, method: "none", reason: "pdf_illizibil" };
  }

  const pages = doc.getPages();
  if (pages.length === 0) return { bytes: null, method: "none", reason: "fara_pagini" };

  const scans: Array<{ jpeg: Uint8Array; width: number; height: number; rotation: number }> = [];
  for (const page of pages) {
    const res = page.node.Resources();
    if (!res) return { bytes: null, method: "none", reason: "pagina_fara_resurse" };
    const fonts = res.lookup(PDFName.of("Font"));
    if (fonts instanceof PDFDict && fonts.keys().length > 0) {
      return { bytes: null, method: "none", reason: "pagina_are_text" };
    }
    const xobjects = res.lookup(PDFName.of("XObject"));
    if (!(xobjects instanceof PDFDict)) return { bytes: null, method: "none", reason: "pagina_fara_imagine" };

    const images: PDFRawStream[] = [];
    for (const key of xobjects.keys()) {
      const xo = xobjects.lookup(key);
      if (xo instanceof PDFRawStream && xo.dict.get(PDFName.of("Subtype"))?.toString() === "/Image") {
        images.push(xo);
      }
    }
    if (images.length !== 1) return { bytes: null, method: "none", reason: "pagina_nu_e_scan" };

    const img = images[0];
    if (img.dict.get(PDFName.of("SMask"))) return { bytes: null, method: "none", reason: "imagine_cu_transparenta" };

    // Filtrele se aplică în ordine, deci `[/FlateDecode /DCTDecode]` înseamnă „octeții sunt
    // comprimați cu Flate, iar dedesubt e un JPEG". Scanerele de birou chiar scriu așa (copia
    // patentei din storage vine de pe un Xerox VersaLink), iar dacă am trimite octeții ca atare
    // la decodor, el n-ar recunoaște un JPEG și am renunța la un fișier perfect comprimabil.
    const filters = filterNames(img.dict.get(PDFName.of("Filter")));
    const parms = img.dict.get(PDFName.of("DecodeParms"));
    let jpeg: Uint8Array;
    if (filters.length === 1 && filters[0] === "DCTDecode") {
      jpeg = img.contents;
    } else if (filters.length === 2 && filters[0] === "FlateDecode" && filters[1] === "DCTDecode" && !hasDecodeParms(parms)) {
      try {
        jpeg = await inflate(img.contents);
      } catch {
        return { bytes: null, method: "none", reason: "imagine_nedecomprimabila" };
      }
    } else {
      // Un scan pe alt filtru (CCITT, JPX, Flate brut) ar trebui decodat de noi, iar o decodare
      // greșită ar livra un document alterat fără să se vadă.
      return { bytes: null, method: "none", reason: "imagine_nu_e_jpeg" };
    }

    const { width, height } = page.getSize();
    scans.push({ jpeg, width, height, rotation: page.getRotation().angle });
  }

  const out = await PDFDocument.create();
  for (const scan of scans) {
    const smaller = await encode(scan.jpeg, { maxLongEdge, quality });
    if (!smaller) return { bytes: null, method: "none", reason: "reincodare_esuata" };
    const embedded = await out.embedJpg(smaller);
    const page = out.addPage([scan.width, scan.height]);
    page.drawImage(embedded, { x: 0, y: 0, width: scan.width, height: scan.height });
    if (scan.rotation) page.setRotation({ type: "degrees", angle: scan.rotation } as never);
  }

  const saved = await out.save({ useObjectStreams: true });
  if (saved.length >= bytes.length * (1 - MIN_GAIN)) {
    return { bytes: null, method: "none", reason: "castig_prea_mic" };
  }
  if (!(await verifyStructurallyEqual(bytes, saved, { skipTextOps: true }))) {
    return { bytes: null, method: "none", reason: "verificare_esuata" };
  }
  return { bytes: saved, method: "pdf-scan" };
}

/** Numele filtrelor unui stream, fie că e unul singur, fie un lanț. */
function filterNames(filter: unknown): string[] {
  if (!filter) return [];
  const text = String(filter);
  return (text.match(/\/([A-Za-z0-9]+)/g) ?? []).map((n) => n.slice(1));
}

/** Are parametri de decodare care chiar schimbă ceva (predictori)? `null`-urile nu contează. */
function hasDecodeParms(parms: unknown): boolean {
  if (!parms) return false;
  const text = String(parms);
  return /\/[A-Za-z]/.test(text.replace(/null/g, ""));
}

/* ──────────────────────────────── Verificare ──────────────────────────────── */

/**
 * Rezultatul chiar e documentul de la intrare?
 *
 * Verificăm ce se poate verifica ieftin și ce chiar se poate strica: numărul de pagini,
 * dimensiunea fiecărei pagini și — pentru trecerea fără pierderi — numărul de operatori de afișare
 * a textului (`Tj`, `TJ`, `'`, `"`) din stream-urile de conținut. Ultimul e cel care prinde
 * accidentul grav: o rescriere care pierde stratul de text arată la fel la numărul de pagini, dar
 * lasă un document din care nu se mai poate extrage nimic.
 */
export async function verifyStructurallyEqual(
  before: Uint8Array,
  after: Uint8Array,
  opts: { skipTextOps?: boolean } = {},
): Promise<boolean> {
  const { PDFDocument } = await import("pdf-lib");
  try {
    const a = await PDFDocument.load(before, { ignoreEncryption: false, updateMetadata: false });
    const b = await PDFDocument.load(after, { ignoreEncryption: false, updateMetadata: false });
    const pa = a.getPages();
    const pb = b.getPages();
    if (pa.length !== pb.length || pa.length === 0) return false;
    for (let i = 0; i < pa.length; i++) {
      const sa = pa[i].getSize();
      const sb = pb[i].getSize();
      if (Math.abs(sa.width - sb.width) > 0.5 || Math.abs(sa.height - sb.height) > 0.5) return false;
    }
    if (!opts.skipTextOps) {
      // Numărul operatorilor de text prinde pierderea stratului de text; numărul imaginilor
      // prinde cealaltă jumătate — o rescriere care pierde un scan are exact același text.
      if ((await countTextOps(a)) !== (await countTextOps(b))) return false;
      if ((await countImages(a)) !== (await countImages(b))) return false;
    }
    // Adnotările (linkuri, câmpuri de formular, comentarii) nu se văd nici în text, nici în
    // imagini: un document din care ar dispărea ar trece de verificările de mai sus.
    for (let i = 0; i < pa.length; i++) {
      if (countAnnotations(pa[i]) !== countAnnotations(pb[i])) return false;
    }
    return true;
  } catch {
    return false;
  }
}

/** Câte adnotări are pagina (linkuri, câmpuri de formular, note). */
function countAnnotations(page: { node: { Annots?: () => { size?: () => number } | undefined } }): number {
  try {
    return page.node.Annots?.()?.size?.() ?? 0;
  } catch {
    return 0;
  }
}

/** Câte imagini (XObject `/Image`) are documentul, oriunde ar fi. */
async function countImages(doc: PDFDocument): Promise<number> {
  const { PDFName, PDFRawStream } = await import("pdf-lib");
  let n = 0;
  for (const [, obj] of doc.context.enumerateIndirectObjects()) {
    if (obj instanceof PDFRawStream && obj.dict.get(PDFName.of("Subtype"))?.toString() === "/Image") n++;
  }
  return n;
}

/** Câți operatori de afișare a textului are documentul, pe toate paginile. */
async function countTextOps(doc: PDFDocument): Promise<number> {
  const { PDFName, PDFRawStream, PDFArray } = await import("pdf-lib");
  let total = 0;
  for (const page of doc.getPages()) {
    const contents = page.node.get(PDFName.of("Contents"));
    const refs = contents instanceof PDFArray ? contents.asArray() : [contents];
    for (const ref of refs) {
      if (!ref) continue;
      const stream = page.node.context.lookup(ref);
      if (!(stream instanceof PDFRawStream)) continue;
      const filter = String(stream.dict.get(PDFName.of("Filter")) ?? "");
      let data = stream.contents;
      if (filter.includes("FlateDecode")) {
        try {
          data = await inflate(data);
        } catch {
          continue;
        }
      } else if (filter) {
        continue; // alt filtru → nu-l numărăm, dar nici nu-l inventăm
      }
      total += countOperators(data);
    }
  }
  return total;
}

function countOperators(data: Uint8Array): number {
  const text = new TextDecoder("latin1").decode(data);
  return (text.match(/(?:^|[\s\]>)])(Tj|TJ|'|")(?=[\s\n\r]|$)/g) ?? []).length;
}

/* ─────────────────────────────── Utilitare ─────────────────────────────── */

/** Flate (zlib), disponibil nativ și în browser, și în Node 18+. */
export async function deflate(bytes: Uint8Array): Promise<Uint8Array> {
  return pipe(bytes, new CompressionStream("deflate"));
}

export async function inflate(bytes: Uint8Array): Promise<Uint8Array> {
  return pipe(bytes, new DecompressionStream("deflate"));
}

async function pipe(bytes: Uint8Array, transform: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const stream = new Blob([bytes as unknown as BlobPart]).stream().pipeThrough(transform);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
