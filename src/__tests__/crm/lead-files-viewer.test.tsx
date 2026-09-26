/**
 * CRM-U05 — „trebuie să văd toate fișierele direct pe website fără să descarc, așa cum e la PAR".
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const openInAppViewer = vi.fn().mockReturnValue(true);
vi.mock("@/lib/par/attachmentViewerBus", () => ({ openInAppViewer: (...a: unknown[]) => openInAppViewer(...a) }));
vi.mock("@/lib/api/crm", () => ({
  listCrmLeadFiles: vi.fn().mockResolvedValue({
    items: [
      {
        id: "f-1",
        leadId: "lead-1",
        fileName: "Contract semnat.pdf",
        mimeType: "application/pdf",
        sizeBytes: 120_000,
        previewUrl: "/api/crm/lead-files/f-1/preview",
        createdAt: "2026-09-26T10:00:00.000Z",
      },
    ],
  }),
  uploadCrmLeadFile: vi.fn(),
  deleteCrmLeadFile: vi.fn(),
}));

const { LeadFilesTab } = await import("@/components/crm/LeadFilesTab");

describe("CRM-U05 — fișierele leadului se văd în aplicație", () => {
  it("[blocant] click pe fișier îl deschide în vizualizator, nu într-o filă nouă", async () => {
    render(<LeadFilesTab leadId="lead-1" onToast={vi.fn()} />);
    const link = await screen.findByRole("link", { name: /Contract semnat\.pdf/ });
    const notPrevented = fireEvent.click(link);
    expect(openInAppViewer).toHaveBeenCalledWith("Contract semnat.pdf", "/api/crm/lead-files/f-1/preview", "f-1");
    // Navigarea spre filă nouă e oprită când vizualizatorul a preluat fișierul.
    expect(notPrevented).toBe(false);
  });
});
