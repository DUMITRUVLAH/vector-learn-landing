/**
 * Reîncodarea imaginilor în browser, pe canvas.
 *
 * Aici stă tot ce are nevoie de `document`/`canvas`, ca `pdfShrink.ts` să rămână logică pură,
 * rulabilă și testabilă în Node pe fișiere reale.
 *
 * Două lucruri care par detalii și nu sunt:
 *
 * 1. `imageOrientation: "from-image"` — o fotografie făcută cu telefonul poartă orientarea în
 *    EXIF, iar EXIF-ul se pierde la reîncodare. Fără opțiunea asta, un act fotografiat în picioare
 *    ajunge culcat în dosar, și nimeni nu bănuiește compresia, ci „aplicația care strică pozele".
 * 2. Transparența — un PNG cu alfa (sigiliu, logo, captură cu colțuri rotunjite) devine în JPEG o
 *    imagine cu fundal negru. De asta verificăm canalul alfa pe pânza deja desenată și trecem pe
 *    JPEG doar când imaginea e complet opacă; altfel rămâne PNG, doar micșorat.
 */

/**
 * Latura lungă implicită: 1754 px = o pagină A4 la 150 DPI.
 *
 * Cifra nu e aleasă din burtă. Scanurile reale din storage sunt la 200 DPI (1654×2338), iar
 * comparația decupajelor la 150 DPI cu q=0,62 e indistinctibilă de original, inclusiv pe textul
 * mărunt al clauzelor („Contract Fox.pdf", 6 pagini: 3,11 MB → 1,44 MB). Sub ~120 DPI scrisul
 * începe să se moaie, și vorbim de acte juridice, nu de poze de profil.
 *
 * Al doilea motiv pentru care 1754 e pragul de jos rezonabil: documentele urcate ajung la modelul
 * care extrage suma, IBAN-ul și codul fiscal (`readUploadedDoc` le trimite ca atare). Modelele de
 * vedere micșorează oricum imaginea sub ~1568 px pe latura lungă, deci la 1754 px NU pierdem
 * nimic din ce vede AI-ul. Coborând pragul sub 1568 s-ar plăti spațiu cu acuratețea extragerii.
 */
export const DEFAULT_MAX_LONG_EDGE = 1754;
export const DEFAULT_JPEG_QUALITY = 0.62;

export interface EncodeOptions {
  maxLongEdge?: number;
  quality?: number;
}

/** Browserul poate decoda și desena imagini? (jsdom din teste nu poate — răspunde `false`.) */
export function canEncodeImages(): boolean {
  return typeof createImageBitmap === "function" && (typeof OffscreenCanvas === "function" || typeof document !== "undefined");
}

/**
 * Reîncodează octeții unui JPEG: micșorat la `maxLongEdge` și recomprimat la `quality`.
 * `null` înseamnă „nu s-a putut" (decodare eșuată, canvas indisponibil) — apelantul păstrează
 * originalul, nu improvizează.
 */
export async function reencodeJpegBytes(bytes: Uint8Array, opts: EncodeOptions = {}): Promise<Uint8Array | null> {
  const blob = new Blob([bytes as unknown as BlobPart], { type: "image/jpeg" });
  const out = await reencodeBlob(blob, "image/jpeg", opts);
  return out ? new Uint8Array(await out.arrayBuffer()) : null;
}

export interface ShrunkImage {
  blob: Blob;
  mime: string;
  /** Extensia potrivită noului tip, fără punct. */
  extension: string;
}

/**
 * Micșorează un fișier imagine ales de utilizator. Întoarce `null` când nu se câștigă nimic —
 * apelantul urcă originalul.
 */
export async function shrinkImageFile(file: File, opts: EncodeOptions = {}): Promise<ShrunkImage | null> {
  if (!canEncodeImages()) return null;
  const bitmap = await decode(file);
  if (!bitmap) return null;

  const { canvas, ctx } = makeCanvas(bitmap, opts.maxLongEdge ?? DEFAULT_MAX_LONG_EDGE);
  if (!ctx) return null;
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();

  // PNG-ul rămâne PNG doar dacă chiar folosește transparența; altfel JPEG-ul e de câteva ori
  // mai mic pe același conținut.
  const keepAlpha = hasTransparency(ctx, canvas.width, canvas.height);
  const mime = keepAlpha ? "image/png" : "image/jpeg";
  const blob = await toBlob(canvas, mime, opts.quality ?? DEFAULT_JPEG_QUALITY);
  if (!blob || blob.size >= file.size) return null;
  return { blob, mime, extension: keepAlpha ? "png" : "jpg" };
}

async function reencodeBlob(blob: Blob, mime: string, opts: EncodeOptions): Promise<Blob | null> {
  if (!canEncodeImages()) return null;
  const bitmap = await decode(blob);
  if (!bitmap) return null;
  const { canvas, ctx } = makeCanvas(bitmap, opts.maxLongEdge ?? DEFAULT_MAX_LONG_EDGE);
  if (!ctx) return null;
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  return toBlob(canvas, mime, opts.quality ?? DEFAULT_JPEG_QUALITY);
}

async function decode(blob: Blob): Promise<ImageBitmap | null> {
  try {
    return await createImageBitmap(blob, { imageOrientation: "from-image" });
  } catch {
    try {
      return await createImageBitmap(blob); // browsere fără opțiunea de orientare
    } catch {
      return null; // HEIC pe un browser care nu-l decodează, fișier corupt
    }
  }
}

type AnyCanvas = OffscreenCanvas | HTMLCanvasElement;

function makeCanvas(bitmap: ImageBitmap, maxLongEdge: number): { canvas: AnyCanvas; ctx: CanvasRenderingContext2D | null } {
  const scale = Math.min(1, maxLongEdge / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas: AnyCanvas =
    typeof OffscreenCanvas === "function" ? new OffscreenCanvas(width, height) : document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  // `willReadFrequently`: citim o dată pixelii pentru testul de transparență.
  const ctx = canvas.getContext("2d", { willReadFrequently: true }) as CanvasRenderingContext2D | null;
  return { canvas, ctx };
}

function hasTransparency(ctx: CanvasRenderingContext2D, width: number, height: number): boolean {
  try {
    const { data } = ctx.getImageData(0, 0, width, height);
    // Din 4 în 4 pixeli: un fundal transparent nu e niciodată un singur pixel izolat, iar
    // parcurgerea completă a unei imagini de 8 MP ar bloca firul principal degeaba.
    for (let i = 3; i < data.length; i += 16) if (data[i] < 255) return true;
    return false;
  } catch {
    return true; // canvas „murdărit" sau context pierdut → presupunem transparență și păstrăm PNG
  }
}

function toBlob(canvas: AnyCanvas, mime: string, quality: number): Promise<Blob | null> {
  if ("convertToBlob" in canvas) {
    return canvas.convertToBlob({ type: mime, quality }).catch(() => null);
  }
  return new Promise((resolve) => (canvas as HTMLCanvasElement).toBlob(resolve, mime, quality));
}
