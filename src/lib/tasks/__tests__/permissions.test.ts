import { describe, expect, it } from "vitest";
import { canDeleteSubtask, canFullyEditTask } from "../permissions";

const EU = "user-eu";
const ALTUL = "user-altul";
const BOARD = "board-1";

const task = (over: Partial<{ created_by: string | null; board_id: string | null }> = {}) => ({
  created_by: ALTUL as string | null,
  board_id: BOARD as string | null,
  ...over,
});
const subtask = (
  over: Partial<{
    created_by: string | null;
    board_id: string | null;
    parent_task_id: string | null;
    assignees: string[];
  }> = {},
) => ({
  created_by: ALTUL as string | null,
  board_id: BOARD as string | null,
  parent_task_id: "parent-1" as string | null,
  assignees: [] as string[],
  ...over,
});
const ctx = (over: Partial<Parameters<typeof canFullyEditTask>[1]> = {}) => ({
  userId: EU,
  isHRAdmin: false,
  isSuperAdmin: false,
  board: { id: BOARD, created_by: ALTUL, can_edit: false },
  ...over,
});

describe("canDeleteSubtask", () => {
  it("creatorul poate șterge subtaskul creat de el", () => {
    expect(canDeleteSubtask(subtask({ created_by: EU }), ctx())).toBe(true);
  });

  it("responsabilul poate șterge subtaskul pe care este alocat", () => {
    expect(canDeleteSubtask(subtask({ assignees: [EU] }), ctx())).toBe(true);
  });

  it("un coleg fără legătură nu poate șterge subtaskul", () => {
    expect(canDeleteSubtask(subtask(), ctx())).toBe(false);
  });

  it("excepția responsabilului nu se aplică unui task principal", () => {
    expect(canDeleteSubtask(subtask({ parent_task_id: null, assignees: [EU] }), ctx())).toBe(false);
  });
});

describe("canFullyEditTask", () => {
  it("HR și super admin pot oricând", () => {
    expect(canFullyEditTask(task(), ctx({ isHRAdmin: true }))).toBe(true);
    expect(canFullyEditTask(task(), ctx({ isSuperAdmin: true }))).toBe(true);
  });

  it("creatorul task-ului poate, chiar fără drepturi pe board", () => {
    expect(canFullyEditTask(task({ created_by: EU }), ctx())).toBe(true);
  });

  it("editorul boardului poate", () => {
    expect(canFullyEditTask(task(), ctx({ board: { id: BOARD, created_by: ALTUL, can_edit: true } }))).toBe(true);
  });

  it("creatorul boardului poate, chiar dacă nu e membru", () => {
    expect(canFullyEditTask(task(), ctx({ board: { id: BOARD, created_by: EU, can_edit: false } }))).toBe(true);
  });

  it("un simplu responsabil NU poate — asta e regula pe care o impune triggerul", () => {
    // Bug real: coșul de ștergere apărea oricui deschidea task-ul, iar serverul
    // refuza cu 42501 „Responsabilul poate schimba doar progresul".
    expect(canFullyEditTask(task(), ctx())).toBe(false);
  });

  it("un task personal (fără board) rămâne al creatorului lui", () => {
    expect(canFullyEditTask(task({ board_id: null, created_by: EU }), ctx({ board: null }))).toBe(true);
    expect(canFullyEditTask(task({ board_id: null }), ctx({ board: null }))).toBe(false);
  });

  it("fără utilizator sau fără task nu există drepturi", () => {
    expect(canFullyEditTask(task(), ctx({ userId: null }))).toBe(false);
    expect(canFullyEditTask(null, ctx())).toBe(false);
  });

  it("boardul necunoscut sau nepotrivit nu dă drepturi", () => {
    // Dacă lista de boarduri n-a ajuns încă, nu presupunem drepturi: un buton
    // în plus minte, unul lipsă doar întârzie.
    expect(canFullyEditTask(task(), ctx({ board: null }))).toBe(false);
    expect(canFullyEditTask(task(), ctx({ board: { id: "alt-board", created_by: EU, can_edit: true } }))).toBe(false);
  });

  it("`can_edit` absent (migrația neaplicată) nu se citește ca permisiune", () => {
    expect(canFullyEditTask(task(), ctx({ board: { id: BOARD, created_by: ALTUL } }))).toBe(false);
  });
});
