/**
 * PARVERIFY-001 — codul de verificare pe fișa cererii.
 *
 * Ce apără testele: cardul ăsta e singurul loc din aplicație de unde se poate RETRAGE un link
 * public care circulă pe hârtie. Două lucruri nu au voie să se strice — butoanele de retragere să
 * nu apară nimănui în afară de par_admin, și să nu se execute fără confirmare, fiindcă amândouă
 * invalidează exemplare deja tipărite și predate la audit.
 *
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ParVerifyCodeCard } from "../ParVerifyCodeCard";
import * as parApi from "@/lib/api/par";

const ISSUED = {
  issued: true,
  code: "K7M2-9QD4-3F8B-X2NV",
  url: "https://www.finflow.best/#/verificare/par/K7M29QD43F8BX2NV/3F9K2D7B",
  revokedAt: null,
  scanCount: 3,
  lastUsedAt: "2026-09-14T10:00:00.000Z",
};

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("ParVerifyCodeCard", () => {
  it("arată codul tipărit și linkul din spatele lui", async () => {
    vi.spyOn(parApi, "getParVerifyCode").mockResolvedValue(ISSUED);
    render(<ParVerifyCodeCard parId="p1" isAdmin={false} />);
    expect(await screen.findByText("K7M2-9QD4-3F8B-X2NV")).toBeTruthy();
    expect(screen.getByText("Deschide pagina de verificare").getAttribute("href")).toBe(ISSUED.url);
  });

  it("spune câte scanări a avut — semnalul că hârtia circulă", async () => {
    vi.spyOn(parApi, "getParVerifyCode").mockResolvedValue(ISSUED);
    render(<ParVerifyCodeCard parId="p1" isAdmin={false} />);
    expect(await screen.findByText(/3 scanări/)).toBeTruthy();
  });

  it("explică de ce nu există încă un cod, în loc să arate un gol", async () => {
    vi.spyOn(parApi, "getParVerifyCode").mockResolvedValue({ issued: false });
    render(<ParVerifyCodeCard parId="p1" isAdmin />);
    expect(await screen.findByText(/prima descărcare a formularului/)).toBeTruthy();
    expect(screen.queryByText("Retrage codul")).toBeNull();
  });

  it("nu arată retragerea cuiva care nu e par_admin", async () => {
    vi.spyOn(parApi, "getParVerifyCode").mockResolvedValue(ISSUED);
    render(<ParVerifyCodeCard parId="p1" isAdmin={false} />);
    await screen.findByText("K7M2-9QD4-3F8B-X2NV");
    expect(screen.queryByText("Retrage codul")).toBeNull();
    expect(screen.queryByText("Emite cod nou")).toBeNull();
  });

  it("nu retrage nimic dacă administratorul se răzgândește la confirmare", async () => {
    vi.spyOn(parApi, "getParVerifyCode").mockResolvedValue(ISSUED);
    const spy = vi.spyOn(parApi, "setParVerifyCode");
    vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<ParVerifyCodeCard parId="p1" isAdmin />);
    fireEvent.click(await screen.findByText("Retrage codul"));
    expect(spy).not.toHaveBeenCalled();
  });

  it("retrage după confirmare și reîncarcă starea", async () => {
    const get = vi.spyOn(parApi, "getParVerifyCode").mockResolvedValue(ISSUED);
    const set = vi.spyOn(parApi, "setParVerifyCode").mockResolvedValue({ revoked: true });
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<ParVerifyCodeCard parId="p1" isAdmin />);
    fireEvent.click(await screen.findByText("Retrage codul"));
    await waitFor(() => expect(set).toHaveBeenCalledWith("p1", "revoke"));
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
  });

  it("pe un cod retras nu mai oferă linkul, ci spune că hârtiile nu mai sunt verificabile", async () => {
    vi.spyOn(parApi, "getParVerifyCode").mockResolvedValue({
      ...ISSUED,
      revokedAt: "2026-09-14T12:00:00.000Z",
    });
    render(<ParVerifyCodeCard parId="p1" isAdmin />);
    expect(await screen.findByRole("alert")).toHaveProperty(
      "textContent",
      expect.stringContaining("nu mai pot fi verificate")
    );
    expect(screen.queryByText("Deschide pagina de verificare")).toBeNull();
  });
});
