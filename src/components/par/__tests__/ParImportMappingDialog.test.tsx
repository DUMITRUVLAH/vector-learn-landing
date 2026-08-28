/**
 * ParImportMappingDialog — the screen where the admin decides what each column is.
 *
 * The dialog exists because auto-detection alone lost a real client file; these tests lock in
 * that the user's choices (not the suggestions) are what leaves the dialog.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ParImportMappingDialog } from "../ParImportMappingDialog";
import type { ParConfigImportPreview } from "@/lib/api/par";

const preview: ParConfigImportPreview = {
  sheets: [
    {
      name: "Sheet1",
      headers: ["Cod", "Denumire", "Denumire proiect"],
      totalRows: 41,
      sampleRows: [
        ["1.1 Director/Project Manager (50%)", "1.1 Director/Project Manager (50%)", "LED 3/Youth Maker club"],
        ["1.2 Project Coordinator (100%)", "1.2 Project Coordinator (100%)", "LED 3/Youth Maker club"],
      ],
      detectedKind: "budgetCodes",
      suggestedKind: "budgetCodes",
      suggestedMapping: { code: "Cod", name: "Denumire", allocated: null, project: "Denumire proiect", payer: null },
    },
  ],
  fields: {
    payers: [
      { key: "name", label: "Denumire plătitor", required: true },
      { key: "legalName", label: "Denumire juridică", required: false },
      { key: "idno", label: "IDNO", required: false },
    ],
    projects: [
      { key: "name", label: "Denumire proiect", required: true },
      { key: "donor", label: "Donor / Finanțator", required: false },
      { key: "payer", label: "Plătitor / Organizație", required: false },
    ],
    departments: [{ key: "name", label: "Denumire departament", required: true }],
    budgetCodes: [
      { key: "code", label: "Cod", required: true },
      { key: "name", label: "Denumire", required: false },
      { key: "allocated", label: "Sumă alocată", required: false },
      { key: "currency", label: "Valută", required: false },
      { key: "project", label: "Proiect / Program", required: false },
      { key: "payer", label: "Plătitor / Organizație", required: false },
    ],
    vendors: [
      { key: "name", label: "Denumire beneficiar", required: true },
      { key: "iban", label: "IBAN", required: false },
    ],
    events: [
      { key: "name", label: "Denumire eveniment", required: true },
      { key: "project", label: "Proiect", required: false },
    ],
  },
  kindLabels: {
    payers: "Organizații plătitoare",
    projects: "Proiecte / Programe",
    events: "Evenimente",
    departments: "Departamente",
    budgetCodes: "Coduri bugetare",
    vendors: "Beneficiari / Furnizori",
  },
};

function setup(overrides: Partial<React.ComponentProps<typeof ParImportMappingDialog>> = {}) {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  render(
    <ParImportMappingDialog
      open
      preview={preview}
      fileName="LED.xlsx"
      onCancel={onCancel}
      onConfirm={onConfirm}
      {...overrides}
    />
  );
  return { onConfirm, onCancel };
}

const columnSelect = (header: string) => screen.getByLabelText(`Câmpul pentru coloana ${header}`);

describe("ParImportMappingDialog", () => {
  it("shows the sheet, its columns and sample values so the choice is informed", () => {
    setup();
    expect(screen.getByText(/Foaia „Sheet1"/)).toBeInTheDocument();
    expect(screen.getByText(/41 rânduri/)).toBeInTheDocument();
    expect(screen.getByText("Denumire proiect")).toBeInTheDocument();
    expect(screen.getAllByText("LED 3/Youth Maker club").length).toBeGreaterThan(0);
  });

  it("pre-selects the suggested mapping but leaves it editable", () => {
    setup();
    expect((columnSelect("Cod") as HTMLSelectElement).value).toBe("code");
    expect((columnSelect("Denumire") as HTMLSelectElement).value).toBe("name");
    expect((columnSelect("Denumire proiect") as HTMLSelectElement).value).toBe("project");
  });

  it("[blocant] sends the user's choices, not the suggestions", () => {
    const { onConfirm } = setup();
    // The admin decides "Denumire proiect" should not be imported at all.
    fireEvent.change(columnSelect("Denumire proiect"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Importă" }));

    expect(onConfirm).toHaveBeenCalledWith({
      sheets: [
        {
          name: "Sheet1",
          kind: "budgetCodes",
          columns: { code: "Cod", name: "Denumire", allocated: null, project: null, payer: null },
          options: { currency: "MDL" },
        },
      ],
    });
  });

  // Bugetul unui grant vine integral în EUR și fișierul nu are nicio coloană de valută — alegerea
  // de pe foaie trebuie să ajungă la server, altfel sumele s-ar salva ca lei (de ~20× mai mici).
  it("[blocant] trimite valuta aleasă pentru foaie", () => {
    const { onConfirm } = setup();
    fireEvent.change(screen.getByLabelText("Valuta sumelor din foaie"), { target: { value: "EUR" } });
    fireEvent.click(screen.getByRole("button", { name: "Importă" }));

    expect(onConfirm.mock.calls[0][0].sheets[0].options).toEqual({ currency: "EUR" });
  });

  it("never lets one column feed two fields", () => {
    const { onConfirm } = setup();
    // Point "Denumire proiect" at the same field "Denumire" already fills.
    fireEvent.change(columnSelect("Denumire proiect"), { target: { value: "name" } });
    fireEvent.click(screen.getByRole("button", { name: "Importă" }));

    const { columns } = onConfirm.mock.calls[0][0].sheets[0];
    expect(columns.name).toBe("Denumire proiect");
    expect(Object.values(columns).filter((v) => v === "Denumire")).toHaveLength(0);
  });

  it("changing the import type offers that type's fields", () => {
    setup();
    fireEvent.change(screen.getByLabelText("Importă ca"), { target: { value: "departments" } });
    const select = columnSelect("Cod") as HTMLSelectElement;
    expect([...select.options].map((o) => o.text)).toEqual(["— nu importa —", "Denumire departament *"]);
  });

  it("blocks the import while a required field has no column", () => {
    setup();
    fireEvent.change(columnSelect("Cod"), { target: { value: "" } });
    expect(screen.getByRole("button", { name: "Importă" })).toBeDisabled();
    expect(screen.getByText(/alege coloana pentru „Cod"/)).toBeInTheDocument();
  });

  it("can skip a sheet entirely", () => {
    setup();
    fireEvent.change(screen.getByLabelText("Importă ca"), { target: { value: "skip" } });
    expect(screen.getByText("Foaia este sărită.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Importă" })).toBeDisabled();
  });

  it("shows a spinner while the file is still being read", () => {
    render(
      <ParImportMappingDialog open preview={null} fileName="LED.xlsx" onCancel={vi.fn()} onConfirm={vi.fn()} />
    );
    expect(screen.getByText("Se citește fișierul...")).toBeInTheDocument();
  });
});
