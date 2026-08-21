/**
 * Tipurile de documente care se atașează la o cerere PAR — o singură sursă de adevăr
 * pentru etichete și pentru ordinea din dropdown.
 *
 * Lista reproduce anexele standard din formularul PAR („Exemplu de documente ce ar putea
 * fi atașate"): factură fiscală, contract, act de predare-primire, listă de participanți,
 * raport narativ, livrabile — plus „Altul", care cere numele documentului în clar.
 */
import type { ParAttachmentKind } from "@/lib/api/par";

/** Ordinea în care apar în dropdown (aceeași ca în lista de anexe din formular). */
export const ATTACHMENT_KIND_ORDER: ParAttachmentKind[] = [
  "invoice",
  "contract",
  "act_of_receipt",
  "participants_list",
  "narrative_report",
  "deliverables",
  "quotation",
  "payment_order",
  "par_pdf",
  "other",
];

export const ATTACHMENT_KIND_LABELS: Record<ParAttachmentKind, string> = {
  invoice: "Factură fiscală",
  contract: "Contract",
  act_of_receipt: "Act de predare-primire",
  participants_list: "Listă de participanți",
  narrative_report: "Raport narativ",
  deliverables: "Livrabile",
  quotation: "Ofertă / Deviz",
  payment_order: "Ordin de plată",
  par_pdf: "Formular PAR (PDF)",
  other: "Alt document",
};

/**
 * Eticheta afișată pentru un atașament. Pentru „Altul" arată exact ce a scris utilizatorul
 * („Certificat de conformitate"), pentru că „Alt document" nu spune nimic într-un dosar.
 */
export function attachmentKindLabel(kind: string, kindOther?: string | null): string {
  if (kind === "other" && kindOther?.trim()) return kindOther.trim();
  return ATTACHMENT_KIND_LABELS[kind as ParAttachmentKind] ?? kind;
}

/** Lungimea maximă a numelui liber al documentului (oglindește coloana `kind_other`). */
export const KIND_OTHER_MAX_LEN = 200;
