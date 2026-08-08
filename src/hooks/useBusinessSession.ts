/**
 * SPLIT-101: useBusinessSession — verifică sesiunea Business Suite.
 *
 * Apelează GET /api/business/auth/me. Dacă răspunsul e 401 sau eroare →
 * sesiunea e invalidă. Componenta consumatoare redirecționează la /business/login.
 *
 * Returnează același shape ca useSession, dar pentru endpoint-ul business.
 */
import { useEffect, useState, useCallback } from "react";
import { api, ApiError } from "@/lib/api";
import { clearSessionCache } from "@/lib/sessionCache";
import { clearApiCache, peekApiCache } from "@/lib/apiCache";

export interface BusinessSessionUser {
  id: string;
  email: string;
  name: string;
  role: string;
}

export interface BusinessSessionTenant {
  id: string;
  name: string;
  slug: string;
  appKind: "business";
}

export interface BusinessSessionData {
  user: BusinessSessionUser;
  tenant: BusinessSessionTenant;
}

type BusinessSessionState =
  | { status: "loading"; data: null; error: null }
  | { status: "authenticated"; data: BusinessSessionData; error: null }
  | { status: "unauthenticated"; data: null; error: null }
  | { status: "error"; data: null; error: string };

const ME_PATH = "/api/business/auth/me";

export function useBusinessSession() {
  // PERF-002: shell-ul, guard-ul și pagina montează fiecare acest hook la fiecare navigare.
  // Pornind din valoarea deja rezolvată din cache, remontarea randează instant conținutul în loc
  // să treacă prin „loading" — asta elimină spinner-ul care apărea la fiecare clic în meniu.
  const cached = peekApiCache<BusinessSessionData>(ME_PATH);
  const [state, setState] = useState<BusinessSessionState>(
    cached
      ? { status: "authenticated", data: cached, error: null }
      : { status: "loading", data: null, error: null }
  );

  const refresh = useCallback(async () => {
    try {
      const data = await api<BusinessSessionData>(ME_PATH);
      setState({ status: "authenticated", data, error: null });
    } catch (err) {
      // 403 = wrong_app sau workspace_suspended (PLATFORM-001). Ambele înseamnă
      // „nu ai ce căuta aici" → tratăm ca sesiune invalidă și trimitem la login,
      // fără un ecran de eroare intermediar.
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        setState({ status: "unauthenticated", data: null, error: null });
      } else {
        setState({
          status: "error",
          data: null,
          error: err instanceof Error ? err.message : "unknown",
        });
      }
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const logout = useCallback(async () => {
    try {
      await api("/api/business/auth/logout", { method: "POST" });
    } catch {
      // ignore
    }
    // Drop cached identity (fin-me, par-me) so a different user doesn't see stale nav/roles.
    clearSessionCache();
    // PERF-002: și cache-ul de cereri — altfel următorul utilizator care se loghează pe același
    // tab ar vedea, pentru câteva minute, identitatea și modulele celui precedent.
    clearApiCache();
    setState({ status: "unauthenticated", data: null, error: null });
  }, []);

  return { ...state, refresh, logout };
}
