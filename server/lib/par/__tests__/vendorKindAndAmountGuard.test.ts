/**
 * Garda sumei pe AMBELE căi ale extractorului + tipul beneficiarului + default-ul din heal.
 * Cazurile vin din actele reale ATIC rejucate pe 24.09.2026 (vezi amountSanity.ts, vendorKind.ts).
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("../../ai/client", () => ({ callAi: vi.fn() }));
import { callAi } from "../../ai/client";
import { extractParParties } from "../../ai/parExtractor";
import { vendorKindFor } from "../vendorKind";
import { literalDefault } from "../../../db/literalDefault";
import { getTableColumns } from "drizzle-orm";
import { parVendors, parSettings } from "../../../db/schema/par";

const mockCallAi = vi.mocked(callAi);
const opts = { tenantId: "t", userId: "u", prefillId: "p" };

// Extrasul Moldcell (xlsx): antetul tabelului e urmat de rândul cu codul fiscal ATIC, iar parserul
// de rezervă îl lua drept „Valoarea totală" — 1 006 600 034 927,00 lei.
const MOLDCELL = `Extras din cont
Plata de abonament\tbold\t2687.51
TOTAL\t2729.18\t4977.48
Valoarea totală a mărfurilor, serviciilor, lei
1006600034927\t0\t0\t0`;

describe("extractParParties — suma verificată față de text pe ambele căi", () => {
  it("[blocant] calea de rezervă (fără model) nu mai întoarce codul fiscal ca sumă", async () => {
    mockCallAi.mockResolvedValueOnce({ isStub: true, text: "", unavailable: "no_key" } as never);
    const ex = await extractParParties(MOLDCELL, opts);
    expect(ex.amountCents).not.toBe(100660003492700);
  });

  it("[blocant] modelul care taie banii: 1508 → 1508,51 din textul facturii", async () => {
    mockCallAi.mockResolvedValueOnce({
      isStub: false,
      text: JSON.stringify({ parties: [], amount: { value: 1508, confidence: 0.9 }, currency: "MDL", line_items: [{ description: "servicii", quantity: 1, unit_price: 1508 }] }),
    } as never);
    const ex = await extractParParties("12. TOTAL (pe factura fiscală) 1257,09 X 251,42 1508,51", opts);
    expect(ex.amountCents).toBe(150851);
    expect(ex.lineItems?.[0].unitPriceCents).toBe(150851);
  });

  it("[blocant] modelul care întoarce numărul facturii ca sumă → nedetectat", async () => {
    mockCallAi.mockResolvedValueOnce({
      isStub: false,
      text: JSON.stringify({ parties: [], amount: { value: 758854, confidence: 0.8 }, currency: "MDL" }),
    } as never);
    const ex = await extractParParties("Серия, № EBK000758854\nTOTAL 1508,51", opts);
    expect(ex.amountCents).toBeNull();
  });
});

describe("vendorKindFor", () => {
  it("tipul ales pe cerere are prioritate", () => {
    expect(vendorKindFor({ payeeType: "fizic", idnp: "1014600022332" })).toBe("individual");
    expect(vendorKindFor({ payeeType: "juridic", name: "Ion Popescu" })).toBe("company");
  });
  it("[blocant] codul fiscal: IDNO (1…) = companie, IDNP (0…/2…) = persoană", () => {
    expect(vendorKindFor({ idnp: "1014600022332", name: "NEWS MAKER" })).toBe("company");
    expect(vendorKindFor({ idnp: "2001007259509", name: "BARBAROS OXANA" })).toBe("individual");
    expect(vendorKindFor({ idnp: "0973005023553", name: "ORIOL IRINA" })).toBe("individual");
  });
  it("fără cod, denumirea decide", () => {
    expect(vendorKindFor({ name: "Explor Tur SRL" })).toBe("company");
    expect(vendorKindFor({ name: "Ana Chirita" })).toBe("individual");
  });
});

describe("literalDefault — heal-ul din sync-schema poartă default-ul coloanei", () => {
  it("[blocant] par_vendors.kind → 'individual', par_settings.enforce_three_way_match → false", () => {
    expect(literalDefault(getTableColumns(parVendors).kind)).toBe("'individual'");
    expect(literalDefault(getTableColumns(parSettings).enforceThreeWayMatch)).toBe("false");
  });
  it("expresiile SQL (defaultNow/defaultRandom) nu se copiază", () => {
    expect(literalDefault(getTableColumns(parVendors).createdAt)).toBeNull();
    expect(literalDefault(getTableColumns(parVendors).id)).toBeNull();
  });
});
