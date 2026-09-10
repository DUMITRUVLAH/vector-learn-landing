/**
 * VM4-04 — potrivirea dovezilor de plată cu plățile care le așteaptă.
 *
 * Regula testată peste tot: mai bine „incert" decât o potrivire greșită. O dovadă atașată la
 * cererea altcuiva strică dosarul mai rău decât o rămâne de pus manual.
 */
import { describe, it, expect } from "vitest";
import { matchProofFile, matchProofFiles, type ProofCandidate } from "../proofMatch";

const consult: ProofCandidate = {
  id: "par-1",
  requestNo: "PAR-2026-0020",
  payeeName: "Consult Prim SRL",
  paymentRef: "OP-2026-0047",
  amountCents: 700000,
};
const alfa: ProofCandidate = {
  id: "par-2",
  requestNo: "PAR-2026-0021",
  payeeName: "Alfa Trans SRL",
  paymentRef: "OP-2026-0048",
  amountCents: 250050,
};
const all = [consult, alfa];

describe("matchProofFile", () => {
  it("[blocant] numărul ordinului de plată din numele fișierului → potrivire sigură", () => {
    const m = matchProofFile("OP-2026-0047 extras semnat.pdf", all);
    expect(m.parId).toBe("par-1");
    expect(m.confidence).toBe("sigur");
    expect(m.reason).toContain("OP-2026-0047");
  });

  it("[blocant] numărul cererii → potrivire sigură, indiferent de separatori", () => {
    expect(matchProofFile("par_2026_0021.pdf", all).parId).toBe("par-2");
    expect(matchProofFile("dovada 20260021.pdf", all).parId).toBe("par-2");
  });

  it("numele beneficiarului singur → probabil (nu sigur)", () => {
    const m = matchProofFile("consult prim - ordin.pdf", all);
    expect(m.parId).toBe("par-1");
    expect(m.confidence).toBe("probabil");
  });

  it("„SRL” nu identifică pe nimeni — un fișier cu doar forma juridică rămâne incert", () => {
    const m = matchProofFile("SRL scan001.pdf", all);
    expect(m.parId).toBeNull();
    expect(m.confidence).toBe("incert");
  });

  it("[blocant] un nume generic de scaner nu se leagă de nicio plată", () => {
    const m = matchProofFile("scan_0001.pdf", all);
    expect(m.parId).toBeNull();
  });

  it("[blocant] două plăți la fel de plauzibile → fără sugestie, nu ghicit", () => {
    const geamana = { ...alfa, id: "par-3", requestNo: "PAR-2026-0099", paymentRef: null };
    const m = matchProofFile("alfa trans.pdf", [alfa, geamana]);
    expect(m.parId).toBeNull();
    expect(m.confidence).toBe("incert");
    expect(m.reason).toContain("la fel de bine");
  });

  it("suma singură nu ajunge pentru o potrivire", () => {
    const m = matchProofFile("plata 7000.pdf", [consult]);
    expect(m.parId).toBeNull();
  });

  it("suma întărește potrivirea pe beneficiar (probabil rămâne probabil, dar cu motiv)", () => {
    const m = matchProofFile("consult prim 7000.pdf", all);
    expect(m.parId).toBe("par-1");
    expect(m.reason).toContain("suma");
  });

  it("fără candidați → incert, fără excepție", () => {
    expect(matchProofFile("orice.pdf", []).parId).toBeNull();
  });

  it("diacriticele din numele beneficiarului nu strică potrivirea", () => {
    const stefan: ProofCandidate = {
      id: "par-4",
      requestNo: "PAR-2026-0030",
      payeeName: "Ștefan Rusu",
      paymentRef: null,
      amountCents: 100000,
    };
    expect(matchProofFile("stefan rusu ordin.pdf", [stefan]).parId).toBe("par-4");
  });
});

describe("matchProofFiles — lotul de 20–30 de fișiere", () => {
  it("[blocant] păstrează ordinea intrării și potrivește fiecare fișier cu plata lui", () => {
    const files = ["OP-2026-0048.pdf", "scan_0002.pdf", "OP-2026-0047.pdf"];
    const out = matchProofFiles(files, all);
    expect(out).toHaveLength(3);
    expect(out[0].parId).toBe("par-2");
    expect(out[1].parId).toBeNull();
    expect(out[2].parId).toBe("par-1");
  });

  it("[blocant] două fișiere care trag la aceeași plată: câștigă cel mai bine punctat, celălalt rămâne manual", () => {
    const files = ["consult prim.pdf", "OP-2026-0047 extras.pdf"];
    const out = matchProofFiles(files, all);
    expect(out[1].parId).toBe("par-1"); // potrivirea sigură (nr. ordinului)
    expect(out[0].parId).toBeNull();
    expect(out[0].reason).toContain("deja potrivită");
  });

  it("fișiere cu același nume nu se suprascriu între ele", () => {
    const out = matchProofFiles(["OP-2026-0047.pdf", "OP-2026-0047.pdf"], all);
    expect(out).toHaveLength(2);
    expect([out[0].parId, out[1].parId].filter(Boolean)).toEqual(["par-1"]);
  });
});
