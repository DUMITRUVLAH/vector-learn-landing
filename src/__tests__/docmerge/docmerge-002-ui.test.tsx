/**
 * DOCMERGE-002: UI smoke tests for DocMergeJobPage
 * T-DOCMERGE-002-6: renders without crash (blocant)
 * T-DOCMERGE-002-7: shows stepper with step 1 active (normal)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { DocMergeJobPage } from "../../pages/business/docmerge/DocMergeJobPage";

// ─── Mocks ───────────────────────────────────────────────────────────────────

vi.mock("@/hooks/useBusinessSession", () => ({
  useBusinessSession: () => ({
    status: "authenticated",
    data: { user: { name: "Test Admin" }, tenant: { name: "Test Tenant" } },
    logout: vi.fn(),
  }),
}));

vi.mock("@/router/HashRouter", () => ({
  useRouter: () => ({ path: "/business/docmerge/job", navigate: vi.fn() }),
  Link: ({ children, to, ...props }: { children: React.ReactNode; to: string; [key: string]: unknown }) =>
    <a href={`#${to}`} {...props}>{children}</a>,
}));

vi.mock("@/lib/api/docmerge", () => ({
  listTemplates: vi.fn().mockResolvedValue([
    { id: "t1", name: "Contract standard", placeholders: ["nume", "suma", "data"], sourceFormat: "html", updatedAt: "" },
  ]),
  parseExcel: vi.fn(),
  autoMapColumns: vi.fn(),
}));

vi.mock("@/components/app/NotificationBell", () => ({
  NotificationBell: () => null,
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("DocMergeJobPage", () => {
  it("T-DOCMERGE-002-6 [blocant]: renders without crash", () => {
    expect(() => render(<DocMergeJobPage />)).not.toThrow();
  });

  it("T-DOCMERGE-002-7 [normal]: shows step 1 (upload) and stepper", () => {
    render(<DocMergeJobPage />);
    // Step indicator
    expect(screen.getByText(/1\. Încarcă Excel/i)).toBeTruthy();
    // Template selector label
    expect(screen.getByText(/Template de utilizat/i)).toBeTruthy();
    // File upload dropzone
    expect(screen.getAllByText(/Fișier Excel/i).length).toBeGreaterThan(0);
    // Continuă button
    expect(screen.getByRole("button", { name: /Continuă/i })).toBeTruthy();
  });
});
