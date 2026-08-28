/**
 * PAR-EFP — cardul „e-Factura de la prestator" din pagina cererii.
 * @vitest-environment jsdom
 *
 * Se testează ce vede și ce APASĂ omul: butonul de reminder chiar cheamă endpoint-ul și confirmă
 * cui a plecat emailul; când SFS nu e configurat, cardul spune că verificarea nu s-a putut face —
 * nu „lipsește factura", ca nimeni să nu acuze un prestator care și-a făcut treaba.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ParEfacturaCard } from "../ParEfacturaCard";
import * as api from "@/lib/api/parEfactura";
import type { ParEfacturaDetail, ParEfacturaState } from "@/lib/api/parEfactura";

const PAR_ID = "11111111-1111-4111-8111-111111111111";

function state(overrides: Partial<ParEfacturaState> = {}): ParEfacturaState {
  return {
    status: "expected",
    supplierIdno: "1002600001234",
    sfsSeria: null,
    sfsNumber: null,
    sfsInvoiceStatus: null,
    sfsInvoiceStatusLabel: null,
    invoiceDate: null,
    invoiceTotalCents: null,
    lastScanAt: null,
    lastScanSource: null,
    lastScanMessage: null,
    reminderCount: 0,
    lastReminderAt: null,
    lastReminderToEmail: null,
    markedNote: null,
    ...overrides,
  };
}

function detail(overrides: Partial<ParEfacturaDetail> = {}): ParEfacturaDetail {
  return {
    parId: PAR_ID,
    requestNo: "PAR-2026-0001",
    payeeName: "Consultanți SRL",
    vendorContactEmail: null,
    canManage: true,
    state: state(),
    sfs: { configured: true, environment: "prod", idno: "1003600009999", hasCredentials: true, lastTestedAt: null },
    ...overrides,
  };
}

describe("ParEfacturaCard", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("arată că factura lipsește și oferă butonul de reminder", async () => {
    vi.spyOn(api, "getParEfactura").mockResolvedValue(
      detail({ state: state({ lastScanAt: "2026-08-27T10:00:00.000Z", lastScanMessage: "Nicio factură de la 1002600001234 în SFS pentru această plată." }) })
    );
    render(<ParEfacturaCard parId={PAR_ID} />);

    await waitFor(() => expect(screen.getByText("Lipsește")).toBeInTheDocument());
    expect(screen.getByText(/Nicio factură de la 1002600001234/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Trimite reminder solicitantului/i })).toBeInTheDocument();
  });

  it("trimite reminderul și spune cui a plecat", async () => {
    vi.spyOn(api, "getParEfactura").mockResolvedValue(detail());
    const send = vi.spyOn(api, "sendParEfacturaReminder").mockResolvedValue({
      sent: true,
      emailed: true,
      toAddress: "solicitant@atic.md",
      reminderCount: 1,
      lastReminderAt: "2026-08-28T09:00:00.000Z",
    });

    render(<ParEfacturaCard parId={PAR_ID} />);
    await waitFor(() => expect(screen.getByText("Lipsește")).toBeInTheDocument());
    await userEvent.click(screen.getByRole("button", { name: /Trimite reminder solicitantului/i }));

    await waitFor(() => expect(send).toHaveBeenCalledWith(PAR_ID));
    expect(await screen.findByText(/solicitant@atic\.md/)).toBeInTheDocument();
  });

  it("arată motivul serverului când reminderul e refuzat (prea devreme)", async () => {
    vi.spyOn(api, "getParEfactura").mockResolvedValue(detail());
    const { ApiError } = await import("@/lib/api");
    vi.spyOn(api, "sendParEfacturaReminder").mockRejectedValue(
      new ApiError(429, "too_soon", undefined, [], { detail: "Un reminder a fost deja trimis în ultimele 24 de ore." })
    );

    render(<ParEfacturaCard parId={PAR_ID} />);
    await waitFor(() => expect(screen.getByText("Lipsește")).toBeInTheDocument());
    await userEvent.click(screen.getByRole("button", { name: /Trimite reminder solicitantului/i }));

    expect(await screen.findByText(/deja trimis în ultimele 24 de ore/i)).toBeInTheDocument();
  });

  it("spune clar când verificarea automată nu e disponibilă (SFS neconfigurat)", async () => {
    vi.spyOn(api, "getParEfactura").mockResolvedValue(
      detail({ sfs: { configured: false, environment: "mock", idno: null, hasCredentials: false, lastTestedAt: null } })
    );
    render(<ParEfacturaCard parId={PAR_ID} />);

    await waitFor(() => expect(screen.getByText(/Verificarea automată nu e disponibilă/i)).toBeInTheDocument());
    // Reminderul rămâne posibil — nu depinde de SFS.
    expect(screen.getByRole("button", { name: /Trimite reminder solicitantului/i })).toBeInTheDocument();
  });

  it("afișează seria și numărul facturii găsite", async () => {
    vi.spyOn(api, "getParEfactura").mockResolvedValue(
      detail({
        state: state({
          status: "found",
          sfsSeria: "EFMD",
          sfsNumber: "000000123",
          sfsInvoiceStatusLabel: "Trimis la Cumpărător",
          invoiceDate: "2026-08-13T00:00:00.000Z",
          invoiceTotalCents: 120000,
        }),
      })
    );
    render(<ParEfacturaCard parId={PAR_ID} />);

    await waitFor(() => expect(screen.getByText("Găsită în SFS")).toBeInTheDocument());
    expect(screen.getByText(/EFMD 000000123/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Trimite reminder/i })).not.toBeInTheDocument();
  });

  it("nu afișează nimic pentru o cerere fără obligație de e-Factura", async () => {
    vi.spyOn(api, "getParEfactura").mockResolvedValue(
      detail({ state: state({ status: "not_applicable", lastScanMessage: "Beneficiarul e persoană fizică — nu emite e-Factura." }) })
    );
    render(<ParEfacturaCard parId={PAR_ID} />);

    await waitFor(() => expect(screen.getByText("Nu se aplică")).toBeInTheDocument());
    expect(screen.getByText(/persoană fizică/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Trimite reminder/i })).not.toBeInTheDocument();
  });
});
