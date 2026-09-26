/**
 * @vitest-environment node
 *
 * „Azi” — când devine restant un task. Regresia: un task „toată ziua” (păstrat la prânz local)
 * scadent AZI apărea ca restant de la ora 12, fiindcă serverul compara doar `dueAt < now`.
 * Și: un task amânat (status vechi „snoozed”) trebuie să conteze ca pas următor.
 */
import { describe, it, expect } from "vitest";
import { computeToday, isTaskOverdue, safeTimeZone, type TodayLead } from "../today";
import type { CrmLeadTask } from "../../../db/schema/crmTasks";

const TZ = "Europe/Chisinau";
// 26 sept. 2026, 15:00 la Chișinău (UTC+3) = 12:00 UTC.
const NOW = new Date("2026-09-26T12:00:00.000Z");

describe("isTaskOverdue", () => {
  it("„toată ziua” de azi (prânz local, deja trecut) NU e restant", () => {
    const dueAt = new Date("2026-09-26T09:00:00.000Z"); // 12:00 la Chișinău
    expect(isTaskOverdue({ dueAt, dueHasTime: false }, NOW, TZ)).toBe(false);
  });

  it("„toată ziua” de azi la 00:01 local nu e restant nici el", () => {
    const dueAt = new Date("2026-09-25T21:01:00.000Z"); // 26 sept. 00:01 la Chișinău
    expect(isTaskOverdue({ dueAt, dueHasTime: false }, NOW, TZ)).toBe(false);
  });

  it("„toată ziua” de ieri e restant", () => {
    const dueAt = new Date("2026-09-25T09:00:00.000Z");
    expect(isTaskOverdue({ dueAt, dueHasTime: false }, NOW, TZ)).toBe(true);
  });

  it("ziua se judecă în fusul workspace-ului, nu în UTC", () => {
    // 23:30 la Chișinău pe 26 sept. = 20:30 UTC; „acum” = 27 sept. 00:30 la Chișinău (21:30 UTC).
    // În UTC ar fi aceeași zi (26) — deci nerestant; în fusul workspace-ului ziua s-a terminat.
    const dueAt = new Date("2026-09-26T20:30:00.000Z");
    const now = new Date("2026-09-26T21:30:00.000Z");
    expect(isTaskOverdue({ dueAt, dueHasTime: false }, now, TZ)).toBe(true);
    expect(isTaskOverdue({ dueAt, dueHasTime: false }, now, "UTC")).toBe(false);
  });

  it("taskul cu oră e restant imediat după ora lui", () => {
    expect(isTaskOverdue({ dueAt: new Date(NOW.getTime() - 60_000), dueHasTime: true }, NOW, TZ)).toBe(true);
    expect(isTaskOverdue({ dueAt: new Date(NOW.getTime() + 60_000), dueHasTime: true }, NOW, TZ)).toBe(false);
  });

  it("fără scadență nu e niciodată restant", () => {
    expect(isTaskOverdue({ dueAt: null, dueHasTime: false }, NOW, TZ)).toBe(false);
  });

  it("un fus scris greșit cade pe cel implicit, nu aruncă", () => {
    expect(safeTimeZone("Europe/Nicaieri")).toBe("Europe/Chisinau");
    expect(safeTimeZone(null)).toBe("Europe/Chisinau");
    expect(safeTimeZone("Europe/Bucharest")).toBe("Europe/Bucharest");
  });
});

describe("computeToday", () => {
  const lead: TodayLead = {
    id: "lead-1",
    fullName: "Ion",
    dealName: null,
    phone: null,
    company: null,
    stage: "new",
    assignedTo: null,
    valueCents: 0,
    createdAt: NOW,
  };
  const task = (over: Partial<CrmLeadTask>): CrmLeadTask =>
    ({
      id: "t-1",
      tenantId: "ten",
      leadId: lead.id,
      title: "Sună",
      dueAt: null,
      dueHasTime: false,
      status: "open",
      assignedTo: null,
      createdBy: null,
      completedAt: null,
      createdAt: NOW,
      updatedAt: NOW,
      ...over,
    }) as CrmLeadTask;
  const base = { leads: [lead], lastTouchByLead: {}, contactedLeadIds: new Set<string>(), stages: [], now: NOW, timeZone: TZ };

  it("taskul „toată ziua” de azi nu intră în restanțe", () => {
    const b = computeToday({ ...base, tasksByLead: { [lead.id]: [task({ dueAt: new Date("2026-09-26T09:00:00.000Z") })] } });
    expect(b.overdueTasks).toHaveLength(0);
  });

  it("un task rămas „snoozed” (rând vechi) e tot pas următor și poate fi restant", () => {
    const b = computeToday({
      ...base,
      tasksByLead: { [lead.id]: [task({ status: "snoozed", dueAt: new Date("2026-09-20T09:00:00.000Z") })] },
    });
    expect(b.noNextStep).toHaveLength(0);
    expect(b.overdueTasks).toHaveLength(1);
  });
});
