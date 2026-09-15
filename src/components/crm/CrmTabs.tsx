/**
 * CRM — bara de navigare a modulului, prezentă pe FIECARE ecran de CRM.
 *
 * De ce: până acum, trecerea de la tabla de leaduri la „Astăzi", la rapoarte sau la automatizări
 * se făcea prin întoarcerea la pagina de start a modulului și un al doilea click pe dala
 * potrivită. Pentru un agent care intră în CRM de zece ori pe zi, asta înseamnă douăzeci de
 * click-uri risipite — iar submodulele construite (cadențe, duplicate, reactivare) rămâneau
 * nefolosite fiindcă nu se vedeau de nicăieri.
 *
 * Filele care cer un drept apar doar pentru cine îl are. Ascunderea e curtoazie, nu apărare:
 * serverul verifică oricum la fiecare cerere (`requireCrmPermission`).
 */
import { Link, useRouter } from "@/router/HashRouter";
import { cn } from "@/lib/utils";
import { useCrmPermissions } from "@/hooks/useCrmPermissions";
import type { CrmPermission } from "@/lib/api/crm";

interface CrmTab {
  label: string;
  href: string;
  requires?: CrmPermission;
}

const TABS: CrmTab[] = [
  { label: "Pipeline", href: "/business/crm/pipeline" },
  { label: "Astăzi", href: "/business/crm/astazi" },
  { label: "Clienți", href: "/business/crm/clienti" },
  { label: "Produse", href: "/business/crm/produse" },
  { label: "Documente", href: "/business/crm/documente" },
  { label: "Comunicare", href: "/business/crm/comunicare" },
  { label: "Rapoarte", href: "/business/crm/rapoarte" },
  { label: "Automatizări", href: "/business/crm/automatizari" },
  { label: "Cadențe", href: "/business/crm/cadente" },
  { label: "Import", href: "/business/crm/import" },
  { label: "Drepturi", href: "/business/crm/drepturi", requires: "audit.view" },
  { label: "Jurnal", href: "/business/crm/jurnal", requires: "audit.view" },
];

export function CrmTabs() {
  const { path } = useRouter();
  const { can } = useCrmPermissions();

  return (
    // Pe telefon bara se derulează lateral în loc să se rupă pe trei rânduri: ecranul are 380px,
    // iar douăsprezece file împachetate ar împinge tabla sub linia de plutire.
    <nav
      aria-label="Secțiunile modulului CRM"
      className="-mx-1 mb-4 flex gap-1 overflow-x-auto rounded-xl border border-border bg-card p-1"
    >
      {TABS.filter((t) => !t.requires || can(t.requires)).map((tab) => {
        const active = path === tab.href || path.startsWith(`${tab.href}/`);
        return (
          <Link
            key={tab.href}
            to={tab.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
              active
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
