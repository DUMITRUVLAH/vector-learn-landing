/**
 * VM1-10b: Foldere PAR — the drive-style flow, clicked end to end.
 *
 * The reported bug: clicking a folder jumped to the global request list ("mă duce și văd toate
 * cererile"). So this test does not assert that a row *renders* — it CLICKS through every level
 * with the real HashRouter and asserts what the next screen shows (CLAUDE.md §3.5.1quater):
 *
 *   Proiecte → ATIC → Plătite → PAR-2026-0002 → documentele (inclusiv ordinul de plată)
 *
 * T-VM1-10b-4 [blocant] clicking a project opens ITS folders, not the request list
 * T-VM1-10b-5 [blocant] the last level lists the documents of that one PAR + the finance evidence
 * T-VM1-10b-6 [blocant] breadcrumb walks back up
 * T-VM1-10b-7 [normal]  a paid PAR with no payment order is flagged, not silently empty
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HashRouter } from "@/router/HashRouter";

const mockListPar = vi.fn();
const mockGetPar = vi.fn();

vi.mock("@/components/business/BusinessShell", () => ({
  BusinessShell: ({ children, pageTitle }: { children: React.ReactNode; pageTitle: string }) => (
    <div data-testid="shell" data-title={pageTitle}>
      {children}
    </div>
  ),
}));

vi.mock("@/lib/api/par", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/par")>("@/lib/api/par");
  return {
    ...actual,
    listPar: (...args: unknown[]) => mockListPar(...args),
    getPar: (...args: unknown[]) => mockGetPar(...args),
    listProjects: vi.fn().mockResolvedValue({
      items: [
        { id: "proj-A", name: "ATIC", donor: "USAID", payerId: null, active: true },
        { id: "proj-B", name: "Tekwill", donor: null, payerId: null, active: true },
      ],
    }),
    listEvents: vi.fn().mockResolvedValue({ events: [] }),
    formatMDL: (cents: number) => `${(cents / 100).toFixed(2)} L`,
    downloadDosar: vi.fn().mockResolvedValue(undefined),
  };
});

import { ParFolders } from "../ParFolders";

// ─── Fixtures ────────────────────────────────────────────────────────────────

const baseRow = {
  tenantId: "t1",
  dateOfRequest: "2026-06-10",
  requestedByUserId: "u1",
  payerId: null,
  eventId: null,
  currency: "MDL",
  totalMdlCents: null,
  above_micro_threshold: false,
  attachmentsPresent: true,
};

const rows = [
  {
    ...baseRow,
    id: "par-paid",
    requestNo: "PAR-2026-0002",
    projectId: "proj-A",
    status: "paid",
    payeeName: "Rovicom SRL",
    endUse: "Servicii de catering",
    totalEstimatedCents: 250000,
    docs: {
      count: 2,
      kinds: ["invoice", "payment_order"],
      has_payment_order: true,
      has_invoice: true,
      has_payment_proof: false,
      payment_date: "2026-06-20T00:00:00.000Z",
      payment_ref: "OP-771",
      actual_amount_cents: 250000,
    },
  },
  {
    ...baseRow,
    id: "par-paid-nodocs",
    requestNo: "PAR-2026-0003",
    projectId: "proj-A",
    status: "paid",
    payeeName: "Fara Dovada SRL",
    endUse: "Consumabile",
    totalEstimatedCents: 10000,
    docs: {
      count: 0,
      kinds: [],
      has_payment_order: false,
      has_invoice: false,
      has_payment_proof: false,
      payment_date: null,
      payment_ref: null,
      actual_amount_cents: null,
    },
  },
  {
    ...baseRow,
    id: "par-pending",
    requestNo: "PAR-2026-0004",
    projectId: "proj-A",
    status: "pending_approval",
    payeeName: "Alt Furnizor SRL",
    endUse: "Echipament",
    totalEstimatedCents: 50000,
    docs: { count: 1, kinds: ["invoice"], has_payment_order: false, has_invoice: true, has_payment_proof: false, payment_date: null, payment_ref: null, actual_amount_cents: null },
  },
  {
    ...baseRow,
    id: "par-other-project",
    requestNo: "PAR-2026-0009",
    projectId: "proj-B",
    status: "paid",
    payeeName: "Tekwill Vendor",
    endUse: "Altceva",
    totalEstimatedCents: 999900,
    docs: { count: 0, kinds: [], has_payment_order: false, has_invoice: false, has_payment_proof: false, payment_date: null, payment_ref: null, actual_amount_cents: null },
  },
];

const paidDetail = {
  ...rows[0],
  line_items: [],
  approvals: [],
  projectName: "ATIC",
  attachments: [
    { id: "att-1", fileName: "factura-113.pdf", kind: "invoice", uploadedBy: "u1", createdAt: "2026-06-11T09:00:00.000Z", fileUrl: "data:application/pdf;base64,AA" },
    { id: "att-2", fileName: "ordin-plata-771.pdf", kind: "payment_order", uploadedBy: "u2", createdAt: "2026-06-20T09:00:00.000Z", fileUrl: "data:application/pdf;base64,BB" },
  ],
  payment: {
    id: "pay-1",
    parBl: null,
    receivedAt: null,
    receivedByUserId: null,
    assignedToUserId: null,
    actualAmountCents: 250000,
    paymentDate: "2026-06-20T00:00:00.000Z",
    paymentRef: "OP-771",
    proofUrl: null,
  },
};

const noDocsDetail = { ...rows[1], line_items: [], approvals: [], projectName: "ATIC", attachments: [], payment: null };

function renderAt(hash: string) {
  window.location.hash = hash;
  return render(
    <HashRouter>
      <ParFolders />
    </HashRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockListPar.mockResolvedValue({ requests: rows, total: rows.length });
  mockGetPar.mockImplementation(async (id: string) => (id === "par-paid" ? paidDetail : noDocsDetail));
  window.location.hash = "/business/par/folders";
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("VM1-10b: Foldere PAR — navigare ca într-un drive", () => {
  it("T-VM1-10b-4 [blocant] click pe proiect → subfolderele proiectului, NU lista de cereri", async () => {
    const user = userEvent.setup();
    renderAt("/business/par/folders");

    // Root: one folder per project, with the running stats.
    const atic = await screen.findByRole("link", { name: /Deschide folderul ATIC/i });
    expect(screen.getByRole("link", { name: /Deschide folderul Tekwill/i })).toBeInTheDocument();
    expect(screen.getByText("Total cereri").previousSibling).toHaveTextContent("4");

    await user.click(atic);

    // Still inside the folders page — the URL is a folder location, not the request list.
    await waitFor(() => expect(window.location.hash).toBe("#/business/par/folders?p=proj-A"));
    expect(window.location.hash).not.toContain("status=");

    // The project's status sub-folders are what we see now.
    const paidFolder = await screen.findByRole("link", { name: /Deschide folderul Plătite/i });
    expect(screen.getByRole("link", { name: /Deschide folderul De aprobat/i })).toBeInTheDocument();
    // Scoped stats: 3 of the 4 requests belong to ATIC.
    expect(screen.getByText("Cereri în folder").previousSibling).toHaveTextContent("3");
    // Tekwill's paid request must NOT be reachable from here.
    expect(paidFolder).toHaveAccessibleName(/2 cereri/);
  });

  it("T-VM1-10b-5 [blocant] status → cerere → documentele ei, cu ordinul de plată de la finanțe", async () => {
    const user = userEvent.setup();
    renderAt("/business/par/folders?p=proj-A");

    await user.click(await screen.findByRole("link", { name: /Deschide folderul Plătite/i }));
    await waitFor(() => expect(window.location.hash).toBe("#/business/par/folders?p=proj-A&b=paid"));

    // The bucket lists only ITS requests — the pending one from the same project stays out.
    const parLink = await screen.findByRole("link", { name: /Deschide documentele cererii PAR-2026-0002/i });
    expect(screen.queryByRole("link", { name: /PAR-2026-0004/i })).not.toBeInTheDocument();
    expect(screen.getByText(/Rovicom SRL/)).toBeInTheDocument();

    await user.click(parLink);
    await waitFor(() => expect(mockGetPar).toHaveBeenCalledWith("par-paid"));

    // Final level: the dossier of that one PAR.
    expect(await screen.findByText("factura-113.pdf")).toBeInTheDocument();
    const requestSection = screen.getByText(/Documentele cererii \(1\)/);
    expect(requestSection).toBeInTheDocument();

    // Finance evidence is listed separately and labelled.
    expect(screen.getByRole("button", { name: /Deschide documentul ordin-plata-771\.pdf/i })).toBeInTheDocument();
    expect(screen.getByText(/^Ordin de plată/)).toBeInTheDocument();
    expect(screen.getByText("OP-771")).toBeInTheDocument();
    // …and the invoice is NOT filed under "Plata (finanțe)".
    expect(screen.queryByText(/marcată plătită, dar finanțele nu au atașat/i)).not.toBeInTheDocument();
  });

  it("T-VM1-10b-6 [blocant] breadcrumb-ul urcă înapoi la rădăcină", async () => {
    const user = userEvent.setup();
    renderAt("/business/par/folders?p=proj-A&b=paid&id=par-paid");

    const nav = await screen.findByRole("navigation", { name: /Cale foldere/i });
    expect(within(nav).getByText("ATIC")).toBeInTheDocument();
    expect(within(nav).getByText("Plătite")).toBeInTheDocument();

    await user.click(within(nav).getByRole("link", { name: "ATIC" }));
    await waitFor(() => expect(window.location.hash).toBe("#/business/par/folders?p=proj-A"));
    expect(await screen.findByRole("link", { name: /Deschide folderul Plătite/i })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Înapoi la folderul precedent/i }));
    await waitFor(() => expect(window.location.hash).toBe("#/business/par/folders"));
    expect(await screen.findByRole("link", { name: /Deschide folderul Tekwill/i })).toBeInTheDocument();
  });

  it("T-VM1-10b-7 [normal] o cerere plătită fără ordin de plată e semnalată, în listă și în dosar", async () => {
    const user = userEvent.setup();
    renderAt("/business/par/folders?p=proj-A&b=paid");

    const row = await screen.findByRole("link", { name: /Deschide documentele cererii PAR-2026-0003/i });
    expect(within(row).getByText(/Fără dovadă de plată/i)).toBeInTheDocument();

    await user.click(row);
    expect(
      await screen.findByText(/marcată plătită, dar finanțele nu au atașat/i),
    ).toBeInTheDocument();
  });
});
