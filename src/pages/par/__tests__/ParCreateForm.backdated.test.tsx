/**
 * Data cererii pusă în trecut — owner, 2026-08-29. Backdating-ul rămâne permis (regularizările
 * există), dar cine îl face trebuie să afle, pe loc, că aprobatorul și finanțele văd același semn.
 *
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { ParCreateForm } from "../ParCreateForm";
import * as parApi from "@/lib/api/par";

vi.mock("@/router/HashRouter", () => ({
  useRouter: () => ({ path: "/business/par/new", navigate: vi.fn() }),
}));
vi.mock("@/hooks/useSession", () => ({
  useSession: () => ({
    data: {
      user: { id: "u-1", name: "Test User", email: "t@vector.md", role: "manager" },
      tenant: { id: "t-1", name: "ATIC" },
    },
  }),
}));
vi.mock("@/components/app/AppShell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

function mockConfigApis() {
  vi.spyOn(parApi, "listDepartments").mockResolvedValue({ items: [] });
  vi.spyOn(parApi, "listProjects").mockResolvedValue({ items: [] as never });
  vi.spyOn(parApi, "listEvents").mockResolvedValue({ events: [] as never });
  vi.spyOn(parApi, "listBudgetCodes").mockResolvedValue({ items: [] });
  vi.spyOn(parApi, "listVendors").mockResolvedValue({ items: [] });
  vi.spyOn(parApi, "listParTemplates").mockResolvedValue({ templates: [] });
  vi.spyOn(parApi, "getLineItemSuggestions").mockResolvedValue({ suggestions: [], total: 0 });
}

const daysAgo = (n: number) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
};

describe("ParCreateForm — dată a cererii din trecut", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockConfigApis();
  });

  it("formularul deschis azi nu afișează niciun avertisment", async () => {
    render(<ParCreateForm />);
    await screen.findByLabelText(/data cererii/i);
    expect(screen.queryByText(/dată retroactivă/i)).not.toBeInTheDocument();
  });

  it("[blocant] o dată pusă în urmă avertizează și spune CINE va vedea semnul", async () => {
    render(<ParCreateForm />);
    const dor = await screen.findByLabelText(/data cererii/i);
    fireEvent.change(dor, { target: { value: daysAgo(5) } });

    await waitFor(() => {
      expect(screen.getByText(/dată retroactivă · 5 zile/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/aprobatorul și finanțele/i)).toBeInTheDocument();
  });
});
