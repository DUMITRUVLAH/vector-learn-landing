/**
 * CASH-004: Donut chart alocat vs. nealocat pentru modulul încasări.
 *
 * Folosește Recharts PieChart (innerRadius = donut).
 * Tokens Vector 365 — zero hex hardcodat; culorile vin din CSS vars.
 * Funcționează în light și dark mode.
 */
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";

interface PaymentsDonutProps {
  allocatedCents: number;
  unallocatedCents: number;
  currency?: string;
}

/** Formatează cenți → "1.250,00 MDL" */
function fmt(cents: number, currency = "MDL"): string {
  return new Intl.NumberFormat("ro-MD", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(cents / 100);
}

/**
 * Tooltip personalizat (fără hex — culori din token vars nu sunt accesibile direct în
 * recharts Tooltip, deci folosim clase Tailwind pe containerul wrapping).
 */
function CustomTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; payload: { currency: string } }>;
}) {
  if (!active || !payload?.length) return null;
  const { name, value, payload: p } = payload[0];
  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 text-sm shadow-md">
      <p className="font-medium text-foreground">{name}</p>
      <p className="text-muted-foreground">{fmt(value, p.currency)}</p>
    </div>
  );
}

export function PaymentsDonut({
  allocatedCents,
  unallocatedCents,
  currency = "MDL",
}: PaymentsDonutProps) {
  const total = allocatedCents + unallocatedCents;

  const data = [
    { name: "Alocat", value: allocatedCents, currency },
    { name: "Nealocat", value: unallocatedCents, currency },
  ].filter((d) => d.value > 0); // Hide zero slices

  if (total === 0) {
    return (
      <div className="flex h-40 items-center justify-center rounded-xl border border-dashed border-border">
        <p className="text-sm text-muted-foreground">Fără plăți înregistrate</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <h2 className="mb-3 text-sm font-semibold text-foreground">Distribuție plăți</h2>

      <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
        {/* Donut */}
        <div className="h-40 w-40 shrink-0" role="img" aria-label="Grafic distribuție plăți">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                dataKey="value"
                nameKey="name"
                innerRadius={44}
                outerRadius={68}
                paddingAngle={2}
                startAngle={90}
                endAngle={-270}
              >
                {/* Culori token-based: hsl(var(--primary)) și hsl(var(--muted-foreground)) */}
                <Cell
                  key="allocated"
                  fill="hsl(var(--primary))"
                  stroke="hsl(var(--background))"
                  strokeWidth={2}
                />
                <Cell
                  key="unallocated"
                  fill="hsl(var(--muted-foreground) / 0.3)"
                  stroke="hsl(var(--background))"
                  strokeWidth={2}
                />
              </Pie>
              <Tooltip content={<CustomTooltip />} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Legend + totals */}
        <div className="flex flex-col gap-3 text-sm">
          <div className="flex items-center gap-2">
            <span
              className="inline-block h-3 w-3 rounded-full bg-primary"
              aria-hidden="true"
            />
            <div>
              <p className="text-xs text-muted-foreground">Alocat</p>
              <p className="font-semibold text-foreground">{fmt(allocatedCents, currency)}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span
              className="inline-block h-3 w-3 rounded-full bg-muted-foreground/30"
              aria-hidden="true"
            />
            <div>
              <p className="text-xs text-muted-foreground">Nealocat</p>
              <p className="font-semibold text-foreground">{fmt(unallocatedCents, currency)}</p>
            </div>
          </div>
          <div className="mt-1 border-t border-border pt-2">
            <p className="text-xs text-muted-foreground">Total</p>
            <p className="font-semibold text-foreground">{fmt(total, currency)}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
