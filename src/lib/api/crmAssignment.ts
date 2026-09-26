/**
 * CRM — clientul tipat pentru distribuirea lead-urilor pe agenți.
 *
 * Atenție la un lucru când folosești tipurile de aici: `outcome` NU e un
 * detaliu tehnic. Separă trei situații care arată la fel pe ecran („lead fără
 * responsabil") dar se repară complet diferit — nicio regulă configurată, nimeni
 * eligibil, sau toată lumea la normă. Interfața trebuie să le spună diferit.
 */
import { api } from "@/lib/api";
import type { AutomationCondition } from "@/lib/api/crmAutomations";

export type AssignmentStrategy = "round_robin" | "territory" | "capacity" | "weighted" | "fixed";

export const STRATEGY_LABELS: Record<AssignmentStrategy, string> = {
  round_robin: "Pe rând, echitabil",
  territory: "După regiune",
  capacity: "Cine are loc azi",
  weighted: "După greutate",
  fixed: "Unui om anume",
};

export const STRATEGY_HELP: Record<AssignmentStrategy, string> = {
  round_robin: "Fiecare agent primește pe rând, în ordinea din listă. Cea mai simplă și cea mai des potrivită.",
  territory: "Lead-ul merge la agentul care acoperă regiunea lui. Cine nu are regiuni nu intră în tragere.",
  capacity: "Primește cine e cel mai departe de norma zilnică. Bun când agenții lucrează inegal.",
  weighted: "Cine are greutate mai mare primește mai des. Pentru echipe cu senioritate diferită.",
  fixed: "Toate lead-urile care trec de condiții merg la o singură persoană.",
};

export type AssignmentOutcome = "assigned" | "no_rule" | "no_candidates" | "all_at_capacity";

/** Ce trebuie să facă omul, pentru fiecare fel de neatribuire. */
export const OUTCOME_LABELS: Record<AssignmentOutcome, string> = {
  assigned: "Atribuit",
  no_rule: "Nicio regulă nu se potrivește",
  no_candidates: "Niciun agent eligibil",
  all_at_capacity: "Toți agenții și-au atins norma",
};

export interface CrmAssignmentRule {
  id: string;
  name: string;
  enabled: boolean;
  strategy: AssignmentStrategy;
  conditions: AutomationCondition[];
  userIds: string[];
  orderIndex: number;
  /** Scenariul gata făcut din care a pornit; `null` = scrisă de mână. */
  templateKey?: string | null;
}

export interface CrmAssignmentRuleInput {
  name: string;
  enabled?: boolean;
  strategy: AssignmentStrategy;
  conditions?: AutomationCondition[];
  userIds?: string[];
  templateKey?: string | null;
}

export interface CrmAssignmentMember {
  userId: string;
  name: string;
  isActive: boolean;
  /** 0 = nelimitat. */
  dailyCapacity: number;
  weight: number;
  regions: string[];
  industries: string[];
  orderIndex: number;
  assignedToday: number;
}

export interface CrmAssignmentDecision {
  userId: string | null;
  ruleId: string | null;
  ruleName: string | null;
  strategy: AssignmentStrategy | null;
  reason: string;
  outcome: AssignmentOutcome;
}

export function listCrmAssignmentRules(): Promise<{ items: CrmAssignmentRule[] }> {
  return api<{ items: CrmAssignmentRule[] }>("/api/crm/assignment/rules");
}

export function createCrmAssignmentRule(body: CrmAssignmentRuleInput): Promise<CrmAssignmentRule> {
  return api<CrmAssignmentRule>("/api/crm/assignment/rules", { method: "POST", body: JSON.stringify(body) });
}

export function updateCrmAssignmentRule(
  id: string,
  body: Partial<CrmAssignmentRuleInput>
): Promise<CrmAssignmentRule> {
  return api<CrmAssignmentRule>(`/api/crm/assignment/rules/${id}`, { method: "PATCH", body: JSON.stringify(body) });
}

export function deleteCrmAssignmentRule(id: string): Promise<{ ok: true }> {
  return api<{ ok: true }>(`/api/crm/assignment/rules/${id}`, { method: "DELETE" });
}

export function listCrmAssignmentMembers(): Promise<{ items: CrmAssignmentMember[] }> {
  return api<{ items: CrmAssignmentMember[] }>("/api/crm/assignment/members");
}

export function updateCrmAssignmentMember(
  userId: string,
  body: Partial<Pick<CrmAssignmentMember, "isActive" | "dailyCapacity" | "weight" | "regions" | "industries">>
): Promise<CrmAssignmentMember> {
  return api<CrmAssignmentMember>(`/api/crm/assignment/members/${userId}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

/** Nu scrie nimic — spune cui i-ar reveni lead-ul și de ce. */
export function previewCrmAssignment(leadId: string): Promise<{ decision: CrmAssignmentDecision }> {
  return api<{ decision: CrmAssignmentDecision }>("/api/crm/assignment/preview", {
    method: "POST",
    body: JSON.stringify({ leadId }),
  });
}

export function applyCrmAssignment(leadId: string): Promise<{ decision: CrmAssignmentDecision }> {
  return api<{ decision: CrmAssignmentDecision }>("/api/crm/assignment/apply", {
    method: "POST",
    body: JSON.stringify({ leadId }),
  });
}

export interface CrmAssignmentLogEntry {
  id: string;
  leadId: string | null;
  userId: string | null;
  ruleId: string | null;
  strategy: string | null;
  reason: string | null;
  createdAt: string;
}

export function listCrmAssignmentLog(leadId?: string | null): Promise<{ items: CrmAssignmentLogEntry[] }> {
  const qs = leadId ? `?leadId=${encodeURIComponent(leadId)}` : "";
  return api<{ items: CrmAssignmentLogEntry[] }>(`/api/crm/assignment/log${qs}`);
}
