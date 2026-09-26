/**
 * Serverul (`server/lib/tasks/boardStatus.ts`) și clientul (`src/lib/tasks/board-status.ts`) au
 * câte o copie a regulii status ↔ coloană: clientul o folosește pentru mutarea optimistă a
 * cardului, serverul pentru scrierea reală. Dacă ar diverge, cardul ar sări într-o coloană pe
 * ecran și ar ateriza în alta după răspuns. Testul le compară pe toată matricea de cazuri.
 */
import { describe, expect, it } from "vitest";
import * as client from "../board-status";
import * as server from "../../../../server/lib/tasks/boardStatus";
import type { TaskStatus } from "../types";

const STATUSES: TaskStatus[] = ["todo", "in_progress", "pending", "done"];

const LISTS = [
  { id: "l1", name: "De făcut", is_done_list: false, maps_to_status: "todo" as TaskStatus },
  { id: "l2", name: "In lucru", is_done_list: false, maps_to_status: null },
  { id: "l3", name: "Review", is_done_list: false, maps_to_status: null },
  { id: "l4", name: "Custom", is_done_list: false, maps_to_status: null },
  { id: "l5", name: "Gata", is_done_list: true, maps_to_status: "done" as TaskStatus },
];

describe("regula status ↔ coloană — aceeași pe server și în client", () => {
  const now = () => "2026-09-26T09:00:00.000Z";

  it("moveStatusPatch", () => {
    for (const status of STATUSES) {
      for (const list of [...LISTS, null]) {
        expect(server.moveStatusPatch(status, list, now), `${status} → ${list?.name ?? "neîncadrat"}`).toEqual(
          client.moveStatusPatch(status, list, now),
        );
      }
    }
  });

  it("listIdForStatus", () => {
    for (const next of STATUSES) {
      for (const current of STATUSES) {
        for (const currentList of [...LISTS.map((l) => l.id), null]) {
          expect(server.listIdForStatus(next, current, currentList, LISTS)).toBe(
            client.listIdForStatus(next, current, currentList, LISTS),
          );
        }
      }
    }
  });

  it("statusFromListName și coloanele implicite", () => {
    for (const name of ["De făcut", "în lucru", "IN ASTEPTARE", "Gata", "done", "Backlog", "Altceva", ""]) {
      expect(server.statusFromListName(name)).toBe(client.statusFromListName(name));
    }
    expect(server.DEFAULT_LISTS).toEqual(client.DEFAULT_LISTS);
  });
});
