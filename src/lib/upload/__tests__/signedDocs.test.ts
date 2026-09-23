import { describe, expect, it } from "vitest";
import { hasSignatureMarkers, hasSignedFileName, isSignedPdf } from "../signedDocs";

const bytes = (s: string) => new TextEncoder().encode(s);

describe("signedDocs — ce nu se atinge niciodată", () => {
  it("recunoaște semnătura după `/ByteRange`, marcajul pe care îl are ORICE PDF semnat", () => {
    expect(hasSignatureMarkers(bytes("%PDF-1.7\n/ByteRange [0 840 12345 1500]\n"))).toBe(true);
  });

  it("recunoaște SubFilter-ul PAdES folosit de MSign și de e-Factura SFS", () => {
    expect(hasSignatureMarkers(bytes("/SubFilter /ETSI.CAdES.detached"))).toBe(true);
    expect(hasSignatureMarkers(bytes("/SubFilter /adbe.pkcs7.detached"))).toBe(true);
  });

  it("tratează un PDF criptat ca intangibil — nu se rescrie fără parola cu care a fost făcut", () => {
    expect(hasSignatureMarkers(bytes("%PDF-1.4\n/Encrypt 12 0 R\n"))).toBe(true);
  });

  it("lasă în pace un PDF obișnuit", () => {
    expect(hasSignatureMarkers(bytes("%PDF-1.7\n/Type /Page /Contents 4 0 R\n"))).toBe(false);
  });

  it("citește marcajele și când fișierul e binar, fără să arunce", () => {
    const binary = new Uint8Array(200_000);
    binary.set(bytes("%PDF-1.7"), 0);
    binary.set(bytes("/ByteRange [0 1 2 3]"), 150_000);
    // `String.fromCharCode(...bytes)` ar fi aruncat „Maximum call stack size exceeded" aici,
    // adică ar fi răspuns „nesemnat" tocmai pe fișierele mari.
    expect(hasSignatureMarkers(binary)).toBe(true);
  });

  it("recunoaște după nume actele care sunt containere de semnătură", () => {
    expect(hasSignedFileName("20260810066000349271_202608_MM8710246.signed.pdf")).toBe(true);
    expect(hasSignedFileName("contract-semnat.pdf")).toBe(true);
    expect(hasSignedFileName("factura.p7s")).toBe(true);
    expect(hasSignedFileName("efactura.xml")).toBe(true);
    expect(hasSignedFileName("dosar.asice")).toBe(true);
    expect(hasSignedFileName("Contract Fox.pdf")).toBe(false);
  });

  it("numele semnat decide chiar dacă octeții nu arată nicio semnătură", () => {
    expect(isSignedPdf(bytes("%PDF-1.7 nimic special"), "act.signed.pdf")).toBe(true);
    expect(isSignedPdf(bytes("%PDF-1.7 nimic special"), "act.pdf")).toBe(false);
  });
});
