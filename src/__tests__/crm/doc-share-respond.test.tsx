/**
 * CRM-D06 — pagina publică a actului: clientul acceptă sau refuză, fără cont.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const apiMock = vi.fn();
vi.mock("@/lib/api", () => ({ api: (...a: unknown[]) => apiMock(...a) }));

const { DocSharePage } = await import("@/pages/public/DocSharePage");

const DOC = {
  title: "Ofertă comercială — Medlife",
  kind: "oferta_comerciala",
  docNumber: "OF-2026-0001",
  docDate: "2026-09-25T00:00:00.000Z",
  status: "sent",
  counterpartyName: "Medlife Clinic SRL",
  totalCents: 29_000_00,
  currency: "MDL",
  bodyHtml: "<h1>Ofertă</h1><table><tr><td>Training</td></tr></table>",
  lines: [{ position: 1, description: "Training", unit: "buc", quantity: 1, unitPriceCents: 29_000_00, lineTotalCents: 29_000_00, vatPercent: 0 }],
  canRespond: true,
  response: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  window.location.hash = "#/act/11111111-1111-1111-1111-111111111111";
});

describe("CRM-D06 — răspunsul clientului", () => {
  it("[blocant] acceptarea cere numele și bifa, apoi trimite și confirmă", async () => {
    apiMock.mockImplementation((url: string) =>
      url.endsWith("/respond")
        ? Promise.resolve({ status: "signed", response: { decision: "accepted", name: "Tatiana Frunze", at: "2026-09-25T10:00:00.000Z" } })
        : Promise.resolve(DOC)
    );
    render(<DocSharePage />);
    const accept = await screen.findByRole("button", { name: /Accept oferta/ });
    expect(accept).toBeDisabled();
    await userEvent.type(screen.getByLabelText("Numele tău complet"), "Tatiana Frunze");
    expect(accept).toBeDisabled();
    await userEvent.click(screen.getByRole("checkbox"));
    await userEvent.click(accept);
    await waitFor(() => expect(apiMock).toHaveBeenCalledWith(expect.stringMatching(/\/respond$/), expect.anything()));
    const body = JSON.parse((apiMock.mock.calls.at(-1)?.[1] as { body: string }).body);
    expect(body).toMatchObject({ decision: "accept", name: "Tatiana Frunze" });
    expect(await screen.findByText("Documentul a fost acceptat")).toBeInTheDocument();
  });

  it("[blocant] refuzul cere un motiv", async () => {
    apiMock.mockResolvedValue(DOC);
    render(<DocSharePage />);
    await userEvent.click(await screen.findByRole("button", { name: "Refuz" }));
    await userEvent.type(screen.getByLabelText("Numele tău complet"), "Ion Popescu");
    expect(screen.getByRole("button", { name: /Trimite refuzul/ })).toBeDisabled();
    await userEvent.type(screen.getByLabelText("De ce refuzi?"), "Buget tăiat");
    expect(screen.getByRole("button", { name: /Trimite refuzul/ })).toBeEnabled();
  });

  it("[blocant] un act deja acceptat arată răspunsul, nu formularul", async () => {
    apiMock.mockResolvedValue({ ...DOC, canRespond: false, response: { decision: "accepted", name: "Tatiana", at: "2026-09-25T10:00:00.000Z" } });
    render(<DocSharePage />);
    expect(await screen.findByText("Documentul a fost acceptat")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Accept/ })).not.toBeInTheDocument();
  });

  it("[normal] tabelul pozițiilor nu apare de două ori când e deja în corpul actului", async () => {
    apiMock.mockResolvedValue(DOC);
    render(<DocSharePage />);
    await screen.findByRole("button", { name: /Accept oferta/ });
    expect(screen.getAllByRole("table")).toHaveLength(1);
  });
});
