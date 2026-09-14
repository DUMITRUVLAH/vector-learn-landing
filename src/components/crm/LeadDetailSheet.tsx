/**
 * CRM (Faza 1) — fișa leadului: click pe un cartonaș din pipeline deschide acest Sheet lateral.
 * Anatomie & click-map de referință: `backlog/crm/CRM-CORE.md` §6 (acolo e pagina completă
 * `/app/leads/:id`; aici e varianta „quick-view" din board, cerută pentru Faza 1).
 *
 * Secțiuni, de sus în jos: Antet (nume/companie/etapă/valoare) → Acțiuni rapide (tel/mailto +
 * mutare etapă) → Detalii (formular editabil, salvare optimistă) → Activitate (timeline +
 * notă nouă + acțiunea rapidă „Am sunat").
 *
 * Fișa își încarcă singură datele (`GET /api/crm/leads/:id/detail`) la fiecare deschidere —
 * nu depinde de cardul din board, ca să poată fi refolosită și dintr-o listă/căutare viitoare.
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Phone,
  Mail,
  Loader2,
  AlertCircle,
  MessageSquare,
  MessageCircle,
  Smartphone,
  Calendar,
  ArrowRightLeft,
  Info,
} from "lucide-react";
import { Sheet, Button, Input, Label, Select, Textarea, Badge, Alert, Skeleton, Separator } from "@/components/ds";
import { cn } from "@/lib/utils";
import {
  getCrmLeadDetail,
  updateCrmLead,
  moveCrmLeadStage,
  createCrmLeadInteraction,
  type CrmLead,
  type CrmLeadDetailResponse,
  type CrmLeadInteraction,
  type CrmInteractionType,
  type CrmLeadSource,
  type CrmStage,
  type UpdateCrmLeadBody,
} from "@/lib/api/crm";
import { CRM_SOURCE_LABEL, crmStageLabel, stageColorClasses } from "@/components/crm/constants";
import { formatCents, leadValueToCents, leadTitle, emptyToNull } from "@/components/crm/format";
import { LostReasonDialog } from "@/components/crm/LostReasonDialog";
import { useTeamMembers } from "@/hooks/useTeamMembers";

export interface LeadDetailSheetToast {
  kind: "success" | "error";
  message: string;
}

export interface LeadDetailSheetProps {
  /** `null` = închis. */
  leadId: string | null;
  /** Etapele curente ale pipeline-ului (aceleași cu cele din board) — populează select-ul de mutare. */
  stages: readonly CrmStage[];
  onClose: () => void;
  /** Apelat după orice mutație persistată cu succes (etapă sau detalii) — board-ul se reîncarcă silențios. */
  onChanged: () => void;
  onToast: (toast: LeadDetailSheetToast) => void;
}

const INTERACTION_LABEL: Record<CrmInteractionType, string> = {
  note: "Notă",
  call: "Apel",
  email: "Email",
  whatsapp: "WhatsApp",
  sms: "SMS",
  meeting: "Întâlnire",
  stage_change: "Schimbare etapă",
  system: "Sistem",
};

const INTERACTION_ICON: Record<CrmInteractionType, ReactNode> = {
  note: <MessageSquare className="h-3.5 w-3.5 text-primary" aria-hidden="true" />,
  call: <Phone className="h-3.5 w-3.5 text-primary" aria-hidden="true" />,
  email: <Mail className="h-3.5 w-3.5 text-primary" aria-hidden="true" />,
  whatsapp: <MessageCircle className="h-3.5 w-3.5 text-success" aria-hidden="true" />,
  sms: <Smartphone className="h-3.5 w-3.5 text-primary" aria-hidden="true" />,
  meeting: <Calendar className="h-3.5 w-3.5 text-primary" aria-hidden="true" />,
  stage_change: <ArrowRightLeft className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />,
  system: <Info className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />,
};

function formatInteractionDate(iso: string): string {
  return new Date(iso).toLocaleString("ro-MD", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

interface DetailFormState {
  fullName: string;
  dealName: string;
  company: string;
  phone: string;
  email: string;
  interestCourse: string;
  valueText: string;
  source: CrmLeadSource;
  /** `""` = neasignat. */
  assignedTo: string;
}

function toFormState(lead: CrmLead): DetailFormState {
  return {
    fullName: lead.fullName,
    dealName: lead.dealName ?? "",
    company: lead.company ?? "",
    phone: lead.phone ?? "",
    email: lead.email ?? "",
    interestCourse: lead.interestCourse ?? "",
    valueText: lead.valueCents > 0 ? String(lead.valueCents / 100) : "",
    source: lead.source as CrmLeadSource,
    assignedTo: lead.assignedTo ?? "",
  };
}

function isFormDirty(form: DetailFormState, lead: CrmLead): boolean {
  const base = toFormState(lead);
  return (Object.keys(base) as (keyof DetailFormState)[]).some((key) => form[key] !== base[key]);
}

export function LeadDetailSheet({ leadId, stages, onClose, onChanged, onToast }: LeadDetailSheetProps) {
  const [detail, setDetail] = useState<CrmLeadDetailResponse | null>(null);
  const [interactions, setInteractions] = useState<CrmLeadInteraction[]>([]);
  const [form, setForm] = useState<DetailFormState | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savingDetails, setSavingDetails] = useState(false);
  const [movingStage, setMovingStage] = useState(false);
  const [pendingLostStage, setPendingLostStage] = useState<string | null>(null);
  const [noteBody, setNoteBody] = useState("");
  const [addingNote, setAddingNote] = useState(false);
  const [loggingCall, setLoggingCall] = useState(false);

  const { members: teamMembers } = useTeamMembers();

  useEffect(() => {
    if (!leadId) {
      // Reset la închidere — ca redeschiderea altui lead să nu arate, pentru o clipă, datele
      // celui anterior (Sheet-ul rămâne montat între deschideri, nu se reinițializează singur).
      setDetail(null);
      setInteractions([]);
      setForm(null);
      setError(null);
      setNoteBody("");
      setPendingLostStage(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    getCrmLeadDetail(leadId)
      .then((res) => {
        if (cancelled) return;
        setDetail(res);
        setInteractions(res.interactions);
        setForm(toFormState(res.lead));
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Nu am putut încărca leadul.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [leadId]);

  function retryLoad() {
    if (!leadId) return;
    setLoading(true);
    setError(null);
    getCrmLeadDetail(leadId)
      .then((res) => {
        setDetail(res);
        setInteractions(res.interactions);
        setForm(toFormState(res.lead));
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Nu am putut încărca leadul."))
      .finally(() => setLoading(false));
  }

  const lead = detail?.lead ?? null;

  const currentStage = useMemo(() => {
    if (!lead) return null;
    return detail?.stage ?? stages.find((s) => s.key === lead.stage) ?? null;
  }, [detail, lead, stages]);

  const assigneeOptions = useMemo(() => {
    if (!form || !form.assignedTo || teamMembers.some((m) => m.id === form.assignedTo)) return teamMembers;
    // Responsabilul curent nu (mai) e în listă (ex. cont dezactivat) — îl păstrăm ca opțiune, ca
    // salvarea formularului să nu-l șteargă din greșeală doar pentru că select-ul nu-l cunoaște.
    return [...teamMembers, { id: form.assignedTo, fullName: form.assignedTo, email: "", role: "" }];
  }, [teamMembers, form]);

  async function refetchDetail() {
    if (!leadId) return;
    const res = await getCrmLeadDetail(leadId);
    setDetail(res);
    setInteractions(res.interactions);
    setForm(toFormState(res.lead));
  }

  async function applyStageChange(toStage: string, lostReason?: string) {
    if (!leadId || !detail) return;
    const prevDetail = detail;
    setMovingStage(true);
    setDetail((d) => (d ? { ...d, lead: { ...d.lead, stage: toStage } } : d));
    try {
      await moveCrmLeadStage(leadId, { stage: toStage, lostReason });
      onToast({ kind: "success", message: `Lead mutat la „${crmStageLabel(stages, toStage)}”.` });
      // Reîncarcă fișa: serverul a scris deja un `stage_change` în istoric la mutare — vrem să
      // apară în timeline fără un reload de pagină, doar fișa își reia propriile date.
      await refetchDetail();
      onChanged();
    } catch (err) {
      setDetail(prevDetail);
      onToast({ kind: "error", message: err instanceof Error ? err.message : "Nu am putut muta leadul." });
    } finally {
      setMovingStage(false);
    }
  }

  function requestStageChange(toStage: string) {
    if (!lead || toStage === lead.stage) return;
    // Verificată pe FLAG-ul etapei (`isLost`), NU pe cheia literală „lost" — o etapă custom
    // marcată drept pierdută trebuie să ceară motivul la fel ca etapa implicită „Pierdut".
    const target = stages.find((s) => s.key === toStage);
    if (target?.isLost) {
      setPendingLostStage(toStage);
      return;
    }
    void applyStageChange(toStage);
  }

  async function saveDetails() {
    if (!leadId || !detail || !form) return;
    if (form.fullName.trim().length < 2) {
      onToast({ kind: "error", message: "Numele trebuie să aibă cel puțin 2 caractere." });
      return;
    }
    const prevDetail = detail;
    const patch: UpdateCrmLeadBody = {
      fullName: form.fullName.trim(),
      dealName: emptyToNull(form.dealName),
      company: emptyToNull(form.company),
      phone: emptyToNull(form.phone),
      email: emptyToNull(form.email),
      interestCourse: emptyToNull(form.interestCourse),
      valueCents: leadValueToCents(form.valueText),
      source: form.source,
      assignedTo: form.assignedTo ? form.assignedTo : null,
    };
    const optimisticLead: CrmLead = {
      ...detail.lead,
      fullName: patch.fullName ?? detail.lead.fullName,
      dealName: patch.dealName ?? null,
      company: patch.company ?? null,
      phone: patch.phone ?? null,
      email: patch.email ?? null,
      interestCourse: patch.interestCourse ?? null,
      valueCents: patch.valueCents ?? detail.lead.valueCents,
      source: patch.source ?? detail.lead.source,
      assignedTo: patch.assignedTo ?? null,
    };
    setSavingDetails(true);
    setDetail({ ...detail, lead: optimisticLead });
    try {
      const saved = await updateCrmLead(leadId, patch);
      setDetail((d) => (d ? { ...d, lead: saved } : d));
      setForm(toFormState(saved));
      onToast({ kind: "success", message: "Modificări salvate." });
      onChanged();
    } catch (err) {
      setDetail(prevDetail);
      setForm(toFormState(prevDetail.lead));
      onToast({ kind: "error", message: err instanceof Error ? err.message : "Nu am putut salva modificările." });
    } finally {
      setSavingDetails(false);
    }
  }

  async function addNote() {
    if (!leadId || !noteBody.trim()) return;
    setAddingNote(true);
    try {
      const created = await createCrmLeadInteraction(leadId, { type: "note", body: noteBody.trim() });
      setInteractions((prev) => [created, ...prev]);
      setNoteBody("");
    } catch (err) {
      onToast({ kind: "error", message: err instanceof Error ? err.message : "Nu am putut salva nota." });
    } finally {
      setAddingNote(false);
    }
  }

  async function logCall() {
    if (!leadId) return;
    setLoggingCall(true);
    try {
      const created = await createCrmLeadInteraction(leadId, { type: "call", direction: "outbound" });
      setInteractions((prev) => [created, ...prev]);
      onToast({ kind: "success", message: "Apel notat în istoric." });
    } catch (err) {
      onToast({ kind: "error", message: err instanceof Error ? err.message : "Nu am putut nota apelul." });
    } finally {
      setLoggingCall(false);
    }
  }

  const title = lead ? leadTitle(lead) : "Se încarcă...";
  const dirty = form && lead ? isFormDirty(form, lead) : false;

  return (
    <>
      <Sheet open={leadId !== null} onClose={onClose} title={title} description={lead?.company ?? undefined} size="lg">
        {loading && (
          <div className="flex flex-col gap-3" role="status" aria-label="Se încarcă fișa leadului">
            <Skeleton className="h-5 w-1/2" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        )}

        {!loading && error && (
          <Alert variant="destructive" icon={<AlertCircle className="h-4 w-4" aria-hidden="true" />}>
            <div className="flex flex-col gap-2">
              <p>{error}</p>
              <Button variant="outline" size="sm" className="w-fit" onClick={retryLoad}>
                Reîncearcă
              </Button>
            </div>
          </Alert>
        )}

        {!loading && !error && lead && form && (
          <div className="flex flex-col gap-6">
            {/* Antet */}
            <div className="flex flex-wrap items-center gap-2">
              {currentStage && (
                <Badge
                  className={cn(
                    stageColorClasses(currentStage.color).bg,
                    stageColorClasses(currentStage.color).fg,
                    "border-transparent"
                  )}
                >
                  {currentStage.label}
                </Badge>
              )}
              {lead.valueCents > 0 && (
                <span className="text-sm font-bold tabular-nums text-foreground">{formatCents(lead.valueCents)}</span>
              )}
            </div>

            {/* Acțiuni rapide */}
            <section className="flex flex-col gap-3">
              <h3 className="text-sm font-semibold text-foreground">Acțiuni rapide</h3>
              <div className="flex flex-wrap items-center gap-2">
                {lead.phone && (
                  <QuickActionLink href={`tel:${lead.phone}`} icon={<Phone className="h-4 w-4" aria-hidden="true" />}>
                    Sună
                  </QuickActionLink>
                )}
                {lead.email && (
                  <QuickActionLink href={`mailto:${lead.email}`} icon={<Mail className="h-4 w-4" aria-hidden="true" />}>
                    Email
                  </QuickActionLink>
                )}
                <Button variant="outline" size="sm" onClick={() => void logCall()} disabled={loggingCall}>
                  {loggingCall ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Phone className="h-4 w-4" aria-hidden="true" />
                  )}
                  Am sunat
                </Button>
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor="lead-sheet-stage">Etapă</Label>
                <Select
                  id="lead-sheet-stage"
                  value={lead.stage}
                  disabled={movingStage}
                  onChange={(e) => requestStageChange(e.target.value)}
                >
                  {stages.map((s) => (
                    <option key={s.key} value={s.key}>
                      {s.label}
                    </option>
                  ))}
                </Select>
              </div>
            </section>

            <Separator />

            {/* Detalii */}
            <section className="flex flex-col gap-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-foreground">Detalii</h3>
                <Button size="sm" onClick={() => void saveDetails()} disabled={!dirty || savingDetails}>
                  {savingDetails && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                  Salvează
                </Button>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1 sm:col-span-2">
                  <Label htmlFor="lead-sheet-name" required>
                    Nume
                  </Label>
                  <Input
                    id="lead-sheet-name"
                    value={form.fullName}
                    onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                  />
                </div>
                <div className="flex flex-col gap-1 sm:col-span-2">
                  <Label htmlFor="lead-sheet-company">Companie</Label>
                  <Input
                    id="lead-sheet-company"
                    value={form.company}
                    onChange={(e) => setForm({ ...form, company: e.target.value })}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor="lead-sheet-phone">Telefon</Label>
                  <Input
                    id="lead-sheet-phone"
                    type="tel"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor="lead-sheet-email">Email</Label>
                  <Input
                    id="lead-sheet-email"
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor="lead-sheet-interest">Curs / interes</Label>
                  <Input
                    id="lead-sheet-interest"
                    value={form.interestCourse}
                    onChange={(e) => setForm({ ...form, interestCourse: e.target.value })}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor="lead-sheet-value">Valoare (MDL)</Label>
                  <Input
                    id="lead-sheet-value"
                    type="text"
                    inputMode="decimal"
                    value={form.valueText}
                    onChange={(e) => setForm({ ...form, valueText: e.target.value.replace(/[^\d.,]/g, "") })}
                    placeholder="ex: 1500"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor="lead-sheet-source">Sursă</Label>
                  <Select
                    id="lead-sheet-source"
                    value={form.source}
                    onChange={(e) => setForm({ ...form, source: e.target.value as CrmLeadSource })}
                  >
                    {Object.entries(CRM_SOURCE_LABEL).map(([key, label]) => (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor="lead-sheet-assignee">Responsabil</Label>
                  <Select
                    id="lead-sheet-assignee"
                    value={form.assignedTo}
                    onChange={(e) => setForm({ ...form, assignedTo: e.target.value })}
                  >
                    <option value="">— Neasignat —</option>
                    {assigneeOptions.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.fullName}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>
            </section>

            <Separator />

            {/* Activitate */}
            <section className="flex flex-col gap-3">
              <h3 className="text-sm font-semibold text-foreground">Activitate</h3>
              <div className="flex flex-col gap-2">
                <Label htmlFor="lead-sheet-note" className="sr-only">
                  Notă nouă
                </Label>
                <Textarea
                  id="lead-sheet-note"
                  value={noteBody}
                  onChange={(e) => setNoteBody(e.target.value)}
                  placeholder="Adaugă o notă..."
                  rows={2}
                />
                <Button size="sm" className="w-fit" onClick={() => void addNote()} disabled={!noteBody.trim() || addingNote}>
                  {addingNote && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                  Adaugă notă
                </Button>
              </div>
              <ul className="flex flex-col gap-2">
                {interactions.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nicio interacțiune încă.</p>
                ) : (
                  interactions.map((item) => (
                    <li key={item.id} className="flex gap-2">
                      <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted">
                        {INTERACTION_ICON[item.type]}
                      </div>
                      <div className="flex-1 rounded-lg border border-border bg-card p-2.5">
                        <div className="mb-0.5 flex items-center justify-between gap-2">
                          <span className="text-xs font-semibold text-foreground">{INTERACTION_LABEL[item.type]}</span>
                          <time className="text-[11px] text-muted-foreground" dateTime={item.occurredAt}>
                            {formatInteractionDate(item.occurredAt)}
                          </time>
                        </div>
                        {item.body && <p className="whitespace-pre-wrap text-sm text-foreground/80">{item.body}</p>}
                      </div>
                    </li>
                  ))
                )}
              </ul>
            </section>
          </div>
        )}
      </Sheet>

      <LostReasonDialog
        open={pendingLostStage !== null}
        onCancel={() => setPendingLostStage(null)}
        onConfirm={(reason) => {
          const target = pendingLostStage;
          setPendingLostStage(null);
          if (target) void applyStageChange(target, reason);
        }}
      />
    </>
  );
}

/**
 * `Button` din design system rutează `href` prin router-ul intern (prefix `#`, vezi
 * `Button.tsx` + `HashRouter`) — greșit pentru `tel:`/`mailto:`, care au nevoie de navigare
 * reală de browser, nu de client-side routing. De-aici un `<a>` simplu, stilizat ca `outline`.
 */
function QuickActionLink({ href, icon, children }: { href: string; icon: ReactNode; children: ReactNode }) {
  return (
    <a
      href={href}
      className="inline-flex h-10 max-sm:h-11 items-center justify-center gap-2 rounded-md border border-input bg-background px-4 text-sm font-medium text-foreground transition-colors hover:bg-accent/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      {icon}
      {children}
    </a>
  );
}
