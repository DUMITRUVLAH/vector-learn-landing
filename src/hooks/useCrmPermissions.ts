/**
 * CRM Faza 9 — drepturile utilizatorului curent, o singură cerere per sesiune de ecran.
 *
 * Se folosește ca să NU arătăm butoane care oricum ar da 403 („Pâlnii", „Etape", „Produse nou").
 * Ascunderea e curtoazie, nu apărare: fiecare rută administrativă are poarta ei pe server
 * (`server/middleware/requireCrmPermission.ts`).
 *
 * Cât timp lista nu s-a încărcat, `can()` întoarce `false`: mai bine un buton care apare o clipă
 * mai târziu decât unul care apare și apoi dispare sub degetul omului.
 *
 * CRM-SIDEBAR: `enabled: false` nu interoghează nimic. Meniul lateral cere drepturile ca să
 * ascundă rândurile administrative, dar el trăiește pe TOATE rutele /business/*; fără comutator,
 * fiecare pagină de PAR sau FinDesk ar fi tras după ea un GET /api/crm/permissions degeaba.
 * Răspunsul NU se pune în `sessionCache`: drepturile se schimbă din ecranul de administrare, iar
 * un cache de 5 minute ar ținut ascuns un rând pe care omul îl primise deja.
 */
import { useEffect, useState } from "react";
import { getCrmPermissions, type CrmPermission } from "@/lib/api/crm";

export interface UseCrmPermissions {
  permissions: CrmPermission[];
  role: string | null;
  loading: boolean;
  can: (permission: CrmPermission) => boolean;
}

export interface UseCrmPermissionsOptions {
  /** `false` = nu interoga serverul (ex. meniul, când nu ești pe o rută CRM). Implicit `true`. */
  enabled?: boolean;
}

export function useCrmPermissions(options: UseCrmPermissionsOptions = {}): UseCrmPermissions {
  const enabled = options.enabled ?? true;
  const [permissions, setPermissions] = useState<CrmPermission[]>([]);
  const [role, setRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(enabled);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    getCrmPermissions()
      .then((res) => {
        if (cancelled) return;
        setPermissions(res.permissions);
        setRole(res.role);
      })
      .catch(() => {
        // Serverul poate fi în urma codului (endpoint nou). Nu blocăm ecranul: rămâne lista
        // goală, iar butoanele administrative nu apar — exact ce s-ar întâmpla la un 403.
        if (!cancelled) setPermissions([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return {
    permissions,
    role,
    loading,
    can: (permission: CrmPermission) => permissions.includes(permission),
  };
}
