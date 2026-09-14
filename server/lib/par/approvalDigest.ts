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

/**
 * VM5-13: o cerere aprobată complet, care așteaptă ca finanțele s-o plătească.
 *
 * Până acum finanțele primeau un email per cerere, în clipa aprobării. Owner-ul a cerut același
 * ritm ca la aprobatori — dimineața și după-amiaza — deci coada de plată devine o secțiune a
 * aceluiași digest, nu un al doilea email.
 */
export interface FinanceItem {
  requestNo: string;
  parId: string;
  amountLabel: string;
  payeeName: string | null;
  /** De câte zile stă aprobată, neplătită. */
  waitingDays: number;
  urgent?: boolean;
}

/** VM5-13: ce s-a întâmplat cu o cerere pe care destinatarul a aprobat-o deja. */
export interface UpdateItem {
  parId: string;
  /** Propoziția gata scrisă („Plata … a fost achitată (cererea PAR-2026-0026)."). */
  text: string;
}

export interface DigestCounts {
  approvals: number;
  finance: number;
  updates: number;
}

/**
 * Subiectul spune ce e înăuntru, fiindcă digestul nu mai e dintr-o singură bucată: un om poate fi
 * și aprobator, și finanțe. Toate variantele încep cu „[PAR] Digest" — `digestRunner.sentRecently`
 * caută exact prefixul ăsta ca să nu trimită de două ori.
 */
export function digestSubject(counts: DigestCounts): string {
  const parts: string[] = [];
  if (counts.approvals > 0) {
    parts.push(
      counts.approvals === 1 ? "o cerere așteaptă aprobarea ta" : `${counts.approvals} cereri așteaptă aprobarea ta`
    );
  }
  if (counts.finance > 0) {
    parts.push(counts.finance === 1 ? "o cerere de plătit" : `${counts.finance} cereri de plătit`);
  }
  if (!parts.length && counts.updates > 0) {
    parts.push("ce s-a întâmplat cu cererile pe care le-ai aprobat");
  }
  return `[PAR] Digest — ${parts.join(" · ")}`;
}

/** Câte zile așteaptă, scris ca un om: „azi", „de ieri", „de 4 zile". */
export function waitingLabel(days: number): string {
  if (days <= 0) return "azi";
  if (days === 1) return "de ieri";
  return `de ${days} zile`;
}

export function buildDigestBody(params: {
  items: readonly DigestItem[];
  /** VM5-13: coada de plată a finanțelor. Gol pentru cine nu are rol de finanțe. */
  financeItems?: readonly FinanceItem[];
  /** VM5-13: ce s-a ales de cererile pe care destinatarul le-a aprobat. */
  updates?: readonly UpdateItem[];
  /** Linkul către inbox, absolut (din `appUrl()`). */
  inboxUrl: string;
  /** Linkul către coada de finanțe, absolut. */
  financeUrl?: string;
  /** Linkul unei cereri, absolut. */
  parUrl: (parId: string) => string;
  workspace?: string | null;
  toAddress?: string | null;
}): string {
  const items = sortDigestItems(params.items);
  const financeItems = [...(params.financeItems ?? [])].sort(
    (a, b) => Number(!!b.urgent) - Number(!!a.urgent) || b.waitingDays - a.waitingDays
  );
  const updates = params.updates ?? [];
  const lines: string[] = [];

  if (items.length) {
    lines.push(
      items.length === 1
        ? "O cerere așteaptă aprobarea ta:"
        : `${items.length} cereri așteaptă aprobarea ta:`,
      ""
    );
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
  }

  if (financeItems.length) {
    lines.push(
      financeItems.length === 1
        ? "O cerere e aprobată și așteaptă plata:"
        : `${financeItems.length} cereri sunt aprobate și așteaptă plata:`,
      ""
    );
    for (const item of financeItems) {
      lines.push(`• ${item.requestNo} — ${item.amountLabel}${item.urgent ? " (URGENT)" : ""}`);
      const detalii = [
        item.payeeName ? `către ${item.payeeName}` : null,
        `aprobată ${waitingLabel(item.waitingDays)}`,
      ].filter(Boolean);
      lines.push(`  ${detalii.join(" · ")}`);
      lines.push(`  ${params.parUrl(item.parId)}`);
      lines.push("");
    }
    if (params.financeUrl) {
      lines.push(`Deschide coada de plăți: ${params.financeUrl}`);
      lines.push("");
    }
  }

  if (updates.length) {
    lines.push("Ce s-a întâmplat cu cererile pe care le-ai aprobat:", "");
    for (const u of updates) {
      lines.push(`• ${u.text}`);
      lines.push(`  ${params.parUrl(u.parId)}`);
      lines.push("");
    }
  }

  lines.push(
    "Primești un singur email cu toate cererile, de două ori pe zi — la 09:00 și la 16:00. " +
      "Cererile marcate URGENT, respingerile și cererile de modificare îți vin în continuare imediat."
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
