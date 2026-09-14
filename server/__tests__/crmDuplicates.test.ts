/**
 * @vitest-environment node
 *
 * Detectarea duplicatelor — logica pură, portată din crm-vector.
 *
 * De ce testele astea contează mai mult decât media: o unificare greșită e
 * IREVERSIBILĂ și amestecă istoricul a doi oameni fără nicio legătură. Fiecare
 * test de mai jos e o capcană reală în care un algoritm naiv de dedup cade.
 */
import { describe, it, expect } from "vitest";
import {
  scoreMatch,
  matchReasons,
  groupDuplicates,
  planMerge,
  leadToDedupRecord,
  DUPLICATE_THRESHOLD,
  type LeadRecord,
} from "../lib/crm/duplicates";

function lead(partial: Partial<LeadRecord> & { id: string; fullName: string }): LeadRecord {
  return {
    phone: null,
    email: null,
    company: null,
    valueCents: 0,
    debtCents: 0,
    ...partial,
  } as LeadRecord;
}

describe("scorul de potrivire", () => {
  it("[blocant] două fișe fără telefon și fără email nu sunt considerate identice", () => {
    // Capcana clasică: „null == null" → orice două lead-uri incomplete ar fi unite.
    const a = leadToDedupRecord(lead({ id: "1", fullName: "Ion Popescu" }));
    const b = leadToDedupRecord(lead({ id: "2", fullName: "Maria Ionescu" }));
    expect(scoreMatch(a, b)).toBe(0);
  });

  it("[blocant] două persoane de la aceeași firmă, cu același număr de centrală, nu sunt duplicat", () => {
    const central = "+373 22 800 800";
    const a = leadToDedupRecord(lead({ id: "1", fullName: "Ion Popescu", company: "SRL Alfa", phone: central }));
    const b = leadToDedupRecord(lead({ id: "2", fullName: "Maria Ionescu", company: "SRL Alfa", phone: central }));
    // Numele firmei e un semnal SLAB; telefonul comun singur nu trebuie să
    // ridice scorul peste prag când numele diferă complet.
    const score = scoreMatch(a, b);
    expect(score).toBeLessThan(DUPLICATE_THRESHOLD);
  });

  it("același număr scris internațional și local e recunoscut ca același om", () => {
    const a = leadToDedupRecord(lead({ id: "1", fullName: "Ion Popescu", phone: "+373 69 39 19 79" }));
    const b = leadToDedupRecord(lead({ id: "2", fullName: "Ion Popescu", phone: "069391979" }));
    expect(scoreMatch(a, b)).toBeGreaterThanOrEqual(DUPLICATE_THRESHOLD);
    expect(matchReasons(a, b).join(" ").toLowerCase()).toContain("telefon");
  });

  it("emailul scris cu majuscule și cu spații e același email", () => {
    const a = leadToDedupRecord(lead({ id: "1", fullName: "Ana Pop", email: "Ana.Pop@Exemplu.MD " }));
    const b = leadToDedupRecord(lead({ id: "2", fullName: "Ana Pop", email: "ana.pop@exemplu.md" }));
    expect(scoreMatch(a, b)).toBeGreaterThanOrEqual(DUPLICATE_THRESHOLD);
  });

  it("aceeași persoană cu telefoane diferite, dar același email, rămâne duplicat", () => {
    const a = leadToDedupRecord(lead({ id: "1", fullName: "Ana Pop", email: "ana@x.md", phone: "069111111" }));
    const b = leadToDedupRecord(lead({ id: "2", fullName: "Ana Pop", email: "ana@x.md", phone: "069222222" }));
    expect(scoreMatch(a, b)).toBeGreaterThanOrEqual(DUPLICATE_THRESHOLD);
  });
});

describe("gruparea în clustere", () => {
  it("trei fișe ale aceleiași persoane ajung într-un singur grup", () => {
    const records = [
      leadToDedupRecord(lead({ id: "1", fullName: "Ion Popescu", phone: "069391979" })),
      leadToDedupRecord(lead({ id: "2", fullName: "Ion Popescu", phone: "+373 69 39 19 79" })),
      leadToDedupRecord(lead({ id: "3", fullName: "Ion Popescu", email: "ion@x.md", phone: "069391979" })),
    ];
    const clusters = groupDuplicates(records, DUPLICATE_THRESHOLD);
    expect(clusters).toHaveLength(1);
    expect(clusters[0].records).toHaveLength(3);
  });

  it("oameni diferiți nu sunt grupați împreună", () => {
    const records = [
      leadToDedupRecord(lead({ id: "1", fullName: "Ion Popescu", phone: "069111111" })),
      leadToDedupRecord(lead({ id: "2", fullName: "Maria Ionescu", phone: "069222222" })),
    ];
    expect(groupDuplicates(records, DUPLICATE_THRESHOLD)).toHaveLength(0);
  });
});

describe("planul de unificare", () => {
  it("[blocant] planul e inspectabil înainte de scriere — arată ce valoare supraviețuiește", () => {
    const primary = lead({ id: "1", fullName: "Ion Popescu", phone: "069391979", email: null, valueCents: 10_000 });
    const dup = lead({ id: "2", fullName: "Ion Popescu", phone: null, email: "ion@x.md", valueCents: 25_000 });

    const plan = planMerge(primary, [dup]);
    // Câmpul gol pe fișa păstrată se completează din duplicat; cel plin NU se
    // suprascrie — altfel unificarea ar pierde date în tăcere.
    const emailDecision = plan.fields.find((f) => f.field === "email");
    expect(emailDecision?.value).toBe("ion@x.md");
    const phoneDecision = plan.fields.find((f) => f.field === "phone");
    expect(phoneDecision?.value ?? "069391979").toBe("069391979");
  });

  it("valorile afacerilor se adună, nu se pierd", () => {
    const primary = lead({ id: "1", fullName: "Ion", valueCents: 10_000 });
    const dup = lead({ id: "2", fullName: "Ion", valueCents: 25_000 });
    const plan = planMerge(primary, [dup]);
    expect(plan.valueCentsTotal).toBe(35_000);
  });

  it("planul spune ce rânduri se mută pe fișa păstrată", () => {
    const plan = planMerge(lead({ id: "1", fullName: "Ion" }), [lead({ id: "2", fullName: "Ion" })]);
    // Nu ne legăm de numărul exact de tabele — doar că unificarea declară
    // explicit ce mută, ca interfața să poată arăta asta omului.
    expect(Array.isArray(plan.reparented)).toBe(true);
    expect(plan.duplicateIds).toEqual(["2"]);
    expect(plan.primaryId).toBe("1");
  });
});
