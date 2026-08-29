/**
 * Alegerea unui articol dintr-o cerere anterioară — bug raportat de owner (2026-08-29):
 * „dacă pun ceva din trecut, la fel nu se updatează".
 *
 * Cauza: când moneda cererii curente diferea de cea a cererii din care venea articolul,
 * formularul golea câmpul „Preț/u" și cerea suma manual. Din scaunul utilizatorului, lista de
 * ales pur și simplu nu completa rândul. Acum serverul întoarce prețul deja exprimat în moneda
 * cererii (curs BNM), iar formularul îl pune în câmp ȘI spune din ce sumă vine.
 *
 * Regula §3.5.1quater: testul CHEAMĂ acțiunea (click pe sugestie) și verifică rezultatul —
 * valoarea din input —, nu doar că lista se randează.
 *
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { ParCreateForm } from "../ParCreateForm";
import * as parApi from "@/lib/api/par";
import type { ParLineItemSuggestion, ParRequest } from "@/lib/api/par";

vi.mock("@/router/HashRouter", () => ({
  useRouter: () => ({ path: "/business/par/new", navigate: vi.fn() }),
}));
vi.mock("@/hooks/useSession", () => ({
  useSession: () => ({
    data: {
      user: { id: "u-1", name: "Test User", email: "t@vector.md", role: "manager" },
      tenant: { id: "t-1", name: "ATIC" },
    },
  }),
}));
vi.mock("@/components/app/AppShell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

function suggestion(over: Partial<ParLineItemSuggestion> = {}): ParLineItemSuggestion {
  return {
    key: "test",
    description: "Test",
    unit: "buc",
    unitPriceCents: 2_000_00,
    currency: "MDL",
    targetUnitPriceCents: null,
    targetCurrency: null,
    quantity: 3,
    usageCount: 3,
    lastUsedAt: "2026-08-01T00:00:00.000Z",
    sourceRequestNo: "PAR-2026-0032",
    payee: {
      vendorId: null,
      name: "Centrul de Resurse Juridice",
      idnp: null,
      iban: "MD24AG000225100013104168",
      bank: "MAIB",
      type: "juridic",
    },
    ...over,
  };
}

function mockConfigApis() {
  vi.spyOn(parApi, "listDepartments").mockResolvedValue({ items: [] });
  vi.spyOn(parApi, "listProjects").mockResolvedValue({ items: [] as never });
  vi.spyOn(parApi, "listEvents").mockResolvedValue({ events: [] as never });
  vi.spyOn(parApi, "listBudgetCodes").mockResolvedValue({ items: [] });
  vi.spyOn(parApi, "listVendors").mockResolvedValue({ items: [] });
  vi.spyOn(parApi, "listParTemplates").mockResolvedValue({ templates: [] });
  vi.spyOn(parApi, "createPar").mockResolvedValue({ id: "par-1" } as ParRequest);
}

/** Deschide lista de sugestii scriind în „Descriere / Specificații". */
async function openSuggestions() {
  const desc = await screen.findByLabelText(/descriere \/ specificații/i);
  fireEvent.focus(desc);
  fireEvent.change(desc, { target: { value: "Test" } });
  return desc as HTMLInputElement;
}

describe("ParCreateForm — articole reluate dintr-o cerere anterioară", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockConfigApis();
  });

  it("[blocant] aceeași monedă → prețul, cantitatea și unitatea se completează", async () => {
    vi.spyOn(parApi, "getLineItemSuggestions").mockResolvedValue({ suggestions: [suggestion()], total: 1 });
    render(<ParCreateForm />);
    await openSuggestions();

    fireEvent.click(await screen.findByRole("option", { name: /Test/ }));

    await waitFor(() => {
      expect((screen.getByLabelText("Preț/u (MDL)") as HTMLInputElement).value).toBe("2000");
    });
    expect((screen.getByLabelText("Cant.") as HTMLInputElement).value).toBe("3");
    expect((screen.getByLabelText("UM") as HTMLInputElement).value).toBe("buc");
  });

  it("[blocant] monedă diferită → prețul convertit intră în câmp, cu sursa conversiei scrisă", async () => {
    // 2.000 MDL la 17,5 MDL/USD = 114,29 USD — calculate pe server, aici doar verificăm că
    // formularul chiar le folosește în loc să lase câmpul gol (bug-ul raportat).
    vi.spyOn(parApi, "getLineItemSuggestions").mockResolvedValue({
      suggestions: [suggestion({ targetUnitPriceCents: 114_29, targetCurrency: "USD" })],
      total: 1,
    });
    render(<ParCreateForm />);
    // Cererea e în USD.
    fireEvent.change(await screen.findByLabelText("Monedă"), { target: { value: "USD" } });
    await openSuggestions();

    fireEvent.click(await screen.findByRole("option", { name: /Test/ }));

    await waitFor(() => {
      expect((screen.getByLabelText("Preț/u (USD)") as HTMLInputElement).value).toBe("114.29");
    });
    expect(screen.getByText(/preț convertit din .*2\.000,00.*cursul BNM/i)).toBeInTheDocument();
  });

  it("monedă diferită și fără curs BNM → câmp gol, dar se spune de ce", async () => {
    vi.spyOn(parApi, "getLineItemSuggestions").mockResolvedValue({
      suggestions: [suggestion({ targetUnitPriceCents: null, targetCurrency: "USD" })],
      total: 1,
    });
    render(<ParCreateForm />);
    fireEvent.change(await screen.findByLabelText("Monedă"), { target: { value: "USD" } });
    await openSuggestions();

    fireEvent.click(await screen.findByRole("option", { name: /Test/ }));

    await waitFor(() => {
      expect(screen.getByText(/cursul BNM nu e disponibil/i)).toBeInTheDocument();
    });
    expect((screen.getByLabelText("Preț/u (USD)") as HTMLInputElement).value).toBe("");
  });

  it("sugestiile se cer în moneda cererii curente — altfel serverul n-are ce converti", async () => {
    const spy = vi.spyOn(parApi, "getLineItemSuggestions").mockResolvedValue({ suggestions: [], total: 0 });
    render(<ParCreateForm />);
    fireEvent.change(await screen.findByLabelText("Monedă"), { target: { value: "EUR" } });
    await openSuggestions();

    await waitFor(() => {
      expect(spy).toHaveBeenCalledWith("Test", "EUR");
    });
  });
});
