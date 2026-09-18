/**
 * Logoul organizației — ce se descarcă, ce se refuză și ce ajunge pe hârtie.
 *
 * Câmpul „Logo URL" a existat luni întregi fără să apară pe niciun document (owner, 18 sept. 2026:
 * „logo să poți adăuga în organizație ca să apară după unde trebuie"). Testele de aici țin cele
 * două garanții ale implementării:
 *   1. serverul descarcă doar ce e sigur și utilizabil (https public, PNG/JPEG, sub 1 MB);
 *   2. nimic din lanțul logoului nu poate opri generarea unui document.
 *
 * @vitest-environment node
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// `orgLogo.ts` citește setările din baza de date pentru `loadOrgIdentity`. Testele de aici privesc
// descărcarea și desenarea, nu interogarea — clientul de bază de date e înlocuit ca fișierul să
// poată fi importat fără să pornească PGlite.
vi.mock("../../../db/client", () => ({ db: {} }));

import { logoDataUrl, __resetLogoCache } from "../orgLogo";
import { buildDocDefinition } from "../../docs/pdfDocument";
import { buildParFormDefinition } from "../parFormPdf";

const PNG_BYTES = Buffer.from(
  // 1×1 PNG transparent
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

function okPng(): Response {
  return new Response(new Uint8Array(PNG_BYTES), {
    status: 200,
    headers: { "content-type": "image/png" },
  });
}

let fetchSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  __resetLogoCache();
  fetchSpy = vi.spyOn(globalThis, "fetch");
});

afterEach(() => {
  fetchSpy.mockRestore();
});

describe("ce logo acceptă serverul", () => {
  it("un PNG https devine data-URL, gata de pus în PDF", async () => {
    fetchSpy.mockResolvedValue(okPng());
    const url = await logoDataUrl("https://exemplu.md/logo.png");
    expect(url?.startsWith("data:image/png;base64,")).toBe(true);
  });

  it("nu descarcă nimic fără URL", async () => {
    expect(await logoDataUrl(null)).toBeNull();
    expect(await logoDataUrl("")).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("refuză http simplu și adresele din rețeaua internă (SSRF)", async () => {
    fetchSpy.mockResolvedValue(okPng());
    for (const url of [
      "http://exemplu.md/logo.png",
      "https://localhost/logo.png",
      "https://127.0.0.1/logo.png",
      "https://10.0.0.5/logo.png",
      "https://192.168.1.10/logo.png",
      "https://169.254.169.254/latest/meta-data/",
      "https://172.16.0.9/logo.png",
      "https://consola.internal/logo.png",
    ]) {
      expect(await logoDataUrl(url), url).toBeNull();
    }
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("refuză ce nu e PNG/JPEG — pdfmake n-ar desena un SVG", async () => {
    fetchSpy.mockResolvedValue(
      new Response("<svg/>", { status: 200, headers: { "content-type": "image/svg+xml" } }),
    );
    expect(await logoDataUrl("https://exemplu.md/logo.svg")).toBeNull();
  });

  it("refuză fișierele peste 1 MB", async () => {
    fetchSpy.mockResolvedValue(
      new Response(new Uint8Array(Buffer.alloc(1_000_001)), {
        status: 200,
        headers: { "content-type": "image/png" },
      }),
    );
    expect(await logoDataUrl("https://exemplu.md/urias.png")).toBeNull();
  });

  it("un link mort nu aruncă: documentul iese fără logo", async () => {
    fetchSpy.mockRejectedValue(new Error("ENOTFOUND"));
    expect(await logoDataUrl("https://exemplu.md/lipsa.png")).toBeNull();
    fetchSpy.mockResolvedValue(new Response("", { status: 404 }));
    __resetLogoCache();
    expect(await logoDataUrl("https://exemplu.md/404.png")).toBeNull();
  });
});

describe("cache-ul: un dosar are zeci de pagini, nu zeci de descărcări", () => {
  it("al doilea apel nu mai descarcă nimic", async () => {
    fetchSpy.mockResolvedValue(okPng());
    await logoDataUrl("https://exemplu.md/logo.png");
    await logoDataUrl("https://exemplu.md/logo.png");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("și eșecul se ține minte — un link mort nu costă un GET pe pagină", async () => {
    fetchSpy.mockRejectedValue(new Error("ENOTFOUND"));
    await logoDataUrl("https://exemplu.md/lipsa.png");
    await logoDataUrl("https://exemplu.md/lipsa.png");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});

// ─── Ce ajunge pe hârtie ──────────────────────────────────────────────────────

const META = {
  docNumber: "ACT-2026-0007",
  title: "Act de primire-predare",
  docDate: new Date("2026-08-31T00:00:00Z"),
  bodyHash: "a1b2c3d4e5f60718abcdef0123456789",
  orgName: "Asociația Obștească Exemplu",
};

/** Toate `image`-urile dintr-o definiție pdfmake, oricât de adânc ar fi. */
function images(node: unknown, out: string[] = []): string[] {
  if (Array.isArray(node)) {
    for (const n of node) images(n, out);
  } else if (node && typeof node === "object") {
    const rec = node as Record<string, unknown>;
    if (typeof rec.image === "string") out.push(rec.image);
    for (const v of Object.values(rec)) images(v, out);
  }
  return out;
}

describe("antetul actului", () => {
  it("desenează logoul când există", () => {
    const def = buildDocDefinition("<p>text</p>", { ...META, orgLogo: "data:image/png;base64,AAA" });
    const header = (def.header as (p: number, t: number) => unknown)(1, 1);
    expect(images(header)).toContain("data:image/png;base64,AAA");
  });

  it("fără logo, antetul rămâne cel de dinainte: doar denumirea", () => {
    const def = buildDocDefinition("<p>text</p>", { ...META, orgLogo: null });
    const header = (def.header as (p: number, t: number) => unknown)(1, 1);
    expect(images(header)).toHaveLength(0);
    expect(JSON.stringify(header)).toContain(META.orgName);
  });
});

describe("antetul formularului PAR", () => {
  const formData = {
    requestNo: "PAR-2026-0001",
    dateOfRequest: new Date("2026-09-10T00:00:00Z"),
    status: "draft",
    currency: "MDL",
    lineItems: [],
    signatures: [],
  };

  it("formularul oficial primește logoul și denumirea organizației", () => {
    const def = buildParFormDefinition(
      formData as unknown as Parameters<typeof buildParFormDefinition>[0],
      null,
      { logoDataUrl: "data:image/png;base64,BBB", legalName: "ATIC" },
    );
    expect(images(def)).toContain("data:image/png;base64,BBB");
    expect(JSON.stringify(def.content)).toContain("ATIC");
  });

  it("fără setări de organizație, formularul e neatins", () => {
    const def = buildParFormDefinition(
      formData as unknown as Parameters<typeof buildParFormDefinition>[0],
      null,
    );
    expect(images(def)).toHaveLength(0);
  });
});
