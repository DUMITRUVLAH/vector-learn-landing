/**
 * VM5 — paginile GENERATE ale dosarului: fișa aprobărilor și separatoarele de secțiune.
 *
 * De ce s-a rescris: fișa era desenată linie cu linie cu fontul standard Helvetica, care nu are
 * ă/ș/ț. Textul trecea printr-un „pliator" pe ASCII, așa că dosarul unei organizații din Moldova
 * ieșea „FISA APROBARILOR", „Suma estimata", „Destinatia platii" — dar cu „în" intact, pentru că
 * `î` există în WinAnsi. Rezultatul arăta ca un document scanat prost, iar datele plății erau un
 * paragraf continuu în care ochiul nu găsea IBAN-ul. Owner: „parcă e plain text aici… mai bine să
 * fie un tabel".
 *
 * Ce facem acum: aceeași cale ca la actele DOCGEN — pdfmake + fontul Tinos (metric-compatibil cu
 * Times New Roman, are toate diacriticele românești). Datele cererii, ale plătitorului, ale plății
 * și lanțul de aprobare devin TABELE, deci fiecare valoare are eticheta ei pe rândul ei.
 *
 * Separatoarele de secțiune se generează în ACELAȘI document (o pagină per separator), ca fontul
 * să fie încorporat o singură dată: 30 de documente mici cu Tinos în fiecare ar umfla dosarul cu
 * zeci de MB.
 */
import {
  DECISION_LABELS,
  STATUS_LABELS,
  fmtAmount,
  fmtDate,
  fmtDateTime,
  type ApprovalSheetData,
} from "./approvalSheet";
import { DOC_FONT_FAMILY, pdfFonts } from "../docs/pdfFonts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PdfNode = Record<string, any>;

const INK = "#1a1a1a";
const MUTED = "#5b6472";
const RULE = "#c9ced8";

/** Rândurile fără valoare nu se scriu: un tabel plin de „—" ascunde ce chiar există. */
function kvRows(rows: Array<[string, string | null | undefined]>): PdfNode | null {
  const present = rows.filter(([, v]) => v != null && String(v).trim() !== "" && v !== "—");
  if (present.length === 0) return null;
  return {
    table: {
      widths: [140, "*"],
      body: present.map(([label, value]) => [
        { text: label, color: MUTED, fontSize: 9.5 },
        { text: String(value), color: INK, fontSize: 10.5 },
      ]),
    },
    layout: {
      hLineWidth: (i: number, node: PdfNode) => (i === 0 || i === node.table.body.length ? 0 : 0.5),
      vLineWidth: () => 0,
      hLineColor: () => RULE,
      paddingTop: () => 4,
      paddingBottom: () => 4,
      paddingLeft: () => 0,
      paddingRight: () => 6,
    },
    margin: [0, 0, 0, 10],
  };
}

function sectionTitle(text: string): PdfNode {
  return { text, bold: true, fontSize: 12, color: INK, margin: [0, 10, 0, 6] };
}

/** Lanțul de aprobare — un tabel cu antet, ca să se vadă „cine, ce a decis și când". */
function approvalTable(d: ApprovalSheetData): PdfNode {
  const sorted = [...d.approvals].sort((a, b) => a.step - b.step);
  if (sorted.length === 0) {
    return {
      text: "Nicio semnătură înregistrată (cererea nu a fost trimisă spre aprobare).",
      fontSize: 10,
      color: MUTED,
      margin: [0, 0, 0, 10],
    };
  }

  const header = ["Pas", "Rol", "Nume", "Decizie", "Data", "Comentariu"].map((t) => ({
    text: t,
    bold: true,
    fontSize: 9,
    color: MUTED,
  }));

  const body = sorted.map((a) => {
    const role = a.approverRoleLabel ?? (a.step === 0 ? "Solicitant" : `Pas ${a.step}`);
    const decision =
      a.step === 0 ? "trimis spre aprobare" : DECISION_LABELS[a.decision] ?? a.decision;
    return [
      { text: String(a.step), fontSize: 10 },
      { text: role, fontSize: 10 },
      { text: a.name ?? "—", fontSize: 10 },
      {
        text: decision,
        fontSize: 10,
        bold: a.decision === "approved" && a.step > 0,
        color: a.decision === "rejected" ? "#b42318" : INK,
      },
      { text: a.decidedAt ? fmtDateTime(a.decidedAt) : "—", fontSize: 10 },
      { text: a.comment ?? "", fontSize: 9, color: MUTED },
    ];
  });

  return {
    table: { headerRows: 1, widths: [22, "auto", "*", "auto", "auto", "*"], body: [header, ...body] },
    layout: {
      hLineWidth: () => 0.5,
      vLineWidth: () => 0,
      hLineColor: () => RULE,
      paddingTop: () => 5,
      paddingBottom: () => 5,
      paddingLeft: () => 0,
      paddingRight: () => 6,
    },
    margin: [0, 0, 0, 10],
  };
}

/** Fișa aprobărilor, ca listă de noduri pdfmake (fără antetul de document). */
export function approvalSheetContent(d: ApprovalSheetData, generatedAt: Date): PdfNode[] {
  const nodes: PdfNode[] = [
    { text: `FIȘA APROBĂRILOR — ${d.requestNo ?? "fără număr"}`, bold: true, fontSize: 15, color: INK },
    {
      text: `Generată la ${fmtDateTime(generatedAt)} din sistemul PAR (statusul din momentul descărcării)`,
      fontSize: 8.5,
      color: MUTED,
      margin: [0, 2, 0, 8],
    },
  ];

  nodes.push(sectionTitle("Cererea"));
  const cerere = kvRows([
    ["Nr. cerere", d.requestNo],
    ["Data cererii", fmtDate(d.dateOfRequest)],
    ["Solicitant", d.requestedByName],
    ["Status", STATUS_LABELS[d.status] ?? d.status],
    ["Aprobat la", d.approvedAt ? fmtDateTime(d.approvedAt) : null],
    ["Plătit la", d.paidAt ? fmtDateTime(d.paidAt) : null],
  ]);
  if (cerere) nodes.push(cerere);

  const payer = d.payer;
  if (payer && (payer.legalName || payer.name)) {
    nodes.push(sectionTitle("Organizația plătitoare"));
    const rows = kvRows([
      ["Denumire", payer.legalName || payer.name],
      ["IDNO", payer.idno],
      ["Cod TVA", payer.vatCode],
      ["Adresa", payer.address],
      ["IBAN", payer.iban],
      ["Banca", [payer.bankName, payer.bankCode ? `cod ${payer.bankCode}` : null].filter(Boolean).join(" · ")],
      ["Semnatar", payer.directorName ? `${payer.directorName}${payer.directorRole ? `, ${payer.directorRole}` : ""}` : null],
    ]);
    if (rows) nodes.push(rows);
  }

  nodes.push(sectionTitle("Plata"));
  const plata = kvRows([
    ["Beneficiar", d.payeeName],
    ["IDNO / IDNP", d.payeeIdnp],
    ["IBAN", d.payeeIban],
    ["Banca", d.payeeBank],
    ["Suma estimată", fmtAmount(d.totalEstimatedCents, d.currency)],
    [
      "Echivalent MDL",
      d.currency !== "MDL" && d.totalMdlCents != null ? fmtAmount(d.totalMdlCents, "MDL") : null,
    ],
    ["Proiect", d.projectName],
    ["Eveniment", d.eventName],
    ["Budget line", d.budgetCodeLabel],
    ["Destinația plății", d.endUse],
  ]);
  if (plata) nodes.push(plata);

  nodes.push(sectionTitle("Lanțul de aprobare"));
  nodes.push(approvalTable(d));

  nodes.push({
    text: "Document generat automat pentru audit: confirmă cine a aprobat cererea și la ce dată.",
    fontSize: 8.5,
    color: MUTED,
    margin: [0, 10, 0, 0],
  });

  return nodes;
}

export interface DosarSeparator {
  title: string;
  subtitle?: string | null;
}

/**
 * Documentul cu paginile generate: fișa (prima) + câte o pagină per separator, în ordinea dată.
 * Separatoarele încep la indexul întors în `separatorStartPage` — apelantul le extrage de acolo.
 */
export function buildDosarPagesDefinition(
  sheet: { data: ApprovalSheetData; generatedAt: Date },
  separators: DosarSeparator[],
  requestNo: string | null,
): PdfNode {
  const content: PdfNode[] = approvalSheetContent(sheet.data, sheet.generatedAt);

  for (const sep of separators) {
    content.push({
      pageBreak: "before",
      // Separatorul e o filă de dosar, nu o pagină de text: titlul stă la mijloc, singur.
      margin: [0, 260, 0, 0],
      stack: [
        { text: sep.title, bold: true, fontSize: 18, color: INK },
        ...(sep.subtitle
          ? [{ text: sep.subtitle, fontSize: 10.5, color: MUTED, margin: [0, 8, 0, 0] }]
          : []),
      ],
    });
  }

  return {
    pageSize: "A4",
    pageMargins: [50, 50, 50, 55],
    info: { title: `Dosar ${requestNo ?? "PAR"}`, creator: "FinFlow" },
    defaultStyle: { font: DOC_FONT_FAMILY, fontSize: 10.5, lineHeight: 1.25 },
    content,
  };
}

/** Scrie documentul. Importul e târziu: pdfmake trage pdfkit + fontkit după el. */
export async function renderDosarPagesPdf(definition: PdfNode): Promise<Buffer> {
  const { default: PdfPrinter } = await import("pdfmake/src/printer.js");
  const printer = new PdfPrinter(pdfFonts());
  const doc = printer.createPdfKitDocument(definition);
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.end();
  });
}
