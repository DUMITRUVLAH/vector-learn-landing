/**
 * CRM — pâlnia desenată ca PÂLNIE.
 *
 * Prima versiune a fost o listă de rânduri cu bare: se citea ca un tabel, iar benzile colorate nu
 * se vedeau deloc, fiindcă foloseau clase inventate (`bg-pastel-sky`) pe care Tailwind nu le
 * generează — culoarea etapelor trăiește în `.pastel-sky` (utilitar din `index.css`), nu într-o
 * clasă `bg-*`. Rezultatul: etichete tăiate („Or…", „Conclus…") peste un dreptunghi alb.
 *
 * Acum e un desen adevărat, în SVG:
 *  - fiecare etapă e un TRAPEZ a cărui lățime de sus e „câți au ajuns aici" și de jos „câți au
 *    mers mai departe" — adică panta benzii ESTE rata de cădere, se vede fără să citești procentul;
 *  - culoarea vine din tokenii etapei (`--pastel-*`), deci merge și pe tema închisă;
 *  - banii stau în stânga, căderea în dreapta, aliniate la centrul benzii;
 *  - eticheta intră în bandă cât timp încape; când banda e prea îngustă, iese lângă ea, în loc să
 *    fie tăiată cu „…" — un nume de etapă tăiat e exact informația pentru care te uiți pe ecran.
 *
 * De ce SVG și nu o bibliotecă de grafice: o pâlnie e un desen de șapte poligoane. Recharts ar fi
 * adus ~40 KB și ar fi mutat cifrele într-un tooltip, adică unde nu se pot citi dintr-o privire,
 * nici tipări. Iar `viewBox` scalează desenul pe orice lățime, fără media queries.
 *
 * Accesibilitate: desenul e `aria-hidden`, iar sub el stă aceeași pâlnie ca LISTĂ pentru
 * cititoarele de ecran (`sr-only`). Culoarea nu poartă singură nicio informație: fiecare bandă
 * are numărul și procentul scrise lângă ea.
 */
import type { CrmFunnelStageRow } from "@/lib/api/crmFunnel";
import { cn } from "@/lib/utils";

/** Tokenii de culoare ai etapelor — aceiași ca pe tablă, citiți ca variabile CSS. */
const STAGE_TOKEN: Record<string, string> = {
  sky: "--pastel-sky",
  lavender: "--pastel-lavender",
  peach: "--pastel-peach",
  mint: "--pastel-mint",
  rose: "--pastel-rose",
  lemon: "--pastel-lemon",
  teal: "--pastel-teal",
};

const fill = (color: string | null) => `hsl(var(${STAGE_TOKEN[color ?? "sky"] ?? STAGE_TOKEN.sky}))`;
const ink = (color: string | null) =>
  `hsl(var(${(STAGE_TOKEN[color ?? "sky"] ?? STAGE_TOKEN.sky) + "-fg"}))`;

export function money(cents: number): string {
  return new Intl.NumberFormat("ro-MD", { maximumFractionDigits: 0 }).format(Math.round(cents / 100));
}

export interface FunnelChartProps {
  stages: CrmFunnelStageRow[];
  /** Titlul, pentru cititoarele de ecran (ex. „Pâlnia Anei"). */
  label: string;
  /** Varianta strânsă, pentru pâlniile per agent afișate două pe rând. */
  compact?: boolean;
}

/**
 * Geometria, în unități de `viewBox` — nu pixeli: SVG-ul se scalează singur la lățimea cardului.
 *
 * De aceea cele două variante au `viewBox`-uri DIFERITE, nu doar fonturi mai mici: pâlnia unui
 * agent stă într-un card de ~350px, iar un `viewBox` de 1000 s-ar strânge la 0,35 — un text de 15
 * ar ajunge la 5px, ilizibil. Varianta strânsă desenează pe o pânză de 480, deci textul rămâne
 * citibil după scalare. (Exact greșeala din prima versiune.)
 */
const GEOM = {
  full: { viewW: 1000, gutL: 150, gutR: 150, rowH: 62, gap: 4, headH: 26, minW: 56 },
  compact: { viewW: 480, gutL: 16, gutR: 74, rowH: 40, gap: 3, headH: 0, minW: 34 },
} as const;

export function FunnelChart({ stages, label, compact = false }: FunnelChartProps) {
  const chain = stages.filter((s) => !s.isLost);
  const lost = stages.filter((s) => s.isLost);

  /** Capetele de coloană intră ÎN desen, nu deasupra lui în HTML: doar așa rămân aliniate cu
   *  cifrele, pe orice lățime de ecran. */
  const g = compact ? GEOM.compact : GEOM.full;
  const { rowH, gap, headH } = g;
  const VIEW_W = g.viewW;
  const GUT_L = g.gutL;
  const GUT_R = g.gutR;
  const CENTER = VIEW_W / 2;
  const MAX_W = VIEW_W - GUT_L - GUT_R - (compact ? 10 : 40);
  const MIN_W = g.minW;
  const height = Math.max(rowH, chain.length * (rowH + gap)) + headH;

  // Lățimea se raportează la PRIMA etapă: pâlnia trebuie să înceapă plină și să se îngusteze.
  // `Math.max(1, …)` ține la distanță împărțirea la zero pe un segment gol.
  const base = Math.max(1, chain[0]?.reached ?? 1);
  const widthFor = (reached: number) => {
    const raw = (Math.max(0, reached) / base) * MAX_W;
    return Math.max(MIN_W, Math.min(MAX_W, raw));
  };

  return (
    <div className="flex flex-col gap-2">
      <svg
        viewBox={`0 0 ${VIEW_W} ${height}`}
        className="w-full"
        style={{ maxHeight: compact ? 260 : 460 }}
        role="img"
        aria-hidden="true"
        preserveAspectRatio="xMidYMid meet"
      >
        {!compact && (
          <g>
            <text x={GUT_L - 16} y={12} textAnchor="end" fontSize={13} fill="hsl(var(--muted-foreground))">
              Bani în etapă
            </text>
            <text x={CENTER} y={12} textAnchor="middle" fontSize={13} fill="hsl(var(--muted-foreground))">
              Etapa · câte oportunități au ajuns aici
            </text>
            <text x={VIEW_W - GUT_R + 16} y={12} textAnchor="start" fontSize={13} fill="hsl(var(--muted-foreground))">
              Cădere
            </text>
          </g>
        )}

        {chain.map((stage, i) => {
          const y = headH + i * (rowH + gap);
          const top = widthFor(stage.reached);
          // Baza trapezului = câți merg mai departe. Ultima verigă (câștigat) rămâne dreaptă:
          // ce a ajuns acolo a ajuns, deci n-are pantă de cădere.
          const nextReached = i + 1 < chain.length ? chain[i + 1].reached : stage.reached;
          const bottom = widthFor(nextReached);
          const midY = y + rowH / 2;

          const path = [
            `M ${CENTER - top / 2} ${y}`,
            `L ${CENTER + top / 2} ${y}`,
            `L ${CENTER + bottom / 2} ${y + rowH}`,
            `L ${CENTER - bottom / 2} ${y + rowH}`,
            "Z",
          ].join(" ");

          /**
           * Unde scriem eticheta. În varianta LARGĂ, iese lângă bandă când banda e prea îngustă —
           * are loc, gutierele sunt departe. În varianta STRÂNSĂ rămâne mereu pe axa pâlniei:
           * scoasă în lateral, intra peste coloana de cădere („Negotiation" peste „−50%").
           * Când banda e mai îngustă decât textul, culoarea trece pe `foreground`, fiindcă textul
           * stă atunci pe fundalul cardului, nu pe banda colorată.
           */
          const fitsInBand = top > (compact ? 200 : 190);
          const inside = compact ? true : fitsInBand;
          const labelX = inside ? CENTER : CENTER + top / 2 + 12;
          const labelInk = fitsInBand ? ink(stage.color) : "hsl(var(--foreground))";

          return (
            <g key={stage.key}>
              <path d={path} fill={fill(stage.color)} />
              <text
                x={labelX}
                y={midY - 2}
                textAnchor={inside ? "middle" : "start"}
                dominantBaseline="middle"
                fontSize={compact ? 19 : 17}
                fontWeight={600}
                fill={labelInk}
              >
                {stage.label}
              </text>
              <text
                x={labelX}
                y={midY + (compact ? 15 : 18)}
                textAnchor={inside ? "middle" : "start"}
                dominantBaseline="middle"
                fontSize={compact ? 15 : 14}
                fill={fitsInBand ? ink(stage.color) : "hsl(var(--muted-foreground))"}
                opacity={0.85}
              >
                {compact
                  ? // „8 · 0" se citea ca o greșeală: zero înseamnă că nimeni nu mai STĂ în etapă
                    // (toți au avansat), nu că valoarea s-a pierdut. Fără bani de arătat, arătăm
                    // doar câți au trecut pe acolo.
                    stage.currentValueCents > 0
                    ? `${stage.reached} · ${money(stage.currentValueCents)}`
                    : `${stage.reached} au trecut`
                  : `${stage.reached} ${stage.reached === 1 ? "oportunitate" : "oportunități"}${
                      stage.currentCount !== stage.reached ? ` · ${stage.currentCount} acum aici` : ""
                    }`}
              </text>

              {/* Stânga: banii care stau ACUM în etapă. În varianta strânsă nu există coloană de
                  bani — suma etapei stă lângă numărul de oportunități, iar totalul agentului e pe
                  insigna cardului. Trei coloane pe 350px n-ar încăpea fără să se taie ceva. */}
              {!compact && (
              <text
                x={GUT_L - 16}
                y={midY - 7}
                textAnchor="end"
                dominantBaseline="middle"
                fontSize={compact ? 15 : 18}
                fontWeight={700}
                fill="hsl(var(--foreground))"
              >
                {money(stage.currentValueCents)}
              </text>
              )}
              {!compact && (
                <text
                  x={GUT_L - 16}
                  y={midY + 14}
                  textAnchor="end"
                  dominantBaseline="middle"
                  fontSize={13}
                  fill="hsl(var(--muted-foreground))"
                >
                  ponderat {money(stage.weightedValueCents)}
                </text>
              )}

              {/* Dreapta: câți s-au oprit aici. */}
              {!stage.isWon && (
                <>
                  <text
                    x={VIEW_W - GUT_R + 16}
                    y={midY}
                    textAnchor="start"
                    dominantBaseline="middle"
                    fontSize={compact ? 17 : 18}
                    fontWeight={700}
                    fill={stage.dropRatePct >= 70 ? "hsl(var(--destructive))" : "hsl(var(--foreground))"}
                  >
                    {/* „−0%" arată ca o eroare; zero cădere se scrie simplu. */}
                    {stage.dropRatePct === 0 ? "0%" : `−${stage.dropRatePct}%`}
                  </text>
                  {!compact && (
                    <text
                      x={VIEW_W - GUT_R + 16}
                      y={midY + 14}
                      textAnchor="start"
                      dominantBaseline="middle"
                      fontSize={13}
                      fill="hsl(var(--muted-foreground))"
                    >
                      {stage.dropped} s-au oprit
                    </text>
                  )}
                </>
              )}
            </g>
          );
        })}
      </svg>

      {/* Pierdutele: un rezultat, nu o verigă a pâlniei — de aceea sub desen, nu în el. */}
      {lost.map((stage) => (
        <div
          key={stage.key}
          className={cn(
            "flex items-center justify-between gap-3 rounded-lg border border-border px-3",
            compact ? "py-1.5" : "py-2"
          )}
        >
          <span className="flex items-center gap-2 text-sm">
            <span
              className="inline-block h-3 w-3 shrink-0 rounded-full"
              style={{ backgroundColor: fill(stage.color) }}
              aria-hidden="true"
            />
            {stage.label}
          </span>
          <span className="text-sm tabular-nums text-muted-foreground">
            {stage.currentCount} · {money(stage.currentValueCents)}
          </span>
        </div>
      ))}

      {/* Aceeași pâlnie, în cuvinte, pentru cititoarele de ecran. */}
      <ul className="sr-only" aria-label={label}>
        {stages.map((stage) => (
          <li key={stage.key}>
            {stage.label}: {stage.reached} au ajuns aici, {stage.currentCount} sunt acum în etapă, valoare{" "}
            {money(stage.currentValueCents)}, cădere {stage.dropRatePct}%.
          </li>
        ))}
      </ul>
    </div>
  );
}
