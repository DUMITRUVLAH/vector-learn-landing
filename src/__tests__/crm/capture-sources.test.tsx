/**
 * CRM — formularele de captare de pe site (cerința 68).
 *
 * Ce trebuie să fie adevărat: ecranul dă tokenul ȘI codul gata de lipit. Fără al doilea, „ai un
 * token" e o sarcină pentru programatorul clientului, nu o funcție livrată.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { CrmCaptureSource } from "@/lib/api/crm";

beforeEach(() => {
  vi.clearAllMocks();
});

const listCrmCaptureSources = vi.fn();
const createCrmCaptureSource = vi.fn();
const updateCrmCaptureSource = vi.fn();
const deleteCrmCaptureSource = vi.fn();

vi.mock("@/lib/api/crm", () => ({
  listCrmCaptureSources: (...a: unknown[]) => listCrmCaptureSources(...a),
  createCrmCaptureSource: (...a: unknown[]) => createCrmCaptureSource(...a),
  updateCrmCaptureSource: (...a: unknown[]) => updateCrmCaptureSource(...a),
  deleteCrmCaptureSource: (...a: unknown[]) => deleteCrmCaptureSource(...a),
}));

const { CaptureSourcesPanel } = await import("@/components/crm/CaptureSourcesPanel");

function makeSource(overrides: Partial<CrmCaptureSource> = {}): CrmCaptureSource {
  return {
    id: "src-1",
    name: "Cerere ofertă — Contact",
    token: "tok_abc123456789",
    defaultSource: "webform",
    pipelineId: null,
    allowedOrigins: ["https://ecosolar.md"],
    active: true,
    leadsCaptured: 12,
    lastCaptureAt: "2026-09-10T10:00:00.000Z",
    createdAt: "2026-09-01T10:00:00.000Z",
    ...overrides,
  };
}

describe("Formularele de captare", () => {
  it("[blocant] „Cod pentru site” dă un fragment gata de lipit, cu tokenul în el", async () => {
    listCrmCaptureSources.mockResolvedValue({ items: [makeSource()] });

    render(<CaptureSourcesPanel pipelines={[]} onToast={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: /Cod pentru site/i }));

    const snippet = await screen.findByLabelText(/Lipește în pagina de contact/i);
    expect(snippet.textContent).toContain("tok_abc123456789");
    expect(snippet.textContent).toContain("/api/crm/intake/webform");
    // UTM-urile din URL pleacă odată cu leadul — altfel „de unde a venit" se pierde.
    expect(snippet.textContent).toContain("utm_campaign");
    // Consimțământul se trimite cu clipa lui: serverul refuză un payload vechi.
    expect(snippet.textContent).toContain("consentAt");
  });

  it("[normal] se vede câte leaduri a adus fiecare formular", async () => {
    listCrmCaptureSources.mockResolvedValue({ items: [makeSource({ leadsCaptured: 12 })] });

    render(<CaptureSourcesPanel pipelines={[]} onToast={vi.fn()} />);

    expect(await screen.findByText(/12 leaduri aduse/)).toBeInTheDocument();
    expect(screen.getByText(/doar de pe https:\/\/ecosolar.md/)).toBeInTheDocument();
  });

  it("[blocant] formularul nou pleacă la server cu sursa și domeniile declarate", async () => {
    listCrmCaptureSources.mockResolvedValue({ items: [] });
    createCrmCaptureSource.mockResolvedValue(makeSource({ id: "src-nou" }));

    render(<CaptureSourcesPanel pipelines={[]} onToast={vi.fn()} />);

    fireEvent.change(await screen.findByLabelText(/Formular nou/), { target: { value: "Pagina Contact" } });
    fireEvent.change(screen.getByLabelText("Sursa leadurilor"), { target: { value: "google_ads" } });
    fireEvent.change(screen.getByLabelText(/Domenii permise/), { target: { value: "https://ecosolar.md" } });
    fireEvent.click(screen.getByRole("button", { name: "Creează formularul" }));

    await waitFor(() =>
      expect(createCrmCaptureSource).toHaveBeenCalledWith({
        name: "Pagina Contact",
        defaultSource: "google_ads",
        pipelineId: null,
        allowedOrigins: ["https://ecosolar.md"],
      })
    );
  });

  it("[normal] oprirea unui formular îl scoate din funcțiune, fără să-l șteargă", async () => {
    listCrmCaptureSources.mockResolvedValue({ items: [makeSource()] });
    updateCrmCaptureSource.mockResolvedValue(makeSource({ active: false }));

    render(<CaptureSourcesPanel pipelines={[]} onToast={vi.fn()} />);
    fireEvent.click(await screen.findByLabelText(/Pornit\/oprit pentru/));

    await waitFor(() => expect(updateCrmCaptureSource).toHaveBeenCalledWith("src-1", { active: false }));
    expect(deleteCrmCaptureSource).not.toHaveBeenCalled();
  });
});
