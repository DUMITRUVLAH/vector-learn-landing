/**
 * PLATFORM-001 — ce module are voie să vadă workspace-ul curent.
 *
 * Citește GET /api/modules (starea comutatoarelor din Consola Platformă) și e folosit de
 * shell + dashboard ca să ascundă secțiunile dezactivate.
 *
 * FAIL-OPEN, intenționat: la eroare, 401 sau răspuns lipsă întoarcem „toate active".
 * Un panou de administrare nu are voie să golească aplicația unui client fiindcă o
 * interogare a picat; serverul rămâne oricum autoritatea reală (403 module_disabled).
 */
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { cachedOnce, peekResolved } from "@/lib/sessionCache";

export type ModuleKey = "findesk" | "par" | "itpark" | "docmerge";

export const ALL_MODULE_KEYS: ModuleKey[] = ["findesk", "par", "itpark", "docmerge"];

interface ModulesResponse {
  modules: { key: string; label: string; description: string; route: string; enabled: boolean }[];
  enabled: string[];
}

const CACHE_KEY = "my-modules";

const fetchModules = () =>
  cachedOnce<ModulesResponse>(CACHE_KEY, () => api<ModulesResponse>("/api/modules"));

export interface UseEnabledModulesResult {
  /** Cheile active. Conține tot cât timp încă se încarcă (fail-open, fără pâlpâire de meniu). */
  enabled: ModuleKey[];
  isEnabled: (key: ModuleKey) => boolean;
  status: "loading" | "resolved";
}

export function useEnabledModules(): UseEnabledModulesResult {
  // Shell-ul se remontează la fiecare navigare; valoarea deja rezolvată din cache face
  // remontarea instantanee, fără ca meniul să clipească.
  const cached = peekResolved<ModulesResponse>(CACHE_KEY);
  const [state, setState] = useState<UseEnabledModulesResult>(() => ({
    enabled: (cached?.enabled as ModuleKey[]) ?? ALL_MODULE_KEYS,
    isEnabled: () => true,
    status: cached ? "resolved" : "loading",
  }));

  const load = useCallback(async () => {
    try {
      const data = await fetchModules();
      const enabled = (data.enabled ?? ALL_MODULE_KEYS) as ModuleKey[];
      setState({
        enabled,
        isEnabled: (key) => enabled.includes(key),
        status: "resolved",
      });
    } catch {
      setState({ enabled: ALL_MODULE_KEYS, isEnabled: () => true, status: "resolved" });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return state;
}
