/**
 * EINV-001 — fin_einvoices + fin_sfs_settings schema tests
 *
 * T-EINV001-1 [blocant] Schema imports work without crash
 * T-EINV001-2 [blocant] finEinvoices and finSfsSettings exported from schema/index
 * T-EINV001-3 [blocant] crypto.ts encrypt→decrypt roundtrip
 * T-EINV001-4 [normal]  fin_sfs_settings table name is correct
 * T-EINV001-5 [normal]  fin_einvoices has required columns
 * T-EINV001-6 [blocant] _journal.json has idx=118, no duplicate idx
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

describe("EINV-001 schema", () => {

  // T-EINV001-1: Schema imports work without crash
  it("T-EINV001-1 [blocant] finEinvoices schema imports without crash", async () => {
    const { finEinvoices, finSfsSettings } = await import("../db/schema/finEinvoices.js");
    expect(finEinvoices).toBeDefined();
    expect(finSfsSettings).toBeDefined();
  });

  // T-EINV001-2: Schema index exports both tables
  it("T-EINV001-2 [blocant] finEinvoices and finSfsSettings exported from schema/index", async () => {
    const schema = await import("../db/schema/index.js");
    expect("finEinvoices" in schema).toBe(true);
    expect("finSfsSettings" in schema).toBe(true);
  });

  // T-EINV001-3: crypto roundtrip
  it("T-EINV001-3 [blocant] AES-256-GCM encrypt→decrypt roundtrip", async () => {
    const { encrypt, decrypt } = await import("../lib/crypto.js");
    const plaintext = "super-secret-sfs-password-123";
    const encrypted = encrypt(plaintext);
    // Must not be plaintext
    expect(encrypted).not.toBe(plaintext);
    // Must be in iv:tag:ciphertext format
    expect(encrypted.split(":")).toHaveLength(3);
    // Must decrypt back correctly
    const decrypted = decrypt(encrypted);
    expect(decrypted).toBe(plaintext);
  });

  // T-EINV001-4: table names — verify via SQL column names in the table object
  it("T-EINV001-4 [normal] fin_sfs_settings table object contains idno column", async () => {
    const { finSfsSettings } = await import("../db/schema/finEinvoices.js");
    // Drizzle table contains column definitions accessible by camelCase key
    expect(finSfsSettings.idno).toBeDefined();
    expect(finSfsSettings.bankAccount).toBeDefined();
    expect(finSfsSettings.environment).toBeDefined();
    expect(finSfsSettings.usernameEncrypted).toBeDefined();
  });

  // T-EINV001-5: required columns exist
  it("T-EINV001-5 [normal] fin_einvoices has required columns", async () => {
    const { finEinvoices } = await import("../db/schema/finEinvoices.js");
    const cols = Object.keys(finEinvoices);
    expect(cols).toContain("id");
    expect(cols).toContain("tenantId");
    expect(cols).toContain("finInvoiceId");
    expect(cols).toContain("sfsStatus");
    expect(cols).toContain("submittedAt");
    expect(cols).toContain("lastSyncAt");
  });

  // T-EINV001-6: journal has idx=118, no duplicates
  it("T-EINV001-6 [blocant] _journal.json has idx=118, no duplicate idx", () => {
    const journalPath = join(process.cwd(), "drizzle/meta/_journal.json");
    const journal = JSON.parse(readFileSync(journalPath, "utf8"));
    const entries = journal.entries as Array<{ idx: number; tag: string }>;

    // idx=118 must exist
    const entry118 = entries.find((e) => e.idx === 118);
    expect(entry118).toBeDefined();
    expect(entry118?.tag).toBe("0118_fin_einvoices");

    // No duplicate idx values
    const idxValues = entries.map((e) => e.idx);
    const unique = new Set(idxValues);
    expect(unique.size).toBe(idxValues.length);
  });
});
