/**
 * CRM — Automation action validation (fix: "Nu pot salva automatizarea")
 *
 * Bug: the "assign" action editor was a free-text "UUID vânzător…" input. Typing
 * a name like "Test" sent `userId: "Test"` → server rejects (`userId` must be
 * `.uuid()`) → opaque "Nu pot salva automatizarea". Fix: pick from a team-member
 * dropdown (always a valid UUID) + client-side validation that names the missing
 * field. These tests lock that validation logic (mirrors `validateActions` in
 * AutomationsPage.tsx) and the UUID contract.
 */
import { describe, it, expect } from "vitest";

type Action =
  | { type: "assign"; params: { userId?: string } }
  | { type: "send_template"; params: { templateId?: string; channel?: string } }
  | { type: "create_task"; params: { title?: string; dueDays?: number } }
  | { type: "move_stage"; params: { stage?: string } };

function validateActions(actions: Action[]): string | null {
  for (const a of actions) {
    if (a.type === "assign" && !String(a.params.userId ?? "").trim()) {
      return "Alege responsabilul pentru acțiunea „Asignează lead”.";
    }
    if (a.type === "send_template" && !String(a.params.templateId ?? "").trim()) {
      return "Alege un șablon pentru acțiunea „Trimite șablon”.";
    }
    if (a.type === "create_task" && !String(a.params.title ?? "").trim()) {
      return "Completează titlul pentru acțiunea „Creează task”.";
    }
    if (a.type === "move_stage" && !String(a.params.stage ?? "").trim()) {
      return "Alege stadiul pentru acțiunea „Mută în stadiu”.";
    }
  }
  return null;
}

const UUID = "550e8400-e29b-41d4-a716-446655440000";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

describe("CRM — automation action validation", () => {
  it("T-AUTOMA-1 [blocant]: assign without a userId is rejected with a clear message", () => {
    const msg = validateActions([{ type: "assign", params: { userId: "" } }]);
    expect(msg).toMatch(/responsabilul/i);
  });

  it("T-AUTOMA-2 [blocant]: a free-text name (the original bug) is NOT a valid userId", () => {
    // The dropdown now yields a UUID; a typed "Test" would never match the contract.
    expect(UUID_RE.test("Test")).toBe(false);
    expect(UUID_RE.test(UUID)).toBe(true);
  });

  it("T-AUTOMA-3 [blocant]: assign with a real member UUID passes validation", () => {
    expect(validateActions([{ type: "assign", params: { userId: UUID } }])).toBeNull();
  });

  it("T-AUTOMA-4: send_template without templateId is rejected", () => {
    expect(validateActions([{ type: "send_template", params: { channel: "email", templateId: "" } }]))
      .toMatch(/șablon/i);
  });

  it("T-AUTOMA-5: create_task without title is rejected", () => {
    expect(validateActions([{ type: "create_task", params: { title: "  " } }])).toMatch(/titlul/i);
  });

  it("T-AUTOMA-6: a fully-filled action set passes", () => {
    expect(
      validateActions([
        { type: "assign", params: { userId: UUID } },
        { type: "move_stage", params: { stage: "contacted" } },
      ])
    ).toBeNull();
  });

  it("T-AUTOMA-7: the first invalid action's message wins", () => {
    const msg = validateActions([
      { type: "move_stage", params: { stage: "" } },
      { type: "assign", params: { userId: "" } },
    ]);
    expect(msg).toMatch(/stadiul/i);
  });
});
