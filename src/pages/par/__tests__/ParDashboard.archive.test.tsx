/**
 * PAR-ARH — arhiva cererilor, din lista de cereri.
 *
 * Cererea utilizatoarei (22.09.2026): ciornele abandonate rămân în listă și induc în eroare; vrea
 * să le poată pune deoparte și să le vadă separat, într-o arhivă.
 *
 * Se testează ACȚIUNEA, nu afișarea (§3.5.1quater): butonul chiar cheamă arhivarea pe server,
 * rândul chiar pleacă din listă, iar fila „Arhivate” chiar cere ALTĂ listă (`archived: true`).
 *
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ParDashboard } from "../ParDashboard";
import * as parApi from "@/lib/api/par";
import type { ParRequest } from "@/lib/api/par";

const navigate = vi.fn();
vi.mock("@/router/HashRouter", () => ({
  useRouter: () => ({ path: "/business/par", navigate: (p: string) => navigate(p) }),
}));
vi.mock("@/components/app/AppShell", () => ({
  AppShell: ({ children, pageTitle, actions }: { children: React.ReactNode; pageTitle?: React.ReactNode; actions?: React.ReactNode }) => (
    <div>{pageTitle ? <h1>{pageTitle}</h1> : null}{actions}{children}</div>
  ),
}));

function mkRow(over: Partial<ParRequest> & { id: string; requestNo: string; status: string }) {
  return {
    tenantId: "t-1",
    dateOfRequest: new Date().toISOString(),
    requestedByUserId: "u-1",
    payerId: null,
    requestorTitle: null,
    requestorCode: null,
    departmentId: null,
    dateNeeded: null,
    projectId: null,
    budgetCodeId: null,
    budgetCodeNote: null,
    purpose: "execute_payment",
    chargeTo: "program",
    chargeBillingCode: null,
    endUse: null,
    vendorId: null,
    payeeName: "Chirie SRL",
    payeeIdnp: null,
    payeeIban: null,
    payeeBank: null,
    attachmentsPresent: false,
    attachmentsNote: null,
    currency: "MDL",
    totalEstimatedCents: 500000,
    above_micro_threshold: false,
    submittedAt: null,
    approvedAt: null,
    paidAt: null,
    cancelledAt: null,
    archivedAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...over,
  } as unknown as ParRequest & { above_micro_threshold: boolean };
}

const ciorna = mkRow({ id: "par-1", requestNo: "PAR-2026-0001", status: "draft" });
const laAprobare = mkRow({ id: "par-2", requestNo: "PAR-2026-0002", status: "pending_approval" });
const arhivata = mkRow({
  id: "par-9",
  requestNo: "PAR-2026-0009",
  status: "draft",
  archivedAt: new Date().toISOString(),
});

/** Lista de lucru și arhiva sunt două răspunsuri diferite ale aceleiași rute. */
function mockList() {
  return vi.spyOn(parApi, "listPar").mockImplementation(async (filters) =>
    (filters?.archived
      ? { requests: [arhivata], total: 1 }
      : { requests: [ciorna, laAprobare], total: 2 }) as never
  );
}

describe("ParDashboard — arhiva cererilor", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    navigate.mockReset();
    mockList();
  });

  it("[blocant] „Arhivează” pe rând trimite cererea la server și rândul pleacă din listă", async () => {
    const archive = vi.spyOn(parApi, "archivePar").mockResolvedValue({ archived: true } as never);
    render(<ParDashboard />);

    fireEvent.click(await screen.findByRole("button", { name: /Arhivează cererea PAR-2026-0001/i }));

    // Confirmarea spune ce se întâmplă; abia apoi se cheamă serverul.
    fireEvent.click(await screen.findByRole("button", { name: /^Arhivează$/i }));

    await waitFor(() => expect(archive).toHaveBeenCalledWith("par-1", undefined));
    await waitFor(() => expect(screen.queryByText("PAR-2026-0001")).not.toBeInTheDocument());
    // Rândul e clicabil — butonul nu are voie să deschidă și cererea.
    expect(navigate).not.toHaveBeenCalledWith("/business/par/par-1");
  });

  it("[blocant] o cerere aflată la aprobare NU primește butonul de arhivare", async () => {
    render(<ParDashboard />);
    await screen.findByText("PAR-2026-0002");
    expect(screen.queryByRole("button", { name: /Arhivează cererea PAR-2026-0002/i })).toBeNull();
  });

  it("[blocant] fila „Arhivate” cere lista de arhivă, iar rândurile de acolo se restaurează", async () => {
    const restore = vi.spyOn(parApi, "unarchivePar").mockResolvedValue({ archived: false } as never);
    render(<ParDashboard />);
    await screen.findByText("PAR-2026-0001");

    fireEvent.click(screen.getByRole("tab", { name: /Arhivate/i }));

    await waitFor(() =>
      expect(parApi.listPar).toHaveBeenCalledWith(
        expect.objectContaining({ archived: true }),
        expect.anything()
      )
    );
    await screen.findByText("PAR-2026-0009");
    // Cererile active nu se amestecă în arhivă.
    expect(screen.queryByText("PAR-2026-0001")).not.toBeInTheDocument();

    fireEvent.click(await screen.findByRole("button", { name: /Restaurează cererea PAR-2026-0009/i }));
    fireEvent.click(await screen.findByRole("button", { name: /^Restaurează$/i }));

    await waitFor(() => expect(restore).toHaveBeenCalledWith("par-9"));
  });
});
