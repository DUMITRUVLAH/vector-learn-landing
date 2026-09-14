/**
 * CRM Faza 9 — clopoțelul de remindere.
 *
 * Portare din crm-vector (`RemindersBell`). Ce trebuie să fie adevărat: insigna e corectă ÎNAINTE
 * de a deschide panoul (altfel n-ar avea rost), numără doar ce e urgent (restant + azi), iar
 * taskurile se grupează pe scadență. Bifatul scoate taskul din listă pe loc.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { CrmUpcomingTask } from "@/lib/api/crm";

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date("2026-03-10T12:00:00.000Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

const listCrmUpcomingTasks = vi.fn();
const completeCrmLeadTask = vi.fn();

vi.mock("@/lib/api/crm", () => ({
  listCrmUpcomingTasks: (...a: unknown[]) => listCrmUpcomingTasks(...a),
  completeCrmLeadTask: (...a: unknown[]) => completeCrmLeadTask(...a),
}));

const { RemindersBell, bucketOf } = await import("@/components/crm/RemindersBell");

function makeTask(overrides: Partial<CrmUpcomingTask>): CrmUpcomingTask {
  return {
    id: "task-1",
    tenantId: "t1",
    leadId: "lead-1",
    title: "Sună clientul",
    dueAt: "2026-03-09T10:00:00.000Z",
    status: "open",
    assignedTo: "user-1",
    createdBy: "user-1",
    completedAt: null,
    createdAt: "2026-03-01T10:00:00.000Z",
    updatedAt: "2026-03-01T10:00:00.000Z",
    leadFullName: "Acme SRL",
    leadDealName: null,
    ...overrides,
  };
}

describe("Gruparea pe scadență", () => {
  it("[normal] restant / azi / mâine / mai târziu — funcție pură, fără ceas fals", () => {
    const now = new Date("2026-03-10T12:00:00.000Z");
    expect(bucketOf(new Date("2026-03-09T10:00:00.000Z"), now)).toBe("restante");
    // Ora locală decide ziua, nu UTC: 15:00 UTC e tot 10 martie oriunde în Europa.
    expect(bucketOf(new Date("2026-03-10T15:00:00.000Z"), now)).toBe("azi");
    expect(bucketOf(new Date("2026-03-11T09:00:00.000Z"), now)).toBe("maine");
    expect(bucketOf(new Date("2026-03-20T09:00:00.000Z"), now)).toBe("mai_tarziu");
  });
});

describe("Clopoțelul", () => {
  it("[blocant] insigna numără doar urgentele și e corectă înainte de deschidere", async () => {
    listCrmUpcomingTasks.mockResolvedValue({
      items: [
        makeTask({ id: "t-restant", dueAt: "2026-03-09T10:00:00.000Z" }),
        makeTask({ id: "t-azi", dueAt: "2026-03-10T15:00:00.000Z" }),
        makeTask({ id: "t-tarziu", dueAt: "2026-03-25T10:00:00.000Z" }),
      ],
    });

    render(<RemindersBell ownerId="user-1" />);

    // 3 taskuri în total, dar doar 2 urgente (restant + azi) — altfel insigna ar arăta mereu
    // un număr mare și n-ar mai însemna „uită-te acum".
    const bell = await screen.findByRole("button", { name: "Remindere (2 urgente din 3)" });
    expect(bell).toHaveTextContent("2");
    expect(listCrmUpcomingTasks).toHaveBeenCalledWith("user-1");
  });

  it("[blocant] panoul grupează taskurile pe scadență", async () => {
    listCrmUpcomingTasks.mockResolvedValue({
      items: [
        makeTask({ id: "t-restant", title: "Restant acum", dueAt: "2026-03-09T10:00:00.000Z" }),
        makeTask({ id: "t-maine", title: "De mâine", dueAt: "2026-03-11T09:00:00.000Z" }),
      ],
    });

    render(<RemindersBell ownerId="user-1" />);
    fireEvent.click(await screen.findByRole("button", { name: /Remindere/ }));

    expect(await screen.findByText(/Restante · 1/)).toBeInTheDocument();
    expect(screen.getByText(/Mâine · 1/)).toBeInTheDocument();
    expect(screen.getByText("Restant acum")).toBeInTheDocument();
    expect(screen.getByText("De mâine")).toBeInTheDocument();
  });

  it("[blocant] click pe un reminder deschide leadul lui", async () => {
    const onOpenLead = vi.fn();
    listCrmUpcomingTasks.mockResolvedValue({ items: [makeTask({ leadId: "lead-42" })] });

    render(<RemindersBell ownerId="user-1" onOpenLead={onOpenLead} />);
    fireEvent.click(await screen.findByRole("button", { name: /Remindere/ }));
    fireEvent.click(await screen.findByText("Sună clientul"));

    expect(onOpenLead).toHaveBeenCalledWith("lead-42");
  });

  it("[blocant] bifarea scoate taskul din listă și din insignă", async () => {
    listCrmUpcomingTasks.mockResolvedValue({ items: [makeTask({})] });
    completeCrmLeadTask.mockResolvedValue({});

    render(<RemindersBell ownerId="user-1" />);
    fireEvent.click(await screen.findByRole("button", { name: /Remindere/ }));
    fireEvent.click(await screen.findByRole("button", { name: /Marchează/ }));

    await waitFor(() => expect(completeCrmLeadTask).toHaveBeenCalledWith("task-1"));
    await waitFor(() => expect(screen.queryByText("Sună clientul")).not.toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Remindere (0 urgente din 0)" })).toBeInTheDocument();
  });

  it("[normal] o eroare de rețea lasă clopoțelul gol, nu strică ecranul", async () => {
    listCrmUpcomingTasks.mockRejectedValue(new Error("network"));

    render(<RemindersBell ownerId="user-1" />);

    const bell = await screen.findByRole("button", { name: "Remindere (0 urgente din 0)" });
    fireEvent.click(bell);
    expect(await screen.findByText(/Niciun task cu scadență/)).toBeInTheDocument();
  });
});
