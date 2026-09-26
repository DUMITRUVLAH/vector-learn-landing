/**
 * NAV-02 / NAV-03: filele unui modul care trăiește pe mai multe rute.
 *
 * Facturile, contul de plată și e-Factura erau trei rânduri de meniu cu trei titluri diferite pentru
 * același lucru. Acum sunt un modul: un rând în meniu, un titlu, iar filele de aici comută între
 * ecrane. Fiecare filă e un link spre ruta ei (nu stare locală): marcajele, butonul „Înapoi" și
 * linkurile trimise pe chat duc exact la fila potrivită.
 *
 * Același modul se montează și în CRM (`/business/crm/facturi/*`), deci filele își aleg rutele după
 * locul în care e omul — altfel un click pe „e-Factura" l-ar fi scos din CRM în FinDesk.
 */
import { Link, useRouter } from "@/router/HashRouter";
import { CRM_INVOICING_ROUTES, FIN_INVOICING_ROUTES } from "@/lib/fin/finNav";
import { cn } from "@/lib/utils";

export interface ModuleTab {
  label: string;
  href: string;
  /** Fila e aprinsă când ruta curentă e exact asta sau o rută copil. */
  isActive: (path: string) => boolean;
}

interface ModuleTabsProps {
  tabs: ModuleTab[];
  /** Numele listei de file pentru cititoarele de ecran. */
  label: string;
}

export function ModuleTabs({ tabs, label }: ModuleTabsProps) {
  const { path } = useRouter();
  return (
    <nav aria-label={label} className="mb-6 border-b border-border">
      <ul className="-mb-px flex gap-1 overflow-x-auto">
        {tabs.map((tab) => {
          const active = tab.isActive(path);
          return (
            <li key={tab.href} className="shrink-0">
              <Link
                to={tab.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex min-h-[44px] items-center border-b-2 px-3 text-sm font-medium no-underline transition-colors hover:no-underline",
                  active
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:border-border hover:text-foreground",
                )}
              >
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Rutele modulului Facturare pentru locul în care e omul (FinDesk sau CRM). */
function invoicingRoutes(path: string) {
  return path.startsWith("/business/crm") ? CRM_INVOICING_ROUTES : FIN_INVOICING_ROUTES;
}

/** Filele modulului Facturare: Facturi · Cont de plată · e-Factura SFS. */
export function InvoicingTabs() {
  const { path } = useRouter();
  const r = invoicingRoutes(path);
  const tabs: ModuleTab[] = [
    {
      label: "Facturi",
      href: r.invoices,
      // Lista e rădăcina modulului: aprinsă pe ea și pe orice rută copil care nu e altă filă.
      isActive: (p) => p.startsWith(r.invoices) && !p.startsWith(r.document) && !p.startsWith(r.einvoices),
    },
    { label: "Cont de plată", href: r.document, isActive: (p) => p.startsWith(r.document) },
    { label: "e-Factura SFS", href: r.einvoices, isActive: (p) => p.startsWith(r.einvoices) },
  ];
  return <ModuleTabs tabs={tabs} label="Secțiuni facturare" />;
}

const STATEMENT_UPLOAD = "/business/fin/statement/upload";
const STATEMENT_LIST = "/business/fin/statement";

/** Filele modulului Extrase bancare: Istoric · Încarcă extras. */
export function StatementTabs() {
  const tabs: ModuleTab[] = [
    { label: "Istoric extrase", href: STATEMENT_LIST, isActive: (p) => p.startsWith(STATEMENT_LIST) && !p.startsWith(STATEMENT_UPLOAD) },
    { label: "Încarcă extras", href: STATEMENT_UPLOAD, isActive: (p) => p.startsWith(STATEMENT_UPLOAD) },
  ];
  return <ModuleTabs tabs={tabs} label="Secțiuni extrase bancare" />;
}
