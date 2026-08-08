/**
 * PERF-002 — teste pentru deduplicarea cererilor GET.
 *
 * Fiecare test de aici corespunde unei proprietăți de care depinde CORECTITUDINEA, nu doar
 * viteza. Cache-ul e ușor de „optimizat" până începe să servească date învechite, iar într-o
 * aplicație care aprobă plăți asta e mai rău decât lentoarea pe care o repară.
 *
 * Testul care contează cel mai mult e „mutația golește cache-ul": el e motivul pentru care
 * invalidarea e agresivă și nu trebuie relaxată fără să se strice ceva vizibil aici.
 */
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { api } from "@/lib/api";
import { clearApiCache, dedupe, peekApiCache } from "@/lib/apiCache";

const fetchMock = vi.fn();

beforeEach(() => {
  clearApiCache();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function jsonOnce(body: unknown, status = 200) {
  fetchMock.mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });
}

describe("PERF-002 — deduplicarea cererilor GET", () => {
  it("două GET-uri identice concurente produc O SINGURĂ cerere de rețea", async () => {
    jsonOnce({ value: 1 });

    const [a, b] = await Promise.all([
      api<{ value: number }>("/api/par/me"),
      api<{ value: number }>("/api/par/me"),
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(a).toEqual({ value: 1 });
    expect(b).toEqual({ value: 1 });
  });

  it("un GET repetat imediat e servit din cache (fereastra de remontare)", async () => {
    jsonOnce({ value: 1 });

    await api("/api/notifications");
    await api("/api/notifications");

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("GET-uri către rute DIFERITE nu se amestecă între ele", async () => {
    jsonOnce({ value: "a" });
    jsonOnce({ value: "b" });

    const a = await api<{ value: string }>("/api/par/projects");
    const b = await api<{ value: string }>("/api/par/departments");

    expect(a).toEqual({ value: "a" });
    expect(b).toEqual({ value: "b" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("o MUTAȚIE golește cache-ul, deci lista următoare vine proaspătă", async () => {
    jsonOnce({ items: ["vechi"] });
    await api("/api/par");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // POST — utilizatorul tocmai a creat o cerere de plată.
    jsonOnce({ ok: true });
    await api("/api/par", { method: "POST", body: "{}" });

    // Lista trebuie recerută, nu servită din cache: altfel cererea nouă n-ar apărea.
    jsonOnce({ items: ["vechi", "nou"] });
    const after = await api<{ items: string[] }>("/api/par");

    expect(after.items).toEqual(["vechi", "nou"]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("o cerere EȘUATĂ nu se cache-uiește — următoarea încercare chiar reîncearcă", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({ error: "boom" }) });
    await expect(api("/api/par/settings")).rejects.toThrow();

    jsonOnce({ ok: true });
    await expect(api("/api/par/settings")).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('cache: "reload" ocolește cache-ul — butonul „Reîncarcă" chiar reîncarcă', async () => {
    jsonOnce({ n: 1 });
    await api("/api/par/inbox");

    jsonOnce({ n: 2 });
    const fresh = await api<{ n: number }>("/api/par/inbox", { cache: "reload" });

    expect(fresh).toEqual({ n: 2 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("clearApiCache() forțează o cerere nouă (folosit la logout)", async () => {
    jsonOnce({ user: "ana" });
    await api("/api/business/auth/me");

    clearApiCache();

    jsonOnce({ user: "mihai" });
    const next = await api<{ user: string }>("/api/business/auth/me");

    // Fără golire, al doilea utilizator ar vedea identitatea primului timp de 5 minute.
    expect(next).toEqual({ user: "mihai" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("peekApiCache() întoarce valoarea rezolvată — asta elimină spinner-ul la remontare", async () => {
    expect(peekApiCache("/api/par/me")).toBeUndefined();

    jsonOnce({ roles: ["par_admin"] });
    await api("/api/par/me");

    expect(peekApiCache("/api/par/me")).toEqual({ roles: ["par_admin"] });
  });

  it("dedupe(force) rescrie intrarea din cache, nu doar o ocolește", async () => {
    let n = 0;
    const fn = () => Promise.resolve(++n);

    await dedupe("k", fn);
    await dedupe("k", fn, true);

    // A treia citire, fără force, trebuie să vadă valoarea REÎMPROSPĂTATĂ (2), nu pe cea veche.
    expect(await dedupe("k", fn)).toBe(2);
  });
});
