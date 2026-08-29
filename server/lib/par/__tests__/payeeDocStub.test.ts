/**
 * Actele personale ale beneficiarului — extragerea deterministă.
 *
 * Textele de mai jos imită layout-ul REAL al actelor moldovenești (buletin cu etichete
 * bilingve, certificat de rechizite bancare, patentă de întreprinzător). Fără cheie AI acesta
 * ESTE parserul care rulează în producție, deci e testat ca atare.
 */
import { describe, it, expect } from "vitest";
import { detectPayeeDocKind, parsePayeeDoc } from "../payeeDocStub";

const BULETIN = `REPUBLICA MOLDOVA
BULETIN DE IDENTITATE / IDENTITY CARD
Nume / Surname
ROITMAN
Prenume / Given names
DARIA
Cetățenia / Nationality  MDA
IDNP  2008001007903
Data nașterii / Date of birth  12.03.1988
Domiciliu: mun. Chișinău, str. Ion Creangă 45, ap. 12
Seria și nr. actului A 12345678`;

const RECHIZITE = `BC «Moldindconbank» S.A. fil. Botanica
CERTIFICAT privind rechizitele bancare
Titular: ROITMAN DARIA
Cod fiscal: 2008001007903
Cont curent IBAN: MD48ML000002259A19498121
Banca: BC «Moldindconbank» S.A.
Cod bancar (BIC): MOLDMD2X322`;

const PATENTA = `PATENTA DE ÎNTREPRINZĂTOR
seria AA nr. 0123456
Titularul patentei: ROITMAN DARIA
IDNP 2008001007903
Genul de activitate: servicii de traducere
Valabilă de la 01.08.2026 până la 31.08.2026`;

describe("detectPayeeDocKind", () => {
  it("recunoaște fiecare tip de act după cuvintele proprii lui", () => {
    expect(detectPayeeDocKind(BULETIN)).toBe("buletin");
    expect(detectPayeeDocKind(RECHIZITE)).toBe("rechizite");
    expect(detectPayeeDocKind(PATENTA)).toBe("patenta");
    expect(detectPayeeDocKind("o listă de cumpărături")).toBe("unknown");
  });
});

describe("parsePayeeDoc — buletin", () => {
  const r = parsePayeeDoc(BULETIN, "buletin");
  it("ia numele în ordinea Nume Prenume, de pe rândul de sub etichetă", () => {
    expect(r.name).toBe("ROITMAN DARIA");
  });
  it("ia IDNP-ul etichetat, nu seria actului", () => {
    expect(r.idnp).toBe("2008001007903");
  });
  it("ia domiciliul", () => {
    expect(r.address).toContain("Ion Creangă 45");
  });
  it("nu inventează rechizite bancare dintr-un buletin", () => {
    expect(r.iban).toBeNull();
    expect(r.patentValidUntil).toBeNull();
  });
});

describe("parsePayeeDoc — rechizite bancare", () => {
  const r = parsePayeeDoc(RECHIZITE, "rechizite");
  it("ia IBAN-ul verificat mod-97", () => {
    expect(r.iban).toBe("MD48ML000002259A19498121");
  });
  it("ia banca și codul bancar", () => {
    expect(r.bank).toContain("Moldindconbank");
    expect(r.bic).toBe("MOLDMD2X322");
  });
  it("ia codul fiscal al titularului", () => {
    expect(r.idnp).toBe("2008001007903");
  });
});

describe("parsePayeeDoc — patentă", () => {
  const r = parsePayeeDoc(PATENTA, "patenta");
  it("ia seria și numărul", () => {
    expect(r.patentSeries).toBe("AA 0123456");
  });
  it("ia TERMENUL, nu data de început — el decide avertismentul de expirare", () => {
    expect(r.patentValidUntil).toBe("2026-08-31");
  });
  it("ia titularul și IDNP-ul", () => {
    expect(r.name).toBe("ROITMAN DARIA");
    expect(r.idnp).toBe("2008001007903");
  });
});

describe("parsePayeeDoc — limite asumate", () => {
  it("un IBAN care nu trece mod-97 NU se completează", () => {
    expect(parsePayeeDoc("IBAN: MD48ML000002259A19498122").iban).toBeNull();
  });
  it("o dată neetichetată nu devine termen de patentă", () => {
    expect(parsePayeeDoc("Eliberat la 01.08.2026", "patenta").patentValidUntil).toBeNull();
  });
  it("text gol → toate câmpurile null, fără excepție aruncată", () => {
    expect(parsePayeeDoc("").name).toBeNull();
  });
});
