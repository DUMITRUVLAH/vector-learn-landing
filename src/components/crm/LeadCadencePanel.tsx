/**
 * CRM Faza 9 — cadențele leadului, în fișa lui.
 *
 * Portare din crm-vector (`CadencePanel.tsx`). Fără ecranul ăsta, cadențele erau construibile dar
 * neutilizabile: singura cale de înscriere rămânea etapa declanșatoare (automată) — adică un lead
 * nu putea fi urmărit manual, deși exact asta ceri când clientul zice „sună-mă peste o săptămână".
 *
 * Se arată DOAR dacă workspace-ul are cadențe: altfel ar fi o secțiune goală pe fiecare fișă, în
 * fiecare zi, pentru toată lumea.
 */
import { useCallback, useEffect, useState } from "react";
import { Loader2, Play, X, Clock } from "lucide-react";
import { Badge, Button, Label, Select } from "@/components/ds";
import { cn } from "@/lib/utils";
import {
  listCrmCadences,
  listCrmLeadEnrollments,
  enrollCrmLeadInCadence,
  cancelCrmEnrollment,
  type CrmCadence,
  type CrmCadenceEnrollment,
} from "@/lib/api/crm";

export interface LeadCadencePanelProps {
  leadId: string;
  onToast: (toast: { kind: "success" | "error"; message: string }) => void;
  /** Un pas de cadență creează taskuri — ecranul din jur trebuie să se resincronizeze. */
  onChanged?: () => void;
}

const STATUS_LABEL: Record<CrmCadenceEnrollment["status"], string> = {
  active: "în lucru",
  done: "încheiată",
  cancelled: "oprită",
};

export function LeadCadencePanel({ leadId, onToast, onChanged }: LeadCadencePanelProps) {
  const [cadences, setCadences] = useState<CrmCadence[]>([]);
  const [enrollments, setEnrollments] = useState<CrmCadenceEnrollment[]>([]);
  const [selected, setSelected] = useState("");
  const [loading, setLoading] = useState(true);
  const [enrolling, setEnrolling] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Amândouă listele odată: fără cadențe secțiunea nu se arată deloc, iar fără înscrieri
      // n-avem ce afișa — o cerere pe rând ar face fișa să se așeze în două etape.
      const [cadRes, enrRes] = await Promise.all([
        listCrmCadences().catch(() => ({ items: [] as CrmCadence[] })),
        listCrmLeadEnrollments(leadId).catch(() => ({ items: [] as CrmCadenceEnrollment[] })),
      ]);
      setCadences(cadRes.items.filter((c) => c.enabled));
      setEnrollments(enrRes.items);
    } finally {
      setLoading(false);
    }
  }, [leadId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function enroll() {
    if (!selected) return;
    setEnrolling(true);
    try {
      const created = await enrollCrmLeadInCadence(leadId, selected);
      // Numele vine din listă: răspunsul de la înscriere n-are de unde să-l știe.
      const name = cadences.find((c) => c.id === selected)?.name;
      setEnrollments((prev) => [{ ...created, cadenceName: name }, ...prev]);
      setSelected("");
      onToast({ kind: "success", message: `Lead înscris în „${name ?? "cadență"}”.` });
      onChanged?.();
    } catch (err) {
      onToast({ kind: "error", message: err instanceof Error ? err.message : "Nu am putut înscrie leadul." });
    } finally {
      setEnrolling(false);
    }
  }

  async function cancel(enrollment: CrmCadenceEnrollment) {
    setBusyId(enrollment.id);
    try {
      const updated = await cancelCrmEnrollment(enrollment.id);
      setEnrollments((prev) =>
        prev.map((e) => (e.id === enrollment.id ? { ...updated, cadenceName: e.cadenceName } : e))
      );
    } catch (err) {
      onToast({ kind: "error", message: err instanceof Error ? err.message : "Nu am putut opri cadența." });
    } finally {
      setBusyId(null);
    }
  }

  // Nicio cadență în workspace și nicio înscriere veche → secțiunea nu există.
  if (loading || (cadences.length === 0 && enrollments.length === 0)) return null;

  const activeIds = new Set(enrollments.filter((e) => e.status === "active").map((e) => e.cadenceId));
  const available = cadences.filter((c) => !activeIds.has(c.id));

  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-sm font-semibold text-foreground">Cadențe</h3>

      {enrollments.length > 0 && (
        <ul className="flex flex-col gap-2">
          {enrollments.map((enrollment) => (
            <li
              key={enrollment.id}
              className={cn(
                "flex items-center gap-2 rounded-lg border p-2.5",
                enrollment.status === "active" ? "border-primary/40 bg-primary/5" : "border-border"
              )}
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <p className="text-sm font-medium text-foreground">{enrollment.cadenceName ?? "Cadență"}</p>
                  <Badge variant="secondary">{STATUS_LABEL[enrollment.status]}</Badge>
                </div>
                {enrollment.status === "active" && enrollment.nextFireAt && (
                  <p className="mt-0.5 inline-flex items-center gap-1 text-xs text-muted-foreground">
                    <Clock className="h-3 w-3" aria-hidden="true" />
                    pasul {enrollment.currentStep + 1}, pe{" "}
                    {new Date(enrollment.nextFireAt).toLocaleDateString("ro-MD", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    })}
                  </p>
                )}
              </div>
              {enrollment.status === "active" && (
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Oprește cadența ${enrollment.cadenceName ?? ""}`}
                  onClick={() => void cancel(enrollment)}
                  disabled={busyId === enrollment.id}
                >
                  {busyId === enrollment.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <X className="h-4 w-4" aria-hidden="true" />
                  )}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      {available.length > 0 && (
        <div className="flex items-end gap-2">
          <div className="flex flex-1 flex-col gap-1">
            <Label htmlFor="crm-lead-cadence">Înscrie în cadență</Label>
            <Select id="crm-lead-cadence" value={selected} onChange={(e) => setSelected(e.target.value)}>
              <option value="">— alege —</option>
              {available.map((cadence) => (
                <option key={cadence.id} value={cadence.id}>
                  {cadence.name}
                </option>
              ))}
            </Select>
          </div>
          <Button onClick={() => void enroll()} disabled={!selected || enrolling}>
            {enrolling ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Play className="h-4 w-4" aria-hidden="true" />
            )}
            Înscrie
          </Button>
        </div>
      )}
    </section>
  );
}
