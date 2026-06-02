/**
 * BRANCH-701: Branch Switcher dropdown
 * Allows switching between "Toate filialele" and a specific branch.
 * Stores selection in localStorage via useBranch hook.
 */
import { useEffect, useRef, useState } from "react";
import { Building2, ChevronDown } from "lucide-react";
import { useBranch } from "@/hooks/useBranch";
import { listBranches, type Branch } from "@/lib/api/branches";
import { cn } from "@/lib/utils";

export function BranchSwitcher() {
  const [activeBranchId, setActiveBranch] = useBranch();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLoading(true);
    listBranches()
      .then(({ items }) => setBranches(items))
      .catch(() => {/* silently ignore — branch switcher is optional UI */})
      .finally(() => setLoading(false));
  }, []);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Don't render if there's only 0–1 branch (no point switching)
  if (!loading && branches.length <= 1) return null;

  const activeBranch = branches.find((b) => b.id === activeBranchId);
  const label = activeBranch ? activeBranch.name : "Toate filialele";

  return (
    <div ref={ref} className="relative hidden sm:block">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Schimbă filiala activă"
        aria-expanded={open}
        className="flex items-center gap-1.5 h-8 px-2 text-xs rounded-md border border-border bg-background hover:bg-muted transition-colors"
      >
        <Building2 className="h-3.5 w-3.5 shrink-0" />
        <span className="max-w-[120px] truncate">{label}</span>
        <ChevronDown className={cn("h-3 w-3 ml-0.5 opacity-60 shrink-0 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="absolute right-0 top-9 z-50 min-w-[180px] rounded-md border border-border bg-popover shadow-md py-1">
          <p className="px-3 py-1 text-[10px] text-muted-foreground uppercase tracking-wide">Filială activă</p>
          <hr className="border-border mb-1" />
          <button
            type="button"
            onMouseDown={() => { setActiveBranch(null); setOpen(false); }}
            className={cn(
              "w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-muted text-left",
              activeBranchId === null && "bg-muted font-medium"
            )}
          >
            <Building2 className="h-3.5 w-3.5 opacity-60" />
            Toate filialele
          </button>
          {branches.map((branch) => (
            <button
              key={branch.id}
              type="button"
              onMouseDown={() => { setActiveBranch(branch.id); setOpen(false); }}
              className={cn(
                "w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-muted text-left",
                activeBranchId === branch.id && "bg-muted font-medium"
              )}
            >
              <Building2 className="h-3.5 w-3.5 opacity-60" />
              <span className="flex-1 truncate">{branch.name}</span>
              {branch.isDefault && (
                <span className="text-[10px] text-muted-foreground">implicit</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
