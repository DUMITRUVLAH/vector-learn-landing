/**
 * INVOICE-REPORTING — deleteCapture client contract.
 *
 * The captures list has a per-row delete (to clean up duplicate statement/invoice uploads).
 * This pins that the client calls DELETE /api/fin/captures/:id.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { api } from "@/lib/api";
import { deleteCapture } from "@/lib/api/finCaptures";

vi.mock("@/lib/api", () => ({
  api: vi.fn(),
  apiUpload: vi.fn(),
  ApiError: class ApiError extends Error {
    constructor(public readonly status: number, public readonly code: string) {
      super(code);
    }
  },
}));

const mockApi = vi.mocked(api);

describe("deleteCapture", () => {
  beforeEach(() => mockApi.mockReset());

  it("issues DELETE /api/fin/captures/:id", async () => {
    mockApi.mockResolvedValue({ ok: true, id: "cap_1", kind: "statement" });
    const res = await deleteCapture("cap_1");
    expect(mockApi).toHaveBeenCalledWith("/api/fin/captures/cap_1", { method: "DELETE" });
    expect(res).toEqual({ ok: true, id: "cap_1", kind: "statement" });
  });
});
