/**
 * CRM Faza 9 — drepturile utilizatorului curent, o singură cerere per sesiune de ecran.
 *
 * Se folosește ca să NU arătăm butoane care oricum ar da 403 („Pâlnii", „Etape", „Produse nou").
 * Ascunderea e curtoazie, nu apărare: fiecare rută administrativă are poarta ei pe server
 * (`server/middleware/requireCrmPermission.ts`).
 *
 * Cât timp lista nu s-a încărcat, `can()` întoarce `false`: mai bine un buton care apare o clipă
 * mai târziu decât unul care apare și apoi dispare sub degetul omului.
 */
import { useEffect, useState } from "react";
import { getCrmPermissions, type CrmPermission } from "@/lib/api/crm";

export interface UseCrmPermissions {
  permissions: CrmPermission[];
  role: string | null;
  loading: boolean;
  can: (permission: CrmPermission) => boolean;
}

export function useCrmPermissions(): UseCrmPermissions {
  const [permissions, setPermissions] = useState<CrmPermission[]>([]);
  const [role, setRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
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
  }, []);

  return {
    permissions,
    role,
    loading,
    can: (permission: CrmPermission) => permissions.includes(permission),
  };
}
