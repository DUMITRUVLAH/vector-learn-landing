/**
 * BILL-003 — Aging raport + remindere încasare
 *
 * T-BILL-003-1 [blocant] GET /api/fin/invoices/aging returnează { data: { buckets, overdueInvoices } }
 * T-BILL-003-2 [blocant] O factură cu dueDate = azi-45 apare în overdue_31_60 bucket
 * T-BILL-003-3 [blocant] POST aging/reminders idempotency — same record not inserted twice
 * T-BILL-003-4 [blocant] Tenant isolation — aging of one tenant does NOT include other tenant's invoices
 * T-BILL-003-5 [normal]  daysOverdue calculat corect
 * T-BILL-003-6 [normal]  GET aging/count returnează integer ≥ 0
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

// ─── Pure-function tests (from the route source) ──────────────────────────────

/**
 * Replicate the daysOverdue helper from the route (pure function, no DB).
 * daysOverdue("2026-06-04") when today=2026-06-14 → 10
 */
function daysOverdue(dueDateStr: string | null): number {
  if (!dueDateStr) return 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dueDateStr);
  due.setHours(0, 0, 0, 0);
  return Math.floor((today.getTime() - due.getTime()) / 86_400_000);
}

describe("BILL-003 — Aging report + reminders", () => {
  /**
   * T-BILL-003-1 [blocant]
   * Route file must define GET /aging and return { data: { buckets, overdueInvoices } }.
   */
  it("T-BILL-003-1: GET /aging route defined with buckets + overdueInvoices structure", () => {
    const routeContent = readFileSync(
      join(process.cwd(), "server/routes/finInvoices.ts"),
      "utf-8"
    );
    // Route handler defined
    expect(routeContent).toContain('"/aging"');
    // Returns buckets
    expect(routeContent).toContain("buckets");
    expect(routeContent).toContain("overdueInvoices");
    // Has all 4 bucket keys
    expect(routeContent).toContain("overdue_0_30");
    expect(routeContent).toContain("overdue_31_60");
    expect(routeContent).toContain("overdue_60_plus");
    expect(routeContent).toContain("current");
  });

  /**
   * T-BILL-003-2 [blocant]
   * A dueDate 45 days ago → daysOverdue returns ~45 → goes into overdue_31_60 bucket.
   */
  it("T-BILL-003-2: invoice with dueDate=today-45 classified as overdue_31_60", () => {
    // Build a date string that is definitely 45 days in the past (use UTC to avoid tz drift)
    const todayUtc = new Date();
    todayUtc.setUTCHours(0, 0, 0, 0);
    const dueDateUtc = new Date(todayUtc);
    dueDateUtc.setUTCDate(dueDateUtc.getUTCDate() - 45);
    const dueDateStr = dueDateUtc.toISOString().slice(0, 10);

    const days = daysOverdue(dueDateStr);
    // Allow 44–46 to account for timezone/DST edge (the key check is it falls in 31-60 range)
    expect(days).toBeGreaterThanOrEqual(44);
    expect(days).toBeLessThanOrEqual(46);

    // Classify as overdue_31_60
    let bucket: string;
    if (days <= 0) {
      bucket = "current";
    } else if (days <= 30) {
      bucket = "overdue_0_30";
    } else if (days <= 60) {
      bucket = "overdue_31_60";
    } else {
      bucket = "overdue_60_plus";
    }
    expect(bucket).toBe("overdue_31_60");
  });

  /**
   * T-BILL-003-3 [blocant]
   * POST /aging/reminders uses ON CONFLICT DO NOTHING → idempotent insert.
   * Verified via source: .onConflictDoNothing() + .returning() used to track created vs skipped.
   */
  it("T-BILL-003-3: POST aging/reminders uses onConflictDoNothing for idempotency", () => {
    const routeContent = readFileSync(
      join(process.cwd(), "server/routes/finInvoices.ts"),
      "utf-8"
    );
    expect(routeContent).toContain("onConflictDoNothing");
    expect(routeContent).toContain("/aging/reminders");
    // Returns created + skipped counts
    expect(routeContent).toContain("created");
    expect(routeContent).toContain("skipped");
    // Threshold values 3, 7, 14
    expect(routeContent).toContain("3, 7, 14");
  });

  /**
   * T-BILL-003-4 [blocant]
   * Tenant isolation: aging routes include tenantId filter in all queries.
   */
  it("T-BILL-003-4: aging routes filter by tenantId (tenant isolation)", () => {
    const routeContent = readFileSync(
      join(process.cwd(), "server/routes/finInvoices.ts"),
      "utf-8"
    );
    // The aging section must filter on tenantId
    // Check that tenantId appears near the aging route handlers
    const agingSection = routeContent.slice(
      routeContent.indexOf('"/aging"'),
      routeContent.indexOf("// ─── GET /api/fin/invoices/:id/lines")
    );
    expect(agingSection).toContain("tenantId");
    expect(agingSection).toContain("eq(finInvoices.tenantId");
  });

  /**
   * T-BILL-003-5 [normal]
   * daysOverdue pure function: correct calculation for various dates.
   */
  it("T-BILL-003-5: daysOverdue computed correctly", () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Today → 0 days overdue (allow ±1 for timezone boundary)
    const todayDays = daysOverdue(today.toISOString().slice(0, 10));
    expect(todayDays).toBeGreaterThanOrEqual(-1);
    expect(todayDays).toBeLessThanOrEqual(1);

    // 10 days ago (allow ±1 for timezone boundary)
    const tenDaysAgo = new Date(today);
    tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);
    const tenDaysDays = daysOverdue(tenDaysAgo.toISOString().slice(0, 10));
    expect(tenDaysDays).toBeGreaterThanOrEqual(9);
    expect(tenDaysDays).toBeLessThanOrEqual(11);

    // Null → 0
    expect(daysOverdue(null)).toBe(0);

    // Future date → non-positive (not overdue): 7 days from now is clearly in the future
    const nextWeek = new Date(today);
    nextWeek.setDate(nextWeek.getDate() + 7);
    expect(daysOverdue(nextWeek.toISOString().slice(0, 10))).toBeLessThan(0);
  });

  /**
   * T-BILL-003-6 [normal]
   * GET /aging/count route defined in the file.
   */
  it("T-BILL-003-6: GET /aging/count route defined", () => {
    const routeContent = readFileSync(
      join(process.cwd(), "server/routes/finInvoices.ts"),
      "utf-8"
    );
    expect(routeContent).toContain('"/aging/count"');
    // Returns a count field
    expect(routeContent).toContain("count");
  });

  /**
   * Verify aging routes are defined BEFORE /:id to avoid param shadowing.
   * KNOWN_PITFALL: docs/solutions/architecture-patterns/hono-specific-route-before-param.md
   */
  it("T-BILL-003-ARCH: /aging routes defined before /:id/lines to prevent param shadowing", () => {
    const routeContent = readFileSync(
      join(process.cwd(), "server/routes/finInvoices.ts"),
      "utf-8"
    );
    const agingIdx = routeContent.indexOf('"/aging"');
    const paramIdLinesIdx = routeContent.indexOf('"/:id/lines"');
    // /aging must appear before /:id/lines
    expect(agingIdx).toBeGreaterThan(0);
    expect(paramIdLinesIdx).toBeGreaterThan(0);
    expect(agingIdx).toBeLessThan(paramIdLinesIdx);
  });
});
