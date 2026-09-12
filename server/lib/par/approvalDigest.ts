/**
 * VM5-11: „Emailurile să vină în batch-uri de aprobare."
 *
 * Azi pleacă un email per cerere: la douăzeci de cereri depuse într-o dimineață, aprobatorul
 * primește douăzeci de emailuri și le citește pe niciunul. Digestul le strânge într-unul singur, la
 * ore fixe — 09:00 și 16:00, ora Chișinăului, confirmate de owner.
 *
 * Ce NU intră niciodată în digest: respingerea, „modificări cerute", plata executată și anularea
 * plății. Alea sunt lucruri la care omul trebuie să reacționeze acum, nu peste opt ore.
 *
 * Modulul e pur — primește rândurile, întoarce subiectul și corpul. Cine le adună și cine le trimite
 * stă în rută, ca textul să poată fi verificat fără bază de date.
 */

export interface DigestItem {
  requestNo: string;
  parId: string;
  /** Suma, deja formatată în moneda cererii („12.500,00 MDL"). */
  amountLabel: string;
  requestorName: string | null;
  projectName: string | null;
  /** De câte zile așteaptă cererea o decizie. */
  waitingDays: number;
  /** Semnalele care schimbă ordinea de citire: urgentă, datată în urmă, documente nepotrivite. */
  urgent?: boolean;
  documentWarnings?: number;
}

/** Cererile care așteaptă cel mai mult se citesc primele: ele sunt cele care blochează pe cineva. */
export function sortDigestItems(items: readonly DigestItem[]): DigestItem[] {
  return [...items].sort(
    (a, b) =>
      Number(!!b.urgent) - Number(!!a.urgent) ||
      b.waitingDays - a.waitingDays ||
      a.requestNo.localeCompare(b.requestNo, "ro")
  );
}

export function digestSubject(count: number): string {
  return count === 1
    ? "[PAR] O cerere așteaptă aprobarea ta"
    : `[PAR] ${count} cereri așteaptă aprobarea ta`;
}

/** Câte zile așteaptă, scris ca un om: „azi", „de ieri", „de 4 zile". */
export function waitingLabel(days: number): string {
  if (days <= 0) return "azi";
  if (days === 1) return "de ieri";
  return `de ${days} zile`;
}

export function buildDigestBody(params: {
  items: readonly DigestItem[];
  /** Linkul către inbox, absolut (din `appUrl()`). */
  inboxUrl: string;
  /** Linkul unei cereri, absolut. */
  parUrl: (parId: string) => string;
  workspace?: string | null;
  toAddress?: string | null;
}): string {
  const items = sortDigestItems(params.items);
  const lines: string[] = [
    items.length === 1
      ? "O cerere așteaptă aprobarea ta:"
      : `${items.length} cereri așteaptă aprobarea ta:`,
    "",
  ];

  for (const item of items) {
    const semne = [
      item.urgent ? "URGENT" : null,
      item.documentWarnings ? `${item.documentWarnings} nepotriviri de documente` : null,
    ].filter(Boolean);
    lines.push(
      `• ${item.requestNo} — ${item.amountLabel}${semne.length ? ` (${semne.join(" · ")})` : ""}`
    );
    const detalii = [
      item.requestorName ? `de la ${item.requestorName}` : null,
      item.projectName,
      `așteaptă ${waitingLabel(item.waitingDays)}`,
    ].filter(Boolean);
    lines.push(`  ${detalii.join(" · ")}`);
    lines.push(`  ${params.parUrl(item.parId)}`);
    lines.push("");
  }

  lines.push(`Deschide inboxul de aprobare: ${params.inboxUrl}`);
  lines.push("");
  lines.push(
    "Primești un singur email cu toate cererile, de două ori pe zi. Respingerile și cererile de " +
      "modificare îți vin în continuare imediat."
  );
  if (params.workspace || params.toAddress) {
    lines.push("");
    lines.push(
      [params.workspace ? `Workspace: ${params.workspace}` : null,
       params.toAddress ? `Cont destinatar: ${params.toAddress}` : null]
        .filter(Boolean)
        .join(" · ")
    );
  }
  return lines.join("\n");
}

/** Zilele întregi de așteptare, în fusul organizației. */
export function daysWaiting(submittedAt: Date | string | null | undefined, now = new Date()): number {
  if (!submittedAt) return 0;
  const t = new Date(submittedAt).getTime();
  if (isNaN(t)) return 0;
  return Math.max(0, Math.floor((now.getTime() - t) / 86_400_000));
}
