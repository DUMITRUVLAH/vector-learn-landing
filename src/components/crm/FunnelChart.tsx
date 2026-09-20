/**
 * CRM — pâlnia desenată ca pâlnie.
 *
 * Trei coloane, fiindcă trei sunt întrebările unui manager de vânzări, în ordinea asta:
 *   **stânga:** cât e blocat aici (bani) — și cât valorează ponderat cu probabilitatea;
 *   **mijloc:** etapa, cu lățimea proporțională cu câte oportunități au ajuns până la ea;
 *   **dreapta:** câte s-au oprit aici, în procente.
 *
 * De ce nu un grafic de bibliotecă: o pâlnie e o listă de bare descrescătoare cu două numere
 * alături. Un `<BarChart>` ar fi adăugat 40 KB și ar fi mutat cifrele într-un tooltip — adică
 * exact acolo unde nu se pot citi dintr-o privire, nici tipări, nici citi de un cititor de ecran.
 *
 * Accesibilitate: pâlnia e o LISTĂ, nu un desen. Fiecare etapă are textul ei complet (etapă,
 * număr, valoare, cădere); benzile colorate sunt `aria-hidden` — sunt o redundanță vizuală a
 * cifrelor de lângă ele, nu informație suplimentară.
 */
import type { CrmFunnelStageRow } from "@/lib/api/crmFunnel";
import { cn } from "@/lib/utils";

/** Tokenii pastel ai etapelor, aceiași ca pe tabla kanban. */
const BAR_TONES: Record<string, string> = {
  sky: "bg-pastel-sky",
  lavender: "bg-pastel-lavender",
  peach: "bg-pastel-peach",
  mint: "bg-pastel-mint",
  rose: "bg-pastel-rose",
};

export function money(cents: number): string {
  return new Intl.NumberFormat("ro-MD", { maximumFractionDigits: 0 }).format(Math.round(cents / 100));
}

export interface FunnelChartProps {
  stages: CrmFunnelStageRow[];
  /** Titlul listei, pentru cititoarele de ecran (ex. „Pâlnia Anei"). */
  label: string;
  /** Varianta compactă, pentru pâlniile per agent afișate una lângă alta. */
  compact?: boolean;
}

export function FunnelChart({ stages, label, compact = false }: FunnelChartProps) {
  const chain = stages.filter((s) => !s.isLost);
  const lost = stages.filter((s) => s.isLost);
  // Lățimea se raportează la prima etapă (cea mai largă), nu la maximul absolut: dacă a doua
  // etapă are mai multe „ajunse" decât prima (se poate, la date importate inconsistent), pâlnia
  // trebuie să rămână citibilă, nu să se răstoarne.
  const widest = Math.max(1, ...chain.map((s) => s.reached));

  return (
    <ul className="flex flex-col gap-1.5" aria-label={label}>
      {chain.map((stage) => {
        const widthPct = Math.max(6, Math.round((stage.reached / widest) * 100));
        return (
          <li key={stage.key} className="flex items-center gap-3">
            {/* stânga: banii */}
            <div className={cn("shrink-0 text-right", compact ? "w-20" : "w-32")}>
              <p className="text-sm font-semibold tabular-nums">{money(stage.currentValueCents)}</p>
              {!compact && (
                <p className="text-xs text-muted-foreground tabular-nums">
                  ponderat {money(stage.weightedValueCents)}
                </p>
              )}
            </div>

            {/* mijloc: banda pâlniei */}
            <div className="min-w-0 flex-1">
              <div
                className={cn(
                  "mx-auto flex items-center justify-between rounded-md px-2.5",
                  compact ? "h-7" : "h-10",
                  BAR_TONES[stage.color ?? "sky"] ?? BAR_TONES.sky
                )}
                style={{ width: `${widthPct}%` }}
                aria-hidden="true"
              >
                <span className="truncate text-xs font-medium">{stage.label}</span>
                <span className="ml-2 shrink-0 text-xs font-semibold tabular-nums">{stage.reached}</span>
              </div>
              {/* Textul real, pentru cititoarele de ecran și pentru benzile prea înguste. */}
              <span className="sr-only">
                {stage.label}: {stage.reached} oportunități au ajuns aici, {stage.currentCount} sunt acum în etapă,
                valoare {money(stage.currentValueCents)}, cădere {stage.dropRatePct}%.
              </span>
              {widthPct < 20 && (
                <p className="mt-0.5 text-center text-xs text-muted-foreground">
                  {stage.label} · {stage.reached}
                </p>
              )}
            </div>

            {/* dreapta: căderea */}
            <div className={cn("shrink-0 text-left", compact ? "w-16" : "w-28")}>
              <p
                className={cn(
                  "text-sm font-semibold tabular-nums",
                  stage.dropRatePct >= 70 ? "text-destructive" : "text-foreground"
                )}
              >
                {stage.isWon ? "—" : `${stage.dropRatePct}%`}
              </p>
              {!compact && !stage.isWon && (
                <p className="text-xs text-muted-foreground tabular-nums">{stage.dropped} s-au oprit</p>
              )}
            </div>
          </li>
        );
      })}

      {lost.map((stage) => (
        <li key={stage.key} className="flex items-center gap-3 border-t border-border pt-2">
          <div className={cn("shrink-0 text-right", compact ? "w-20" : "w-32")}>
            <p className="text-sm font-semibold tabular-nums">{money(stage.currentValueCents)}</p>
          </div>
          <div className="min-w-0 flex-1 text-sm text-muted-foreground">
            {stage.label}: <span className="tabular-nums">{stage.currentCount}</span>
          </div>
          <div className={cn("shrink-0", compact ? "w-16" : "w-28")} />
        </li>
      ))}
    </ul>
  );
}
