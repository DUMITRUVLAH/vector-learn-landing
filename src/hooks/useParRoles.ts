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
import { cachedOnce, peekResolved } from "@/lib/sessionCache";

type ParRolesStatus = "loading" | "resolved";

export interface UseParRolesResult {
  status: ParRolesStatus;
  roles: string[];
  /**
   * Pre-aprobator pe cel puțin un proiect. Semnează pe NUME, deci nu are neapărat rolul
   * `approver` — dar inboxul de aprobare trebuie să i se deschidă, altfel pasul lui e o
   * autoritate pe care n-o poate exercita de nicăieri.
   *
   * Opțional ca să nu ceară nimic de la apelanții care doar simulează hook-ul în teste; lipsa lui
   * înseamnă „nu e pre-aprobator", adică exact comportamentul de dinainte.
   */
  preApprover?: boolean;
}

// Session cache: the shell remounts on every navigation, so without this the roles were
// re-fetched (and flashed "loading") on each click. cachedOnce makes remounts instant.
const CACHE_KEY = "par-me";
const parMeCached = () => cachedOnce(CACHE_KEY, getParMe);

export function useParRoles(): UseParRolesResult {
  // Citirea SINCRONĂ din cache e cea care ține meniul nemișcat. `cachedOnce` întorcea o
  // promisiune deja rezolvată, dar rezolvarea vine abia după prima randare — deci fiecare
  // navigare desena întâi un sidebar FĂRĂ secțiunea PAR și abia apoi o adăuga. De aici
  // senzația că „sare toată pagina" la fiecare click.
  const cached = peekResolved<{ roles: string[]; preApprover?: boolean }>(CACHE_KEY);
  const [state, setState] = useState<UseParRolesResult>({
    status: cached ? "resolved" : "loading",
    roles: cached?.roles ?? [],
    preApprover: cached?.preApprover ?? false,
  });

  const fetchRoles = useCallback(async () => {
    try {
      const { roles, preApprover } = await parMeCached();
      setState({ status: "resolved", roles, preApprover: preApprover ?? false });
    } catch {
      // 401, 403, network error, or any other failure → treat as no PAR roles.
      // Fail-closed: if we can't verify, don't show the section.
      setState({ status: "resolved", roles: [], preApprover: false });
    }
  }, []);

  useEffect(() => {
    void fetchRoles();
  }, [fetchRoles]);

  return state;
}
