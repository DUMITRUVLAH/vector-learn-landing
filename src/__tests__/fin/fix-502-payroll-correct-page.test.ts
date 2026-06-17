/**
 * FIX-502: Payroll correct page mounted + internal links fixed.
 *
 * T-FIX-502-1 [blocant] App.tsx /business/fin/payroll mapped to PayrollFINPage from pages/fin/
 * T-FIX-502-4 [blocant] No /app/fin/payroll links in pages/fin/Payroll*.tsx
 * T-FIX-502-5 [blocant] check-undefined-refs and check-route-mounts green (checked via build gate)
 */

import { readFileSync } from "fs";
import { join } from "path";
import { describe, it, expect } from "vitest";

const SRC = join(process.cwd(), "src");

function readSrc(rel: string) {
  return readFileSync(join(SRC, rel), "utf-8");
}

const appTsxSrc = readSrc("App.tsx");
const payrollFINSrc = readSrc("pages/fin/PayrollPage.tsx");
const payrollEmployeesSrc = readSrc("pages/fin/PayrollEmployeesPage.tsx");
const payrollRunDetailSrc = readSrc("pages/fin/PayrollRunDetailPage.tsx");

describe("FIX-502: /business/fin/payroll uses FinDesk pages, not CRM PayrollPage", () => {
  // T-FIX-502-1 [blocant]
  it("T-FIX-502-1: App.tsx imports PayrollFINPage from pages/fin/PayrollPage (not pages/app/)", () => {
    // Should NOT import from pages/app/PayrollPage anymore
    expect(appTsxSrc).not.toMatch(/from.*pages\/app\/PayrollPage/);
    // Should import from pages/fin/PayrollPage
    expect(appTsxSrc).toMatch(/PayrollFINPage.*pages\/fin\/PayrollPage|pages\/fin\/PayrollPage.*PayrollFINPage/);
  });

  it("T-FIX-502-1b: App.tsx mounts PayrollFINPage (not PayrollPage) at /business/fin/payroll", () => {
    // /business/fin/payroll route must use PayrollFINPage
    expect(appTsxSrc).toMatch(/\/business\/fin\/payroll.*PayrollFINPage|PayrollFINPage.*\/business\/fin\/payroll/);
    // Should not use old PayrollPage import at business/fin/payroll
    const payrollLine = appTsxSrc
      .split("\n")
      .find((l) => l.includes("/business/fin/payroll") && !l.includes("employees") && !l.includes("runs") && !l.includes("//"));
    expect(payrollLine).toBeTruthy();
    expect(payrollLine).not.toContain("PayrollPage />");
    expect(payrollLine).toMatch(/PayrollFINPage/);
  });

  // T-FIX-502-4 [blocant]
  it("T-FIX-502-4: no #/app/fin/payroll links in pages/fin/PayrollPage.tsx", () => {
    // Comments in first line are ok, but actual href/link values should not be /app/fin/payroll
    const funcBody = payrollFINSrc.slice(payrollFINSrc.indexOf("export function PayrollFINPage"));
    expect(funcBody).not.toMatch(/#\/app\/fin\/payroll/);
  });

  it("T-FIX-502-4b: no #/app/fin/payroll links in pages/fin/PayrollRunDetailPage.tsx", () => {
    // Skip file-level comment header (first block comment) — check function bodies only
    const funcBody = payrollRunDetailSrc.slice(payrollRunDetailSrc.indexOf("function extractRunIdFromHash"));
    // The hash extractor pattern must use /business/fin/payroll
    expect(funcBody).not.toMatch(/\/app\/fin\/payroll\/runs/);
    expect(funcBody).toMatch(/\/business\/fin\/payroll\/runs/);
    // Back links must also be /business/fin/payroll
    expect(funcBody).not.toMatch(/#\/app\/fin\/payroll/);
  });

  it("T-FIX-502-4c: no #/app/fin/payroll links in pages/fin/PayrollEmployeesPage.tsx", () => {
    const funcBody = payrollEmployeesSrc.slice(payrollEmployeesSrc.indexOf("export function PayrollEmployeesPage"));
    expect(funcBody).not.toMatch(/#\/app\/fin\/payroll/);
  });

  it("T-FIX-502-4d: App.tsx imports PayrollEmployeesPage and PayrollRunDetailPage from pages/fin/", () => {
    expect(appTsxSrc).toMatch(/PayrollEmployeesPage.*pages\/fin\/|pages\/fin\/.*PayrollEmployeesPage/);
    expect(appTsxSrc).toMatch(/PayrollRunDetailPage.*pages\/fin\/|pages\/fin\/.*PayrollRunDetailPage/);
  });
});
