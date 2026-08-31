/**
 * @vitest-environment node
 *
 * Gărzile pure ale auditului de securitate din 29.08.2026. Fiecare test corespunde unei găsiri și
 * PICĂ pe codul de dinainte de reparare — asta e condiția ca el să conteze (CLAUDE.md §3.5.1quater).
 */
import { describe, it, expect, vi } from "vitest";
import { isSafeTenantObjectPath } from "../lib/storage/safePath";
import { neutralizeFormula } from "../lib/fin/exportCsv";
import { minApprovalLimitCents } from "../lib/par/approvalLimit";
import { computeParBodyHash, verifyParBodyHash, type ParBodyForHash } from "../lib/par/integrity";
import { isAllowedResourceUrl } from "../lib/docmerge/htmlToPdf";
import { clientIp } from "../lib/clientIp";
import { isReservedPlatformEmail } from "../lib/platformOwner";

const TENANT = "11111111-1111-1111-1111-111111111111";
const OTHER = "22222222-2222-2222-2222-222222222222";

describe("traversare de cale la storage (finCaptures/finalize)", () => {
  it("[blocant] `..` nu mai trece garda de prefix", () => {
    // Vechea gardă era `path.startsWith(tenantId + "/")`, iar normalizarea de URL rezolvă `..`
    // ÎNAINTE ca cererea să plece: pathname-ul devenea al altui tenant.
    expect(isSafeTenantObjectPath(`${TENANT}/../${OTHER}/factura.pdf`, TENANT)).toBe(false);
    expect(new URL(`https://x/y/${TENANT}/../${OTHER}/f.pdf`).pathname).toBe(`/y/${OTHER}/f.pdf`);
  });
  it("[blocant] refuză alt tenant, subdirectoare și bare inverse", () => {
    expect(isSafeTenantObjectPath(`${OTHER}/f.pdf`, TENANT)).toBe(false);
    expect(isSafeTenantObjectPath(`${TENANT}/sub/f.pdf`, TENANT)).toBe(false);
    expect(isSafeTenantObjectPath(`${TENANT}/..\\f.pdf`, TENANT)).toBe(false);
  });
  it("acceptă calea normală", () => {
    expect(isSafeTenantObjectPath(`${TENANT}/factura 42_v2.pdf`, TENANT)).toBe(true);
  });
});

describe("injecție de formule în CSV", () => {
  it("[blocant] prefixează celulele care ar fi executate de Excel", () => {
    for (const evil of ["=WEBSERVICE(\"http://x\")", "+1+1", "-2+3", "@SUM(A1)", "\tcmd"]) {
      expect(neutralizeFormula(evil).startsWith("'")).toBe(true);
    }
  });
  it("nu atinge un nume obișnuit de beneficiar", () => {
    expect(neutralizeFormula("SRL Vector Academy")).toBe("SRL Vector Academy");
    expect(neutralizeFormula("Ion Popescu-Ion")).toBe("Ion Popescu-Ion");
  });
});

describe("plafonul de aprobare prin delegare", () => {
  const rows = [
    { userId: "delegator", limit: 5_000_00 },
    { userId: "delegat", limit: null },
  ];
  it("[blocant] delegatul fără limită proprie moștenește limita delegatorului", () => {
    // Bug-ul: se citea DOAR rândul celui care apasă → null → „nelimitat".
    expect(minApprovalLimitCents(rows, ["delegat"])).toBe(null);
    expect(minApprovalLimitCents(rows, ["delegat", "delegator"])).toBe(5_000_00);
  });
  it("ia minimul, nu ultima valoare", () => {
    const many = [
      { userId: "a", limit: 900_00 },
      { userId: "b", limit: 100_00 },
      { userId: "c", limit: 500_00 },
    ];
    expect(minApprovalLimitCents(many, ["a", "b", "c"])).toBe(100_00);
  });
  it("ignoră persoanele care nu participă la decizie", () => {
    expect(minApprovalLimitCents([{ userId: "strain", limit: 1 }], ["delegat"])).toBe(null);
  });
});

describe("sigiliul de integritate al cererii", () => {
  const body: ParBodyForHash = {
    requestNo: "PAR-0001", dateOfRequest: "2026-08-29T00:00:00.000Z", requestorTitle: null,
    departmentId: null, dateNeeded: null, projectId: null, budgetCodeId: null, budgetCodeNote: null,
    purpose: "execute_payment", chargeTo: "program", chargeBillingCode: null, endUse: "servicii",
    vendorId: null, payeeName: "SRL Test", payeeIdnp: "1003600000000", payeeIban: "MD24AG000225100013104168",
    payeeBank: "AGRNMD2X", currency: "MDL", totalEstimatedCents: 100_000,
    lineItems: [{ position: 1, description: "audit", quantity: 1, unit: null, unitPriceCents: 100_000, lineTotalCents: 100_000 }],
  };
  const sealed = computeParBodyHash(body);

  it("[blocant] `vendorId` completat automat la plată nu mai declanșează alarma", () => {
    const afterAutolink = { ...body, vendorId: "33333333-3333-3333-3333-333333333333" };
    expect(verifyParBodyHash(afterAutolink, sealed)).toEqual({ valid: true, note: "vendor_autolink" });
  });
  it("[blocant] toleranța NU acoperă schimbarea beneficiarului sau a sumei", () => {
    expect(verifyParBodyHash({ ...body, payeeIban: "MD24AG000225100013104999" }, sealed).valid).toBe(false);
    expect(verifyParBodyHash({ ...body, totalEstimatedCents: 999_999 }, sealed).valid).toBe(false);
    expect(verifyParBodyHash({ ...body, vendorId: "a", payeeName: "Altcineva SRL" }, sealed).valid).toBe(false);
  });
});

describe("randarea PDF a șabloanelor (SSRF)", () => {
  it("[blocant] blochează file://, metadatele instanței și rețeaua privată", () => {
    expect(isAllowedResourceUrl("file:///etc/passwd")).toBe(false);
    expect(isAllowedResourceUrl("http://169.254.169.254/latest/meta-data/")).toBe(false);
    expect(isAllowedResourceUrl("http://localhost:3000/api/par")).toBe(false);
    expect(isAllowedResourceUrl("http://10.0.0.5/")).toBe(false);
    expect(isAllowedResourceUrl("http://192.168.1.5/")).toBe(false);
  });
  it("lasă fonturile și imaginile publice", () => {
    expect(isAllowedResourceUrl("https://fonts.gstatic.com/s/x.woff2")).toBe(true);
    expect(isAllowedResourceUrl("data:image/png;base64,AAAA")).toBe(true);
  });
});

describe("IP-ul clientului în spatele proxy-ului", () => {
  const ctx = (headers: Record<string, string>) =>
    ({ req: { header: (n: string) => headers[n.toLowerCase()] } }) as never;

  it("[blocant] ia elementul pus de proxy, nu pe cel trimis de client", () => {
    // Vechea implementare lua primul element → cheia de rate-limit era aleasă de atacator.
    expect(clientIp(ctx({ "x-forwarded-for": "1.2.3.4, 203.0.113.9" }))).toBe("203.0.113.9");
  });
  it("preferă antetul scris de Vercel", () => {
    expect(clientIp(ctx({ "x-vercel-forwarded-for": "203.0.113.9", "x-forwarded-for": "1.2.3.4" })))
      .toBe("203.0.113.9");
  });
  it("fără proxy întoarce null, nu o valoare inventată", () => {
    expect(clientIp(ctx({}))).toBe(null);
  });
});

describe("emailurile rezervate ale platformei", () => {
  it("[blocant] emailul de proprietar e recunoscut ca rezervat, indiferent de scriere", () => {
    vi.stubEnv("PLATFORM_ADMIN_EMAILS", "");
    expect(isReservedPlatformEmail("vlah.business@gmail.com")).toBe(true);
    expect(isReservedPlatformEmail("  VLAH.Business@Gmail.com ")).toBe(true);
    expect(isReservedPlatformEmail("altcineva@gmail.com")).toBe(false);
    expect(isReservedPlatformEmail(null)).toBe(false);
    vi.unstubAllEnvs();
  });
});
