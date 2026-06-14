/**
 * EINV-003: UI e-Factura Moldova — tests
 *
 * T-EINV-003-1 [blocant] Render smoke — pagina se randează, titlul este vizibil
 * T-EINV-003-2 [blocant] Panoul SFS afișează IDNO/environment când settings sunt încărcate
 * T-EINV-003-3 [normal] Formularul SFS apelează upsertSfsSettings la submit
 * T-EINV-003-4 [normal] Factură cu status "sent" → Anulează activ
 * T-EINV-003-5 [normal] Factură cu status "pending" → Anulează disabled
 * T-EINV-003-6 [blocant] Buton Sincronizează apelează syncEinvoice
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { FinEinvoicesPage } from "@/pages/app/FinEinvoicesPage";
import * as api from "@/lib/api/finEinvoices";

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("@/hooks/useSession", () => ({
  useSession: () => ({ status: "authenticated", data: { id: "u1", tenantId: "t1" } }),
}));

vi.mock("@/router/HashRouter", () => ({
  useRouter: () => ({ path: "/app/fin/einvoices", navigate: vi.fn() }),
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={`#${to}`}>{children}</a>
  ),
}));

vi.mock("@/components/app/AppShell", () => ({
  AppShell: ({
    children,
    pageTitle,
  }: {
    children: React.ReactNode;
    pageTitle: string;
  }) => (
    <div>
      <h1>{pageTitle}</h1>
      {children}
    </div>
  ),
}));

vi.mock("@/lib/api/finEinvoices", () => ({
  getSfsSettings: vi.fn(),
  upsertSfsSettings: vi.fn(),
  listEinvoices: vi.fn(),
  syncEinvoice: vi.fn(),
  cancelEinvoice: vi.fn(),
}));

const mockSettings = {
  id: "s1",
  idno: "1234567890123",
  bankAccount: "MD24AG000000000000000000",
  environment: "mock" as const,
  hasCredentials: false,
  lastTestedAt: null,
  createdAt: "2026-06-14T00:00:00Z",
  updatedAt: "2026-06-14T00:00:00Z",
};

const mockEinvoiceSent = {
  id: "e1",
  finInvoiceId: "inv-aabbccdd-1234-5678-90ab-cdef01234567",
  sfsStatus: "sent" as const,
  sfsSerialNumber: "EFMD-AABBCCDD",
  sfsInvoiceId: "000000001",
  sfsRequestStatus: 1,
  sfsErrorMessage: null,
  submittedAt: "2026-06-14T10:00:00Z",
  lastSyncAt: null,
  createdAt: "2026-06-14T10:00:00Z",
};

const mockEinvoicePending = {
  ...mockEinvoiceSent,
  id: "e2",
  finInvoiceId: "inv-pending-1234-5678-90ab-cdef01234567",
  sfsStatus: "pending" as const,
  sfsSerialNumber: null,
  sfsInvoiceId: null,
  sfsRequestStatus: null,
  submittedAt: null,
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("EINV-003 — FinEinvoicesPage", () => {
  beforeEach(() => {
    vi.mocked(api.getSfsSettings).mockResolvedValue({ data: mockSettings });
    vi.mocked(api.listEinvoices).mockResolvedValue({ items: [] });
    vi.mocked(api.upsertSfsSettings).mockResolvedValue({ data: { ...mockSettings, hasCredentials: false } });
    vi.mocked(api.syncEinvoice).mockResolvedValue({
      data: { id: "e1", sfsStatus: "accepted", lastSyncAt: "2026-06-14T11:00:00Z" },
    });
    vi.mocked(api.cancelEinvoice).mockResolvedValue({
      data: { id: "e1", sfsStatus: "cancelled" },
    });
  });

  it("T-EINV-003-1 [blocant] se randează fără crash și titlul e-Factura Moldova este vizibil", async () => {
    render(<FinEinvoicesPage />);
    await waitFor(() => {
      expect(screen.getByText("e-Factura Moldova (SFS)")).toBeDefined();
    });
    expect(screen.getByRole("tab", { name: /facturi electronice/i })).toBeDefined();
    expect(screen.getByRole("tab", { name: /configurare sfs/i })).toBeDefined();
  });

  it("T-EINV-003-2 [blocant] panoul SFS afișează IDNO și environment după încărcare", async () => {
    render(<FinEinvoicesPage />);

    // Switch to settings tab
    await waitFor(() => screen.getByRole("tab", { name: /configurare sfs/i }));
    fireEvent.click(screen.getByRole("tab", { name: /configurare sfs/i }));

    await waitFor(() => {
      const input = screen.getByLabelText(/idno companie/i) as HTMLInputElement;
      expect(input.value).toBe("1234567890123");
    });
  });

  it("T-EINV-003-3 [normal] formularul SFS apelează upsertSfsSettings la submit", async () => {
    render(<FinEinvoicesPage />);

    await waitFor(() => screen.getByRole("tab", { name: /configurare sfs/i }));
    fireEvent.click(screen.getByRole("tab", { name: /configurare sfs/i }));

    await waitFor(() => screen.getByLabelText(/idno companie/i));

    const idnoInput = screen.getByLabelText(/idno companie/i) as HTMLInputElement;
    // Clear and re-enter
    fireEvent.change(idnoInput, { target: { value: "9876543210987" } });

    fireEvent.click(screen.getByText("Salvează"));

    await waitFor(() => {
      expect(api.upsertSfsSettings).toHaveBeenCalledWith(
        expect.objectContaining({ idno: "9876543210987" })
      );
    });
  });

  it("T-EINV-003-4 [normal] factură sent → butonul Anulează este activ", async () => {
    vi.mocked(api.listEinvoices).mockResolvedValue({ items: [mockEinvoiceSent] });
    render(<FinEinvoicesPage />);

    // finInvoiceId.slice(0,8) = "inv-aabb"
    await waitFor(() =>
      screen.getByRole("button", {
        name: /anulează factura inv-aabb/i,
      })
    );

    const cancelBtn = screen.getByRole("button", {
      name: /anulează factura inv-aabb/i,
    }) as HTMLButtonElement;
    expect(cancelBtn.disabled).toBe(false);
  });

  it("T-EINV-003-5 [normal] factură pending → butonul Anulează este disabled", async () => {
    vi.mocked(api.listEinvoices).mockResolvedValue({ items: [mockEinvoicePending] });
    render(<FinEinvoicesPage />);

    // finInvoiceId.slice(0,8) = "inv-pend"
    await waitFor(() =>
      screen.getByRole("button", {
        name: /anulează factura inv-pend/i,
      })
    );

    const cancelBtn = screen.getByRole("button", {
      name: /anulează factura inv-pend/i,
    }) as HTMLButtonElement;
    expect(cancelBtn.disabled).toBe(true);
  });

  it("T-EINV-003-6 [blocant] buton Sincronizează apelează syncEinvoice", async () => {
    vi.mocked(api.listEinvoices).mockResolvedValue({ items: [mockEinvoiceSent] });
    render(<FinEinvoicesPage />);

    // finInvoiceId.slice(0,8) = "inv-aabb"
    await waitFor(() =>
      screen.getByRole("button", { name: /sincronizează factura inv-aabb/i })
    );

    fireEvent.click(
      screen.getByRole("button", { name: /sincronizează factura inv-aabb/i })
    );

    await waitFor(() => {
      expect(api.syncEinvoice).toHaveBeenCalledWith(mockEinvoiceSent.finInvoiceId);
    });
  });
});
