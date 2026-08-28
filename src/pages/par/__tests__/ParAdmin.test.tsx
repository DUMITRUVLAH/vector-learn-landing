/**
 * PAR-116: Tests for ParAdmin component
 *
 * T-PAR-116-1 [blocant] Given par_admin, When /app/par/admin, Then renders without crash; tabs visible
 * T-PAR-116-2 [blocant] Given non-admin, Then 403 guard shown
 * T-PAR-116-3 [normal]  Given DOA tab, Then form renders, submit calls createParDoaRow
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ParAdmin } from "../ParAdmin";

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("@/router/HashRouter", () => ({
  useRouter: () => ({ path: "/app/par/admin", navigate: vi.fn() }),
}));

vi.mock("@/components/app/AppShell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div data-testid="app-shell">{children}</div>,
}));

vi.mock("@/lib/api/par", () => ({
  listParDoaMatrix: vi.fn().mockResolvedValue({ rows: [] }),
  createParDoaRow: vi.fn().mockResolvedValue({ id: "row-1", step: 1, approverRoleLabel: "Test" }),
  updateParDoaRow: vi.fn().mockResolvedValue({}),
  deleteParDoaRow: vi.fn().mockResolvedValue({ ok: true }),
  getParSettings: vi.fn().mockResolvedValue({
    microPurchaseThresholdCents: 1000000,
    defaultCurrency: "MDL",
    orgLegalName: null,
    orgLogoUrl: null,
    pdfHelpUrl: null,
    requestNoPrefix: "PAR",
  }),
  updateParSettings: vi.fn().mockResolvedValue({}),
  listPayers: vi.fn().mockResolvedValue({ items: [] }),
  listParMembers: vi.fn().mockResolvedValue({ members: [] }),
  assignParMember: vi.fn().mockResolvedValue({}),
  revokeParMember: vi.fn().mockResolvedValue({ ok: true }),
  listDepartments: vi.fn().mockResolvedValue({ items: [] }),
  listProjects: vi.fn().mockResolvedValue({ items: [] }),
  listBudgetCodes: vi.fn().mockResolvedValue({ items: [] }),
  listVendors: vi.fn().mockResolvedValue({ items: [] }),
  createDepartment: vi.fn().mockResolvedValue({}),
  updateDepartment: vi.fn().mockResolvedValue({}),
  deleteDepartment: vi.fn().mockResolvedValue({ ok: true }),
  createProject: vi.fn().mockResolvedValue({}),
  updateProject: vi.fn().mockResolvedValue({}),
  deleteProject: vi.fn().mockResolvedValue({ ok: true }),
  createBudgetCode: vi.fn().mockResolvedValue({}),
  updateBudgetCode: vi.fn().mockResolvedValue({}),
  deleteBudgetCode: vi.fn().mockResolvedValue({ ok: true }),
  createVendor: vi.fn().mockResolvedValue({}),
  updateVendor: vi.fn().mockResolvedValue({}),
  deleteVendor: vi.fn().mockResolvedValue({ ok: true }),
  formatMDL: (cents: number) => `${(cents / 100).toLocaleString()} MDL`,
  listEvents: vi.fn().mockResolvedValue({ events: [] }),
  getBudgetCodesUsage: vi.fn().mockResolvedValue({ usage: [] }),
  createPayer: vi.fn().mockResolvedValue({}),
  updatePayer: vi.fn().mockResolvedValue({}),
  deletePayer: vi.fn().mockResolvedValue({ ok: true }),
  createEvent: vi.fn().mockResolvedValue({}),
  updateEvent: vi.fn().mockResolvedValue({}),
  deleteEvent: vi.fn().mockResolvedValue({ ok: true }),
  setProjectApprovers: vi.fn().mockResolvedValue({}),
  searchRegistryCompanies: vi.fn().mockResolvedValue({ items: [] }),
  downloadParConfigTemplate: vi.fn(),
  previewParConfigExcel: vi.fn(),
  importParConfigExcel: vi.fn(),
}));

import { previewParConfigExcel, importParConfigExcel } from "@/lib/api/par";

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("ParAdmin — PAR-116", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // T-PAR-116-1 [blocant] Given par_admin, When /app/par/admin, Then renders without crash
  it("renders admin panel tabs for par_admin", async () => {
    render(<ParAdmin isAdmin={true} />);

    // Shell renders
    expect(screen.getByTestId("app-shell")).toBeDefined();

    // Four tab buttons should be visible
    await waitFor(() => {
      expect(screen.getByText("Aprobare")).toBeDefined();
      expect(screen.getByText("Setări")).toBeDefined();
      expect(screen.getByText("Membri")).toBeDefined();
      expect(screen.getByText("Date de referință")).toBeDefined();
    });
  });

  // T-PAR-116-2 [blocant] Given non-admin, Then 403 guard shown
  it("shows 403 for non-admin", () => {
    render(<ParAdmin isAdmin={false} />);

    expect(screen.getByText("Acces restricționat")).toBeDefined();
    expect(screen.getByText(/doar administratorilor PAR/i)).toBeDefined();
  });

  // T-PAR-116-1 continued — Approval tab: "Adaugă regulă" opens the simplified rule builder
  it("Approval tab: Add opens the simplified rule builder (scope + approvers)", async () => {
    const { listParDoaMatrix } = await import("@/lib/api/par");
    (listParDoaMatrix as ReturnType<typeof vi.fn>).mockResolvedValue({ rows: [] });

    render(<ParAdmin isAdmin={true} />);

    await waitFor(() => {
      expect(screen.getByText("Aprobare")).toBeDefined();
    });

    const doaTab = screen.getByRole("tab", { name: /Aprobare/i });
    fireEvent.click(doaTab);

    // Empty state + the new "Adaugă regulă" button (not per-approver rows).
    const addBtn = await screen.findByLabelText("Adaugă regulă de aprobare");
    fireEvent.click(addBtn);

    // Simplified builder: scope (org/project) + an "add approver" picker, no raw step/mode fields.
    await waitFor(() => {
      expect(screen.getByLabelText("Plătitor regulă de aprobare")).toBeDefined();
      expect(screen.getByLabelText("Adaugă aprobator")).toBeDefined();
    });
    expect(screen.queryByLabelText("Pasul de aprobare")).toBeNull();
  });

  // T-PAR-116-3 [normal] Settings tab — modify threshold, save calls updateParSettings
  it("Settings tab shows threshold field and saves", async () => {
    const { updateParSettings } = await import("@/lib/api/par");

    render(<ParAdmin isAdmin={true} />);

    // Switch to Settings tab
    await waitFor(() => {
      expect(screen.getByText("Setări")).toBeDefined();
    });

    const settingsTab = screen.getByRole("tab", { name: /Setări/i });
    fireEvent.click(settingsTab);

    // Settings form should render
    await waitFor(() => {
      expect(screen.getByLabelText("Prag micro-achiziție MDL")).toBeDefined();
    });

    // Change threshold and save
    const thresholdInput = screen.getByLabelText("Prag micro-achiziție MDL");
    await userEvent.clear(thresholdInput);
    await userEvent.type(thresholdInput, "5000");

    const saveBtn = screen.getByText("Salvează setări");
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(updateParSettings).toHaveBeenCalledWith(
        expect.objectContaining({ microPurchaseThresholdCents: 500000 })
      );
    });
  });

  // T-PAR-116-2 continued — Accessibility: 403 page has role="alert"
  it("non-admin 403 has alert role for a11y", () => {
    render(<ParAdmin isAdmin={false} />);
    expect(screen.getByRole("alert")).toBeDefined();
  });
});

// ─── Excel import: preview → mapping dialog → import (VM1-02b) ────────────────

describe("ParAdmin — import Excel cu mapare de coloane", () => {
  const preview = {
    sheets: [
      {
        name: "Sheet1",
        headers: ["Cod", "Denumire"],
        totalRows: 2,
        sampleRows: [["1.1 Director", "1.1 Director"]],
        detectedKind: "budgetCodes" as const,
        suggestedKind: "budgetCodes" as const,
        suggestedMapping: { code: "Cod", name: "Denumire", allocated: null, project: null, payer: null },
      },
    ],
    fields: {
      payers: [{ key: "name", label: "Denumire plătitor", required: true }],
      projects: [{ key: "name", label: "Denumire proiect", required: true }],
      departments: [{ key: "name", label: "Denumire departament", required: true }],
      budgetCodes: [
        { key: "code", label: "Cod", required: true },
        { key: "name", label: "Denumire", required: false },
        { key: "allocated", label: "Sumă alocată (MDL)", required: false },
        { key: "project", label: "Proiect / Program", required: false },
        { key: "payer", label: "Plătitor / Organizație", required: false },
      ],
      vendors: [
        { key: "name", label: "Denumire beneficiar", required: true },
        { key: "iban", label: "IBAN", required: false },
      ],
      events: [
        { key: "name", label: "Denumire eveniment", required: true },
        { key: "project", label: "Proiect", required: false },
      ],
    },
    kindLabels: {
      payers: "Organizații plătitoare",
      projects: "Proiecte / Programe",
      events: "Evenimente",
      departments: "Departamente",
      budgetCodes: "Coduri bugetare",
      vendors: "Beneficiari / Furnizori",
    },
  };

  const xlsx = () =>
    new File(["x"], "LED.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(previewParConfigExcel).mockResolvedValue(preview);
    vi.mocked(importParConfigExcel).mockResolvedValue({
      payers: { created: 0, updated: 0, errors: [] },
      projects: { created: 0, updated: 0, errors: [] },
      departments: { created: 0, updated: 0, errors: [] },
      budgetCodes: { created: 2, updated: 0, errors: [] },
      warnings: ["Foaia „Sheet1\" a fost importată ca „Coduri bugetare\" (2 rânduri)."],
    });
  });

  // [blocant] Choosing a file must NOT import straight away — it opens the mapping dialog.
  it("deschide dialogul de mapare în loc să importe direct", async () => {
    render(<ParAdmin isAdmin={true} />);
    await screen.findByText("Date de referință");
    fireEvent.click(screen.getByText("Date de referință"));

    await userEvent.upload(await screen.findByLabelText("Alege fișier Excel"), xlsx());

    await screen.findByRole("dialog", { name: "Ce importăm din fișier?" });
    expect(previewParConfigExcel).toHaveBeenCalledTimes(1);
    expect(importParConfigExcel).not.toHaveBeenCalled();
  });

  // [blocant] The mapping the user confirmed is what reaches the API.
  it("trimite fișierul împreună cu maparea confirmată", async () => {
    render(<ParAdmin isAdmin={true} />);
    fireEvent.click(await screen.findByText("Date de referință"));
    await userEvent.upload(await screen.findByLabelText("Alege fișier Excel"), xlsx());
    await screen.findByRole("dialog", { name: "Ce importăm din fișier?" });

    fireEvent.click(screen.getByRole("button", { name: "Importă" }));

    await waitFor(() => expect(importParConfigExcel).toHaveBeenCalledTimes(1));
    const [file, mapping] = vi.mocked(importParConfigExcel).mock.calls[0];
    expect((file as File).name).toBe("LED.xlsx");
    expect(mapping).toEqual({
      sheets: [{ name: "Sheet1", kind: "budgetCodes", columns: { code: "Cod", name: "Denumire", allocated: null, project: null, payer: null } }],
    });

    // Result + the "read as" note are shown after the import.
    expect(await screen.findByText(/Rezultat import/)).toBeInTheDocument();
    expect(screen.getByText(/a fost importată ca/)).toBeInTheDocument();
  });

  it("nu importă nimic dacă anulezi dialogul", async () => {
    render(<ParAdmin isAdmin={true} />);
    fireEvent.click(await screen.findByText("Date de referință"));
    await userEvent.upload(await screen.findByLabelText("Alege fișier Excel"), xlsx());
    await screen.findByRole("dialog", { name: "Ce importăm din fișier?" });

    fireEvent.click(screen.getByRole("button", { name: "Renunță" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(importParConfigExcel).not.toHaveBeenCalled();
  });
});
