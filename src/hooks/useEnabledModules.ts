/**
 * PLATFORM-001 — ce module are voie să vadă workspace-ul curent.
 *
 * Citește GET /api/modules (starea comutatoarelor din Consola Platformă) și e folosit de
 * shell + dashboard ca să ascundă secțiunile dezactivate.
 *
 * IMPLICIT = PAR. Orice organizație are modulul de cereri de plată fără nicio setare;
 * FinDesk / ITPark / Document Merge apar doar dacă proprietarul le-a aprins din Consola
 * Platformă. La eroare, 401 sau răspuns lipsă cădem pe același implicit — nu pe „toate
 * active" (ar fi arătat meniuri pe care serverul le refuză oricum cu 403 module_disabled)
 * și nici pe „niciunul" (ar fi golit aplicația din cauza unei interogări picate).
 */
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { cachedOnce, peekResolved } from "@/lib/sessionCache";

export type ModuleKey = "findesk" | "par" | "itpark" | "docmerge";

export const ALL_MODULE_KEYS: ModuleKey[] = ["findesk", "par", "itpark", "docmerge"];

/** Ce vede o organizație fără nicio setare explicită. Oglindește `defaultEnabled` din server. */
export const DEFAULT_MODULE_KEYS: ModuleKey[] = ["par"];

interface ModulesResponse {
  modules: { key: string; label: string; description: string; route: string; enabled: boolean }[];
  enabled: string[];
}

const CACHE_KEY = "my-modules";

const fetchModules = () =>
  cachedOnce<ModulesResponse>(CACHE_KEY, () => api<ModulesResponse>("/api/modules"));

export interface UseEnabledModulesResult {
  /** Cheile active. Cât timp se încarcă, implicitul (PAR) — ca meniul să nu arate și apoi să ascundă. */
  enabled: ModuleKey[];
  isEnabled: (key: ModuleKey) => boolean;
  status: "loading" | "resolved";
}

export function useEnabledModules(): UseEnabledModulesResult {
  // Shell-ul se remontează la fiecare navigare; valoarea deja rezolvată din cache face
  // remontarea instantanee, fără ca meniul să clipească.
  const cached = peekResolved<ModulesResponse>(CACHE_KEY);
  const [state, setState] = useState<UseEnabledModulesResult>(() => ({
    enabled: (cached?.enabled as ModuleKey[]) ?? DEFAULT_MODULE_KEYS,
    isEnabled: (key) => ((cached?.enabled as ModuleKey[]) ?? DEFAULT_MODULE_KEYS).includes(key),
    status: cached ? "resolved" : "loading",
  }));

  const load = useCallback(async () => {
    try {
      const data = await fetchModules();
      const enabled = (data.enabled ?? DEFAULT_MODULE_KEYS) as ModuleKey[];
      setState({
        enabled,
        isEnabled: (key) => enabled.includes(key),
        status: "resolved",
      });
    } catch {
      setState({
        enabled: DEFAULT_MODULE_KEYS,
        isEnabled: (key) => DEFAULT_MODULE_KEYS.includes(key),
        status: "resolved",
      });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return state;
}

/**
 * Ce modul păzește o rută /business/*. Ordinea contează: ITPark trăiește SUB /business/fin,
 * deci se verifică primul. Rutele care nu aparțin niciunui modul (tabloul de bord, setările,
 * consola platformei) întorc null — ele nu se închid niciodată.
 */
export function moduleForPath(path: string): ModuleKey | null {
  if (path.startsWith("/business/itpark") || path.startsWith("/business/fin/itpark")) return "itpark";
  if (path.startsWith("/business/fin")) return "findesk";
  if (path.startsWith("/business/docmerge")) return "docmerge";
  if (path.startsWith("/business/par")) return "par";
  return null;
}
