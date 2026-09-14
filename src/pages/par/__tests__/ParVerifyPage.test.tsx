/**
 * PARVERIFY-001 — pagina publică de verificare a formularului PAR tipărit.
 *
 * Ce apără testele: ecranul ăsta se deschide de pe o hârtie, de către cineva care nu are cont și
 * de multe ori nici context. Trei lucruri nu au voie să se strice — omul trebuie să vadă codurile
 * ca să le compare cu rubricile `Signature`, trebuie să afle când hârtia NU mai corespunde, și
 * trebuie să poată introduce codul cu mâna, fiindcă adresa e tipărită pe formular.
 *
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ParVerifyPage } from "../ParVerifyPage";
import { VerifyError, type VerifyResult } from "@/lib/api/parVerify";
import * as api from "@/lib/api/parVerify";

const RESULT: VerifyResult = {
  valid: true,
  matchesPrinted: true,
  checkedAt: "2026-09-14T10:00:00.000Z",
  organization: "ATIC",
  par: {
    requestNo: "PAR-2026-0142",
    status: "approved",
    dateOfRequest: "2026-09-10T00:00:00.000Z",
    dateNeeded: null,
    requestedByName: "Dorina Harghel",
    requestorTitle: "Specialist achiziții",
    departmentName: "Achiziții",
    projectName: null,
    eventName: null,
    purpose: "Servicii de training",
    currency: "MDL",
    totalEstimatedCents: 700000,
    totalMdlCents: null,
    submittedAt: "2026-09-10T08:00:00.000Z",
    approvedAt: "2026-09-11T09:24:00.000Z",
    lineItems: [
      { description: "Training AI aplicat", quantity: 1, unit: "buc", unitPriceCents: 700000, lineTotalCents: 700000 },
    ],
    requestor: null,
    approvals: [
      {
        step: 1,
        name: "Ana Chirița",
        title: "Aprobator",
        decision: "approved",
        decidedAt: "2026-09-11T09:24:00.000Z",
        signatureCode: "99PV-9Q1M",
      },
      {
        step: 2,
        name: "Irina Oriol",
        title: "Aprobator",
        decision: "pending",
        decidedAt: null,
        signatureCode: null,
      },
    ],
  },
};

function goTo(hash: string) {
  window.location.hash = hash;
}

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  goTo("");
});

describe("ParVerifyPage", () => {
  it("arată codul fiecărei aprobări, ca să poată fi comparat cu rubrica Signature de pe hârtie", async () => {
    vi.spyOn(api, "verifyParDocument").mockResolvedValue(RESULT);
    goTo("/verificare/par/K7M29QD43F8BX2NV/3F9K2D7B");
    render(<ParVerifyPage />);
    expect(await screen.findByText("99PV-9Q1M")).toBeTruthy();
    expect(screen.getByText("Ana Chirița")).toBeTruthy();
    expect(screen.getByText("Training AI aplicat")).toBeTruthy();
  });

  it("trimite amprenta tipărită, altfel n-ar avea cu ce compara hârtia", async () => {
    const spy = vi.spyOn(api, "verifyParDocument").mockResolvedValue(RESULT);
    goTo("/verificare/par/K7M29QD43F8BX2NV/3F9K2D7B");
    render(<ParVerifyPage />);
    await waitFor(() => expect(spy).toHaveBeenCalledWith("K7M29QD43F8BX2NV", "3F9K2D7B"));
  });

  it("avertizează când documentul s-a schimbat de la tipărire", async () => {
    vi.spyOn(api, "verifyParDocument").mockResolvedValue({ ...RESULT, matchesPrinted: false });
    goTo("/verificare/par/K7M29QD43F8BX2NV/AAAAAAAA");
    render(<ParVerifyPage />);
    expect(await screen.findByRole("alert")).toHaveProperty(
      "textContent",
      expect.stringContaining("s-a schimbat")
    );
  });

  it("nu inventează o comparație pe o hârtie fără amprentă", async () => {
    vi.spyOn(api, "verifyParDocument").mockResolvedValue({ ...RESULT, matchesPrinted: null });
    goTo("/verificare/par/K7M29QD43F8BX2NV");
    render(<ParVerifyPage />);
    await screen.findByText("99PV-9Q1M");
    expect(screen.queryByText(/corespunde exact/)).toBeNull();
    expect(screen.queryByText(/s-a schimbat/)).toBeNull();
  });

  it("spune că un cod RETRAS a fost retras, nu că n-a existat", async () => {
    vi.spyOn(api, "verifyParDocument").mockRejectedValue(new VerifyError("revoked"));
    goTo("/verificare/par/K7M29QD43F8BX2NV/3F9K2D7B");
    render(<ParVerifyPage />);
    expect(await screen.findByText("Cod retras")).toBeTruthy();
  });

  it("fără cod în adresă cere unul — adresa e tipărită pe formular pentru cine nu poate scana", async () => {
    goTo("/verificare");
    render(<ParVerifyPage />);
    expect(await screen.findByLabelText("Cod de verificare")).toBeTruthy();
  });

  it("refuză un cod incomplet fără să mai întrebe serverul", async () => {
    const spy = vi.spyOn(api, "verifyParDocument");
    goTo("/verificare");
    render(<ParVerifyPage />);
    const input = await screen.findByLabelText("Cod de verificare");
    fireEvent.change(input, { target: { value: "K7M2-9QD4" } });
    fireEvent.click(screen.getByRole("button", { name: "Verifică" }));
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(spy).not.toHaveBeenCalled();
  });

  it("acceptă codul tastat cu cratime și litere mici", async () => {
    goTo("/verificare");
    render(<ParVerifyPage />);
    const input = await screen.findByLabelText("Cod de verificare");
    fireEvent.change(input, { target: { value: " k7m2-9qd4-3f8b-x2nv " } });
    fireEvent.click(screen.getByRole("button", { name: "Verifică" }));
    await waitFor(() => expect(window.location.hash).toContain("/verificare/par/K7M29QD43F8BX2NV"));
  });
});
