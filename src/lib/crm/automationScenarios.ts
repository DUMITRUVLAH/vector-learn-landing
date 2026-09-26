/**
 * CRM — scenariile gata făcute (CRM-A02).
 *
 * Ownerul: „scenarii predefinite să fie deja". O pagină de automatizări goală cere omului să
 * inventeze singur ce ar putea automatiza; aproape nimeni nu o face. Scenariile de aici sunt
 * regulile pe care le pornește orice echipă de vânzări în prima săptămână — omul doar le aprinde.
 *
 * Un scenariu NU e o regulă salvată: e o rețetă din care se construiește una, pe pâlnia ACESTUI
 * workspace. Etapele se aleg după rol (câștigat / pierdut), nu după cheie, fiindcă fiecare client
 * își numește etapele altfel. Dacă pâlnia n-are rolul cerut, scenariul nu se poate porni și spune
 * de ce, în loc să creeze o regulă care n-ar prinde niciodată nimic.
 *
 * Regula creată ține minte `templateKey`, deci pagina știe ce e deja pornit.
 */
import type { CrmStage } from "@/lib/api/crm";
import type { CrmAutomationInput } from "@/lib/api/crmAutomations";
import type { CrmAssignmentRuleInput } from "@/lib/api/crmAssignment";

export interface AutomationScenario {
  key: string;
  title: string;
  /** De ce ar vrea cineva regula asta — o propoziție, în limbajul vânzărilor. */
  why: string;
  /** `null` = pâlnia n-are etapa de care are nevoie scenariul; `missing` spune care. */
  build: (stages: CrmStage[]) => CrmAutomationInput | null;
  missing?: string;
}

const wonStage = (stages: CrmStage[]) => stages.find((s) => s.isWon)?.key ?? null;
const lostStage = (stages: CrmStage[]) => stages.find((s) => s.isLost)?.key ?? null;

export const AUTOMATION_SCENARIOS: AutomationScenario[] = [
  {
    key: "new-lead-call",
    title: "Sună fiecare lead nou în aceeași zi",
    why: "Șansa de vânzare scade vizibil după prima oră. Taskul apare la responsabil, cu scadență azi.",
    build: () => ({
      name: "Sună fiecare lead nou în aceeași zi",
      trigger: { kind: "lead.created" },
      conditions: [],
      actions: [{ type: "create_task", title: "Sună clientul", dueInDays: 0 }],
    }),
  },
  {
    key: "idle-3-days",
    title: "Nu lăsa lead-urile uitate",
    why: "Un lead neatins 3 zile primește un task „Revino la client”, iar responsabilul e anunțat.",
    build: () => ({
      name: "Nu lăsa lead-urile uitate",
      trigger: { kind: "lead.idle", idleDays: 3 },
      conditions: [],
      actions: [
        { type: "create_task", title: "Revino la client", dueInDays: 0 },
        { type: "notify", to: "assignee", message: "stă neatins de 3 zile" },
      ],
    }),
  },
  {
    key: "idle-14-cold",
    title: "Marchează lead-urile reci",
    why: "După 14 zile de liniște lead-ul primește eticheta „rece”, ca să-l poți filtra la o campanie.",
    build: () => ({
      name: "Marchează lead-urile reci",
      trigger: { kind: "lead.idle", idleDays: 14 },
      conditions: [],
      actions: [{ type: "add_tag", tag: "rece" }],
    }),
  },
  {
    key: "warm-again",
    title: "Scoate „rece” când lead-ul se mișcă",
    why: "Perechea scenariului de mai sus: lead-ul care trece într-o etapă nouă nu mai e rece.",
    build: () => ({
      name: "Scoate „rece” când lead-ul se mișcă",
      trigger: { kind: "lead.stage_changed" },
      conditions: [{ field: "tags", op: "contains", value: "rece" }],
      actions: [{ type: "remove_tag", tag: "rece" }],
    }),
  },
  {
    key: "social-tag",
    title: "Marchează lead-urile din rețele sociale",
    why: "Eticheta „social” pe tot ce vine din Facebook și Instagram — vezi dintr-o privire ce aduc reclamele.",
    build: () => ({
      name: "Marchează lead-urile din rețele sociale",
      trigger: { kind: "lead.created" },
      conditions: [{ field: "source", op: "in", value: "facebook_ad,instagram" }],
      actions: [{ type: "add_tag", tag: "social" }],
    }),
  },
  {
    key: "big-deal",
    title: "Anunță conducerea la o afacere mare",
    why: "Un lead de cel puțin 10 000 primește eticheta „afacere mare”, iar administratorii află imediat.",
    build: () => ({
      name: "Anunță conducerea la o afacere mare",
      trigger: { kind: "lead.created" },
      conditions: [{ field: "valueCents", op: "gte", value: 1_000_000 }],
      actions: [
        { type: "add_tag", tag: "afacere mare" },
        { type: "notify", to: "admins", message: "a intrat o afacere mare" },
      ],
    }),
  },
  {
    key: "won-handoff",
    title: "Pașii de după vânzare",
    why: "Când lead-ul e câștigat: task „Trimite factura și contractul” pe mâine, iar administratorii află.",
    missing: "Pâlnia n-are o etapă marcată „câștigat”.",
    build: (stages) => {
      const won = wonStage(stages);
      if (!won) return null;
      return {
        name: "Pașii de după vânzare",
        trigger: { kind: "lead.stage_changed", toStage: won },
        conditions: [],
        actions: [
          { type: "create_task", title: "Trimite factura și contractul", dueInDays: 1 },
          { type: "notify", to: "admins", message: "vânzare câștigată" },
        ],
      };
    },
  },
  {
    key: "lost-recontact",
    title: "Revino peste 3 luni la cei pierduți",
    why: "Un „nu” de azi e adesea un „da” peste un trimestru. Taskul apare singur, peste 90 de zile.",
    missing: "Pâlnia n-are o etapă marcată „pierdut”.",
    build: (stages) => {
      const lost = lostStage(stages);
      if (!lost) return null;
      return {
        name: "Revino peste 3 luni la cei pierduți",
        trigger: { kind: "lead.stage_changed", toStage: lost },
        conditions: [],
        actions: [{ type: "create_task", title: "Recontactează clientul", dueInDays: 90 }],
      };
    },
  },
];

export interface AssignmentScenario {
  key: string;
  title: string;
  why: string;
  rule: CrmAssignmentRuleInput;
}

export const ASSIGNMENT_SCENARIOS: AssignmentScenario[] = [
  {
    key: "dist-round-robin",
    title: "Pe rând, la toată echipa",
    why: "Fiecare lead nou merge la următorul agent din tragere. Cea mai simplă și cea mai corectă.",
    rule: { name: "Pe rând, la toată echipa", strategy: "round_robin", conditions: [], userIds: [] },
  },
  {
    key: "dist-capacity",
    title: "Primește cine are loc azi",
    why: "Lead-ul merge la agentul cel mai departe de norma lui zilnică. Bun când oamenii lucrează inegal.",
    rule: { name: "Primește cine are loc azi", strategy: "capacity", conditions: [], userIds: [] },
  },
  {
    key: "dist-weighted",
    title: "Seniorii primesc mai mult",
    why: "Împărțire după greutatea din tabelul de mai jos: greutate 2 = de două ori mai multe lead-uri.",
    rule: { name: "Seniorii primesc mai mult", strategy: "weighted", conditions: [], userIds: [] },
  },
  {
    key: "dist-territory",
    title: "După regiune",
    why: "Lead-ul merge la agentul care acoperă regiunea lui. Completează „Regiuni” în tabelul de mai jos.",
    rule: { name: "După regiune", strategy: "territory", conditions: [], userIds: [] },
  },
];
