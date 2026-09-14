/**
 * CRM — clientul tipat pentru automatizări.
 *
 * Etichetele din fișierul ăsta sunt partea care contează cel mai mult pentru om:
 * o regulă se scrie o dată și lucrează singură luni de zile, deci trebuie să se
 * citească în română, ca o frază, nu ca o structură de date.
 */
import { api } from "@/lib/api";

export type TriggerKind = "lead.created" | "lead.stage_changed";

export const TRIGGER_LABELS: Record<TriggerKind, string> = {
  "lead.created": "Când apare un lead nou",
  "lead.stage_changed": "Când lead-ul intră într-o etapă",
};

export type ConditionOp = "eq" | "neq" | "contains" | "gte" | "lte" | "exists" | "not_exists";

export const CONDITION_OP_LABELS: Record<ConditionOp, string> = {
  eq: "este exact",
  neq: "nu este",
  contains: "conține",
  gte: "cel puțin",
  lte: "cel mult",
  exists: "este completat",
  not_exists: "e gol",
};

/** Operatorii care nu cer valoare — interfața ascunde câmpul pentru ei. */
export const OPS_WITHOUT_VALUE: ConditionOp[] = ["exists", "not_exists"];

/** Câmpurile pe care le poate folosi o condiție, cu numele lor din română. */
export const CONDITION_FIELDS: { value: string; label: string }[] = [
  { value: "fullName", label: "Nume" },
  { value: "phone", label: "Telefon" },
  { value: "email", label: "Email" },
  { value: "company", label: "Firmă" },
  { value: "source", label: "Sursă" },
  { value: "stage", label: "Etapă" },
  { value: "valueCents", label: "Valoare (în cenți)" },
  { value: "assignedTo", label: "Responsabil" },
  { value: "interestCourse", label: "Produs de interes" },
  { value: "notes", label: "Notițe" },
];

export interface AutomationCondition {
  field: string;
  op: ConditionOp;
  value?: string | number;
}

export type AutomationAction =
  | { type: "create_task"; title: string; dueInDays?: number }
  | { type: "move_stage"; stageKey: string }
  | { type: "add_tag"; tag: string }
  | { type: "add_note"; body: string }
  | { type: "assign"; userId?: string | null; strategy?: "round_robin" | "capacity" | "weighted" | "territory" | null };

export const ACTION_LABELS: Record<AutomationAction["type"], string> = {
  create_task: "Creează un task",
  move_stage: "Mută în etapa",
  add_tag: "Pune eticheta",
  add_note: "Adaugă o notiță",
  assign: "Atribuie lead-ul",
};

export const STRATEGY_LABELS: Record<string, string> = {
  round_robin: "pe rând, echitabil",
  capacity: "cine are loc azi",
  weighted: "după greutate",
  territory: "după regiune",
};

export interface CrmAutomation {
  id: string;
  name: string;
  enabled: boolean;
  trigger: { kind: TriggerKind; toStage?: string | null };
  conditions: AutomationCondition[];
  actions: AutomationAction[];
  orderIndex: number;
  createdAt: string;
}

export interface CrmAutomationInput {
  name: string;
  enabled?: boolean;
  trigger: { kind: TriggerKind; toStage?: string | null };
  conditions: AutomationCondition[];
  actions: AutomationAction[];
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

/** O regulă, spusă ca o frază — pentru lista de reguli. */
export function describeAutomation(auto: CrmAutomation, stageLabel?: (key: string) => string): string {
  const when =
    auto.trigger.kind === "lead.stage_changed" && auto.trigger.toStage
      ? `Când lead-ul intră în „${stageLabel?.(auto.trigger.toStage) ?? auto.trigger.toStage}”`
      : TRIGGER_LABELS[auto.trigger.kind];

  const conds =
    auto.conditions.length > 0
      ? ` și ${auto.conditions
          .map((c) => {
            const field = CONDITION_FIELDS.find((f) => f.value === c.field)?.label ?? c.field;
            const op = CONDITION_OP_LABELS[c.op];
            return OPS_WITHOUT_VALUE.includes(c.op) ? `${field} ${op}` : `${field} ${op} „${c.value ?? ""}”`;
          })
          .join(" și ")}`
      : "";

  const acts = auto.actions
    .map((a) => {
      switch (a.type) {
        case "create_task":
          return `creează taskul „${a.title}”${a.dueInDays != null ? ` cu scadență în ${a.dueInDays} zile` : ""}`;
        case "move_stage":
          return `mută în „${stageLabel?.(a.stageKey) ?? a.stageKey}”`;
        case "add_tag":
          return `pune eticheta „${a.tag}”`;
        case "add_note":
          return "adaugă o notiță";
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
