/**
 * @vitest-environment node
 *
 * Headerele de încadrare (framing) — o singură excepție, exact acolo unde trebuie.
 *
 * Regresia pe care o blochează: vizualizatorul de documente PAR arată atașamentul într-un
 * `<iframe>` de pe propria origine. Cu `X-Frame-Options: DENY` pe TOATE răspunsurile, browserul
 * refuza chiar și încadrarea de către noi înșine — utilizatorul vedea „This content is blocked".
 * Excepția e strict pentru ruta de preview; orice altă rută trebuie să rămână de neîncadrat,
 * altfel butoanele de aprobare a plăților devin ținte de clickjacking.
 */
import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import { securityHeaders } from "../middleware/securityHeaders";

function appWith(path: string) {
  const app = new Hono();
  app.use("*", securityHeaders);
  app.get(path, (c) => c.text("ok"));
  return app;
}

const PREVIEW = "/api/par/par-1/attachments/att-1/preview";

describe("securityHeaders — încadrarea", () => {
  it("ruta de preview a atașamentului poate fi încadrată doar de propria noastră origine", async () => {
    const res = await appWith("/api/par/:parId/attachments/:attId/preview").request(PREVIEW);
    expect(res.headers.get("X-Frame-Options")).toBe("SAMEORIGIN");
    expect(res.headers.get("Content-Security-Policy")).toContain("frame-ancestors 'self'");
  });

  it("orice altă rută rămâne de neîncadrat", async () => {
    for (const path of ["/api/health", "/api/par/par-1", "/api/par/par-1/attachments"]) {
      const res = await appWith(path).request(path);
      expect(res.headers.get("X-Frame-Options"), path).toBe("DENY");
      expect(res.headers.get("Content-Security-Policy"), path).toContain("frame-ancestors 'none'");
    }
  });

  // Testul negativ: o rută care doar SEAMĂNĂ cu preview-ul nu primește excepția.
  it("o rută care doar seamănă cu preview-ul nu primește excepția", async () => {
    const path = "/api/par/par-1/attachments/att-1/preview/extra";
    const res = await appWith(path).request(path);
    expect(res.headers.get("X-Frame-Options")).toBe("DENY");
  });

  it("iframe-ul vizualizatorului e permis de CSP (frame-src 'self')", async () => {
    const res = await appWith("/api/health").request("/api/health");
    expect(res.headers.get("Content-Security-Policy")).toContain("frame-src 'self'");
  });
});
