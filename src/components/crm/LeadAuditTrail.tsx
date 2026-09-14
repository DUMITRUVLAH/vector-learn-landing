/**
 * CRM Faza 9 — urma modificărilor pe UN lead, în fila „Istoric".
 *
 * Cronologia de sub „Activitate" spune ce s-a DISCUTAT cu clientul (note, apeluri, mesaje).
 * Asta spune ce s-a SCHIMBAT în fișa lui și de către cine — două întrebări diferite, ținute
 * separat înadins.
 *
 * Se ascunde singură dacă omul n-are dreptul `audit.view` (serverul răspunde 403): un bloc gol
 * cu titlu ar sugera că lipsesc date, când de fapt lipsește dreptul.
 */
import { useEffect, useState } from "react";
import { Loader2, ShieldCheck } from "lucide-react";
import { listCrmAudit, type CrmAuditEntry } from "@/lib/api/crm";

export interface LeadAuditTrailProps {
  leadId: string;
}

/** Aceleași etichete ca în ecranul de jurnal, dar doar cele care pot atinge un lead. */
const ACTION_LABELS: Record<string, string> = {
  "crm.lead.created": "Lead creat",
  "crm.lead.updated": "Fișă modificată",
  "crm.lead.stage_changed": "Mutat între etape",
  "crm.lead.pipeline_changed": "Mutat în altă pâlnie",
};

function describeValues(entry: CrmAuditEntry): string | null {
  const before = (entry.oldValue ?? null) as Record<string, unknown> | null;
  const after = (entry.newValue ?? null) as Record<string, unknown> | null;
  if (!before && !after) return null;
  const keys = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]);
  const parts: string[] = [];
  for (const key of keys) {
    const from = before?.[key];
    const to = after?.[key];
    if (from === undefined && to === undefined) continue;
    const fmt = (v: unknown) => (v === null ? "—" : typeof v === "object" ? JSON.stringify(v) : String(v));
    parts.push(from === undefined ? `${key}: ${fmt(to)}` : `${key}: ${fmt(from)} → ${fmt(to)}`);
  }
  return parts.length > 0 ? parts.join(" · ") : null;
}

export function LeadAuditTrail({ leadId }: LeadAuditTrailProps) {
  const [items, setItems] = useState<CrmAuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    listCrmAudit({ targetId: leadId, limit: 50 })
      .then((res) => {
        if (!cancelled) setItems(res.items);
      })
      .catch(() => {
        // 403 (fără drept) sau server în urma codului — în ambele cazuri blocul nu apare.
        if (!cancelled) setHidden(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [leadId]);

  if (hidden || loading || items.length === 0) {
    return loading && !hidden ? (
      <div className="flex items-center justify-center py-4" role="status">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-label="Se încarcă modificările..." />
      </div>
    ) : null;
  }

  return (
    <section className="flex flex-col gap-2 border-t border-border pt-4">
      <h4 className="inline-flex items-center gap-1.5 text-sm font-semibold text-foreground">
        <ShieldCheck className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        Modificări în fișă
      </h4>
      <ul className="flex flex-col gap-1.5">
        {items.map((entry) => {
          const details = describeValues(entry);
          return (
            <li key={entry.id} className="flex flex-wrap items-baseline gap-x-2 text-xs">
              <time className="tabular-nums text-muted-foreground" dateTime={entry.occurredAt}>
                {new Date(entry.occurredAt).toLocaleString("ro-MD", {
                  day: "2-digit",
                  month: "2-digit",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </time>
              <span className="font-medium text-foreground">
                {ACTION_LABELS[entry.actionType] ?? entry.actionType.replace(/^crm\./, "")}
              </span>
              <span className="text-muted-foreground">· {entry.actorName ?? "—"}</span>
              {details && <span className="w-full text-muted-foreground">{details}</span>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
