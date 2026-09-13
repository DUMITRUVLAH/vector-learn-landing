/**
 * §13 Documente — ce vede omul între „am ales fișierul" și „e gata".
 *
 * Regresia pe care o blochează (owner, 13.09.2026): „is your document uploaded or not?".
 * `finalize` ținea răspunsul până termina analiza AI (5–10 s), iar rândul din listă apărea abia
 * după. Pe ecran nu se schimba nimic, deci încărcarea nu se distingea de o încărcare picată.
 *
 * Acum sunt trei stări, fiecare spusă în clar:
 *   1. fișierul urcă      → rând propriu, „Se încarcă în dosar…";
 *   2. fișierul E în dosar, analiza încă rulează → „Atașat. AI-ul compară…";
 *   3. analiza a răspuns (sau a picat) → verdictul, respectiv un avertisment că NU s-a comparat.
 *
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ParCreateForm } from "../ParCreateForm";
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

const ATTACHMENT = {
  id: "att-1",
  parId: "par-1",
  fileName: "contract.pdf",
  kind: "contract",
  kindOther: null,
  uploadedBy: "u-1",
  createdAt: new Date().toISOString(),
  analysis: null,
} as unknown as parApi.ParAttachment;

function mockConfigApis() {
  vi.spyOn(parApi, "listDepartments").mockResolvedValue({ items: [] });
  vi.spyOn(parApi, "listProjects").mockResolvedValue({ items: [] as never });
  vi.spyOn(parApi, "listEvents").mockResolvedValue({ events: [] as never });
  vi.spyOn(parApi, "listBudgetCodes").mockResolvedValue({ items: [] });
  vi.spyOn(parApi, "listVendors").mockResolvedValue({ items: [] });
  vi.spyOn(parApi, "listParTemplates").mockResolvedValue({ templates: [] });
  vi.spyOn(parApi, "createPar").mockResolvedValue({ id: "par-1", status: "draft" } as never);
  vi.spyOn(parApi, "updatePar").mockResolvedValue({ id: "par-1", status: "draft" } as never);
}

/** O promisiune pe care testul o rezolvă când vrea — altfel starea intermediară trece prea repede. */
function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

async function pickFile() {
  const input = (await screen.findByLabelText("Alege fișierele")) as HTMLInputElement;
  const file = new File(["%PDF-1.4"], "contract.pdf", { type: "application/pdf" });
  fireEvent.change(input, { target: { files: [file] } });
}

describe("ParCreateForm §13 — starea încărcării e vizibilă", () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it("[blocant] fișierul apare ca atașat înainte să vină verdictul AI", async () => {
    mockConfigApis();
    const upload = deferred<parApi.ParAttachment>();
    const reconcile = deferred<{ analysis: parApi.ParAttachmentAnalysis }>();
    vi.spyOn(parApi, "uploadAttachmentDirect").mockReturnValue(upload.promise);
    vi.spyOn(parApi, "reconcileAttachment").mockReturnValue(reconcile.promise as never);

    render(<ParCreateForm />);
    await pickFile();

    // 1. cât urcă — rândul lui, cu numele fișierului.
    expect(await screen.findByText("Se încarcă în dosar…")).toBeTruthy();

    // 2. a ajuns în dosar; analiza încă rulează — dar fișierul e deja confirmat.
    upload.resolve(ATTACHMENT);
    expect(await screen.findByText(/AI-ul compară documentul cu cererea/i)).toBeTruthy();
    expect(screen.getByText("contract.pdf")).toBeTruthy();
    expect(screen.queryByText("Se încarcă în dosar…")).toBeNull();

    // 3. verdictul înlocuiește starea de așteptare.
    reconcile.resolve({
      analysis: {
        status: "match",
        warnings: 0,
        analyzedAt: new Date().toISOString(),
        checks: [{ field: "sumă", expected: 1000, found: 1000, matches: true }],
      } as unknown as parApi.ParAttachmentAnalysis,
    });
    await waitFor(() => expect(screen.getByText(/document concordant cu cererea/i)).toBeTruthy());
    expect(screen.queryByText(/AI-ul compară documentul cu cererea/i)).toBeNull();
  });

  it("[blocant] când analiza pică, fișierul rămâne atașat — dar se spune că NU a fost comparat", async () => {
    mockConfigApis();
    vi.spyOn(parApi, "uploadAttachmentDirect").mockResolvedValue(ATTACHMENT);
    vi.spyOn(parApi, "reconcileAttachment").mockRejectedValue(new Error("analysis_unavailable"));

    render(<ParCreateForm />);
    await pickFile();

    expect(await screen.findByText(/Verificarea AI nu a răspuns/i)).toBeTruthy();
    expect(screen.getByText("contract.pdf")).toBeTruthy();
  });
});
