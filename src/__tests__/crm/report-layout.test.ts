/**
 * CRM-G09 — aranjamentul personal al rapoartelor, împăcat cu versiunea codului.
 */
import { describe, it, expect } from "vitest";
import { DEFAULT_LAYOUT, REPORT_SECTIONS, moveSection, resolveLayout, serializeLayout } from "@/lib/crm/reportLayout";

describe("resolveLayout", () => {
  it("[blocant] fără nimic salvat: toate secțiunile, în ordinea implicită, niciuna ascunsă", () => {
    expect(DEFAULT_LAYOUT.order).toEqual(REPORT_SECTIONS.map((s) => s.key));
    expect(DEFAULT_LAYOUT.hidden.size).toBe(0);
  });

  it("[blocant] cheile necunoscute se ignoră, secțiunile noi apar lângă vecinul lor implicit", () => {
    // Salvat înainte să existe „segments" și „insights", plus o secțiune scoasă între timp.
    const l = resolveLayout({ order: ["metrics", "funnel", "vechi", "wonLost"], hidden: ["vechi", "aging"] });
    expect(l.order).toContain("segments");
    expect(l.order.indexOf("segments")).toBe(l.order.indexOf("funnel") + 1);
    expect(l.order[0]).toBe("insights");
    expect(l.order).not.toContain("vechi");
    expect([...l.hidden]).toEqual(["aging"]);
    expect(new Set(l.order).size).toBe(REPORT_SECTIONS.length);
  });

  it("[normal] ordinea se păstrează la dus-întors prin server", () => {
    const l = resolveLayout({ order: ["team", "insights"], hiddenMetrics: ["sales"], segmentDimension: "cf_oras" });
    expect(resolveLayout(serializeLayout(l))).toEqual(l);
  });
});

describe("moveSection", () => {
  it("[normal] mută cu o poziție, iar la margini nu face nimic", () => {
    const order = DEFAULT_LAYOUT.order;
    expect(moveSection(order, "metrics", -1).slice(0, 2)).toEqual(["metrics", "insights"]);
    expect(moveSection(order, order[0], -1)).toBe(order);
    expect(moveSection(order, order[order.length - 1], 1)).toBe(order);
  });
});
