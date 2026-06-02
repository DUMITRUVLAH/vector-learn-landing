/**
 * CONT-PLATA — unit tests for the contafirm.md registry proxy normalization.
 * Upstream `fetch` is mocked so the test is offline and deterministic, while still
 * asserting the snake_case→camelCase mapping the rest of the app depends on.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  searchCompanies,
  getCompanyByIdno,
  RegistryError,
} from "../lib/companyRegistry";

function mockFetch(status: number, body: unknown) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("searchCompanies", () => {
  it("T-REG-1 [blocant] — maps registry rows to camelCase", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch(200, {
        data: [
          {
            id: 1,
            idno: "1003600021533",
            name: "ACME SRL",
            status: "active",
            legal_form: "SRL",
            registration_date: "2001-05-31",
            liquidation_date: "",
            cuatm_code: "150",
            address: "str. Test 1",
            city: "CHIȘINĂU",
          },
        ],
      })
    );
    const rows = await searchCompanies("acme");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      idno: "1003600021533",
      name: "ACME SRL",
      legalForm: "SRL",
      cuatmCode: "150",
      city: "CHIȘINĂU",
    });
  });

  it("T-REG-2 — empty data array yields empty result", async () => {
    vi.stubGlobal("fetch", mockFetch(200, { data: [] }));
    expect(await searchCompanies("zzz")).toEqual([]);
  });

  it("T-REG-3 — upstream 5xx becomes RegistryError 502", async () => {
    vi.stubGlobal("fetch", mockFetch(500, {}));
    await expect(searchCompanies("x")).rejects.toBeInstanceOf(RegistryError);
  });
});

describe("getCompanyByIdno", () => {
  it("T-REG-4 [blocant] — maps detail incl. activities + contacts", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch(200, {
        data: {
          id: 2,
          idno: "1003600021533",
          name: "ACME SRL",
          status: "active",
          legal_form: "SRL",
          registration_date: "2001-05-31",
          liquidation_date: "",
          cuatm_code: "150",
          address: "str. Test 1",
          city: "CHIȘINĂU",
          activities: { licensed: ["a"], unlicensed: ["b", "c"] },
          contacts: {
            website_url: "https://acme.md",
            emails: ["info@acme.md"],
            phones: ["+37322000000"],
            social_links: [],
          },
        },
      })
    );
    const d = await getCompanyByIdno("1003600021533");
    expect(d.name).toBe("ACME SRL");
    expect(d.activities.unlicensed).toEqual(["b", "c"]);
    expect(d.contacts.emails).toEqual(["info@acme.md"]);
    expect(d.contacts.websiteUrl).toBe("https://acme.md");
  });

  it("T-REG-5 [blocant] — 404 becomes RegistryError(404)", async () => {
    vi.stubGlobal("fetch", mockFetch(404, { message: "not found" }));
    await expect(getCompanyByIdno("0000000000000")).rejects.toMatchObject({ status: 404 });
  });

  it("T-REG-6 — null contacts object normalizes to empty arrays", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch(200, {
        data: {
          id: 3,
          idno: "x",
          name: "NoContacts SRL",
          status: "active",
          legal_form: null,
          registration_date: "",
          liquidation_date: "",
          cuatm_code: null,
          address: null,
          city: null,
          activities: { licensed: [], unlicensed: [] },
          contacts: {
            website_url: null,
            emails: [],
            phones: [],
            social_links: [],
          },
        },
      })
    );
    const d = await getCompanyByIdno("x");
    expect(d.contacts.emails).toEqual([]);
    expect(d.contacts.websiteUrl).toBeNull();
  });
});
