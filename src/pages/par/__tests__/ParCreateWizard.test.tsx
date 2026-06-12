/**
 * PAR-105: Wizard UI /app/par/new
 * Tests: T-PAR-105-1, T-PAR-105-2, T-PAR-105-3, T-PAR-105-4
 *
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ParCreateWizard } from "../ParCreateWizard";
import * as parApi from "@/lib/api/par";

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("@/hooks/useSession", () => ({
  useSession: () => ({
    data: {
      user: { id: "user-1", email: "andreea@example.com", name: "Andreea Mitran", role: "manager" },
      tenant: { id: "tenant-1", name: "ATIC", slug: "atic", plan: "pro" },
    },
    status: "authenticated",
  }),
}));

vi.mock("@/router/HashRouter", () => ({
  useRouter: () => ({
    path: "/app/par/new",
    navigate: vi.fn(),
  }),
}));

vi.mock("@/components/app/AppShell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="app-shell">{children}</div>
  ),
}));

vi.mock("@/lib/api/par", async (importOriginal) => {
  const actual = await importOriginal<typeof parApi>();
  return {
    ...actual,
    createPar: vi.fn().mockResolvedValue({
      id: "par-uuid-123",
      requestNo: "PAR-2026-0001",
      status: "draft",
      totalEstimatedCents: 0,
      purpose: "execute_payment",
      chargeTo: "program",
      tenantId: "tenant-1",
      requestedByUserId: "user-1",
      attachmentsPresent: false,
      currency: "MDL",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      dateOfRequest: new Date().toISOString(),
      requestorTitle: null, departmentId: null, dateNeeded: null,
      projectId: null, budgetCodeId: null, budgetCodeNote: null,
      chargeBillingCode: null, endUse: null, vendorId: null,
      payeeName: null, payeeIdnp: null, payeeIban: null, payeeBank: null,
      attachmentsNote: null, submittedAt: null, approvedAt: null, paidAt: null, cancelledAt: null,
    }),
    updatePar: vi.fn().mockResolvedValue({ id: "par-uuid-123", status: "draft", totalEstimatedCents: 0, currency: "MDL" }),
    listDepartments: vi.fn().mockResolvedValue({ items: [{ id: "d1", name: "ATIC", active: true }] }),
    listProjects: vi.fn().mockResolvedValue({ items: [{ id: "p1", name: "Digital Safeguard", donor: null, active: true }] }),
    listBudgetCodes: vi.fn().mockResolvedValue({ items: [{ id: "bc1", code: "B001", name: "Operations", active: true }] }),
    listVendors: vi.fn().mockResolvedValue({ items: [] }),
    addLineItem: vi.fn(),
    uploadAttachment: vi.fn(),
    listAttachments: vi.fn().mockResolvedValue({ items: [] }),
  };
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("PAR-105: ParCreateWizard (T-PAR-105-1)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("T-PAR-105-1 [blocant] renders without crash", () => {
    const { container } = render(<ParCreateWizard />);
    expect(container).toBeTruthy();
  });

  it("T-PAR-105-1 [blocant] shows the wizard heading", () => {
    render(<ParCreateWizard />);
    expect(screen.getByText("Cerere nouă de plată (PAR)")).toBeInTheDocument();
  });

  it("T-PAR-105-1 [blocant] shows step 1 Antet by default", () => {
    render(<ParCreateWizard />);
    expect(screen.getByText(/Secțiunile 1–7: Antet/)).toBeInTheDocument();
  });

  it("T-PAR-105-1 [blocant] step indicator is present and accessible", () => {
    render(<ParCreateWizard />);
    const nav = screen.getByRole("navigation", { name: "Pași wizard" });
    expect(nav).toBeInTheDocument();
  });

  it("T-PAR-105-1 [blocant] all step labels are present in the indicator", () => {
    render(<ParCreateWizard />);
    // Steps are numbered buttons, check they exist
    expect(screen.getByRole("button", { name: /Pasul 1/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Pasul 2/ })).toBeInTheDocument();
  });

  it("T-PAR-105-1 [blocant] navigation buttons are rendered", () => {
    render(<ParCreateWizard />);
    expect(screen.getByRole("button", { name: /Înainte|Pasul următor/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Înapoi/ })).toBeInTheDocument();
  });
});

describe("PAR-105: Step 1 inputs (T-PAR-105-1)", () => {
  it("T-PAR-105-1 [blocant] date of request input has label", () => {
    render(<ParCreateWizard />);
    // getByLabelText normalizes text, so partial text or getByRole is more robust
    const input = document.getElementById("dateOfRequest");
    expect(input).toBeTruthy();
    // Verify the label points to this input
    const label = document.querySelector('label[for="dateOfRequest"]');
    expect(label).toBeTruthy();
  });

  it("T-PAR-105-1 [blocant] department selector has label", () => {
    render(<ParCreateWizard />);
    expect(screen.getByLabelText("Selectează departamentul")).toBeInTheDocument();
  });

  it("T-PAR-105-1 [blocant] project selector has label", () => {
    render(<ParCreateWizard />);
    expect(screen.getByLabelText("Selectează proiectul")).toBeInTheDocument();
  });

  it("T-PAR-105-1 [blocant] budget code selector has label", () => {
    render(<ParCreateWizard />);
    expect(screen.getByLabelText("Selectează codul bugetar")).toBeInTheDocument();
  });
});

describe("PAR-105: A11y compliance (T-PAR-105-3)", () => {
  it("T-PAR-105-3 [blocant] every visible input has an associated label", () => {
    render(<ParCreateWizard />);
    // Check that labeled form controls are accessible
    const inputs = document.querySelectorAll("input[id], select[id], textarea[id]");
    inputs.forEach((input) => {
      const id = input.getAttribute("id");
      if (id) {
        const label = document.querySelector(`label[for="${id}"]`);
        const ariaLabel = input.getAttribute("aria-label");
        const ariaLabelledBy = input.getAttribute("aria-labelledby");
        expect(
          label || ariaLabel || ariaLabelledBy,
          `Input #${id} must have a label`
        ).toBeTruthy();
      }
    });
  });

  it("T-PAR-105-3 [blocant] icon-only buttons have aria-label", () => {
    render(<ParCreateWizard />);
    const buttons = document.querySelectorAll("button");
    buttons.forEach((btn) => {
      const text = btn.textContent?.trim();
      // If the button is a step indicator with only icon content, it must have aria-label
      const ariaLabel = btn.getAttribute("aria-label");
      const hasVisibleText = text && text.length > 0 && !/^\d+$/.test(text);
      if (!hasVisibleText) {
        // Allow step numbers (just digits) or buttons with aria-label
        expect(
          ariaLabel || /^\d+$/.test(text ?? ""),
          `Button "${text}" should have aria-label or visible text`
        ).toBeTruthy();
      }
    });
  });

  it("T-PAR-105-3 [blocant] touch targets are at least 44px (from CSS class)", () => {
    render(<ParCreateWizard />);
    // Check that navigation buttons have min-h-[44px] class applied
    const nextButton = screen.getByRole("button", { name: /Înainte|Pasul următor/i });
    expect(nextButton.className).toContain("min-h-[44px]");
  });

  it("T-PAR-105-3 [blocant] no hardcoded hex colors in component source", async () => {
    const { readFileSync } = await import("fs");
    const { resolve } = await import("path");
    const content = readFileSync(
      resolve(process.cwd(), "src/pages/par/ParCreateWizard.tsx"),
      "utf-8"
    );
    // Match any inline style or className with hex colors (6-char hex)
    const hexColorInStyle = /#[0-9A-Fa-f]{6}/g;
    const matches = content.match(hexColorInStyle);
    // Filter to only matches in className/style props (not in comments)
    const inCode = (content.match(/className="[^"]*#[0-9A-Fa-f]{6}[^"]*"/g) ?? []).concat(
      content.match(/style=\{[^}]*#[0-9A-Fa-f]{6}[^}]*\}/g) ?? []
    );
    expect(inCode.length).toBe(0);
  });
});

describe("PAR-105: Dark mode tokens (T-PAR-105-4)", () => {
  it("T-PAR-105-4 [normal] uses dark: prefixed classes for color variants", async () => {
    const { readFileSync } = await import("fs");
    const { resolve } = await import("path");
    const content = readFileSync(
      resolve(process.cwd(), "src/pages/par/ParCreateWizard.tsx"),
      "utf-8"
    );
    // Should have dark: classes for the visual feedback elements
    expect(content).toContain("dark:");
  });

  it("T-PAR-105-4 [normal] uses semantic tokens (bg-primary, text-foreground, etc.)", async () => {
    const { readFileSync } = await import("fs");
    const { resolve } = await import("path");
    const content = readFileSync(
      resolve(process.cwd(), "src/pages/par/ParCreateWizard.tsx"),
      "utf-8"
    );
    expect(content).toContain("bg-primary");
    expect(content).toContain("text-foreground");
    expect(content).toContain("text-muted-foreground");
    expect(content).toContain("border-input");
  });
});
