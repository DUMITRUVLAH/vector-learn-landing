/**
 * GAP-019 — Secțiunea "Insigne" pe pagina de detaliu student
 *
 * Afișează 7 badge slots: câștigate = colorate, necâștigate = gri (opacity-40)
 * Buton "Actualizează insigne" → POST /api/badges/check/:studentId
 */
import { useEffect, useState } from "react";
import { RefreshCw, Trophy } from "lucide-react";
import {
  BADGE_TYPES,
  BADGE_LABELS,
  getStudentBadges,
  checkBadges,
  type StudentBadge,
  type BadgeType,
} from "@/lib/api/badges";
import { cn } from "@/lib/utils";

interface StudentBadgesSectionProps {
  studentId: string;
}

export function StudentBadgesSection({ studentId }: StudentBadgesSectionProps) {
  const [badges, setBadges] = useState<StudentBadge[]>([]);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [newlyAwarded, setNewlyAwarded] = useState<BadgeType[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getStudentBadges(studentId)
      .then((data) => {
        if (!cancelled) {
          setBadges(data);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError("Nu s-au putut încărca insignele.");
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [studentId]);

  const awardedTypes = new Set(badges.map((b) => b.badgeType as BadgeType));
  const getBadgeDate = (type: BadgeType) =>
    badges.find((b) => b.badgeType === type)?.awardedAt;

  async function handleCheck() {
    setChecking(true);
    setNewlyAwarded([]);
    try {
      const result = await checkBadges(studentId);
      setNewlyAwarded(result.awarded);
      if (result.awarded.length > 0) {
        // Refresh badge list
        const updated = await getStudentBadges(studentId);
        setBadges(updated);
      }
    } catch {
      setError("Eroare la actualizarea insignelor.");
    } finally {
      setChecking(false);
    }
  }

  return (
    <section aria-labelledby="badges-heading" className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Trophy className="h-5 w-5 text-primary" aria-hidden="true" />
          <h3 id="badges-heading" className="text-sm font-semibold text-foreground">
            Insigne
          </h3>
          {badges.length > 0 && (
            <span className="rounded-full bg-primary/15 px-2 py-0.5 text-xs font-medium text-primary">
              {badges.length}/{BADGE_TYPES.length}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={handleCheck}
          disabled={checking || loading}
          className="flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted disabled:opacity-50 transition-colors"
          aria-label="Actualizează insignele elevului"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", checking && "animate-spin")} aria-hidden="true" />
          {checking ? "Se actualizează..." : "Actualizează"}
        </button>
      </div>

      {error && (
        <p role="alert" className="text-sm text-destructive mb-3">
          {error}
        </p>
      )}

      {newlyAwarded.length > 0 && (
        <div
          role="status"
          aria-live="polite"
          className="mb-4 rounded-lg bg-success/10 border border-success/20 px-4 py-2.5 text-sm text-success font-medium"
        >
          Nou acordate: {newlyAwarded.map((t) => BADGE_LABELS[t].title).join(", ")}!
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-3" aria-busy="true" aria-label="Se încarcă insignele">
          {BADGE_TYPES.map((type) => (
            <div
              key={type}
              className="h-24 rounded-xl bg-muted/60 animate-pulse"
            />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
          {BADGE_TYPES.map((type) => {
            const earned = awardedTypes.has(type);
            const info = BADGE_LABELS[type];
            const date = getBadgeDate(type);

            return (
              <div
                key={type}
                className={cn(
                  "flex flex-col items-center justify-center gap-1.5 rounded-xl border p-3 text-center transition-all",
                  earned
                    ? "border-primary/30 bg-primary/5 shadow-sm"
                    : "border-border bg-muted/30 opacity-40"
                )}
                title={
                  earned && date
                    ? `${info.title} — acordat ${new Date(date).toLocaleDateString("ro-RO")}`
                    : info.description
                }
                aria-label={`${info.title}: ${earned ? "câștigat" : "necâștigat"}`}
              >
                <span className="text-2xl leading-none" role="img" aria-hidden="true">
                  {info.emoji}
                </span>
                <span
                  className={cn(
                    "text-[10px] font-medium leading-tight",
                    earned ? "text-foreground" : "text-muted-foreground"
                  )}
                >
                  {info.title}
                </span>
                {earned && date && (
                  <span className="text-[9px] text-muted-foreground">
                    {new Date(date).toLocaleDateString("ro-RO", { day: "2-digit", month: "short" })}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
