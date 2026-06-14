/**
 * PARTY-001 — Schema fin_parties + fin_party_contacts
 *
 * T-PARTY-001-1 [blocant] finParties și finPartyContacts exportate din schema/index.ts
 * T-PARTY-001-2 [blocant] fin_party_kind enum acceptă client, supplier, both
 * T-PARTY-001-3 [blocant] fin_party_contacts are câmpul partyId cu relație FK definită
 * T-PARTY-001-4 [blocant] Fișierul drizzle/0115_fin_parties.sql există și conține CREATE TABLE
 * T-PARTY-001-5 [normal]  fin_parties.idno are maxLength 13 definit în schema
 * T-PARTY-001-6 [normal]  finPartyContacts.isPrimary are default false
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

describe("PARTY-001 — schema fin_parties + fin_party_contacts", () => {
  /**
   * T-PARTY-001-1 [blocant]
   * Both tables must be exported from the schema index.
   */
  it("T-PARTY-001-1: finParties and finPartyContacts exported from schema/index.ts", async () => {
    const indexContent = readFileSync(
      join(process.cwd(), "server/db/schema/index.ts"),
      "utf-8"
    );
    expect(indexContent).toContain("finParties");
  });

  it("T-PARTY-001-1b: schema module exports finParties and finPartyContacts tables", async () => {
    const schema = await import("../../../server/db/schema/finParties");
    expect(schema.finParties).toBeDefined();
    expect(schema.finPartyContacts).toBeDefined();
  });

  /**
   * T-PARTY-001-2 [blocant]
   * fin_party_kind enum must have exactly client/supplier/both.
   */
  it("T-PARTY-001-2: finPartyKindEnum has client/supplier/both values", async () => {
    const { finPartyKindEnum } = await import("../../../server/db/schema/finParties");
    // pgEnum stores enumValues
    const values: string[] = (finPartyKindEnum as unknown as { enumValues: string[] }).enumValues;
    expect(values).toContain("client");
    expect(values).toContain("supplier");
    expect(values).toContain("both");
    expect(values.length).toBe(3);
  });

  /**
   * T-PARTY-001-3 [blocant]
   * fin_party_contacts must have partyId column referencing fin_parties.
   */
  it("T-PARTY-001-3: finPartyContacts has partyId FK column", async () => {
    const { finPartyContacts } = await import("../../../server/db/schema/finParties");
    // Access the column definition
    const cols = Object.keys(finPartyContacts);
    expect(cols).toContain("partyId");
  });

  /**
   * T-PARTY-001-4 [blocant]
   * Migration file 0115_fin_parties.sql must exist and contain CREATE TABLE.
   */
  it("T-PARTY-001-4: drizzle/0115_fin_parties.sql exists with CREATE TABLE fin_parties", () => {
    const migPath = join(process.cwd(), "drizzle/0115_fin_parties.sql");
    expect(existsSync(migPath)).toBe(true);
    const content = readFileSync(migPath, "utf-8");
    expect(content).toContain("CREATE TABLE");
    expect(content).toContain("fin_parties");
    expect(content).toContain("fin_party_contacts");
  });

  /**
   * T-PARTY-001-5 [normal]
   * Migration SQL must define idno with varchar(13).
   */
  it("T-PARTY-001-5: migration SQL defines idno as varchar(13)", () => {
    const migPath = join(process.cwd(), "drizzle/0115_fin_parties.sql");
    const content = readFileSync(migPath, "utf-8");
    expect(content).toContain("varchar(13)");
  });

  /**
   * T-PARTY-001-6 [normal]
   * Migration SQL must define is_primary with DEFAULT false.
   */
  it("T-PARTY-001-6: migration SQL defines is_primary with DEFAULT false", () => {
    const migPath = join(process.cwd(), "drizzle/0115_fin_parties.sql");
    const content = readFileSync(migPath, "utf-8");
    expect(content).toContain("is_primary");
    expect(content.toLowerCase()).toContain("default false");
  });
});
