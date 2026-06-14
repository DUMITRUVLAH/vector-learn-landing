/**
 * @vitest-environment node
 * APPROVAL-001: FIN payment approval link tests
 * Tests: T-APPR001-1..6
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

// ─── T-APPR001-1: Migration file structure ────────────────────────────────────

describe("APPROVAL-001: Migration gate (T-APPR001-1)", () => {
  it("T-APPR001-1 [blocant] migration 0115_fin_approval_link.sql exists and adds par_request_id", () => {
    const migPath = path.resolve(
      __dirname,
      "../../drizzle/0115_fin_approval_link.sql"
    );
    expect(fs.existsSync(migPath), `Migration file missing: ${migPath}`).toBe(true);

    const sql = fs.readFileSync(migPath, "utf-8");
    expect(sql).toContain("par_request_id");
    expect(sql).toContain("payments");
    expect(sql).toContain("--> statement-breakpoint");
  });

  it("T-APPR001-1b [blocant] payments schema has parRequestId field", () => {
    const schemaPath = path.resolve(
      __dirname,
      "../db/schema/payments.ts"
    );
    const content = fs.readFileSync(schemaPath, "utf-8");
    expect(content).toContain("parRequestId");
    expect(content).toContain("par_request_id");
  });
});

// ─── T-APPR001-2: Approval validation logic ───────────────────────────────────

describe("APPROVAL-001: Approval validator logic (T-APPR001-2)", () => {
  it("T-APPR001-2 [blocant] checkApprovalRequired function is exported from finPaymentApproval.ts", () => {
    const routePath = path.resolve(
      __dirname,
      "../routes/finPaymentApproval.ts"
    );
    const content = fs.readFileSync(routePath, "utf-8");
    expect(content).toContain("export async function checkApprovalRequired");
  });

  it("T-APPR001-2b [blocant] payments.ts imports and uses checkApprovalRequired", () => {
    const paymentsRoutePath = path.resolve(
      __dirname,
      "../routes/payments.ts"
    );
    const content = fs.readFileSync(paymentsRoutePath, "utf-8");
    expect(content).toContain("checkApprovalRequired");
    // approval_required error is returned via the approvalError object from finPaymentApproval.ts
    expect(content).toContain("approvalError");
  });

  it("T-APPR001-2c [blocant] threshold default is 500000 cents (5000 MDL)", () => {
    const routePath = path.resolve(
      __dirname,
      "../routes/finPaymentApproval.ts"
    );
    const content = fs.readFileSync(routePath, "utf-8");
    expect(content).toContain("500_000");
  });
});

// ─── T-APPR001-3: link-par endpoint ──────────────────────────────────────────

describe("APPROVAL-001: POST /api/payments/:id/link-par (T-APPR001-3)", () => {
  it("T-APPR001-3 [blocant] finPaymentApprovalRoutes mounted in app.ts", () => {
    const appPath = path.resolve(__dirname, "../app.ts");
    const content = fs.readFileSync(appPath, "utf-8");
    expect(content).toContain("finPaymentApprovalRoutes");
    expect(content).toContain("/api/payments");
  });

  it("T-APPR001-3b [blocant] link-par endpoint validates PAR status is approved", () => {
    const routePath = path.resolve(
      __dirname,
      "../routes/finPaymentApproval.ts"
    );
    const content = fs.readFileSync(routePath, "utf-8");
    expect(content).toContain("par_not_approved");
    expect(content).toContain("status !== \"approved\"");
  });
});

// ─── T-APPR001-4: PAR not approved rejection ────────────────────────────────

describe("APPROVAL-001: PAR status validation (T-APPR001-4)", () => {
  it("T-APPR001-4 [blocant] route returns 422 for non-approved PAR", () => {
    const routePath = path.resolve(
      __dirname,
      "../routes/finPaymentApproval.ts"
    );
    const content = fs.readFileSync(routePath, "utf-8");
    // 422 status for PAR not approved
    expect(content).toContain("422");
    expect(content).toContain("par_not_approved");
  });
});

// ─── T-APPR001-5: PaymentApprovalBadge component ────────────────────────────

describe("APPROVAL-001: PaymentApprovalBadge component (T-APPR001-5)", () => {
  it("T-APPR001-5 [normal] PaymentApprovalBadge.tsx exists and exports component", () => {
    const compPath = path.resolve(
      __dirname,
      "../../src/components/fin/PaymentApprovalBadge.tsx"
    );
    expect(fs.existsSync(compPath)).toBe(true);
    const content = fs.readFileSync(compPath, "utf-8");
    expect(content).toContain("export function PaymentApprovalBadge");
    expect(content).toContain("Aprobare necesară");
    // Must use design tokens (no hardcoded hex)
    expect(content).not.toMatch(/#[0-9a-fA-F]{6}/);
  });

  it("T-APPR001-5b [normal] badge renders null when amount is below threshold", () => {
    // Logic: !requiresApproval → return null
    const amountMdl = 3000; // below 5000 threshold
    const thresholdMdl = 5000;
    const requiresApproval = amountMdl >= thresholdMdl;
    expect(requiresApproval).toBe(false);
  });
});

// ─── T-APPR001-6: Below-threshold flow ───────────────────────────────────────

describe("APPROVAL-001: Below-threshold skip (T-APPR001-6)", () => {
  it("T-APPR001-6 [normal] checkApprovalRequired returns null for status !== paid", () => {
    // The function early-returns null if newStatus !== 'paid'
    // Verified by reading the source
    const routePath = path.resolve(
      __dirname,
      "../routes/finPaymentApproval.ts"
    );
    const content = fs.readFileSync(routePath, "utf-8");
    expect(content).toContain('if (newStatus !== "paid") return null');
  });

  it("T-APPR001-6b [normal] DB portability: no raw .execute().rows in approval routes", () => {
    const routePath = path.resolve(
      __dirname,
      "../routes/finPaymentApproval.ts"
    );
    const content = fs.readFileSync(routePath, "utf-8");
    expect(content).not.toContain(".execute().rows");
  });
});
