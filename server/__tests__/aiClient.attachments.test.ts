/**
 * @vitest-environment node
 *
 * `callAi` — cum ajunge documentul la model și ce se întâmplă când modelul NU răspunde.
 *
 * Două regresii pe care le blochează:
 *  1. Un PDF atașat trebuie să ajungă efectiv în payload (OpenAI: content part "file";
 *     Anthropic: bloc "document"). Înainte, `imageDataUrl` era ignorat complet pe Anthropic,
 *     iar PDF-ul nu avea deloc cale — un act scanat ajungea la model ca text gol.
 *  2. O eroare de API (cont fără credit → 429) era raportată ca apel reușit (`isStub:false`)
 *     cu textul de stub. Rezultatul: UI-ul afișa „(demo)" și date inventate de parserul de
 *     rezervă, fără ca nimeni să afle că serviciul e picat.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const inserted: unknown[] = [];
vi.mock("../db/client", () => ({
  db: {
    insert: () => ({
      values: (v: unknown) => {
        inserted.push(v);
        return { returning: async () => [{ id: "00000000-0000-4000-8000-000000000001" }] };
      },
    }),
  },
}));
vi.mock("../db/schema", () => ({ aiAuditLog: {} }));
vi.mock("../lib/ai/featureFlags", () => ({ isEnabled: async () => true }));
vi.mock("../lib/ai/budgetGuard", () => ({ checkBudget: async () => true }));

const PDF_DATA_URL = "data:application/pdf;base64,JVBERi0xLjQK";
const BASE = { action: "capture_extract", userMessage: "extrage", tenantId: "t1" } as const;

/** Import `client.ts` fresh so it re-reads the provider env vars. */
async function loadClient(env: Record<string, string | undefined>) {
  vi.resetModules();
  for (const [k, v] of Object.entries(env)) {
    if (v == null) delete process.env[k];
    else process.env[k] = v;
  }
  return import("../lib/ai/client");
}

let fetchSpy: ReturnType<typeof vi.fn>;
const originalEnv = { ...process.env };

beforeEach(() => {
  inserted.length = 0;
  fetchSpy = vi.fn();
  vi.stubGlobal("fetch", fetchSpy);
});

afterEach(() => {
  vi.unstubAllGlobals();
  process.env = { ...originalEnv };
});

function okOpenAi(text = "{}") {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      choices: [{ message: { content: text } }],
      usage: { prompt_tokens: 10, completion_tokens: 5 },
    }),
  };
}

describe("OpenAI — documentul atașat ajunge în payload", () => {
  it("[blocant] PDF-ul devine un content part de tip 'file'", async () => {
    const { callAi } = await loadClient({
      OPENAI_API_KEY: "sk-test",
      AI_API_KEY: undefined,
      ANTHROPIC_API_KEY: undefined,
      AI_MODEL: "gpt-4o-mini",
    });
    fetchSpy.mockResolvedValue(okOpenAi());

    const res = await callAi({ ...BASE, fileDataUrl: PDF_DATA_URL, fileName: "act.pdf" });

    const body = JSON.parse(fetchSpy.mock.calls[0][1].body as string);
    const parts = body.messages.at(-1).content as Array<Record<string, never>>;
    const filePart = parts.find((p) => p.type === "file");
    expect(filePart).toBeDefined();
    expect(filePart!.file.filename).toBe("act.pdf");
    expect(filePart!.file.file_data).toBe(PDF_DATA_URL);
    expect(res.isStub).toBe(false);
    expect(res.unavailable).toBeUndefined();
  });

  it("fără atașament, mesajul rămâne text simplu (fără regresie de cost)", async () => {
    const { callAi } = await loadClient({ OPENAI_API_KEY: "sk-test", AI_API_KEY: undefined });
    fetchSpy.mockResolvedValue(okOpenAi());

    await callAi({ ...BASE });

    const body = JSON.parse(fetchSpy.mock.calls[0][1].body as string);
    expect(body.messages.at(-1).content).toBe("extrage");
  });
});

describe("Anthropic — imaginea și PDF-ul nu mai sunt ignorate", () => {
  it("[blocant] PDF-ul devine un bloc 'document' base64", async () => {
    const { callAi } = await loadClient({
      OPENAI_API_KEY: undefined,
      AI_API_KEY: "sk-ant-test",
      AI_MODEL: "claude-3-haiku-20240307",
    });
    fetchSpy.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        content: [{ type: "text", text: "{}" }],
        usage: { input_tokens: 3, output_tokens: 2 },
      }),
    });

    await callAi({ ...BASE, fileDataUrl: PDF_DATA_URL, fileName: "act.pdf" });

    const body = JSON.parse(fetchSpy.mock.calls[0][1].body as string);
    const blocks = body.messages[0].content as Array<Record<string, never>>;
    const doc = blocks.find((b) => b.type === "document");
    expect(doc).toBeDefined();
    expect(doc!.source.media_type).toBe("application/pdf");
    expect(doc!.source.data).toBe("JVBERi0xLjQK"); // data-url prefix stripped
  });

  it("[blocant] imaginea devine un bloc 'image' (înainte era ignorată complet)", async () => {
    const { callAi } = await loadClient({ OPENAI_API_KEY: undefined, AI_API_KEY: "sk-ant-test" });
    fetchSpy.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        content: [{ type: "text", text: "{}" }],
        usage: { input_tokens: 3, output_tokens: 2 },
      }),
    });

    await callAi({ ...BASE, imageDataUrl: "data:image/png;base64,iVBORw0KGgo=" });

    const body = JSON.parse(fetchSpy.mock.calls[0][1].body as string);
    const blocks = body.messages[0].content as Array<Record<string, never>>;
    const img = blocks.find((b) => b.type === "image");
    expect(img).toBeDefined();
    expect(img!.source.media_type).toBe("image/png");
  });
});

describe("Eșecul API-ului este raportat, nu ascuns", () => {
  it("[blocant] 429 'no credits' → isStub + unavailable:'api_error'", async () => {
    const { callAi } = await loadClient({ OPENAI_API_KEY: "sk-test", AI_API_KEY: undefined });
    fetchSpy.mockResolvedValue({
      ok: false,
      status: 429,
      text: async () => '{"error":{"code":"credit_balance_exhausted"}}',
    });

    const res = await callAi({ ...BASE });

    // Exact scenariul din prod (2026-08-21): contul OpenAI rămas fără credit.
    expect(res.isStub).toBe(true);
    expect(res.unavailable).toBe("api_error");
    // …și rămâne în audit ca eroare, cu mesajul furnizorului.
    expect(inserted.at(-1)).toMatchObject({ status: "error" });
  });

  it("[blocant] fără cheie configurată → unavailable:'no_key'", async () => {
    const { callAi } = await loadClient({
      OPENAI_API_KEY: undefined,
      AI_API_KEY: undefined,
      ANTHROPIC_API_KEY: undefined,
    });

    const res = await callAi({ ...BASE });

    expect(res.isStub).toBe(true);
    expect(res.unavailable).toBe("no_key");
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
