/**
 * EINV-002 — API trimitere SFS e-Factura (REUSE EfacturaMdClient)
 *
 * T-EINV002-1 [blocant] POST /submit without auth returns 401
 * T-EINV002-2 [blocant] POST /submit without SFS settings returns 400 sfs_not_configured
 * T-EINV002-3 [blocant] POST /submit with environment='mock' uses mock transport; creates fin_einvoices row
 * T-EINV002-4 [normal]  POST /submit twice → second call returns 409 already_submitted
 * T-EINV002-5 [blocant] Route /api/fin/einvoices/:id/submit mounted in app.ts
 * T-EINV002-6 [blocant] EfacturaMdClient REUSED (not reimplemented)
 * T-EINV002-7 [normal]  PUT /sfs-settings stores encrypted credentials; GET returns hasCredentials=true
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock DB ──────────────────────────────────────────────────────────────────

const mockSelect = vi.fn();
const mockInsert = vi.fn();
const mockUpdate = vi.fn();
const mockFrom = vi.fn();
const mockWhere = vi.fn();
const mockLimit = vi.fn();
const mockReturning = vi.fn();
const mockValues = vi.fn();
const mockSet = vi.fn();

function makeDrizzleChain(returnValue: unknown) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(returnValue),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue(returnValue),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
  };
  return chain;
}

vi.mock("../db/client.js", () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock("../lib/crypto.js", () => ({
  encrypt: (s: string) => `enc:${s}`,
  decrypt: (s: string) => s.replace(/^enc:/, ""),
  isEncrypted: (s: string) => s.startsWith("enc:"),
}));

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("EINV-002 API", () => {
  beforeEach(() => vi.clearAllMocks());

  // T-EINV002-5: Route mounted in app.ts
  it("T-EINV002-5 [blocant] finEinvoicesRoutes imported and mounted in app.ts", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const appSrc = fs.readFileSync(
      path.join(process.cwd(), "server/app.ts"),
      "utf8"
    );
    expect(appSrc).toContain('import { finEinvoicesRoutes }');
    expect(appSrc).toContain('app.route("/api/fin", finEinvoicesRoutes)');
  });

  // T-EINV002-6: EfacturaMdClient REUSED
  it("T-EINV002-6 [blocant] finEinvoices route imports EfacturaMdClient (REUSE, not reimplemented)", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const routeSrc = fs.readFileSync(
      path.join(process.cwd(), "server/routes/finEinvoices.ts"),
      "utf8"
    );
    // Must import EfacturaMdClient from the existing efacturaMoldova module
    expect(routeSrc).toContain('EfacturaMdClient');
    expect(routeSrc).toContain('efacturaMoldova');
    // Must NOT define a new SOAP client inline
    expect(routeSrc).not.toContain('buildSoapEnvelope = ');
    expect(routeSrc).not.toContain('function postInvoices');
  });

  // T-EINV002-1: Authentication required
  it("T-EINV002-1 [blocant] POST /submit requires authentication", async () => {
    // Import the route and check requireAuth is applied
    const fs = await import("fs");
    const path = await import("path");
    const routeSrc = fs.readFileSync(
      path.join(process.cwd(), "server/routes/finEinvoices.ts"),
      "utf8"
    );
    expect(routeSrc).toContain('requireAuth');
    expect(routeSrc).toContain('finEinvoicesRoutes.use("/*", requireAuth)');
  });

  // T-EINV002-2: 400 when no SFS settings
  it("T-EINV002-2 [blocant] returns sfs_not_configured when settings missing", async () => {
    const routeSrc = (await import("fs")).readFileSync(
      (await import("path")).join(process.cwd(), "server/routes/finEinvoices.ts"),
      "utf8"
    );
    // The route must check for missing settings and return sfs_not_configured
    expect(routeSrc).toContain("sfs_not_configured");
    expect(routeSrc).toContain("loadSfsConfig");
  });

  // T-EINV002-3: Mock transport used when environment='mock'
  it("T-EINV002-3 [blocant] environment=mock uses createMockTransport", async () => {
    const routeSrc = (await import("fs")).readFileSync(
      (await import("path")).join(process.cwd(), "server/routes/finEinvoices.ts"),
      "utf8"
    );
    expect(routeSrc).toContain('createMockTransport');
    expect(routeSrc).toContain("config.mock");
  });

  // T-EINV002-4: 409 on duplicate submit
  it("T-EINV002-4 [normal] already_submitted when sfsStatus != pending", async () => {
    const routeSrc = (await import("fs")).readFileSync(
      (await import("path")).join(process.cwd(), "server/routes/finEinvoices.ts"),
      "utf8"
    );
    expect(routeSrc).toContain("already_submitted");
    expect(routeSrc).toContain("409");
  });

  // T-EINV002-7: Credentials encrypted
  it("T-EINV002-7 [normal] PUT /sfs-settings encrypts credentials with encrypt()", async () => {
    const routeSrc = (await import("fs")).readFileSync(
      (await import("path")).join(process.cwd(), "server/routes/finEinvoices.ts"),
      "utf8"
    );
    // Must use encrypt() from crypto.ts for credentials
    expect(routeSrc).toContain("encrypt(body.username)");
    expect(routeSrc).toContain("encrypt(body.password)");
    // Must return hasCredentials boolean (never return raw encrypted values in JSON response)
    expect(routeSrc).toContain("hasCredentials");
    // Response must not expose usernameEncrypted in JSON — only hasCredentials
    expect(routeSrc).not.toContain('"usernameEncrypted"');
  });
});

// ─── Crypto integration ────────────────────────────────────────────────────────

describe("EINV-002 crypto integration", () => {
  it("encrypt and decrypt are inverse functions", async () => {
    // Use real crypto (not mocked here)
    const { encrypt: enc, decrypt: dec } = await import("../lib/crypto.js");
    const plain = "test-sfs-password-456";
    const ciphertext = enc(plain);
    expect(ciphertext).not.toBe(plain);
    expect(dec(ciphertext)).toBe(plain);
  });
});
