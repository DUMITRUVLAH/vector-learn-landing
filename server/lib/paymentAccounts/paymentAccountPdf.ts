/**
 * CONTPLATA-faza-1 / CP-03 — contul de plată ca PDF adevărat, personalizabil.
 *
 * Owner-ul, 26.09.2026: „contul de plată se scoate HTML, nu PDF, și nu-l putem personaliza cu logo,
 * cu rechizitele noastre, culorile". Cauza HTML-ului: generatorul vechi rasteriza cu Chromium, care
 * pe Vercel nu există, deci cădea MEREU pe rezerva HTML. Aici PDF-ul se scrie direct, ca text
 * vectorial, cu pdfmake — același motor și aceleași fonturi (cu diacritice și chirilice) ca actele
 * din registru (`server/lib/docs/pdfDocument.ts`), deci merge identic local și pe serverless.
 *
 * Personalizarea stă în `PaymentAccountBranding`: machetă (modern / clasic / compact), culoare de
 * accent, logo, suma în litere, semnătura, locul ștampilei, textul de subsol. Culorile de aici sunt
 * hex PRIN DESIGN — e un document tipărit, nu un ecran al aplicației, și nu depinde de tokenii UI.
 *
 * `buildPaymentAccountDocDefinition` e pur (testabil fără a scrie un PDF); doar
 * `renderPaymentAccountPdf` încarcă pdfmake, și îl încarcă târziu (lecția exceljs: un import de
 * nivel înalt al unei librării grele a picat odată tot API-ul).
 */
import { amountToWordsRo } from "../docs/amountToWords";
import { DOC_FONT_FAMILY, MODERN_FONT_FAMILY, hasModernFont, pdfFonts } from "../docs/pdfFonts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PdfNode = Record<string, any>;

export type PaymentAccountLayout = "modern" | "clasic" | "compact";
export type PaymentAccountLang = "ro" | "ru" | "en";

export const PAYMENT_ACCOUNT_LAYOUTS: PaymentAccountLayout[] = ["modern", "clasic", "compact"];
export const DEFAULT_ACCENT = "#047857";

export interface PaymentAccountPdfParty {
  name: string;
  idno?: string | null;
  vatCode?: string | null;
  address?: string | null;
  city?: string | null;
  iban?: string | null;
  bankName?: string | null;
  bic?: string | null;
  phone?: string | null;
  email?: string | null;
  contact?: string | null;
}

export interface PaymentAccountPdfLine {
  description: string;
  unit: string;
  quantity: number;
  unitPriceCents: number;
  vatRate: number;
  lineSubtotalCents: number;
  lineVatCents: number;
  lineTotalCents: number;
}

export interface PaymentAccountPdfData {
  /** Numărul emis, sau cel care URMEAZĂ pe o ciornă. */
  documentNumber: string | null;
  isDraft: boolean;
  currency: string;
  issueDate: Date;
  dueDate: Date | null;
  notes: string | null;
  seller: PaymentAccountPdfParty & { administrator?: string | null; administratorTitle?: string | null };
  buyer: PaymentAccountPdfParty;
  items: PaymentAccountPdfLine[];
  subtotalCents: number;
  vatCents: number;
  totalCents: number;
}

export interface PaymentAccountBranding {
  layout: PaymentAccountLayout;
  accentColor: string;
  /** Logoul ca data-URL (pdfmake vrea octeții). null = fără logo. */
  logo: string | null;
  showAmountWords: boolean;
  showSignature: boolean;
  showStamp: boolean;
  footerText: string | null;
  lang: PaymentAccountLang;
}

// ─── Etichete ────────────────────────────────────────────────────────────────

const LABELS = {
  ro: {
    title: "Cont de plată",
    no: "Nr.",
    of: "din",
    issued: "Data emiterii",
    due: "Termen de plată",
    seller: "Furnizor",
    buyer: "Cumpărător",
    idno: "IDNO",
    vat: "Cod TVA",
    address: "Adresa",
    iban: "IBAN",
    bank: "Banca",
    bic: "Cod bancă",
    phone: "Tel.",
    email: "Email",
    contact: "Persoana de contact",
    nr: "Nr.",
    description: "Denumirea mărfii / serviciului",
    unit: "U.M.",
    qty: "Cant.",
    price: "Preț",
    vatPct: "TVA %",
    vatSum: "Suma TVA",
    amount: "Suma",
    subtotal: "Total fără TVA",
    vatTotal: "TVA",
    total: "Total de plată",
    inWords: "Suma în litere",
    payTo: "Rechizite pentru plată",
    notes: "Mențiuni",
    signature: "Semnătura",
    stamp: "L.Ș.",
    draft: "CIORNĂ",
    page: "pagina",
    pageOf: "din",
    administrator: "Administrator",
  },
  ru: {
    title: "Счёт на оплату",
    no: "№",
    of: "от",
    issued: "Дата выставления",
    due: "Срок оплаты",
    seller: "Поставщик",
    buyer: "Покупатель",
    idno: "IDNO",
    vat: "Код НДС",
    address: "Адрес",
    iban: "IBAN",
    bank: "Банк",
    bic: "Код банка",
    phone: "Тел.",
    email: "Email",
    contact: "Контактное лицо",
    nr: "№",
    description: "Наименование товара / услуги",
    unit: "Ед.",
    qty: "Кол.",
    price: "Цена",
    vatPct: "НДС %",
    vatSum: "Сумма НДС",
    amount: "Сумма",
    subtotal: "Итого без НДС",
    vatTotal: "НДС",
    total: "Итого к оплате",
    inWords: "Сумма прописью",
    payTo: "Реквизиты для оплаты",
    notes: "Примечания",
    signature: "Подпись",
    stamp: "М.П.",
    draft: "ЧЕРНОВИК",
    page: "страница",
    pageOf: "из",
    administrator: "Администратор",
  },
  en: {
    title: "Payment request",
    no: "No.",
    of: "of",
    issued: "Issue date",
    due: "Payment due",
    seller: "Supplier",
    buyer: "Customer",
    idno: "Tax ID",
    vat: "VAT code",
    address: "Address",
    iban: "IBAN",
    bank: "Bank",
    bic: "SWIFT/BIC",
    phone: "Phone",
    email: "Email",
    contact: "Contact person",
    nr: "#",
    description: "Goods / services",
    unit: "Unit",
    qty: "Qty",
    price: "Price",
    vatPct: "VAT %",
    vatSum: "VAT",
    amount: "Amount",
    subtotal: "Subtotal",
    vatTotal: "VAT",
    total: "Total due",
    inWords: "Amount in words",
    payTo: "Payment details",
    notes: "Notes",
    signature: "Signature",
    stamp: "Stamp",
    draft: "DRAFT",
    page: "page",
    pageOf: "of",
    administrator: "Director",
  },
} as const;

type Labels = (typeof LABELS)[PaymentAccountLang];

// ─── Ajutoare pure ──────────────────────────────────────────────────────────

/** Culoarea de accent, validată: orice nu e #rrggbb revine la implicit — PDF-ul nu pică pe o culoare. */
export function safeAccent(hex: string | null | undefined): string {
  return typeof hex === "string" && /^#[0-9a-fA-F]{6}$/.test(hex) ? hex.toUpperCase() : DEFAULT_ACCENT;
}

/** Amestecă o culoare cu alb: 0 = culoarea, 1 = alb. Pentru fundalurile deschise ale accentului. */
export function tint(hex: string, amount: number): string {
  const c = safeAccent(hex);
  const ch = [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
  const mixed = ch.map((v) => Math.round(v + (255 - v) * Math.min(1, Math.max(0, amount))));
  return "#" + mixed.map((v) => v.toString(16).padStart(2, "0")).join("").toUpperCase();
}

/** Textul pe accent: alb pe culori închise, aproape negru pe cele deschise (contrast lizibil). */
export function onAccent(hex: string): string {
  const c = safeAccent(hex);
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16) / 255);
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum > 0.6 ? "#111111" : "#FFFFFF";
}

/** 123456 → „1 234,56" — separator de mii spațiu, zecimale cu virgulă, ca pe actele din Moldova. */
export function formatAmount(cents: number): string {
  const neg = cents < 0;
  const v = Math.abs(Math.round(cents));
  const whole = String(Math.floor(v / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `${neg ? "-" : ""}${whole},${String(v % 100).padStart(2, "0")}`;
}

export function formatQty(q: number): string {
  if (!Number.isFinite(q)) return "0";
  return Number.isInteger(q) ? String(q) : String(Math.round(q * 1000) / 1000).replace(".", ",");
}

export function formatDateMd(d: Date | null): string {
  if (!d || isNaN(d.getTime())) return "—";
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`;
}

/** Rândurile de identitate ale unei părți, fără golurile nedate. */
function partyLines(p: PaymentAccountPdfParty, L: Labels): Array<[string, string]> {
  const addr = [p.address, p.city].filter((x) => x && String(x).trim()).join(", ");
  const rows: Array<[string, string | null | undefined]> = [
    [L.idno, p.idno],
    [L.vat, p.vatCode],
    [L.address, addr || null],
    [L.iban, p.iban],
    [L.bank, p.bankName],
    [L.bic, p.bic],
    [L.phone, p.phone],
    [L.email, p.email],
    [L.contact, p.contact],
  ];
  return rows.filter((r): r is [string, string] => !!r[1] && String(r[1]).trim() !== "");
}

// ─── Blocuri comune ─────────────────────────────────────────────────────────

interface Ctx {
  d: PaymentAccountPdfData;
  b: PaymentAccountBranding;
  L: Labels;
  accent: string;
  compact: boolean;
}

function numberLine({ d, L }: Ctx): string {
  const nr = d.documentNumber ?? "—";
  return `${L.no} ${nr} ${L.of} ${formatDateMd(d.issueDate)}`;
}

function itemsTable(ctx: Ctx, variant: "filled" | "grid" | "lines"): PdfNode {
  const { d, L, accent } = ctx;
  const showVat = d.items.some((i) => i.vatRate > 0);
  const fs = ctx.compact ? 8.5 : 9.5;
  const headColor = variant === "filled" ? onAccent(accent) : variant === "grid" ? "#111111" : accent;
  const headFill = variant === "filled" ? accent : variant === "grid" ? "#EDEDED" : undefined;

  const head = [
    { text: L.nr, alignment: "center" },
    { text: L.description },
    { text: L.unit, alignment: "center" },
    { text: L.qty, alignment: "right" },
    { text: `${L.price} (${d.currency})`, alignment: "right" },
    ...(showVat ? [{ text: L.vatPct, alignment: "right" }, { text: L.vatSum, alignment: "right" }] : []),
    { text: `${L.amount} (${d.currency})`, alignment: "right" },
  ].map((c) => ({ ...c, bold: true, fontSize: fs - 0.5, color: headColor, fillColor: headFill }));

  const body = d.items.map((it, i) => [
    { text: String(i + 1), alignment: "center", color: "#666666" },
    { text: it.description },
    { text: it.unit, alignment: "center" },
    { text: formatQty(it.quantity), alignment: "right" },
    { text: formatAmount(it.unitPriceCents), alignment: "right" },
    ...(showVat
      ? [
          { text: `${it.vatRate}%`, alignment: "right" },
          { text: formatAmount(it.lineVatCents), alignment: "right" },
        ]
      : []),
    { text: formatAmount(it.lineTotalCents), alignment: "right", bold: true },
  ]);

  const widths = [16, "*", 30, 30, 58, ...(showVat ? [30, 50] : []), 64];
  const zebra = tint(accent, 0.93);

  return {
    table: { headerRows: 1, widths, body: [head, ...body], dontBreakRows: true },
    fontSize: fs,
    layout:
      variant === "grid"
        ? {
            hLineWidth: () => 0.6,
            vLineWidth: () => 0.6,
            hLineColor: () => "#555555",
            vLineColor: () => "#555555",
            paddingTop: () => (ctx.compact ? 2 : 4),
            paddingBottom: () => (ctx.compact ? 2 : 4),
          }
        : {
            hLineWidth: (i: number, node: PdfNode) =>
              i === 0 || i === node.table.body.length ? (variant === "lines" ? 1 : 0) : i === 1 ? (variant === "lines" ? 1.2 : 0) : 0.4,
            vLineWidth: () => 0,
            hLineColor: (i: number) => (i <= 1 ? accent : "#DDDDDD"),
            fillColor: (row: number) => (variant === "filled" && row > 0 && row % 2 === 0 ? zebra : null),
            paddingTop: () => (ctx.compact ? 3 : 6),
            paddingBottom: () => (ctx.compact ? 3 : 6),
            paddingLeft: () => 5,
            paddingRight: () => 5,
          },
    margin: [0, ctx.compact ? 6 : 12, 0, 0],
  };
}

function totalsBlock(ctx: Ctx, emphasis: "band" | "plain"): PdfNode {
  const { d, L, accent } = ctx;
  const row = (label: string, value: string, bold = false) => [
    { text: label, color: bold ? "#111111" : "#555555", bold },
    { text: value, alignment: "right", bold },
  ];
  const rows = [
    ...(d.vatCents > 0
      ? [row(L.subtotal, `${formatAmount(d.subtotalCents)} ${d.currency}`), row(L.vatTotal, `${formatAmount(d.vatCents)} ${d.currency}`)]
      : []),
  ];
  const band: PdfNode =
    emphasis === "band"
      ? {
          table: {
            widths: ["*", "auto"],
            body: [
              [
                { text: L.total.toUpperCase(), bold: true, color: onAccent(accent), fontSize: 9.5, margin: [6, 6, 0, 6] },
                { text: `${formatAmount(d.totalCents)} ${d.currency}`, bold: true, color: onAccent(accent), fontSize: 14, alignment: "right", margin: [0, 3, 6, 3] },
              ],
            ],
          },
          layout: { hLineWidth: () => 0, vLineWidth: () => 0, fillColor: () => accent },
          margin: [0, 4, 0, 0],
        }
      : {
          table: { widths: ["*", "auto"], body: [row(L.total, `${formatAmount(d.totalCents)} ${d.currency}`, true)] },
          layout: { hLineWidth: (i: number) => (i === 0 ? 1 : 0), vLineWidth: () => 0, hLineColor: () => accent },
          fontSize: 11,
          margin: [0, 2, 0, 0],
        };

  return {
    columns: [
      { width: "*", text: "" },
      {
        width: ctx.compact ? 200 : 230,
        stack: [
          ...(rows.length ? [{ table: { widths: ["*", "auto"], body: rows }, layout: "noBorders", fontSize: ctx.compact ? 8.5 : 9.5 }] : []),
          band,
        ],
      },
    ],
    margin: [0, 8, 0, 0],
  };
}

function amountWordsNode(ctx: Ctx): PdfNode[] {
  const { d, b, L } = ctx;
  // Suma în litere o avem doar în română; pe RU/EN n-o inventăm prost — lipsește.
  if (!b.showAmountWords || b.lang !== "ro") return [];
  return [
    {
      text: [{ text: `${L.inWords}: `, color: "#555555" }, { text: amountToWordsRo(d.totalCents, { currency: d.currency }), italics: true }],
      fontSize: ctx.compact ? 8.5 : 9.5,
      margin: [0, 8, 0, 0],
    },
  ];
}

/** Rechizitele de plată: exact ce copiază omul în banking — IBAN-ul mare, lizibil. */
function payToNode(ctx: Ctx): PdfNode[] {
  const { d, L, accent } = ctx;
  const s = d.seller;
  if (!s.iban && !s.bankName) return [];
  const lines: PdfNode[] = [
    { text: L.payTo.toUpperCase(), fontSize: 7.5, bold: true, color: accent, characterSpacing: 0.6, margin: [0, 0, 0, 3] },
    { text: s.name, bold: true, fontSize: 9.5 },
  ];
  if (s.iban) lines.push({ text: [{ text: `${L.iban}: `, color: "#555555" }, { text: s.iban, bold: true }], fontSize: ctx.compact ? 9 : 10.5 });
  const bankBits = [s.bankName, s.bic ? `${L.bic}: ${s.bic}` : null].filter(Boolean).join(" · ");
  if (bankBits) lines.push({ text: bankBits, fontSize: 8.5, color: "#555555" });
  if (s.idno) lines.push({ text: `${L.idno}: ${s.idno}`, fontSize: 8.5, color: "#555555" });
  return [
    {
      table: { widths: ["*"], body: [[{ stack: lines, margin: [8, 6, 8, 6] }]] },
      layout: {
        hLineWidth: () => 0,
        vLineWidth: (i: number) => (i === 0 ? 2.5 : 0),
        vLineColor: () => accent,
        fillColor: () => tint(accent, 0.94),
      },
      margin: [0, ctx.compact ? 8 : 14, 0, 0],
      unbreakable: true,
    },
  ];
}

function notesNode(ctx: Ctx): PdfNode[] {
  const { d, L } = ctx;
  if (!d.notes || !d.notes.trim()) return [];
  return [
    { text: L.notes, bold: true, fontSize: 8.5, color: "#555555", margin: [0, ctx.compact ? 8 : 12, 0, 2] },
    { text: d.notes.trim(), fontSize: ctx.compact ? 8.5 : 9.5 },
  ];
}

function signatureNode(ctx: Ctx): PdfNode[] {
  const { d, b, L } = ctx;
  if (!b.showSignature && !b.showStamp) return [];
  const who = d.seller.administrator
    ? `${d.seller.administratorTitle || L.administrator}: ${d.seller.administrator}`
    : L.signature;
  return [
    {
      columns: [
        b.showSignature
          ? {
              width: 260,
              stack: [
                { text: who, fontSize: 9, color: "#444444" },
                { canvas: [{ type: "line", x1: 0, y1: 22, x2: 220, y2: 22, lineWidth: 0.6, lineColor: "#777777" }] },
                { text: L.signature, fontSize: 7.5, color: "#888888", margin: [0, 2, 0, 0] },
              ],
            }
          : { width: 260, text: "" },
        { width: "*", text: "" },
        b.showStamp
          ? {
              width: 90,
              stack: [
                { canvas: [{ type: "ellipse", x: 45, y: 32, r1: 32, r2: 32, lineWidth: 0.6, lineColor: "#AAAAAA", dash: { length: 3 } }] },
                { text: L.stamp, fontSize: 8, color: "#999999", alignment: "center", margin: [0, -38, 0, 0] },
              ],
            }
          : { width: 90, text: "" },
      ],
      margin: [0, ctx.compact ? 14 : 26, 0, 0],
      unbreakable: true,
    },
  ];
}

function partyStack(title: string, p: PaymentAccountPdfParty, ctx: Ctx, titleColor: string): PdfNode {
  const fs = ctx.compact ? 8 : 8.5;
  return {
    stack: [
      { text: title.toUpperCase(), fontSize: 7.5, bold: true, color: titleColor, characterSpacing: 0.6, margin: [0, 0, 0, 3] },
      { text: p.name || "—", bold: true, fontSize: ctx.compact ? 10 : 11, margin: [0, 0, 0, 2] },
      ...partyLines(p, ctx.L).map(([k, v]) => ({
        text: [{ text: `${k}: `, color: "#666666" }, { text: v }],
        fontSize: fs,
        margin: [0, 0.5, 0, 0],
      })),
    ],
  };
}

function logoNode(ctx: Ctx, height: number): PdfNode | null {
  return ctx.b.logo ? { image: ctx.b.logo, fit: [height * 3.2, height] } : null;
}

// ─── Machetele ──────────────────────────────────────────────────────────────

function modernContent(ctx: Ctx): PdfNode[] {
  const { d, L, accent } = ctx;
  const logo = logoNode(ctx, 44);
  return [
    {
      columns: [
        logo
          ? { width: "*", stack: [logo, { text: d.seller.name, fontSize: 8.5, color: "#555555", margin: [0, 4, 0, 0] }] }
          : { width: "*", text: d.seller.name, bold: true, fontSize: 13, color: accent },
        {
          width: "auto",
          stack: [
            { text: L.title.toUpperCase(), fontSize: 18, bold: true, color: accent, alignment: "right", characterSpacing: 0.4 },
            { text: `${L.no} ${d.documentNumber ?? "—"}`, fontSize: 12, bold: true, alignment: "right", margin: [0, 2, 0, 4] },
            {
              table: {
                widths: ["auto", "auto"],
                body: [
                  [{ text: L.issued, color: "#666666" }, { text: formatDateMd(d.issueDate), bold: true, alignment: "right" }],
                  ...(d.dueDate ? [[{ text: L.due, color: "#666666" }, { text: formatDateMd(d.dueDate), bold: true, alignment: "right" }]] : []),
                ],
              },
              layout: "noBorders",
              fontSize: 9,
              alignment: "right",
            },
          ],
        },
      ],
    },
    { canvas: [{ type: "line", x1: 0, y1: 8, x2: 515, y2: 8, lineWidth: 2, lineColor: accent }], margin: [0, 0, 0, 12] },
    {
      columns: [
        {
          width: "*",
          table: { widths: ["*"], body: [[{ ...partyStack(L.seller, d.seller, ctx, accent), margin: [8, 7, 8, 7] }]] },
          layout: { hLineWidth: () => 0, vLineWidth: () => 0, fillColor: () => tint(accent, 0.95) },
        },
        {
          width: "*",
          table: { widths: ["*"], body: [[{ ...partyStack(L.buyer, d.buyer, ctx, accent), margin: [8, 7, 8, 7] }]] },
          layout: { hLineWidth: () => 0, vLineWidth: () => 0, fillColor: () => tint(accent, 0.95) },
        },
      ],
      columnGap: 10,
    },
    itemsTable(ctx, "filled"),
    totalsBlock(ctx, "band"),
    ...amountWordsNode(ctx),
    ...payToNode(ctx),
    ...notesNode(ctx),
    ...signatureNode(ctx),
  ];
}

function clasicContent(ctx: Ctx): PdfNode[] {
  const { d, L, accent } = ctx;
  const logo = logoNode(ctx, 38);
  const partyRow = (title: string, p: PaymentAccountPdfParty) => [
    { text: title, bold: true, fontSize: 9.5 },
    {
      stack: [
        { text: p.name || "—", bold: true },
        ...partyLines(p, L).map(([k, v]) => ({ text: `${k}: ${v}`, fontSize: 9 })),
      ],
      fontSize: 10,
    },
  ];
  return [
    ...(logo ? [{ columns: [logo, { width: "*", text: "" }], margin: [0, 0, 0, 8] }] : []),
    { text: L.title.toUpperCase(), alignment: "center", bold: true, fontSize: 15, color: accent },
    { text: numberLine(ctx), alignment: "center", fontSize: 11, margin: [0, 2, 0, 2] },
    ...(d.dueDate ? [{ text: `${L.due}: ${formatDateMd(d.dueDate)}`, alignment: "center", fontSize: 9.5, color: "#444444" }] : []),
    {
      table: { widths: [90, "*"], body: [partyRow(L.seller, d.seller), partyRow(L.buyer, d.buyer)] },
      layout: {
        hLineWidth: () => 0.6,
        vLineWidth: () => 0.6,
        hLineColor: () => "#555555",
        vLineColor: () => "#555555",
        paddingTop: () => 4,
        paddingBottom: () => 4,
      },
      margin: [0, 12, 0, 0],
    },
    itemsTable(ctx, "grid"),
    totalsBlock(ctx, "plain"),
    ...amountWordsNode(ctx),
    ...payToNode(ctx),
    ...notesNode(ctx),
    ...signatureNode(ctx),
  ];
}

function compactContent(ctx: Ctx): PdfNode[] {
  const { d, L, accent } = ctx;
  const logo = logoNode(ctx, 28);
  return [
    {
      columns: [
        ...(logo ? [{ width: "auto", ...logo, margin: [0, 0, 10, 0] }] : []),
        {
          width: "*",
          stack: [
            { text: `${L.title} ${numberLine(ctx)}`, bold: true, fontSize: 12, color: accent },
            ...(d.dueDate ? [{ text: `${L.due}: ${formatDateMd(d.dueDate)}`, fontSize: 8.5, color: "#555555" }] : []),
          ],
        },
      ],
    },
    { canvas: [{ type: "line", x1: 0, y1: 5, x2: 515, y2: 5, lineWidth: 0.8, lineColor: accent }], margin: [0, 0, 0, 8] },
    { columns: [partyStack(L.seller, d.seller, ctx, accent), partyStack(L.buyer, d.buyer, ctx, accent)], columnGap: 14 },
    itemsTable(ctx, "lines"),
    totalsBlock(ctx, "plain"),
    ...amountWordsNode(ctx),
    ...payToNode(ctx),
    ...notesNode(ctx),
    ...signatureNode(ctx),
  ];
}

// ─── Definiția documentului ─────────────────────────────────────────────────

export function buildPaymentAccountDocDefinition(
  data: PaymentAccountPdfData,
  branding: PaymentAccountBranding,
): PdfNode {
  const lang: PaymentAccountLang = (["ro", "ru", "en"] as const).includes(branding.lang) ? branding.lang : "ro";
  const layout: PaymentAccountLayout = PAYMENT_ACCOUNT_LAYOUTS.includes(branding.layout) ? branding.layout : "modern";
  const accent = safeAccent(branding.accentColor);
  const L = LABELS[lang];
  const ctx: Ctx = { d: data, b: { ...branding, lang, layout }, L, accent, compact: layout === "compact" };

  const content = layout === "clasic" ? clasicContent(ctx) : layout === "compact" ? compactContent(ctx) : modernContent(ctx);
  const font = layout === "clasic" || !hasModernFont() ? DOC_FONT_FAMILY : MODERN_FONT_FAMILY;
  const footerText = branding.footerText?.trim() || null;

  return {
    pageSize: "A4",
    pageMargins: [40, layout === "compact" ? 32 : 40, 40, 48],
    info: { title: `${L.title} ${data.documentNumber ?? ""}`.trim(), creator: data.seller.name || "FinFlow" },
    defaultStyle: { font, fontSize: layout === "compact" ? 9 : 10, lineHeight: 1.2, color: "#1A1A1A" },
    ...(data.isDraft ? { watermark: { text: L.draft, color: accent, opacity: 0.07, bold: true } } : {}),
    footer: (page: number, total: number) => ({
      margin: [40, 12, 40, 0],
      columns: [
        { width: "*", text: footerText ?? "", fontSize: 7.5, color: "#777777" },
        { width: "auto", text: `${L.page} ${page} ${L.pageOf} ${total}`, fontSize: 7.5, color: "#999999", alignment: "right" },
      ],
    }),
    content,
  };
}

/** Scrie PDF-ul. Aruncă dacă lipsesc fonturile — un cont cu diacritice rupte nu se trimite nimănui. */
export async function renderPaymentAccountPdf(
  data: PaymentAccountPdfData,
  branding: PaymentAccountBranding,
): Promise<Buffer> {
  const { default: PdfPrinter } = await import("pdfmake/src/printer.js");
  const printer = new PdfPrinter(pdfFonts());
  const pdfDoc = printer.createPdfKitDocument(buildPaymentAccountDocDefinition(data, branding));
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    pdfDoc.on("data", (chunk: Buffer) => chunks.push(chunk));
    pdfDoc.on("end", () => resolve(Buffer.concat(chunks)));
    pdfDoc.on("error", reject);
    pdfDoc.end();
  });
}
