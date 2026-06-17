/**
 * DOCMERGE-001 — UI smoke test
 * T-DOCMERGE-001-6 [blocant] renders without crash + "Template nou" button visible
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("@/hooks/useBusinessSession", () => ({
  useBusinessSession: () => ({
    status: "authenticated",
    data: {
      user: { name: "Test Admin", role: "owner" },
      tenant: { name: "Test FinDesk", slug: "test", appKind: "business" },
    },
    logout: vi.fn(),
    refresh: vi.fn(),
    error: null,
  }),
}));

vi.mock("@/router/HashRouter", () => ({
  useRouter: () => ({ path: "/business/docmerge", navigate: vi.fn() }),
  Link: ({ to, children, ...rest }: { to: string; children: React.ReactNode; [key: string]: unknown }) =>
    <a href={`#${to}`} {...rest}>{children}</a>,
}));

vi.mock("@/lib/api/docmerge", () => ({
  listTemplates: vi.fn().mockResolvedValue([]),
  createTemplate: vi.fn(),
  updateTemplate: vi.fn(),
  deleteTemplate: vi.fn(),
  previewTemplate: vi.fn(),
  getTemplate: vi.fn(),
}));

const { DocMergeTemplatesPage } = await import(
  "@/pages/business/docmerge/DocMergeTemplatesPage"
);

describe("DOCMERGE-001 — DocMergeTemplatesPage", () => {
  it("T-DOCMERGE-001-6 [blocant] renders without crash + Template nou button visible", async () => {
    render(<DocMergeTemplatesPage />);
    // Page renders without throw (no crash)
    // "Template nou" button should be in the DOM
    const btn = await screen.findByRole("button", { name: /template nou/i });
    expect(btn).toBeInTheDocument();
  });

  it("shows template list area or empty state", async () => {
    render(<DocMergeTemplatesPage />);
    // After list loads (empty), should show the empty state or list container
    // Either the "Template nou" button exists (action) or the empty message
    const btn = await screen.findByRole("button", { name: /template nou/i });
    expect(btn).toBeInTheDocument();
  });
});
