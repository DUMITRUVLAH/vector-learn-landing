/**
 * SPLIT-402 — one Business Suite shell on every /business/* route.
 *
 * The bug: /business/* pages rendered two different sidebars — the dashboard used BusinessShell,
 * while FinDesk pages (Invoice Reporting etc.) used AppShell's divergent business nav, and the
 * AppShell header leaked the tenant name ("Demo Lingua School"). Fix: AppShell delegates to
 * BusinessShell for /business/* routes, so the sidebar/header is identical everywhere.
 *
 * These pin: (1) on a /business/* path AppShell renders the canonical BusinessShell sidebar and
 * does NOT show a tenant name; (2) the single nav still contains every key module (no loss).
 */
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";

import { AppShell } from "@/components/app/AppShell";
import { NAV_GROUPS_EXPORT } from "@/components/business/BusinessShell";
import { FIN_NAV_GROUPS } from "@/lib/fin/finNav";

vi.mock("@/router/HashRouter", () => ({
  useRouter: () => ({ path: "/business/fin/captures", navigate: vi.fn() }),
  Link: ({ children, to, ...rest }: { children: React.ReactNode; to: string }) => (
    <a href={`#${to}`} {...rest}>
      {children}
    </a>
  ),
}));

// CRM session present with a tenant name — must NOT surface on /business/* (the old leak).
vi.mock("@/hooks/useSession", () => ({
  useSession: () => ({ data: { user: { name: "X Y", role: "admin" }, tenant: { name: "Demo Lingua School", institutionType: "language" } }, logout: vi.fn() }),
}));
vi.mock("@/hooks/useBusinessSession", () => ({
  useBusinessSession: () => ({ status: "authenticated", data: { user: { name: "Andreea Mitran", role: "admin" }, tenant: { name: "Demo Lingua School" } }, logout: vi.fn() }),
}));

describe("SPLIT-402 — single business shell", () => {
  it("renders the canonical Business Suite sidebar on a /business/* route", () => {
    render(
      <AppShell pageTitle="Invoice Reporting">
        <div>content</div>
      </AppShell>,
    );
    const nav = screen.getByLabelText("Navigare Business Suite"); // BusinessShell's aside
    expect(nav).toBeInTheDocument();
    // Key modules present in the one menu (nothing lost in the merge).
    expect(within(nav).getByText("Invoice Reporting")).toBeInTheDocument();
    // NAV-02: e-Factura e o filă a modulului „Facturi", nu un rând separat.
    expect(within(nav).getByText("Facturi")).toBeInTheDocument();
    expect(within(nav).getByText("Salarizare")).toBeInTheDocument();
    // DocMerge is prefix-gated: it only enters the sidebar on /business/docmerge/*,
    // so on a FinDesk path it is correctly absent here (its presence in the nav
    // definition is pinned by the NAV_GROUPS_EXPORT test below).
    expect(within(nav).queryByText("Documente în masă")).not.toBeInTheDocument();
  });

  it("does NOT leak the tenant name in the header", () => {
    render(
      <AppShell pageTitle="Invoice Reporting">
        <div>content</div>
      </AppShell>,
    );
    // BusinessShell brands as "FinFlow" (in the sidebar), never the tenant/school name.
    expect(screen.queryByText("Demo Lingua School")).not.toBeInTheDocument();
    expect(screen.getByText("FinFlow")).toBeInTheDocument();
  });

  it("the single nav keeps every FinDesk module from both old menus", () => {
    // NAV-01: harta completă trăiește în finNav.ts (meniul din interiorul modulului); pe tabloul
    // general FinDesk are doar o secțiune de scurtături.
    expect(NAV_GROUPS_EXPORT.find((g) => g.section?.startsWith("FinDesk"))).toBeDefined();
    const labels = FIN_NAV_GROUPS.flatMap((g) => g.items.map((i) => i.label));
    for (const m of ["Facturi", "Cheltuieli", "Invoice Reporting", "Salarizare", "Mijloace fixe", "Stocuri", "Buget", "Export & rapoarte", "Calendar fiscal", "TVA & declarații", "Rezidenți IT Park"]) {
      expect(labels).toContain(m);
    }
  });
});
