/**
 * CRM — automatizări: reguli care mișcă singure lead-urile.
 *
 * Portat din crm-vector (`src/lib/crm/automations.ts`). Partea de decizie e
 * PURĂ și testabilă fără bază de date; efectele (creează task, mută etapă,
 * atribuie) sunt în `server/routes/crmAutomations.ts`, unde există tenantul.
 *
 * Evaluatorul de condiții (`evalCondition` / `conditionsPass`) stă AICI, nu în
 * `assignment.ts`, deși îl folosesc amândouă. Motivul: o regulă de distribuire
 * și una de automatizare trebuie să înțeleagă identic aceeași condiție. Două
 * implementări „echivalente" se despart tăcut, iar omul rămâne cu un lead care
 * a nimerit la agentul greșit fără explicație.
 *
 * Limita de adâncime nu e o precauție teoretică: o regulă care mută în „Contactat"
 * și alta care mută înapoi în „Nou" se cheamă reciproc la infinit. Ambele sunt
 * reguli pe care un om le poate scrie fără rea intenție, în două zile diferite.
 */

export type TriggerKind = "lead.created" | "lead.stage_changed";

export interface AutomationTrigger {
  kind: TriggerKind;
  /** Doar pentru „stage_changed": pornește numai la intrarea ÎN etapa asta. */
  toStage?: string;
}

export type ConditionOp = "eq" | "neq" | "contains" | "gte" | "lte" | "exists" | "not_exists";

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
  /** `userId` fix → atribuire directă; altfel `strategy` rulează distribuirea. */
  | { type: "assign"; userId?: string; strategy?: "round_robin" | "capacity" | "weighted" | "territory" };

export interface AutomationLike {
  id: string;
  name: string;
  enabled: boolean;
  trigger: AutomationTrigger;
  conditions: AutomationCondition[];
  actions: AutomationAction[];
}

/**
 * Adâncimea maximă a lanțului de automatizări. O acțiune `move_stage`
 * redeclanșează automatizările de „stage_changed"; fără plafon, două reguli care
 * mută A→B și B→A ar rula până cade cererea.
 */
export const MAX_AUTOMATION_DEPTH = 2;

/** Se potrivește evenimentul (de tipul `kind`, intrat în `toStage`) cu declanșatorul? */
export function triggerMatches(auto: Pick<AutomationLike, "trigger">, kind: TriggerKind, toStage?: string): boolean {
  if (auto.trigger.kind !== kind) return false;
  if (kind === "lead.stage_changed" && auto.trigger.toStage) {
    return auto.trigger.toStage === toStage;
  }
  return true;
}

/**
 * Evaluează o condiție pe un lead.
 *
 * Comparațiile text se fac pe `String(raw ?? "")` intenționat: un câmp gol și
 * unul absent trebuie să se comporte la fel, altfel o regulă „email eq X" ar da
 * rezultate diferite pe două lead-uri care, pentru om, arată identic.
 */
export function evalCondition(lead: Record<string, unknown>, c: AutomationCondition): boolean {
  const raw = lead[c.field];
  switch (c.op) {
    case "exists":
      return raw !== null && raw !== undefined && raw !== "";
    case "not_exists":
      return raw === null || raw === undefined || raw === "";
    case "eq":
      return String(raw ?? "") === String(c.value ?? "");
    case "neq":
      return String(raw ?? "") !== String(c.value ?? "");
    case "contains":
      return String(raw ?? "")
        .toLowerCase()
        .includes(String(c.value ?? "").toLowerCase());
    case "gte":
      return Number(raw ?? 0) >= Number(c.value ?? 0);
    case "lte":
      return Number(raw ?? 0) <= Number(c.value ?? 0);
    default:
      return false;
  }
}

/** Toate condițiile trebuie să treacă (ȘI). Listă goală → întotdeauna adevărat. */
export function conditionsPass(lead: Record<string, unknown>, conditions: AutomationCondition[]): boolean {
  return conditions.every((c) => evalCondition(lead, c));
}

export interface PlannedRun {
  automationId: string;
  automationName: string;
  matched: boolean;
  actions: AutomationAction[];
}

/**
 * Ce automatizări pornesc pentru un eveniment — pur, fără niciun efect.
 *
 * Întoarce și regulile care s-au potrivit pe declanșator dar au căzut pe
 * condiții (`matched: false`), nu doar pe cele care execută. Asta face
 * diferența între „regula mea nu s-a aplicat" și „regula mea nici măcar n-a
 * fost luată în seamă" — două probleme cu cauze complet diferite.
 */
export function planRuns(
  automations: AutomationLike[],
  lead: Record<string, unknown>,
  kind: TriggerKind,
  toStage?: string
): PlannedRun[] {
  return automations
    .filter((a) => a.enabled)
    .filter((a) => triggerMatches(a, kind, toStage))
    .map((a) => {
      const matched = conditionsPass(lead, a.conditions);
      return {
        automationId: a.id,
        automationName: a.name,
        matched,
        actions: matched ? a.actions : [],
      };
    });
}

/**
 * Verifică o regulă înainte de salvare și întoarce problemele în română.
 *
 * De ce validăm aici și nu doar în zod: o regulă poate fi corectă ca formă și
 * totuși fără sens ca înțeles — o mutare în etapa în care regula tocmai a fost
 * declanșată e o buclă pe care omul n-o vede scriind-o.
 */
export function validateAutomation(auto: Pick<AutomationLike, "trigger" | "actions">): string[] {
  const problems: string[] = [];

  if (auto.actions.length === 0) {
    problems.push("Regula nu face nimic — adaugă cel puțin o acțiune.");
  }

  for (const action of auto.actions) {
    if (action.type === "move_stage" && auto.trigger.kind === "lead.stage_changed") {
      if (auto.trigger.toStage && action.stageKey === auto.trigger.toStage) {
        problems.push("Regula mută lead-ul în chiar etapa care o declanșează — ar porni la nesfârșit.");
      }
    }
    if (action.type === "create_task" && !action.title.trim()) {
      problems.push("Taskul creat automat n-are titlu — nimeni n-ar ști ce are de făcut.");
    }
    if (action.type === "add_tag" && !action.tag.trim()) {
      problems.push("Eticheta adăugată automat e goală.");
    }
    if (action.type === "assign" && !action.userId && !action.strategy) {
      problems.push("Acțiunea de atribuire n-are nici om, nici strategie — nu s-ar atribui nimănui.");
    }
  }

  return problems;
}
