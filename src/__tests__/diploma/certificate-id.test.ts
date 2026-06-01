/**
 * DIPLOMA-801 — certificateId utility tests
 *
 * T-DIPLOMA-801-1: buildCertificateId with/without edition → exact format matching copy-roas
 */
import { describe, it, expect } from "vitest";
import {
  buildCertificateId,
  buildCoursePrefix,
} from "@/lib/certificateId";

describe("buildCoursePrefix", () => {
  it("takes first 6 chars uppercased, no spaces", () => {
    expect(buildCoursePrefix("Facebook Ads")).toBe("FACEBO");
    expect(buildCoursePrefix("Python")).toBe("PYTHON");
    expect(buildCoursePrefix("AI")).toBe("AI");
    expect(buildCoursePrefix("Web Development Course")).toBe("WEBDEV");
  });

  it("handles short names (< 6 chars)", () => {
    expect(buildCoursePrefix("SQL")).toBe("SQL");
  });

  it("strips internal spaces before slicing", () => {
    expect(buildCoursePrefix("A B C D E F G")).toBe("ABCDEF");
  });
});

// ─── T-DIPLOMA-801-1 ──────────────────────────────────────────────────────────

describe("T-DIPLOMA-801-1: buildCertificateId format matching copy-roas", () => {
  it("with edition: FACEBO + Mai2026 + 0 → FACEBOMai2026-2026VA-1", () => {
    const result = buildCertificateId("VA", "Facebook Ads", "Mai2026", 0, 2026);
    expect(result).toBe("FACEBOMai2026-2026VA-1");
  });

  it("with edition: index 1 → n=2", () => {
    const result = buildCertificateId("VA", "Facebook Ads", "Mai2026", 1, 2026);
    expect(result).toBe("FACEBOMai2026-2026VA-2");
  });

  it("without edition (null): FACEBO-{year}VA-1", () => {
    const result = buildCertificateId("VA", "Facebook Ads", null, 0, 2026);
    expect(result).toBe("FACEBO-2026VA-1");
  });

  it("without edition (empty string): PYTHON-{year}VA-3", () => {
    const result = buildCertificateId("VA", "Python", "", 2, 2026);
    expect(result).toBe("PYTHON-2026VA-3");
  });

  it("without edition ('default'): PYTHON-{year}VA-3", () => {
    const result = buildCertificateId("VA", "Python", "default", 2, 2026);
    expect(result).toBe("PYTHON-2026VA-3");
  });

  it("spec AC2: buildCertificateId('VA','Facebook Ads','Mai2026',0) → 'FACEBOMai2026-2026VA-1'", () => {
    const result = buildCertificateId("VA", "Facebook Ads", "Mai2026", 0, 2026);
    expect(result).toBe("FACEBOMai2026-2026VA-1");
  });

  it("uses current year when year not specified", () => {
    const currentYear = new Date().getFullYear();
    const result = buildCertificateId("VA", "Python", "Mai2026", 0);
    expect(result).toContain(String(currentYear));
    expect(result).toMatch(/^PYTHONMai2026-\d{4}VA-1$/);
  });
});

describe("AC3: no edition format", () => {
  it("null edition → {prefix}-{year}VA-{n}", () => {
    const result = buildCertificateId("VA", "English", null, 0, 2026);
    expect(result).toBe("ENGLIS-2026VA-1");
  });

  it("'default' edition → {prefix}-{year}VA-{n}", () => {
    const result = buildCertificateId("VA", "English", "default", 0, 2026);
    expect(result).toBe("ENGLIS-2026VA-1");
  });

  it("index=2 gives n=3", () => {
    const result = buildCertificateId("VA", "Python", null, 2, 2026);
    expect(result).toBe("PYTHON-2026VA-3");
  });
});

describe("different tenant suffixes", () => {
  it("suffix MD", () => {
    const result = buildCertificateId("MD", "Python", "Mai2026", 0, 2026);
    expect(result).toBe("PYTHONMai2026-2026MD-1");
  });

  it("suffix RO", () => {
    const result = buildCertificateId("RO", "Python", null, 0, 2026);
    expect(result).toBe("PYTHON-2026RO-1");
  });
});
