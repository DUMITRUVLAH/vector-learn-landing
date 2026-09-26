/**
 * @vitest-environment node
 */
import { describe, it, expect } from "vitest";
import {
  formatJournal,
  historicalWhenProblems,
  journalProblems,
  nextNumber,
  planRenumber,
  retag,
  unionJournals,
} from "../lib/migrationPlan.mjs";

const j = (...entries) => ({ version: "7", dialect: "postgresql", entries });
const e = (idx, tag, when) => ({ idx, version: "7", when, tag, breakpoints: true });

const MAIN = j(e(0, "0000_init", 100), e(1, "0001_b", 200), e(2, "0002_c", 300));

describe("planRenumber", () => {
  it("[blocant] o migrare proprie cu același număr ca main e mutată peste main, cu `when` peste main", () => {
    const local = j(...MAIN.entries, e(2, "0002_mine", 301));
    const plan = planRenumber(MAIN, local);
    expect(plan.changes).toEqual([{ from: "0002_mine", to: "0003_mine", idx: 3, when: 301, oldWhen: 301 }]);
    expect(plan.journal.entries.map((x) => x.tag)).toEqual(["0000_init", "0001_b", "0002_c", "0003_mine"]);
    expect(journalProblems(plan.journal, new Set(["0003_mine"]))).toEqual([]);
  });

  it("[blocant] `when` egal cu al lui main (două branch-uri, același „ultimul + 1”) e ridicat", () => {
    const main = j(...MAIN.entries, e(3, "0003_theirs", 301));
    const local = j(...MAIN.entries, e(3, "0003_theirs", 301), e(4, "0004_mine", 301));
    const plan = planRenumber(main, local);
    expect(plan.own[0]).toMatchObject({ tag: "0004_mine", when: 302 });
  });

  it("[blocant] sare peste numerele rezervate de alți agenți", () => {
    const local = j(...MAIN.entries, e(2, "0002_mine", 999));
    const plan = planRenumber(MAIN, local, new Set([3, 4]));
    expect(plan.own[0].tag).toBe("0005_mine");
  });

  it("[normal] două migrări proprii rămân în ordine și primesc numere distincte", () => {
    const local = j(...MAIN.entries, e(2, "0002_x", 301), e(3, "0003_y", 302));
    const plan = planRenumber(MAIN, local);
    expect(plan.own.map((x) => x.tag)).toEqual(["0003_x", "0004_y"]);
    expect(plan.own.map((x) => x.when)).toEqual([301, 302]);
  });

  it("[normal] o migrare deja corectă nu e atinsă", () => {
    const local = j(...MAIN.entries, e(3, "0003_ok", 301));
    expect(planRenumber(MAIN, local).changes).toEqual([]);
  });
});

describe("unionJournals", () => {
  it("[blocant] păstrează migrarea ambelor părți (nu „a mea” sau „a lor”)", () => {
    const theirs = j(...MAIN.entries, e(3, "0003_theirs", 301));
    const mine = j(...MAIN.entries, e(3, "0003_mine", 301));
    expect(unionJournals(theirs, mine).entries.map((x) => x.tag)).toEqual([
      "0000_init",
      "0001_b",
      "0002_c",
      "0003_theirs",
      "0003_mine",
    ]);
  });
});

describe("journalProblems", () => {
  it("[blocant] prinde idx, tag și prefix duplicat", () => {
    const bad = j(...MAIN.entries, e(3, "0003_a", 301), e(3, "0003_b", 302));
    const p = journalProblems(bad);
    expect(p.join("\n")).toMatch(/idx duplicat: 3/);
    expect(p.join("\n")).toMatch(/prefix de fișier duplicat: 0003/);
  });

  it("[blocant] prinde `when`-ul propriu care nu trece de main (drizzle ar sări migrarea)", () => {
    const bad = j(...MAIN.entries, e(3, "0003_mine", 250));
    expect(journalProblems(bad, new Set(["0003_mine"])).join("\n")).toMatch(/SĂRI/);
  });

  it("[normal] istoria ne-crescătoare doar se raportează, nu blochează", () => {
    const hist = j(e(0, "0000_a", 200), e(1, "0001_b", 100));
    expect(journalProblems(hist)).toEqual([]);
    expect(historicalWhenProblems(hist)).toEqual(["0001_b"]);
  });
});

describe("utilitare", () => {
  it("[normal] nextNumber ia în calcul main, local și rezervările", () => {
    expect(nextNumber(MAIN, MAIN, [7])).toBe(8);
    expect(nextNumber(MAIN, MAIN)).toBe(3);
  });

  it("[normal] retag și formatJournal", () => {
    expect(retag("0191_crm_task_ora", 193)).toBe("0193_crm_task_ora");
    expect(formatJournal(j()).endsWith("}\n")).toBe(true);
  });
});
