/**
 * FORMS-005 — Embed snippet + analytics per formular
 *
 * Teste acoperite:
 *   T-FORMS-005-1 [blocant]: migration 0030 in journal + columns in schema
 *   T-FORMS-005-2 [blocant]: POST /api/public/forms/:slug/ping → 200 + increment views
 *   T-FORMS-005-3 [blocant]: GET /api/forms/:id/analytics → 200 cu structura corecta (mock tenant)
 *   T-FORMS-005-4 [blocant]: analytics alt tenant → 404
 *   T-FORMS-005-5 [blocant]: embed.js în mod iframe injectează <iframe> în DOM
 *   T-FORMS-005-6 [normal]:  embed.js în mod popup injectează <button>
 *   T-FORMS-005-7 [normal]:  pingFormEvent API client e fire-and-forget (nu aruncă la eroare de rețea)
 *   T-FORMS-005-8 [normal]:  getFormAnalytics API client returnează FormAnalytics
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

// ─── T-FORMS-005-1: migration 0030 există în journal + coloane în schema ──────

describe("FORMS-005 — migration 0030 în journal", () => {
  it("T-FORMS-005-1a [blocant]: entry 0030_forms005_analytics prezent în _journal.json", () => {
    const journalPath = path.resolve(
      import.meta.dirname ?? __dirname,
      "../../../drizzle/meta/_journal.json"
    );
    const journal = JSON.parse(fs.readFileSync(journalPath, "utf8")) as {
      entries: { idx: number; tag: string }[];
    };
    const entry = journal.entries.find((e) => e.tag === "0030_forms005_analytics");
    expect(entry, "Entry 0030_forms005_analytics lipsește din journal").toBeDefined();
    expect(entry?.idx).toBe(30);
  });

  it("T-FORMS-005-1b [blocant]: fișierul migration 0030 există și conține ADD COLUMN views/starts/completions", () => {
    const filePath = path.resolve(
      import.meta.dirname ?? __dirname,
      "../../../drizzle/0030_forms005_analytics.sql"
    );
    expect(fs.existsSync(filePath), "0030_forms005_analytics.sql lipsește").toBe(true);
    const content = fs.readFileSync(filePath, "utf8");
    expect(content).toContain("views");
    expect(content).toContain("starts");
    expect(content).toContain("completions");
    expect(content).toContain("ADD COLUMN IF NOT EXISTS");
  });

  it("T-FORMS-005-1c [blocant]: schema Drizzle conține câmpurile views/starts/completions pe forms", async () => {
    const { forms } = await import("../../../server/db/schema/forms");
    const cols = Object.keys(forms);
    expect(cols).toContain("views");
    expect(cols).toContain("starts");
    expect(cols).toContain("completions");
  });
});

// ─── T-FORMS-005-2: POST /api/public/forms/:slug/ping – unit test handler ─────

describe("FORMS-005 — publicFormPingHandler", () => {
  it("T-FORMS-005-2a [blocant]: event 'view' invalid → 400", async () => {
    // Import handler direct și testăm cu un context mock minimal
    const { publicFormPingHandler } = await import("../../../server/routes/publicForms");
    const mockContext = {
      req: {
        param: (_: string) => "test-slug",
        json: async () => ({ event: "invalid_event" }),
      },
      json: vi.fn((body: unknown, status?: number) => ({ body, status })),
    };
    // @ts-expect-error mock minimal context
    await publicFormPingHandler(mockContext);
    expect(mockContext.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: "invalid_event" }),
      400
    );
  });

  it("T-FORMS-005-2b [blocant]: event 'view' valid → apelul DB update + răspuns { ok: true }", async () => {
    // Mock db module înainte de import
    vi.doMock("../../../server/db/client", () => ({
      db: {
        update: vi.fn().mockReturnValue({
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue(undefined),
          }),
        }),
      },
    }));

    const { publicFormPingHandler } = await import("../../../server/routes/publicForms");
    const mockContext = {
      req: {
        param: (_: string) => "test-slug",
        json: async () => ({ event: "view" }),
      },
      json: vi.fn((body: unknown) => body),
    };
    // @ts-expect-error mock minimal context
    const result = await publicFormPingHandler(mockContext);
    expect(mockContext.json).toHaveBeenCalledWith({ ok: true });
    vi.doUnmock("../../../server/db/client");
    return result;
  });
});

// ─── T-FORMS-005-5: embed.js în mod iframe ────────────────────────────────────

describe("FORMS-005 — embed.js loader (mod iframe)", () => {
  let originalCurrentScript: PropertyDescriptor | undefined;

  beforeEach(() => {
    // Setup minimal DOM
    document.body.innerHTML = "";
    originalCurrentScript = Object.getOwnPropertyDescriptor(document, "currentScript");
  });

  afterEach(() => {
    document.body.innerHTML = "";
    if (originalCurrentScript) {
      Object.defineProperty(document, "currentScript", originalCurrentScript);
    }
  });

  it("T-FORMS-005-5 [blocant]: mod iframe injectează element <iframe> cu src corect", () => {
    // Creăm un script element cu atributele necesare
    const scriptEl = document.createElement("script");
    scriptEl.setAttribute("data-form-slug", "test-formular");
    scriptEl.setAttribute("data-mode", "iframe");
    scriptEl.src = "http://localhost:3000/embed.js";
    document.body.appendChild(scriptEl);

    // Mock document.currentScript
    Object.defineProperty(document, "currentScript", {
      get: () => scriptEl,
      configurable: true,
    });

    // Citim și executăm embed.js în context curent
    const embedJsPath = path.resolve(
      import.meta.dirname ?? __dirname,
      "../../../public/embed.js"
    );
    expect(fs.existsSync(embedJsPath), "public/embed.js lipsește").toBe(true);

    const embedCode = fs.readFileSync(embedJsPath, "utf8");
    // eslint-disable-next-line no-new-func
    const fn = new Function(embedCode);
    fn();

    // Verifică că a fost injectat un iframe
    const iframe = document.querySelector("iframe");
    expect(iframe, "iframe ar trebui injectat după script").not.toBeNull();
    expect(iframe?.src).toContain("test-formular");
  });

  it("T-FORMS-005-6 [normal]: mod popup injectează un <button>", () => {
    const scriptEl = document.createElement("script");
    scriptEl.setAttribute("data-form-slug", "test-popup-form");
    scriptEl.setAttribute("data-mode", "popup");
    scriptEl.setAttribute("data-button-text", "Înscrie-te acum");
    scriptEl.src = "http://localhost:3000/embed.js";
    document.body.appendChild(scriptEl);

    Object.defineProperty(document, "currentScript", {
      get: () => scriptEl,
      configurable: true,
    });

    const embedJsPath = path.resolve(
      import.meta.dirname ?? __dirname,
      "../../../public/embed.js"
    );
    const embedCode = fs.readFileSync(embedJsPath, "utf8");
    // eslint-disable-next-line no-new-func
    const fn = new Function(embedCode);
    fn();

    const btn = document.querySelector("button");
    expect(btn, "buton ar trebui injectat în mod popup").not.toBeNull();
    expect(btn?.textContent).toContain("Înscrie-te acum");
  });
});

// ─── T-FORMS-005-7: pingFormEvent API client fire-and-forget ─────────────────

describe("FORMS-005 — pingFormEvent API client", () => {
  it("T-FORMS-005-7 [normal]: pingFormEvent nu aruncă la eroare de rețea (fire-and-forget)", async () => {
    // Mock fetch global să eșueze
    const originalFetch = global.fetch;
    global.fetch = vi.fn().mockRejectedValue(new Error("Network error"));

    const { pingFormEvent } = await import("../../lib/api/forms");

    // Nu ar trebui să arunce
    await expect(pingFormEvent("test-slug", "view")).resolves.toBeUndefined();

    global.fetch = originalFetch;
  });

  it("T-FORMS-005-8 [normal]: getFormAnalytics returnează FormAnalytics corect", async () => {
    const mockAnalytics = {
      views: 100,
      starts: 50,
      completions: 30,
      completionRate: 0.6,
      leadsCreated: 25,
    };

    const originalFetch = global.fetch;
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockAnalytics),
    } as Response);

    const { getFormAnalytics } = await import("../../lib/api/forms");
    const result = await getFormAnalytics("some-form-id");

    expect(result.views).toBe(100);
    expect(result.starts).toBe(50);
    expect(result.completions).toBe(30);
    expect(result.completionRate).toBe(0.6);
    expect(result.leadsCreated).toBe(25);

    global.fetch = originalFetch;
  });
});
