/**
 * PLATFORM-403 — client pentru „intră în contul lui X" (testare/suport de către superadmin).
 * Vezi `server/routes/impersonation.ts` pentru reguli și limite.
 */
import { api } from "@/lib/api";

export interface ImpersonationStatus {
  active: boolean;
  actor?: { email: string; name: string } | null;
  target?: { id: string; email: string; name: string; role: string };
  workspace?: { id: string; name: string; appKind: string } | null;
  expiresAt?: string;
}

export const getImpersonationStatus = () =>
  api<ImpersonationStatus>("/api/impersonation/status");

export const startImpersonation = (userId: string) =>
  api<{
    ok: true;
    user: { id: string; email: string; name: string; role: string };
    workspace: { id: string; name: string; appKind: string } | null;
    expiresAt: string;
    redirect: string;
  }>("/api/impersonation/start", { method: "POST", body: JSON.stringify({ userId }) });

export const stopImpersonation = () =>
  api<{ ok: true; restored: boolean; redirect: string }>("/api/impersonation/stop", { method: "POST" });

/** Mesaje pentru refuzurile serverului — codul brut nu spune nimic utilizatorului. */
export const IMPERSONATION_REFUSALS: Record<string, string> = {
  target_not_found: "Utilizatorul nu mai există.",
  target_is_self: "Ești deja în propriul cont.",
  target_is_platform_admin: "Nu poți intra în contul altui administrator de platformă.",
  target_disabled: "Contul este dezactivat — reactivează-l întâi.",
  already_impersonating: "Ieși din contul curent înainte de a intra în altul.",
  platform_admin_required: "Doar administratorii platformei pot folosi această funcție.",
};
