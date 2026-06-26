/**
 * PAR-FIN-003: tests for the handover act (act de predare-primire).
 *
 * Pure template tests (renderActHtml — no DB) + structural tests for the route
 * (exported, mounted before the catch-all, GDPR/role-gated, HTML fallback).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { renderActHtml, type ActContext } from "../lib/par/actTemplate";

const ROUTE = readFileSync(resolve(__dirname, "../routes/parActDoc.ts"), "utf8");
const APP = readFileSync(resolve(__dirname, "../app.ts"), "utf8");

const ctx: ActContext = {
  orgName: "ATIC",
  requestNo: "PAR-2026-0001",
  date: "18.06.2026",
  payeeName: 'Casa "VECTOR-AP"',
  payeeIdnp: "1016600016713",
  payeeIban: "MD87AG000000022516065719",
  endUse: "Servicii consultanță",
  totalFormatted: "5 040,00 MDL",
  lines: [{ description: "Consultanță <b>grup</b>", qty: 2, total: "5 040,00 MDL" }],
};

describe("PAR-FIN-003: renderActHtml", () => {
  it("renders a full HTML document with the act title", () => {
    const html = renderActHtml(ctx);
    expect(html).toContain("<!doctype html>");
    expect(html).toContain("ACT DE PREDARE-PRIMIRE");
  });

  it("includes the PAR number, payee, IBAN and total", () => {
    const html = renderActHtml(ctx);
    expect(html).toContain("PAR-2026-0001");
    expect(html).toContain("MD87AG000000022516065719");
    expect(html).toContain("5 040,00 MDL");
  });

  it("escapes HTML in values (XSS-safe)", () => {
    const html = renderActHtml(ctx);
    // The payee name has a quote and a line has <b> — both must be escaped.
    expect(html).toContain("Casa &quot;VECTOR-AP&quot;");
    expect(html).toContain("Consultanță &lt;b&gt;grup&lt;/b&gt;");
    expect(html).not.toContain("Consultanță <b>grup</b>");
  });

  it("escapes the single quote too (defense-in-depth, security audit #2)", () => {
    const html = renderActHtml({ ...ctx, payeeName: "O'Brien SRL" });
    expect(html).toContain("O&#39;Brien SRL");
    expect(html).not.toContain("O'Brien SRL");
  });

  it("falls back to a single end-use row when there are no line items", () => {
    const html = renderActHtml({ ...ctx, lines: [] });
    expect(html).toContain("Servicii consultanță");
  });
});

describe("PAR-FIN-003: route structure + safety", () => {
  it("exports parActDocRoutes (a Hono app)", async () => {
    const mod = await import("../routes/parActDoc");
    expect(typeof mod.parActDocRoutes.fetch).toBe("function");
  });

  it("is mounted BEFORE the catch-all parRoutes", () => {
    const actIdx = APP.indexOf('app.route("/api/par", parActDocRoutes)');
    const catchAllIdx = APP.indexOf('app.route("/api/par", parRoutes)');
    expect(actIdx).toBeGreaterThan(-1);
    expect(actIdx).toBeLessThan(catchAllIdx);
  });

  it("is GDPR/role-gated and tenant-scoped", () => {
    expect(ROUTE).toContain("getUserPARRoles");
    expect(ROUTE).toContain("forbidden");
    expect(ROUTE).toContain("eq(parRequests.tenantId, tenantId)");
  });

  it("falls back to HTML when Chromium/PDF is unavailable", () => {
    expect(ROUTE).toContain("htmlToPdfBuffer");
    expect(ROUTE).toContain("X-PDF-Fallback");
  });
});
