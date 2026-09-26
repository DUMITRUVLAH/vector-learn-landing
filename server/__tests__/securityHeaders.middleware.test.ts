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

  // Dosarul și formularul se citesc în ACELAȘI vizualizator, tot într-un `<iframe>`. Fără excepția
  // asta, „Citește dosarul" / „Vezi PDF" arătau un cadru gol cu „This content is blocked".
  it("dosarul și formularul PAR pot fi încadrate de propria noastră origine", async () => {
    for (const path of ["/api/par/par-1/dosar", "/api/par/par-1/form.pdf"]) {
      const res = await appWith(path).request(path);
      expect(res.headers.get("X-Frame-Options"), path).toBe("SAMEORIGIN");
      expect(res.headers.get("Content-Security-Policy"), path).toContain("frame-ancestors 'self'");
    }
  });

  // Copia patentei se deschide în același vizualizator; fără excepție, cadrul arăta
  // „localhost refused to connect" (23.09.2026).
  it("copia patentei (cerere + registru) poate fi încadrată de propria noastră origine", async () => {
    for (const path of ["/api/par/par-1/payee-patent", "/api/par/vendors/v-1/patent"]) {
      const res = await appWith(path).request(path);
      expect(res.headers.get("X-Frame-Options"), path).toBe("SAMEORIGIN");
      expect(res.headers.get("Content-Security-Policy"), path).toContain("frame-ancestors 'self'");
    }
  });

  it("[blocant] CRM-U05: fișierul leadului și PDF-ul actului se văd în vizualizatorul aplicației", async () => {
    for (const path of ["/api/crm/lead-files/f-1/preview", "/api/docs/documents/d-1/pdf"]) {
      const res = await appWith(path).request(path);
      expect(res.headers.get("X-Frame-Options"), path).toBe("SAMEORIGIN");
      expect(res.headers.get("Content-Security-Policy"), path).toContain("frame-ancestors 'self'");
    }
  });

  it("orice altă rută rămâne de neîncadrat", async () => {
    for (const path of [
      "/api/crm/lead-files",
      "/api/crm/lead-files/f-1",
      "/api/docs/documents/d-1",
      "/api/docs/documents/d-1/pdf/ensure",
      "/api/docs/documents/d-1/finalize",
      "/api/health",
      "/api/par/par-1",
      "/api/par/par-1/attachments",
      "/api/par/vendors",
      "/api/par/vendors/v-1",
      "/api/par/par-1/payee-patent/sign",
    ]) {
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

/**
 * Regresia din 13.09.2026, raportată de owner ca „Failed to fetch" în dialogul de înregistrare a
 * plății: de o zi fișierele urcau DIRECT în Supabase Storage, dar CSP-ul rămăsese pe
 * `connect-src 'self'` — browserul oprea PUT-ul înainte să plece. Un header de securitate care
 * blochează o funcție a produsului e o pană, nu o protecție.
 */
describe("securityHeaders — conexiunile pe care aplicația chiar le face", () => {
  it("connect-src permite originea Supabase Storage (upload direct din browser)", async () => {
    const res = await appWith("/api/health").request("/api/health");
    const csp = res.headers.get("Content-Security-Policy") ?? "";
    const connectSrc = csp.split(";").map((d) => d.trim()).find((d) => d.startsWith("connect-src"));
    expect(connectSrc).toBeDefined();
    expect(connectSrc).toContain("'self'");
    expect(connectSrc).toMatch(/supabase/);
  });

  it("ruta de preview păstrează aceleași permisiuni de conexiune, nu o politică paralelă", async () => {
    const res = await appWith("/api/par/:parId/attachments/:attId/preview").request(PREVIEW);
    const csp = res.headers.get("Content-Security-Policy") ?? "";
    expect(csp.split(";").map((d) => d.trim())).toContain(
      (await appWith("/api/health").request("/api/health")).headers
        .get("Content-Security-Policy")!
        .split(";")
        .map((d) => d.trim())
        .find((d) => d.startsWith("connect-src"))!
    );
  });
});
