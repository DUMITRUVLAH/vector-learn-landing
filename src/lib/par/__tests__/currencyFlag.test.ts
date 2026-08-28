/**
 * FX-001: steagul valutei se derivă din cod, deci merită blocate exact excepțiile.
 */
import { describe, it, expect } from "vitest";
import { countryOf, flagOf } from "../currencyFlag";

describe("flagOf", () => {
  it("derivă steagul din primele două litere ale codului", () => {
    expect(flagOf("USD")).toBe("🇺🇸");
    expect(flagOf("RON")).toBe("🇷🇴");
    expect(flagOf("UAH")).toBe("🇺🇦");
    expect(flagOf("GBP")).toBe("🇬🇧");
    expect(flagOf("MDL")).toBe("🇲🇩");
  });

  it("dă steagul UE pentru euro, nu al Estoniei", () => {
    // „EU" nu e prefixul unei țări — fără excepția asta, EUR ar căuta ISO 3166 „EU".
    expect(countryOf("EUR")).toBe("EU");
    expect(flagOf("EUR")).toBe("🇪🇺");
  });

  it("nu inventează un steag pentru valutele fără țară", () => {
    // XDR = drepturile speciale de tragere (FMI); un steag ar fi o minciună vizuală.
    expect(flagOf("XDR")).toBeNull();
    expect(flagOf("XAU")).toBeNull();
  });

  it("refuză un cod care nu e ISO 4217", () => {
    expect(flagOf("")).toBeNull();
    expect(flagOf("EURO")).toBeNull();
    expect(flagOf("12")).toBeNull();
  });

  it("acceptă litere mici (codul poate veni din URL)", () => {
    expect(flagOf("eur")).toBe("🇪🇺");
  });
});
