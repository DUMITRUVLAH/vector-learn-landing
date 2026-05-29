import { Clock, AlertTriangle, CreditCard, UserX, Megaphone } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ROIBreakdownItem {
  label: string;
  amount: number;
  icon: React.ComponentType<{ className?: string }>;
  pastel: string;
  explainer: string;
}

interface ROIBreakdownProps {
  items: ROIBreakdownItem[];
  currency: "EUR" | "RON";
}

function format(amount: number, currency: "EUR" | "RON"): string {
  return new Intl.NumberFormat("ro-RO", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function ROIBreakdown({ items, currency }: ROIBreakdownProps) {
  const total = items.reduce((s, i) => s + i.amount, 0);
  return (
    <div className="space-y-3">
      {items.map((item) => {
        const Icon = item.icon;
        const pct = total > 0 ? (item.amount / total) * 100 : 0;
        return (
          <article key={item.label} className="rounded-xl border border-border bg-card p-4 card-hover">
            <div className="flex items-center gap-3">
              <div className={cn("rounded-lg p-2.5 flex-shrink-0", item.pastel)}>
                <Icon className="h-4 w-4 text-foreground/80" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline justify-between gap-2 mb-1">
                  <p className="text-sm font-semibold truncate">{item.label}</p>
                  <p className="text-sm font-display font-bold tabular-nums">{format(item.amount, currency)}</p>
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed">{item.explainer}</p>
                <div className="mt-2 h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-primary to-accent"
                    style={{ width: `${pct}%` }}
                    aria-label={`${item.label}: ${pct.toFixed(0)}% din total`}
                  />
                </div>
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}

export const ROI_ICONS = {
  time: Clock,
  noShow: AlertTriangle,
  payments: CreditCard,
  churn: UserX,
  marketing: Megaphone,
};
