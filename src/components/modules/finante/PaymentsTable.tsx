import { useMemo, useState } from "react";
import { Search, Download, Filter } from "lucide-react";
import { cn } from "@/lib/utils";

type PaymentStatus = "paid" | "pending" | "overdue" | "refunded";
type Period = "all" | "7d" | "30d" | "90d";

interface Payment {
  id: string;
  date: string;
  daysAgo: number;
  student: string;
  course: string;
  amount: number;
  method: "card" | "qr" | "transfer" | "cash";
  status: PaymentStatus;
}

const PAYMENTS: Payment[] = [
  { id: "INV-2026-0142", date: "28 mai", daysAgo: 1, student: "Maria Popescu", course: "Engleză B2", amount: 280, method: "card", status: "paid" },
  { id: "INV-2026-0141", date: "27 mai", daysAgo: 2, student: "Andrei Ionescu", course: "Python avansat", amount: 420, method: "card", status: "paid" },
  { id: "INV-2026-0140", date: "26 mai", daysAgo: 3, student: "Elena Vasilescu", course: "Pian — lecții individuale", amount: 600, method: "transfer", status: "paid" },
  { id: "INV-2026-0139", date: "25 mai", daysAgo: 4, student: "Mihai Stoica", course: "Robotică începători", amount: 320, method: "qr", status: "pending" },
  { id: "INV-2026-0138", date: "24 mai", daysAgo: 5, student: "Ana Dumitrescu", course: "Spaniolă A2", amount: 240, method: "card", status: "paid" },
  { id: "INV-2026-0137", date: "22 mai", daysAgo: 7, student: "Radu Constantin", course: "Engleză B2", amount: 280, method: "card", status: "overdue" },
  { id: "INV-2026-0136", date: "15 mai", daysAgo: 14, student: "Cristina Mitran", course: "Franceză A1", amount: 220, method: "transfer", status: "paid" },
  { id: "INV-2026-0135", date: "08 mai", daysAgo: 21, student: "Sergiu Popa", course: "Vioară", amount: 480, method: "cash", status: "paid" },
  { id: "INV-2026-0134", date: "02 mai", daysAgo: 27, student: "Ioana Răducanu", course: "Programare web", amount: 380, method: "card", status: "refunded" },
  { id: "INV-2026-0133", date: "12 apr", daysAgo: 47, student: "Vlad Anghel", course: "Pregătire BAC", amount: 350, method: "card", status: "paid" },
];

const STATUS_META: Record<PaymentStatus, { label: string; bg: string; text: string }> = {
  paid: { label: "Plătit", bg: "bg-success/10", text: "text-success" },
  pending: { label: "În așteptare", bg: "bg-warning/10", text: "text-warning" },
  overdue: { label: "Restant", bg: "bg-destructive/10", text: "text-destructive" },
  refunded: { label: "Returnat", bg: "bg-muted", text: "text-muted-foreground" },
};

const PERIOD_DAYS: Record<Period, number | null> = {
  all: null,
  "7d": 7,
  "30d": 30,
  "90d": 90,
};

export function filterPayments(
  payments: ReadonlyArray<Payment>,
  status: PaymentStatus | "all",
  period: Period,
  query: string
): Payment[] {
  const days = PERIOD_DAYS[period];
  const q = query.trim().toLowerCase();
  return payments.filter((p) => {
    if (status !== "all" && p.status !== status) return false;
    if (days !== null && p.daysAgo > days) return false;
    if (q && !p.student.toLowerCase().includes(q) && !p.course.toLowerCase().includes(q) && !p.id.toLowerCase().includes(q)) {
      return false;
    }
    return true;
  });
}

const STATUS_OPTIONS: Array<{ value: PaymentStatus | "all"; label: string }> = [
  { value: "all", label: "Toate" },
  { value: "paid", label: "Plătite" },
  { value: "pending", label: "În așteptare" },
  { value: "overdue", label: "Restante" },
];

const PERIOD_OPTIONS: Array<{ value: Period; label: string }> = [
  { value: "7d", label: "7 zile" },
  { value: "30d", label: "30 zile" },
  { value: "90d", label: "90 zile" },
  { value: "all", label: "Tot" },
];

export function PaymentsTable() {
  const [status, setStatus] = useState<PaymentStatus | "all">("all");
  const [period, setPeriod] = useState<Period>("30d");
  const [query, setQuery] = useState("");

  const filtered = useMemo(
    () => filterPayments(PAYMENTS, status, period, query),
    [status, period, query]
  );

  const totalAmount = filtered.reduce((sum, p) => sum + (p.status === "refunded" ? 0 : p.amount), 0);

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-md">
      <div className="border-b border-border bg-muted/30 p-4 sm:p-5">
        <div className="flex flex-col gap-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h3 className="text-base font-bold">Plăți recente</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                <span data-testid="payments-count" className="font-semibold text-foreground">
                  {filtered.length}
                </span>{" "}
                plăți afișate · Total{" "}
                <span className="font-semibold text-foreground">
                  {new Intl.NumberFormat("ro-RO", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(totalAmount)}
                </span>
              </p>
            </div>
            <button
              type="button"
              className="inline-flex items-center justify-center gap-1.5 rounded-md border border-border bg-card px-3 py-2 text-xs font-semibold text-foreground hover:bg-muted transition-colors self-start"
            >
              <Download className="h-3.5 w-3.5" />
              Export Excel
            </button>
          </div>

          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1 min-w-0">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Caută după elev, curs sau ID factură…"
                aria-label="Caută plăți"
                className="w-full rounded-md border border-input bg-background pl-9 pr-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
              />
            </div>
            <div className="flex items-center gap-1.5 rounded-md border border-input bg-background p-1">
              <Filter className="h-3.5 w-3.5 text-muted-foreground ml-1.5" aria-hidden />
              {PERIOD_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setPeriod(opt.value)}
                  className={cn(
                    "px-2.5 py-1 text-xs font-semibold rounded transition-colors",
                    period === opt.value
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                  aria-pressed={period === opt.value}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mr-1">
              Status:
            </span>
            {STATUS_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setStatus(opt.value)}
                className={cn(
                  "rounded-full px-3 py-1 text-xs font-semibold transition-all",
                  status === opt.value
                    ? "bg-foreground text-background"
                    : "bg-muted text-muted-foreground hover:bg-muted/70"
                )}
                aria-pressed={status === opt.value}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/20">
              <th scope="col" className="text-left text-[10px] font-semibold uppercase tracking-wide text-muted-foreground px-4 py-2.5">
                Factură
              </th>
              <th scope="col" className="text-left text-[10px] font-semibold uppercase tracking-wide text-muted-foreground px-4 py-2.5">
                Elev / Curs
              </th>
              <th scope="col" className="text-left text-[10px] font-semibold uppercase tracking-wide text-muted-foreground px-4 py-2.5 hidden sm:table-cell">
                Data
              </th>
              <th scope="col" className="text-right text-[10px] font-semibold uppercase tracking-wide text-muted-foreground px-4 py-2.5">
                Sumă
              </th>
              <th scope="col" className="text-right text-[10px] font-semibold uppercase tracking-wide text-muted-foreground px-4 py-2.5">
                Status
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center text-sm text-muted-foreground">
                  Nicio plată găsită pentru filtrele selectate.
                </td>
              </tr>
            )}
            {filtered.map((p) => {
              const meta = STATUS_META[p.status];
              return (
                <tr key={p.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{p.id}</td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-foreground">{p.student}</p>
                    <p className="text-xs text-muted-foreground truncate max-w-[200px]">{p.course}</p>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell">{p.date}</td>
                  <td className="px-4 py-3 text-right font-semibold tabular-nums">
                    {new Intl.NumberFormat("ro-RO", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(p.amount)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold", meta.bg, meta.text)}>
                      {meta.label}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
