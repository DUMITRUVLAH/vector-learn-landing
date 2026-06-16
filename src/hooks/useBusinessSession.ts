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

export function useBusinessSession() {
  const [state, setState] = useState<BusinessSessionState>({
    status: "loading",
    data: null,
    error: null,
  });

  const refresh = useCallback(async () => {
    try {
      const data = await api<BusinessSessionData>("/api/business/auth/me");
      setState({ status: "authenticated", data, error: null });
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
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
    setState({ status: "unauthenticated", data: null, error: null });
  }, []);

  return { ...state, refresh, logout };
}
