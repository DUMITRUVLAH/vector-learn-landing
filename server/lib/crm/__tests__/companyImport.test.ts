/**
 * Importul de firme — logica pură: ghicirea coloanelor, rândul de antet, notițele din mai multe
 * coloane, dedup-ul și ce se scrie pe o fișă care există deja.
 */
import { describe, it, expect } from "vitest";
import {
  applyCompanyMapping,
  companyColumns,
  companyPatch,
  planCompanyImport,
  rebaseHeader,
  suggestCompanyMapping,
} from "../companyImport";

describe("suggestCompanyMapping", () => {
  it("[blocant] recunoaște antetele românești ale unei liste de clienți", () => {
    const m = suggestCompanyMapping([
      "Denumirea",
      "Cod fiscal",
      "Telefon contact",
      "E-mail",
      "Adresa juridică",
      "Raion",
      "Persoana de contact",
      "Site web",
    ]);
    expect(m).toEqual({
      0: "name",
      1: "idno",
      2: "phone",
      3: "email",
      4: "address",
      5: "region",
      6: "notes",
      7: "website",
    });
  });

  it("antetul „Circuit” nu devine cod fiscal (cuvintele scurte se cer întregi)", () => {
    expect(suggestCompanyMapping(["Circuit"])[0]).not.toBe("idno");
  });

  it("fără antet recognoscibil, prima coloană cu text devine numele firmei", () => {
    const m = suggestCompanyMapping(["Nr", "Col B"], [["1", "Alfa SRL"]]);
    expect(m[1]).toBe("name");
  });
});

describe("rebaseHeader", () => {
  it("[blocant] rândurile de titlu de deasupra antetului nu se importă", () => {
    const t = rebaseHeader(
      { headers: ["Raport clienți 2026", ""], rows: [["", ""], ["Denumire", "IDNO"], ["Alfa SRL", "1003600012345"]] },
      3
    );
    expect(t.headers).toEqual(["Denumire", "IDNO"]);
    expect(t.rows).toEqual([["Alfa SRL", "1003600012345"]]);
  });

  it("[blocant] după un rând gol, numărul rândului rămâne cel din fișier", () => {
    const t = rebaseHeader({ headers: ["Denumire", "Telefon"], rows: [["Unu", "1"], ["", ""], ["", "3"]] }, 1);
    const drafts = applyCompanyMapping(t, { 0: "name", 1: "phone" }, 1);
    expect(drafts.map((d) => d.rowNumber)).toEqual([2, 4]);
  });

  it("antetele goale primesc un nume, ca omul să le poată mapa", () => {
    const t = rebaseHeader({ headers: ["Denumire", ""], rows: [["Alfa", "x"]] }, 1);
    expect(t.headers[1]).toBe("Coloana 2");
  });
});

describe("applyCompanyMapping", () => {
  it("[blocant] mai multe coloane în Notițe ajung toate, cu antetul în față", () => {
    const [d] = applyCompanyMapping(
      { headers: ["Firma", "Administrator", "Observații"], rows: [["Alfa SRL", "Ion Rusu", "client vechi"]] },
      { 0: "name", 1: "notes", 2: "notes" }
    );
    expect(d.notes).toBe("Administrator: Ion Rusu\nObservații: client vechi");
  });

  it("o singură coloană de notițe rămâne textul ei", () => {
    const [d] = applyCompanyMapping({ headers: ["Firma", "Obs"], rows: [["Alfa", "vip"]] }, { 0: "name", 1: "notes" });
    expect(d.notes).toBe("vip");
  });

  it("numărul rândului e cel din fișier, cu antetul mutat", () => {
    const [d] = applyCompanyMapping({ headers: ["Firma"], rows: [["Alfa"]] }, { 0: "name" }, 3);
    expect(d.rowNumber).toBe(4);
  });
});

describe("planCompanyImport", () => {
  const drafts = applyCompanyMapping(
    {
      headers: ["Firma", "IDNO"],
      rows: [
        ["Alfa SRL", "1003600012345"],
        ["Alfa S.R.L. (filiala)", "MD 1003600012345"],
        ["Beta SRL", ""],
        ["beta  srl", ""],
        ["", "123"],
        ["Gama SA", ""],
      ],
    },
    { 0: "name", 1: "idno" }
  );

  it("[blocant] același cod fiscal scris diferit e aceeași firmă; numele identic la fel", () => {
    const plan = planCompanyImport(drafts, new Map([["name:gama sa", "gama-id"]]));
    expect(plan.map((r) => r.status)).toEqual(["new", "duplicate_in_file", "new", "duplicate_in_file", "error", "exists"]);
    expect(plan[5].existingId).toBe("gama-id");
  });

  it("un rând CU cod fiscal nu se lipește de o fișă doar pentru că are același nume", () => {
    const [d] = applyCompanyMapping({ headers: ["Firma", "IDNO"], rows: [["Gama SA", "1009600000001"]] }, { 0: "name", 1: "idno" });
    const plan = planCompanyImport([d], new Map([["name:gama sa", "alta-gama"]]));
    expect(plan[0].status).toBe("new");
  });
});

describe("companyPatch", () => {
  const incoming = companyColumns({
    rowNumber: 2,
    name: "Alfa SRL redenumită",
    idno: null,
    industry: "IT",
    region: "Nord",
    company_size: null,
    annual_consumption_kwh: null,
    website: null,
    phone: "069 111 222",
    email: null,
    address: null,
    notes: "din import",
  });
  const current = { name: "Alfa SRL", industry: "Retail", region: null, phone: null, notes: "scris de om" };

  it("[blocant] „completează” nu atinge ce a scris omul și nu redenumește firma", () => {
    const p = companyPatch(current, incoming, "fill");
    expect(p.industry).toBeUndefined();
    expect(p.name).toBeUndefined();
    expect(p.region).toBe("Nord");
    expect(p.phone).toBe("069 111 222");
    expect(p.phoneNormalized).toBeTruthy();
    expect(p.notes).toBe("scris de om\ndin import");
  });

  it("„rescrie” înlocuiește valorile, dar o celulă goală nu șterge nimic", () => {
    const p = companyPatch({ ...current, email: "a@b.md" }, incoming, "overwrite");
    expect(p.industry).toBe("IT");
    expect(p.email).toBeUndefined();
  });

  it("„sari” nu schimbă nimic", () => {
    expect(companyPatch(current, incoming, "skip")).toEqual({});
  });

  it("reimportul aceluiași fișier nu dublează notițele", () => {
    const p = companyPatch({ ...current, notes: "scris de om\ndin import" }, incoming, "fill");
    expect(p.notes).toBeUndefined();
  });
});
