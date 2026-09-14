/**
 * CRM — graficele din ecranul de rapoarte (cerința 50: „dashboard", nu tabel).
 *
 * Trei imagini care răspund la trei întrebări: cum a evoluat perioada, unde se pierd leadurile
 * între etape, și din ce motive. Restul rămâne în tabele — un grafic pentru date pe care oricum
 * le citești rând cu rând e decor.
 *
 * Recharts e deja în dependențe (folosit de FIN și PAR); culorile vin din tokenii design
 * system-ului, nu din hex scris în componentă.
 */
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  ComposedChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { CrmConversionRow, CrmLostReasonRow, CrmTimelineBucket } from "@/lib/api/crmReports";

/** Paleta pastel a produsului, în ordinea în care se consumă. */
const SERIES = ["hsl(var(--chart-1, 217 91% 60%))", "hsl(var(--chart-2, 152 55% 45%))", "hsl(var(--chart-3, 32 95% 55%))"];
const LOST_COLORS = [
  "hsl(var(--chart-3, 32 95% 55%))",
  "hsl(var(--chart-4, 350 75% 60%))",
  "hsl(var(--chart-5, 262 60% 60%))",
  "hsl(var(--chart-1, 217 91% 60%))",
  "hsl(var(--chart-2, 152 55% 45%))",
];

function money(cents: number): string {
  const v = (cents ?? 0) / 100;
  return v >= 1000 ? `${Math.round(v / 1000)}k` : String(Math.round(v));
}

/** „2026-09-14" → „14 sept." / „sept. 2026", după cât de fin e tăiat graficul. */
function bucketLabel(iso: string, size: "day" | "week" | "month"): string {
  const d = new Date(iso);
  if (size === "month") return d.toLocaleDateString("ro-MD", { month: "short", year: "2-digit" });
  return d.toLocaleDateString("ro-MD", { day: "2-digit", month: "short" });
}

export function TimelineChart({
  data,
  size,
}: {
  data: CrmTimelineBucket[];
  size: "day" | "week" | "month";
}) {
  if (data.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">Nicio mișcare în perioada aleasă.</p>;
  }
  const rows = data.map((b) => ({
    label: bucketLabel(b.bucket, size),
    Leaduri: b.leadsCreated,
    Oferte: b.offersSent,
    Contracte: b.contractsSigned,
    valoare: b.salesValueCents / 100,
  }));

  return (
    <ResponsiveContainer width="100%" height={260}>
      {/* Barele numără evenimente, linia arată banii — două unități diferite, deci două axe.
          Pe o singură axă, valoarea în lei ar strivi barele până la invizibil. */}
      <ComposedChart data={rows} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 11 }} className="fill-muted-foreground" />
        <YAxis yAxisId="left" tick={{ fontSize: 11 }} allowDecimals={false} className="fill-muted-foreground" />
        <YAxis
          yAxisId="right"
          orientation="right"
          tick={{ fontSize: 11 }}
          tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))}
          className="fill-muted-foreground"
        />
        <Tooltip
          contentStyle={{ fontSize: 12, borderRadius: 8 }}
          formatter={((value: number, name: string) =>
            name === "valoare" ? [value.toLocaleString("ro-MD"), "Valoare (MDL)"] : [value, name]) as never}
        />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        <Bar yAxisId="left" dataKey="Leaduri" fill={SERIES[0]} radius={[3, 3, 0, 0]} />
        <Bar yAxisId="left" dataKey="Oferte" fill={SERIES[2]} radius={[3, 3, 0, 0]} />
        <Bar yAxisId="left" dataKey="Contracte" fill={SERIES[1]} radius={[3, 3, 0, 0]} />
        <Line yAxisId="right" type="monotone" dataKey="valoare" stroke={SERIES[1]} strokeWidth={2} dot={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

export function ConversionChart({ rows }: { rows: CrmConversionRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        Nicio tranziție între etape în perioada aleasă.
      </p>
    );
  }
  const data = rows.map((r) => ({
    label: `${r.fromLabel} → ${r.toLabel}`,
    Ajunse: r.reached,
    Avansate: r.advanced,
    pct: r.conversionPct,
  }));

  return (
    <ResponsiveContainer width="100%" height={Math.max(180, data.length * 52)}>
      {/* Orizontal: etichetele de etapă sunt fraze („Ofertă transmisă → Negociere"), iar pe
          verticală s-ar suprapune. */}
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 40, left: 8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-border" horizontal={false} />
        <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} className="fill-muted-foreground" />
        <YAxis type="category" dataKey="label" width={170} tick={{ fontSize: 11 }} className="fill-muted-foreground" />
        <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        <Bar dataKey="Ajunse" fill={SERIES[0]} radius={[0, 3, 3, 0]} />
        <Bar dataKey="Avansate" fill={SERIES[1]} radius={[0, 3, 3, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function LostReasonsChart({ rows }: { rows: CrmLostReasonRow[] }) {
  if (rows.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">Niciun lead pierdut în perioada aleasă.</p>;
  }
  const data = rows.slice(0, 6).map((r) => ({ label: r.reason, Leaduri: r.count, valoare: r.valueCents }));

  return (
    <ResponsiveContainer width="100%" height={Math.max(180, data.length * 46)}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 40, left: 8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-border" horizontal={false} />
        <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} className="fill-muted-foreground" />
        <YAxis type="category" dataKey="label" width={170} tick={{ fontSize: 11 }} className="fill-muted-foreground" />
        <Tooltip
          contentStyle={{ fontSize: 12, borderRadius: 8 }}
          formatter={((value: number, name: string, item: { payload?: { valoare?: number } }) =>
            name === "Leaduri"
              ? [`${value} · ${money(item.payload?.valoare ?? 0)} MDL pierduți`, "Leaduri"]
              : [value, name]) as never}
        />
        <Bar dataKey="Leaduri" radius={[0, 3, 3, 0]}>
          {data.map((_, i) => (
            <Cell key={i} fill={LOST_COLORS[i % LOST_COLORS.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
