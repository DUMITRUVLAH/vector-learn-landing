/**
 * NAV-02 — Facturare e un singur modul cu file. Filele trebuie să rămână în locul în care e omul:
 * din CRM, un click pe „e-Factura" nu are voie să-l arunce în meniul FinDesk.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const current = { path: "/business/fin/einvoices" };
vi.mock("@/router/HashRouter", () => ({
  Link: ({ children, to, ...rest }: { children: React.ReactNode; to: string; [key: string]: unknown }) => (
    <a href={`#${to}`} {...rest}>
      {children}
    </a>
  ),
  useRouter: () => ({ path: current.path, navigate: vi.fn() }),
}));

import { InvoicingTabs } from "../ModuleTabs";

describe("InvoicingTabs", () => {
  it("[blocant] în FinDesk: trei file, e-Factura aprinsă pe ruta ei", () => {
    current.path = "/business/fin/einvoices";
    render(<InvoicingTabs />);
    expect(screen.getByRole("link", { name: "e-Factura SFS" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Facturi" })).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("link", { name: "Cont de plată" })).toHaveAttribute("href", "#/business/fin/invoices/document");
  });

  it("[blocant] „Facturi” nu rămâne aprinsă pe fila Cont de plată (ruta ei e copilul listei)", () => {
    current.path = "/business/fin/invoices/document";
    render(<InvoicingTabs />);
    expect(screen.getByRole("link", { name: "Cont de plată" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Facturi" })).not.toHaveAttribute("aria-current");
  });

  it("[blocant] în CRM: filele duc la rutele CRM", () => {
    current.path = "/business/crm/facturi";
    render(<InvoicingTabs />);
    expect(screen.getByRole("link", { name: "Facturi" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "e-Factura SFS" })).toHaveAttribute("href", "#/business/crm/facturi/efactura");
    expect(screen.getByRole("link", { name: "Cont de plată" })).toHaveAttribute("href", "#/business/crm/facturi/cont-de-plata");
  });
});
