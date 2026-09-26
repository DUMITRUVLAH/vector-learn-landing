import { describe, expect, it } from "vitest";
import { groupActivityByDay, readActivity } from "../activity";

const ANA = "user-ana";
const ION = "user-ion";

describe("readActivity — responsabili", () => {
  it('spune PE CINE a adăugat, nu doar „a schimbat responsabilii"', () => {
    const r = readActivity({ action: "assignees_changed", from_value: [], to_value: [ANA] });
    expect(r.key).toBe("assignees_added");
    expect(r.added).toEqual([ANA]);
    expect(r.removed).toEqual([]);
  });

  it("spune pe cine a scos", () => {
    const r = readActivity({ action: "assignees_changed", from_value: [ANA, ION], to_value: [ION] });
    expect(r.key).toBe("assignees_removed");
    expect(r.removed).toEqual([ANA]);
  });

  it("o înlocuire e o schimbare, cu ambele liste", () => {
    const r = readActivity({ action: "assignees_changed", from_value: [ANA], to_value: [ION] });
    expect(r.key).toBe("assignees_changed");
    expect({ added: r.added, removed: r.removed }).toEqual({ added: [ION], removed: [ANA] });
  });

  it("un `null` în loc de listă nu trântește randarea", () => {
    const r = readActivity({ action: "assignees_changed", from_value: null, to_value: [ANA] });
    expect(r.added).toEqual([ANA]);
    expect(r.removed).toEqual([]);
  });

  it("ignoră valorile care nu sunt id-uri", () => {
    const r = readActivity({ action: "assignees_changed", from_value: [null, 3, ""], to_value: [ANA] });
    expect(r.added).toEqual([ANA]);
  });
});

describe("readActivity — restul câmpurilor", () => {
  it("păstrează din ce în ce pentru status și prioritate", () => {
    expect(readActivity({ action: "status_changed", from_value: "todo", to_value: "done" })).toMatchObject({
      key: "status_changed",
      from: "todo",
      to: "done",
    });
    expect(readActivity({ action: "priority_changed", from_value: "medium", to_value: "high" })).toMatchObject({
      from: "medium",
      to: "high",
    });
  });

  it("termenul are trei cazuri distincte: pus, mutat, scos", () => {
    expect(readActivity({ action: "due_date_changed", from_value: null, to_value: "2026-09-18" }).key).toBe(
      "due_date_set",
    );
    expect(readActivity({ action: "due_date_changed", from_value: "2026-09-11", to_value: null }).key).toBe(
      "due_date_cleared",
    );
    expect(readActivity({ action: "due_date_changed", from_value: "2026-09-11", to_value: "2026-09-18" }).key).toBe(
      "due_date_changed",
    );
  });

  it("descrierea rămâne un verb: textul întreg n-are ce căuta în timeline", () => {
    const r = readActivity({ action: "description_changed", from_value: "text vechi", to_value: "text nou" });
    expect(r).toEqual({ key: "description_changed", added: [], removed: [], from: null, to: null });
  });

  it("crearea și ștergerea nu au valori de arătat", () => {
    expect(readActivity({ action: "created", from_value: null, to_value: { title: "x" } }).key).toBe("created");
    expect(readActivity({ action: "deleted", from_value: null, to_value: null }).key).toBe("deleted");
  });

  it("coloana și boardul păstrează id-urile — numele se rezolvă la randare", () => {
    expect(readActivity({ action: "list_changed", from_value: "l1", to_value: "l2" })).toMatchObject({
      key: "list_changed",
      from: "l1",
      to: "l2",
    });
  });
});

describe("groupActivityByDay", () => {
  it("grupează pe zi, păstrând ordinea primită", () => {
    const g = groupActivityByDay([
      { created_at: "2026-09-10T10:00:00Z" },
      { created_at: "2026-09-10T12:00:00Z" },
      { created_at: "2026-09-09T08:00:00Z" },
    ]);
    expect(g.map((x) => [x.day, x.entries.length])).toEqual([
      ["2026-09-10", 2],
      ["2026-09-09", 1],
    ]);
  });

  it("lista goală nu produce grupuri", () => {
    expect(groupActivityByDay([])).toEqual([]);
  });
});
