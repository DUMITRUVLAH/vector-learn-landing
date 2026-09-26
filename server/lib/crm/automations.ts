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

/**
 * `lead.idle` nu vine dintr-o acțiune a omului, ci din cronul zilnic (`runIdleAutomations`): e
 * singurul declanșator care prinde ce NU s-a întâmplat — un lead uitat. Pentru o echipă de vânzări
 * e cea mai valoroasă regulă, fiindcă lead-urile se pierd din tăcere, nu din greșeli.
 */
export type TriggerKind = "lead.created" | "lead.stage_changed" | "lead.idle";

export interface AutomationTrigger {
  kind: TriggerKind;
  /**
   * „stage_changed": pornește numai la intrarea ÎN etapa asta.
   * „idle": numai pentru lead-urile care stau în etapa asta. Gol = orice etapă deschisă.
   */
  toStage?: string;
  /** Doar pentru „idle": după câte zile fără nicio mișcare. */
  idleDays?: number;
}

/**
 * `in` = „este unul dintre" (valori despărțite prin virgulă): dă SAU fără un al doilea nivel de
 * logică în editor. „Sursa e Facebook, Instagram sau Google" e o singură condiție, nu trei reguli.
 */
export type ConditionOp = "eq" | "neq" | "contains" | "not_contains" | "in" | "gte" | "lte" | "exists" | "not_exists";

export interface AutomationCondition {
  field: string;
  op: ConditionOp;
  value?: string | number;
}

/** Cui ajunge o notificare automată. `user` cere `userId`. */
export type NotifyTarget = "assignee" | "admins" | "user";

export type AutomationAction =
  /** `assignTo` gol = responsabilul lead-ului (sau nimeni, dacă lead-ul n-are încă). */
  | { type: "create_task"; title: string; dueInDays?: number; assignTo?: string | null }
  | { type: "move_stage"; stageKey: string }
  | { type: "add_tag"; tag: string }
  | { type: "remove_tag"; tag: string }
  | { type: "add_note"; body: string }
  | { type: "notify"; to: NotifyTarget; userId?: string | null; message: string }
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
  // Pentru „idle", `toStage` e etapa în care stă acum lead-ul — același filtru, altă întrebare.
  if ((kind === "lead.stage_changed" || kind === "lead.idle") && auto.trigger.toStage) {
    return auto.trigger.toStage === toStage;
  }
  return true;
}

/** Lista din „este unul dintre": despărțită prin virgulă, fără goluri, fără majuscule. */
export function splitList(value: string | number | undefined): string[] {
  return String(value ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
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
    case "not_contains":
      return !String(raw ?? "")
        .toLowerCase()
        .includes(String(c.value ?? "").toLowerCase());
    case "in":
      return splitList(c.value).includes(String(raw ?? "").trim().toLowerCase());
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

  if (auto.trigger.kind === "lead.idle") {
    const days = Number(auto.trigger.idleDays);
    if (!Number.isInteger(days) || days < 1 || days > 365) {
      problems.push("Spune după câte zile fără mișcare pornește regula (între 1 și 365).");
    }
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
    if (action.type === "remove_tag" && !action.tag.trim()) {
      problems.push("Nu scrie ce etichetă să scoată.");
    }
    if (action.type === "notify") {
      if (!action.message.trim()) problems.push("Notificarea n-are text — omul n-ar ști de ce a primit-o.");
      if (action.to === "user" && !action.userId) problems.push("Alege omul care primește notificarea.");
    }
    if (action.type === "assign" && !action.userId && !action.strategy) {
      problems.push("Acțiunea de atribuire n-are nici om, nici strategie — nu s-ar atribui nimănui.");
    }
  }

  return problems;
}

const DAY_MS = 86_400_000;

/**
 * Pornește regula „idle" pentru lead-ul ăsta, acum?
 *
 * O singură dată pe PERIOADĂ de liniște: dacă regula a rulat deja după ultima mișcare a lead-ului,
 * nu mai rulează până nu se mișcă ceva. Altfel cronul zilnic ar crea câte un task „Revino la
 * client" în fiecare dimineață, pentru același lead uitat — exact zgomotul care face oamenii să
 * oprească automatizările.
 */
export function idleDue(opts: { lastActivityAt: Date; idleDays: number; now: Date; lastRunAt?: Date | null }): boolean {
  if (opts.now.getTime() - opts.lastActivityAt.getTime() < opts.idleDays * DAY_MS) return false;
  if (opts.lastRunAt && opts.lastRunAt.getTime() >= opts.lastActivityAt.getTime()) return false;
  return true;
}
