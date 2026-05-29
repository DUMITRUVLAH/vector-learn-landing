import { useEffect, useRef, useState } from "react";
import { Menu, X, ChevronDown } from "lucide-react";
import { Logo } from "./Logo";
import { cn } from "@/lib/utils";

const links = [
  { label: "Funcționalități", href: "#features" },
  { label: "Pentru cine", href: "#audience" },
  { label: "Integrări", href: "#integrations" },
  { label: "Prețuri", href: "#pricing" },
  { label: "FAQ", href: "#faq" },
];

const modules = [
  { label: "Orar interactiv", href: "#/modules/orar" },
  { label: "Finanțe", href: "#/modules/finante" },
  { label: "CRM și vânzări", href: "#/modules/crm" },
  { label: "Comunicare", href: "#/modules/comunicare" },
  { label: "Aplicație mobilă", href: "#/modules/mobile" },
  { label: "Rapoarte", href: "#/modules/rapoarte" },
  { label: "HR și echipă", href: "#/modules/hr" },
  { label: "Multi-filiale", href: "#/modules/multifilale" },
  { label: "Integrări 350+", href: "#/modules/integrari" },
  { label: "AI Assistant", href: "#/modules/ai" },
];

export function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [modulesOpen, setModulesOpen] = useState(false);
  const modulesRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (modulesRef.current && !modulesRef.current.contains(e.target as Node)) {
        setModulesOpen(false);
      }
    };
    window.addEventListener("mousedown", onClickOutside);
    return () => window.removeEventListener("mousedown", onClickOutside);
  }, []);

  return (
    <header
      className={cn(
        "fixed top-0 inset-x-0 z-50 transition-all duration-300",
        scrolled
          ? "bg-background/80 backdrop-blur-xl border-b border-border/60"
          : "bg-transparent"
      )}
    >
      <div className="container mx-auto flex h-16 items-center justify-between">
        <Logo />

        <nav className="hidden lg:flex items-center gap-1">
          <a
            href="#features"
            className="px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors rounded-md"
          >
            Funcționalități
          </a>

          <div ref={modulesRef} className="relative">
            <button
              type="button"
              onClick={() => setModulesOpen((v) => !v)}
              aria-haspopup="true"
              aria-expanded={modulesOpen}
              className="inline-flex items-center gap-1 px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors rounded-md"
            >
              Module
              <ChevronDown
                className={cn(
                  "h-3.5 w-3.5 transition-transform",
                  modulesOpen && "rotate-180"
                )}
              />
            </button>
            {modulesOpen && (
              <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1 w-64 rounded-xl border border-border bg-card shadow-lg overflow-hidden animate-fade-in">
                <div className="p-2">
                  {modules.map((m) => (
                    <a
                      key={m.href}
                      href={m.href}
                      onClick={() => setModulesOpen(false)}
                      className="block px-3 py-2 text-sm text-foreground hover:bg-muted rounded-md transition-colors"
                    >
                      {m.label}
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>

          {links.slice(1).map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors rounded-md"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="hidden lg:flex items-center gap-3">
          <a
            href="#login"
            className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors px-3 py-2"
          >
            Autentificare
          </a>
          <a
            href="#demo"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm hover:shadow-md hover:bg-primary/90 transition-all"
          >
            Cere demo gratuit
          </a>
        </div>

        <button
          type="button"
          className="lg:hidden touch-target inline-flex items-center justify-center rounded-md text-foreground"
          aria-label="Toggle menu"
          onClick={() => setMobileOpen((v) => !v)}
        >
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {mobileOpen && (
        <div className="lg:hidden border-t border-border/60 bg-background/95 backdrop-blur-xl">
          <div className="container mx-auto py-4 flex flex-col gap-1">
            {links.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={() => setMobileOpen(false)}
                className="px-3 py-3 text-sm font-medium text-foreground hover:bg-muted rounded-md"
              >
                {link.label}
              </a>
            ))}
            <div className="border-t border-border/60 mt-2 pt-2">
              <p className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Module
              </p>
              {modules.map((m) => (
                <a
                  key={m.href}
                  href={m.href}
                  onClick={() => setMobileOpen(false)}
                  className="block px-3 py-2 text-sm text-foreground hover:bg-muted rounded-md"
                >
                  {m.label}
                </a>
              ))}
            </div>
            <div className="border-t border-border/60 mt-2 pt-3 flex flex-col gap-2">
              <a
                href="#login"
                className="px-3 py-3 text-sm font-medium text-muted-foreground"
              >
                Autentificare
              </a>
              <a
                href="#demo"
                className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground"
              >
                Cere demo gratuit
              </a>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
