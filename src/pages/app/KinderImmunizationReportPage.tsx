/**
 * KINDER-004 — /app/kinder/immunization-report
 *
 * Tenant-wide immunization status report:
 * - Lists all children with at-risk immunization status
 * - Color-coded: overdue (red), due_soon (yellow), no_record (grey)
 * - Filterable by status
 * - CSV export
 */
import { useEffect, useState } from "react";
import { AppShell } from "@/components/app/AppShell";
import { useSession } from "@/hooks/useSession";
import {
  getImmunizationStatus,
  type AtRiskStudent,
  type ImmunizationStatus,
} from "@/lib/api/kinder";
import {
  Syringe,
  Loader2,
  AlertCircle,
  Download,
  Filter,
  AlertTriangle,
  Clock,
  HelpCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function statusBadge(status: ImmunizationStatus) {
  const map: Record<ImmunizationStatus, { label: string; icon: React.ReactNode; cls: string }> = {
    overdue: {
      label: "Expirat",
      icon: <AlertTriangle className="w-3.5 h-3.5" />,
      cls: "bg-destructive/15 text-destructive",
    },
    due_soon: {
      label: "Scadent curând",
      icon: <Clock className="w-3.5 h-3.5" />,
      cls: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
    },
    no_record: {
      label: "Fără evidență",
      icon: <HelpCircle className="w-3.5 h-3.5" />,
      cls: "bg-muted text-muted-foreground",
    },
  };
  const { label, icon, cls } = map[status];
  return (
    <span className={cn("flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full w-fit", cls)}>
      {icon}
      {label}
    </span>
  );
}

function formatDate(d: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("ro-RO");
}

function exportCSV(students: AtRiskStudent[]) {
  const rows = [
    ["Elev", "Status", "Vaccin", "Data administrare", "Scadenta"],
    ...students.flatMap((s) =>
      s.vaccines.map((v) => [
        s.fullName,
        s.status,
        v.vaccineName,
        formatDate(v.administeredDate),
        formatDate(v.nextDueDate),
      ])
    ),
  ];
  const csv = rows.map((r) => r.join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `vaccinuri-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

const STATUS_LABELS: Record<ImmunizationStatus | "all", string> = {
  all: "Toți",
  overdue: "Expirat",
  due_soon: "Scadent curând",
  no_record: "Fără evidență",
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export function KinderImmunizationReportPage() {
  const { data: session } = useSession();
  const [students, setStudents] = useState<AtRiskStudent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<ImmunizationStatus | "all">("all");
  const [threshold, setThreshold] = useState<string>("");

  useEffect(() => {
    if (!session) return;
    setLoading(true);
    getImmunizationStatus()
      .then((data) => {
        setStudents(data.atRisk);
        setThreshold(data.threshold);
      })
      .catch(() => setError("Nu s-a putut încărca raportul."))
      .finally(() => setLoading(false));
  }, [session]);

  const filtered =
    filter === "all" ? students : students.filter((s) => s.status === filter);

  const counts: Record<ImmunizationStatus, number> = {
    overdue: students.filter((s) => s.status === "overdue").length,
    due_soon: students.filter((s) => s.status === "due_soon").length,
    no_record: students.filter((s) => s.status === "no_record").length,
  };

  return (
    <AppShell
      pageTitle="Raport vaccinuri"
      pageDescription={threshold ? `Copii cu vaccinuri scadente până la ${new Date(threshold).toLocaleDateString("ro-RO")}` : "Status vaccinare grădiniță"}
      actions={
        <button
          onClick={() => exportCSV(filtered)}
          disabled={filtered.length === 0}
          className="flex items-center gap-2 px-3 py-2 text-sm font-medium border border-border rounded-lg hover:bg-muted transition-colors disabled:opacity-50"
        >
          <Download className="w-4 h-4" />
          Export CSV
        </button>
      }
    >
      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {(["overdue", "due_soon", "no_record"] as ImmunizationStatus[]).map((s) => (
          <button
            key={s}
            onClick={() => setFilter(filter === s ? "all" : s)}
            className={cn(
              "text-left p-4 rounded-xl border transition-colors",
              filter === s
                ? "border-primary bg-primary/5"
                : "border-border bg-card hover:bg-muted/40"
            )}
          >
            <p className="text-2xl font-bold text-foreground">{counts[s]}</p>
            <p className="text-sm text-muted-foreground mt-0.5">{STATUS_LABELS[s]}</p>
          </button>
        ))}
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-2 mb-4">
        <Filter className="w-4 h-4 text-muted-foreground" />
        {(["all", "overdue", "due_soon", "no_record"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              "px-3 py-1.5 text-xs font-medium rounded-full border transition-colors",
              filter === f
                ? "bg-primary text-primary-foreground border-primary"
                : "border-border text-muted-foreground hover:text-foreground"
            )}
          >
            {STATUS_LABELS[f]}
          </button>
        ))}
      </div>

      {loading && (
        <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-sm">Se încarcă...</span>
        </div>
      )}

      {error && !loading && (
        <div className="flex items-center gap-2 text-destructive text-sm py-6">
          <AlertCircle className="w-5 h-5" />
          {error}
        </div>
      )}

      {!loading && !error && filtered.length === 0 && (
        <div className="text-center py-16 text-muted-foreground">
          <Syringe className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm font-medium">
            {filter === "all"
              ? "Nu există copii cu riscuri de vaccinare. "
              : `Niciun copil cu status "${STATUS_LABELS[filter]}".`}
          </p>
        </div>
      )}

      {!loading && !error && filtered.length > 0 && (
        <div className="rounded-xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/40 text-muted-foreground">
                <th className="text-left px-4 py-3 font-medium">Copil</th>
                <th className="text-left px-4 py-3 font-medium">Status</th>
                <th className="text-left px-4 py-3 font-medium">Vaccinuri la risc</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => (
                <tr key={s.studentId} className="border-t border-border hover:bg-muted/20 transition-colors align-top">
                  <td className="px-4 py-3 font-medium text-foreground">{s.fullName}</td>
                  <td className="px-4 py-3">{statusBadge(s.status)}</td>
                  <td className="px-4 py-3">
                    <ul className="space-y-1">
                      {s.vaccines.map((v, i) => (
                        <li key={i} className="text-muted-foreground">
                          <span className="font-medium text-foreground">{v.vaccineName}</span>
                          {v.nextDueDate && (
                            <span className="ml-2">
                              scadent: {formatDate(v.nextDueDate)}
                            </span>
                          )}
                          {!v.nextDueDate && (
                            <span className="ml-2 italic">fără scadență</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AppShell>
  );
}
