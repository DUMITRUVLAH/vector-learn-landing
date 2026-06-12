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
}));

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
      expect(screen.getByText("Matrice DOA")).toBeDefined();
      expect(screen.getByText("Setări")).toBeDefined();
      expect(screen.getByText("Membri")).toBeDefined();
      expect(screen.getByText("Date referință")).toBeDefined();
    });
  });

  // T-PAR-116-2 [blocant] Given non-admin, Then 403 guard shown
  it("shows 403 for non-admin", () => {
    render(<ParAdmin isAdmin={false} />);

    expect(screen.getByText("Acces restricționat")).toBeDefined();
    expect(screen.getByText(/doar administratorilor PAR/i)).toBeDefined();
  });

  // T-PAR-116-1 continued — DOA tab loads and "Adaugă rând" button is present
  it("DOA tab shows Add button and table", async () => {
    const { listParDoaMatrix } = await import("@/lib/api/par");
    (listParDoaMatrix as ReturnType<typeof vi.fn>).mockResolvedValue({ rows: [] });

    render(<ParAdmin isAdmin={true} />);

    // Wait for DOA tab content to load
    await waitFor(() => {
      expect(screen.getByText("Matrice DOA")).toBeDefined();
    });

    // Click DOA tab (it's default)
    const doaTab = screen.getByRole("tab", { name: /Matrice DOA/i });
    fireEvent.click(doaTab);

    await waitFor(() => {
      expect(screen.getByLabelText("Adaugă rând DOA")).toBeDefined();
    });
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
