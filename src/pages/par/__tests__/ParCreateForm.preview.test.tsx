/**
 * „Vezi cum arată" — formularul oficial, citit ÎNAINTE de a-l trimite spre semnare.
 *
 * Iulian Lungu (ATIC, 17.09.2026): „ar fi comod, după ce completezi toate celulele, să fie posibil
 * să vezi documentul în formatul de PAR, înainte de a trimite spre semnare. Acum nu e posibil de
 * vizualizat." Butonul „Vezi PDF" exista doar pe fișa cererii, adică DUPĂ trimitere — când o
 * corectură cere retragerea din aprobare.
 *
 * Ce apără testele: (1) butonul e în bara de jos, lângă „Trimite"; (2) ciorna se SCRIE pe server
 * înainte de a fi previzualizată, altfel omul ar vedea starea de la ultima salvare, fără chiar
 * câmpurile pe care tocmai le-a schimbat; (3) documentul cerut e formularul de pe server, servit
 * `inline` — nu o a doua randare în browser, care ar arăta altceva decât hârtia semnată.
 *
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ParCreateForm } from "../ParCreateForm";
import * as parApi from "@/lib/api/par";
import {
  registerParAttachmentViewer,
  type ParAttachmentTarget,
} from "@/lib/par/attachmentViewerBus";

vi.mock("@/router/HashRouter", () => ({
  useRouter: () => ({ path: "/business/par/draft-1/edit", navigate: vi.fn() }),
}));
vi.mock("@/hooks/useSession", () => ({
  useSession: () => ({
    data: { user: { id: "u-1", name: "Iulian Lungu", email: "i@atic.md", role: "member" }, tenant: { id: "t-1", name: "ATIC" } },
  }),
}));
vi.mock("@/components/app/AppShell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const draft = {
  id: "draft-1",
  tenantId: "t-1",
  requestNo: "PAR-2026-0058",
  dateOfRequest: "2026-09-17",
  requestedByUserId: "u-1",
  payerId: null,
  requestorTitle: "Project Coordinator",
  requestorCode: null,
  departmentId: null,
  dateNeeded: null,
  projectId: null,
  budgetCodeId: null,
  budgetCodeNote: null,
  purpose: "execute_payment",
  chargeTo: "program",
  chargeBillingCode: null,
  endUse: "Materiale pentru Youth Maker club.",
  vendorId: null,
  payeeName: "Papetăria SRL",
  payeeIdnp: "2002600012345",
  payeeIban: "MD24AG000225100013104168",
  payeeBank: "MAIB",
  attachmentsPresent: false,
  attachmentsNote: null,
  currency: "MDL",
  totalEstimatedCents: 150000,
  status: "draft",
  submittedAt: null,
  approvedAt: null,
  paidAt: null,
  cancelledAt: null,
  createdAt: "2026-09-17",
  updatedAt: "2026-09-17",
  line_items: [
    {
      id: "li-1", tenantId: "t-1", parId: "draft-1", position: 1,
      description: "Materiale de birou", quantity: 10, unit: "buc",
      unitPriceCents: 15000, lineTotalCents: 150000,
      createdAt: "2026-09-17", updatedAt: "2026-09-17",
    },
  ],
  approvals: [],
  attachments: [],
  payment: null,
} as unknown as Awaited<ReturnType<typeof parApi.getPar>>;

function mockConfigApis() {
  vi.spyOn(parApi, "listDepartments").mockResolvedValue({ items: [] } as never);
  vi.spyOn(parApi, "listProjects").mockResolvedValue({ items: [] } as never);
  vi.spyOn(parApi, "listEvents").mockResolvedValue({ events: [] } as never);
  vi.spyOn(parApi, "listBudgetCodes").mockResolvedValue({ items: [] } as never);
  vi.spyOn(parApi, "listVendors").mockResolvedValue({ items: [] } as never);
  vi.spyOn(parApi, "listParTemplates").mockResolvedValue({ templates: [] } as never);
}

const previewButton = () =>
  screen.getByRole("button", { name: /Vezi cum arată formularul PAR înainte de trimitere/i });

describe("ParCreateForm — previzualizarea formularului înainte de trimitere", () => {
  let unregister: (() => void) | null = null;

  beforeEach(() => {
    vi.restoreAllMocks();
    window.location.hash = "#/business/par/draft-1/edit";
    mockConfigApis();
    vi.spyOn(parApi, "getPar").mockResolvedValue(draft);
    vi.spyOn(parApi, "updatePar").mockResolvedValue(draft);
  });

  afterEach(() => {
    unregister?.();
    unregister = null;
  });

  it("deschide formularul de pe server în vizualizatorul din aplicație", async () => {
    const seen: ParAttachmentTarget[] = [];
    unregister = registerParAttachmentViewer((t) => seen.push(t));

    render(<ParCreateForm />);
    await screen.findByText(/Materiale de birou/);
    fireEvent.click(previewButton());

    await waitFor(() => expect(seen).toHaveLength(1));
    // `inline=1`: documentul se CITEȘTE peste pagină. Fără el browserul l-ar descărca și cadrul ar
    // rămâne alb — butonul ar fi arătat exact ca „Salvează ciornă".
    expect(seen[0].url).toBe("/api/par/draft-1/form.pdf?inline=1");
    expect(seen[0].fileName).toContain("PAR-2026-0058");
  });

  it("scrie ciorna pe server înainte — altfel ar arăta starea de la ultima salvare", async () => {
    const update = vi.spyOn(parApi, "updatePar").mockResolvedValue(draft);
    unregister = registerParAttachmentViewer(() => {});

    render(<ParCreateForm />);
    await screen.findByText(/Materiale de birou/);
    fireEvent.click(previewButton());

    await waitFor(() => expect(update).toHaveBeenCalled());
    expect(update.mock.calls[0][0]).toBe("draft-1");
  });

  it("nu trimite cererea spre aprobare", async () => {
    const submit = vi.spyOn(parApi, "submitPar").mockResolvedValue({ id: "draft-1" } as never);
    unregister = registerParAttachmentViewer(() => {});

    render(<ParCreateForm />);
    await screen.findByText(/Materiale de birou/);
    fireEvent.click(previewButton());

    await waitFor(() => expect(parApi.updatePar).toHaveBeenCalled());
    expect(submit).not.toHaveBeenCalled();
  });

  it("fără vizualizator montat cade pe filă nouă, nu rămâne mut", async () => {
    const open = vi.spyOn(window, "open").mockReturnValue(null);

    render(<ParCreateForm />);
    await screen.findByText(/Materiale de birou/);
    fireEvent.click(previewButton());

    await waitFor(() =>
      expect(open).toHaveBeenCalledWith("/api/par/draft-1/form.pdf?inline=1", "_blank", "noopener,noreferrer")
    );
  });
});
