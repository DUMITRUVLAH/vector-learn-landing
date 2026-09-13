/**
 * CRM (Faza 1) — Pipeline: kanban de leaduri pe cele 5 stadii fixe.
 * Spec: `backlog/crm/CRM-CORE.md` §4-5 (state machine + layout + anatomia cardului).
 *
 * Desktop (≥lg): grilă de 5 coloane cu drag & drop HTML5 nativ.
 * Mobil (<lg): aceleași secțiuni, listă simplă — fără drag, mutarea stadiului
 * se face din select-ul de sub fiecare card (e și alternativa de la tastatură
 * pentru desktop).
 *
 * DnD: id-ul leadului circulă prin `e.dataTransfer`, niciodată prin state —
 * altfel handler-ul de `drop` citește o valoare învechită (stale closure).
 */
import { useCallback, useEffect, useState } from "react";
import { Plus, Phone, Mail, Loader2, AlertCircle, Users } from "lucide-react";
import { BusinessShell } from "@/components/business/BusinessShell";
import { Alert, Button, Dialog, EmptyState, Input, Label, Select } from "@/components/ds";
import { cn } from "@/lib/utils";
import {
  getCrmPipeline,
  createCrmLead,
  moveCrmLeadStage,
  type CrmLead,
  type CrmLeadStage,
  type CrmLeadSource,
} from "@/lib/api/crm";
import {
  CRM_STAGES,
  CRM_SOURCE_LABEL,
  CRM_LOST_REASON_PRESETS,
  crmStageLabel,
  crmSourceLabel,
  type CrmStageConfig,
} from "@/components/crm/constants";

// ─── Formatters ───────────────────────────────────────────────────────────────

/**
 * Schema `leads` (`server/db/schema/leads.ts`) nu are un câmp de monedă per lead —
 * `valueCents` e un întreg simplu, în moneda unică a tenantului. Faza 1 fixează
 * MDL (clientul e din Moldova); dacă apare multi-monedă pe leaduri, se adaugă
 * atunci o coloană `currency` reală, nu se ghicește aici.
 */
const LEAD_CURRENCY = "MDL";

/** Aceeași convenție locală ca în restul FinDesk (vezi `FinCalendarPage.tsx`). */
function formatCents(cents: number, currency: string): string {
  return new Intl.NumberFormat("ro-MD", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

/** „1500" / „1.500,50" → cenți. Analog `leiToCents` din `FinInvoiceCreateModal.tsx`. */
function leadValueToCents(text: string): number {
  const n = parseFloat((text || "").replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : 0;
}

/** Titlul cardului: `dealName` (dacă e setat) înlocuiește `fullName` — vezi schema leads. */
function leadTitle(lead: CrmLead): string {
  return lead.dealName || lead.fullName;
}

type ToastState = { kind: "success" | "error"; message: string } | null;

// ─── Pagina principală ─────────────────────────────────────────────────────────

export function CrmPipelinePage() {
  const [grouped, setGrouped] = useState<Record<string, CrmLead[]>>({});
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [valueSums, setValueSums] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [hoverStage, setHoverStage] = useState<string | null>(null);

  const [showAddLead, setShowAddLead] = useState(false);
  const [lostReasonFor, setLostReasonFor] = useState<{ leadId: string } | null>(null);
  const [toast, setToast] = useState<ToastState>(null);

  const loadPipeline = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = opts?.silent ?? false;
    if (!silent) setLoading(true);
    setError(null);
    try {
      const res = await getCrmPipeline();
      setGrouped(res.grouped ?? {});
      setCounts(res.counts ?? {});
      setValueSums(res.valueSums ?? {});
    } catch (err) {
      // La reîncărcare silențioasă (după o mutare optimistă reușită), nu stricăm ecranul cu o
      // eroare — mutarea a mers deja pe server, board-ul local rămâne corect.
      if (!silent) setError(err instanceof Error ? err.message : "Eroare la încărcarea pipeline-ului.");
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPipeline();
  }, [loadPipeline]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const allLeads = Object.values(grouped).flat();

  /**
   * Mută leadul instant în state local (înainte de răspunsul serverului) și recalculează
   * count-urile + Σ valoare pe coloană. Întoarce un `revert()` pentru eșec.
   */
  function moveLeadLocal(leadId: string, toStage: CrmLeadStage) {
    const prevGrouped = grouped;
    const prevCounts = counts;
    const prevValueSums = valueSums;

    let moved: CrmLead | undefined;
    let fromStage: string | undefined;
    const nextGrouped: Record<string, CrmLead[]> = {};
    for (const [key, arr] of Object.entries(grouped)) {
      const idx = arr.findIndex((l) => l.id === leadId);
      if (idx >= 0) {
        moved = { ...arr[idx], stage: toStage };
        fromStage = key;
        nextGrouped[key] = [...arr.slice(0, idx), ...arr.slice(idx + 1)];
      } else {
        nextGrouped[key] = arr;
      }
    }
    if (moved) nextGrouped[toStage] = [moved, ...(nextGrouped[toStage] ?? [])];
    setGrouped(nextGrouped);

    if (moved && fromStage && fromStage !== toStage) {
      const from = fromStage;
      setCounts((c) => ({
        ...c,
        [from]: Math.max(0, (c[from] ?? 0) - 1),
        [toStage]: (c[toStage] ?? 0) + 1,
      }));
      const cents = moved.valueCents ?? 0;
      if (cents > 0) {
        setValueSums((v) => ({
          ...v,
          [from]: Math.max(0, (v[from] ?? 0) - cents),
          [toStage]: (v[toStage] ?? 0) + cents,
        }));
      }
    }

    return () => {
      setGrouped(prevGrouped);
      setCounts(prevCounts);
      setValueSums(prevValueSums);
    };
  }

  async function applyStageChange(leadId: string, toStage: CrmLeadStage, lostReason?: string) {
    const revert = moveLeadLocal(leadId, toStage);
    try {
      await moveCrmLeadStage(leadId, { stage: toStage, lostReason });
      setToast({ kind: "success", message: `Lead mutat la „${crmStageLabel(toStage)}”.` });
      void loadPipeline({ silent: true });
    } catch (err) {
      revert();
      setToast({
        kind: "error",
        message: err instanceof Error ? err.message : "Nu am putut muta leadul.",
      });
    }
  }

  /** → „lost" cere mereu motivul; restul tranzițiilor se aplică direct (orice → orice). */
  function requestStageChange(lead: CrmLead, toStage: CrmLeadStage) {
    if (toStage === lead.stage) return;
    if (toStage === "lost") {
      setLostReasonFor({ leadId: lead.id });
      return;
    }
    void applyStageChange(lead.id, toStage);
  }

  function handleColumnDrop(e: React.DragEvent<HTMLDivElement>, stageKey: CrmLeadStage) {
    e.preventDefault();
    setHoverStage(null);
    // Id-ul vine din dataTransfer, NU din `draggedId` — evită capcana stale-closure.
    const leadId = e.dataTransfer.getData("text/plain");
    setDraggedId(null);
    if (!leadId) return;
    const lead = allLeads.find((l) => l.id === leadId);
    if (!lead) return;
    requestStageChange(lead, stageKey);
  }

  const totalLeads = allLeads.length;
  const paidCount = counts["paid"] ?? 0;
  const conversionRate = totalLeads > 0 ? Math.round((paidCount / totalLeads) * 100) : 0;

  return (
    <BusinessShell
      pageTitle="Pipeline"
      pageDescription={`${totalLeads} lead${totalLeads === 1 ? "" : "uri"} · conversie ${conversionRate}%`}
      actions={
        <Button onClick={() => setShowAddLead(true)}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          Adaugă lead
        </Button>
      }
    >
      {loading ? (
        <div className="flex items-center justify-center py-16" role="status">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="Se încarcă pipeline-ul..." />
        </div>
      ) : error ? (
        <Alert variant="destructive" icon={<AlertCircle className="h-4 w-4" aria-hidden="true" />}>
          <div className="flex flex-col gap-2">
            <p>{error}</p>
            <Button variant="outline" size="sm" onClick={() => void loadPipeline()} className="w-fit">
              Reîncearcă
            </Button>
          </div>
        </Alert>
      ) : totalLeads === 0 ? (
        <EmptyState
          icon={<Users className="h-6 w-6" />}
          title="Niciun lead încă"
          description="Adaugă primul lead pentru a porni pipeline-ul de vânzări."
          action={
            <Button onClick={() => setShowAddLead(true)}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              Adaugă lead
            </Button>
          }
        />
      ) : (
        <>
          {/* Desktop ≥lg: grilă de 5 coloane cu drag & drop */}
          <div
            className="hidden gap-4 lg:grid"
            style={{ gridTemplateColumns: `repeat(${CRM_STAGES.length}, minmax(220px, 1fr))` }}
          >
            {CRM_STAGES.map((stage) => {
              const leads = grouped[stage.key] ?? [];
              const isHover = hoverStage === stage.key && draggedId !== null;
              return (
                <div
                  key={stage.key}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setHoverStage(stage.key);
                  }}
                  onDragLeave={() => setHoverStage(null)}
                  onDrop={(e) => handleColumnDrop(e, stage.key)}
                  className={cn(
                    "flex flex-col gap-2 rounded-2xl bg-muted/40 p-3 transition-colors",
                    isHover && "bg-primary/10 ring-2 ring-primary/40 ring-inset"
                  )}
                  aria-label={`Coloana ${stage.label}`}
                >
                  <StageHeader stage={stage} count={counts[stage.key] ?? 0} valueSum={valueSums[stage.key] ?? 0} />
                  <div className="flex min-h-[96px] flex-col gap-2">
                    {leads.length === 0 ? (
                      <div className="flex h-24 items-center justify-center rounded-lg border border-dashed border-border text-xs text-muted-foreground">
                        Trage aici
                      </div>
                    ) : (
                      leads.map((lead) => (
                        <LeadCard
                          key={lead.id}
                          lead={lead}
                          isDragging={draggedId === lead.id}
                          onDragStart={() => setDraggedId(lead.id)}
                          onDragEnd={() => {
                            setDraggedId(null);
                            setHoverStage(null);
                          }}
                          onChangeStage={(next) => requestStageChange(lead, next)}
                        />
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Mobil (<lg): aceleași secțiuni, fără drag — mutarea vine din select. */}
          <div className="flex flex-col gap-4 lg:hidden">
            {CRM_STAGES.map((stage) => {
              const leads = grouped[stage.key] ?? [];
              return (
                <div key={stage.key} className="flex flex-col gap-2 rounded-2xl bg-muted/40 p-3">
                  <StageHeader stage={stage} count={counts[stage.key] ?? 0} valueSum={valueSums[stage.key] ?? 0} />
                  {leads.length === 0 ? (
                    <p className="px-1 py-2 text-xs text-muted-foreground">Niciun lead în acest stadiu.</p>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {leads.map((lead) => (
                        <LeadCard
                          key={lead.id}
                          lead={lead}
                          isDragging={false}
                          onDragStart={() => {}}
                          onDragEnd={() => {}}
                          onChangeStage={(next) => requestStageChange(lead, next)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      <AddLeadDialog
        open={showAddLead}
        onClose={() => setShowAddLead(false)}
        onCreated={() => {
          setShowAddLead(false);
          setToast({ kind: "success", message: "Lead adăugat în pipeline." });
          void loadPipeline();
        }}
      />

      <LostReasonDialog
        open={lostReasonFor !== null}
        onCancel={() => setLostReasonFor(null)}
        onConfirm={(reason) => {
          const target = lostReasonFor;
          setLostReasonFor(null);
          if (target) void applyStageChange(target.leadId, "lost", reason);
        }}
      />

      {toast && (
        <div
          role="status"
          className={cn(
            "fixed bottom-4 right-4 z-50 rounded-lg border px-4 py-3 text-sm font-medium shadow-lg animate-fade-in",
            toast.kind === "success"
              ? "bg-success/10 border-success/30 text-success"
              : "bg-destructive/10 border-destructive/30 text-destructive"
          )}
        >
          {toast.message}
        </div>
      )}
    </BusinessShell>
  );
}

// ─── Antetul pastelat de coloană ────────────────────────────────────────────────

function StageHeader({
  stage,
  count,
  valueSum,
}: {
  stage: CrmStageConfig;
  count: number;
  valueSum: number;
}) {
  return (
    <div className={cn("rounded-lg p-3", stage.bg)}>
      <div className="flex items-baseline justify-between">
        <p className={cn("text-xs font-bold", stage.fg)}>{stage.label}</p>
        <span className={cn("text-sm font-bold tabular-nums", stage.fg)}>{count}</span>
      </div>
      {valueSum > 0 && (
        <p className={cn("mt-0.5 text-[11px] font-semibold tabular-nums opacity-80", stage.fg)}>
          {formatCents(valueSum, LEAD_CURRENCY)}
        </p>
      )}
    </div>
  );
}

// ─── Cardul de lead (desktop draggable + select de stadiu pt. mobil/tastatură) ──

function LeadCard({
  lead,
  isDragging,
  onDragStart,
  onDragEnd,
  onChangeStage,
}: {
  lead: CrmLead;
  isDragging: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onChangeStage: (stage: CrmLeadStage) => void;
}) {
  const title = leadTitle(lead);
  const subtitle = lead.company || lead.interestCourse;
  return (
    <div
      draggable
      onDragStart={(e) => {
        onDragStart();
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", lead.id);
      }}
      onDragEnd={onDragEnd}
      className={cn(
        "cursor-move rounded-lg border border-border bg-card p-2.5 shadow-sm transition-all",
        "hover:-translate-y-0.5 hover:shadow-md",
        isDragging && "opacity-50"
      )}
    >
      <p className="truncate text-xs font-semibold text-foreground">{title}</p>
      {subtitle && <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{subtitle}</p>}
      <div className="mt-1.5 flex items-center justify-between gap-2">
        <span className="text-[10px] text-muted-foreground">{crmSourceLabel(lead.source)}</span>
        <div className="flex items-center gap-1.5 text-muted-foreground">
          {lead.phone && <Phone className="h-3 w-3" aria-label="Are telefon" />}
          {lead.email && <Mail className="h-3 w-3" aria-label="Are email" />}
        </div>
      </div>
      {lead.valueCents > 0 && (
        <p className="mt-1 text-[11px] font-bold tabular-nums text-foreground">
          {formatCents(lead.valueCents, LEAD_CURRENCY)}
        </p>
      )}
      <div className="mt-2">
        <Label htmlFor={`crm-stage-${lead.id}`} className="sr-only">
          Mutare stadiu pentru {title}
        </Label>
        <Select
          id={`crm-stage-${lead.id}`}
          value={lead.stage}
          onChange={(e) => onChangeStage(e.target.value as CrmLeadStage)}
        >
          {CRM_STAGES.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
            </option>
          ))}
        </Select>
      </div>
    </div>
  );
}

// ─── Dialog „Adaugă lead" ──────────────────────────────────────────────────────

function AddLeadDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [interest, setInterest] = useState("");
  const [source, setSource] = useState("manual");
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Formular curat de fiecare dată când dialogul (re)se deschide.
  useEffect(() => {
    if (!open) return;
    setName("");
    setPhone("");
    setEmail("");
    setCompany("");
    setInterest("");
    setSource("manual");
    setValue("");
    setFormError(null);
  }, [open]);

  async function submit() {
    if (!name.trim()) return;
    setSaving(true);
    setFormError(null);
    try {
      await createCrmLead({
        fullName: name.trim(),
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
        company: company.trim() || undefined,
        interestCourse: interest.trim() || undefined,
        source: source as CrmLeadSource,
        valueCents: value.trim() ? leadValueToCents(value) : undefined,
      });
      onCreated();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Nu am putut salva leadul.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Adaugă lead"
      description="Doar numele e obligatoriu — restul se completează pe parcurs."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Renunță
          </Button>
          <Button onClick={() => void submit()} disabled={!name.trim() || saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            Salvează
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        {formError && <Alert variant="destructive">{formError}</Alert>}
        <div className="flex flex-col gap-1">
          <Label htmlFor="crm-lead-name" required>
            Nume
          </Label>
          <Input id="crm-lead-name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <Label htmlFor="crm-lead-phone">Telefon</Label>
            <Input id="crm-lead-phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="crm-lead-email">Email</Label>
            <Input id="crm-lead-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="crm-lead-company">Companie</Label>
            <Input id="crm-lead-company" value={company} onChange={(e) => setCompany(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="crm-lead-interest">Curs / interes</Label>
            <Input id="crm-lead-interest" value={interest} onChange={(e) => setInterest(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="crm-lead-source">Sursă</Label>
            <Select id="crm-lead-source" value={source} onChange={(e) => setSource(e.target.value)}>
              {Object.entries(CRM_SOURCE_LABEL).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="crm-lead-value">Valoare (MDL)</Label>
            <Input
              id="crm-lead-value"
              type="text"
              inputMode="decimal"
              value={value}
              onChange={(e) => setValue(e.target.value.replace(/[^\d.,]/g, ""))}
              placeholder="ex: 1500"
            />
          </div>
        </div>
      </div>
    </Dialog>
  );
}

// ─── Dialog „Motiv pierdere" ────────────────────────────────────────────────────

function LostReasonDialog({
  open,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  const [custom, setCustom] = useState("");

  useEffect(() => {
    if (!open) return;
    setReason("");
    setCustom("");
  }, [open]);

  const effectiveReason = reason === "Altul" ? custom.trim() : reason;

  return (
    <Dialog
      open={open}
      onClose={onCancel}
      title="Motiv pierdere"
      description="Selectează motivul pentru care leadul a fost pierdut. Câmp obligatoriu."
      footer={
        <>
          <Button variant="ghost" onClick={onCancel}>
            Anulează
          </Button>
          <Button variant="destructive" disabled={!effectiveReason} onClick={() => onConfirm(effectiveReason)}>
            Marchează pierdut
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-1 gap-2" role="radiogroup" aria-label="Motiv pierdere">
          {CRM_LOST_REASON_PRESETS.map((preset) => (
            <label
              key={preset}
              className={cn(
                "flex cursor-pointer items-center gap-2 rounded-lg border p-2.5 text-sm transition-colors",
                reason === preset
                  ? "border-primary bg-primary/10 font-semibold text-primary"
                  : "border-border hover:bg-muted/40"
              )}
            >
              <input
                type="radio"
                name="crm-lost-reason"
                value={preset}
                checked={reason === preset}
                onChange={() => setReason(preset)}
                className="sr-only"
              />
              {preset}
            </label>
          ))}
        </div>
        {reason === "Altul" && (
          <div className="flex flex-col gap-1">
            <Label htmlFor="crm-lost-custom">Detalii</Label>
            <Input
              id="crm-lost-custom"
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              placeholder="Descrie motivul..."
              autoFocus
            />
          </div>
        )}
      </div>
    </Dialog>
  );
}
