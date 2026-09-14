/**
 * CRM Faza 9 — fila „Istoric": aceeași persoană, alte leaduri.
 *
 * Portare din crm-vector (PersonHistorySection). Omul revine: a cerut o ofertă acum un an, a
 * refuzat, acum sună din nou. Fără ecranul ăsta, vânzătorul pornește de la zero și repetă oferta
 * refuzată — cu aceleași cuvinte și același preț.
 *
 * Legătura se face pe server, pe telefonul/emailul normalizate. Leadurile rămân separate: nu e
 * deduplicare, e doar vizibilitate între ele.
 */
import { useEffect, useState } from "react";
import { Loader2, History, ArrowRight } from "lucide-react";
import { Badge, Button } from "@/components/ds";
import { getCrmPersonHistory, type CrmLead, type CrmLeadInteraction, type CrmStage } from "@/lib/api/crm";
import { crmStageLabel } from "@/components/crm/constants";
import { formatCents, leadTitle } from "@/components/crm/format";

export interface LeadPersonHistoryTabProps {
  leadId: string;
  stages: readonly CrmStage[];
  /** Deschide un lead înrudit în aceeași fișă — altfel istoricul ar fi o listă moartă. */
  onOpenLead: (leadId: string) => void;
}

export function LeadPersonHistoryTab({ leadId, stages, onOpenLead }: LeadPersonHistoryTabProps) {
  const [leads, setLeads] = useState<CrmLead[]>([]);
  const [notesByLead, setNotesByLead] = useState<Record<string, CrmLeadInteraction[]>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getCrmPersonHistory(leadId)
      .then((res) => {
        if (cancelled) return;
        setLeads(res.leads);
        setNotesByLead(res.notesByLead);
      })
      .catch(() => {
        if (cancelled) return;
        setLeads([]);
        setNotesByLead({});
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [leadId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8" role="status">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-label="Se încarcă istoricul persoanei..." />
      </div>
    );
  }

  if (leads.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Nicio altă cerere de la aceeași persoană. Legătura se face după telefon sau email — dacă leadul n-are
        niciunul, nu avem cum ști că e același om.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {leads.map((lead) => {
        const notes = notesByLead[lead.id] ?? [];
        return (
          <li key={lead.id} className="rounded-lg border border-border p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-foreground">{leadTitle(lead)}</p>
                <p className="text-xs text-muted-foreground">
                  {new Date(lead.createdAt).toLocaleDateString("ro-MD", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                  })}
                  {lead.valueCents > 0 && ` · ${formatCents(lead.valueCents)}`}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="secondary">{crmStageLabel(stages, lead.stage)}</Badge>
                <Button variant="ghost" size="sm" onClick={() => onOpenLead(lead.id)}>
                  Deschide
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                </Button>
              </div>
            </div>

            {lead.lostReason && (
              <p className="mt-1.5 text-xs text-destructive">Motiv pierdere: {lead.lostReason}</p>
            )}

            {notes.length > 0 && (
              <ul className="mt-2 flex flex-col gap-1.5 border-t border-border pt-2">
                {notes.map((note) => (
                  <li key={note.id} className="flex gap-2 text-xs">
                    <History className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <div className="min-w-0">
                      <p className="whitespace-pre-wrap text-foreground/80">{note.body}</p>
                      <time className="text-[11px] text-muted-foreground" dateTime={note.occurredAt}>
                        {new Date(note.occurredAt).toLocaleDateString("ro-MD", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                        })}
                      </time>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </li>
        );
      })}
    </ul>
  );
}
