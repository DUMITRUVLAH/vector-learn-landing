/**
 * ParGuardPage — role-scoped access. A requestor must not see approver/finance/admin/onboarding
 * power UI even via direct URL; the default (no requiredRoles) allows any PAR role.
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { ParGuardPage } from "../ParGuardPage";
import * as parApi from "@/lib/api/par";

vi.mock("@/router/HashRouter", () => ({ useRouter: () => ({ navigate: vi.fn() }) }));

const CHILD = <div>PANOU SECRET</div>;

describe("ParGuardPage — requiredRoles", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("requestor is DENIED an admin-only section (requiredRoles=par_admin)", async () => {
    vi.spyOn(parApi, "getParMe").mockResolvedValue({ userId: "u1", tenantId: "t1", roles: ["requestor"] } as never);
    render(<ParGuardPage requiredRoles={["par_admin"]}>{CHILD}</ParGuardPage>);
    await waitFor(() => expect(screen.getByText(/Secțiune indisponibilă pentru rolul tău/i)).toBeInTheDocument());
    expect(screen.queryByText("PANOU SECRET")).not.toBeInTheDocument();
  });

  it("requestor is ALLOWED a default (any-role) section", async () => {
    vi.spyOn(parApi, "getParMe").mockResolvedValue({ userId: "u1", tenantId: "t1", roles: ["requestor"] } as never);
    render(<ParGuardPage>{CHILD}</ParGuardPage>);
    await waitFor(() => expect(screen.getByText("PANOU SECRET")).toBeInTheDocument());
  });

  it("par_admin IS allowed the admin-only section", async () => {
    vi.spyOn(parApi, "getParMe").mockResolvedValue({ userId: "u1", tenantId: "t1", roles: ["par_admin"] } as never);
    render(<ParGuardPage requiredRoles={["par_admin"]}>{CHILD}</ParGuardPage>);
    await waitFor(() => expect(screen.getByText("PANOU SECRET")).toBeInTheDocument());
  });

  it("approver IS allowed an approver-or-admin section", async () => {
    vi.spyOn(parApi, "getParMe").mockResolvedValue({ userId: "u1", tenantId: "t1", roles: ["approver"] } as never);
    render(<ParGuardPage requiredRoles={["approver", "par_admin"]}>{CHILD}</ParGuardPage>);
    await waitFor(() => expect(screen.getByText("PANOU SECRET")).toBeInTheDocument());
  });

  it("no PAR role at all → denied everywhere", async () => {
    vi.spyOn(parApi, "getParMe").mockResolvedValue({ userId: "u1", tenantId: "t1", roles: [] } as never);
    render(<ParGuardPage>{CHILD}</ParGuardPage>);
    await waitFor(() => expect(screen.getByText(/Nu ai acces la modulul PAR/i)).toBeInTheDocument());
  });
});
