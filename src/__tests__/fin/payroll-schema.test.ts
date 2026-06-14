/**
 * PAY-001 — Teste schema finPayroll
 *
 * T-PAY-001-2 [blocant]: Given schema importată, When accesăm tabelele,
 *                        Then nu aruncă eroare (tabelul există în Drizzle registry)
 * T-PAY-001-3 [blocant]: Build + export curate (verificat prin import)
 * T-PAY-001-4 [normal]:  Tipurile TS corecte
 */

import { describe, it, expect } from "vitest";
import {
  finEmployees,
  finPayrollRuns,
  finPayrollItems,
  finEmployeeContractTypeEnum,
  finEmployeeStatusEnum,
  finPayrollRunStatusEnum,
  FIN_EMPLOYEE_CONTRACT_TYPE_LABELS,
  FIN_EMPLOYEE_STATUS_LABELS,
  FIN_PAYROLL_RUN_STATUS_LABELS,
} from "../../../server/db/schema/finPayroll";

// T-PAY-001-2 [blocant] — tabelele sunt importate corect din schema
describe("finPayroll schema import", () => {
  it("finEmployees — tabelul există în Drizzle registry", () => {
    expect(finEmployees).toBeDefined();
    // Verificăm că are câmpul id (PK)
    expect(finEmployees.id).toBeDefined();
    expect(finEmployees.tenantId).toBeDefined();
    expect(finEmployees.fullName).toBeDefined();
    expect(finEmployees.baseSalaryCents).toBeDefined();
  });

  it("finPayrollRuns — tabelul există cu câmpul periodMonth", () => {
    expect(finPayrollRuns).toBeDefined();
    expect(finPayrollRuns.periodMonth).toBeDefined();
    expect(finPayrollRuns.status).toBeDefined();
  });

  it("finPayrollItems — tabelul există cu FK-urile runId + employeeId", () => {
    expect(finPayrollItems).toBeDefined();
    expect(finPayrollItems.runId).toBeDefined();
    expect(finPayrollItems.employeeId).toBeDefined();
    expect(finPayrollItems.grossCents).toBeDefined();
    expect(finPayrollItems.netCents).toBeDefined();
    expect(finPayrollItems.employerCostCents).toBeDefined();
    expect(finPayrollItems.deductionsJsonb).toBeDefined();
  });
});

// T-PAY-001-4 [normal] — enum-urile și label-urile sunt corecte
describe("finPayroll enums + labels", () => {
  it("contract_type enum: employee + contractor", () => {
    const vals = finEmployeeContractTypeEnum.enumValues;
    expect(vals).toContain("employee");
    expect(vals).toContain("contractor");
  });

  it("employee status enum: active + inactive", () => {
    const vals = finEmployeeStatusEnum.enumValues;
    expect(vals).toContain("active");
    expect(vals).toContain("inactive");
  });

  it("payroll run status: draft + confirmed + paid", () => {
    const vals = finPayrollRunStatusEnum.enumValues;
    expect(vals).toContain("draft");
    expect(vals).toContain("confirmed");
    expect(vals).toContain("paid");
  });

  it("label maps corecte (romanian)", () => {
    expect(FIN_EMPLOYEE_CONTRACT_TYPE_LABELS["employee"]).toBe("Angajat (CIM)");
    expect(FIN_EMPLOYEE_CONTRACT_TYPE_LABELS["contractor"]).toBe("Prestator (PFA/SRL)");
    expect(FIN_EMPLOYEE_STATUS_LABELS["active"]).toBe("Activ");
    expect(FIN_PAYROLL_RUN_STATUS_LABELS["confirmed"]).toBe("Confirmat");
    expect(FIN_PAYROLL_RUN_STATUS_LABELS["paid"]).toBe("Plătit");
  });
});
