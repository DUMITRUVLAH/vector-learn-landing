/**
 * BRANCH-702 — BranchContext
 *
 * Provides the active branch selection across all pages.
 * The active branch is persisted to localStorage.
 * Managers with a restricted scope cannot change the active branch.
 */
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { getBranches, type Branch } from "@/lib/api/branches";
import { useSession } from "@/hooks/useSession";

const STORAGE_KEY = "active_branch_id";

interface BranchContextValue {
  /** null = "all branches" (owner/admin view). UUID = specific branch selected. */
  activeBranchId: string | null;
  setActiveBranchId: (id: string | null) => void;
  branches: Branch[];
  loading: boolean;
}

const BranchContext = createContext<BranchContextValue>({
  activeBranchId: null,
  setActiveBranchId: () => {},
  branches: [],
  loading: false,
});

export function BranchProvider({ children }: { children: ReactNode }) {
  const { data: session } = useSession();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [activeBranchId, setActiveBranchIdState] = useState<string | null>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) ?? null;
    } catch {
      return null;
    }
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!session) return;

    setLoading(true);
    getBranches()
      .then((data) => {
        setBranches(data.branches);
      })
      .catch(() => {
        // Non-critical — branches just won't show in switcher
        setBranches([]);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [session]);

  function setActiveBranchId(id: string | null) {
    setActiveBranchIdState(id);
    try {
      if (id === null) {
        localStorage.removeItem(STORAGE_KEY);
      } else {
        localStorage.setItem(STORAGE_KEY, id);
      }
    } catch {
      // localStorage unavailable — state-only
    }
  }

  return (
    <BranchContext.Provider value={{ activeBranchId, setActiveBranchId, branches, loading }}>
      {children}
    </BranchContext.Provider>
  );
}

export function useBranch(): BranchContextValue {
  return useContext(BranchContext);
}
