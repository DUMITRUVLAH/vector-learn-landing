/**
 * VF-505: 3-way match panel (ParDetail, finance/admin). Shows PO / receipt / amount as 3 checks.
 */
import { useEffect, useState } from "react";
import { ShieldCheck, Check, X, Loader2 } from "lucide-react";
import { getThreeWayMatch, type ThreeWayMatch } from "@/lib/api/par";
import { cn } from "@/lib/utils";

function Row({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className={cn("inline-flex h-5 w-5 items-center justify-center rounded-full flex-shrink-0", ok ? "bg-green-500/15 text-green-700 dark:text-green-400" : "bg-destructive/15 text-destructive")}>
        {ok ? <Check className="h-3.5 w-3.5" aria-hidden /> : <X className="h-3.5 w-3.5" aria-hidden />}
      </span>
      <span className={ok ? "text-foreground" : "text-muted-foreground"}>{label}</span>
    </div>
  );
}

/** `refreshKey` lets the parent trigger a re-fetch after a receipt/PO change. */
export function ThreeWayMatchPanel({ parId, refreshKey }: { parId: string; refreshKey?: number }) {
  const [match, setMatch] = useState<ThreeWayMatch | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    getThreeWayMatch(parId).then(setMatch).catch(() => setMatch(null)).finally(() => setLoading(false));
  }, [parId, refreshKey]);

  if (loading) {
    return (
      <div className="rounded-lg border border-border bg-card p-4 flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Se verifică…
      </div>
    );
  }
  if (!match) return null;

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
      <div className="flex items-center gap-2">
        <ShieldCheck className={cn("h-4 w-4", match.ok ? "text-green-600 dark:text-green-400" : "text-primary")} aria-hidden />
        <h2 className="text-sm font-semibold text-foreground">Verificare 3-way match</h2>
        <span className={cn("text-xs font-medium ml-auto", match.ok ? "text-green-700 dark:text-green-400" : "text-yellow-700 dark:text-yellow-400")}>
          {match.ok ? "Toate condițiile îndeplinite" : "Incomplet"}
        </span>
      </div>
      <div className="space-y-1.5">
        <Row ok={match.poExists} label="Comandă de achiziție (PO) emisă" />
        <Row ok={match.fullyReceived} label="Recepție completă" />
        <Row ok={match.amountMatches} label="Sumă în limita PO (±10%)" />
      </div>
    </div>
  );
}
