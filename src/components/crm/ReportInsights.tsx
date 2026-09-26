/**
 * CRM-G09 — „Ce spun cifrele": constatările generate automat din raport.
 *
 * Serverul decide CE e de spus (`server/lib/crm/reportSegments.ts#buildInsights`, cu pragurile de
 * eșantion); aici doar se scrie fraza. Fraza e o listă de bucăți (text + ce se îngroașă), ca
 * aceeași constatare să iasă și pe ecran, și ca text simplu în exportul PDF.
 */
import type { ReactNode } from "react";
import { AlertTriangle, Clock, Filter, Medal, TrendingDown, TrendingUp, Trophy, XCircle } from "lucide-react";
import type { CrmInsight } from "@/lib/api/crmReports";
import { cn } from "@/lib/utils";

export interface InsightContext {
  money: (cents: number) => string;
  ownerName: (id: string | null) => string;
  /** Eticheta unei valori de segment („facebook_ad" → „Facebook Ads"). */
  segmentValue: (dimension: string, value: string) => string;
}

type Part = string | { strong: string };

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function insightParts(i: CrmInsight, ctx: InsightContext): Part[] {
  switch (i.kind) {
    case "topSeller":
      return [
        { strong: ctx.ownerName(i.ownerKey) },
        " a vândut cel mai mult: ",
        { strong: ctx.money(i.wonValueCents) },
        ` din ${plural(i.wonCount, "afacere", "afaceri")} — ${i.sharePct}% din vânzările echipei.`,
      ];
    case "bestWinRate":
      return [
        { strong: ctx.ownerName(i.ownerKey) },
        " închide cel mai des: câștigă ",
        { strong: `${i.winRatePct}%` },
        ` din afacerile închise (${i.decided}).`,
      ];
    case "salesTrend":
      return [
        `Vânzările au ${i.changePct > 0 ? "crescut" : "scăzut"} cu `,
        { strong: `${Math.abs(i.changePct)}%` },
        ` față de perioada precedentă (${ctx.money(i.currentCents)} față de ${ctx.money(i.previousCents)}).`,
      ];
    case "segmentSpread":
      return [
        `${i.dimensionLabel}: cea mai bună conversie o are `,
        { strong: ctx.segmentValue(i.dimension, i.best.value) },
        ` — ${i.best.conversionPct}% din ${plural(i.best.leads, "lead", "leaduri")}. Cea mai slabă: `,
        { strong: ctx.segmentValue(i.dimension, i.worst.value) },
        ` — ${i.worst.conversionPct}% din ${i.worst.leads}.`,
      ];
    case "funnelLeak":
      return [
        "Cele mai multe afaceri se opresc la ",
        { strong: i.stageLabel },
        ": ",
        { strong: `${i.dropRatePct}%` },
        ` nu trec mai departe (${i.dropped} din ${i.reached}).`,
      ];
    case "stale":
      return [
        { strong: plural(i.count, "afacere", "afaceri") },
        ` (${ctx.money(i.valueCents)}) n-au mai fost atinse de peste 14 zile.`,
      ];
    case "topLostReason":
      return ["Motivul principal de pierdere: ", { strong: i.reason }, ` — ${i.pct}% din pierderi (${i.count}).`];
  }
}

export function insightText(i: CrmInsight, ctx: InsightContext): string {
  return insightParts(i, ctx)
    .map((p) => (typeof p === "string" ? p : p.strong))
    .join("");
}

function InsightIcon({ insight }: { insight: CrmInsight }) {
  const cls = cn(
    "h-5 w-5 shrink-0",
    insight.tone === "positive" ? "text-success" : insight.tone === "negative" ? "text-destructive" : "text-primary"
  );
  switch (insight.kind) {
    case "topSeller":
      return <Trophy className={cls} aria-hidden="true" />;
    case "bestWinRate":
      return <Medal className={cls} aria-hidden="true" />;
    case "salesTrend":
      return insight.changePct > 0 ? <TrendingUp className={cls} aria-hidden="true" /> : <TrendingDown className={cls} aria-hidden="true" />;
    case "segmentSpread":
      return <Filter className={cls} aria-hidden="true" />;
    case "funnelLeak":
      return <AlertTriangle className={cls} aria-hidden="true" />;
    case "stale":
      return <Clock className={cls} aria-hidden="true" />;
    case "topLostReason":
      return <XCircle className={cls} aria-hidden="true" />;
  }
}

export interface ReportInsightsProps {
  insights: CrmInsight[];
  ctx: InsightContext;
  /** Click pe o constatare de segment → raportul pe acea dimensiune. */
  onOpenSegment?: (dimension: string) => void;
}

export function ReportInsights({ insights, ctx, onOpenSegment }: ReportInsightsProps) {
  if (insights.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Încă nu sunt destule date pentru constatări. Apar când o valoare (o sursă, un oraș, un agent) are cel puțin 3 leaduri în
        perioada aleasă și există cu ce s-o compari.
      </p>
    );
  }
  return (
    <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-label="Constatări">
      {insights.map((insight, idx) => {
        const body: ReactNode = insightParts(insight, ctx).map((p, k) =>
          typeof p === "string" ? (
            <span key={k}>{p}</span>
          ) : (
            <strong key={k} className="font-medium text-foreground">
              {p.strong}
            </strong>
          )
        );
        return (
          <li key={`${insight.kind}-${idx}`} className="flex gap-3 rounded-lg border border-border bg-card p-4">
            <InsightIcon insight={insight} />
            <div className="min-w-0 space-y-2">
              <p className="text-sm text-muted-foreground">{body}</p>
              {insight.kind === "segmentSpread" && onOpenSegment && (
                <button
                  type="button"
                  onClick={() => onOpenSegment(insight.dimension)}
                  className="text-sm font-medium text-primary hover:underline max-sm:min-h-11"
                >
                  Vezi pe {insight.dimensionLabel.toLowerCase()}
                </button>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
