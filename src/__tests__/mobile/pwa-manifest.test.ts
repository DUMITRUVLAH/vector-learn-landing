/**
 * MOB-101 — T-MOB-101-3
 * Validates that manifest.json exists and has required PWA fields.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const manifestPath = resolve(__dirname, "../../../public/manifest.json");

describe("PWA manifest — T-MOB-101-3 [blocant]", () => {
  let manifest: Record<string, unknown>;

  try {
    manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Record<string, unknown>;
  } catch {
    manifest = {};
  }

  it("manifest.json exists and is valid JSON", () => {
    expect(Object.keys(manifest).length).toBeGreaterThan(0);
  });

  it("has display: standalone for PWA install", () => {
    expect(manifest.display).toBe("standalone");
  });

  it("has icons array with at least one entry", () => {
    expect(Array.isArray(manifest.icons)).toBe(true);
    expect((manifest.icons as unknown[]).length).toBeGreaterThanOrEqual(1);
  });

  it("has name and short_name", () => {
    expect(typeof manifest.name).toBe("string");
    expect((manifest.name as string).length).toBeGreaterThan(0);
    expect(typeof manifest.short_name).toBe("string");
  });

  it("has theme_color", () => {
    expect(typeof manifest.theme_color).toBe("string");
    expect((manifest.theme_color as string).startsWith("#")).toBe(true);
  });

  it("has start_url", () => {
    expect(typeof manifest.start_url).toBe("string");
  });
});
