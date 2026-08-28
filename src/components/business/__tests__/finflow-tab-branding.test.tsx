/**
 * Identitatea filei de browser: numele produsului e FinFlow, nu Vector Learn.
 *
 * De ce e un test și nu doar o corectură: fila era „Vector" cu globul implicit pentru că
 * `index.html` cerea un `/favicon.svg` care nu exista în `public/`, iar `manifest.json`
 * arăta spre `icon-192.png`/`icon-512.png` — la fel, inexistente. O referință de asset
 * ruptă nu strică build-ul și nu se vede la citit: se vede doar în bara de taburi. Testul
 * verifică pe disc că fiecare icon referit chiar există.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { render, cleanup, screen } from "@testing-library/react";
import { useParRoles } from "@/hooks/useParRoles";
import { type ModuleKey } from "@/hooks/useEnabledModules";
import { BusinessShell } from "@/components/business/BusinessShell";

vi.mock("@/hooks/useParRoles");
vi.mock("@/hooks/useEnabledModules", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/useEnabledModules")>();
  return {
    ...actual,
    useEnabledModules: () => ({
      enabled: actual.ALL_MODULE_KEYS,
      isEnabled: (key: ModuleKey) => actual.ALL_MODULE_KEYS.includes(key),
      status: "resolved" as const,
    }),
  };
});
vi.mock("@/hooks/useBusinessSession", () => ({
  useBusinessSession: () => ({
    status: "authenticated",
    data: {
      user: { id: "u1", email: "a@b.com", name: "Test User", role: "admin" },
      tenant: { id: "t1", name: "Org", slug: "org", appKind: "business" },
    },
    error: null,
    logout: vi.fn(),
    refresh: vi.fn(),
  }),
}));
vi.mock("@/router/HashRouter", () => ({
  Link: ({ children, to, ...rest }: { children: React.ReactNode; to: string; [key: string]: unknown }) => (
    <a href={`#${to}`} {...rest}>{children}</a>
  ),
  useRouter: () => ({ path: "/business/dashboard", navigate: vi.fn() }),
}));
vi.mock("@/components/app/NotificationBell", () => ({ NotificationBell: () => null }));

const ROOT = resolve(__dirname, "../../../..");
const html = readFileSync(resolve(ROOT, "index.html"), "utf8");
const manifest = JSON.parse(readFileSync(resolve(ROOT, "public/manifest.json"), "utf8")) as {
  name: string;
  short_name: string;
  start_url: string;
  icons: { src: string }[];
};

describe("identitatea filei de browser", () => {
  it("[blocant] titlul din index.html spune FinFlow, nu Vector Learn", () => {
    const title = html.match(/<title>([^<]*)<\/title>/)?.[1] ?? "";
    expect(title).toContain("FinFlow");
    expect(html).not.toContain("Vector Learn");
    expect(html).not.toContain("centre educaționale");
  });

  it("[blocant] fiecare icon referit din head există pe disc", () => {
    const hrefs = [...html.matchAll(/<link[^>]+rel="(?:icon|apple-touch-icon)"[^>]*href="([^"]+)"/g)].map(
      (m) => m[1],
    );
    expect(hrefs.length).toBeGreaterThan(0);
    for (const href of hrefs) {
      expect(existsSync(resolve(ROOT, "public", href.replace(/^\//, "")))).toBe(true);
    }
  });

  it("[blocant] manifestul PWA e FinFlow și toate iconițele lui există", () => {
    expect(manifest.name).toBe("FinFlow");
    expect(manifest.short_name).toBe("FinFlow");
    expect(manifest.start_url).toContain("/business");
    expect(manifest.icons.length).toBeGreaterThan(0);
    for (const icon of manifest.icons) {
      expect(existsSync(resolve(ROOT, "public", icon.src.replace(/^\//, "")))).toBe(true);
    }
  });
});

describe("titlul filei urmărește pagina deschisă", () => {
  beforeEach(() => {
    vi.mocked(useParRoles).mockReturnValue({ roles: [], status: "resolved" });
    document.title = "";
  });

  it("[blocant] pune numele paginii înaintea mărcii, ca să distingi două taburi FinFlow", () => {
    render(
      <BusinessShell pageTitle="Cereri de plată">
        <div>content</div>
      </BusinessShell>,
    );
    expect(screen.getByText("content")).toBeInTheDocument();
    expect(document.title).toBe("Cereri de plată · FinFlow");
  });

  it("cade pe „FinFlow” curat când pagina își ține singură antetul (pageTitle gol)", () => {
    render(
      <BusinessShell pageTitle="">
        <div>content</div>
      </BusinessShell>,
    );
    expect(document.title).toBe("FinFlow");
  });

  it("revine la titlul implicit când shell-ul iese din ecran (ex. logout)", () => {
    render(
      <BusinessShell pageTitle="Facturi">
        <div>content</div>
      </BusinessShell>,
    );
    cleanup();
    expect(document.title).toBe("FinFlow — Controlul financiar complet");
  });
});
