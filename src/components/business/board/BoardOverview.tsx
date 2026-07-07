/**
 * TB-006: Prezentare manager — progres per produs, peste GET /api/board/overview.
 *
 * Forma (dataviz): bare ORIZONTALE stacked, un rând per produs, segmente = status
 * în ordinea Gata → În lucru → Blocate → De făcut (progresul se citește de la
 * stânga). O singură axă; marks subțiri; spacer de 2px între segmente (stroke pe
 * culoarea suprafeței); legendă prezentă (4 serii) cu text în tokeni de text;
 * tooltip la hover; TABELUL cu valori exacte de lângă grafic e „table view"-ul
 * cerut de validator (relief pentru contrast + CVD). Culorile: tokenii
 * --chart-* din index.css (trepte separate light/dark, validate).
 */
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
} from "recharts";
import { AlertCircle, UserX, Clock } from "lucide-react";
import type { ProductOverview } from "@/lib/api/boardOverview";
import { cn } from "@/lib/utils";

const SERIES = [
  { key: "done", label: "Gata", token: "var(--chart-done)" },
  { key: "inProgress", label: "În lucru", token: "var(--chart-inprog)" },
  { key: "blocked", label: "Blocate", token: "var(--chart-blocked)" },
  { key: "todo", label: "De făcut", token: "var(--chart-todo)" },
] as const;

interface BoardOverviewProps {
  overview: ProductOverview[];
}

export function BoardOverview({ overview }: BoardOverviewProps) {
  if (overview.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-card px-6 py-16 text-center">
        <p className="text-sm text-muted-foreground">
          Niciun task încă — progresul per produs apare aici după planificare.
        </p>
      </div>
    );
  }

  const chartData = overview.map((o) => ({
    name: o.productName,
    done: o.done,
    inProgress: o.inProgress,
    blocked: o.blocked,
    todo: o.todo,
  }));
  // Înălțime proporțională cu numărul de produse (bare subțiri, nu umplem ecranul).
  const chartHeight = Math.max(160, 48 + overview.length * 44);

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-border bg-card p-4">
        <h3 className="mb-1 text-sm font-semibold text-foreground">Progres per produs</h3>
        <p className="mb-3 text-xs text-muted-foreground">
          Taskuri pe status — valorile exacte sunt în tabelul de mai jos.
        </p>
        <ResponsiveContainer width="100%" height={chartHeight}>
          <BarChart data={chartData} layout="vertical" margin={{ top: 0, right: 16, bottom: 0, left: 8 }}>
            <XAxis
              type="number"
              allowDecimals={false}
              stroke="hsl(var(--muted-foreground))"
              tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
              axisLine={{ stroke: "hsl(var(--border))" }}
              tickLine={false}
            />
            <YAxis
              type="category"
              dataKey="name"
              width={150}
              stroke="hsl(var(--muted-foreground))"
              tick={{ fill: "hsl(var(--foreground))", fontSize: 12 }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              cursor={{ fill: "hsl(var(--muted) / 0.5)" }}
              contentStyle={{
                background: "hsl(var(--popover))",
                border: "1px solid hsl(var(--border))",
                borderRadius: "0.5rem",
                color: "hsl(var(--foreground))",
                fontSize: 12,
              }}
              labelStyle={{ color: "hsl(var(--foreground))", fontWeight: 600 }}
            />
            <Legend
              wrapperStyle={{ fontSize: 12, color: "hsl(var(--muted-foreground))" }}
              iconSize={10}
            />
            {SERIES.map((s) => (
              <Bar
                key={s.key}
                dataKey={s.key}
                name={s.label}
                stackId="status"
                fill={`hsl(${s.token})`}
                // Spacer de 2px între segmente: stroke pe culoarea suprafeței cardului.
                stroke="hsl(var(--card))"
                strokeWidth={2}
                barSize={20}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Table view — valorile exacte (și reliful de accesibilitate al graficului). */}
      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50 text-left">
              <th className="px-3 py-2.5 font-medium text-muted-foreground">Produs</th>
              <th className="px-3 py-2.5 text-right font-medium text-muted-foreground">Gata</th>
              <th className="px-3 py-2.5 text-right font-medium text-muted-foreground">În lucru</th>
              <th className="px-3 py-2.5 text-right font-medium text-muted-foreground">Blocate</th>
              <th className="px-3 py-2.5 text-right font-medium text-muted-foreground">De făcut</th>
              <th className="px-3 py-2.5 text-right font-medium text-muted-foreground">Progres</th>
              <th className="px-3 py-2.5 text-right font-medium text-muted-foreground">Întârziate</th>
              <th className="px-3 py-2.5 text-right font-medium text-muted-foreground">Fără owner</th>
            </tr>
          </thead>
          <tbody>
            {overview.map((o) => {
              const pct = o.total > 0 ? Math.round((o.done / o.total) * 100) : 0;
              return (
                <tr key={o.productId ?? "none"} className="border-b border-border last:border-0 hover:bg-muted/30">
                  <td className="px-3 py-2.5 font-medium text-foreground">{o.productName}</td>
                  <td className="px-3 py-2.5 text-right text-foreground">{o.done}</td>
                  <td className="px-3 py-2.5 text-right text-foreground">{o.inProgress}</td>
                  <td className="px-3 py-2.5 text-right text-foreground">{o.blocked}</td>
                  <td className="px-3 py-2.5 text-right text-foreground">{o.todo}</td>
                  <td className="px-3 py-2.5 text-right">
                    <span className="inline-flex items-center gap-2">
                      <span
                        className="h-1.5 w-16 overflow-hidden rounded-full bg-muted"
                        aria-hidden="true"
                      >
                        <span
                          className="block h-full rounded-full bg-success"
                          style={{ width: `${pct}%` }}
                        />
                      </span>
                      <span className="w-9 text-right tabular-nums text-foreground">{pct}%</span>
                    </span>
                  </td>
                  <td
                    className={cn(
                      "px-3 py-2.5 text-right tabular-nums",
                      o.overdue > 0 ? "font-semibold text-destructive" : "text-muted-foreground"
                    )}
                  >
                    {o.overdue > 0 && <Clock className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />}
                    {o.overdue}
                  </td>
                  <td
                    className={cn(
                      "px-3 py-2.5 text-right tabular-nums",
                      o.unassigned > 0 ? "font-medium text-warning" : "text-muted-foreground"
                    )}
                  >
                    {o.unassigned > 0 && <UserX className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />}
                    {o.unassigned}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        „Întârziate" = termen depășit și ne-Gata; „Fără owner" = fără persoană și fără rol, ne-Gata.
      </p>
    </div>
  );
}
