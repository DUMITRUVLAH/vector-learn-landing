/**
 * SPLIT-402: Shell convergence tests — AC1, AC3
 * T-SPLIT-402-3: grep check — zero FinDesk pages import AppShell
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "fs";
import { join } from "path";

function getAllTsxFiles(dir: string): string[] {
  const files: string[] = [];
  try {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        files.push(...getAllTsxFiles(full));
      } else if (entry.name.endsWith(".tsx") || entry.name.endsWith(".ts")) {
        files.push(full);
      }
    }
  } catch {
    // dir doesn't exist, skip
  }
  return files;
}

const ROOT = join(import.meta.dirname ?? __dirname, "../../");
const FIN_DIRS = [
  join(ROOT, "src/pages/fin"),
  join(ROOT, "src/pages/app/fin"),
];

// T-SPLIT-402-3 [blocant]
describe("SPLIT-402 shell convergence", () => {
  it("T-SPLIT-402-3: zero FinDesk pages import from AppShell", () => {
    const violators: string[] = [];
    for (const dir of FIN_DIRS) {
      for (const file of getAllTsxFiles(dir)) {
        const content = readFileSync(file, "utf-8");
        if (content.includes('from "@/components/app/AppShell"')) {
          violators.push(file.replace(ROOT, ""));
        }
      }
    }
    expect(violators, `These pages still import AppShell:\n${violators.join("\n")}`).toEqual([]);
  });

  // T-SPLIT-402-2 [blocant]: no page leaks tenant name — check no BusinessShell-wrapped page
  // injects 'Demo Lingua School' as a static string
  it("T-SPLIT-402-2: no FinDesk page has hardcoded tenant name as string literal", () => {
    const leakers: string[] = [];
    for (const dir of FIN_DIRS) {
      for (const file of getAllTsxFiles(dir)) {
        const content = readFileSync(file, "utf-8");
        if (content.includes("Demo Lingua School")) {
          leakers.push(file.replace(ROOT, ""));
        }
      }
    }
    expect(leakers, `These pages hardcode the tenant name:\n${leakers.join("\n")}`).toEqual([]);
  });
});
