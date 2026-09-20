/**
 * CRM — ecranul de repartizare pe loturi.
 *
 * Testele nu verifică aspectul, ci promisiunile pe care ecranul le face managerului:
 *
 *  1. **nimic nu se scrie până la ultimul buton**, iar numărul de pe buton e cel venit de la
 *     server — nu unul recalculat în browser, care s-ar despărți tăcut de realitate;
 *  2. **numărul disponibil se vede înainte de decizie**, și se recalculează când se schimbă
 *     filtrul (altfel omul împarte 400 de contacte dintr-un segment care are 12);
 *  3. **ce nu s-a putut da se spune**, nu se ascunde într-un „gata".
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

beforeEach(() => {
  vi.clearAllMocks();
});

vi.mock("@/hooks/useBusinessSession", () => ({
  useBusinessSession: () => ({
    status: "authenticated",
    data: {
      user: { id: "sef", name: "Șeful", role: "owner" },
      tenant: { name: "CallCo", slug: "callco", appKind: "business" },
    },
    logout: vi.fn(),
    refresh: vi.fn(),
    error: null,
  }),
}));

vi.mock("@/hooks/useTeamMembers", () => ({
  useTeamMembers: () => ({
    members: [
      { id: "ana", fullName: "Ana Pop", email: "ana@callco.md", role: "manager" },
      { id: "bo", fullName: "Bo Rusu", email: "bo@callco.md", role: "manager" },
      // Un elev NU e agent de vânzări: nu trebuie să apară în lista de repartizare.
      { id: "elev", fullName: "Elev Test", email: "elev@callco.md", role: "student" },
    ],
    loading: false,
    error: null,
  }),
}));

vi.mock("@/router/HashRouter", () => ({
  useRouter: () => ({ path: "/business/crm/repartizare", navigate: vi.fn() }),
  Link: ({ to, children, ...rest }: { to: string; children: React.ReactNode; [key: string]: unknown }) => (
    <a href={`#${to}`} {...rest}>
      {children}
    </a>
  ),
}));

const previewCrmDistribution = vi.fn();
const runCrmDistribution = vi.fn();

vi.mock("@/lib/api/crmDistribution", () => ({
  previewCrmDistribution: (...a: unknown[]) => previewCrmDistribution(...a),
  runCrmDistribution: (...a: unknown[]) => runCrmDistribution(...a),
  getCrmLeadPool: vi.fn().mockResolvedValue({ pool: 0 }),
  // Setarea de întoarcere în rezervă (CC-7): ecranul o cere la montare.
  getCrmRecallSettings: vi.fn().mockResolvedValue({ enabled: false, days: 14, due: 0 }),
  setCrmRecallSettings: vi.fn().mockResolvedValue({ enabled: true, days: 14 }),
}));

vi.mock("@/lib/api/crm", () => ({
  listCrmPipelines: vi.fn().mockResolvedValue({
    items: [{ id: "p1", name: "Outreach", isDefault: true, orderIndex: 0 }],
  }),
  getCrmStages: vi.fn().mockResolvedValue({
    items: [{ key: "new", label: "Rezervă rece", color: "sky", orderIndex: 0 }],
  }),
  getCrmSegmentOptions: vi.fn().mockResolvedValue({
    industries: [],
    regions: [],
    sizes: [],
    products: [],
    consumption: null,
    tags: ["prioritar", "listă achiziționată"],
    customFields: [{ key: "cod_caen", label: "Cod CAEN", values: ["4711", "6201"] }],
  }),
  getCrmPermissions: vi.fn().mockResolvedValue({ role: "admin", permissions: ["assignment.manage"] }),
}));

import { CrmDistributionPage } from "@/pages/business/crm/CrmDistributionPage";

function plan(overrides: Record<string, unknown> = {}) {
  return {
    available: 500,
    requested: 0,
    allocations: [],
    remaining: 500,
    shortfall: 0,
    ...overrides,
  };
}

describe("Repartizarea pe loturi", () => {
  it("[blocant] arată câte contacte sunt disponibile înainte de orice decizie", async () => {
    previewCrmDistribution.mockResolvedValue(plan({ available: 500 }));

    render(<CrmDistributionPage />);

    expect(await screen.findByText("500")).toBeInTheDocument();
  });

  it("[blocant] agenții primesc câmp de număr; elevii nu apar în listă", async () => {
    previewCrmDistribution.mockResolvedValue(plan());
    render(<CrmDistributionPage />);

    expect(await screen.findByLabelText("Câte contacte primește Ana Pop")).toBeInTheDocument();
    expect(screen.getByLabelText("Câte contacte primește Bo Rusu")).toBeInTheDocument();
    expect(screen.queryByLabelText("Câte contacte primește Elev Test")).not.toBeInTheDocument();
  });

  it("[blocant] previzualizarea NU repartizează; butonul care scrie apare abia după ea", async () => {
    previewCrmDistribution.mockResolvedValue(plan());
    render(<CrmDistributionPage />);

    fireEvent.change(await screen.findByLabelText("Câte contacte primește Ana Pop"), {
      target: { value: "200" },
    });

    // Până la previzualizare nu există niciun buton care scrie.
    expect(screen.queryByRole("button", { name: /^Repartizează/ })).not.toBeInTheDocument();

    previewCrmDistribution.mockResolvedValue(
      plan({
        requested: 200,
        allocations: [{ userId: "ana", name: "Ana Pop", requested: 200, given: 200 }],
        remaining: 300,
      })
    );
    fireEvent.click(screen.getByRole("button", { name: "Vezi ce se va întâmpla" }));

    expect(await screen.findByRole("button", { name: /Repartizează 200 contacte/ })).toBeInTheDocument();
    expect(runCrmDistribution).not.toHaveBeenCalled();
  });

  it("[blocant] numărul de pe buton e cel al SERVERULUI, nu cel cerut de om", async () => {
    // Serverul spune că din 400 cerute are doar 137: butonul trebuie să scrie 137.
    previewCrmDistribution.mockResolvedValue(plan({ available: 137 }));
    render(<CrmDistributionPage />);

    fireEvent.change(await screen.findByLabelText("Câte contacte primește Ana Pop"), {
      target: { value: "400" },
    });

    previewCrmDistribution.mockResolvedValue(
      plan({
        available: 137,
        requested: 400,
        allocations: [{ userId: "ana", name: "Ana Pop", requested: 400, given: 137 }],
        remaining: 0,
        shortfall: 263,
      })
    );
    fireEvent.click(screen.getByRole("button", { name: "Vezi ce se va întâmpla" }));

    expect(await screen.findByRole("button", { name: /Repartizează 137 contacte/ })).toBeInTheDocument();
    // Și lipsa se spune, nu se ascunde.
    expect(screen.getByText(/263 din contactele cerute n-au de unde veni/)).toBeInTheDocument();
  });

  it("repartizarea trimite alocările și raportează rezultatul", async () => {
    previewCrmDistribution.mockResolvedValue(plan({ available: 500 }));
    render(<CrmDistributionPage />);

    fireEvent.change(await screen.findByLabelText("Câte contacte primește Ana Pop"), { target: { value: "200" } });
    fireEvent.change(screen.getByLabelText("Câte contacte primește Bo Rusu"), { target: { value: "150" } });

    previewCrmDistribution.mockResolvedValue(
      plan({
        allocations: [
          { userId: "ana", name: "Ana Pop", requested: 200, given: 200 },
          { userId: "bo", name: "Bo Rusu", requested: 150, given: 150 },
        ],
        remaining: 150,
      })
    );
    fireEvent.click(screen.getByRole("button", { name: "Vezi ce se va întâmpla" }));

    runCrmDistribution.mockResolvedValue(
      plan({
        ok: true,
        allocations: [
          { userId: "ana", name: "Ana Pop", requested: 200, given: 200 },
          { userId: "bo", name: "Bo Rusu", requested: 150, given: 150 },
        ],
        remaining: 150,
      })
    );
    fireEvent.click(await screen.findByRole("button", { name: /Repartizează 350 contacte/ }));

    await waitFor(() => expect(runCrmDistribution).toHaveBeenCalled());
    const sent = runCrmDistribution.mock.calls[0][0] as { allocations: { userId: string; count: number }[] };
    expect(sent.allocations).toEqual([
      { userId: "ana", count: 200 },
      { userId: "bo", count: 150 },
    ]);

    expect(await screen.findByText("Repartizat")).toBeInTheDocument();
  });

  it("[blocant] schimbarea filtrului invalidează planul vechi", async () => {
    // Un plan calculat pe „toată baza", lăsat pe ecran după ce omul a restrâns segmentul, e
    // exact tipul de număr în care se are încredere pe nedrept.
    previewCrmDistribution.mockResolvedValue(plan({ available: 500 }));
    render(<CrmDistributionPage />);

    fireEvent.change(await screen.findByLabelText("Câte contacte primește Ana Pop"), { target: { value: "50" } });
    previewCrmDistribution.mockResolvedValue(
      plan({ allocations: [{ userId: "ana", name: "Ana Pop", requested: 50, given: 50 }], remaining: 450 })
    );
    fireEvent.click(screen.getByRole("button", { name: "Vezi ce se va întâmpla" }));
    expect(await screen.findByRole("button", { name: /Repartizează 50 contacte/ })).toBeInTheDocument();

    previewCrmDistribution.mockResolvedValue(plan({ available: 12 }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Doar contactele fără responsabil/ }));

    await waitFor(() =>
      expect(screen.queryByRole("button", { name: /Repartizează 50 contacte/ })).not.toBeInTheDocument()
    );
  });
});

describe("Manual sau automat", () => {
  it("[blocant] modul automat cere agenți bifați și o strategie, nu numere scrise de mână", async () => {
    previewCrmDistribution.mockResolvedValue(plan({ available: 500 }));
    render(<CrmDistributionPage />);

    fireEvent.click(await screen.findByRole("button", { name: "Automat" }));

    // Câmpurile de număr dispar; apar bifele.
    expect(screen.queryByLabelText("Câte contacte primește Ana Pop")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox", { name: /Ana Pop/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Bo Rusu/ }));

    previewCrmDistribution.mockResolvedValue(
      plan({
        allocations: [
          { userId: "ana", name: "Ana Pop", requested: 250, given: 250 },
          { userId: "bo", name: "Bo Rusu", requested: 250, given: 250 },
        ],
        remaining: 0,
      })
    );
    fireEvent.click(screen.getByRole("button", { name: "Vezi ce se va întâmpla" }));

    await waitFor(() => expect(previewCrmDistribution).toHaveBeenCalled());
    const sent = previewCrmDistribution.mock.calls.at(-1)![0] as {
      mode: string;
      userIds: string[];
      strategy: string;
    };
    expect(sent.mode).toBe("auto");
    expect(sent.userIds.sort()).toEqual(["ana", "bo"]);
    expect(sent.strategy).toBe("round_robin");
  });

  it("[blocant] strategia aleasă pleacă la server, cu explicația ei pe ecran", async () => {
    previewCrmDistribution.mockResolvedValue(plan());
    render(<CrmDistributionPage />);

    fireEvent.click(await screen.findByRole("button", { name: "Automat" }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Ana Pop/ }));
    fireEvent.change(screen.getByLabelText("Cum împarte"), { target: { value: "capacity" } });

    // Omul trebuie să afle CE face strategia, fără să ghicească din nume.
    expect(screen.getByText(/norma zilnică/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Vezi ce se va întâmpla" }));
    await waitFor(() => {
      const sent = previewCrmDistribution.mock.calls.at(-1)![0] as { strategy: string };
      expect(sent.strategy).toBe("capacity");
    });
  });

  it("[blocant] eticheta se alege dintr-un click și ajunge în filtrul cererii", async () => {
    // Motivul principal pentru care cineva deschide ecranul: „dă-i lui Ana doar retailul".
    previewCrmDistribution.mockResolvedValue(plan({ available: 500 }));
    render(<CrmDistributionPage />);

    fireEvent.click(await screen.findByRole("button", { name: "prioritar" }));

    await waitFor(() => {
      const sent = previewCrmDistribution.mock.calls.at(-1)![0] as { filters: Record<string, string> };
      expect(sent.filters.tag).toBe("prioritar");
    });
  });
});
