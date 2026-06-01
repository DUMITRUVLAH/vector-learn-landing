/**
 * Regression test for the "[object Object]" prod bug.
 *
 * The API returns errors in two shapes:
 *   - app errors:  { error: "some_code" }                (string)
 *   - zod errors:  { error: { issues:[...], name } }      (object, on 400 validation)
 * The client wrongly assigned the object to the ApiError message → the UI showed
 * "[object Object]" (seen on the Facturi page when it requested limit=200 and the
 * server's max-100 Zod schema rejected it). This pins the parsing for both shapes.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { api, ApiError } from "@/lib/api";

function mockFetch(status: number, body: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    })) as unknown as typeof fetch
  );
}

afterEach(() => vi.unstubAllGlobals());

describe("api() error parsing", () => {
  it("uses the string code for app errors", async () => {
    mockFetch(409, { error: "lead_already_converted" });
    await expect(api("/api/x")).rejects.toMatchObject({
      status: 409,
      code: "lead_already_converted",
    });
  });

  it("turns a Zod error object into a readable message (never [object Object])", async () => {
    mockFetch(400, {
      success: false,
      error: { name: "ZodError", issues: [{ message: "Number must be <= 100", path: ["limit"] }] },
    });
    try {
      await api("/api/students?limit=200");
      throw new Error("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      const msg = (err as ApiError).message;
      expect(msg).not.toContain("[object Object]");
      expect(msg).toContain("Number must be <= 100");
    }
  });

  it("falls back to http_<status> when the body has no usable error", async () => {
    mockFetch(500, {});
    await expect(api("/api/x")).rejects.toMatchObject({ code: "http_500" });
  });
});
