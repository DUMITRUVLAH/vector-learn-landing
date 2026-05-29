import { useEffect, useState, useCallback } from "react";
import { api, ApiError } from "@/lib/api";

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: "admin" | "manager" | "teacher" | "receptionist" | "student" | "parent";
}

export interface SessionTenant {
  id: string;
  name: string;
  slug: string;
  plan: "starter" | "growth" | "pro" | "enterprise";
}

export interface SessionData {
  user: SessionUser;
  tenant: SessionTenant;
}

type SessionState =
  | { status: "loading"; data: null; error: null }
  | { status: "authenticated"; data: SessionData; error: null }
  | { status: "unauthenticated"; data: null; error: null }
  | { status: "error"; data: null; error: string };

export function useSession() {
  const [state, setState] = useState<SessionState>({
    status: "loading",
    data: null,
    error: null,
  });

  const refresh = useCallback(async () => {
    try {
      const data = await api<SessionData>("/api/auth/me");
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
      await api("/api/auth/logout", { method: "POST" });
    } catch {
      // ignore
    }
    setState({ status: "unauthenticated", data: null, error: null });
  }, []);

  return { ...state, refresh, logout };
}
