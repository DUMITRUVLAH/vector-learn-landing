/**
 * §13 Documente — anexele standard din formularul PAR.
 *
 *   1. [blocant] dropdown-ul „Tip document" conține factura fiscală, contractul, actul de
 *      predare-primire, lista de participanți, raportul narativ și livrabilele.
 *   2. [blocant] „Alt document" cere numele documentului: câmpul apare, iar upload-ul e
 *      blocat până e completat — altfel dosarul rămâne cu eticheta generică.
 *
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ParCreateForm } from "../ParCreateForm";
import { attachmentKindLabel } from "@/lib/par/attachmentKinds";
import * as parApi from "@/lib/api/par";

vi.mock("@/router/HashRouter", () => ({
  useRouter: () => ({ path: "/business/par/new", navigate: vi.fn() }),
}));
vi.mock("@/hooks/useSession", () => ({
  useSession: () => ({
    data: { user: { id: "u-1", name: "Test User", email: "t@vector.md", role: "member" }, tenant: { id: "t-1", name: "ATIC" } },
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
}

describe("attachmentKindLabel", () => {
  it("[blocant] „Altul” afișează numele scris de utilizator, nu eticheta generică", () => {
    expect(attachmentKindLabel("other", "Certificat de conformitate")).toBe("Certificat de conformitate");
    expect(attachmentKindLabel("other", "   ")).toBe("Alt document");
    expect(attachmentKindLabel("other")).toBe("Alt document");
  });

  it("tipurile noi au etichete în română", () => {
    expect(attachmentKindLabel("participants_list")).toBe("Listă de participanți");
    expect(attachmentKindLabel("narrative_report")).toBe("Raport narativ");
    expect(attachmentKindLabel("deliverables")).toBe("Livrabile");
    expect(attachmentKindLabel("invoice")).toBe("Factură fiscală");
  });

  it("un tip necunoscut se afișează ca atare (nu 'undefined')", () => {
    expect(attachmentKindLabel("ceva_nou")).toBe("ceva_nou");
  });
});

describe("ParCreateForm §13 — tipuri de document", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("[blocant] dropdown-ul conține toate anexele standard din formular", async () => {
    mockConfigApis();
    render(<ParCreateForm />);

    const select = (await screen.findByLabelText("Tip document")) as HTMLSelectElement;
    const labels = Array.from(select.options).map((o) => o.textContent);
    expect(labels).toEqual([
      "Factură fiscală",
      "Contract",
      "Act de predare-primire",
      "Listă de participanți",
      "Raport narativ",
      "Livrabile",
      "Ofertă / Deviz",
      "Ordin de plată",
      "Formular PAR (PDF)",
      "Alt document",
    ]);
  });

  it("[blocant] „Alt document” cere numele documentului înainte de upload", async () => {
    mockConfigApis();
    render(<ParCreateForm />);

    const select = (await screen.findByLabelText("Tip document")) as HTMLSelectElement;
    expect(screen.queryByLabelText(/ce document este/i)).toBeNull();

    fireEvent.change(select, { target: { value: "other" } });
    const nameInput = (await screen.findByLabelText(/ce document este/i)) as HTMLInputElement;
    const fileInput = screen.getByLabelText("Alege fișierele") as HTMLInputElement;
    expect(fileInput.disabled).toBe(true);

    fireEvent.change(nameInput, { target: { value: "Certificat de conformitate" } });
    expect(fileInput.disabled).toBe(false);
  });
});
