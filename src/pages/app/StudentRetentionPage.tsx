/**
 * REP-303 — Student retention: LTV per elev + tabel sortabil + search
 * Pagina /app/analytics/students
 */
import { useEffect, useState, useCallback, useMemo } from "react";
import { AlertTriangle, ChevronUp, ChevronDown, Search } from "lucide-react";
import { AppShell } from "@/components/app/AppShell";
import { useSession } from "@/hooks/useSession";
import { useRouter } from "@/router/HashRouter";
import { getStudentLtv, type StudentLtv } from "@/lib/api/analytics";
import { cn } from "@/lib/utils";

// ─── Formatters ───────────────────────────────────────────────────────────────

function formatEur(cents: number): string {
  if (cents === 0) return "—";
  return new Intl.NumberFormat("ro-RO", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

// ─── Score badge (rough proxy for LTV tier) ───────────────────────────────────

function ltvTier(cents: number): { label: string; className: string } {
  if (cents >= 50000) return { label: "High", className: "bg-success/10 text-success" };
  if (cents >= 10000) return { label: "Mid", className: "bg-primary/10 text-primary" };
  if (cents > 0) return { label: "Low", className: "bg-muted text-muted-foreground" };
  return { label: "—", className: "bg-muted/40 text-muted-foreground" };
}

const STATUS_LABEL: Record<string, string> = {
  active: "Activ",
  trial: "Trial",
  paused: "Pauza",
  archived: "Arhivat",
};

// ─── Sort types ───────────────────────────────────────────────────────────────

type SortKey = "fullName" | "ltvCents" | "lessonsAttended" | "lastLessonAt";
type SortDir = "asc" | "desc";

// ─── Main page ────────────────────────────────────────────────────────────────

export function StudentRetentionPage() {
  const { status: sessionStatus } = useSession();
  const { navigate } = useRouter();

  const [students, setStudents] = useState<StudentLtv[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("ltvCents");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  useEffect(() => {
    if (sessionStatus === "unauthenticated") navigate("/app/login");
  }, [sessionStatus, navigate]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getStudentLtv(50);
      setStudents(res.items);
    } catch {
      setError("Nu pot încărca datele elevilor.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void fetchData(); }, [fetchData]);

  const handleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => d === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const sorted = useMemo(() => {
    const filtered = students.filter((s) =>
      s.fullName.toLowerCase().includes(search.toLowerCase())
    );
    return [...filtered].sort((a, b) => {
      let cmp = 0;
      if (sortKey === "fullName") cmp = a.fullName.localeCompare(b.fullName, "ro");
      else if (sortKey === "ltvCents") cmp = a.ltvCents - b.ltvCents;
      else if (sortKey === "lessonsAttended") cmp = a.lessonsAttended - b.lessonsAttended;
      else if (sortKey === "lastLessonAt") {
        const da = a.lastLessonAt ?? "";
        const db = b.lastLessonAt ?? "";
        cmp = da.localeCompare(db);
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [students, search, sortKey, sortDir]);

  function SortIcon({ col }: { col: SortKey }) {
    if (sortKey !== col) return <ChevronDown className="h-3 w-3 opacity-30" aria-hidden="true" />;
    return sortDir === "asc"
      ? <ChevronUp className="h-3 w-3" aria-hidden="true" />
      : <ChevronDown className="h-3 w-3" aria-hidden="true" />;
  }

  return (
    <AppShell
      pageTitle="Elevi — LTV & Retenție"
      pageDescription="Lifetime value și prezențe per elev — sortabil"
    >
      {/* Search */}
      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Caută după nume…"
            className="w-full rounded-md border border-input bg-background pl-9 pr-3 py-2 text-sm"
            aria-label="Caută elev"
          />
        </div>
        <p className="text-xs text-muted-foreground whitespace-nowrap">
          {sorted.length} / {students.length} elevi
        </p>
      </div>

      {/* Error */}
      {error && (
        <div role="alert" className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive mb-4">
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
          {error}
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="space-y-2">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="h-10 bg-muted/20 rounded animate-pulse" />
          ))}
        </div>
      ) : sorted.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">
          {students.length === 0 ? "Nu există elevi." : "Niciun elev nu corespunde căutării."}
        </p>
      ) : (
        <div className="rounded-xl border border-border overflow-hidden" data-testid="student-ltv-table">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 border-b border-border">
              <tr>
                <th className="text-left px-4 py-3 font-semibold">
                  <button
                    type="button"
                    onClick={() => handleSort("fullName")}
                    className="flex items-center gap-1 hover:text-primary"
                    aria-sort={sortKey === "fullName" ? (sortDir === "asc" ? "ascending" : "descending") : "none"}
                  >
                    Elev <SortIcon col="fullName" />
                  </button>
                </th>
                <th className="text-right px-4 py-3 font-semibold">Status</th>
                <th className="text-right px-4 py-3 font-semibold">
                  <button
                    type="button"
                    onClick={() => handleSort("ltvCents")}
                    className="flex items-center gap-1 hover:text-primary ml-auto"
                    aria-sort={sortKey === "ltvCents" ? (sortDir === "asc" ? "ascending" : "descending") : "none"}
                  >
                    LTV (€) <SortIcon col="ltvCents" />
                  </button>
                </th>
                <th className="text-right px-4 py-3 font-semibold hidden sm:table-cell">
                  <button
                    type="button"
                    onClick={() => handleSort("lessonsAttended")}
                    className="flex items-center gap-1 hover:text-primary ml-auto"
                    aria-sort={sortKey === "lessonsAttended" ? (sortDir === "asc" ? "ascending" : "descending") : "none"}
                  >
                    Prezențe <SortIcon col="lessonsAttended" />
                  </button>
                </th>
                <th className="text-right px-4 py-3 font-semibold hidden md:table-cell">
                  <button
                    type="button"
                    onClick={() => handleSort("lastLessonAt")}
                    className="flex items-center gap-1 hover:text-primary ml-auto"
                    aria-sort={sortKey === "lastLessonAt" ? (sortDir === "asc" ? "ascending" : "descending") : "none"}
                  >
                    Ultima lecție <SortIcon col="lastLessonAt" />
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((s, i) => {
                const tier = ltvTier(s.ltvCents);
                return (
                  <tr
                    key={s.studentId}
                    className={cn(
                      "border-b border-border last:border-0 hover:bg-muted/30 transition-colors",
                      i < 3 && "bg-primary/[0.02]" // top 3 highlight
                    )}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {i < 3 && (
                          <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary">
                            {i + 1}
                          </span>
                        )}
                        <span className="font-medium">{s.fullName}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="text-xs text-muted-foreground">
                        {STATUS_LABEL[s.status] ?? s.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <span className="font-bold">{formatEur(s.ltvCents)}</span>
                        <span className={cn("inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-semibold", tier.className)}>
                          {tier.label}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right hidden sm:table-cell text-muted-foreground">
                      {s.lessonsAttended}
                    </td>
                    <td className="px-4 py-3 text-right hidden md:table-cell text-xs text-muted-foreground">
                      {s.lastLessonAt
                        ? new Date(s.lastLessonAt).toLocaleDateString("ro-RO")
                        : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </AppShell>
  );
}
