/**
 * CRM — distribuirea automată a lead-urilor (partea PURĂ).
 *
 * Portat din crm-vector (`src/lib/crm/assignment.ts`). Toată DECIZIA trăiește
 * aici, fără bază de date: se poate testa direct, iar previzualizarea din
 * interfață și atribuirea propriu-zisă rulează exact același cod. Dacă una ar fi
 * calculată altfel decât cealaltă, omul ar aproba un lucru și s-ar scrie altul —
 * exact greșeala pe care o evită și importul de lead-uri.
 *
 * DIFERENȚA DE FOND FAȚĂ DE SURSĂ. În crm-vector exista o tabelă separată de
 * „membri de vânzări", fiindcă `assigned_to` era text liber. Aici oamenii EXISTĂ
 * deja: sunt `users` ai workspace-ului, iar `leads.assigned_to` e o cheie către
 * ei. `crm_sales_settings` nu e un al doilea registru de persoane, e un rând de
 * SETĂRI atașat unui user existent; lipsa rândului înseamnă setările implicite,
 * nu „omul nu există". Consecința pentru modulul ăsta: `memberKey` (text) din
 * sursă a devenit `userId` (uuid), iar rosterul se construiește din `users` —
 * deci nimeni din alt workspace nu poate ajunge niciodată candidat.
 *
 * Evaluatorul de condiții vine din `automations.ts`, nu e rescris aici: o regulă
 * de distribuire și una de automatizare trebuie să înțeleagă identic aceeași
 * condiție, altfel se despart tăcut.
 */
import { conditionsPass, type AutomationCondition } from "./automations";

export const ASSIGNMENT_STRATEGIES = [
  "round_robin",
  "territory",
  "capacity",
  "weighted",
  "fixed",
] as const;
export type AssignmentStrategy = (typeof ASSIGNMENT_STRATEGIES)[number];

export function isAssignmentStrategy(value: string): value is AssignmentStrategy {
  return (ASSIGNMENT_STRATEGIES as readonly string[]).includes(value);
}

/**
 * Lead-ul așa cum îl vede motorul: obiect plat, ca să poată fi dat direct
 * evaluatorului de condiții. Stratul de date atașează aici și `region` /
 * `industry` — în FinFlow astea NU sunt coloane pe `leads`, ci pe fișa firmei
 * (`crm_companies`). Fără atașarea lor, strategia „teritoriu" n-ar avea pe ce
 * decide și ar arăta ca și cum ar funcționa, dând mereu același rezultat.
 */
export type AssignmentLead = Record<string, unknown> & { id: string };

/**
 * Un om din tragere: userul workspace-ului + setările lui de vânzări.
 * `assignedToday` = câte lead-uri i-a dat motorul azi; e baza pentru capacitate
 * și pentru distribuția ponderată.
 */
export interface AssignmentMember {
  userId: string;
  name: string;
  isActive: boolean;
  /** 0 = nelimitat. Convenție păstrată din sursă. */
  dailyCapacity: number;
  weight: number;
  regions: string[];
  industries: string[];
  orderIndex: number;
  assignedToday: number;
}

/** Regula, în forma minimă de care are nevoie decizia (fără datele de audit). */
export interface AssignmentRuleView {
  id: string;
  name: string;
  enabled: boolean;
  strategy: AssignmentStrategy;
  conditions: AutomationCondition[];
  /** Cine intră în tragere. Listă goală = toți agenții activi ai workspace-ului. */
  userIds: string[];
  orderIndex: number;
}

/**
 * De ce NU s-a atribuit lead-ul. Sursa întorcea `null` pentru toate cazurile, la
 * grămadă. Aici sunt separate, fiindcă înseamnă lucruri complet diferite pentru
 * omul care se uită la un lead fără responsabil:
 *  - `no_rule`          — nu există nicio regulă activă care să se potrivească:
 *                         distribuirea nici măcar nu e configurată pentru lead-ul ăsta;
 *  - `no_candidates`    — regula s-a potrivit, dar n-a rămas niciun agent eligibil
 *                         (toți inactivi, sau niciunul nu acoperă teritoriul);
 *  - `all_at_capacity`  — regula s-a potrivit, agenții există, dar toți și-au
 *                         atins norma zilnică.
 * Primele două se repară schimbând configurarea, a treia se repară mărind
 * capacitatea sau preluând manual. Un singur „null" le-ar fi făcut pe toate să
 * arate ca o defecțiune.
 */
export type AssignmentOutcome = "assigned" | "no_rule" | "no_candidates" | "all_at_capacity";

/**
 * Rezultatul deciziei. `reason` e populat MEREU, inclusiv când nu s-a atribuit —
 * „de ce am primit eu lead-ul ăsta" (sau „de ce n-a primit nimeni") e prima
 * întrebare în orice echipă de vânzări, iar un răspuns lipsă e mai rău decât un
 * răspuns care nu-ți place.
 */
export interface AssignmentDecision {
  userId: string | null;
  ruleId: string | null;
  ruleName: string | null;
  strategy: AssignmentStrategy | null;
  reason: string;
  outcome: AssignmentOutcome;
}

// ─── Funcții pure — inima modulului ──────────────────────────────────────────

/** O regulă se potrivește dacă TOATE condițiile ei trec (ȘI). Fără condiții = mereu. */
export function matchRule(rule: Pick<AssignmentRuleView, "conditions">, lead: AssignmentLead): boolean {
  return conditionsPass(lead, rule.conditions);
}

/** Citirea unui câmp text de pe lead (gol și absent se tratează la fel). */
function leadText(lead: AssignmentLead, field: string): string | null {
  const raw = lead[field];
  return typeof raw === "string" && raw !== "" ? raw : null;
}

/**
 * Cine e eligibil pentru o regulă + un lead: agenți activi, restrânși la
 * `rule.userIds` dacă lista e non-goală și — DOAR pentru „teritoriu" — filtrați
 * după regiune/industrie.
 *
 * Convenția de teritoriu, păstrată din sursă: lista goală de regiuni înseamnă
 * „acopăr orice regiune", nu „nu acopăr nimic". Altfel, pornirea strategiei
 * teritoriale pe un workspace neconfigurat ar goli tragerea peste noapte și
 * lead-urile ar înceta brusc să mai fie împărțite. Regiunea și industria se
 * combină cu ȘI.
 */
export function eligibleMembers(
  members: AssignmentMember[],
  rule: Pick<AssignmentRuleView, "userIds" | "strategy">,
  lead: AssignmentLead
): AssignmentMember[] {
  const active = members.filter((m) => m.isActive);
  // Un id din `userIds` care nu e în roster (om din alt workspace, cont șters)
  // pur și simplu nu are cu ce să se potrivească — nu e o eroare, e o non-alegere.
  const scoped = rule.userIds.length > 0 ? active.filter((m) => rule.userIds.includes(m.userId)) : active;
  if (rule.strategy !== "territory") return scoped;

  const region = leadText(lead, "region");
  const industry = leadText(lead, "industry");
  return scoped.filter((m) => {
    const regionOk = m.regions.length === 0 || (region !== null && m.regions.includes(region));
    const industryOk = m.industries.length === 0 || (industry !== null && m.industries.includes(industry));
    return regionOk && industryOk;
  });
}

/** Ordine stabilă: întâi `orderIndex`, apoi `userId` — două rulări pe aceleași
 *  date trebuie să dea același om, altfel nimic nu e verificabil. */
function sortDeterministic(members: AssignmentMember[]): AssignmentMember[] {
  return [...members].sort((a, b) => a.orderIndex - b.orderIndex || a.userId.localeCompare(b.userId));
}

/**
 * Round-robin determinist: sortează candidații și ia următorul după
 * `lastAssignedUserId`, cu revenire la început. Dacă ultimul nu mai e printre
 * candidați (a plecat, a fost scos din tragere, regula s-a schimbat), repornim
 * de la primul — nu blocăm atribuirea pentru un cursor rămas în aer.
 */
export function pickRoundRobin(
  candidates: AssignmentMember[],
  lastAssignedUserId: string | null
): AssignmentMember | null {
  if (candidates.length === 0) return null;
  const sorted = sortDeterministic(candidates);
  if (!lastAssignedUserId) return sorted[0];
  const idx = sorted.findIndex((m) => m.userId === lastAssignedUserId);
  if (idx === -1) return sorted[0];
  return sorted[(idx + 1) % sorted.length];
}

/** Cât mai poate primi azi. `dailyCapacity = 0` = nelimitat. */
function remainingToday(m: AssignmentMember): number {
  return m.dailyCapacity === 0 ? Number.POSITIVE_INFINITY : m.dailyCapacity - m.assignedToday;
}

/**
 * Alege omul cu cea mai multă capacitate RĂMASĂ azi. Cei care și-au atins norma
 * sunt excluși: lead-ul cade pe un coleg cu loc, nu se înghesuie peste cineva
 * care oricum nu mai apucă să sune.
 *
 * Dacă TOȚI sunt plini, întoarce `null` — iar apelantul transformă asta în
 * `all_at_capacity` și scrie un rând în jurnal. Lead-ul rămâne neatribuit, dar
 * NU dispare în tăcere: apare în lista celor fără responsabil și jurnalul spune
 * exact de ce. Alternativa (să-l dăm oricum cuiva peste normă) ar face
 * capacitatea o setare decorativă.
 */
export function pickByCapacity(candidates: AssignmentMember[]): AssignmentMember | null {
  const withRoom = candidates.filter((m) => remainingToday(m) > 0);
  if (withRoom.length === 0) return null;

  const sorted = [...withRoom].sort((a, b) => {
    const diff = remainingToday(b) - remainingToday(a);
    if (diff !== 0) return diff;
    return a.orderIndex - b.orderIndex || a.userId.localeCompare(b.userId);
  });
  return sorted[0];
}

/**
 * Distribuție ponderată: câștigă cel cu cel mai mic raport (primite azi /
 * greutate). Peste mai multe atribuiri converge spre proporția greutăților —
 * cineva cu greutate 3 primește de trei ori mai mult decât cineva cu 1.
 * `weight <= 0` e tratat ca 1: o greutate zero pusă din greșeală ar scoate omul
 * din tragere pentru totdeauna, fără ca nimeni să observe.
 */
export function pickWeighted(candidates: AssignmentMember[]): AssignmentMember | null {
  if (candidates.length === 0) return null;
  const weightOf = (m: AssignmentMember) => (m.weight > 0 ? m.weight : 1);
  const sorted = [...candidates].sort((a, b) => {
    const ratioA = a.assignedToday / weightOf(a);
    const ratioB = b.assignedToday / weightOf(b);
    if (ratioA !== ratioB) return ratioA - ratioB;
    return a.orderIndex - b.orderIndex || a.userId.localeCompare(b.userId);
  });
  return sorted[0];
}

export interface SelectAssigneeInput {
  rules: AssignmentRuleView[];
  members: AssignmentMember[];
  lead: AssignmentLead;
  lastAssignedUserId?: string | null;
}

const NO_RULE_REASON = "Nicio regulă activă nu s-a potrivit cu lead-ul — a rămas neatribuit";

/**
 * Motorul de decizie: PRIMA regulă activă (după `orderIndex`) ale cărei condiții
 * se potrivesc câștigă și e singura consultată. Dacă regula câștigătoare nu
 * produce niciun om, lead-ul rămâne neatribuit — NU „cade" pe regula
 * următoare. Asta e intenționat: regulile sunt scrise ca priorități („lead-urile
 * din Nord merg la echipa de Nord"), iar o cădere pe regula de mai jos ar trimite
 * tăcut lead-ul exact acolo unde omul a spus să nu meargă.
 */
export function selectAssignee(input: SelectAssigneeInput): AssignmentDecision {
  const { rules, members, lead, lastAssignedUserId = null } = input;
  // Regulile CU condiții se încearcă înaintea celor care prind tot (CRM-A02). Altfel o regulă
  // „toate lead-urile, pe rând" pornită întâi ar face moartă orice regulă specială scrisă după ea
  // („Google Ads → Maria"), fără nicio urmă — ar arăta „Pornită" și n-ar rula niciodată.
  const sortedRules = [...rules]
    .filter((r) => r.enabled)
    .sort(
      (a, b) =>
        Number(a.conditions.length === 0) - Number(b.conditions.length === 0) ||
        a.orderIndex - b.orderIndex ||
        a.id.localeCompare(b.id)
    );

  for (const rule of sortedRules) {
    if (!matchRule(rule, lead)) continue;

    const candidates = eligibleMembers(members, rule, lead);
    if (candidates.length === 0) {
      return {
        userId: null,
        ruleId: rule.id,
        ruleName: rule.name,
        strategy: rule.strategy,
        outcome: "no_candidates",
        reason:
          rule.strategy === "territory"
            ? `Regula „${rule.name}" (teritoriu) s-a potrivit, dar niciun agent activ nu acoperă zona lead-ului`
            : `Regula „${rule.name}" s-a potrivit, dar niciun agent activ nu e eligibil`,
      };
    }

    let picked: AssignmentMember | null;
    switch (rule.strategy) {
      case "fixed":
        // „Fix" = mereu primul din listă, în ordinea stabilită de om. Util pentru
        // „toate lead-urile din campania X merg la Maria", fără rotație.
        picked = sortDeterministic(candidates)[0];
        break;
      case "capacity":
        picked = pickByCapacity(candidates);
        break;
      case "weighted":
        picked = pickWeighted(candidates);
        break;
      case "territory":
      case "round_robin":
      default:
        // Teritoriul e deja aplicat ca filtru mai sus; între cei rămași se
        // împarte tot pe rând, ca să nu ia unul singur toată zona.
        picked = pickRoundRobin(candidates, lastAssignedUserId);
        break;
    }

    if (!picked) {
      return {
        userId: null,
        ruleId: rule.id,
        ruleName: rule.name,
        strategy: rule.strategy,
        outcome: "all_at_capacity",
        reason: `Regula „${rule.name}" (capacitate): toți agenții eligibili și-au atins norma zilnică — lead-ul a rămas neatribuit`,
      };
    }

    return {
      userId: picked.userId,
      ruleId: rule.id,
      ruleName: rule.name,
      strategy: rule.strategy,
      outcome: "assigned",
      reason: `Regula „${rule.name}" (${rule.strategy}) → ${picked.name}`,
    };
  }

  return {
    userId: null,
    ruleId: null,
    ruleName: null,
    strategy: null,
    outcome: "no_rule",
    reason: NO_RULE_REASON,
  };
}

export interface RebalancePlanEntry {
  leadId: string;
  decision: AssignmentDecision;
}

/**
 * Simulează atribuirea în lanț pentru un lot de lead-uri, ținând la zi cursorul
 * de round-robin ȘI contoarele zilei PE MĂSURĂ ce avansează. Fără asta, tot
 * lotul ar primi aceeași decizie și primul agent din listă ar lua totul — exact
 * inversul motivului pentru care există modulul.
 *
 * Pură: nu scrie nimic. Același plan e folosit și pentru previzualizare, și
 * pentru aplicare.
 */
export function planRebalance(
  leadList: AssignmentLead[],
  rules: AssignmentRuleView[],
  members: AssignmentMember[],
  lastAssignedUserId: string | null
): RebalancePlanEntry[] {
  let cursor = lastAssignedUserId;
  // Copie locală: funcția nu are voie să modifice rosterul primit.
  const running = members.map((m) => ({ ...m }));
  const out: RebalancePlanEntry[] = [];

  for (const lead of leadList) {
    const decision = selectAssignee({ rules, members: running, lead, lastAssignedUserId: cursor });
    out.push({ leadId: lead.id, decision });
    if (decision.userId) {
      cursor = decision.userId;
      const hit = running.find((m) => m.userId === decision.userId);
      if (hit) hit.assignedToday += 1;
    }
  }
  return out;
}

/** Numele omului după id, cu revenire la id-ul brut dacă a dispărut din roster. */
export function memberDisplayName(members: AssignmentMember[], userId: string): string {
  return members.find((m) => m.userId === userId)?.name ?? userId;
}
