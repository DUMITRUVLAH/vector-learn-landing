/**
 * CRM — ecranul de drepturi (cerința 60).
 *
 * Ce trebuie să fie adevărat: se VEDE de unde vine fiecare drept (rol sau excepție), iar un
 * click îl plimbă prin cele trei stări. Fără distincția rol/excepție, „de ce poate Maria asta?"
 * n-are răspuns.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { CrmTeamPermissionsResponse } from "@/lib/api/crm";

beforeEach(() => {
  vi.clearAllMocks();
});

vi.mock("@/hooks/useBusinessSession", () => ({
  useBusinessSession: () => ({
    status: "authenticated",
    data: { user: { id: "u1", name: "Admin", role: "owner" }, tenant: { name: "Ecosolar", slug: "eco", appKind: "business" } },
    logout: vi.fn(),
    refresh: vi.fn(),
    error: null,
  }),
}));

vi.mock("@/router/HashRouter", () => ({
  useRouter: () => ({ path: "/business/crm/drepturi", navigate: vi.fn() }),
  Link: ({ to, children, ...rest }: { to: string; children: React.ReactNode; [key: string]: unknown }) => (
    <a href={`#${to}`} {...rest}>{children}</a>
  ),
}));

const getCrmTeamPermissions = vi.fn();
const setCrmUserPermission = vi.fn();

vi.mock("@/lib/api/crm", () => ({
  getCrmPermissions: vi.fn().mockResolvedValue({ role: "admin", permissions: ["leads.view_all", "leads.view_own", "leads.edit", "leads.export", "reports.view_team", "documents.create", "products.manage", "pipelines.manage", "automations.manage", "assignment.manage", "cadences.manage", "audit.view"] }),
  getCrmTeamPermissions: (...a: unknown[]) => getCrmTeamPermissions(...a),
  setCrmUserPermission: (...a: unknown[]) => setCrmUserPermission(...a),
}));

const { CrmPermissionsPage } = await import("@/pages/business/crm/CrmPermissionsPage");

function makeTeam(overrides: { permission: string; granted: boolean }[] = []): CrmTeamPermissionsResponse {
  return {
    roleMatrix: {
      admin: ["leads.view_all", "leads.edit", "products.manage", "audit.view"],
      teacher: ["leads.view_all", "leads.edit"],
    } as never,
    members: [
      {
        id: "u-maria",
        name: "Maria Pop",
        email: "maria@eco.md",
        role: "teacher",
        overrides,
        effective: ["leads.view_all", "leads.edit"] as never,
      },
    ],
  };
}

describe("Ecranul de drepturi", () => {
  it("[blocant] se vede de unde vine dreptul: din rol vs. acordat anume", async () => {
    getCrmTeamPermissions.mockResolvedValue(makeTeam([{ permission: "products.manage", granted: true }]));

    render(<CrmPermissionsPage />);
    await screen.findByText("Maria Pop");

    // „Editează leaduri" vine din rolul de agent…
    expect(screen.getByLabelText("Editează leaduri pentru Maria Pop: din rol")).toBeInTheDocument();
    // …„Administrează produse" e o excepție scrisă pe ea.
    expect(screen.getByLabelText("Administrează produse pentru Maria Pop: acordat")).toBeInTheDocument();
    // Iar ce nu are, se vede ca atare.
    expect(screen.getByLabelText("Vede jurnalul pentru Maria Pop: nu poate")).toBeInTheDocument();
  });

  it("[blocant] click pe un drept din rol îl acordă explicit", async () => {
    getCrmTeamPermissions.mockResolvedValue(makeTeam());
    setCrmUserPermission.mockResolvedValue({ ok: true });

    render(<CrmPermissionsPage />);
    fireEvent.click(await screen.findByLabelText("Administrează produse pentru Maria Pop: nu poate"));

    await waitFor(() =>
      expect(setCrmUserPermission).toHaveBeenCalledWith({
        userId: "u-maria",
        permission: "products.manage",
        granted: true,
      })
    );
  });

  it("[blocant] al doilea click îl RETRAGE, al treilea îl readuce la rol", async () => {
    getCrmTeamPermissions.mockResolvedValue(makeTeam([{ permission: "leads.edit", granted: true }]));
    setCrmUserPermission.mockResolvedValue({ ok: true });

    render(<CrmPermissionsPage />);
    fireEvent.click(await screen.findByLabelText("Editează leaduri pentru Maria Pop: acordat"));
    await waitFor(() =>
      expect(setCrmUserPermission).toHaveBeenLastCalledWith({ userId: "u-maria", permission: "leads.edit", granted: false })
    );

    getCrmTeamPermissions.mockResolvedValue(makeTeam([{ permission: "leads.edit", granted: false }]));
    render(<CrmPermissionsPage />);
    const retras = await screen.findAllByLabelText("Editează leaduri pentru Maria Pop: retras");
    fireEvent.click(retras[0]);
    await waitFor(() =>
      expect(setCrmUserPermission).toHaveBeenLastCalledWith({ userId: "u-maria", permission: "leads.edit", granted: null })
    );
  });

  it("[normal] fără drept de administrare, ecranul spune ce să ceară", async () => {
    const err = Object.assign(new Error("forbidden"), { status: 403, code: "forbidden", body: {} });
    Object.setPrototypeOf(err, (await import("@/lib/api")).ApiError.prototype);
    getCrmTeamPermissions.mockRejectedValue(err);

    render(<CrmPermissionsPage />);

    expect(await screen.findByText("Ecranul e pentru administratori")).toBeInTheDocument();
  });
});
