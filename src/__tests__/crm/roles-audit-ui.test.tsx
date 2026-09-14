/**
 * CRM Faza 9 — ce vede fiecare rol și jurnalul.
 *
 * Interfața ascunde butoanele pe care serverul le-ar refuza oricum. Testul verifică exact asta —
 * și traducerea codurilor din jurnal în propoziții, fiindcă „crm.lead.stage_changed" nu spune
 * nimic cuiva care vrea să afle cine a mutat leadul.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import type { CrmAuditEntry } from "@/lib/api/crm";

beforeEach(() => {
  vi.clearAllMocks();
});

vi.mock("@/hooks/useBusinessSession", () => ({
  useBusinessSession: () => ({
    status: "authenticated",
    data: {
      user: { id: "user-1", name: "Test", role: "owner" },
      tenant: { name: "Test", slug: "test", appKind: "business" },
    },
    logout: vi.fn(),
    refresh: vi.fn(),
    error: null,
  }),
}));

vi.mock("@/router/HashRouter", () => ({
  useRouter: () => ({ path: "/business/crm", navigate: vi.fn() }),
  Link: ({ to, children, ...rest }: { to: string; children: React.ReactNode; [key: string]: unknown }) => (
    <a href={`#${to}`} {...rest}>
      {children}
    </a>
  ),
}));

const getCrmPermissions = vi.fn();
const listCrmAudit = vi.fn();

vi.mock("@/lib/api/crm", () => ({
  getCrmPermissions: (...a: unknown[]) => getCrmPermissions(...a),
  listCrmAudit: (...a: unknown[]) => listCrmAudit(...a),
}));

const { CrmHomePage } = await import("@/pages/business/crm/CrmHomePage");
const { CrmAuditPage, describeCrmAction } = await import("@/pages/business/crm/CrmAuditPage");

function makeEntry(overrides: Partial<CrmAuditEntry> = {}): CrmAuditEntry {
  return {
    id: "a1",
    actionType: "crm.lead.stage_changed",
    targetType: "crm_lead",
    targetId: "lead-1",
    oldValue: { stage: "new" },
    newValue: { stage: "paid" },
    occurredAt: "2026-03-01T10:00:00.000Z",
    actorId: "user-2",
    actorName: "Boris Agent",
    ...overrides,
  };
}

describe("Ce vede fiecare rol", () => {
  it("[blocant] „Jurnal” apare doar pentru cine are dreptul", async () => {
    getCrmPermissions.mockResolvedValue({ role: "teacher", permissions: ["leads.edit"] });

    render(<CrmHomePage />);

    await screen.findByRole("listitem", { name: /Accesează Pipeline/i });
    expect(screen.queryByRole("listitem", { name: /Accesează Jurnal/i })).not.toBeInTheDocument();
  });

  it("[normal] adminul îl vede", async () => {
    getCrmPermissions.mockResolvedValue({ role: "admin", permissions: ["leads.edit", "audit.view"] });

    render(<CrmHomePage />);

    expect(await screen.findByRole("listitem", { name: /Accesează Jurnal/i })).toBeInTheDocument();
  });
});

describe("Jurnalul", () => {
  it("[normal] codurile devin propoziții", () => {
    expect(describeCrmAction("crm.lead.stage_changed")).toBe("Lead mutat între etape");
    expect(describeCrmAction("crm.pipeline.deleted")).toBe("Pâlnie ștearsă");
    // O acțiune nouă se vede ca atare, nu dispare din jurnal.
    expect(describeCrmAction("crm.ceva.nou")).toBe("ceva.nou");
  });

  it("[blocant] rândul spune CINE, CE și din ce în ce", async () => {
    getCrmPermissions.mockResolvedValue({ role: "admin", permissions: ["audit.view"] });
    listCrmAudit.mockResolvedValue({ items: [makeEntry()] });

    render(<CrmAuditPage />);

    expect(await screen.findByText("Boris Agent")).toBeInTheDocument();
    expect(screen.getByText(/Lead mutat între etape/)).toBeInTheDocument();
    expect(screen.getByText(/stage: new → paid/)).toBeInTheDocument();
  });

  it("[blocant] fără drept, ecranul spune ce să ceară — nu arată o eroare roșie", async () => {
    getCrmPermissions.mockResolvedValue({ role: "teacher", permissions: [] });
    const err = Object.assign(new Error("forbidden"), { status: 403, code: "forbidden", body: {} });
    Object.setPrototypeOf(err, (await import("@/lib/api")).ApiError.prototype);
    listCrmAudit.mockRejectedValue(err);

    render(<CrmAuditPage />);

    expect(await screen.findByText("Jurnalul e pentru administratori")).toBeInTheDocument();
  });
});
