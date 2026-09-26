/**
 * CRM — cine ce poate (cerințele 59 și 60 din caietul de sarcini).
 *
 * Ecranul arată matricea reală: pe verticală oamenii, pe orizontală drepturile. O bifă verde
 * înseamnă „poate"; sursa ei se vede din culoare — din ROL (implicit) sau din EXCEPȚIE (scrisă
 * pe om). Fără distincția asta, „de ce poate Maria asta?" n-are răspuns.
 *
 * Click pe o celulă o plimbă prin trei stări: din rol → acordat explicit → retras explicit →
 * înapoi la rol. Trei stări, nu două, fiindcă „retras" trebuie să existe separat: altfel
 * singurul mod de a lua un drept cuiva ar fi să-i schimbi rolul, adică să-i iei și restul.
 */
import { useCallback, useEffect, useState } from "react";
import { AlertCircle, Check, Loader2, Minus, ShieldCheck, X } from "lucide-react";
import { BusinessShell } from "@/components/business/BusinessShell";
import { Alert, Badge, Button, EmptyState, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ds";
import { cn } from "@/lib/utils";
import { ApiError } from "@/lib/api";
import {
  getCrmTeamPermissions,
  setCrmUserPermission,
  type CrmTeamPermissionsResponse,
} from "@/lib/api/crm";

/** Etichete scurte: capul de tabel are 14 coloane, iar „leads.view_all" nu spune nimic nimănui. */
const PERMISSION_LABELS: Record<string, string> = {
  "crm.access": "Intră în CRM",
  "leads.view_all": "Vede toate leadurile",
  "leads.view_own": "Vede leadurile lui",
  "leads.edit": "Editează leaduri",
  "leads.delete": "Șterge / anonimizează",
  "leads.export": "Exportă leaduri",
  "reports.view_team": "Rapoarte pe echipă",
  "reports.view_own": "Rapoartele lui",
  "documents.create": "Face oferte / contracte",
  "products.manage": "Administrează produse",
  "pipelines.manage": "Administrează pâlnii",
  "automations.manage": "Administrează automatizări",
  "assignment.manage": "Administrează distribuirea",
  "cadences.manage": "Administrează cadențe",
  "comms.manage": "Conectează canale de mesaje",
  "audit.view": "Vede jurnalul",
};

const ROLE_LABELS: Record<string, string> = {
  admin: "Administrator",
  manager: "Manager",
  teacher: "Agent",
  receptionist: "Recepție",
  owner: "Proprietar",
};

type CellState = "role" | "granted" | "revoked" | "none";

export function CrmPermissionsPage() {
  const [data, setData] = useState<CrmTeamPermissionsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await getCrmTeamPermissions());
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) setForbidden(true);
      else setError(err instanceof Error ? err.message : "Nu am putut încărca drepturile echipei.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const permissions = Object.keys(PERMISSION_LABELS);

  function stateFor(member: CrmTeamPermissionsResponse["members"][number], permission: string): CellState {
    const override = member.overrides.find((o) => o.permission === permission);
    if (override) return override.granted ? "granted" : "revoked";
    const fromRole = (data?.roleMatrix?.[member.role] ?? []) as string[];
    return fromRole.includes(permission as never) ? "role" : "none";
  }

  /** Ciclul: din rol / fără drept → acordat → retras → înapoi la rol. */
  async function cycle(userId: string, permission: string, current: CellState) {
    const next: boolean | null = current === "granted" ? false : current === "revoked" ? null : true;
    const key = `${userId}:${permission}`;
    setBusy(key);
    try {
      await setCrmUserPermission({ userId, permission, granted: next });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nu am putut schimba dreptul.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <BusinessShell
      pageTitle="Drepturi CRM"
      pageDescription="Cine ce poate face. Rolul dă temelia; excepțiile se scriu pe om."
    >
      {forbidden ? (
        <EmptyState
          icon={<ShieldCheck className="h-6 w-6" />}
          title="Ecranul e pentru administratori"
          description="Cere-i unui administrator de workspace accesul la drepturile echipei."
        />
      ) : loading ? (
        <div className="flex items-center justify-center py-16" role="status">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="Se încarcă drepturile..." />
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {error && (
            <Alert variant="destructive" icon={<AlertCircle className="h-4 w-4" aria-hidden="true" />}>
              {error}
            </Alert>
          )}

          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Check className="h-3.5 w-3.5 text-success" aria-hidden="true" /> din rol
            </span>
            <span className="inline-flex items-center gap-1">
              <Check className="h-3.5 w-3.5 text-primary" aria-hidden="true" /> acordat anume acestui om
            </span>
            <span className="inline-flex items-center gap-1">
              <X className="h-3.5 w-3.5 text-destructive" aria-hidden="true" /> retras, deși rolul îl are
            </span>
            <span className="inline-flex items-center gap-1">
              <Minus className="h-3.5 w-3.5" aria-hidden="true" /> nu poate
            </span>
          </div>

          <Table aria-label="Drepturile echipei">
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[180px]">Om</TableHead>
                {permissions.map((p) => (
                  <TableHead key={p} className="whitespace-nowrap text-center text-[11px]">
                    {PERMISSION_LABELS[p]}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data?.members ?? []).map((m) => (
                <TableRow key={m.id}>
                  <TableCell>
                    <p className="text-sm font-medium text-foreground">{m.name ?? m.email}</p>
                    <Badge variant="secondary">{ROLE_LABELS[m.role] ?? m.role}</Badge>
                  </TableCell>
                  {permissions.map((p) => {
                    const state = stateFor(m, p);
                    const key = `${m.id}:${p}`;
                    return (
                      <TableCell key={p} className="text-center">
                        <button
                          type="button"
                          onClick={() => void cycle(m.id, p, state)}
                          disabled={busy === key}
                          aria-label={`${PERMISSION_LABELS[p]} pentru ${m.name ?? m.email}: ${
                            state === "role"
                              ? "din rol"
                              : state === "granted"
                                ? "acordat"
                                : state === "revoked"
                                  ? "retras"
                                  : "nu poate"
                          }`}
                          className={cn(
                            "inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors hover:bg-muted",
                            state === "role" && "text-success",
                            state === "granted" && "text-primary",
                            state === "revoked" && "text-destructive",
                            state === "none" && "text-muted-foreground/50"
                          )}
                        >
                          {busy === key ? (
                            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                          ) : state === "revoked" ? (
                            <X className="h-4 w-4" aria-hidden="true" />
                          ) : state === "none" ? (
                            <Minus className="h-4 w-4" aria-hidden="true" />
                          ) : (
                            <Check className="h-4 w-4" aria-hidden="true" />
                          )}
                        </button>
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <p className="text-xs text-muted-foreground">
            Click pe o celulă: din rol → acordat anume → retras → înapoi la rol. Verificarea se face pe server la
            fiecare cerere, deci un drept retras se aplică imediat.
          </p>
        </div>
      )}
    </BusinessShell>
  );
}
