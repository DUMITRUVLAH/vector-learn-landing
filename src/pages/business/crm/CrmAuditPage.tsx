/**
 * CRM Faza 9 — jurnalul CRM: cine ce a schimbat.
 *
 * Portare din crm-vector (`AuditLog.tsx`), dar peste jurnalul care exista deja în FinFlow
 * (`audit_log`), nu peste unul nou. Intrările CRM sunt cele cu prefixul `crm.`.
 *
 * Traducerea în română a acțiunilor e o funcție pură, exportată: un cod ca
 * „crm.lead.stage_changed" nu spune nimic cuiva care vrea să afle cine a mutat leadul.
 */
import { useCallback, useEffect, useState } from "react";
import { AlertCircle, History, Loader2 } from "lucide-react";
import { BusinessShell } from "@/components/business/BusinessShell";
import { Alert, Button, EmptyState, Label, Select, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ds";
import { listCrmAudit, type CrmAuditEntry } from "@/lib/api/crm";
import { ApiError } from "@/lib/api";

/** Ce s-a întâmplat, în cuvinte. Pură — testabilă fără ecran. */
export function describeCrmAction(actionType: string): string {
  const map: Record<string, string> = {
    "crm.lead.created": "Lead creat",
    "crm.lead.updated": "Lead modificat",
    "crm.lead.stage_changed": "Lead mutat între etape",
    "crm.lead.pipeline_changed": "Lead mutat în altă pâlnie",
    "crm.pipeline.created": "Pâlnie creată",
    "crm.pipeline.renamed": "Pâlnie redenumită",
    "crm.pipeline.deleted": "Pâlnie ștearsă",
    "crm.stage.created": "Etapă adăugată",
    "crm.stage.updated": "Etapă modificată",
    "crm.stage.deleted": "Etapă ștearsă",
    "crm.cadence.created": "Cadență creată",
    "crm.cadence.deleted": "Cadență ștearsă",
    "crm.reengagement_rule.created": "Regulă de reactivare creată",
    "crm.reengagement_rule.updated": "Regulă de reactivare modificată",
    "crm.reengagement_rule.deleted": "Regulă de reactivare ștearsă",
    "crm.custom_field.created": "Câmp personalizat adăugat",
    "crm.custom_field.deleted": "Câmp personalizat șters",
  };
  // Necunoscutul se arată ca atare, nu se ascunde: o acțiune nouă trebuie să se vadă în jurnal
  // chiar înainte să apuce cineva să-i scrie eticheta.
  return map[actionType] ?? actionType.replace(/^crm\./, "");
}

const TARGET_LABELS: Record<string, string> = {
  crm_lead: "Lead",
  crm_pipeline: "Pâlnie",
  crm_stage: "Etapă",
  crm_cadence: "Cadență",
  crm_reengagement_rule: "Regulă reactivare",
  crm_custom_field: "Câmp personalizat",
};

/** Valorile schimbate, pe scurt: „etapă: new → paid". */
function describeValues(entry: CrmAuditEntry): string {
  const before = (entry.oldValue ?? null) as Record<string, unknown> | null;
  const after = (entry.newValue ?? null) as Record<string, unknown> | null;
  if (!before && !after) return "—";
  const keys = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]);
  const parts: string[] = [];
  for (const key of keys) {
    const from = before?.[key];
    const to = after?.[key];
    if (from === undefined && to === undefined) continue;
    if (from === undefined) parts.push(`${key}: ${format(to)}`);
    else if (to === undefined) parts.push(`${key}: ${format(from)} → —`);
    else parts.push(`${key}: ${format(from)} → ${format(to)}`);
  }
  return parts.length > 0 ? parts.join(" · ") : "—";
}

function format(value: unknown): string {
  if (value === null) return "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export function CrmAuditPage() {
  const [items, setItems] = useState<CrmAuditEntry[]>([]);
  const [targetType, setTargetType] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listCrmAudit(targetType ? { targetType } : {});
      setItems(res.items);
    } catch (err) {
      // 403 nu e o eroare de sistem, e un răspuns: omul n-are dreptul. Se spune, nu se arată roșu.
      if (err instanceof ApiError && err.status === 403) setForbidden(true);
      else setError(err instanceof Error ? err.message : "Nu am putut încărca jurnalul.");
    } finally {
      setLoading(false);
    }
  }, [targetType]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <BusinessShell
      pageTitle="Jurnal CRM"
      pageDescription="Cine ce a schimbat — leaduri, pâlnii, etape, cadențe."
      actions={
        !forbidden && (
          <div className="flex items-center gap-2">
            <Label htmlFor="crm-audit-target" className="shrink-0 text-sm text-muted-foreground">
              Tip
            </Label>
            <Select
              id="crm-audit-target"
              value={targetType}
              onChange={(e) => setTargetType(e.target.value)}
              className="w-[200px]"
            >
              <option value="">Toate</option>
              {Object.entries(TARGET_LABELS).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </Select>
          </div>
        )
      }
    >
      {forbidden ? (
        <EmptyState
          icon={<History className="h-6 w-6" />}
          title="Jurnalul e pentru administratori"
          description="Cere-i unui administrator de workspace dreptul de a vedea jurnalul CRM."
        />
      ) : loading ? (
        <div className="flex items-center justify-center py-16" role="status">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="Se încarcă jurnalul..." />
        </div>
      ) : error ? (
        <Alert variant="destructive" icon={<AlertCircle className="h-4 w-4" aria-hidden="true" />}>
          <div className="flex flex-col gap-2">
            <p>{error}</p>
            <Button variant="outline" size="sm" className="w-fit" onClick={() => void load()}>
              Reîncearcă
            </Button>
          </div>
        </Alert>
      ) : items.length === 0 ? (
        <EmptyState
          icon={<History className="h-6 w-6" />}
          title="Nicio modificare înregistrată"
          description="Aici apar schimbările de leaduri, pâlnii, etape și reguli — pe măsură ce se întâmplă."
        />
      ) : (
        <Table aria-label="Jurnalul modificărilor CRM">
          <TableHeader>
            <TableRow>
              <TableHead className="whitespace-nowrap">Când</TableHead>
              <TableHead className="whitespace-nowrap">Cine</TableHead>
              <TableHead>Ce</TableHead>
              <TableHead>Detalii</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((entry) => (
              <TableRow key={entry.id}>
                <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                  {new Date(entry.occurredAt).toLocaleString("ro-MD", {
                    day: "2-digit",
                    month: "2-digit",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </TableCell>
                <TableCell className="whitespace-nowrap text-sm">{entry.actorName ?? "—"}</TableCell>
                <TableCell className="text-sm font-medium text-foreground">
                  {describeCrmAction(entry.actionType)}
                  <span className="ml-1 text-xs text-muted-foreground">
                    ({TARGET_LABELS[entry.targetType] ?? entry.targetType})
                  </span>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">{describeValues(entry)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </BusinessShell>
  );
}
