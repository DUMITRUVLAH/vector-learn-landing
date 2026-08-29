/**
 * „Cod bugetar" pe formular — bug owner (2026-08-29): scriai în caseta de căutare și pe ecran
 * nu se schimba nimic, pentru că filtrul se aplica opțiunilor dintr-un `<select>` nativ închis.
 *
 * Testul verifică LEGĂTURA din formular (opțiunile potrivite, filtrate după plătitor și după
 * ce scrii), nu doar primitiva — vezi și src/components/ds/__tests__/Combobox.test.tsx.
 *
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { ParCreateForm } from "../ParCreateForm";
import * as parApi from "@/lib/api/par";

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

const CODES = [
  { id: "b-1", payerId: "pay-1", projectId: null, code: "1.1", name: "Director/Project Manager (50%)", active: true },
  { id: "b-2", payerId: "pay-1", projectId: null, code: "1.2", name: "Project Coordinator (100%)", active: true },
  { id: "b-3", payerId: "pay-1", projectId: null, code: "2.1", name: "Chirie birou", active: true },
  // Alt plătitor: nu are ce căuta în listă.
  { id: "b-9", payerId: "pay-2", projectId: null, code: "9.9", name: "Project altcineva", active: true },
];

function mockConfigApis() {
  vi.spyOn(parApi, "listDepartments").mockResolvedValue({ items: [] });
  vi.spyOn(parApi, "listProjects").mockResolvedValue({ items: [] as never });
  vi.spyOn(parApi, "listEvents").mockResolvedValue({ events: [] as never });
  vi.spyOn(parApi, "listBudgetCodes").mockResolvedValue({ items: CODES as never });
  vi.spyOn(parApi, "listVendors").mockResolvedValue({ items: [] });
  vi.spyOn(parApi, "listParTemplates").mockResolvedValue({ templates: [] });
  vi.spyOn(parApi, "getLineItemSuggestions").mockResolvedValue({ suggestions: [], total: 0 });
  // Un singur plătitor → formularul îl alege singur, deci codurile sunt deja filtrate.
  vi.spyOn(parApi, "listPayers").mockResolvedValue({
    items: [{ id: "pay-1", name: "ATIC", active: true }] as never,
  });
}

describe("ParCreateForm — alegerea codului bugetar", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockConfigApis();
  });

  it("[blocant] ce scrii filtrează lista pe care o VEZI", async () => {
    render(<ParCreateForm />);
    const bc = await screen.findByLabelText("Cod bugetar");
    await waitFor(() => expect(bc).not.toBeDisabled());

    fireEvent.focus(bc);
    // Lista proprie a comboboxului — restul paginii are `<select>`-uri native cu opțiunile lor.
    const list = () => within(document.getElementById("bc-list") as HTMLElement);
    await waitFor(() => expect(list().getAllByRole("option")).toHaveLength(3));
    expect(list().queryByRole("option", { name: /Project altcineva/ })).not.toBeInTheDocument();

    fireEvent.change(bc, { target: { value: "chirie" } });
    const shown = list().getAllByRole("option");
    expect(shown).toHaveLength(1);
    expect(shown[0]).toHaveTextContent("2.1");
  });

  it("codul ales rămâne scris în câmp după ce lista se închide", async () => {
    render(<ParCreateForm />);
    const bc = await screen.findByLabelText("Cod bugetar");
    await waitFor(() => expect(bc).not.toBeDisabled());
    fireEvent.focus(bc);
    fireEvent.click(await within(document.getElementById("bc-list") as HTMLElement).findByRole("option", { name: /Chirie birou/ }));

    await waitFor(() => expect((bc as HTMLInputElement).value).toBe("2.1"));
  });
});
