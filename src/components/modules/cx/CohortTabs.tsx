/**
 * CX-702 — CohortTabs + CohortSelector
 * Tab bar: Active (N) · Viitoare (N) · Trecute (N)
 * Below tabs: horizontal scrollable list of cohort buttons.
 * Semantics: tab panel, aria roles, touch targets ≥ 44px.
 */
import { useRef } from "react";
import type { Cohort } from "@/lib/api/cohorts";
import { cn } from "@/lib/utils";

/** Format a date string "YYYY-MM-DD" to "d Mon" (Romanian-friendly short label) */
function fmtDate(iso: string): string {
  const [, mm, dd] = iso.split("-").map(Number);
  const MON = ["Ian", "Feb", "Mar", "Apr", "Mai", "Iun", "Iul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${dd} ${MON[(mm ?? 1) - 1]}`;
}

type TabKey = "active" | "upcoming" | "past";

interface CohortTabsProps {
  cohorts: Cohort[];
  activeTab: TabKey;
  onTabChange: (tab: TabKey) => void;
  selectedCohortId: string | null;
  onCohortSelect: (id: string) => void;
}

const TAB_LABELS: Record<TabKey, string> = {
  active: "Active",
  upcoming: "Viitoare",
  past: "Trecute",
};

export function CohortTabs({
  cohorts,
  activeTab,
  onTabChange,
  selectedCohortId,
  onCohortSelect,
}: CohortTabsProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const counts: Record<TabKey, number> = {
    active: cohorts.filter((c) => c.category === "active").length,
    upcoming: cohorts.filter((c) => c.category === "upcoming").length,
    past: cohorts.filter((c) => c.category === "past").length,
  };

  const visible = cohorts.filter((c) => c.category === activeTab);

  return (
    <div>
      {/* Tab bar */}
      <div
        role="tablist"
        aria-label="Categorii cohorte"
        className="flex border-b border-border"
      >
        {(["active", "upcoming", "past"] as TabKey[]).map((tab) => (
          <button
            key={tab}
            role="tab"
            id={`tab-${tab}`}
            aria-selected={activeTab === tab}
            aria-controls={`panel-${tab}`}
            onClick={() => onTabChange(tab)}
            className={cn(
              "px-4 py-3 text-sm font-medium border-b-2 transition-colors min-h-[44px]",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              activeTab === tab
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {TAB_LABELS[tab]}
            <span
              className={cn(
                "ml-1.5 rounded-full px-1.5 py-0.5 text-xs font-semibold",
                activeTab === tab
                  ? "bg-primary/10 text-primary"
                  : "bg-muted text-muted-foreground"
              )}
            >
              {counts[tab]}
            </span>
          </button>
        ))}
      </div>

      {/* Cohort selector — horizontal scroll */}
      <div
        role="tabpanel"
        id={`panel-${activeTab}`}
        aria-labelledby={`tab-${activeTab}`}
        className="mt-3"
      >
        {visible.length === 0 ? (
          <EmptyState tab={activeTab} />
        ) : (
          <div
            ref={scrollRef}
            className="flex gap-2 overflow-x-auto pb-2 scrollbar-none"
            aria-label="Selector cohortă"
          >
            {visible.map((cohort) => {
              const isSelected = cohort.id === selectedCohortId;
              return (
                <button
                  key={cohort.id}
                  onClick={() => onCohortSelect(cohort.id)}
                  aria-pressed={isSelected}
                  className={cn(
                    "flex-shrink-0 flex flex-col items-start px-4 py-3 rounded-lg border",
                    "transition-colors min-h-[44px] min-w-[120px] text-left",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                    isSelected
                      ? "border-t-2 border-t-primary border-x-border border-b-border bg-muted/50"
                      : "border-border hover:border-primary/30 bg-card"
                  )}
                >
                  <span className="text-sm font-medium text-foreground leading-tight">
                    {cohort.label}
                  </span>
                  <span className="text-xs text-muted-foreground mt-0.5">
                    {fmtDate(cohort.startDate)}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function EmptyState({ tab }: { tab: TabKey }) {
  const messages: Record<TabKey, string> = {
    active:
      "Nu există ediții active (luna curentă + luna viitoare). Creează o cohortă nouă.",
    upcoming: "Nu există ediții planificate pentru luna viitoare sau mai departe.",
    past: "Nu există ediții trecute înregistrate.",
  };

  return (
    <div className="py-8 text-center text-muted-foreground text-sm" role="status">
      {messages[tab]}
    </div>
  );
}
