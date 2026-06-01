/**
 * BRANCH-702 — BranchSwitcher
 *
 * Dropdown in AppShell header to switch between branches.
 * Visible only when tenant has ≥ 2 branches or the user is owner/admin.
 * Shows "Toate filialele" (null) + one option per branch.
 */
import { Building2, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useBranch } from "@/contexts/BranchContext";

export function BranchSwitcher() {
  const { activeBranchId, setActiveBranchId, branches, loading } = useBranch();

  // Don't render if there's only one (or zero) branch
  if (loading || branches.length < 2) return null;

  const activeBranch = branches.find((b) => b.id === activeBranchId) ?? null;
  const label = activeBranch?.name ?? "Toate filialele";

  return (
    <div className="relative group">
      <button
        type="button"
        className={cn(
          "flex items-center gap-1.5 rounded-lg border border-border bg-background/50 px-2.5 py-1.5 text-sm text-foreground hover:bg-muted",
          "focus:outline-none focus:ring-2 focus:ring-primary/50"
        )}
        aria-label={`Filială activă: ${label}`}
        aria-haspopup="listbox"
        aria-expanded="false"
      >
        <Building2 className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
        <span className="max-w-[120px] truncate">{label}</span>
        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
      </button>

      {/* Dropdown */}
      <div
        role="listbox"
        aria-label="Selectare filială"
        className={cn(
          "absolute right-0 top-full mt-1 z-50 min-w-[200px] rounded-xl border border-border bg-card shadow-xl",
          "invisible opacity-0 group-focus-within:visible group-focus-within:opacity-100",
          "transition-all duration-150"
        )}
      >
        <div className="p-1">
          {/* "All branches" option */}
          <button
            type="button"
            role="option"
            aria-selected={activeBranchId === null}
            onClick={() => setActiveBranchId(null)}
            className={cn(
              "w-full flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-left",
              "hover:bg-muted focus:outline-none focus:bg-muted",
              activeBranchId === null
                ? "bg-primary/10 text-primary font-medium"
                : "text-foreground"
            )}
          >
            <Building2 className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
            Toate filialele
          </button>

          {branches.length > 0 && (
            <div className="my-1 border-t border-border" role="separator" />
          )}

          {/* Individual branches */}
          {branches.map((branch) => (
            <button
              key={branch.id}
              type="button"
              role="option"
              aria-selected={activeBranchId === branch.id}
              onClick={() => setActiveBranchId(branch.id)}
              className={cn(
                "w-full flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-left",
                "hover:bg-muted focus:outline-none focus:bg-muted",
                activeBranchId === branch.id
                  ? "bg-primary/10 text-primary font-medium"
                  : "text-foreground"
              )}
            >
              <span
                className={cn(
                  "h-1.5 w-1.5 rounded-full flex-shrink-0",
                  branch.isDefault ? "bg-green-500" : "bg-blue-500"
                )}
                aria-hidden="true"
              />
              <span className="truncate">{branch.name}</span>
              {branch.isDefault && (
                <span className="ml-auto text-xs text-muted-foreground flex-shrink-0">
                  implicită
                </span>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
