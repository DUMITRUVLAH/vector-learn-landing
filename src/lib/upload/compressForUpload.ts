/**
 * Poarta unică prin care trece orice fișier înainte de a fi urcat în Storage.
 *
 * De ce: storage-ul Supabase al proiectului avea 92 MB pe 23.09.2026, din care 86 MB PDF-uri, iar
 * planul e de 5 GB. Actele urcate la dosar (contracte scanate, chitanțe, copii de patentă) sunt
 * partea care crește, iar cele mai multe sunt de câteva ori mai mari decât ar trebui: scanuri la
 * 200 DPI și PDF-uri cu fonturi încorporate necomprimate.
 *
 * Regula de fond, cerută de owner (23.09.2026): se comprimă ce NU e semnat electronic. Un act
 * semnat își poartă semnătura peste propriii octeți, deci orice rescriere — oricât de corectă —
 * îl desemnează. Vezi `signedDocs.ts`.
 *
 * Nimic de aici nu are voie să strice o încărcare: orice eroare, orice câștig prea mic și orice
 * verificare nereușită întorc fișierul ORIGINAL. Compresia e un bonus, nu o dependență.
 *
 * `pdf-lib` se încarcă dinamic (`await import`) și doar când chiar avem un PDF mare de comprimat:
 * e ~350 KB de cod care n-are ce căuta în pachetul principal al aplicației.
 */
import { hasSignedFileName, isSignedPdf } from "./signedDocs";
import { canEncodeImages, reencodeJpegBytes, shrinkImageFile } from "./imageShrink";

/** Sub atâția octeți nu merită efortul: 116 din cele 235 de obiecte din storage sunt sub 100 KB și fac împreună 1,7 MB. */
export const COMPRESS_MIN_BYTES = 300 * 1024;

/** Câștigul minim pentru a păstra varianta comprimată. */
const MIN_GAIN = 0.15;

export type CompressionMethod = "original" | "pdf-streams" | "pdf-scan" | "image";

export interface CompressedUpload {
  /** Fișierul de urcat: cel comprimat, sau exact cel primit. */
  file: File;
  originalBytes: number;
  bytes: number;
  method: CompressionMethod;
  /** De ce a rămas originalul (doar când `method === "original"`). */
  reason?: string;
}

function keepOriginal(file: File, reason: string): CompressedUpload {
  return { file, originalBytes: file.size, bytes: file.size, method: "original", reason };
}

/**
 * Micșorează fișierul dacă se poate face în siguranță. Nu aruncă niciodată.
 */
export async function compressForUpload(file: File): Promise<CompressedUpload> {
  try {
    if (file.size < COMPRESS_MIN_BYTES) return keepOriginal(file, "deja_mic");
    if (hasSignedFileName(file.name)) return keepOriginal(file, "semnat");

    const type = (file.type || "").toLowerCase();
    if (type === "application/pdf" || /\.pdf$/i.test(file.name)) return await compressPdf(file);
    if (type.startsWith("image/")) return await compressImage(file);
    // Word/Excel/ZIP sunt deja containere comprimate — o a doua trecere nu scoate nimic.
    return keepOriginal(file, "tip_necomprimabil");
  } catch {
    return keepOriginal(file, "eroare");
  }
}

async function compressPdf(file: File): Promise<CompressedUpload> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (isSignedPdf(bytes, file.name)) return keepOriginal(file, "semnat");

  const { shrinkPdfStreams, rasterizeScannedPdf } = await import("./pdfShrink");

  // Întâi varianta fără pierderi. Când reușește, nu mai încercăm nimic altceva.
  const lossless = await shrinkPdfStreams(bytes);
  if (lossless.bytes && isWorthIt(lossless.bytes.length, file.size)) {
    return built(file, lossless.bytes, "application/pdf", file.name, "pdf-streams");
  }

  // Apoi scanul: doar pagini fără text, cu o singură imagine JPEG fiecare.
  if (!canEncodeImages()) return keepOriginal(file, lossless.reason ?? "fara_canvas");
  const raster = await rasterizeScannedPdf(bytes, (jpeg, opts) => reencodeJpegBytes(jpeg, opts));
  if (raster.bytes && isWorthIt(raster.bytes.length, file.size)) {
    return built(file, raster.bytes, "application/pdf", file.name, "pdf-scan");
  }
  return keepOriginal(file, raster.reason ?? lossless.reason ?? "fara_castig");
}

async function compressImage(file: File): Promise<CompressedUpload> {
  const shrunk = await shrinkImageFile(file);
  if (!shrunk || !isWorthIt(shrunk.blob.size, file.size)) return keepOriginal(file, "fara_castig");
  const name = withExtension(file.name, shrunk.extension);
  const out = new File([shrunk.blob], name, { type: shrunk.mime, lastModified: file.lastModified });
  return { file: out, originalBytes: file.size, bytes: out.size, method: "image" };
}

function isWorthIt(newSize: number, oldSize: number): boolean {
  return newSize > 0 && newSize <= oldSize * (1 - MIN_GAIN);
}

function built(
  original: File,
  bytes: Uint8Array,
  mime: string,
  name: string,
  method: CompressionMethod,
): CompressedUpload {
  const file = new File([bytes as unknown as BlobPart], name, { type: mime, lastModified: original.lastModified });
  return { file, originalBytes: original.size, bytes: file.size, method };
}

/** `factura.png` → `factura.jpg`. Fișierele fără extensie o primesc pe cea nouă. */
export function withExtension(fileName: string, extension: string): string {
  return /\.[A-Za-z0-9]{1,8}$/.test(fileName)
    ? fileName.replace(/\.[A-Za-z0-9]{1,8}$/, `.${extension}`)
    : `${fileName}.${extension}`;
}

/** Extensia unui nume de fișier, fără punct. `""` când nu are. */
export function extensionOf(fileName: string): string {
  return fileName.match(/\.([A-Za-z0-9]{1,8})$/)?.[1] ?? "";
}

/** „3,1 MB → 412 KB" pentru interfață; `null` când fișierul a rămas neatins. */
export function describeCompression(result: CompressedUpload): string | null {
  if (result.method === "original") return null;
  return `${formatBytes(result.originalBytes)} → ${formatBytes(result.bytes)}`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
}
