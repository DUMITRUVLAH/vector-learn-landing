/**
 * BRANCH-701: useBranch hook
 * Stores the active branch selection in localStorage.
 * null = "Toate filialele" (all branches / consolidated view).
 */

const STORAGE_KEY = "vl_active_branch_id";

export function getActiveBranchId(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setActiveBranchId(id: string | null): void {
  try {
    if (id === null) {
      localStorage.removeItem(STORAGE_KEY);
    } else {
      localStorage.setItem(STORAGE_KEY, id);
    }
    // Dispatch storage event so other components in the same tab can react
    window.dispatchEvent(new StorageEvent("storage", { key: STORAGE_KEY, newValue: id }));
  } catch {
    // localStorage may be unavailable in some environments
  }
}

import { useState, useEffect } from "react";

/**
 * React hook that returns the active branch ID and a setter.
 * Subscribes to localStorage changes so all components stay in sync.
 */
export function useBranch(): [string | null, (id: string | null) => void] {
  const [branchId, setBranchId] = useState<string | null>(getActiveBranchId);

  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) {
        setBranchId(e.newValue);
      }
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  const setActiveBranch = (id: string | null) => {
    setActiveBranchId(id);
    setBranchId(id);
  };

  return [branchId, setActiveBranch];
}
