/**
 * NAV-05: regula de urgență de pe ecranul de start FinDesk — ce ajunge în „De făcut acum" și în ce
 * ordine. Stă separat de pagină ca să poată fi testată fără DOM.
 */
import { OBLIGATION_TYPE_LABELS, type FinObligation } from "@/lib/api/finCalendar";
import { formatFinMoney } from "@/lib/api/finInvoices";
import type { FinAgingResponse } from "@/lib/api/finInsight";

/** Câte zile înainte începe un termen fiscal să fie „de făcut acum". */
export const DUE_SOON_DAYS = 14;

/** Data de azi ca YYYY-MM-DD, în fusul local — termenele fiscale sunt date, nu momente. */
export function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d + days);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

export function formatDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}.${m}.${y}`;
}

export function obligationLabel(o: FinObligation): string {
  return o.description?.trim() || OBLIGATION_TYPE_LABELS[o.obligationType] || o.obligationType;
}

export interface FinTodo {
  key: string;
  tone: "danger" | "warning";
  title: string;
  detail: string;
  href: string;
}

/**
 * Lista „De făcut acum", ordonată după urgență: întâi ce e deja depășit, apoi ce vine.
 * Exportată pentru teste — regula de urgență e logica paginii, nu markup-ul ei.
 */
export function buildTodos(opts: {
  obligations: FinObligation[] | null;
  aging: FinAgingResponse["aging"] | null;
  today: string;
}): FinTodo[] {
  const todos: FinTodo[] = [];
  const open = (opts.obligations ?? []).filter((o) => o.status !== "paid");
  const soonLimit = addDaysIso(opts.today, DUE_SOON_DAYS);

  for (const o of open.filter((o) => o.dueDate.slice(0, 10) < opts.today)) {
    todos.push({
      key: `late-${o.id}`,
      tone: "danger",
      title: `${obligationLabel(o)} — termen depășit`,
      detail: `Scadent pe ${formatDate(o.dueDate)} · ${formatFinMoney(o.amountCents, o.currency)}`,
      href: "/business/fin/calendar",
    });
  }
  if (opts.aging && opts.aging.total > 0) {
    const over30 = opts.aging["31_60"] + opts.aging["61_90"] + opts.aging["90_plus"];
    todos.push({
      key: "invoices-overdue",
      tone: over30 > 0 ? "danger" : "warning",
      title: `Facturi restante: ${formatFinMoney(opts.aging.total)}`,
      detail: over30 > 0 ? `${formatFinMoney(over30)} sunt restante de peste 30 de zile` : "Toate sub 30 de zile — un reminder acum le încasează mai repede",
      href: "/business/fin/invoices",
    });
  }
  for (const o of open.filter((o) => {
    const due = o.dueDate.slice(0, 10);
    return due >= opts.today && due <= soonLimit;
  })) {
    todos.push({
      key: `soon-${o.id}`,
      tone: "warning",
      title: obligationLabel(o),
      detail: `Termen ${formatDate(o.dueDate)} · ${formatFinMoney(o.amountCents, o.currency)}`,
      href: "/business/fin/calendar",
    });
  }
  return todos;
}

/** Primul termen neplătit, de azi încolo — cifra „Următorul termen". */
export function nextDeadline(obligations: FinObligation[], today: string): FinObligation | null {
  return obligations
    .filter((o) => o.status !== "paid" && o.dueDate.slice(0, 10) >= today)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0] ?? null;
}
