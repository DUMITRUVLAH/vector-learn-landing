/**
 * CRM-D02 — oferta pornește din ce știe deja leadul, nu de la „Total 0,00 MDL".
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/api/crm", () => ({ listCrmProducts: vi.fn() }));
vi.mock("@/lib/api/docs", () => ({ listDocTemplates: vi.fn() }));
vi.mock("@/lib/api/crmDocuments", () => ({ createCrmDocument: vi.fn(), CRM_DOC_KIND_LABELS: {} }));

const { prefillLines, parsePrice } = await import("@/components/crm/NewDocumentDialog");

const catalog = [{ id: "p1", listPriceCents: 16_000_00 }];

describe("prefillLines", () => {
  it("[blocant] produsul leadului intră pe ofertă, cu cantitatea lui", () => {
    const out = prefillLines({ productId: "p1", productQty: 2, valueCents: 32_000_00 }, catalog);
    // 32.000 pentru 2 = prețul de listă → câmpul de preț rămâne gol („din catalog").
    expect(out.chosen).toEqual([{ productId: "p1", quantity: 2, priceText: "" }]);
    expect(out.freeLines).toEqual([]);
  });

  it("[blocant] valoarea negociată bate lista, împărțită pe cantitate", () => {
    const out = prefillLines({ productId: "p1", productQty: 1, valueCents: 29_000_00 }, catalog);
    expect(out.chosen[0].priceText).toBe("29000,00");
    // Ce scriem în câmp trebuie să se citească înapoi exact — altfel cade pe prețul de listă.
    expect(parsePrice(out.chosen[0].priceText)).toBe(29_000_00);
  });

  it("[blocant] fără produs din catalog, valoarea devine un rând scris cu ce se vinde", () => {
    const out = prefillLines({ valueCents: 4_500_00, description: "Sesiune de follow-up" }, catalog);
    expect(out.chosen).toEqual([]);
    expect(out.freeLines[0]).toMatchObject({ description: "Sesiune de follow-up", quantity: 1 });
    expect(parsePrice(out.freeLines[0].priceText)).toBe(4_500_00);
  });

  it("un lead fără valoare și fără produs pornește gol, nu cu un rând de 0", () => {
    expect(prefillLines({ valueCents: 0 }, catalog)).toEqual({ chosen: [], freeLines: [] });
    expect(prefillLines(undefined, catalog)).toEqual({ chosen: [], freeLines: [] });
  });

  it("un produs dispărut din catalog nu inventează o poziție fantomă", () => {
    const out = prefillLines({ productId: "sters", valueCents: 1_000_00, description: "Curs" }, catalog);
    expect(out.chosen).toEqual([]);
    expect(out.freeLines[0].description).toBe("Curs");
  });
});
