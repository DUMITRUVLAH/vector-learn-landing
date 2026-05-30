import { CalendarDays, Pause, Play, X as Cancel } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Subscription, SubscriptionStatus } from "@/lib/api/invoices";

interface SubscriptionTableProps {
  items: Subscription[];
  onStatusChange: (id: string, status: SubscriptionStatus) => void;
}

const STATUS_META: Record<SubscriptionStatus, { label: string; cls: string }> = {
  active: { label: "Activ", cls: "bg-success/15 text-success" },
  paused: { label: "Pausat", cls: "bg-warning/15 text-warning" },
  cancelled: { label: "Anulat", cls: "bg-muted text-muted-foreground" },
};

function formatCurrency(cents: number, currency: string): string {
  return new Intl.NumberFormat("ro-RO", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

export function SubscriptionTable({ items, onStatusChange }: SubscriptionTableProps) {
  if (items.length === 0) {
    return (
      <div className="py-14 text-center">
        <CalendarDays className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" aria-hidden="true" />
        <p className="text-sm text-muted-foreground">Niciun abonament activ.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/20">
            <th scope="col" className="text-left text-[10px] font-semibold uppercase tracking-wide text-muted-foreground px-4 py-2.5">
              Elev
            </th>
            <th scope="col" className="text-right text-[10px] font-semibold uppercase tracking-wide text-muted-foreground px-4 py-2.5">
              Sumă / lună
            </th>
            <th scope="col" className="text-center text-[10px] font-semibold uppercase tracking-wide text-muted-foreground px-4 py-2.5 hidden md:table-cell">
              Zi facturare
            </th>
            <th scope="col" className="text-left text-[10px] font-semibold uppercase tracking-wide text-muted-foreground px-4 py-2.5 hidden md:table-cell">
              Urm. factură
            </th>
            <th scope="col" className="text-left text-[10px] font-semibold uppercase tracking-wide text-muted-foreground px-4 py-2.5">
              Status
            </th>
            <th scope="col" className="text-right text-[10px] font-semibold uppercase tracking-wide text-muted-foreground px-4 py-2.5">
              Acțiuni
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {items.map((sub) => {
            const meta = STATUS_META[sub.status];
            return (
              <tr key={sub.id} className="hover:bg-muted/30">
                <td className="px-4 py-3 font-medium">
                  <span>{sub.studentName}</span>
                  {sub.description && (
                    <span className="block text-xs text-muted-foreground mt-0.5">{sub.description}</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right font-semibold tabular-nums">
                  {formatCurrency(sub.amountCents, sub.currency)}
                </td>
                <td className="px-4 py-3 text-center text-muted-foreground hidden md:table-cell">
                  {sub.billingDay}
                </td>
                <td className="px-4 py-3 text-xs text-muted-foreground hidden md:table-cell">
                  {sub.nextBillingDate}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={cn(
                      "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold",
                      meta.cls
                    )}
                  >
                    {meta.label}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="inline-flex gap-1.5 items-center">
                    {sub.status === "active" && (
                      <button
                        type="button"
                        onClick={() => onStatusChange(sub.id, "paused")}
                        aria-label={`Pausează abonament ${sub.studentName}`}
                        className="inline-flex items-center gap-1 rounded-md bg-warning/10 text-warning px-2 py-1 text-[11px] font-semibold hover:bg-warning/20"
                      >
                        <Pause className="h-3 w-3" aria-hidden="true" />
                        Pauză
                      </button>
                    )}
                    {sub.status === "paused" && (
                      <button
                        type="button"
                        onClick={() => onStatusChange(sub.id, "active")}
                        aria-label={`Reactivează abonament ${sub.studentName}`}
                        className="inline-flex items-center gap-1 rounded-md bg-success/10 text-success px-2 py-1 text-[11px] font-semibold hover:bg-success/20"
                      >
                        <Play className="h-3 w-3" aria-hidden="true" />
                        Activează
                      </button>
                    )}
                    {sub.status !== "cancelled" && (
                      <button
                        type="button"
                        onClick={() => onStatusChange(sub.id, "cancelled")}
                        aria-label={`Anulează abonament ${sub.studentName}`}
                        className="inline-flex items-center gap-1 rounded-md bg-destructive/10 text-destructive px-2 py-1 text-[11px] font-semibold hover:bg-destructive/20"
                      >
                        <Cancel className="h-3 w-3" aria-hidden="true" />
                        Anulează
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
