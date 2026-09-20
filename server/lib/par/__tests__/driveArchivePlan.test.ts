/**
 * PAR-DRIVE: regulile arhivei periodice — partea pură, fără Drive și fără DB.
 *
 * Ce apără testul: intervalul (owner-ul a cerut 2 săptămâni, nu „când se nimerește") și manifestul,
 * care e singura dovadă că o copie n-a fost înlocuită între timp. Dacă manifestul pierde amprenta
 * MD5 sau avertismentul despre ștergere, arhiva rămâne doar un folder cu fișiere — adică exact
 * promisiunea pe care NU o putem face.
 */
import { describe, it, expect } from "vitest";
import { archiveDue, archiveLabel, renderManifest } from "../driveArchivePlan";

const conn = (over: Partial<{ archiveEnabled: boolean; archiveIntervalDays: number; lastArchiveAt: Date | null }> = {}) => ({
  archiveEnabled: true,
  archiveIntervalDays: 14,
  lastArchiveAt: null as Date | null,
  ...over,
});

describe("archiveDue", () => {
  const now = new Date("2026-09-20T09:00:00Z");

  it("[blocant] prima arhivă se face imediat, nu peste două săptămâni", () => {
    expect(archiveDue(conn(), now)).toBe(true);
  });

  it("[blocant] la 14 zile fix — da; la 13 — încă nu", () => {
    expect(archiveDue(conn({ lastArchiveAt: new Date("2026-09-06T09:00:00Z") }), now)).toBe(true);
    expect(archiveDue(conn({ lastArchiveAt: new Date("2026-09-07T09:00:00Z") }), now)).toBe(false);
  });

  it("respectă intervalul ales, nu unul fix în cod", () => {
    const week = conn({ archiveIntervalDays: 7, lastArchiveAt: new Date("2026-09-12T09:00:00Z") });
    expect(archiveDue(week, now)).toBe(true);
    const quarter = conn({ archiveIntervalDays: 90, lastArchiveAt: new Date("2026-09-06T09:00:00Z") });
    expect(archiveDue(quarter, now)).toBe(false);
  });

  it("oprită din setări → nu arhivează niciodată", () => {
    expect(archiveDue(conn({ archiveEnabled: false }), now)).toBe(false);
  });
});

describe("archiveLabel", () => {
  it("eticheta e data, în formă sortabilă (e și numele mapei din Drive)", () => {
    expect(archiveLabel(new Date("2026-09-20T23:30:00Z"))).toBe("2026-09-20");
  });
});

describe("renderManifest", () => {
  const rows = [
    { name: "Dosar_PAR_0042.pdf", sourceFileId: "src-1", copyFileId: "cp-1", size: 12345, md5: "abc123", locked: true },
    { name: "Dosar_PAR_0043.pdf", sourceFileId: "src-2", copyFileId: "cp-2", size: null, md5: null, locked: false },
  ];
  const text = renderManifest({
    label: "2026-09-20",
    generatedAt: new Date("2026-09-20T09:00:00Z"),
    rootFolderName: "Dosare PAR plătite",
    rows,
  });

  it("[blocant] poartă amprenta fiecărui fișier — altfel nu dovedește nimic", () => {
    expect(text).toContain("abc123");
    expect(text).toContain("cp-1");
    expect(text).toContain("src-1");
  });

  it("[blocant] spune deschis că ștergerea nu poate fi împiedicată", () => {
    expect(text).toContain("nicio aplicație nu poate împiedica");
  });

  it("numără corect fișierele blocate", () => {
    expect(text).toContain("Fișiere: 2 · blocate la scriere: 1");
  });

  it("un fișier fără amprentă e marcat ca atare, nu sărit în tăcere", () => {
    expect(text).toContain("MD5     : indisponibil");
    expect(text).toContain("blocat  : nu");
  });
});
