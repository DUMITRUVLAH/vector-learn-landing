/**
 * CRM Faza 9 — meniul de vizualizări salvate.
 *
 * Ce verifică: salvarea trimite FILTRELE CURENTE (nu un obiect gol), bifa „Vizibilă echipei"
 * ajunge la server, iar aplicarea unei vizualizări întoarce filtrele apelantului. Fără astea,
 * „vizualizare salvată" ar fi doar un nume fără conținut.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { CrmSavedView } from "@/lib/api/crm";

beforeEach(() => {
  vi.clearAllMocks();
});

const listCrmSavedViews = vi.fn();
const createCrmSavedView = vi.fn();
const deleteCrmSavedView = vi.fn();

vi.mock("@/lib/api/crm", () => ({
  listCrmSavedViews: (...args: unknown[]) => listCrmSavedViews(...args),
  createCrmSavedView: (...args: unknown[]) => createCrmSavedView(...args),
  deleteCrmSavedView: (...args: unknown[]) => deleteCrmSavedView(...args),
}));

const { SavedViewsMenu } = await import("@/components/crm/SavedViewsMenu");

function makeView(overrides: Partial<CrmSavedView>): CrmSavedView {
  return {
    id: "view-1",
    name: "B2B restante",
    filters: { search: "restant", view: "list", pipelineId: "pipe-b2b" },
    createdByUserId: "user-1",
    isShared: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

const CURRENT = { search: "maria", source: "referral", onlyMine: true, pipelineId: "pipe-1", view: "kanban" as const };

describe("Meniul de vizualizări", () => {
  it("[blocant] salvarea trimite filtrele CURENTE, nu un obiect gol", async () => {
    listCrmSavedViews.mockResolvedValue({ items: [] });
    createCrmSavedView.mockResolvedValue(makeView({ name: "Ale mele" }));

    render(<SavedViewsMenu currentFilters={CURRENT} onApply={vi.fn()} onToast={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Vizualizări" }));

    fireEvent.change(await screen.findByLabelText("Salvează filtrarea curentă"), {
      target: { value: "Ale mele" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Salvează vizualizarea" }));

    await waitFor(() =>
      expect(createCrmSavedView).toHaveBeenCalledWith({ name: "Ale mele", filters: CURRENT, isShared: false })
    );
  });

  it("[blocant] bifa „Vizibilă echipei” ajunge la server — implicit e personală", async () => {
    listCrmSavedViews.mockResolvedValue({ items: [] });
    createCrmSavedView.mockResolvedValue(makeView({ isShared: true }));

    render(<SavedViewsMenu currentFilters={CURRENT} onApply={vi.fn()} onToast={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Vizualizări" }));

    fireEvent.change(await screen.findByLabelText("Salvează filtrarea curentă"), { target: { value: "A echipei" } });
    fireEvent.click(screen.getByLabelText("Vizibilă echipei", { selector: "input" }));
    fireEvent.click(screen.getByRole("button", { name: "Salvează vizualizarea" }));

    await waitFor(() => expect(createCrmSavedView).toHaveBeenCalledWith(expect.objectContaining({ isShared: true })));
  });

  it("[blocant] click pe o vizualizare întoarce filtrele ei apelantului", async () => {
    const onApply = vi.fn();
    listCrmSavedViews.mockResolvedValue({ items: [makeView({})] });

    render(<SavedViewsMenu currentFilters={CURRENT} onApply={onApply} onToast={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Vizualizări" }));

    fireEvent.click(await screen.findByText("B2B restante"));

    expect(onApply).toHaveBeenCalledWith({ search: "restant", view: "list", pipelineId: "pipe-b2b" });
  });

  it("[normal] cele ale echipei sunt marcate ca atare", async () => {
    listCrmSavedViews.mockResolvedValue({ items: [makeView({ isShared: true })] });

    render(<SavedViewsMenu currentFilters={CURRENT} onApply={vi.fn()} onToast={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Vizualizări" }));

    expect(await screen.findByText("echipă")).toBeInTheDocument();
  });
});
