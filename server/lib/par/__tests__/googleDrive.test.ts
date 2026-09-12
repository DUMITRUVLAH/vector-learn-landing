/**
 * PAR-DRIVE: clientul Google Drive — părțile în care o greșeală costă tăcut.
 *
 * `access_type=offline` + `prompt=consent`: fără ele Google dă doar un access token de o oră,
 * conectarea pare reușită, iar sincronizarea moare săptămâna viitoare fără niciun semnal.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  buildDriveAuthUrl,
  escapeDriveQueryValue,
  findFolder,
  refreshDriveAccessToken,
  uploadPdf,
} from "../googleDrive";

const config = {
  clientId: "id.apps.googleusercontent.com",
  clientSecret: "secret",
  redirectUri: "https://app.test/api/par/drive/callback",
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("buildDriveAuthUrl", () => {
  it("[blocant] cere acces offline cu consimțământ — altfel nu primim refresh token", () => {
    const url = new URL(buildDriveAuthUrl(config, "state-1", "challenge-1"));
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("prompt")).toBe("consent");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("state")).toBe("state-1");
  });

  it("[blocant] cere doar drive.file, nu acces la tot Drive-ul", () => {
    const url = new URL(buildDriveAuthUrl(config, "s", "c"));
    const scopes = (url.searchParams.get("scope") ?? "").split(" ");
    expect(scopes).toContain("https://www.googleapis.com/auth/drive.file");
    expect(scopes.some((s) => s === "https://www.googleapis.com/auth/drive")).toBe(false);
  });
});

describe("escapeDriveQueryValue", () => {
  it("[blocant] apostroful dintr-un nume de proiect nu rupe interogarea", () => {
    expect(escapeDriveQueryValue("Anul 2026 'pilot'")).toBe("Anul 2026 \\'pilot\\'");
  });

  it("interogarea de căutare conține numele escapat", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ files: [] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await findFolder("token", "Buget 'A'", "parent-1");

    const calledUrl = String(fetchMock.mock.calls[0][0]);
    expect(decodeURIComponent(calledUrl)).toContain("name = 'Buget \\'A\\''");
    expect(decodeURIComponent(calledUrl)).toContain("trashed = false");
  });
});

describe("refreshDriveAccessToken", () => {
  it("[blocant] tokenul revocat dă o eroare distinctă, nu una tranzitorie", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 }))
    );
    await expect(refreshDriveAccessToken(config, "refresh")).rejects.toThrow("drive_reauth_required");
  });

  it("întoarce access token-ul la răspuns bun", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ access_token: "at-1" }), { status: 200 }))
    );
    await expect(refreshDriveAccessToken(config, "refresh")).resolves.toBe("at-1");
  });
});

describe("uploadPdf", () => {
  it("[blocant] a doua urcare face UPDATE pe același fișier, nu un duplicat", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: "f-1" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await uploadPdf("token", {
      name: "Dosar_PAR_1.pdf",
      parentId: "folder-1",
      bytes: Buffer.from("%PDF-1.4"),
      existingFileId: "f-1",
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toContain("/files/f-1");
    expect(init.method).toBe("PATCH");
  });

  it("fișierul nou se creează în mapa cerută", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: "f-2" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await uploadPdf("token", {
      name: "Dosar_PAR_2.pdf",
      parentId: "folder-9",
      bytes: Buffer.from("%PDF-1.4"),
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe("POST");
    expect(Buffer.from(init.body as Uint8Array).toString("utf8")).toContain('"parents":["folder-9"]');
    expect(result.fileId).toBe("f-2");
  });
});
