/**
 * CRM-G02 — graficele rapoartelor, în stilul Google Analytics / Looker Studio.
 *
 * Ce s-a schimbat față de versiunea veche și de ce:
 *  · Un grafic combinat cu trei serii de bare, o linie și două axe devine UN grafic pe metrica
 *    aleasă din plăcuțele de sus (exact ca în Analytics: dai click pe „Vânzări", graficul arată
 *    vânzările). Două unități pe două axe nu se pot compara cu ochiul.
 *  · Perioada precedentă apare ca linie gri punctată pe aceeași axă — răspunsul la „urcăm sau
 *    coborâm?" fără să calculezi nimic.
 *  · Linie dreaptă între puncte, nu curbă „monotone": curba netezită cobora SUB zero între două
 *    zile cu vânzări, adică desena bani negativi.
 *  · Plat: fără gradient, fără colțuri rotunjite pe bare, grilă orizontală fină. Culorile vin din
 *    tokenii `--chart-*` (definiți în tema GM3), niciodată hex în componentă.
 */
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export type TrendSize = "day" | "week" | "month";

export interface TrendPoint {
  /** Începutul intervalului, ISO. */
  bucket: string;
  value: number | null;
  /** Valoarea din intervalul corespunzător al perioadei precedente (aliniat pe poziție). */
  previous?: number | null;
}

const PRIMARY = "hsl(var(--chart-1, 217 90% 43%))";
const WON = "hsl(var(--chart-2, 138 69% 25%))";
const LOST = "hsl(var(--chart-3, 3 71% 41%))";
const MUTED = "hsl(var(--muted-foreground))";
const GRID = "hsl(var(--chart-grid, var(--border)))";

/** „2026-09-14" → „14 sept." / „sept. 26", după cât de fin e tăiat graficul. */
export function bucketLabel(iso: string, size: TrendSize): string {
  const d = new Date(iso);
  if (size === "month") return d.toLocaleDateString("ro-MD", { month: "short", year: "2-digit" });
  return d.toLocaleDateString("ro-MD", { day: "2-digit", month: "short" });
}

const AXIS_TICK = { fontSize: 12, fill: MUTED };

export function TrendChart({
  points,
  size,
  format,
  label,
  showPrevious,
}: {
  points: TrendPoint[];
  size: TrendSize;
  format: (v: number) => string;
  /** Numele metricii — pentru tooltip și pentru cititoarele de ecran. */
  label: string;
  showPrevious: boolean;
}) {
  if (points.length === 0) {
    return <p className="py-16 text-center text-sm text-muted-foreground">Nicio mișcare în perioada aleasă.</p>;
  }
  const rows = points.map((p) => ({ label: bucketLabel(p.bucket, size), value: p.value, previous: p.previous ?? null }));

  return (
    <div role="img" aria-label={`Evoluția: ${label}`}>
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={rows} margin={{ top: 12, right: 12, left: 4, bottom: 0 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="label" tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: GRID }} minTickGap={16} />
          <YAxis
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={false}
            width={56}
            allowDecimals={false}
            tickFormatter={(v: number) => compact(v)}
          />
          <Tooltip
            contentStyle={{ fontSize: 12, borderRadius: 8, border: "none", boxShadow: "var(--shadow-md)" }}
            formatter={((value: number, name: string) => [
              value == null ? "—" : format(value),
              name === "previous" ? "Perioada precedentă" : label,
            ]) as never}
          />
          {showPrevious && (
            <Line
              type="linear"
              dataKey="previous"
              stroke={MUTED}
              strokeWidth={1.5}
              strokeDasharray="4 4"
              dot={false}
              connectNulls
              isAnimationActive={false}
            />
          )}
          <Line
            type="linear"
            dataKey="value"
            stroke={PRIMARY}
            strokeWidth={2}
            dot={rows.length <= 12 ? { r: 3, fill: PRIMARY, strokeWidth: 0 } : false}
            connectNulls
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export interface WonLostPoint {
  bucket: string;
  won: number;
  lost: number;
}

/** Câștigat față de pierdut, pe intervale — ce raport lipsea cu totul (pierderile n-aveau serie). */
export function WonLostChart({ points, size }: { points: WonLostPoint[]; size: TrendSize }) {
  if (points.every((p) => p.won === 0 && p.lost === 0)) {
    return <p className="py-12 text-center text-sm text-muted-foreground">Nicio afacere închisă în perioada aleasă.</p>;
  }
  const rows = points.map((p) => ({ label: bucketLabel(p.bucket, size), Câștigate: p.won, Pierdute: p.lost }));
  return (
    <div role="img" aria-label="Afaceri câștigate și pierdute în timp">
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={rows} margin={{ top: 8, right: 12, left: 4, bottom: 0 }} barGap={2}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="label" tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: GRID }} minTickGap={16} />
          <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} width={32} allowDecimals={false} />
          <Tooltip
            cursor={{ fill: "hsl(var(--muted))" }}
            contentStyle={{ fontSize: 12, borderRadius: 8, border: "none", boxShadow: "var(--shadow-md)" }}
          />
          <Bar dataKey="Câștigate" fill={WON} maxBarSize={18} isAnimationActive={false} />
          <Bar dataKey="Pierdute" fill={LOST} maxBarSize={18} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** 1.250.000 → „1,3 mil.", 48.000 → „48k" — pentru axe, unde contează ordinul de mărime. */
function compact(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `${(v / 1_000_000).toLocaleString("ro-MD", { maximumFractionDigits: 1 })} mil.`;
  if (abs >= 1_000) return `${Math.round(v / 1_000)}k`;
  return String(Math.round(v * 10) / 10);
}
