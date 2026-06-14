/**
 * AGREEMENT-001 — Schema fin_agreements + fin_agreement_services
 *
 * T-AGREEMENT-001-1 [blocant] finAgreements + finAgreementServices exportate din schema/index.ts
 * T-AGREEMENT-001-2 [blocant] fin_agreement_status enum acceptă draft, active, paused, cancelled
 * T-AGREEMENT-001-3 [blocant] fin_billing_type enum acceptă recurring și one_time
 * T-AGREEMENT-001-4 [blocant] Fișierul drizzle/0116_fin_agreements.sql există și conține CREATE TABLE fin_agreements
 * T-AGREEMENT-001-5 [normal]  finAgreementServices are câmpul nextBillDate
 * T-AGREEMENT-001-6 [normal]  finAgreementServices are câmpul unitPriceCents NOT NULL
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

describe("AGREEMENT-001 — schema fin_agreements + fin_agreement_services", () => {
  /**
   * T-AGREEMENT-001-1 [blocant]
   * Both tables must be exported from the schema index.
   */
  it("T-AGREEMENT-001-1: finAgreements and finAgreementServices exported from schema/index.ts", async () => {
    const indexContent = readFileSync(
      join(process.cwd(), "server/db/schema/index.ts"),
      "utf-8"
    );
    expect(indexContent).toContain("finAgreements");

    // Also import the module directly to verify the exports
    const schema = await import("../../../server/db/schema/finAgreements");
    expect(schema.finAgreements).toBeDefined();
    expect(schema.finAgreementServices).toBeDefined();
  });

  /**
   * T-AGREEMENT-001-2 [blocant]
   * fin_agreement_status enum must accept all four status values.
   */
  it("T-AGREEMENT-001-2: finAgreementStatusEnum has draft/active/paused/cancelled", async () => {
    const { finAgreementStatusEnum } = await import("../../../server/db/schema/finAgreements");
    // pgEnum stores values in enumValues property
    const values = finAgreementStatusEnum.enumValues;
    expect(values).toContain("draft");
    expect(values).toContain("active");
    expect(values).toContain("paused");
    expect(values).toContain("cancelled");
    expect(values).toHaveLength(4);
  });

  /**
   * T-AGREEMENT-001-3 [blocant]
   * fin_billing_type enum must accept recurring and one_time.
   */
  it("T-AGREEMENT-001-3: finBillingTypeEnum has recurring and one_time", async () => {
    const { finBillingTypeEnum } = await import("../../../server/db/schema/finAgreements");
    const values = finBillingTypeEnum.enumValues;
    expect(values).toContain("recurring");
    expect(values).toContain("one_time");
    expect(values).toHaveLength(2);
  });

  /**
   * T-AGREEMENT-001-4 [blocant]
   * Migration file 0116_fin_agreements.sql must exist and create fin_agreements.
   */
  it("T-AGREEMENT-001-4: drizzle/0116_fin_agreements.sql exists and creates fin_agreements", () => {
    const migrationPath = join(process.cwd(), "drizzle/0116_fin_agreements.sql");
    expect(existsSync(migrationPath)).toBe(true);

    const content = readFileSync(migrationPath, "utf-8");
    expect(content).toContain("CREATE TABLE");
    expect(content).toContain("fin_agreements");
    expect(content).toContain("fin_agreement_services");
    // Must have statement breakpoints (migration discipline)
    expect(content).toContain("--> statement-breakpoint");
  });

  /**
   * T-AGREEMENT-001-5 [normal]
   * finAgreementServices must define the nextBillDate column.
   */
  it("T-AGREEMENT-001-5: finAgreementServices has nextBillDate column", async () => {
    const { finAgreementServices } = await import("../../../server/db/schema/finAgreements");
    // Drizzle table columns are accessible via the table's column map
    expect("nextBillDate" in finAgreementServices).toBe(true);
  });

  /**
   * T-AGREEMENT-001-6 [normal]
   * finAgreementServices must define unitPriceCents as an integer column.
   */
  it("T-AGREEMENT-001-6: finAgreementServices has unitPriceCents column (integer)", async () => {
    const { finAgreementServices } = await import("../../../server/db/schema/finAgreements");
    expect("unitPriceCents" in finAgreementServices).toBe(true);

    // Verify it's an integer type via column definition
    const schemaContent = readFileSync(
      join(process.cwd(), "server/db/schema/finAgreements.ts"),
      "utf-8"
    );
    expect(schemaContent).toContain("unitPriceCents");
    expect(schemaContent).toContain("integer(");
  });

  /**
   * Additional structural check: recurrencePeriod enum has monthly/quarterly/yearly
   */
  it("finRecurrencePeriodEnum has monthly/quarterly/yearly", async () => {
    const { finRecurrencePeriodEnum } = await import("../../../server/db/schema/finAgreements");
    const values = finRecurrencePeriodEnum.enumValues;
    expect(values).toContain("monthly");
    expect(values).toContain("quarterly");
    expect(values).toContain("yearly");
  });
});
