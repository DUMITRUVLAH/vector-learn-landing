/**
 * PAR-EFP — dialogul cu conținutul unei e-Facturi primite.
 * @vitest-environment jsdom
 *
 * Ce apără: omul trebuie să vadă CE SCRIE în factură (părți, date, totaluri, liniile de marfă) și
 * să poată deschide documentul oficial. Când SFS nu răspunde, dialogul spune asta — nu arată o
 * factură goală ca și cum ar fi conținutul ei real.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { SfsInvoiceDialog } from "../SfsInvoiceDialog";
import * as api from "@/lib/api/parEfactura";
import type { BuyerInvoiceDetailResponse } from "@/lib/api/parEfactura";

function response(overrides: Partial<BuyerInvoiceDetailResponse> = {}): BuyerInvoiceDetailResponse {
  return {
    available: true,
    message: "",
    seria: "EAW",
    number: "000504087",
    invoiceStatus: 6,
    invoiceStatusLabel: "Arhivat",
    detail: {
      seria: "EAW",
      number: "000504087",
      issuedDate: "2025-04-02T09:39:51.633Z",
      deliveryDate: "2025-04-02T09:38:42.306Z",
      supplier: {
        idno: "1024600080726",
        name: '"DUCONT GRUP" S.R.L.',
        address: "SEC.BUIUCANI Alba-Iulia nr.21",
        bankAccount: "MD43AG000000022516391752",
        bankName: "BC'MAIB'S.A.",
        bankCode: "AGRNMD2X",
      },
      buyer: {
        idno: "1024600035737",
        name: "VECTOR ACADEMY S.R.L.",
        address: "SEC.CENTRU 31 August 1989 nr.78",
        bankAccount: null,
        bankName: null,
        bankCode: null,
      },
      loadingPoint: "SEC.BUIUCANI Alba-Iulia nr.21",
      unloadingPoint: "SEC.CENTRU 31 August 1989 nr.78",
      totalCents: 492000,
      totalVatCents: 82000,
      lines: [
        {
          name: "Hârtie A4",
          unitOfMeasure: "buc",
          quantity: 10,
          unitPriceWithoutVatCents: 41000,
          totalWithoutVatCents: 410000,
          vatRate: "20",
          vatCents: 82000,
          totalCents: 492000,
        },
      ],
      signed: true,
    },
    ...overrides,
  };
}

describe("SfsInvoiceDialog", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("arată părțile, totalurile și liniile facturii", async () => {
    vi.spyOn(api, "getBuyerInvoiceDetail").mockResolvedValue(response());
    render(<SfsInvoiceDialog seria="EAW" number="000504087" onClose={() => {}} />);

    await waitFor(() => expect(screen.getByText('"DUCONT GRUP" S.R.L.')).toBeInTheDocument());
    expect(screen.getByText("IDNO 1024600080726")).toBeInTheDocument();
    expect(screen.getByText("VECTOR ACADEMY S.R.L.")).toBeInTheDocument();
    expect(screen.getByText("MD43AG000000022516391752")).toBeInTheDocument();
    expect(screen.getByText("Hârtie A4")).toBeInTheDocument();
    expect(screen.getAllByText("4.920,00 MDL").length).toBeGreaterThan(0);
    expect(screen.getByText("820,00 MDL")).toBeInTheDocument();
    expect(screen.getByText(/semnătură electronică/i)).toBeInTheDocument();
  });

  it("oferă documentul PDF oficial", async () => {
    vi.spyOn(api, "getBuyerInvoiceDetail").mockResolvedValue(response());
    render(<SfsInvoiceDialog seria="EAW" number="000504087" onClose={() => {}} />);

    const link = await screen.findByRole("link", { name: /Deschide documentul PDF/i });
    expect(link).toHaveAttribute("href", "/api/par/efactura/invoices/EAW/000504087/pdf");
  });

  it("spune când SFS nu a putut fi citit, fără să inventeze conținut", async () => {
    vi.spyOn(api, "getBuyerInvoiceDetail").mockResolvedValue(
      response({ available: false, detail: null, message: "Integrarea e-Factura (SFS) nu este configurată pentru această organizație." })
    );
    render(<SfsInvoiceDialog seria="EAW" number="000504087" onClose={() => {}} />);

    await waitFor(() => expect(screen.getByText(/nu este configurată/i)).toBeInTheDocument());
    expect(screen.queryByText("Hârtie A4")).not.toBeInTheDocument();
  });
});
