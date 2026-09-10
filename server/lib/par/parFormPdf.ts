/**
 * Formularul PAR (16 secțiuni), scris pe server ca text, nu fotografiat.
 *
 * Ce era: `src/lib/parPdf.ts` construia formularul ca HTML, îl punea într-un nod ascuns și îl
 * fotografia cu html2canvas → o imagine JPEG lipită într-un PDF. Textul nu se putea selecta ori
 * căuta, calitatea depindea de ecranul celui care apăsa butonul, iar formularul exista doar dacă
 * cineva îl descărca și îl atașa manual — de aceea multe dosare de audit nu-l aveau deloc.
 *
 * Ce e acum: același formular oficial, scris cu pdfmake + fontul Tinos (metric-compatibil cu Times
 * New Roman, are toate diacriticele) — aceeași cale ca actele DOCGEN și ca fișa aprobărilor.
 * Rulează pe server, deci formularul poate fi generat oricând: la descărcare ȘI în dosar, chiar
 * dacă nimeni nu l-a atașat vreodată.
 *
 * Etichetele rămân în engleză, ca pe formularul oficial al donatorului — el e documentul care se
 * semnează și se arată la audit; traducerea lui ar fi un alt document, nu o îmbunătățire.
 */
import type { ParFormData, ParFormSignature } from "./parFormData";
import { DOC_FONT_FAMILY } from "../docs/pdfFonts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PdfNode = Record<string, any>;

const INK = "#000000";
const FAINT = "#555555";
const TITLE_BG = "#fbe9ec";
const RED = "#c0392b";
const BORDER = "#000000";

/** „7 000,00" — grupare cu spațiu, zecimale cu virgulă, ca pe formularul oficial. */
export function formAmount(cents: number): string {
  const neg = cents < 0;
  const v = Math.abs(Math.round(cents));
  const grouped = String(Math.floor(v / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `${neg ? "-" : ""}${grouped},${String(v % 100).padStart(2, "0")}`;
}

/** „10-Sep-26" — formatul de dată al formularului. */
export function formDate(v: Date | string | null | undefined): string {
  if (!v) return "";
  const d = new Date(v);
  if (isNaN(d.getTime())) return "";
  const day = String(d.getUTCDate()).padStart(2, "0");
  const mon = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][d.getUTCMonth()];
  return `${day}-${mon}-${String(d.getUTCFullYear()).slice(2)}`;
}

/** Numărul de secțiune, ca exponent — ca în formularul tipărit. */
function num(n: number): PdfNode {
  return { text: String(n), fontSize: 6.5, bold: true };
}

/** Etichetă + valoare pe o linie subliniată (secțiunile 1–7 și casetele de semnătură). */
function field(n: number | null, label: string, value: string | null | undefined): PdfNode {
  return {
    columns: [
      {
        width: "auto",
        text: [...(n ? [num(n), { text: " " }] : []), { text: `${label}:`, bold: true, fontSize: 8.5 }],
      },
      {
        width: "*",
        text: value || " ",
        fontSize: 9,
        margin: [4, 0, 0, 0],
        decoration: "underline",
        decorationColor: "#888888",
      },
    ],
    columnGap: 2,
    margin: [0, 1.5, 0, 1.5],
  };
}

/** Căsuță bifabilă desenată, nu un caracter — Tinos n-are ☐/☒, iar „[X]" arată a text. */
function checkbox(label: string, selected: boolean): PdfNode {
  const box: PdfNode[] = [
    { type: "rect", x: 0, y: 1, w: 8, h: 8, lineWidth: 0.7, lineColor: INK },
  ];
  if (selected) {
    box.push(
      { type: "line", x1: 1.2, y1: 2.2, x2: 6.8, y2: 7.8, lineWidth: 1, lineColor: INK },
      { type: "line", x1: 6.8, y1: 2.2, x2: 1.2, y2: 7.8, lineWidth: 1, lineColor: INK },
    );
  }
  return {
    columns: [
      { width: 12, canvas: box },
      { width: "*", text: label, fontSize: 8.5, bold: selected },
    ],
    columnGap: 2,
    margin: [0, 2, 0, 2],
  };
}

/** Chenarul de tabel al formularului: linii negre subțiri peste tot. */
const FRAME = {
  hLineWidth: () => 0.6,
  vLineWidth: () => 0.6,
  hLineColor: () => BORDER,
  vLineColor: () => BORDER,
  paddingTop: () => 4,
  paddingBottom: () => 4,
  paddingLeft: () => 6,
  paddingRight: () => 6,
};

/** O caseta de semnătură (secțiunile 14–15). */
function signatureCell(title: PdfNode[], sig: ParFormSignature | null, showStamp = false): PdfNode {
  const approved = sig?.decision === "approved";
  return {
    stack: [
      { text: title, margin: [0, 0, 0, 6] },
      ...(showStamp && approved
        ? [{ text: "APPROVE", bold: true, fontSize: 9.5, characterSpacing: 0.5, margin: [0, 0, 0, 4] }]
        : []),
      field(null, "Name", sig?.name ?? ""),
      field(null, "Title", sig?.title ?? ""),
      field(null, "Date", approved ? formDate(sig?.decidedAt) : ""),
      field(null, "Signature", ""),
    ],
  };
}

/** Documentul pdfmake al formularului. */
export function buildParFormDefinition(d: ParFormData): PdfNode {
  const cur = d.currency || "MDL";
  const requestorIdentity =
    d.requestorCode && d.requestorTitle?.includes(d.requestorCode)
      ? d.requestorTitle
      : [d.requestorTitle, d.requestorCode].filter(Boolean).join(" · ");
  const projectWithEvent = [d.projectName, d.eventName].filter(Boolean).join(" · ");

  const sig14 = d.signatures.find((s) => s.step === 0) ?? null;
  const approvers = d.signatures.filter((s) => s.step > 0).sort((a, b) => a.step - b.step);

  const itemRows =
    d.lineItems.length > 0
      ? d.lineItems.map((it, i) => [
          { text: String(i + 1), fontSize: 8.5, alignment: "center" },
          { text: it.description, fontSize: 8.5 },
          { text: String(it.quantity), fontSize: 8.5, alignment: "center" },
          { text: it.unit ?? "", fontSize: 8.5, alignment: "center" },
          { text: formAmount(it.unitPriceCents), fontSize: 8.5, alignment: "right" },
          { text: formAmount(it.lineTotalCents), fontSize: 8.5, alignment: "right" },
        ])
      : [[{ text: "No items", fontSize: 8.5, alignment: "center", colSpan: 6, color: FAINT }, {}, {}, {}, {}, {}]];

  const total =
    d.totalEstimatedCents ?? d.lineItems.reduce((s, i) => s + i.lineTotalCents, 0);

  const content: PdfNode[] = [
    // Banda de titlu — singura pată de culoare a formularului oficial.
    {
      table: { widths: ["*"], body: [[{ text: "Payment Action Request (PAR) Form", bold: true, fontSize: 13, alignment: "center", fillColor: TITLE_BG, margin: [0, 4, 0, 4] }]] },
      layout: FRAME,
    },
    {
      text: "Instructions for completing this form may be found here.",
      fontSize: 7.5,
      color: FAINT,
      alignment: "center",
      margin: [0, 3, 0, 6],
    },

    // 1–7
    {
      table: {
        widths: ["50%", "50%"],
        body: [[
          {
            stack: [
              field(1, "Date of Request", formDate(d.dateOfRequest)),
              field(2, "Requested By", d.requestedByName),
              field(3, "Title of Requestor/Code", requestorIdentity),
              field(4, "Department", d.departmentName),
            ],
          },
          {
            stack: [
              field(5, "Date Items/Services Needed", formDate(d.dateNeeded)),
              field(6, "Requested For/Deliver To", projectWithEvent),
              field(7, "Budget code", d.budgetCodeLabel),
              { text: "(according to monthly budget planning)", fontSize: 6.5, italics: true, color: FAINT, margin: [10, 0, 0, 0] },
            ],
          },
        ]],
      },
      layout: FRAME,
    },

    // 8–9
    {
      table: {
        widths: ["50%", "50%"],
        body: [[
          {
            stack: [
              { text: [num(8), { text: " Purpose of PAR (check one):", bold: true, fontSize: 8.5 }], margin: [0, 0, 0, 4] },
              checkbox("Execute payment", d.purpose === "execute_payment"),
              checkbox("Obtain quotations (in preparation for procurement)", d.purpose === "obtain_quotations"),
              checkbox("Provide estimate cost only (do not conduct cost competition)", d.purpose === "provide_estimate"),
            ],
          },
          {
            stack: [
              { text: [num(9), { text: " Charge To (check one and enter billing code, if applicable):", bold: true, fontSize: 8.5 }], margin: [0, 0, 0, 4] },
              checkbox("Operations:", d.chargeTo === "operations"),
              checkbox("Program:", d.chargeTo === "program"),
              checkbox("Other:", d.chargeTo === "other"),
              ...(d.chargeBillingCode
                ? [{ text: `Billing code: ${d.chargeBillingCode}`, fontSize: 8, margin: [12, 2, 0, 0] }]
                : []),
            ],
          },
        ]],
      },
      layout: FRAME,
    },

    // 10 — poziții
    {
      table: {
        headerRows: 2,
        widths: ["6%", "40%", "9%", "9%", "18%", "18%"],
        body: [
          [{ text: [num(10), { text: " Items/Services Requested:", bold: true, fontSize: 8.5 }], colSpan: 6 }, {}, {}, {}, {}, {}],
          [
            { text: "Item #", bold: true, fontSize: 7.5, alignment: "center" },
            { text: "Description/Specifications of Items or Service", bold: true, fontSize: 7.5, alignment: "center" },
            { text: "Quantity", bold: true, fontSize: 7.5, alignment: "center" },
            { text: "Units", bold: true, fontSize: 7.5, alignment: "center" },
            { text: [{ text: "Est. Unit Price\n", bold: true }, { text: cur, bold: true, color: RED }], fontSize: 7.5, alignment: "center" },
            { text: [{ text: "Est. Total Price\n", bold: true }, { text: cur, bold: true, color: RED }], fontSize: 7.5, alignment: "center" },
          ],
          ...itemRows,
          [
            { text: `TOTAL ESTIMATED COST*:   ${cur}`, bold: true, fontSize: 8.5, alignment: "right", colSpan: 5 },
            {}, {}, {}, {},
            { text: formAmount(total), bold: true, fontSize: 9.5, alignment: "right" },
          ],
        ],
      },
      layout: FRAME,
    },
    ...(d.currency !== "MDL" && d.totalMdlCents != null
      ? [{
          text: `MDL equivalent: ${formAmount(d.totalMdlCents)}${d.exchangeRate ? ` (rate ${d.exchangeRate})` : ""}`,
          fontSize: 7.5,
          alignment: "right",
          margin: [0, 2, 0, 0],
        }]
      : []),
    {
      text: "* For transactions above micro-purchase threshold, if final price for purchase exceeds total estimated cost by more than 10%, purchase shall not proceed without approval from approver below.",
      fontSize: 6.5,
      italics: true,
      color: FAINT,
      margin: [0, 2, 0, 6],
    },

    // 11
    {
      table: {
        widths: ["*"],
        body: [
          [{ text: [num(11), { text: " Purpose and Description of End Use of Requested Items/Services:", bold: true, fontSize: 8.5 }] }],
          [{ text: d.endUse || " ", fontSize: 8.5, margin: [0, 2, 0, 8] }],
        ],
      },
      layout: FRAME,
    },

    // 12
    {
      table: {
        widths: ["*"],
        body: [
          [{ text: [num(12), { text: " Special Instructions or Additional Information:", bold: true, fontSize: 8.5 }] }],
          [{
            stack: [
              { columns: [{ width: 80, text: "Name, Surname:", fontSize: 8.5 }, { text: d.payeeName ?? "", fontSize: 8.5, bold: true }] },
              { columns: [{ width: 80, text: "IDNP:", fontSize: 8.5 }, { text: d.payeeIdnp ?? "", fontSize: 8.5 }] },
              { columns: [{ width: 80, text: "IBAN:", fontSize: 8.5 }, { text: d.payeeIban ?? "", fontSize: 8.5 }] },
              { columns: [{ width: 80, text: "Bank:", fontSize: 8.5 }, { text: d.payeeBank ?? "", fontSize: 8.5 }] },
            ],
          }],
        ],
      },
      layout: FRAME,
    },

    // 13
    {
      table: {
        widths: ["*"],
        body: [
          [{ text: [num(13), { text: " Attachments to PAR, such as specifications, scope of work, or other documentation (check one):", bold: true, fontSize: 8.5 }] }],
          [{
            stack: [
              checkbox("Yes, the following attachments are included (describe):", d.attachmentsPresent === true),
              ...(d.attachmentsNote ? [{ text: d.attachmentsNote, fontSize: 8, margin: [12, 0, 0, 4] }] : []),
              checkbox("No attachments are included.", d.attachmentsPresent === false),
            ],
          }],
        ],
      },
      layout: FRAME,
    },

    // 14–15
    {
      table: {
        widths: ["50%", "50%"],
        body: [[
          signatureCell([num(14), { text: " Requestor Signature:", bold: true, fontSize: 8.5 }], sig14),
          {
            stack: [
              signatureCell(
                [num(15), { text: " Approver Signature (DOA Holder, Supervisor, or Tech Lead):", bold: true, fontSize: 8.5 }],
                approvers[0] ?? null,
              ),
              ...(approvers.length > 1
                ? [
                    { canvas: [{ type: "line", x1: 0, y1: 4, x2: 240, y2: 4, lineWidth: 0.6, lineColor: BORDER }], margin: [0, 4, 0, 6] },
                    signatureCell([{ text: " ", fontSize: 8.5 }], approvers[1], true),
                  ]
                : []),
            ],
          },
        ]],
      },
      layout: FRAME,
    },

    // 16
    {
      table: {
        widths: ["50%", "50%"],
        body: [
          [{ text: [num(16), { text: " Payment Internal Use Only:", bold: true, fontSize: 8.5 }], colSpan: 2 }, {}],
          [
            {
              stack: [
                field(null, "PAR BL", d.payment?.parBl ?? ""),
                { text: "(Add PAR budget line)", fontSize: 6.5, italics: true, color: FAINT },
                field(null, "Date Received", formDate(d.payment?.receivedAt)),
              ],
            },
            {
              stack: [
                field(null, "Received By", d.payment?.receivedByName ?? ""),
                field(null, "Assigned To", d.payment?.assignedToName ?? ""),
              ],
            },
          ],
          [{
            colSpan: 2,
            fontSize: 8,
            text: [
              { text: "IBAN: ", },
              { text: d.payeeIban || "—", bold: true },
              { text: "    |    Bank: " },
              { text: d.payeeBank || "—", bold: true },
              ...(d.payment?.paymentDate ? [{ text: "    |    Payment date: " }, { text: formDate(d.payment.paymentDate), bold: true }] : []),
              ...(d.payment?.paymentRef ? [{ text: "    |    Ref: " }, { text: d.payment.paymentRef, bold: true }] : []),
              ...(d.payment?.actualAmountCents != null
                ? [{ text: "    |    Actual amount: " }, { text: `${formAmount(d.payment.actualAmountCents)} ${cur}`, bold: true }]
                : []),
            ],
          }, {}],
        ],
      },
      layout: FRAME,
    },

    { text: `PAR No: ${d.requestNo ?? ""}`, fontSize: 7.5, color: FAINT, alignment: "right", margin: [0, 4, 0, 0] },
  ];

  return {
    pageSize: "A4",
    pageMargins: [30, 28, 30, 28],
    info: { title: d.requestNo ?? "PAR", creator: "FinFlow" },
    defaultStyle: { font: DOC_FONT_FAMILY, fontSize: 8.5, lineHeight: 1.15 },
    content,
  };
}

/** Numele fișierului, identic cu cel folosit de butonul din pagină. */
export function parFormFileName(requestNo: string | null, parId: string): string {
  const safe = (requestNo ?? `par-${parId.slice(0, 8)}`).replace(/[^\w-]+/g, "_");
  return `PAR_Form_${safe}.pdf`;
}
