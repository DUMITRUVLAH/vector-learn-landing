/**
 * VM1-01: useParRoles — fetches the current business user's PAR roles.
 *
 * Calls GET /api/par/me and returns the roles array.
 * - Loading state: `{ status: "loading", roles: [] }`
 * - Authenticated with roles: `{ status: "resolved", roles: ["approver", ...] }`
 * - Error / 401 / no roles: `{ status: "resolved", roles: [] }` — fail-closed on visibility
 *
 * Consumers use `roles.length >= 1` to show/hide PAR navigation sections.
 * This hook ONLY gates visibility — server still enforces 403 per-endpoint.
 */
import { useEffect, useState, useCallback } from "react";
import { getParMe } from "@/lib/api/par";

type ParRolesStatus = "loading" | "resolved";

export interface UseParRolesResult {
  status: ParRolesStatus;
  roles: string[];
}

export function useParRoles(): UseParRolesResult {
  const [state, setState] = useState<UseParRolesResult>({
    status: "loading",
    roles: [],
  });

  const fetchRoles = useCallback(async () => {
    try {
      const { roles } = await getParMe();
      setState({ status: "resolved", roles });
    } catch {
      // 401, 403, network error, or any other failure → treat as no PAR roles.
      // Fail-closed: if we can't verify, don't show the section.
      setState({ status: "resolved", roles: [] });
    }
  }, []);

  useEffect(() => {
    void fetchRoles();
  }, [fetchRoles]);

  return state;
}
