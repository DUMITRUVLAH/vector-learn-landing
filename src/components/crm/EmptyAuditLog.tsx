/**
 * CRM-128 — EmptyAuditLog component
 * Shown in AuditLogPage when there are no audit entries.
 */
import { Shield } from "lucide-react";

export function EmptyAuditLog() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex flex-col items-center justify-center py-16 text-center"
    >
      <Shield className="h-12 w-12 text-muted-foreground mb-4" aria-hidden="true" />
      <h3 className="text-lg font-semibold mb-1">Nicio activitate înregistrată încă</h3>
      <p className="text-sm text-muted-foreground">
        Acţiunile din CRM vor apărea automat aici pe măsură ce se produc.
      </p>
    </div>
  );
}
