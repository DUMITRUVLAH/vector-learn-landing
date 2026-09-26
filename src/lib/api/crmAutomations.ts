/**
 * CRM — clientul tipat pentru automatizări.
 *
 * Etichetele din fișierul ăsta sunt partea care contează cel mai mult pentru om:
 * o regulă se scrie o dată și lucrează singură luni de zile, deci trebuie să se
 * citească în română, ca o frază, nu ca o structură de date.
 */
import { api } from "@/lib/api";

export type TriggerKind = "lead.created" | "lead.stage_changed" | "lead.idle";

export const TRIGGER_LABELS: Record<TriggerKind, string> = {
  "lead.created": "Când apare un lead nou",
  "lead.stage_changed": "Când lead-ul intră într-o etapă",
  "lead.idle": "Când lead-ul stă neatins câteva zile",
};

export type ConditionOp = "eq" | "neq" | "contains" | "not_contains" | "in" | "gte" | "lte" | "exists" | "not_exists";

export const CONDITION_OP_LABELS: Record<ConditionOp, string> = {
  eq: "este exact",
  neq: "nu este",
  in: "este unul dintre",
  contains: "conține",
  not_contains: "nu conține",
  gte: "cel puțin",
  lte: "cel mult",
  exists: "este completat",
  not_exists: "e gol",
};

/** Sursele unui lead, cu numele lor — omul nu trebuie să știe cheile din bază. */
export const LEAD_SOURCE_LABELS: Record<string, string> = {
  webform: "Formular pe site",
  manual: "Adăugat manual",
  facebook_ad: "Reclamă Facebook",
  google_ads: "Google Ads",
  referral: "Recomandare",
  phone_in: "Apel primit",
  instagram: "Instagram",
  import: "Import",
  other: "Altă sursă",
};

/** Operatorii care nu cer valoare — interfața ascunde câmpul pentru ei. */
export const OPS_WITHOUT_VALUE: ConditionOp[] = ["exists", "not_exists"];

/** Câmpurile pe care le poate folosi o condiție, cu numele lor din română. */
export const CONDITION_FIELDS: { value: string; label: string }[] = [
  { value: "source", label: "Sursă" },
  { value: "company", label: "Firmă" },
  { value: "fullName", label: "Nume" },
  { value: "phone", label: "Telefon" },
  { value: "email", label: "Email" },
  { value: "stage", label: "Etapă" },
  { value: "valueCents", label: "Valoare (în cenți)" },
  { value: "assignedTo", label: "Responsabil" },
  { value: "tags", label: "Etichete" },
  { value: "interestCourse", label: "Produs de interes" },
  { value: "dealName", label: "Numele afacerii" },
  { value: "qualification", label: "Calificare" },
  { value: "score", label: "Scor" },
  { value: "probabilityPct", label: "Probabilitate (%)" },
  { value: "callAttempts", label: "Apeluri încercate" },
  { value: "lastCallOutcome", label: "Rezultatul ultimului apel" },
  { value: "utmSource", label: "UTM sursă" },
  { value: "utmCampaign", label: "UTM campanie" },
  { value: "notes", label: "Notițe" },
];

/**
 * Câmpurile pe care le vede și distribuirea. Etichetele lipsesc intenționat: la crearea lead-ului,
 * când se alege agentul, lead-ul încă n-are nicio etichetă — condiția n-ar prinde niciodată.
 */
export const ASSIGNMENT_CONDITION_FIELDS = CONDITION_FIELDS.filter((f) => f.value !== "tags");

export interface AutomationCondition {
  field: string;
  op: ConditionOp;
  value?: string | number;
}

export type NotifyTarget = "assignee" | "admins" | "user";

export type AutomationAction =
  | { type: "create_task"; title: string; dueInDays?: number; assignTo?: string | null }
  | { type: "move_stage"; stageKey: string }
  | { type: "add_tag"; tag: string }
  | { type: "remove_tag"; tag: string }
  | { type: "add_note"; body: string }
  | { type: "notify"; to: NotifyTarget; userId?: string | null; message: string }
  | { type: "assign"; userId?: string | null; strategy?: "round_robin" | "capacity" | "weighted" | "territory" | null };

export const ACTION_LABELS: Record<AutomationAction["type"], string> = {
  create_task: "Creează un task",
  notify: "Anunță pe cineva",
  move_stage: "Mută în etapa",
  add_tag: "Pune eticheta",
  remove_tag: "Scoate eticheta",
  add_note: "Adaugă o notiță",
  assign: "Atribuie lead-ul",
};

export const NOTIFY_TARGET_LABELS: Record<NotifyTarget, string> = {
  assignee: "responsabilul lead-ului",
  admins: "administratorii",
  user: "un om anume",
};

/** Forma goală a fiecărei acțiuni, când omul schimbă tipul în editor. */
export function blankAction(type: AutomationAction["type"], firstStage: string): AutomationAction {
  switch (type) {
    case "create_task":
      return { type, title: "" };
    case "move_stage":
      return { type, stageKey: firstStage };
    case "add_tag":
    case "remove_tag":
      return { type, tag: "" };
    case "add_note":
      return { type, body: "" };
    case "notify":
      return { type, to: "assignee", message: "" };
    case "assign":
      return { type, strategy: "round_robin" };
  }
}

export const STRATEGY_LABELS: Record<string, string> = {
  round_robin: "pe rând, echitabil",
  capacity: "cine are loc azi",
  weighted: "după greutate",
  territory: "după regiune",
};

export interface AutomationTrigger {
  kind: TriggerKind;
  toStage?: string | null;
  /** Doar pentru „lead.idle". */
  idleDays?: number | null;
}

export interface CrmAutomation {
  id: string;
  name: string;
  enabled: boolean;
  trigger: AutomationTrigger;
  conditions: AutomationCondition[];
  actions: AutomationAction[];
  orderIndex: number;
  /** Scenariul gata făcut din care a pornit; `null` = scrisă de mână. */
  templateKey?: string | null;
  createdAt: string;
}

export interface CrmAutomationInput {
  name: string;
  enabled?: boolean;
  trigger: AutomationTrigger;
  conditions: AutomationCondition[];
  actions: AutomationAction[];
  templateKey?: string | null;
}

export function listCrmAutomations(): Promise<{ items: CrmAutomation[] }> {
  return api<{ items: CrmAutomation[] }>("/api/crm/automations");
}

/** Răspunde 400 `invalid_automation` cu `problems: string[]` — mesaje gata de afișat. */
export function createCrmAutomation(body: CrmAutomationInput): Promise<CrmAutomation> {
  return api<CrmAutomation>("/api/crm/automations", { method: "POST", body: JSON.stringify(body) });
}

export function updateCrmAutomation(id: string, body: Partial<CrmAutomationInput>): Promise<CrmAutomation> {
  return api<CrmAutomation>(`/api/crm/automations/${id}`, { method: "PATCH", body: JSON.stringify(body) });
}

export function deleteCrmAutomation(id: string): Promise<{ ok: true }> {
  return api<{ ok: true }>(`/api/crm/automations/${id}`, { method: "DELETE" });
}

export interface PlannedRun {
  automationId: string;
  automationName: string;
  matched: boolean;
  actions: AutomationAction[];
}

/** Nu scrie nimic — spune doar ce s-ar întâmpla cu lead-ul dat. */
export function previewCrmAutomations(body: {
  leadId: string;
  kind?: TriggerKind;
  toStage?: string | null;
}): Promise<{ plan: PlannedRun[] }> {
  return api<{ plan: PlannedRun[] }>("/api/crm/automations/preview", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export interface CrmAutomationRun {
  id: string;
  automationName: string | null;
  leadId: string | null;
  triggerKind: string;
  actions: { action: string; detail?: string }[];
  status: string;
  error: string | null;
  createdAt: string;
}

export function listCrmAutomationRuns(leadId?: string | null): Promise<{ items: CrmAutomationRun[] }> {
  const qs = leadId ? `?leadId=${encodeURIComponent(leadId)}` : "";
  return api<{ items: CrmAutomationRun[] }>(`/api/crm/automations/runs${qs}`);
}

/** O condiție, spusă în cuvinte: „Sursă este unul dintre „Reclamă Facebook, Instagram”". */
export function describeCondition(c: AutomationCondition): string {
  const field = CONDITION_FIELDS.find((f) => f.value === c.field)?.label ?? c.field;
  const op = CONDITION_OP_LABELS[c.op] ?? c.op;
  if (OPS_WITHOUT_VALUE.includes(c.op)) return `${field} ${op}`;
  const value =
    c.field === "source"
      ? String(c.value ?? "")
          .split(",")
          .map((v) => LEAD_SOURCE_LABELS[v.trim()] ?? v.trim())
          .join(", ")
      : String(c.value ?? "");
  return `${field} ${op} „${value}”`;
}

function describeWhen(trigger: AutomationTrigger, stageLabel?: (key: string) => string): string {
  const stage = trigger.toStage ? `„${stageLabel?.(trigger.toStage) ?? trigger.toStage}”` : null;
  if (trigger.kind === "lead.stage_changed" && stage) return `Când lead-ul intră în ${stage}`;
  if (trigger.kind === "lead.idle") {
    const days = trigger.idleDays ?? 0;
    const where = stage ? ` în ${stage}` : "";
    return `Când lead-ul stă neatins${where} ${days} ${days === 1 ? "zi" : "zile"}`;
  }
  return TRIGGER_LABELS[trigger.kind];
}

function dueText(days: number | undefined): string {
  if (days == null) return "";
  if (days === 0) return " cu scadență azi";
  if (days === 1) return " cu scadență mâine";
  return ` cu scadență în ${days} zile`;
}

/** O regulă, spusă ca o frază — pentru lista de reguli. */
export function describeAutomation(
  auto: Pick<CrmAutomation, "trigger" | "conditions" | "actions">,
  stageLabel?: (key: string) => string
): string {
  const when = describeWhen(auto.trigger, stageLabel);

  const conds =
    auto.conditions.length > 0 ? ` și ${auto.conditions.map(describeCondition).join(" și ")}` : "";

  const acts = auto.actions
    .map((a) => {
      switch (a.type) {
        case "create_task":
          return `creează taskul „${a.title}”${dueText(a.dueInDays)}`;
        case "move_stage":
          return `mută în „${stageLabel?.(a.stageKey) ?? a.stageKey}”`;
        case "add_tag":
          return `pune eticheta „${a.tag}”`;
        case "remove_tag":
          return `scoate eticheta „${a.tag}”`;
        case "add_note":
          return "adaugă o notiță";
        case "notify":
          return `anunță ${NOTIFY_TARGET_LABELS[a.to] ?? "pe cineva"}`;
        case "assign":
          return a.userId ? "atribuie unui om anume" : `atribuie ${STRATEGY_LABELS[a.strategy ?? ""] ?? "automat"}`;
        default:
          return "";
      }
    })
    .filter(Boolean)
    .join(", ");

  return `${when}${conds} → ${acts}.`;
}
