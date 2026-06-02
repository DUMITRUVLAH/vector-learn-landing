/**
 * BRANCH-704 — BranchKpiCards
 * Shows KPI cards per branch: MRR, studenți activi, lecții luna curentă.
 * Also renders a comparison table when ≥ 2 branches.
 */
import { Loader2, Building2, Users, CreditCard, Calendar } from "lucide-react";
import { cn } from "@/lib/utils";
import type { BranchKpi } from "@/lib/api/analytics";

interface BranchKpiCardsProps {
  branches: BranchKpi[];
  loading?: boolean;
  period: "month" | "quarter";
}

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat("ro-RO", {
    style: "currency",
    currency: "RON",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function KpiItem({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="flex items-center gap-2">
      <Icon className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden="true" />
      <div>
        <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</p>
        <p className="text-sm font-bold">{value}</p>
      </div>
    </div>
  );
}

function BranchCard({ branch }: { branch: BranchKpi }) {
  return (
    <div
      className="rounded-xl border border-border bg-card p-4 space-y-3"
      aria-label={`KPI pentru ${branch.branchName}`}
    >
      <div className="flex items-center gap-2 mb-2">
        <Building2 className="h-4 w-4 text-primary" aria-hidden="true" />
        <h3 className="text-sm font-bold truncate">{branch.branchName}</h3>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <KpiItem
          label="MRR"
          value={formatCurrency(branch.mrr)}
          icon={CreditCard}
        />
        <KpiItem
          label="Elevi activi"
          value={String(branch.activeStudents)}
          icon={Users}
        />
        <KpiItem
          label="Lecții"
          value={String(branch.lessonsThisMonth)}
          icon={Calendar}
        />
      </div>
    </div>
  );
}

function ComparisonTable({ branches }: { branches: BranchKpi[] }) {
  if (branches.length < 2) return null;

  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card">
      <table className="w-full text-sm">
        <caption className="sr-only">Comparație KPI per filială</caption>
        <thead>
          <tr className="border-b border-border bg-muted/20">
            <th
              scope="col"
              className="text-left text-[10px] font-semibold uppercase tracking-wide text-muted-foreground px-4 py-2.5"
            >
              KPI
            </th>
            {branches.map((b) => (
              <th
                key={b.branchId}
                scope="col"
                className="text-right text-[10px] font-semibold uppercase tracking-wide text-muted-foreground px-4 py-2.5"
              >
                {b.branchName}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          <tr className="hover:bg-muted/20">
            <td className="px-4 py-2.5 font-medium text-xs">MRR (RON)</td>
            {branches.map((b) => (
              <td key={b.branchId} className="px-4 py-2.5 text-right text-xs font-bold">
                {formatCurrency(b.mrr)}
              </td>
            ))}
          </tr>
          <tr className="hover:bg-muted/20">
            <td className="px-4 py-2.5 font-medium text-xs">Elevi activi</td>
            {branches.map((b) => (
              <td key={b.branchId} className="px-4 py-2.5 text-right text-xs font-bold">
                {b.activeStudents}
              </td>
            ))}
          </tr>
          <tr className="hover:bg-muted/20">
            <td className="px-4 py-2.5 font-medium text-xs">Lecții luna</td>
            {branches.map((b) => (
              <td key={b.branchId} className="px-4 py-2.5 text-right text-xs font-bold">
                {b.lessonsThisMonth}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export function BranchKpiCards({ branches, loading, period }: BranchKpiCardsProps) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        Se încarcă KPI per filială…
      </div>
    );
  }

  if (branches.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-muted/10 p-8 text-center">
        <Building2 className="h-8 w-8 text-muted-foreground mx-auto mb-2" aria-hidden="true" />
        <p className="text-sm text-muted-foreground">
          Nicio filială activă. Adaugă filiale din <strong>Setări &gt; Filiale</strong>.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Perioadă:{" "}
        <span className="font-semibold">
          {period === "quarter" ? "trimestrul curent" : "luna curentă"}
        </span>
      </p>

      {/* Individual cards */}
      <div
        className={cn(
          "grid gap-4",
          branches.length === 1
            ? "grid-cols-1"
            : branches.length === 2
            ? "grid-cols-1 sm:grid-cols-2"
            : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
        )}
      >
        {branches.map((branch) => (
          <BranchCard key={branch.branchId} branch={branch} />
        ))}
      </div>

      {/* Comparison table */}
      {branches.length >= 2 && <ComparisonTable branches={branches} />}
    </div>
  );
}
