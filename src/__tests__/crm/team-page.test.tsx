/**
 * CRM — ecranul „Echipă": invitația pleacă cu rolul ales și linkul se vede (merge și fără email),
 * iar scoaterea din CRM cere confirmare și cheamă ruta reală. Ce nu-i al administratorului
 * (propriul rând, un manager care doar privește) nu are butoane.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import type { CrmTeamResponse } from "@/lib/api/crm";

beforeEach(() => {
  vi.clearAllMocks();
});

vi.mock("@/hooks/useBusinessSession", () => ({
  useBusinessSession: () => ({
    status: "authenticated",
    data: { user: { id: "u-admin", name: "Admin", role: "admin" }, tenant: { name: "Ecosolar", slug: "eco", appKind: "business" } },
    logout: vi.fn(),
    refresh: vi.fn(),
    error: null,
  }),
}));

vi.mock("@/router/HashRouter", () => ({
  useRouter: () => ({ path: "/business/crm/echipa", navigate: vi.fn() }),
  Link: ({ to, children, ...rest }: { to: string; children: React.ReactNode; [key: string]: unknown }) => (
    <a href={`#${to}`} {...rest}>{children}</a>
  ),
}));

const getCrmTeam = vi.fn();
const inviteCrmTeamMember = vi.fn();
const setCrmTeamMemberAccess = vi.fn();

vi.mock("@/lib/api/crm", () => ({
  getCrmPermissions: vi.fn().mockResolvedValue({ role: "admin", permissions: ["crm.access", "audit.view"] }),
  getCrmTeam: (...a: unknown[]) => getCrmTeam(...a),
  inviteCrmTeamMember: (...a: unknown[]) => inviteCrmTeamMember(...a),
  revokeCrmTeamInvite: vi.fn(),
  setCrmTeamMemberRole: vi.fn(),
  setCrmTeamMemberAccess: (...a: unknown[]) => setCrmTeamMemberAccess(...a),
  setCrmTeamMemberActive: vi.fn(),
}));

const { CrmTeamPage } = await import("@/pages/business/crm/CrmTeamPage");

const ROLES: CrmTeamResponse["roles"] = [
  { key: "receptionist", label: "Operator" },
  { key: "teacher", label: "Agent vânzări" },
  { key: "manager", label: "Manager vânzări" },
  { key: "admin", label: "Administrator" },
];

function team(canManage = true): CrmTeamResponse {
  return {
    canManage,
    roles: ROLES,
    members: [
      { id: "u-admin", name: "Admin", email: "admin@eco.md", role: "admin", isActive: true, crmAccess: true, isSelf: true },
      { id: "u-maria", name: "Maria Pop", email: "maria@eco.md", role: "teacher", isActive: true, crmAccess: true, isSelf: false },
    ],
    invites: [],
  };
}

describe("Ecranul Echipă", () => {
  it("[blocant] invitația pleacă cu emailul și rolul alese, iar linkul apare pe ecran", async () => {
    getCrmTeam.mockResolvedValue(team());
    inviteCrmTeamMember.mockResolvedValue({
      id: "i1",
      email: "ion@eco.md",
      role: "manager",
      inviteUrl: "https://app/#/business/invite?token=abc",
      emailed: false,
    });

    render(<CrmTeamPage />);
    await screen.findByText("Maria Pop");

    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "ion@eco.md" } });
    fireEvent.change(screen.getByLabelText("Rol"), { target: { value: "manager" } });
    fireEvent.click(screen.getByRole("button", { name: /Invită/ }));

    await waitFor(() => expect(inviteCrmTeamMember).toHaveBeenCalledWith({ email: "ion@eco.md", role: "manager" }));
    expect(await screen.findByDisplayValue("https://app/#/business/invite?token=abc")).toBeInTheDocument();
    expect(screen.getByText(/Emailul nu s-a trimis/)).toBeInTheDocument();
  });

  it("[blocant] „Scoate din CRM” cere confirmare și abia apoi cheamă ruta", async () => {
    getCrmTeam.mockResolvedValue(team());
    setCrmTeamMemberAccess.mockResolvedValue({ ok: true });

    render(<CrmTeamPage />);
    const row = (await screen.findByText("Maria Pop")).closest("tr")!;
    fireEvent.click(within(row).getByRole("button", { name: "Scoate din CRM" }));
    expect(setCrmTeamMemberAccess).not.toHaveBeenCalled();

    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Scoate din CRM" }));
    await waitFor(() => expect(setCrmTeamMemberAccess).toHaveBeenCalledWith("u-maria", false));
  });

  it("[normal] propriul rând n-are butoane; un manager doar vede lista", async () => {
    getCrmTeam.mockResolvedValue(team());
    const { unmount } = render(<CrmTeamPage />);
    const self = (await screen.findByText("(tu)")).closest("tr")!;
    expect(within(self).queryByRole("button")).toBeNull();
    unmount();

    getCrmTeam.mockResolvedValue(team(false));
    render(<CrmTeamPage />);
    await screen.findByText("Maria Pop");
    expect(screen.queryByRole("button", { name: /Invită/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Scoate din CRM" })).toBeNull();
  });
});
