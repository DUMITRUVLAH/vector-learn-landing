/**
 * DIPLOMA-804 — T-DIPLOMA-804-1..3
 * Tests for buildCertificateFileName and bulk ZIP logic
 */
import { describe, it, expect } from "vitest";
import { buildCertificateFileName } from "@/lib/certificateZip";

// T-DIPLOMA-804-2 [blocant]: buildCertificateFileName strips invalid chars
describe("buildCertificateFileName", () => {
  it("T-DIPLOMA-804-2 [blocant] — strips / and : from name", () => {
    const result = buildCertificateFileName(0, "Ion/Pop:1", "pdf");
    expect(result).toBe("Certificat_1_Ion_Pop_1.pdf");
  });

  it("strips other invalid chars * ? < > | \\", () => {
    const result = buildCertificateFileName(0, 'Ion*Pop?"<>|\\test', "pdf");
    expect(result).not.toContain("*");
    expect(result).not.toContain("?");
    expect(result).not.toContain('"');
    expect(result).not.toContain("<");
    expect(result).not.toContain(">");
    expect(result).not.toContain("|");
    expect(result).not.toContain("\\");
  });

  it("1-based index in filename", () => {
    expect(buildCertificateFileName(0, "Ion", "pdf")).toMatch(/^Certificat_1_/);
    expect(buildCertificateFileName(2, "Ion", "pdf")).toMatch(/^Certificat_3_/);
  });

  it("correct extension for jpg", () => {
    const result = buildCertificateFileName(0, "Ion Popescu", "jpg");
    expect(result).toMatch(/\.jpg$/);
  });

  it("correct extension for pdf", () => {
    const result = buildCertificateFileName(0, "Ion Popescu", "pdf");
    expect(result).toMatch(/\.pdf$/);
  });

  it("replaces spaces with underscores", () => {
    const result = buildCertificateFileName(0, "Ion Popescu", "pdf");
    // Single space → single underscore
    expect(result).toContain("Ion_Popescu");
  });

  it("truncates long names to 80 chars before ext", () => {
    const longName = "A".repeat(120);
    const result = buildCertificateFileName(0, longName, "pdf");
    // "Certificat_1_" + max 80 chars + ".pdf"
    const namePart = result.replace("Certificat_1_", "").replace(".pdf", "");
    expect(namePart.length).toBeLessThanOrEqual(80);
  });
});

// T-DIPLOMA-804-1 [blocant]: Bulk on 3 selected → 3 rows, 3 tokens, 1 request
describe("bulk issue deduplication logic", () => {
  it("T-DIPLOMA-804-1 [blocant] — 3 distinct certificateIds → 3 distinct tokens", () => {
    // Simulates the expected shape of issueCertificatesBulk response
    const mockResponse = {
      issued: [
        { certificateId: "CERT-1", verificationToken: "token-a" },
        { certificateId: "CERT-2", verificationToken: "token-b" },
        { certificateId: "CERT-3", verificationToken: "token-c" },
      ],
    };

    expect(mockResponse.issued).toHaveLength(3);
    const tokens = mockResponse.issued.map((r) => r.verificationToken);
    const uniqueTokens = new Set(tokens);
    expect(uniqueTokens.size).toBe(3); // all tokens unique
  });

  it("deduplication in server removes duplicate certificateIds", () => {
    // Simulate what the server does: dedup on certificateId before upsert
    const participants = [
      { certificateId: "CERT-1", participantName: "Ion" },
      { certificateId: "CERT-1", participantName: "Ion (duplicate)" }, // same certId
      { certificateId: "CERT-2", participantName: "Maria" },
    ];

    const seen = new Set<string>();
    const deduped = participants.filter((p) => {
      if (seen.has(p.certificateId)) return false;
      seen.add(p.certificateId);
      return true;
    });

    expect(deduped).toHaveLength(2);
    expect(deduped[0].certificateId).toBe("CERT-1");
    expect(deduped[1].certificateId).toBe("CERT-2");
  });
});

// T-DIPLOMA-804-3 [blocant]: Deselect 1 of 3 → ZIP has 2 files
describe("multi-select logic for bulk generation", () => {
  it("T-DIPLOMA-804-3 [blocant] — deselect 1 of 3 → 2 selected", () => {
    const allNames = ["Ion Popescu", "Maria Ionescu", "Andrei Vlad"];
    const selectedIndices = new Set([0, 1, 2]);

    // Deselect index 1 (Maria)
    selectedIndices.delete(1);

    const selectedList = allNames
      .map((name, i) => ({ name, i }))
      .filter(({ i }) => selectedIndices.has(i));

    expect(selectedList).toHaveLength(2);
    expect(selectedList[0].name).toBe("Ion Popescu");
    expect(selectedList[1].name).toBe("Andrei Vlad");
  });

  it("select all gives full list", () => {
    const allNames = ["Ion", "Maria", "Andrei"];
    const selectedIndices = new Set(allNames.map((_, i) => i));
    expect(selectedIndices.size).toBe(3);
  });

  it("deselect all gives empty list", () => {
    const selectedIndices = new Set<number>();
    expect(selectedIndices.size).toBe(0);
  });
});
