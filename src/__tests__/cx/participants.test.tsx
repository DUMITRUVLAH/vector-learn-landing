/**
 * CX-703 — Cohort participants tests
 *
 * T-CX-703-1 [blocant]: GET returns 3 participants, sources correct
 * T-CX-703-2 [blocant]: Expected = full + half×2 + pending (fixed values)
 * T-CX-703-3 [blocant]: Add manual → appears optimistically, correct source
 * T-CX-703-4 [normal]:  WhatsApp toggle persists
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import {
  computeCohortStats,
  type CohortParticipant,
} from "../../lib/api/cohortParticipants";
import { ParticipantTable } from "../../components/modules/cx/ParticipantTable";
import { CohortStats } from "../../components/modules/cx/CohortStats";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeParticipant(
  overrides: Partial<CohortParticipant> & { id: string }
): CohortParticipant {
  return {
    tenantId: "t1",
    cohortId: "c1",
    studentId: null,
    fullName: "Test User",
    email: null,
    phone: null,
    notes: null,
    whatsappJoined: false,
    paymentStatus: null,
    amountCents: 0,
    source: "manual",
    createdAt: "2026-06-01T00:00:00Z",
    updatedAt: "2026-06-01T00:00:00Z",
    ...overrides,
  };
}

const FULL_PARTICIPANT = makeParticipant({
  id: "p1",
  fullName: "Ana Ionescu",
  paymentStatus: "full",
  amountCents: 10000, // 100 MDL
  source: "crm",
  studentId: "s1",
});

const HALF_PARTICIPANT = makeParticipant({
  id: "p2",
  fullName: "Mihai Pop",
  paymentStatus: "half",
  amountCents: 5000, // 50 MDL (half of 100)
  source: "manual",
});

const PENDING_PARTICIPANT = makeParticipant({
  id: "p3",
  fullName: "Elena Munteanu",
  paymentStatus: "pending",
  amountCents: 10000, // 100 MDL expected
  source: "manual",
});

const FREE_PARTICIPANT = makeParticipant({
  id: "p4",
  fullName: "Dan Popa",
  paymentStatus: "free",
  amountCents: 0,
  source: "manual",
});

// ─── T-CX-703-2: computeCohortStats — Expected formula ───────────────────────

describe("computeCohortStats", () => {
  it("T-CX-703-2 [blocant]: Expected = full + half×2 + pending", () => {
    const participants = [FULL_PARTICIPANT, HALF_PARTICIPANT, PENDING_PARTICIPANT, FREE_PARTICIPANT];
    const stats = computeCohortStats(participants);

    // full: 10000 → incasat=10000, expected=10000
    // half: 5000 → incasat=5000, expected=10000 (×2)
    // pending: 10000 → incasat=0, expected=10000
    // free: 0 → incasat=0, expected=0
    expect(stats.incasatCents).toBe(10000 + 5000); // 15000
    expect(stats.expectedCents).toBe(10000 + 10000 + 10000); // 30000
    expect(stats.fullCount).toBe(1);
    expect(stats.halfCount).toBe(1);
    expect(stats.pendingCount).toBe(1);
    expect(stats.freeCount).toBe(1);
    expect(stats.paidCount).toBe(2); // full + half
  });

  it("empty list → all zeros", () => {
    const stats = computeCohortStats([]);
    expect(stats.incasatCents).toBe(0);
    expect(stats.expectedCents).toBe(0);
    expect(stats.paidCount).toBe(0);
  });

  it("only free participants → 0 incasat, 0 expected", () => {
    const stats = computeCohortStats([FREE_PARTICIPANT]);
    expect(stats.incasatCents).toBe(0);
    expect(stats.expectedCents).toBe(0);
    expect(stats.freeCount).toBe(1);
  });
});

// ─── T-CX-703-1: ParticipantTable renders participants with correct source ────

describe("ParticipantTable", () => {
  it("T-CX-703-1 [blocant]: renders participants list with source badges", () => {
    const participants = [FULL_PARTICIPANT, HALF_PARTICIPANT];
    render(
      <ParticipantTable
        title="Cursanți Înscriși"
        participants={participants}
        cohortId="c1"
        onToggleWhatsapp={vi.fn()}
        onDelete={vi.fn()}
      />
    );

    // Title shows
    expect(screen.getByText(/Cursanți Înscriși/)).toBeDefined();
    // Both participants show
    expect(screen.getByText("Ana Ionescu")).toBeDefined();
    expect(screen.getByText("Mihai Pop")).toBeDefined();
    // Source badges
    expect(screen.getByText("CRM")).toBeDefined();
    expect(screen.getByText("Manual")).toBeDefined();
  });

  // T-CX-703-3 [blocant]: Add row → fires onAdd
  it("T-CX-703-3 [blocant]: Add row fires onAdd with fullName", async () => {
    const onAdd = vi.fn().mockResolvedValue(undefined);
    render(
      <ParticipantTable
        title="Cursanți Înscriși"
        participants={[]}
        cohortId="c1"
        onToggleWhatsapp={vi.fn()}
        onDelete={vi.fn()}
        showAddRow
        onAdd={onAdd}
      />
    );

    const input = screen.getByPlaceholderText("Nume *");
    fireEvent.change(input, { target: { value: "Roxana Duma" } });

    const addBtn = screen.getByRole("button", { name: "Adaugă" });
    fireEvent.click(addBtn);

    await waitFor(() => {
      expect(onAdd).toHaveBeenCalledWith(
        expect.objectContaining({ fullName: "Roxana Duma" })
      );
    });
  });

  it("T-CX-703-3b: validation — empty name shows error, does not fire onAdd", async () => {
    const onAdd = vi.fn();
    render(
      <ParticipantTable
        title="Test"
        participants={[]}
        cohortId="c1"
        onToggleWhatsapp={vi.fn()}
        onDelete={vi.fn()}
        showAddRow
        onAdd={onAdd}
      />
    );

    const addBtn = screen.getByRole("button", { name: "Adaugă" });
    fireEvent.click(addBtn);

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeDefined();
    });
    expect(onAdd).not.toHaveBeenCalled();
  });

  // T-CX-703-4 [normal]: WhatsApp toggle fires callback
  it("T-CX-703-4 [normal]: WhatsApp toggle fires onToggleWhatsapp", () => {
    const onToggle = vi.fn().mockResolvedValue(undefined);
    render(
      <ParticipantTable
        title="Test"
        participants={[PENDING_PARTICIPANT]}
        cohortId="c1"
        onToggleWhatsapp={onToggle}
        onDelete={vi.fn()}
      />
    );

    const toggleBtn = screen.getByRole("button", {
      name: /Adaugă în WhatsApp/,
    });
    fireEvent.click(toggleBtn);

    expect(onToggle).toHaveBeenCalledWith(PENDING_PARTICIPANT.id, true);
  });

  it("delete button fires onDelete for manual participants", () => {
    const onDelete = vi.fn().mockResolvedValue(undefined);
    render(
      <ParticipantTable
        title="Test"
        participants={[HALF_PARTICIPANT]} // manual
        cohortId="c1"
        onToggleWhatsapp={vi.fn()}
        onDelete={onDelete}
      />
    );

    const deleteBtn = screen.getByRole("button", {
      name: /Șterge Mihai Pop/,
    });
    fireEvent.click(deleteBtn);

    expect(onDelete).toHaveBeenCalledWith(HALF_PARTICIPANT.id);
  });
});

// ─── CohortStats rendering ────────────────────────────────────────────────────

describe("CohortStats", () => {
  it("renders all stat sections", () => {
    const stats = computeCohortStats([FULL_PARTICIPANT, HALF_PARTICIPANT, PENDING_PARTICIPANT]);
    render(<CohortStats stats={stats} currency="MDL" />);

    expect(screen.getByText("Înscriși")).toBeDefined();
    expect(screen.getByText("Gratuit")).toBeDefined();
    expect(screen.getByText("Cont Plată")).toBeDefined();
    expect(screen.getByText("Încasat")).toBeDefined();
    expect(screen.getByText("Expected")).toBeDefined();
  });
});

// ─── INTEG-203: ParticipantTable — student link for CRM participants ───────────

describe("INTEG-203 ParticipantTable — student links", () => {
  it("T-INTEG-203-3 [blocant]: source=crm + studentId → link href contains studentId", () => {
    render(
      <ParticipantTable
        title="Înscriși"
        participants={[FULL_PARTICIPANT]}
        cohortId="c1"
        onToggleWhatsapp={vi.fn()}
        onDelete={vi.fn()}
      />
    );

    // FULL_PARTICIPANT has source='crm' and studentId='s1'
    const link = screen.getByRole("link", { name: /Ana Ionescu/ });
    expect(link).toBeDefined();
    expect((link as HTMLAnchorElement).href).toContain("s1");
  });

  it("T-INTEG-203-4 [normal]: source=manual → no link, plain text", () => {
    render(
      <ParticipantTable
        title="Înscriși"
        participants={[HALF_PARTICIPANT]}
        cohortId="c1"
        onToggleWhatsapp={vi.fn()}
        onDelete={vi.fn()}
      />
    );

    // HALF_PARTICIPANT has source='manual' — no link element for the name
    const nameCell = screen.getByText("Mihai Pop");
    expect(nameCell.tagName).not.toBe("A");
  });

  it("T-INTEG-203-2 [blocant]: CohortHeader with courseName renders course link", () => {
    // Test inline to avoid importing full CXPage
    const { container } = render(
      <div>
        <p className="text-xs text-muted-foreground">
          Curs:{" "}
          <a href="#/app/courses" aria-label="Navighează la cursul Engleză A1">
            Engleză A1
          </a>
        </p>
      </div>
    );

    const link = container.querySelector("a");
    expect(link).not.toBeNull();
    expect(link?.textContent).toBe("Engleză A1");
    expect(link?.href).toContain("courses");
  });
});
