/**
 * @vitest-environment jsdom
 */
/**
 * Configurația raportului PAR — modelul pur din spatele ecranului „Rapoarte & statistici".
 *
 * Ce apără testele: (1) filtrele ajung în query string-ul pe care îl primesc ȘI graficele, ȘI
 * exporturile — un filtru care se aplică doar pe ecran produce un fișier care contrazice
 * raportul; (2) baza aleasă (estimat vs plătit) schimbă cifra citită, nu doar eticheta;
 * (3) configurația salvată se citește înapoi întreagă, altfel raportul se reconstruiește de la
 * zero la fiecare intrare.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  EMPTY_CONFIG,
  activeFilterLabels,
  basisCents,
  configToFilters,
  loadReportConfig,
  saveReportConfig,
  type ReportConfig,
} from "@/lib/par/reportConfig";
import { parReportQuery } from "@/lib/api/par";

const cfg = (patch: Partial<ReportConfig> = {}): ReportConfig => ({ ...EMPTY_CONFIG, ...patch });

// Node 26 expune un `localStorage` global gol dacă nu pornești cu `--localstorage-file`, iar el
// umbrește implementarea din jsdom. Stub-ul ține testul independent de cum e pornit runner-ul.
const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, String(v)); },
    removeItem: (k: string) => { store.delete(k); },
    clear: () => store.clear(),
  });
});

describe("configToFilters", () => {
  it("[blocant] trimite fiecare filtru mai departe, cu numele pe care le știe serverul", () => {
    const f = configToFilters(cfg({
      from: "2026-01-01", to: "2026-03-31",
      status: ["approved", "paid"],
      payerId: "11111111-1111-1111-1111-111111111111",
      projectId: "22222222-2222-2222-2222-222222222222",
      departmentId: "33333333-3333-3333-3333-333333333333",
      purpose: "execute_payment", chargeTo: "program", currency: "EUR", q: " Orange ",
    }));
    expect(f).toEqual({
      period_from: "2026-01-01",
      period_to: "2026-03-31",
      status: "approved,paid",
      payer_id: "11111111-1111-1111-1111-111111111111",
      project_id: "22222222-2222-2222-2222-222222222222",
      department_id: "33333333-3333-3333-3333-333333333333",
      purpose: "execute_payment",
      charge_to: "program",
      currency: "EUR",
      q: " Orange ",
    });
  });

  it("un camp gol nu ajunge in filtre - altfel serverul ar filtra pe sir vid", () => {
    expect(configToFilters(cfg())).toEqual({
      period_from: undefined, period_to: undefined, status: undefined,
      payer_id: undefined, project_id: undefined, department_id: undefined,
      purpose: undefined, charge_to: undefined, currency: undefined, q: undefined,
    });
  });

  it("[blocant] aceleași filtre produc query string-ul folosit de exporturi", () => {
    const qs = parReportQuery(configToFilters(cfg({ projectId: "44444444-4444-4444-4444-444444444444", status: ["paid"] })));
    expect(qs).toContain("project_id=44444444-4444-4444-4444-444444444444");
    expect(qs).toContain("status=paid");
  });
});

describe("basisCents", () => {
  const item = { id: "1", label: "LED", totalCents: 500_00, paidCents: 120_00, count: 3 };

  it("[blocant] baza estimat citește totalul, baza plătit citește banii chiar ieșiți", () => {
    expect(basisCents(item, "estimated")).toBe(500_00);
    expect(basisCents(item, "paid")).toBe(120_00);
  });

  it("o dimensiune fără sume plătite raportează 0, nu estimatul deghizat în plată", () => {
    expect(basisCents({ id: "2", label: "X", totalCents: 900_00, count: 1 }, "paid")).toBe(0);
  });
});

describe("activeFilterLabels", () => {
  const names = {
    payers: { p1: "ATIC" },
    projects: { pr1: "LED" },
    departments: { d1: "Programe" },
  };

  it("spune în cuvinte ce restrânge cifrele — textul ajunge și în antetul PDF-ului", () => {
    const labels = activeFilterLabels(cfg({ payerId: "p1", projectId: "pr1", departmentId: "d1", status: ["paid"], currency: "EUR", q: "Orange" }), names);
    expect(labels).toContain("Plătitor: ATIC");
    expect(labels).toContain("Proiect: LED");
    expect(labels).toContain("Departament: Programe");
    expect(labels).toContain("Status: Plătită");
    expect(labels).toContain("Monedă: EUR");
    expect(labels.some((l) => l.includes("Orange"))).toBe(true);
  });

  it("fără filtre nu inventează etichete", () => {
    expect(activeFilterLabels(cfg(), names)).toEqual([]);
  });
});

describe("persistența configurației", () => {
  it("[blocant] se citește înapoi întreagă — raportul nu se reconstruiește la fiecare intrare", () => {
    const saved = cfg({ from: "2026-02-01", status: ["approved"], basis: "paid", topN: 25, tab: "project" });
    saveReportConfig(saved);
    expect(loadReportConfig()).toEqual(saved);
  });

  it("o valoare coruptă în localStorage nu prăbușește pagina", () => {
    store.set("par.reports.config.v1", "{nu-i json");
    expect(loadReportConfig()).toEqual(EMPTY_CONFIG);
  });

  it("o configurație veche, fără câmpuri noi, se completează cu valorile implicite", () => {
    store.set("par.reports.config.v1", JSON.stringify({ from: "2026-01-01" }));
    const loaded = loadReportConfig();
    expect(loaded.from).toBe("2026-01-01");
    expect(loaded.status).toEqual([]);
    expect(loaded.topN).toBe(10);
    expect(loaded.basis).toBe("estimated");
  });
});
