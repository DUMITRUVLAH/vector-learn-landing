/**
 * DG-124 — dialogul de generare în masă.
 *
 * Cazul real: 40 de acte pentru participanții unui eveniment. Testele urmăresc drumul complet —
 * încarci tabelul, potrivirea coloanelor se propune singură, apeși o dată, iar rândurile stricate
 * sunt raportate pe poziția lor în loc să anuleze lotul.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const parseExcel = vi.fn();
vi.mock("@/lib/api/docmerge", () => ({
  parseExcel: (...a: unknown[]) => parseExcel(...a),
}));

const apiMock = vi.fn();
vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...actual, api: (...a: unknown[]) => apiMock(...a) };
});

const { BulkGenerateDialog } = await import("@/pages/business/docs/BulkGenerateDialog");

const TEMPLATES = [
  { id: "tpl-1", name: "Act de primire-predare", kind: "act_primire_predare", category: null, isSystem: true, version: 1, placeholders: [], updatedAt: "" },
];

beforeEach(() => {
  vi.clearAllMocks();
  parseExcel.mockResolvedValue({
    headers: ["Denumire participant", "Cod fiscal", "Suma"],
    sample: [],
    previewRows: [
      { "Denumire participant": "Ion Popescu", "Cod fiscal": "2001", Suma: "1500,00" },
      { "Denumire participant": "Maria Rusu", "Cod fiscal": "2002", Suma: "1500,00" },
    ],
    rowCount: 2,
  });
});

function upload() {
  const input = screen.getByLabelText("Tabelul (.xlsx)");
  const file = new File(["x"], "participanti.xlsx", {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  return userEvent.upload(input, file);
}

describe("DG-124 — generarea în masă", () => {
  it("[blocant] coloanele se potrivesc singure, iar lotul pleacă cu rândurile mapate", async () => {
    apiMock.mockResolvedValue({ created: [{ id: "1" }, { id: "2" }], failed: [] });
    render(<BulkGenerateDialog templates={TEMPLATES} onClose={vi.fn()} onDone={vi.fn()} />);

    await upload();
    await waitFor(() => expect(parseExcel).toHaveBeenCalled());

    // Potrivirea propusă: „Denumirea contrapărții" ← „Denumire participant".
    expect(await screen.findByLabelText(/Denumirea furnizorului/)).toHaveValue("Denumire participant");

    await userEvent.click(screen.getByRole("button", { name: /Generează 2 acte/ }));

    await waitFor(() => expect(apiMock).toHaveBeenCalledWith("/api/docs/bulk", expect.anything()));
    const body = JSON.parse((apiMock.mock.calls[0][1] as { body: string }).body) as {
      rows: Record<string, string>[];
    };
    expect(body.rows).toHaveLength(2);
    expect(body.rows[0]["contraparte.denumire"]).toBe("Ion Popescu");
    expect(body.rows[1]["contraparte.denumire"]).toBe("Maria Rusu");
  });

  it("[blocant] rândurile stricate se raportează pe poziția lor, lotul nu se pierde", async () => {
    apiMock.mockResolvedValue({
      created: [{ id: "1" }],
      failed: [{ row: 2, reason: "Lipsește denumirea contrapărții." }],
    });
    render(<BulkGenerateDialog templates={TEMPLATES} onClose={vi.fn()} onDone={vi.fn()} />);

    await upload();
    await userEvent.click(await screen.findByRole("button", { name: /Generează 2 acte/ }));

    expect(await screen.findByText(/S-au creat/)).toHaveTextContent("1");
    expect(screen.getByText(/Rândul 2: Lipsește denumirea contrapărții/)).toBeInTheDocument();
  });

  it("[blocant] fără coloana de denumire nu se poate genera — actul ar fi fără parte", async () => {
    render(<BulkGenerateDialog templates={TEMPLATES} onClose={vi.fn()} onDone={vi.fn()} />);
    await upload();

    const select = await screen.findByLabelText(/Denumirea furnizorului/);
    await userEvent.selectOptions(select, "");
    expect(screen.getByRole("button", { name: /Generează/ })).toBeDisabled();
  });

  it("[normal] un fișier ilizibil produce un mesaj, nu un ecran gol", async () => {
    parseExcel.mockRejectedValue(new Error("bad file"));
    render(<BulkGenerateDialog templates={TEMPLATES} onClose={vi.fn()} onDone={vi.fn()} />);
    await upload();

    expect(await screen.findByRole("alert")).toHaveTextContent(/nu a putut fi citit/);
  });
});
