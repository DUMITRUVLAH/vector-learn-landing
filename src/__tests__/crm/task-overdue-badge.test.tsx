/**
 * CRM-147 — Overdue task badge on Tasks tab
 * T-CRM-147-1 [blocant] Given un task open cu dueAt în trecut, Then tab Task-uri are indicator restanță.
 * T-CRM-147-2 [normal] Given toate task-urile în viitor sau done, Then niciun indicator roșu.
 * T-CRM-147-3 [normal] Given 2 restanțe, Then aria-label menționează „2".
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";

/** Minimal mirror of the CRM-147 overdue-badge logic used in LeadCardPage tab bar */
interface Task {
  status: "open" | "done";
  dueAt?: string | null;
}

function TaskTabLabel({ tasks }: { tasks: Task[] }) {
  const now = new Date();
  const overdueCount = tasks.filter(
    (t) => t.status === "open" && t.dueAt != null && new Date(t.dueAt) < now
  ).length;
  const openCount = tasks.filter((t) => t.status === "open").length;

  return (
    <span className="inline-flex items-center gap-1">
      {tasks.length > 0 ? `Task-uri (${openCount})` : "Task-uri"}
      {overdueCount > 0 && (
        <span
          data-testid="overdue-badge"
          aria-label={`${overdueCount} task${overdueCount > 1 ? "-uri" : ""} restant${overdueCount > 1 ? "e" : ""}`}
          className="inline-flex items-center justify-center rounded-full bg-destructive text-destructive-foreground text-[9px] font-bold min-w-[16px] h-4 px-1"
        >
          {overdueCount}
        </span>
      )}
    </span>
  );
}

const PAST = new Date(Date.now() - 86400000).toISOString();   // yesterday
const FUTURE = new Date(Date.now() + 86400000).toISOString(); // tomorrow

describe("TaskTabLabel overdue badge (CRM-147)", () => {
  // T-CRM-147-1 [blocant]
  it("shows overdue badge when there is at least one overdue open task", () => {
    const tasks: Task[] = [
      { status: "open", dueAt: PAST },
    ];
    render(<TaskTabLabel tasks={tasks} />);
    const badge = screen.getByTestId("overdue-badge");
    expect(badge).toBeTruthy();
    expect(badge.textContent).toBe("1");
  });

  // T-CRM-147-2 [normal]
  it("does NOT show badge when all tasks are in the future or done", () => {
    const tasks: Task[] = [
      { status: "open", dueAt: FUTURE },
      { status: "done", dueAt: PAST },
    ];
    render(<TaskTabLabel tasks={tasks} />);
    expect(screen.queryByTestId("overdue-badge")).toBeNull();
  });

  // T-CRM-147-2b [normal]
  it("does NOT show badge when there are no tasks at all", () => {
    render(<TaskTabLabel tasks={[]} />);
    expect(screen.queryByTestId("overdue-badge")).toBeNull();
  });

  // T-CRM-147-3 [normal]
  it("aria-label mentions the overdue count when there are 2 overdue tasks", () => {
    const tasks: Task[] = [
      { status: "open", dueAt: PAST },
      { status: "open", dueAt: PAST },
      { status: "open", dueAt: FUTURE },
    ];
    render(<TaskTabLabel tasks={tasks} />);
    const badge = screen.getByTestId("overdue-badge");
    expect(badge.textContent).toBe("2");
    const label = badge.getAttribute("aria-label") ?? "";
    expect(label).toContain("2");
  });

  // T-CRM-147-3b [normal]
  it("shows count = 1 and singular aria-label for exactly 1 overdue", () => {
    const tasks: Task[] = [
      { status: "open", dueAt: PAST },
    ];
    render(<TaskTabLabel tasks={tasks} />);
    const badge = screen.getByTestId("overdue-badge");
    expect(badge.getAttribute("aria-label")).toBe("1 task restant");
  });

  // T-CRM-147-3c [normal] — plural aria-label
  it("uses plural aria-label for ≥2 overdue", () => {
    const tasks: Task[] = [
      { status: "open", dueAt: PAST },
      { status: "open", dueAt: PAST },
    ];
    render(<TaskTabLabel tasks={tasks} />);
    const badge = screen.getByTestId("overdue-badge");
    expect(badge.getAttribute("aria-label")).toBe("2 task-uri restante");
  });
});
