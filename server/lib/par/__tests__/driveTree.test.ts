/**
 * PAR-DRIVE: arborele de mape din Drive trebuie să fie ACELAȘI cu cel din ecranul de foldere.
 * Dacă testul ăsta pică, cineva care deschide Drive-ul nu-și mai recunoaște mapele.
 */
import { describe, it, expect } from "vitest";
import {
  ancestorKeys,
  driveFolderPathFor,
  NO_PROJECT_LABEL,
  PAID_FOLDER_LABEL,
  sanitizeFolderName,
} from "../driveTree";

describe("driveFolderPathFor", () => {
  it("proiect fără eveniment → Proiect / Plătite", () => {
    const path = driveFolderPathFor({
      projectId: "11111111-1111-1111-1111-111111111111",
      projectName: "Erasmus 2026",
      eventId: null,
      eventName: null,
    });
    expect(path.segments).toEqual(["Erasmus 2026", PAID_FOLDER_LABEL]);
    expect(path.pathKey).toBe("proj:11111111-1111-1111-1111-111111111111|ev:none|bucket:paid");
  });

  it("cu eveniment → Proiect / Eveniment / Plătite", () => {
    const path = driveFolderPathFor({
      projectId: "p-1",
      projectName: "Erasmus 2026",
      eventId: "e-1",
      eventName: "Conferința de toamnă",
    });
    expect(path.segments).toEqual(["Erasmus 2026", "Conferința de toamnă", PAID_FOLDER_LABEL]);
  });

  it("fără proiect → aceeași etichetă ca în aplicație", () => {
    const path = driveFolderPathFor({ projectId: null, projectName: null, eventId: null, eventName: null });
    expect(path.segments[0]).toBe(NO_PROJECT_LABEL);
    expect(path.pathKey).toBe("proj:none|ev:none|bucket:paid");
  });

  it("[blocant] cheia ține de ID, nu de nume — redenumirea proiectului nu creează o mapă nouă", () => {
    const before = driveFolderPathFor({ projectId: "p-1", projectName: "Erasmus", eventId: null, eventName: null });
    const after = driveFolderPathFor({ projectId: "p-1", projectName: "Erasmus+ 2026", eventId: null, eventName: null });
    expect(after.pathKey).toBe(before.pathKey);
  });

  it("proiectul fără nume primește o etichetă derivată din ID, nu o mapă goală", () => {
    const path = driveFolderPathFor({
      projectId: "abcdef12-3456-7890-abcd-ef1234567890",
      projectName: null,
      eventId: null,
      eventName: null,
    });
    expect(path.segments[0]).toBe("Proiect abcdef12");
  });
});

describe("sanitizeFolderName", () => {
  it("bara de directoare nu are ce căuta într-un nume de mapă", () => {
    expect(sanitizeFolderName("Buget 2026/2027", "x")).toBe("Buget 2026-2027");
  });

  it("numele gol cade pe rezervă", () => {
    expect(sanitizeFolderName("   ", "Rezervă")).toBe("Rezervă");
    expect(sanitizeFolderName(null, "Rezervă")).toBe("Rezervă");
  });

  it("taie numele foarte lungi, dar păstrează diacriticele", () => {
    const out = sanitizeFolderName("Ș".repeat(300), "x");
    expect(out.length).toBeLessThanOrEqual(120);
    expect(out.startsWith("Ș")).toBe(true);
  });
});

describe("ancestorKeys", () => {
  it("dă câte o cheie pentru fiecare nivel de mapă", () => {
    const path = driveFolderPathFor({ projectId: "p-1", projectName: "P", eventId: "e-1", eventName: "E" });
    const keys = ancestorKeys(path);
    expect(keys).toHaveLength(path.segments.length);
    expect(keys[0]).toBe("proj:p-1");
    expect(keys[1]).toBe("proj:p-1|ev:e-1");
    expect(keys[2]).toBe(path.pathKey);
  });

  it("fără eveniment sar nivelul, ca să nu apară o mapă intermediară fantomă", () => {
    const path = driveFolderPathFor({ projectId: "p-1", projectName: "P", eventId: null, eventName: null });
    const keys = ancestorKeys(path);
    expect(keys).toHaveLength(2);
    expect(keys).toEqual(["proj:p-1", "proj:p-1|ev:none|bucket:paid"]);
  });
});
