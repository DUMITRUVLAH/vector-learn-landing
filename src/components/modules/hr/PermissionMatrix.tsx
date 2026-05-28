import { useState } from "react";
import { Check, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type Role = "admin" | "manager" | "teacher" | "receptionist";
export type Action =
  | "view_students"
  | "edit_students"
  | "view_payments"
  | "edit_payments"
  | "send_messages"
  | "export_data";

interface RoleMeta {
  id: Role;
  label: string;
  description: string;
}

interface ActionMeta {
  id: Action;
  label: string;
}

const ROLES: RoleMeta[] = [
  { id: "admin", label: "Administrator", description: "Acces complet, plus billing" },
  { id: "manager", label: "Manager", description: "Conduce operațional o filială" },
  { id: "teacher", label: "Profesor", description: "Vede doar grupele lui" },
  { id: "receptionist", label: "Recepționer", description: "Front-office, leaduri" },
];

const ACTIONS: ActionMeta[] = [
  { id: "view_students", label: "Vede lista elevilor" },
  { id: "edit_students", label: "Editează profile elevi" },
  { id: "view_payments", label: "Vede plățile" },
  { id: "edit_payments", label: "Editează plățile" },
  { id: "send_messages", label: "Trimite mesaje în masă" },
  { id: "export_data", label: "Exportă date GDPR" },
];

type Matrix = Record<Role, Record<Action, boolean>>;

export const DEFAULT_MATRIX: Matrix = {
  admin: {
    view_students: true,
    edit_students: true,
    view_payments: true,
    edit_payments: true,
    send_messages: true,
    export_data: true,
  },
  manager: {
    view_students: true,
    edit_students: true,
    view_payments: true,
    edit_payments: false,
    send_messages: true,
    export_data: false,
  },
  teacher: {
    view_students: true,
    edit_students: false,
    view_payments: false,
    edit_payments: false,
    send_messages: false,
    export_data: false,
  },
  receptionist: {
    view_students: true,
    edit_students: true,
    view_payments: true,
    edit_payments: false,
    send_messages: true,
    export_data: false,
  },
};

export function countPermissions(matrix: Matrix, role: Role): number {
  return Object.values(matrix[role]).filter(Boolean).length;
}

export function PermissionMatrix() {
  const [matrix, setMatrix] = useState<Matrix>(DEFAULT_MATRIX);

  const toggle = (role: Role, action: Action) => {
    setMatrix((prev) => ({
      ...prev,
      [role]: { ...prev[role], [action]: !prev[role][action] },
    }));
  };

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-md">
      <div className="border-b border-border bg-muted/30 px-5 py-4">
        <h3 className="text-base font-bold">Matrice permisiuni — configurabilă</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Click pe orice celulă ca să schimbi permisiunea. Salvezi din panou pentru a aplica live.
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/20">
              <th scope="col" className="text-left text-[10px] font-semibold uppercase tracking-wide text-muted-foreground px-4 py-3">
                Acțiune
              </th>
              {ROLES.map((role) => (
                <th key={role.id} scope="col" className="text-center text-[10px] font-semibold uppercase tracking-wide text-muted-foreground px-3 py-3 min-w-[110px]">
                  <p className="text-foreground font-bold text-xs normal-case">{role.label}</p>
                  <p className="text-[9px] text-muted-foreground font-normal normal-case mt-0.5">
                    {role.description}
                  </p>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {ACTIONS.map((action) => (
              <tr key={action.id} className="hover:bg-muted/20">
                <th scope="row" className="text-left text-xs font-medium text-foreground px-4 py-2.5">
                  {action.label}
                </th>
                {ROLES.map((role) => {
                  const allowed = matrix[role.id][action.id];
                  return (
                    <td key={role.id} className="text-center px-3 py-2">
                      <button
                        type="button"
                        onClick={() => toggle(role.id, action.id)}
                        aria-label={`${role.label}: ${action.label} ${allowed ? "permis" : "interzis"}`}
                        aria-pressed={allowed}
                        data-testid={`perm-${role.id}-${action.id}`}
                        className={cn(
                          "inline-flex h-7 w-7 items-center justify-center rounded-md transition-all",
                          allowed
                            ? "bg-success/15 text-success hover:bg-success/25"
                            : "bg-muted text-muted-foreground/50 hover:bg-muted-foreground/10"
                        )}
                      >
                        {allowed ? <Check className="h-4 w-4" strokeWidth={2.5} /> : <X className="h-4 w-4" />}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
            <tr className="bg-muted/10 border-t-2 border-border">
              <th scope="row" className="text-left text-[10px] font-semibold uppercase tracking-wide text-muted-foreground px-4 py-2.5">
                Total permis
              </th>
              {ROLES.map((role) => (
                <td key={role.id} className="text-center px-3 py-2.5">
                  <span data-testid={`perm-total-${role.id}`} className="text-xs font-bold tabular-nums">
                    {countPermissions(matrix, role.id)}/{ACTIONS.length}
                  </span>
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
