/**
 * Randarea în browser a documentelor Office din dosarele PAR — Word și Excel, DOAR de citit.
 *
 * De ce: decizia de aprobare se ia uitându-te la document. PDF-urile și imaginile se deschideau
 * deja în vizualizator, dar un `.docx` sau un `.xlsx` — devizul, lista de participanți, tabelul de
 * costuri — îl scotea pe aprobator din aplicație („Formatul acesta nu poate fi randat de browser.
 * Descarcă-l ca să-l deschizi"), adică descărcare, Excel, alt-tab, înapoi. Aici documentul e randat
 * pe loc, din chiar octeții pe care vizualizatorul i-a descărcat deja pentru verificarea de acces.
 *
 * Fișierul din stocare NU e atins: se citește, nu se scrie și nu se trimite nimic înapoi.
 *
 * ATENȚIE la buget (`scripts/check-bundle-budget.mjs`, §3.4 — 150 KB gzip pe calea critică):
 * `docx-preview` (51 KB gzip) și `exceljs` (270 KB gzip — măsurat la build, nu estimat) se importă
 * DINAMIC, aici înăuntru.
 * Modulul acesta e mic și poate sta pe calea critică; bibliotecile nu — ele se descarcă abia când
 * cineva chiar deschide un Word sau un Excel. Nu muta importurile sus, în capul fișierului.
 */

/** Ce știe vizualizatorul să randeze singur. `none` = rămâne butonul de descărcare. */
export type PreviewKind = "pdf" | "image" | "docx" | "xlsx" | "none";

const IMAGE_EXT = ["png", "jpg", "jpeg", "webp", "gif", "avif"];

/**
 * Tipul de randare, dedus din MIME **și** din extensie.
 *
 * Extensia nu e un lux: browserele trimit des `application/octet-stream` pentru fișiere Office
 * (vezi aceeași dublă verificare în `server/lib/ai/officeText.ts`), iar atunci MIME-ul singur ar
 * trimite un deviz perfect randabil pe ramura de descărcare.
 *
 * Formatele binare vechi (`.doc`, `.xls`, `.ppt`) și `.pptx` NU intră aici: nicio bibliotecă de
 * browser nu le citește, iar uploadul le acceptă (`server/routes/parAttachments.ts`). Ele cad
 * intenționat pe `none`, unde descărcarea rămâne singurul drum onest.
 */
export function previewKind(mime: string, fileName: string): PreviewKind {
  const ext = fileName.toLowerCase().split(".").pop() ?? "";
  if (mime.includes("pdf") || ext === "pdf") return "pdf";
  if (mime.startsWith("image/") || IMAGE_EXT.includes(ext)) return "image";
  if (ext === "docx" || mime.includes("wordprocessingml")) return "docx";
  if (ext === "xlsx" || mime.includes("spreadsheetml")) return "xlsx";
  return "none";
}

/**
 * Randează un `.docx` în containerul dat, cu tot cu stilurile lui.
 *
 * `styleContainer` e chiar containerul, nu `document.head`: `docx-preview` injectează un `<style>`
 * cu reguli prefixate de `className`, iar ținându-le în panou dispar odată cu el, în loc să se
 * adune în `<head>` la fiecare document deschis. CSP-ul permite injecția
 * (`style-src 'self' 'unsafe-inline'`, vezi `server/middleware/securityHeaders.ts`).
 */
export async function renderDocxInto(container: HTMLElement, file: Blob): Promise<void> {
  const { renderAsync } = await import("docx-preview");
  container.replaceChildren();
  await renderAsync(file, container, container, {
    className: "docx",
    inWrapper: true,
    // Lățimea de pagină se păstrează (asta face documentul recognoscibil), înălțimea nu:
    // cu `ignoreHeight: false` pagina e fixată la A4 și textul mai lung e tăiat vizual.
    ignoreWidth: false,
    ignoreHeight: true,
    breakPages: true,
    renderHeaders: true,
    renderFooters: true,
    renderFootnotes: true,
    // Comentariile și modificările urmărite sunt zgomot într-o decizie de aprobare.
    renderComments: false,
    renderChanges: false,
    // Imaginile devin `data:` în loc de `blob:`. Ambele trec de CSP (`img-src 'self' data: blob:`),
    // dar `docx-preview` nu revocă niciodată URL-urile blob pe care le creează — la zeci de
    // documente deschise într-o sesiune de aprobări, alea rămân agățate de memorie.
    useBase64URL: true,
    trimXmlDeclaration: true,
  });
}

/** O celulă de Excel, pregătită pentru randare ca `<td>`. */
export interface XlsxCell {
  text: string;
  colSpan: number;
  rowSpan: number;
  bold: boolean;
  /** Numerele se aliniază la dreapta — altfel coloana de sume nu se mai citește ca o coloană. */
  numeric: boolean;
}

/** O foaie de calcul, gata de randat. */
export interface XlsxSheet {
  name: string;
  rows: XlsxCell[][];
  /** Foaia depășea plafoanele de mai jos și a fost tăiată — se spune în interfață, nu se ascunde. */
  truncated: boolean;
}

/**
 * Plafoane de randare. Un registru de 50.000 de rânduri construit ca `<table>` blochează fila;
 * un atașament de PAR are, în practică, zeci de rânduri. Peste plafon arătăm începutul și spunem
 * clar că restul lipsește, ca omul să descarce fișierul în loc să creadă că l-a văzut tot.
 */
export const XLSX_MAX_ROWS = 300;
export const XLSX_MAX_COLS = 40;

/** `ExcelJS.ValueType.Merge` — celulă acoperită de o îmbinare, deci deja randată de „stăpâna" ei. */
const VALUE_TYPE_MERGE = 1;

const dateFormat = new Intl.DateTimeFormat("ro-RO", { day: "2-digit", month: "2-digit", year: "numeric" });

/**
 * Textul unei celule.
 *
 * `cell.text` din ExcelJS acoperă corect formulele (dă rezultatul), textul bogat și hyperlinkurile,
 * dar pentru date calendaristice întoarce `Date.toString()` întreg („Mon Sep 07 2026 03:00:00
 * GMT+0300…") — verificat, nu presupus. Deci datele le formatăm noi.
 *
 * Numerele rămân exact cum sunt în fișier, fără separatori de mii: e o previzualizare, nu o
 * replică a formatării din Excel, iar un separator inventat peste un cod fiscal sau un IBAN
 * stocat ca număr ar transforma documentul în altceva decât e.
 */
function cellText(cell: { text?: string; value?: unknown }): string {
  const value = cell.value;
  if (value instanceof Date) return dateFormat.format(value);
  if (value === null || value === undefined) return "";
  return (cell.text ?? "").trim();
}

/**
 * Citește un `.xlsx` și îl întoarce ca foi de tabel simple.
 *
 * Modelul e date, nu HTML: componenta randează `<td>`-uri din el, deci un document încărcat de
 * altcineva nu poate injecta markup în aplicație (niciun `dangerouslySetInnerHTML`).
 */
export async function readXlsxSheets(file: Blob): Promise<XlsxSheet[]> {
  // Interop UMD↔ESM: build-ul de browser al exceljs e UMD, deci `default` poate lipsi în funcție
  // de bundler. Același tipar defensiv ca în `server/routes/docs.ts`.
  const mod = (await import("exceljs")) as unknown as {
    default?: typeof import("exceljs");
  };
  const ExcelJS = mod.default ?? (mod as unknown as typeof import("exceljs"));

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await file.arrayBuffer());

  return workbook.worksheets
    .filter((sheet) => sheet.state !== "hidden" && sheet.state !== "veryHidden")
    .map(readSheet);
}

function readSheet(sheet: import("exceljs").Worksheet): XlsxSheet {
  const spans = mergeSpans(sheet);
  const rowCount = Math.min(sheet.rowCount, XLSX_MAX_ROWS);
  const colCount = Math.min(Math.max(sheet.actualColumnCount, sheet.columnCount), XLSX_MAX_COLS);
  // `actualColumnCount` numără și coloanele doar formatate: un deviz de 5 coloane raportează 14 și
  // ar fi randat cu 9 coloane de celule goale după el (măsurat pe un fișier real). Tăiem coada.
  const lastCol = lastUsedColumn(sheet, rowCount, colCount, spans);

  const rows: XlsxCell[][] = [];
  for (let r = 1; r <= rowCount; r += 1) {
    const row = sheet.getRow(r);
    const cells: XlsxCell[] = [];
    for (let c = 1; c <= lastCol; c += 1) {
      const cell = row.getCell(c);
      // Celulele acoperite de o îmbinare nu primesc `<td>` propriu: `colSpan`/`rowSpan` de pe
      // celula-stăpână le acoperă deja. Un `<td>` în plus ar deplasa tot rândul la dreapta.
      if (cell.type === VALUE_TYPE_MERGE) continue;
      const span = spans.get(`${r}:${c}`);
      cells.push({
        text: cellText(cell),
        // O îmbinare care trecea de ultima coloană păstrată ar lăți tabelul înapoi la loc.
        colSpan: Math.min(span?.colSpan ?? 1, lastCol - c + 1),
        rowSpan: span?.rowSpan ?? 1,
        bold: cell.font?.bold === true,
        numeric: typeof cell.value === "number",
      });
    }
    rows.push(cells);
  }

  // Rândurile goale de la coadă (Excel raportează des un `rowCount` mai mare decât ce e scris)
  // n-au ce căuta în previzualizare.
  while (rows.length > 0 && rows[rows.length - 1].every((cell) => cell.text === "")) rows.pop();

  return {
    name: sheet.name,
    rows,
    truncated: sheet.rowCount > XLSX_MAX_ROWS || sheet.actualColumnCount > XLSX_MAX_COLS,
  };
}

/**
 * Ultima coloană care chiar are conținut (sau e acoperită de o îmbinare pornită din ea).
 * Minim 1, ca o foaie goală să rămână un tabel valid în loc de zero coloane.
 */
function lastUsedColumn(
  sheet: import("exceljs").Worksheet,
  rowCount: number,
  colCount: number,
  spans: Map<string, { colSpan: number; rowSpan: number }>,
): number {
  let last = 1;
  for (let r = 1; r <= rowCount; r += 1) {
    const row = sheet.getRow(r);
    for (let c = colCount; c > last; c -= 1) {
      if (cellText(row.getCell(c)) === "") continue;
      // O celulă îmbinată se întinde peste coloane din dreapta care, citite singure, par goale.
      const span = spans.get(`${r}:${c}`);
      last = Math.min(colCount, c + (span ? span.colSpan - 1 : 0));
      break;
    }
  }
  return last;
}

/**
 * `{ "rând:coloană" → span }` pentru colțul din stânga-sus al fiecărei îmbinări.
 *
 * Adresele („A1:C3") se traduc în rând/coloană prin `sheet.getCell`, ca să nu rescriem noi
 * conversia literă→număr de coloană (AA, AB… e exact genul de detaliu greșit în tăcere).
 */
function mergeSpans(sheet: import("exceljs").Worksheet): Map<string, { colSpan: number; rowSpan: number }> {
  const spans = new Map<string, { colSpan: number; rowSpan: number }>();
  const merges = (sheet.model as { merges?: string[] }).merges ?? [];
  for (const range of merges) {
    const [from, to] = range.split(":");
    if (!from || !to) continue;
    // `fullAddress` și nu `cell.row`/`cell.col`: tipurile ExcelJS declară ultimele ca `string`
    // (moștenite din `Address`), deși la execuție sunt numere — scăderea lor n-ar compila.
    const start = sheet.getCell(from).fullAddress;
    const end = sheet.getCell(to).fullAddress;
    spans.set(`${start.row}:${start.col}`, {
      colSpan: end.col - start.col + 1,
      rowSpan: end.row - start.row + 1,
    });
  }
  return spans;
}
