/**
 * CRM (Faza 1) — fișa leadului: click pe un cartonaș din pipeline deschide acest Sheet lateral.
 * Anatomie & click-map de referință: `backlog/crm/CRM-CORE.md` §6 (acolo e pagina completă
 * `/app/leads/:id`; aici e varianta „quick-view" din board, cerută pentru Faza 1).
 *
 * Secțiuni, de sus în jos: Antet (nume/companie/etapă/valoare/etichete) → Acțiuni rapide
 * (tel/mailto + mutare etapă) → Taskuri (de făcut pe lead, cu scadență) → Detalii (formular
 * editabil, salvare optimistă) → Activitate (timeline + notă nouă + acțiunea rapidă „Am sunat").
 *
 * Fișa își încarcă singură datele (`GET /api/crm/leads/:id/detail` + taskuri + etichete) la
 * fiecare deschidere — nu depinde de cardul din board, ca să poată fi refolosită și dintr-o
 * listă/căutare viitoare.
 */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
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
  Plus,
  Trash2,
  Clock,
  Check,
  Undo2,
  X,
  FileText,
  ExternalLink,
} from "lucide-react";
import { Sheet, Button, Input, Label, Select, Textarea, Badge, Alert, Skeleton, Separator, Tabs, type TabItem } from "@/components/ds";
import { cn } from "@/lib/utils";
import { Link } from "@/router/HashRouter";
import { docPath } from "@/lib/docs/paths";
import { NewDocumentDialog } from "./NewDocumentDialog";
import { SendEmailDialog } from "./SendEmailDialog";
import { whatsappLink, logCrmTouch } from "@/lib/api/crmComms";
import {
  listCrmDocuments,
  setCrmDocumentOutcome,
  CRM_DOC_KIND_LABELS,
  CRM_DOC_STATUS_LABELS,
  type CrmDocument,
} from "@/lib/api/crmDocuments";
import {
  getCrmLeadDetail,
  updateCrmLead,
  moveCrmLeadStage,
  createCrmLeadInteraction,
  listCrmLeadTasks,
  createCrmLeadTask,
  completeCrmLeadTask,
  reopenCrmLeadTask,
  snoozeCrmLeadTask,
  deleteCrmLeadTask,
  listCrmLeadTags,
  addCrmLeadTag,
  removeCrmLeadTag,
  listCrmTagSuggestions,
  listCrmProducts,
  type CrmProduct,
  type CrmLead,
  type CrmLeadDetailResponse,
  type CrmLeadInteraction,
  type CrmInteractionType,
  type CrmLeadSource,
  type CrmStage,
  type UpdateCrmLeadBody,
  type CrmLeadTask,
  type CrmLeadTag,
} from "@/lib/api/crm";
import { CRM_SOURCE_LABEL, crmStageLabel, stageColorClasses } from "@/components/crm/constants";
import { formatCents, leadValueToCents, leadTitle, emptyToNull } from "@/components/crm/format";
import { LostReasonDialog } from "@/components/crm/LostReasonDialog";
import { LeadContactsTab } from "@/components/crm/LeadContactsTab";
import { LeadFilesTab } from "@/components/crm/LeadFilesTab";
import { LeadPersonHistoryTab } from "@/components/crm/LeadPersonHistoryTab";
import { LeadCustomFields } from "@/components/crm/LeadCustomFields";
import { LeadCadencePanel } from "@/components/crm/LeadCadencePanel";
import { LeadAuditTrail } from "@/components/crm/LeadAuditTrail";
import { LeadGdprPanel } from "@/components/crm/LeadGdprPanel";
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
  /** Apelat după orice mutație persistată cu succes (etapă, detalii sau taskuri) — ecranul
   *  apelant se reîncarcă silențios. Etichetele NU declanșează `onChanged` — nu afectează nicio
   *  gălețică/coloană din ecranele care folosesc fișa (board, „Azi"). */
  onChanged: () => void;
  onToast: (toast: LeadDetailSheetToast) => void;
  /** Deschide alt lead (din fila „Istoric"). Fișa e controlată de părinte prin `leadId`, deci
   *  navigarea între leaduri înrudite trebuie să treacă pe acolo. */
  onOpenLead?: (leadId: string) => void;
}

/** Filele fișei. „Comunicare" lipsește înadins: mesajele trimise apar deja în „Activitate", iar
 *  o filă separată ar fi o A DOUA cronologie a aceluiași lead — exact ce s-a evitat când
 *  `lead_interactions` a fost refolosită în loc de un jurnal nou (PORT-DIN-CRM-VECTOR.md §3). */
type LeadTab = "activitate" | "detalii" | "fisiere" | "contacte" | "acte" | "istoric";

const LEAD_TABS: readonly TabItem<LeadTab>[] = [
  { value: "activitate", label: "Activitate" },
  { value: "detalii", label: "Detalii" },
  { value: "fisiere", label: "Fișiere" },
  { value: "contacte", label: "Contacte" },
  { value: "acte", label: "Acte" },
  { value: "istoric", label: "Istoric" },
];

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

function formatTaskDue(iso: string): string {
  return new Date(iso).toLocaleDateString("ro-MD", { day: "2-digit", month: "short", year: "numeric" });
}

function isTaskOverdue(task: CrmLeadTask): boolean {
  return task.status === "open" && !!task.dueAt && new Date(task.dueAt) < new Date();
}

/** Taskurile deschise/amânate primele (după scadență, fără scadență la urmă), cele încheiate
 *  ultimele — ca lista să nu se umple de rânduri bifate în timp ce cauți ce mai ai de făcut. */
function sortTasksForDisplay(tasks: CrmLeadTask[]): CrmLeadTask[] {
  const pending = tasks
    .filter((t) => t.status !== "done")
    .sort((a, b) => {
      if (!a.dueAt) return 1;
      if (!b.dueAt) return -1;
      return a.dueAt < b.dueAt ? -1 : 1;
    });
  const done = tasks
    .filter((t) => t.status === "done")
    .sort((a, b) => ((a.completedAt ?? "") < (b.completedAt ?? "") ? 1 : -1));
  return [...pending, ...done];
}

interface DetailFormState {
  fullName: string;
  /** Produsul din catalog; „" = niciunul. */
  productId: string;
  /** Câte bucăți se vând; la câștig, atâtea se scad din stoc. „" = 1. */
  productQtyText: string;
  /** Probabilitatea proprie; „" = se moștenește de la etapă. */
  probabilityText: string;
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
    productId: lead.productId ?? "",
    productQtyText: lead.productQty == null ? "" : String(lead.productQty),
    probabilityText: lead.probabilityPct == null ? "" : String(lead.probabilityPct),
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

export function LeadDetailSheet({ leadId, stages, onClose, onChanged, onToast, onOpenLead }: LeadDetailSheetProps) {
  const [tab, setTab] = useState<LeadTab>("activitate");
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
  /** „Ce urmează?" — apare după o activitate care lasă leadul fără niciun pas următor. */
  const [askNextAction, setAskNextAction] = useState(false);

  // Acte (oferte/contracte) — lista e a motorului de acte, CRM-ul doar o arată.
  const [documents, setDocuments] = useState<CrmDocument[]>([]);
  const [newDocOpen, setNewDocOpen] = useState(false);
  /** Actul pe care se marchează chiar acum răspunsul clientului. */
  const [docOutcomeId, setDocOutcomeId] = useState<string | null>(null);
  const [emailOpen, setEmailOpen] = useState(false);

  // Taskuri
  const [tasks, setTasks] = useState<CrmLeadTask[]>([]);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskDueDate, setNewTaskDueDate] = useState("");
  const [addingTask, setAddingTask] = useState(false);
  /** id-ul taskului pe care rulează chiar acum o acțiune (bifare/amânare/ștergere) — dezactivează
   *  DOAR rândul lui, nu toată lista. */
  const [taskActionId, setTaskActionId] = useState<string | null>(null);

  /** Catalogul de produse — pentru select-ul din „Detalii". Se cere o dată, la deschidere. */
  // Produsele vin cu starea stocului (`tracksStock`, `qtyOnHand`): fișa leadului e locul unde se
  // decide vânzarea, deci „câte mai am" trebuie să fie vizibil ÎNAINTE de a promite clientului.
  const [products, setProducts] = useState<CrmProduct[]>([]);

  // Etichete
  const [tags, setTags] = useState<CrmLeadTag[]>([]);
  const [tagSuggestions, setTagSuggestions] = useState<string[]>([]);
  const [newTagText, setNewTagText] = useState("");
  const [addingTag, setAddingTag] = useState(false);

  const { members: teamMembers } = useTeamMembers();

  useEffect(() => {
    // Fila se resetează la fiecare lead: deschizi altul și te aștepți să vezi ce are de făcut,
    // nu fila „Acte" rămasă de la precedentul.
    setTab("activitate");
    if (!leadId) {
      // Reset la închidere — ca redeschiderea altui lead să nu arate, pentru o clipă, datele
      // celui anterior (Sheet-ul rămâne montat între deschideri, nu se reinițializează singur).
      setDetail(null);
      setInteractions([]);
      setForm(null);
      setError(null);
      setNoteBody("");
      setPendingLostStage(null);
      setTasks([]);
      setNewTaskTitle("");
      setNewTaskDueDate("");
      setTags([]);
      setNewTagText("");
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([getCrmLeadDetail(leadId), listCrmLeadTasks(leadId), listCrmLeadTags(leadId), listCrmTagSuggestions()])
      .then(([detailRes, tasksRes, tagsRes, suggestionsRes]) => {
        if (cancelled) return;
        setDetail(detailRes);
        setInteractions(detailRes.interactions);
        setForm(toFormState(detailRes.lead));
        setTasks(tasksRes.items);
        setTags(tagsRes.items);
        setTagSuggestions(suggestionsRes.items);
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

  /**
   * Actele se încarcă SEPARAT, nu în `Promise.all`-ul de mai sus. Dacă modulul
   * de acte n-ar răspunde (tenant fără schema de docgen, de pildă), o cerere
   * picată în grup ar goli toată fișa leadului — numele, telefonul, istoricul.
   * Aici, cel mai rău caz e o listă de acte goală.
   */
  const reloadDocuments = useCallback(() => {
    if (!leadId) {
      setDocuments([]);
      return;
    }
    listCrmDocuments(leadId)
      .then((res) => setDocuments(res.items))
      .catch(() => setDocuments([]));
  }, [leadId]);

  useEffect(() => {
    reloadDocuments();
  }, [reloadDocuments]);

  useEffect(() => {
    if (!leadId) return;
    // Separat de `Promise.all`-ul fișei, ca la acte: un catalog care nu răspunde nu are voie să
    // golească fișa leadului.
    listCrmProducts()
      .then((res) => setProducts(res.items))
      .catch(() => setProducts([]));
  }, [leadId]);

  function retryLoad() {
    if (!leadId) return;
    setLoading(true);
    setError(null);
    Promise.all([getCrmLeadDetail(leadId), listCrmLeadTasks(leadId), listCrmLeadTags(leadId), listCrmTagSuggestions()])
      .then(([detailRes, tasksRes, tagsRes, suggestionsRes]) => {
        setDetail(detailRes);
        setInteractions(detailRes.interactions);
        setForm(toFormState(detailRes.lead));
        setTasks(tasksRes.items);
        setTags(tagsRes.items);
        setTagSuggestions(suggestionsRes.items);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Nu am putut încărca leadul."))
      .finally(() => setLoading(false));
  }

  const lead = detail?.lead ?? null;

  const currentStage = useMemo(() => {
    if (!lead) return null;
    return detail?.stage ?? stages.find((s) => s.key === lead.stage) ?? null;
  }, [detail, lead, stages]);

  // Produsul ales acum în formular — de el atârnă și câmpul de cantitate, și cifra de stoc.
  const selectedProduct = useMemo(
    () => (form?.productId ? products.find((p) => p.id === form.productId) ?? null : null),
    [form?.productId, products]
  );

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
      const moved = await moveCrmLeadStage(leadId, { stage: toStage, lostReason });
      // Stocul e consecința mutării, deci se anunță în același mesaj: altfel omul află că a rămas
      // fără marfă abia când nu mai poate onora comanda următoare.
      const stock = moved.stock;
      if (stock?.status === "insufficient") {
        onToast({
          kind: "error",
          message: `Lead mutat, dar stocul la „${stock.productName}” nu ajunge: cerute ${stock.requested}, disponibile ${stock.available}.`,
        });
      } else if (stock?.status === "decremented") {
        onToast({
          kind: "success",
          message: `Lead mutat la „${crmStageLabel(stages, toStage)}”. Stoc: −${stock.qty} × „${stock.productName}”, au rămas ${stock.remaining}.`,
        });
      } else if (stock?.status === "restored") {
        onToast({
          kind: "success",
          message: `Lead mutat la „${crmStageLabel(stages, toStage)}”. Stoc returnat: +${stock.qty} × „${stock.productName}”.`,
        });
      } else {
        onToast({ kind: "success", message: `Lead mutat la „${crmStageLabel(stages, toStage)}”.` });
      }
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
      productId: form.productId ? form.productId : null,
      productQty: Math.max(1, Number(form.productQtyText) || 1),
      // Gol = „moștenește de la etapă", nu „0%": diferența contează la prognoză.
      probabilityPct: form.probabilityText.trim() === "" ? null : Math.max(0, Math.min(100, Number(form.probabilityText) || 0)),
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
      productId: patch.productId ?? null,
      productQty: patch.productQty ?? detail.lead.productQty ?? 1,
      probabilityPct: patch.probabilityPct ?? null,
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

  /**
   * Ce a răspuns clientul la ofertă/contract (cerințele 42 și 45). „Trimis" îl știe sistemul din
   * momentul trimiterii; asta o știe doar omul care a vorbit cu clientul.
   */
  async function markOutcome(documentId: string, status: "signed" | "rejected") {
    let reason: string | undefined;
    if (status === "rejected") {
      // Motivul e obligatoriu, ca la pierderea unui lead: fără el, raportul de mai târziu nu
      // poate spune de ce ne refuză clienții. Serverul îl cere oricum.
      const answer = prompt("De ce a refuzat clientul?");
      if (!answer?.trim()) return;
      reason = answer.trim();
    }
    setDocOutcomeId(documentId);
    try {
      await setCrmDocumentOutcome(documentId, { status, ...(reason ? { reason } : {}) });
      reloadDocuments();
      onToast({ kind: "success", message: status === "signed" ? "Act marcat ca semnat." : "Act marcat ca refuzat." });
      onChanged();
    } catch (err) {
      onToast({ kind: "error", message: err instanceof Error ? err.message : "Nu am putut marca răspunsul." });
    } finally {
      setDocOutcomeId(null);
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
      // Cerințele 10 și 17 din caietul de sarcini: fiecare activitate se încheie cu un pas
      // următor. Un lead fără pas următor e un lead uitat — nu-l cere nimeni, nu-l sună nimeni.
      // Nu blocăm apelul (acela s-a întâmplat deja), ci cerem pasul imediat după.
      if (!tasks.some((t) => t.status !== "done")) setAskNextAction(true);
      onToast({ kind: "success", message: "Apel notat în istoric." });
    } catch (err) {
      onToast({ kind: "error", message: err instanceof Error ? err.message : "Nu am putut nota apelul." });
    } finally {
      setLoggingCall(false);
    }
  }

  // ─── Taskuri ─────────────────────────────────────────────────────────────

  async function addTask() {
    if (!leadId || !newTaskTitle.trim()) return;
    setAddingTask(true);
    try {
      const created = await createCrmLeadTask({
        leadId,
        title: newTaskTitle.trim(),
        // Ora fixă (prânz) evită ca o dată aleasă să „alunece" cu o zi din cauza fusului orar la
        // conversia în UTC — un task „scadent azi" nu trebuie să pară scadent ieri sau mâine.
        dueAt: newTaskDueDate ? new Date(`${newTaskDueDate}T12:00:00`).toISOString() : null,
      });
      setTasks((prev) => sortTasksForDisplay([...prev, created]));
      setAskNextAction(false);
      setNewTaskTitle("");
      setNewTaskDueDate("");
      // Un task nou poate scoate lead-ul din „fără pas următor" pe orice ecran care arată „Azi".
      onChanged();
    } catch (err) {
      onToast({ kind: "error", message: err instanceof Error ? err.message : "Nu am putut adăuga taskul." });
    } finally {
      setAddingTask(false);
    }
  }

  function replaceTask(updated: CrmLeadTask) {
    setTasks((prev) => sortTasksForDisplay(prev.map((t) => (t.id === updated.id ? updated : t))));
  }

  async function toggleTaskDone(task: CrmLeadTask) {
    setTaskActionId(task.id);
    try {
      const updated = task.status === "done" ? await reopenCrmLeadTask(task.id) : await completeCrmLeadTask(task.id);
      replaceTask(updated);
      // Un task încheiat iese din restanțe — ecranele care arată „Azi" trebuie să se resincronizeze.
      onChanged();
    } catch (err) {
      onToast({ kind: "error", message: err instanceof Error ? err.message : "Nu am putut actualiza taskul." });
    } finally {
      setTaskActionId(null);
    }
  }

  async function snoozeTaskOneDay(task: CrmLeadTask) {
    setTaskActionId(task.id);
    try {
      const updated = await snoozeCrmLeadTask(task.id, 1);
      replaceTask(updated);
      onToast({ kind: "success", message: "Task amânat cu o zi." });
      onChanged();
    } catch (err) {
      onToast({ kind: "error", message: err instanceof Error ? err.message : "Nu am putut amâna taskul." });
    } finally {
      setTaskActionId(null);
    }
  }

  async function deleteTaskRow(task: CrmLeadTask) {
    if (!confirm(`Ștergi taskul „${task.title}”?`)) return;
    setTaskActionId(task.id);
    try {
      await deleteCrmLeadTask(task.id);
      setTasks((prev) => prev.filter((t) => t.id !== task.id));
      onChanged();
    } catch (err) {
      onToast({ kind: "error", message: err instanceof Error ? err.message : "Nu am putut șterge taskul." });
    } finally {
      setTaskActionId(null);
    }
  }

  // ─── Etichete ────────────────────────────────────────────────────────────

  async function addTag() {
    if (!leadId || !newTagText.trim()) return;
    setAddingTag(true);
    try {
      const created = await addCrmLeadTag(leadId, newTagText.trim());
      // Idempotent și pe server (nu dublează), dar verificăm și local — a doua adăugare a
      // aceleiași etichete întoarce exact același `id`, nu trebuie să apară de două ori în listă.
      setTags((prev) => (prev.some((t) => t.id === created.id) ? prev : [...prev, created]));
      setTagSuggestions((prev) => (prev.includes(created.tag) ? prev : [...prev, created.tag].sort()));
      setNewTagText("");
    } catch (err) {
      onToast({ kind: "error", message: err instanceof Error ? err.message : "Nu am putut adăuga eticheta." });
    } finally {
      setAddingTag(false);
    }
  }

  async function removeTagRow(tag: CrmLeadTag) {
    const prev = tags;
    setTags((cur) => cur.filter((t) => t.id !== tag.id));
    try {
      await removeCrmLeadTag(tag.id);
    } catch (err) {
      setTags(prev);
      onToast({ kind: "error", message: err instanceof Error ? err.message : "Nu am putut șterge eticheta." });
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

            {/* Etichete */}
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-1.5" aria-label="Etichete">
                {tags.map((t) => (
                  <Badge key={t.id} variant="secondary" className="gap-1 pr-1">
                    {t.tag}
                    <button
                      type="button"
                      onClick={() => void removeTagRow(t)}
                      aria-label={`Șterge eticheta ${t.tag}`}
                      className="rounded-full p-0.5 hover:bg-foreground/10"
                    >
                      <X className="h-3 w-3" aria-hidden="true" />
                    </button>
                  </Badge>
                ))}
              </div>
              <div className="flex items-center gap-1.5">
                <Label htmlFor="lead-sheet-new-tag" className="sr-only">
                  Etichetă nouă
                </Label>
                <Input
                  id="lead-sheet-new-tag"
                  value={newTagText}
                  onChange={(e) => setNewTagText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void addTag();
                    }
                  }}
                  placeholder="Etichetă nouă..."
                  list="lead-sheet-tag-suggestions"
                  className="h-8 max-w-[200px]"
                />
                <datalist id="lead-sheet-tag-suggestions">
                  {tagSuggestions.map((s) => (
                    <option key={s} value={s} />
                  ))}
                </datalist>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8 shrink-0"
                  aria-label="Adaugă eticheta"
                  onClick={() => void addTag()}
                  disabled={!newTagText.trim() || addingTag}
                >
                  {addingTag ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                  ) : (
                    <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                </Button>
              </div>
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
                {/* Trimiterea se face din aplicație, nu prin `mailto:`. Un mailto
                    deschide Outlook și nu lasă nicio urmă — peste o lună,
                    cronologia arată tăcere acolo unde au plecat cinci mesaje. */}
                <Button variant="outline" size="sm" onClick={() => setEmailOpen(true)}>
                  <Mail className="h-4 w-4" aria-hidden="true" />
                  Scrie email
                </Button>
                {whatsappLink(lead.phone) && (
                  <QuickActionLink
                    href={whatsappLink(lead.phone) as string}
                    icon={<MessageCircle className="h-4 w-4" aria-hidden="true" />}
                  >
                    WhatsApp
                  </QuickActionLink>
                )}
                {lead.phone && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={async () => {
                      await logCrmTouch({ leadId: lead.id, channel: "whatsapp", body: "I-am scris pe WhatsApp" });
                      onChanged();
                    }}
                  >
                    Am scris pe WhatsApp
                  </Button>
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


            {/* Filele fișei. Până acum totul era un singur scroll de ~1000 de linii: taskurile
                stăteau peste acte, actele peste formular, iar ca să ajungi la istoric derulai
                pe lângă tot. Antetul (etapă, valoare, etichete, acțiuni rapide) rămâne mereu
                deasupra — el e contextul, nu conținutul. */}
            <Tabs
              tabs={LEAD_TABS}
              value={tab}
              onChange={setTab}
              aria-label="Secțiunile fișei leadului"
            />

            {tab === "activitate" && (
              <div className="flex flex-col gap-6">
                {askNextAction && (
                  <Alert variant="warning" icon={<AlertCircle className="h-4 w-4" aria-hidden="true" />}>
                    <div className="flex flex-col gap-2">
                      <p>
                        Ai notat activitatea, dar leadul a rămas fără pas următor. Adaugă un task mai jos — altfel
                        nimeni nu știe când se revine la el.
                      </p>
                      <Button variant="outline" size="sm" className="w-fit" onClick={() => setAskNextAction(false)}>
                        Am înțeles
                      </Button>
                    </div>
                  </Alert>
                )}
                {/* Cadențele stau lângă taskuri, nu într-o filă proprie: sunt tot „ce urmează",
                    doar că programat dinainte. Secțiunea dispare complet dacă workspace-ul n-are
                    nicio cadență. */}
                <LeadCadencePanel leadId={lead.id} onToast={onToast} onChanged={onChanged} />

            {/* Taskuri */}
            <section className="flex flex-col gap-3">
              <h3 className="text-sm font-semibold text-foreground">Taskuri</h3>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                <div className="flex flex-1 flex-col gap-1">
                  <Label htmlFor="lead-sheet-new-task" className="sr-only">
                    Task nou
                  </Label>
                  <Input
                    id="lead-sheet-new-task"
                    value={newTaskTitle}
                    onChange={(e) => setNewTaskTitle(e.target.value)}
                    placeholder="Task nou (ex: Revino cu oferta)..."
                  />
                </div>
                <div className="flex items-end gap-2">
                  <div className="flex flex-col gap-1">
                    <Label htmlFor="lead-sheet-new-task-due" className="sr-only">
                      Scadență
                    </Label>
                    <Input
                      id="lead-sheet-new-task-due"
                      type="date"
                      value={newTaskDueDate}
                      onChange={(e) => setNewTaskDueDate(e.target.value)}
                      className="w-[150px]"
                    />
                  </div>
                  <Button onClick={() => void addTask()} disabled={!newTaskTitle.trim() || addingTask}>
                    {addingTask ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    ) : (
                      <Plus className="h-4 w-4" aria-hidden="true" />
                    )}
                    Adaugă
                  </Button>
                </div>
              </div>

              {tasks.length === 0 ? (
                <p className="text-sm text-muted-foreground">Niciun task pe acest lead încă.</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {tasks.map((task) => {
                    const overdue = isTaskOverdue(task);
                    const busy = taskActionId === task.id;
                    return (
                      <li
                        key={task.id}
                        className={cn(
                          "flex items-center gap-2 rounded-lg border p-2.5",
                          overdue ? "border-destructive/40 bg-destructive/5" : "border-border"
                        )}
                      >
                        <button
                          type="button"
                          onClick={() => void toggleTaskDone(task)}
                          disabled={busy}
                          aria-label={task.status === "done" ? `Redeschide taskul ${task.title}` : `Încheie taskul ${task.title}`}
                          className={cn(
                            "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border transition-colors",
                            task.status === "done"
                              ? "border-success bg-success/10 text-success"
                              : "border-border text-muted-foreground hover:bg-muted/60"
                          )}
                        >
                          {task.status === "done" ? (
                            <Undo2 className="h-4 w-4" aria-hidden="true" />
                          ) : (
                            <Check className="h-4 w-4" aria-hidden="true" />
                          )}
                        </button>
                        <div className="min-w-0 flex-1">
                          <p
                            className={cn(
                              "text-sm text-foreground",
                              task.status === "done" && "text-muted-foreground line-through"
                            )}
                          >
                            {task.title}
                          </p>
                          {task.dueAt && (
                            <p className={cn("text-xs", overdue ? "font-semibold text-destructive" : "text-muted-foreground")}>
                              Scadent {formatTaskDue(task.dueAt)}
                              {task.status === "snoozed" && " · amânat"}
                            </p>
                          )}
                        </div>
                        {task.status !== "done" && (
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Amână taskul ${task.title} cu o zi`}
                            onClick={() => void snoozeTaskOneDay(task)}
                            disabled={busy}
                          >
                            <Clock className="h-4 w-4" aria-hidden="true" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Șterge taskul ${task.title}`}
                          onClick={() => void deleteTaskRow(task)}
                          disabled={busy}
                        >
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                        </Button>
                      </li>
                    );
                  })}
                </ul>
              )}
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

            {tab === "detalii" && (
              <div className="flex flex-col gap-6">
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
                  <Label htmlFor="lead-sheet-product">Produs</Label>
                  <Select
                    id="lead-sheet-product"
                    value={form.productId}
                    onChange={(e) => setForm({ ...form, productId: e.target.value })}
                  >
                    <option value="">— fără produs —</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </Select>
                  {selectedProduct?.tracksStock ? (
                    <p
                      className={`text-xs ${selectedProduct.lowStock ? "text-destructive" : "text-muted-foreground"}`}
                    >
                      Stoc disponibil: {selectedProduct.qtyOnHand} {selectedProduct.unit}
                      {selectedProduct.lowStock ? " — sub pragul de alertă" : ""}
                    </p>
                  ) : null}
                </div>
                {/* Cantitatea se arată doar la produsele cu stoc: la un serviciu n-ar însemna nimic
                    și ar mai cere o decizie degeaba. */}
                {selectedProduct?.tracksStock ? (
                  <div className="flex flex-col gap-1">
                    <Label htmlFor="lead-sheet-product-qty">Cantitate</Label>
                    <Input
                      id="lead-sheet-product-qty"
                      type="number"
                      min={1}
                      value={form.productQtyText}
                      onChange={(e) => setForm({ ...form, productQtyText: e.target.value })}
                      placeholder="1"
                    />
                    <p className="text-xs text-muted-foreground">
                      Se scade din stoc când leadul ajunge în etapa de câștig.
                    </p>
                  </div>
                ) : null}
                <div className="flex flex-col gap-1">
                  <Label htmlFor="lead-sheet-probability">Probabilitate (%)</Label>
                  <Input
                    id="lead-sheet-probability"
                    type="number"
                    min={0}
                    max={100}
                    value={form.probabilityText}
                    onChange={(e) => setForm({ ...form, probabilityText: e.target.value })}
                    placeholder={currentStage ? `implicit ${currentStage.probabilityPct}%` : "din etapă"}
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

                <LeadCustomFields leadId={lead.id} onToast={onToast} />

                <Separator />

                {/* Drepturile persoanei stau AICI, sub datele ei — nu într-un ecran de setări pe
                    care nimeni nu-l deschide în timpul unei conversații cu clientul. */}
                <LeadGdprPanel
                  lead={lead}
                  onToast={onToast}
                  onChanged={() => {
                    void refetchDetail();
                    onChanged();
                  }}
                />
              </div>
            )}

            {tab === "fisiere" && <LeadFilesTab leadId={lead.id} onToast={onToast} />}

            {tab === "contacte" && <LeadContactsTab leadId={lead.id} onToast={onToast} />}

            {tab === "acte" && (
              <div className="flex flex-col gap-6">
            {/* Acte: oferte și contracte pornite din acest lead. Se deschid în
                editorul de acte al FinFlow — acolo se finalizează și se trimit. */}
            <section className="flex flex-col gap-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-foreground">Oferte și contracte</h3>
                <Button size="sm" variant="outline" onClick={() => setNewDocOpen(true)}>
                  <FileText className="h-4 w-4" aria-hidden="true" />
                  Act nou
                </Button>
              </div>
              {documents.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Niciun act încă. „Act nou” pornește o ofertă cu datele acestui lead.
                </p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {documents.map((d) => (
                    <li key={d.id} className="flex flex-col gap-1 rounded-lg border border-border p-2.5">
                      <div className="flex items-center justify-between gap-2 text-sm">
                        <Link to={docPath(d.id)} className="inline-flex items-center gap-1 hover:underline">
                          {d.docNumber ? `${CRM_DOC_KIND_LABELS[d.kind as keyof typeof CRM_DOC_KIND_LABELS] ?? d.kind} nr. ${d.docNumber}` : d.title}
                          <ExternalLink className="h-3 w-3" aria-hidden="true" />
                        </Link>
                        <Badge variant={d.status === "draft" ? "secondary" : "default"}>
                          {CRM_DOC_STATUS_LABELS[d.status] ?? d.status}
                        </Badge>
                      </div>

                      {d.outcomeReason && (
                        <p className="text-xs text-destructive">Motiv refuz: {d.outcomeReason}</p>
                      )}

                      {/* Ce a răspuns clientul. Apare doar după ce actul a plecat: o ciornă n-a
                          ajuns la nimeni, deci n-are cum să fie semnată sau refuzată. */}
                      {(d.status === "sent" || d.status === "final") && (
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={docOutcomeId === d.id}
                            onClick={() => void markOutcome(d.id, "signed")}
                          >
                            {docOutcomeId === d.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                            ) : (
                              <Check className="h-3.5 w-3.5" aria-hidden="true" />
                            )}
                            Semnat
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={docOutcomeId === d.id}
                            onClick={() => void markOutcome(d.id, "rejected")}
                          >
                            <X className="h-3.5 w-3.5" aria-hidden="true" />
                            Refuzat
                          </Button>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
              </div>
            )}

            {tab === "istoric" && (
              <div className="flex flex-col gap-4">
                <LeadPersonHistoryTab
                  leadId={lead.id}
                  stages={stages}
                  onOpenLead={(id) => {
                    // Fișa e controlată de părinte (`leadId`): fără el, „Deschide" dintr-un lead
                    // înrudit n-ar avea unde naviga.
                    onOpenLead?.(id);
                  }}
                />
                {/* Ce s-a SCHIMBAT în fișă și de către cine — altă întrebare decât ce s-a
                    DISCUTAT cu clientul (aia e cronologia din „Activitate"). */}
                <LeadAuditTrail leadId={lead.id} />
              </div>
            )}

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
      {emailOpen && lead && (
        <SendEmailDialog
          leadId={lead.id}
          leadName={lead.company || lead.fullName}
          defaultTo={lead.email}
          onClose={() => setEmailOpen(false)}
          onSent={onChanged}
        />
      )}
      {newDocOpen && lead && (
        <NewDocumentDialog
          leadId={lead.id}
          leadName={lead.company || lead.fullName}
          onClose={() => setNewDocOpen(false)}
          onCreated={reloadDocuments}
        />
      )}
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
