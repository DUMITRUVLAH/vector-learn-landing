/**
 * DC-101 — banda de file a modulului de documente.
 *
 * Șabloanele erau al doilea rând în meniul din stânga. Owner-ul a cerut o singură intrare
 * („Documente"), așa că a doua destinație trăiește aici, ca filă: rămâi în același loc din meniu,
 * iar sidebarul nu se mai schimbă sub cursor când treci de la registru la șabloane.
 */
import { Tabs } from "@/components/ds";
import { useRouter } from "@/router/HashRouter";
import { docsListPath, docsTemplatesPath } from "@/lib/docs/paths";

export type DocsTab = "documents" | "templates";

export function DocsTabs({ active }: { active: DocsTab }) {
  const { navigate } = useRouter();
  return (
    <Tabs<DocsTab>
      aria-label="Secțiunile modulului de documente"
      value={active}
      onChange={(next) => {
        if (next === active) return;
        navigate(next === "templates" ? docsTemplatesPath() : docsListPath());
      }}
      tabs={[
        { value: "documents", label: "Documente" },
        { value: "templates", label: "Șabloane" },
      ]}
      className="w-fit"
    />
  );
}
