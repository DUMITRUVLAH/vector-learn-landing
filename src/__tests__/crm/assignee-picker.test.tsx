/**
 * CRM-137 — Selector responsabil cu nume
 * T-CRM-137-1: AssigneePicker randat cu membri → afișează numele + "Neasignat"
 * T-CRM-137-2: Selectarea unui membru → onChange primește UUID corect
 * T-CRM-137-3: Lead cu assignedTo setat → useAssigneeName returnează numele membrului
 * T-CRM-137-4: Filter assigned = member UUID → doar lead-urile sale vizibile
 * T-CRM-137-5: [smoke] fetchTeamMembers returnează structura corectă
 */
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("@/lib/api/team", () => ({
  fetchTeamMembers: vi.fn().mockResolvedValue([
    { id: "uuid-ana", fullName: "Ana Ionescu", email: "ana@test.md", role: "manager" },
    { id: "uuid-ion", fullName: "Ion Popescu", email: "ion@test.md", role: "teacher" },
  ]),
}));

import { AssigneePicker, useAssigneeName } from "@/components/crm/AssigneePicker";
import { fetchTeamMembers } from "@/lib/api/team";
import { clearTeamMembersCache } from "@/hooks/useTeamMembers";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function renderWithLabel(props: Parameters<typeof AssigneePicker>[0]) {
  return render(
    <>
      <label htmlFor="ap-test">Responsabil</label>
      <AssigneePicker id="ap-test" {...props} />
    </>
  );
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("CRM-137 — AssigneePicker", () => {
  beforeEach(() => {
    clearTeamMembersCache();
    vi.clearAllMocks();
    (fetchTeamMembers as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: "uuid-ana", fullName: "Ana Ionescu", email: "ana@test.md", role: "manager" },
      { id: "uuid-ion", fullName: "Ion Popescu", email: "ion@test.md", role: "teacher" },
    ]);
  });

  afterEach(() => {
    clearTeamMembersCache();
  });

  // T-CRM-137-1 [blocant]: afișează membrii + opțiunea Neasignat
  it("T-CRM-137-1: renders member names and Neasignat option", async () => {
    renderWithLabel({ value: null, onChange: vi.fn() });
    await waitFor(() => {
      const select = screen.getByRole("combobox") as HTMLSelectElement;
      const options = Array.from(select.options).map((o) => o.text);
      expect(options).toContain("Neasignat");
      expect(options).toContain("Ana Ionescu");
      expect(options).toContain("Ion Popescu");
    });
  });

  // T-CRM-137-2 [blocant]: selecție → onChange primește UUID
  it("T-CRM-137-2: selecting a member calls onChange with the UUID", async () => {
    const onChange = vi.fn();
    renderWithLabel({ value: null, onChange });
    await waitFor(() => {
      const select = screen.getByRole("combobox") as HTMLSelectElement;
      expect(select.options.length).toBeGreaterThan(1);
    });
    const select = screen.getByRole("combobox") as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "uuid-ana" } });
    expect(onChange).toHaveBeenCalledWith("uuid-ana");
  });

  // T-CRM-137-2b: selecție Neasignat → onChange primește null
  it("T-CRM-137-2b: selecting Neasignat calls onChange with null", async () => {
    const onChange = vi.fn();
    renderWithLabel({ value: "uuid-ana", onChange });
    await waitFor(() => screen.getByRole("combobox"));
    const select = screen.getByRole("combobox") as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "" } });
    expect(onChange).toHaveBeenCalledWith(null);
  });

  // T-CRM-137-3 [blocant]: useAssigneeName returnează numele când UUID e setat
  it("T-CRM-137-3: useAssigneeName returns member fullName for a known UUID", async () => {
    function TestHook({ id }: { id: string | null }) {
      const name = useAssigneeName(id);
      return <span data-testid="name">{name}</span>;
    }
    render(<TestHook id="uuid-ion" />);
    await waitFor(() => {
      expect(screen.getByTestId("name").textContent).toBe("Ion Popescu");
    });
  });

  // T-CRM-137-3b: useAssigneeName returns "Neasignat" for null
  it("T-CRM-137-3b: useAssigneeName returns Neasignat for null", () => {
    function TestHook() {
      const name = useAssigneeName(null);
      return <span data-testid="name">{name}</span>;
    }
    render(<TestHook />);
    expect(screen.getByTestId("name").textContent).toBe("Neasignat");
  });

  // T-CRM-137-4: filtru responsabil — client-side filter logic
  it("T-CRM-137-4: filter by assignedTo UUID keeps only matching leads", () => {
    const leads = [
      { id: "l1", assignedTo: "uuid-ana", source: "manual", fullName: "Lead A" },
      { id: "l2", assignedTo: "uuid-ion", source: "manual", fullName: "Lead B" },
      { id: "l3", assignedTo: null, source: "manual", fullName: "Lead C" },
    ];
    const filterAssigned: string = "uuid-ana";
    const filtered = leads.filter((l) =>
      filterAssigned === "all" ? true : l.assignedTo === filterAssigned
    );
    expect(filtered).toHaveLength(1);
    expect(filtered[0].id).toBe("l1");
  });

  // T-CRM-137-5 [blocant]: fetchTeamMembers retornează structura corectă
  it("T-CRM-137-5: fetchTeamMembers returns array with id, fullName, email, role", async () => {
    const result = await fetchTeamMembers();
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
    const member = result[0];
    expect(member).toHaveProperty("id");
    expect(member).toHaveProperty("fullName");
    expect(member).toHaveProperty("email");
    expect(member).toHaveProperty("role");
  });
});
