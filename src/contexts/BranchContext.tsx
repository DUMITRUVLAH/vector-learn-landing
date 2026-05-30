/**
 * BRANCH-702 — BranchContext
 * Provides the active branch filter across the whole app.
 * "all" = show data from all branches (default behaviour).
 * A specific UUID = filter to that branch only.
 *
 * State is persisted in localStorage under the key `vl_active_branch`.
 */
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

const STORAGE_KEY = "vl_active_branch";

export type BranchFilterValue = "all" | string;

interface BranchContextValue {
  /** Currently active branch filter — "all" or a branch UUID */
  activeBranch: BranchFilterValue;
  /** Set the active branch (persists to localStorage) */
  setActiveBranch: (branchId: BranchFilterValue) => void;
}

const BranchContext = createContext<BranchContextValue | null>(null);

function readStorage(): BranchFilterValue {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw && raw.trim()) return raw.trim();
  } catch {
    // SSR or storage unavailable — ignore
  }
  return "all";
}

export function BranchProvider({ children }: { children: ReactNode }) {
  const [activeBranch, setActiveBranchState] = useState<BranchFilterValue>(readStorage);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, activeBranch);
    } catch {
      // Storage unavailable — ignore
    }
  }, [activeBranch]);

  const setActiveBranch = useCallback((branchId: BranchFilterValue) => {
    setActiveBranchState(branchId);
  }, []);

  return (
    <BranchContext.Provider value={{ activeBranch, setActiveBranch }}>
      {children}
    </BranchContext.Provider>
  );
}

export function useBranch(): BranchContextValue {
  const ctx = useContext(BranchContext);
  if (!ctx) {
    throw new Error("useBranch must be used inside <BranchProvider>");
  }
  return ctx;
}
