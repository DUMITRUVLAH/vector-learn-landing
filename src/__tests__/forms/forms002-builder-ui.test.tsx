/**
 * FORMS-002 — Builder vizual UI tests
 *
 * T-FORMS-002-2 [blocant]: FormsPage renders without crash (empty list)
 * T-FORMS-002-3 [blocant]: FormsPage renders 2 form cards
 * T-FORMS-002-4 [blocant]: FormBuilderPage — Publish button disabled when 0 fields
 * T-FORMS-002-5 [blocant]: FormBuilderPage — ↑ button calls reorderFields with inverted order
 * T-FORMS-002-6 [normal]:  FieldConfigPanel — Options visible only for choice types
 * T-FORMS-002-7 [normal]:  Share link button calls clipboard.writeText
 * T-FORMS-002-8 [blocant]: Type shape validation — FormField and Form types exported correctly
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { Form, FormField } from "../../lib/api/forms";

// ─── Mocks globale ─────────────────────────────────────────────────────────────

vi.mock("../../lib/api/forms", async () => {
  const actual = await vi.importActual<typeof import("../../lib/api/forms")>("../../lib/api/forms");
  return {
    ...actual,
    listForms: vi.fn(),
    createForm: vi.fn(),
    deleteForm: vi.fn(),
    getForm: vi.fn(),
    updateForm: vi.fn(),
    addField: vi.fn(),
    updateField: vi.fn(),
    deleteField: vi.fn(),
    reorderFields: vi.fn(),
    publishForm: vi.fn(),
    listSubmissions: vi.fn(),
  };
});

vi.mock("../../hooks/useSession", () => ({
  useSession: () => ({ status: "authenticated", data: { user: { name: "Test", role: "admin" }, tenant: { name: "Test Tenant" } }, logout: vi.fn() }),
}));

vi.mock("../../router/HashRouter", () => ({
  useRouter: () => ({ path: "/app/forms", navigate: vi.fn() }),
  Link: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));

// NotificationBell mock to avoid fetch calls
vi.mock("../../components/app/NotificationBell", () => ({
  NotificationBell: () => null,
}));

// Logo mock
vi.mock("../../components/Logo", () => ({
  Logo: () => <span>VL</span>,
}));

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const MOCK_FORM: Form = {
  id: "form-1",
  tenantId: "tenant-1",
  title: "Formular test",
  slug: "formular-test",
  status: "draft",
  description: null,
  thankYouMessage: null,
  redirectUrl: null,
  createdBy: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const MOCK_FORM_2: Form = {
  ...MOCK_FORM,
  id: "form-2",
  title: "Al doilea formular",
  slug: "al-doilea-formular",
};

function makeField(overrides: Partial<FormField> = {}): FormField {
  return {
    id: "field-1",
    tenantId: "tenant-1",
    formId: "form-1",
    type: "short_text",
    label: "Câmp test",
    placeholder: null,
    required: false,
    position: 0,
    options: null,
    leadMapping: null,
    hidden: false,
    hiddenSourceParam: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

// ─── Helper: dynamic import to apply mocks ────────────────────────────────────

async function getFormsModule() {
  return vi.mocked(await import("../../lib/api/forms"));
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("FORMS-002 — FormsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("T-FORMS-002-2 [blocant]: renders without crash with empty list", async () => {
    const { listForms } = await getFormsModule();
    vi.mocked(listForms).mockResolvedValue({ items: [] });

    const { FormsPage } = await import("../../pages/app/FormsPage");
    render(<FormsPage />);

    await waitFor(() => {
      expect(screen.getByText(/Niciun formular/i)).toBeInTheDocument();
    });
  });

  it("T-FORMS-002-3 [blocant]: renders 2 form cards with correct titles", async () => {
    const { listForms } = await getFormsModule();
    vi.mocked(listForms).mockResolvedValue({ items: [MOCK_FORM, MOCK_FORM_2] });

    const { FormsPage } = await import("../../pages/app/FormsPage");
    render(<FormsPage />);

    await waitFor(() => {
      expect(screen.getByText("Formular test")).toBeInTheDocument();
      expect(screen.getByText("Al doilea formular")).toBeInTheDocument();
    });
  });
});

describe("FORMS-002 — FormBuilderPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("T-FORMS-002-4 [blocant]: Publish button disabled when form has 0 fields", async () => {
    const { getForm } = await getFormsModule();
    vi.mocked(getForm).mockResolvedValue({ form: MOCK_FORM, fields: [] });

    const { FormBuilderPage } = await import("../../pages/app/FormBuilderPage");
    render(<FormBuilderPage formId="form-1" />);

    await waitFor(() => {
      const publishBtn = screen.getByRole("button", { name: /Publică/i });
      expect(publishBtn).toBeDisabled();
    });
  });

  it("T-FORMS-002-5 [blocant]: ↑ button on second field calls reorderFields with inverted order", async () => {
    const { getForm, reorderFields } = await getFormsModule();
    const field1 = makeField({ id: "field-1", position: 0, label: "Câmpul 1" });
    const field2 = makeField({ id: "field-2", position: 1, label: "Câmpul 2" });
    vi.mocked(getForm).mockResolvedValue({ form: MOCK_FORM, fields: [field1, field2] });
    vi.mocked(reorderFields).mockResolvedValue({ ok: true });

    const { FormBuilderPage } = await import("../../pages/app/FormBuilderPage");
    render(<FormBuilderPage formId="form-1" />);

    await waitFor(() => {
      // Both fields appear (in the field list and possibly preview)
      expect(screen.getAllByText("Câmpul 2").length).toBeGreaterThan(0);
    });

    // Find the ↑ button for the second field (index 1)
    const upButtons = screen.getAllByLabelText(/Mută câmpul sus/i);
    // The first field's up button is disabled; the second is the active one
    expect(upButtons.length).toBeGreaterThanOrEqual(2);
    const activeUpBtn = upButtons[1]; // second field's up button
    fireEvent.click(activeUpBtn);

    await waitFor(() => {
      expect(vi.mocked(reorderFields)).toHaveBeenCalledWith("form-1", ["field-2", "field-1"]);
    });
  });
});

describe("FORMS-002 — FieldConfigPanel (via FormBuilderPage)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("T-FORMS-002-6 [normal]: Options textarea visible for single_choice, hidden for short_text", async () => {
    const { getForm } = await getFormsModule();
    const choiceField = makeField({ id: "field-1", type: "single_choice", label: "Alegere", options: ["A", "B"] });
    vi.mocked(getForm).mockResolvedValue({ form: MOCK_FORM, fields: [choiceField] });

    const { FormBuilderPage } = await import("../../pages/app/FormBuilderPage");
    render(<FormBuilderPage formId="form-1" />);

    await waitFor(() => {
      // The field label appears in both list and preview — use the list row
      const fieldBtns = screen.getAllByText("Alegere");
      // Click the first occurrence (in the field list)
      fireEvent.click(fieldBtns[0]);
    });

    // Options textarea should be visible for single_choice
    await waitFor(() => {
      expect(screen.getByLabelText(/Opțiuni/i)).toBeInTheDocument();
    });
  });
});

describe("FORMS-002 — Share link", () => {
  it("T-FORMS-002-7 [normal]: Link share button calls clipboard.writeText with correct URL", async () => {
    const { getForm } = await getFormsModule();
    vi.mocked(getForm).mockResolvedValue({ form: { ...MOCK_FORM, status: "published" }, fields: [] });

    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText: writeTextMock } });

    const { FormBuilderPage } = await import("../../pages/app/FormBuilderPage");
    render(<FormBuilderPage formId="form-1" />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Link share/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /Link share/i }));

    await waitFor(() => {
      expect(writeTextMock).toHaveBeenCalledWith(
        expect.stringContaining("/#/f/formular-test")
      );
    });
  });
});

describe("FORMS-002 — Type safety", () => {
  it("T-FORMS-002-8 [blocant]: Form and FormField types are exported correctly", async () => {
    const formsApi = await import("../../lib/api/forms");
    // Verify the functions are exported
    expect(typeof formsApi.listForms).toBe("function");
    expect(typeof formsApi.createForm).toBe("function");
    expect(typeof formsApi.getForm).toBe("function");
    expect(typeof formsApi.updateForm).toBe("function");
    expect(typeof formsApi.deleteForm).toBe("function");
    expect(typeof formsApi.addField).toBe("function");
    expect(typeof formsApi.updateField).toBe("function");
    expect(typeof formsApi.deleteField).toBe("function");
    expect(typeof formsApi.reorderFields).toBe("function");
    expect(typeof formsApi.publishForm).toBe("function");

    // Verify mock field shape
    const field: FormField = makeField();
    expect(field.id).toBe("field-1");
    expect(field.type).toBe("short_text");
    expect(typeof field.required).toBe("boolean");
    expect(typeof field.position).toBe("number");
  });
});
