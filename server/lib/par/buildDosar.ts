/**
 * Dosarul PAR ca fișier — construit O SINGURĂ dată, folosit din două locuri.
 *
 * Până acum dosarul se năștea în corpul rutei `GET /api/par/:id/dosar`: 300 de linii de asamblare
 * care existau doar cât ținea un request cu sesiune de browser. Sincronizarea săptămânală în Google
 * Drive (PAR-DRIVE) are nevoie de EXACT același PDF, dar rulează dintr-un cron, fără utilizator
 * logat — iar a doua implementare ar fi însemnat două dosare care se despart în timp (unul cu
 * formularul la final, altul fără). Aici e sursa unică: ruta face controlul de acces și trimite
 * octeții, jobul îi urcă.
 *
 * Ordinea documentelor și regulile (ce se încorporează, ce rămâne doar ca pagină-notă) sunt cele
 * din VM1-12 / VM5, mutate ca atare.
 */
import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "../../db/client";
import {
  parApprovals,
  parAttachments,
  parBudgetCodes,
  parEvents,
  parPayers,
  parProjects,
  parRequests,
} from "../../db/schema/par";
import { users } from "../../db/schema/users";
import type { ApprovalSheetData } from "./approvalSheet";
import { buildDosarPagesDefinition, renderDosarPagesPdf, type DosarSeparator } from "./dosarPdf";
import { buildParFormDefinition } from "./parFormPdf";
import { loadParFormData } from "./parFormData";

// Owner (10.09.2026): „PAR-ul să fie undeva la final, în formatul PDF pe care îl avem."
// Dosarul se citește ca un dosar de hârtie: întâi fișa aprobărilor, apoi documentele care
// justifică plata, iar formularul cererii încheie — e piesa pe care o știi deja pe de rost.
export const DOSAR_ORDER: string[] = [
  "contract",
  "act_of_receipt",
  "quotation",
  "invoice",
  "participants_list",
  "narrative_report",
  "deliverables",
  "payment_order",
  "other",
  "par_pdf",
];

export function kindLabel(kind: string): string {
  const map: Record<string, string> = {
    par_pdf: "Formularul PAR",
    contract: "Contract",
    act_of_receipt: "Act de recepție",
    quotation: "Ofertă / Deviz",
    invoice: "Factură fiscală",
    participants_list: "Listă de participanți",
    narrative_report: "Raport narativ",
    deliverables: "Livrabile",
    payment_order: "Ordin de plată",
    other: "Altele",
  };
  return map[kind] ?? kind;
}

/** Numele fișierului, identic în download și în Drive: `Dosar_PAR_<numar>.pdf`. */
export function dosarFileName(requestNo: string | null, parId: string): string {
  const safe = (requestNo ?? `PAR-${parId.slice(0, 8)}`).replace(/[^\w-]+/g, "_");
  return `Dosar_PAR_${safe}.pdf`;
}

export interface BuiltDosar {
  bytes: Buffer;
  fileName: string;
}

/** Asamblează dosarul complet. `null` dacă cererea nu există în tenantul dat. */
export async function buildDosar(parId: string, tenantId: string): Promise<BuiltDosar | null> {
  const [par] = await db
    .select()
    .from(parRequests)
    .where(and(eq(parRequests.id, parId), eq(parRequests.tenantId, tenantId)));
  if (!par) return null;

  // Fetch attachments sorted by our deterministic order
  const attachments = await db
    .select()
    .from(parAttachments)
    .where(and(eq(parAttachments.parId, parId), eq(parAttachments.tenantId, tenantId)));

  attachments.sort((a, b) => {
    const ai = DOSAR_ORDER.indexOf(a.kind ?? "other");
    const bi = DOSAR_ORDER.indexOf(b.kind ?? "other");
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });

  // ── VM3-02: data for the "Fișa aprobărilor" cover page (generated live at download) ──
  const sheetApprovalRows = await db
    .select()
    .from(parApprovals)
    .where(and(eq(parApprovals.parId, parId), eq(parApprovals.tenantId, tenantId)))
    .orderBy(asc(parApprovals.step));
  const sheetUserIds = [
    ...new Set(
      [par.requestedByUserId, ...sheetApprovalRows.map((a) => a.approverUserId)].filter(
        (v): v is string => !!v
      )
    ),
  ];
  const sheetUserRows = sheetUserIds.length
    ? await db
        .select({ id: users.id, name: users.name })
        .from(users)
        .where(and(eq(users.tenantId, tenantId), inArray(users.id, sheetUserIds)))
    : [];
  const sheetUserName = (id: string | null) =>
    (id && sheetUserRows.find((u) => u.id === id)?.name) || null;
  const [sheetProj] = par.projectId
    ? await db
        .select({ name: parProjects.name })
        .from(parProjects)
        .where(and(eq(parProjects.tenantId, tenantId), eq(parProjects.id, par.projectId)))
    : [];
  const sheetEvId = (par as { eventId?: string | null }).eventId ?? null;
  const [sheetEvt] = sheetEvId
    ? await db
        .select({ name: parEvents.name })
        .from(parEvents)
        .where(and(eq(parEvents.tenantId, tenantId), eq(parEvents.id, sheetEvId)))
    : [];
  const [sheetBc] = par.budgetCodeId
    ? await db
        .select({ code: parBudgetCodes.code, name: parBudgetCodes.name })
        .from(parBudgetCodes)
        .where(and(eq(parBudgetCodes.tenantId, tenantId), eq(parBudgetCodes.id, par.budgetCodeId)))
    : [];

  // Identitatea entității care plătește — un workspace poate avea mai multe (par_payers).
  const [sheetPayer] = par.payerId
    ? await db
        .select({
          name: parPayers.name,
          legalName: parPayers.legalName,
          idno: parPayers.idno,
          vatCode: parPayers.vatCode,
          address: parPayers.address,
          bankName: parPayers.bankName,
          iban: parPayers.iban,
          bankCode: parPayers.bankCode,
          directorName: parPayers.directorName,
          directorRole: parPayers.directorRole,
        })
        .from(parPayers)
        .where(and(eq(parPayers.tenantId, tenantId), eq(parPayers.id, par.payerId)))
    : [];

  const sheetData: ApprovalSheetData = {
    payer: sheetPayer ?? null,
    requestNo: par.requestNo,
    dateOfRequest: par.dateOfRequest,
    status: par.status,
    requestedByName: sheetUserName(par.requestedByUserId),
    payeeName: par.payeeName,
    payeeIdnp: par.payeeIdnp,
    payeeIban: par.payeeIban,
    payeeBank: par.payeeBank,
    currency: par.currency,
    totalEstimatedCents: par.totalEstimatedCents,
    totalMdlCents: (par as { totalMdlCents?: number | null }).totalMdlCents ?? null,
    projectName: sheetProj?.name ?? null,
    eventName: sheetEvt?.name ?? null,
    budgetCodeLabel: sheetBc ? [sheetBc.code, sheetBc.name].filter(Boolean).join(" — ") : null,
    endUse: par.endUse,
    approvedAt: par.approvedAt,
    paidAt: par.paidAt,
    approvals: sheetApprovalRows.map((a) => ({
      step: a.step,
      approverRoleLabel: a.approverRoleLabel,
      // Pasul 0 nu e semnat manual de nimeni — trimiterea îi scrie caseta, iar până pe
      // 2026-09-10 îi scria funcția. Numele din cont e sursa corectă acolo.
      name: (a.step === 0 ? sheetUserName(a.approverUserId) ?? a.signatureName : a.signatureName ?? sheetUserName(a.approverUserId)),
      decision: a.decision,
      decidedAt: a.decidedAt,
      comment: a.comment,
    })),
};

  // ── Dynamic import of pdf-lib (NEVER top-level — exceljs outage lesson) ──
  const { PDFDocument } = await import("pdf-lib");

  /** Octeții unui atașament, din data-URL sau de la URL extern. */
  const attachmentBytes = async (fileUrl: string): Promise<Uint8Array> => {
    if (fileUrl.startsWith("data:")) {
      const base64 = fileUrl.split(",")[1];
      if (!base64) throw new Error("fișier gol");
      return new Uint8Array(Buffer.from(base64, "base64"));
    }
    const resp = await fetch(fileUrl);
    if (!resp.ok) throw new Error(`fetch ${resp.status}`);
    return new Uint8Array(await resp.arrayBuffer());
  };

  const mimeOf = (fileUrl: string): string => fileUrl.match(/^data:([^;,]+)/)?.[1] ?? "";

  /** Ce contribuie fiecare atașament la dosar. Se decide ÎNAINTE de a scrie paginile, ca
   *  separatoarele (inclusiv notele de eroare) să fie cunoscute și să poată fi generate cu
   *  fontul cu diacritice, într-un singur document. */
  type DosarPiece =
    | { type: "pdf"; pages: import("pdf-lib").PDFDocument }
    | { type: "image"; bytes: Uint8Array; format: "png" | "jpg" }
    | { type: "note" };

  interface PlanEntry {
    separator?: DosarSeparator;
    piece?: DosarPiece;
  }

  const plan: PlanEntry[] = [];
  let currentSection: string | null = null;

  for (const att of attachments) {
    const kind = att.kind ?? "other";
    // Pentru „Altul", separatorul poartă numele scris de solicitant („Certificat de
    // conformitate"), nu genericul „Altele" — altfel dosarul nu spune ce e documentul.
    const section =
      kind === "other" && att.kindOther?.trim() ? att.kindOther.trim() : kindLabel(kind);
    if (section !== currentSection) {
      currentSection = section;
      plan.push({ separator: { title: section.slice(0, 90) } });
    }

    const fileUrl = att.fileUrl ?? "";
    const fileName = att.fileName ?? "fișier";
    const shortName = fileName.length > 80 ? `${fileName.slice(0, 79)}…` : fileName;
    const mime = mimeOf(fileUrl);
    const lower = fileName.toLowerCase();
    const isPdf = lower.endsWith(".pdf") || mime === "application/pdf" || mime === "application/x-pdf";
    // pdf-lib încorporează DOAR PNG și JPEG. WebP/GIF/AVIF rămân cu nota lor — mai bine o spunem
    // decât să pretindem că le-am pus în dosar.
    const isPng = mime === "image/png" || lower.endsWith(".png");
    const isJpg = mime === "image/jpeg" || mime === "image/jpg" || lower.endsWith(".jpg") || lower.endsWith(".jpeg");

    if (isPdf) {
      try {
        const src = await PDFDocument.load(await attachmentBytes(fileUrl), { ignoreEncryption: true });
        plan.push({ piece: { type: "pdf", pages: src } });
      } catch (err) {
        plan.push({
          separator: {
            title: `Anexă: ${shortName}`,
            subtitle: `PDF corupt sau inaccesibil — descărcați separat. Detaliu: ${
              err instanceof Error ? err.message.slice(0, 80) : "necunoscut"
            }`,
          },
          piece: { type: "note" },
        });
      }
      continue;
    }

    if (isPng || isJpg) {
      // Owner (10.09.2026): „nu văd în dosar să fie captura, scrie să descarc separat, chiar nu
      // poate fi inserată?" Ba da — captura de ecran a ordinului de plată e chiar dovada, deci
      // intră în dosar ca pagină, nu ca trimitere la un fișier pe care auditorul nu-l are.
      try {
        plan.push({ piece: { type: "image", bytes: await attachmentBytes(fileUrl), format: isPng ? "png" : "jpg" } });
      } catch (err) {
        plan.push({
          separator: {
            title: `Anexă: ${shortName}`,
            subtitle: `Imaginea nu a putut fi citită — descărcați separat. Detaliu: ${
              err instanceof Error ? err.message.slice(0, 80) : "necunoscut"
            }`,
          },
          piece: { type: "note" },
        });
      }
      continue;
    }

    const ext = fileName.split(".").pop()?.toUpperCase() ?? "FIȘIER";
    plan.push({
      separator: {
        title: `Anexă: ${shortName}`,
        subtitle: `Tipul de fișier ${ext.slice(0, 10)} nu poate fi inclus într-un PDF — descărcați-l separat din cerere.`,
      },
      piece: { type: "note" },
    });
  }

  if (attachments.length === 0) {
    plan.push({
      separator: {
        title: `Dosar PAR — ${par.requestNo ?? "fără număr"}`,
        subtitle: "Cererea nu are documente atașate. Fișa aprobărilor de mai sus rămâne valabilă.",
      },
      piece: { type: "note" },
    });
  }

  // Formularul cererii încheie dosarul ÎNTOTDEAUNA. Dacă cineva l-a atașat (`par_pdf`), aceea e
  // piesa semnată și rămâne ea; dacă nu, îl scriem acum din datele cererii. Înainte, un dosar de
  // audit putea să nu conțină deloc formularul — doar pentru că nimeni nu apăsase „Download PDF".
  if (!attachments.some((a) => (a.kind ?? "") === "par_pdf")) {
    try {
      const formData = await loadParFormData(parId, tenantId);
      if (formData) {
        const formBytes = await renderDosarPagesPdf(buildParFormDefinition(formData));
        plan.push({
          separator: { title: "Formularul PAR" },
          piece: { type: "pdf", pages: await PDFDocument.load(formBytes) },
        });
      }
    } catch {
      // Formularul e ultima piesă: dacă scrierea lui pică (fonturi lipsă într-un mediu neconform),
      // dosarul cu fișa și documentele rămâne livrabil — spune doar că formularul lipsește.
      plan.push({
        separator: {
          title: "Formularul PAR",
          subtitle: "Formularul nu a putut fi generat automat. Descarcă-l din pagina cererii.",
        },
        piece: { type: "note" },
      });
    }
  }

  // ── Paginile generate (fișa + separatoarele), scrise cu pdfmake + fontul Tinos ──
  const separators = plan.filter((e): e is PlanEntry & { separator: DosarSeparator } => !!e.separator)
    .map((e) => e.separator);
  const generatedBytes = await renderDosarPagesPdf(
    buildDosarPagesDefinition({ data: sheetData, generatedAt: new Date() }, separators, par.requestNo),
  );
  const generatedDoc = await PDFDocument.load(generatedBytes);
  const sheetPageCount = generatedDoc.getPageCount() - separators.length;

  const dosar = await PDFDocument.create();

  // Fișa aprobărilor deschide dosarul.
  const sheetPages = await dosar.copyPages(
    generatedDoc,
    Array.from({ length: Math.max(sheetPageCount, 0) }, (_, i) => i),
  );
  for (const pg of sheetPages) dosar.addPage(pg);

  const A4 = { width: 595, height: 842 };
  let separatorCursor = 0;

  for (const entry of plan) {
    if (entry.separator) {
      const [pg] = await dosar.copyPages(generatedDoc, [sheetPageCount + separatorCursor]);
      dosar.addPage(pg);
      separatorCursor += 1;
    }
    const piece = entry.piece;
    if (!piece || piece.type === "note") continue;

    if (piece.type === "pdf") {
      const pages = await dosar.copyPages(piece.pages, piece.pages.getPageIndices());
      for (const pg of pages) dosar.addPage(pg);
      continue;
    }

    // Imaginea ocupă o pagină A4, încadrată cu margini și păstrându-și proporțiile.
    try {
      const img = piece.format === "png"
        ? await dosar.embedPng(piece.bytes)
        : await dosar.embedJpg(piece.bytes);
      const page = dosar.addPage([A4.width, A4.height]);
      const margin = 40;
      const maxW = A4.width - margin * 2;
      const maxH = A4.height - margin * 2;
      const scale = Math.min(maxW / img.width, maxH / img.height, 1);
      const w = img.width * scale;
      const h = img.height * scale;
      page.drawImage(img, {
        x: (A4.width - w) / 2,
        y: (A4.height - h) / 2,
        width: w,
        height: h,
      });
    } catch {
      // O imagine pe care pdf-lib n-o poate încorpora (PNG pe 16 biți, profil exotic) nu are voie
      // să pice tot dosarul; pagina de separator scrisă mai sus rămâne, cu numele fișierului.
    }
  }

  const pdfBytes = await dosar.save();

  return { bytes: Buffer.from(pdfBytes), fileName: dosarFileName(par.requestNo, parId) };
}
