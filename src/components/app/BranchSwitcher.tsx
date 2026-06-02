/**
 * BRANCH-702 — BranchSwitcher
 * A header dropdown that lets users switch between branches.
 * Shows "Toate filialele" when no filter is active.
 * Shows a badge (branch name) when a specific branch is selected.
 *
 * Reads the branch list from /api/branches and stores selection in BranchContext.
 */
import { useEffect, useRef, useState } from "react";
import { Building2, ChevronDown, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { useBranch } from "@/contexts/BranchContext";
import { listBranches, type Branch } from "@/lib/api/branches";

export function BranchSwitcher() {
  const { activeBranch, setActiveBranch } = useBranch();
  const [open, setOpen] = useState(false);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    listBranches()
      .then((res) => {
        if (!cancelled) setBranches(res.items);
      })
      .catch(() => {
        if (!cancelled) setBranches([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const activeBranchObj = branches.find((b) => b.id === activeBranch) ?? null;
  const isFiltered = activeBranch !== "all";

  // Don't render the switcher if there's only one branch or none (no point filtering)
  if (!loading && branches.length <= 1) return null;

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        aria-label={isFiltered ? `Filială selectată: ${activeBranchObj?.name ?? activeBranch}` : "Selectează filială"}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium border transition-colors",
          "touch-target",
          isFiltered
            ? "bg-primary/10 text-primary border-primary/30 hover:bg-primary/15"
            : "bg-transparent text-muted-foreground border-border hover:bg-muted hover:text-foreground"
        )}
      >
        <Building2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span className="hidden sm:inline max-w-[120px] truncate">
          {loading
            ? "..."
            : isFiltered && activeBranchObj
            ? activeBranchObj.name
            : "Toate filialele"}
        </span>
        {/* Badge indicator when filtered */}
        {isFiltered && (
          <span
            className="flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-primary-foreground"
            aria-hidden="true"
          >
            1
          </span>
        )}
        <ChevronDown
          className={cn("h-3 w-3 shrink-0 transition-transform", open && "rotate-180")}
          aria-hidden="true"
        />
      </button>

      {open && (
        <ul
          role="listbox"
          aria-label="Filiale disponibile"
          className={cn(
            "absolute right-0 top-full mt-1 z-50 min-w-[180px] overflow-hidden",
            "rounded-lg border border-border bg-popover shadow-lg",
            "focus:outline-none"
          )}
        >
          {/* "All branches" option */}
          <li
            role="option"
            aria-selected={activeBranch === "all"}
            onClick={() => {
              setActiveBranch("all");
              setOpen(false);
            }}
            className={cn(
              "flex cursor-pointer items-center justify-between gap-2 px-3 py-2 text-sm",
              "hover:bg-muted transition-colors",
              activeBranch === "all" ? "text-primary font-medium" : "text-foreground"
            )}
          >
            <span>Toate filialele</span>
            {activeBranch === "all" && <Check className="h-3.5 w-3.5 text-primary" aria-hidden="true" />}
          </li>

          {branches.length > 0 && (
            <div className="h-px bg-border" role="separator" />
          )}

          {branches.map((branch) => (
            <li
              key={branch.id}
              role="option"
              aria-selected={activeBranch === branch.id}
              onClick={() => {
                setActiveBranch(branch.id);
                setOpen(false);
              }}
              className={cn(
                "flex cursor-pointer items-center justify-between gap-2 px-3 py-2 text-sm",
                "hover:bg-muted transition-colors",
                activeBranch === branch.id ? "text-primary font-medium" : "text-foreground"
              )}
            >
              <span className="truncate">{branch.name}</span>
              {activeBranch === branch.id && (
                <Check className="h-3.5 w-3.5 text-primary shrink-0" aria-hidden="true" />
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
