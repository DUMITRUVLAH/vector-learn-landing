import { ChevronDown, Users, GraduationCap, Wallet, Star } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";
import type { Branch } from "./RomaniaMap";

export interface AggregatedKPIs {
  students: number;
  teachers: number;
  monthlyRevenue: number;
  satisfaction: number;
}

export function aggregateKPIs(branches: Branch[], selectedId: string | null): AggregatedKPIs {
  if (selectedId) {
    const branch = branches.find((b) => b.id === selectedId);
    if (branch) {
      return {
        students: branch.students,
        teachers: branch.teachers,
        monthlyRevenue: branch.monthlyRevenue,
        satisfaction: branch.satisfaction,
      };
    }
  }
  const total = branches.reduce(
    (acc, b) => ({
      students: acc.students + b.students,
      teachers: acc.teachers + b.teachers,
      monthlyRevenue: acc.monthlyRevenue + b.monthlyRevenue,
      satisfaction: acc.satisfaction + b.satisfaction,
    }),
    { students: 0, teachers: 0, monthlyRevenue: 0, satisfaction: 0 }
  );
  return {
    ...total,
    satisfaction: branches.length > 0 ? total.satisfaction / branches.length : 0,
  };
}

interface BranchSwitcherProps {
  branches: Branch[];
  selectedId: string | null;
  onChange: (id: string | null) => void;
}

export function BranchSwitcher({ branches, selectedId, onChange }: BranchSwitcherProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("click", onClick);
    return () => window.removeEventListener("click", onClick);
  }, []);

  const selected = selectedId ? branches.find((b) => b.id === selectedId) : null;
  const label = selected ? selected.city : "Toate filialele";

  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        className="inline-flex items-center gap-2 rounded-md border border-input bg-card px-3 py-2 text-sm font-semibold text-foreground hover:bg-muted transition-colors min-w-[200px] justify-between"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span>{label}</span>
        <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <ul
          role="listbox"
          className="absolute z-20 left-0 right-0 mt-1 rounded-md border border-border bg-card shadow-lg overflow-hidden animate-fade-in"
        >
          <li>
            <button
              type="button"
              onClick={() => {
                onChange(null);
                setOpen(false);
              }}
              className={cn(
                "w-full text-left px-3 py-2 text-sm hover:bg-muted",
                selectedId === null && "bg-primary/10 text-primary font-semibold"
              )}
            >
              Toate filialele
            </button>
          </li>
          {branches.map((b) => (
            <li key={b.id}>
              <button
                type="button"
                onClick={() => {
                  onChange(b.id);
                  setOpen(false);
                }}
                className={cn(
                  "w-full text-left px-3 py-2 text-sm hover:bg-muted",
                  selectedId === b.id && "bg-primary/10 text-primary font-semibold"
                )}
              >
                {b.city}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

interface KPIBarProps {
  kpis: AggregatedKPIs;
}

function formatEur(v: number) {
  return new Intl.NumberFormat("ro-RO", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(v);
}

export function BranchKPIBar({ kpis }: KPIBarProps) {
  const cards = [
    { label: "Elevi", value: kpis.students.toLocaleString("ro-RO"), icon: GraduationCap, pastel: "pastel-sky" },
    { label: "Profesori", value: kpis.teachers.toLocaleString("ro-RO"), icon: Users, pastel: "pastel-mint" },
    { label: "Venit lună", value: formatEur(kpis.monthlyRevenue), icon: Wallet, pastel: "pastel-lavender" },
    { label: "Satisfacție", value: `${kpis.satisfaction.toFixed(1)}/5`, icon: Star, pastel: "pastel-peach" },
  ];
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((c) => {
        const Icon = c.icon;
        return (
          <article key={c.label} className={cn("rounded-2xl border border-border p-5", c.pastel)}>
            <Icon className="h-4 w-4 text-foreground/70 mb-2" />
            <p className="text-[10px] font-semibold uppercase tracking-wide text-foreground/60">{c.label}</p>
            <p data-testid={`kpi-${c.label}`} className="text-xl sm:text-2xl font-display font-bold tabular-nums mt-1">
              {c.value}
            </p>
          </article>
        );
      })}
    </div>
  );
}
