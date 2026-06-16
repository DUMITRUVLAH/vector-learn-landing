import { Logo } from "./Logo";
import { Twitter, Linkedin, Facebook, Youtube, Instagram } from "lucide-react";

const columns = [
  {
    title: "Produs",
    links: [
      { label: "Funcționalități", href: "#features" },
      { label: "Module", href: "#modules" },
      { label: "Integrări", href: "#integrations" },
      { label: "Prețuri", href: "#pricing" },
      { label: "Aplicație mobilă", href: "#mobile" },
      { label: "Roadmap", href: "#roadmap" },
    ],
  },
  {
    title: "Soluții",
    links: [
      { label: "Centre de limbi străine", href: "#" },
      { label: "Școli de programare", href: "#" },
      { label: "Școli de muzică", href: "#" },
      { label: "Centre sportive", href: "#" },
      { label: "Pregătire examene", href: "#" },
      { label: "Centre pentru copii", href: "#" },
    ],
  },
  {
    title: "Resurse",
    links: [
      { label: "Blog", href: "#" },
      { label: "Documentație API", href: "#" },
      { label: "Centru de ajutor", href: "#" },
      { label: "Webinare gratuite", href: "#" },
      { label: "Studii de caz", href: "#" },
      { label: "Comparație cu HOLLIHOP", href: "#" },
    ],
  },
  {
    title: "Companie",
    links: [
      { label: "Despre noi", href: "#" },
      { label: "Cariere", href: "#" },
      { label: "Contact", href: "#" },
      { label: "Parteneri", href: "#" },
      { label: "Presă", href: "#" },
      { label: "Status sistem", href: "#" },
    ],
  },
];

const socials = [
  { Icon: Linkedin, href: "#", label: "LinkedIn" },
  { Icon: Twitter, href: "#", label: "Twitter" },
  { Icon: Facebook, href: "#", label: "Facebook" },
  { Icon: Instagram, href: "#", label: "Instagram" },
  { Icon: Youtube, href: "#", label: "YouTube" },
];

export function Footer() {
  return (
    <footer className="bg-foreground text-white">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="grid grid-cols-2 lg:grid-cols-6 gap-8 mb-12">
          <div className="col-span-2">
            <Logo variant="light" />
            <p className="mt-4 text-sm text-white/70 leading-relaxed max-w-xs">
              CRM-ul complet pentru centre educaționale. Construit în Europa, cu suport în română.
            </p>
            <div className="mt-6 flex gap-2">
              {socials.map(({ Icon, href, label }) => (
                <a
                  key={label}
                  href={href}
                  aria-label={label}
                  className="rounded-md p-2 bg-white/5 hover:bg-white/10 transition-colors"
                >
                  <Icon className="h-4 w-4" />
                </a>
              ))}
            </div>
          </div>

          {columns.map((col) => (
            <div key={col.title}>
              <h4 className="text-xs font-bold uppercase tracking-wider text-white/60 mb-4">
                {col.title}
              </h4>
              <ul className="space-y-2.5">
                {col.links.map((link) => (
                  <li key={link.label}>
                    <a
                      href={link.href}
                      className="text-sm text-white/80 hover:text-white transition-colors"
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="rounded-2xl bg-white/5 border border-white/10 p-6 mb-12">
          <div className="grid md:grid-cols-2 gap-6 items-center">
            <div>
              <h3 className="text-lg font-display font-bold">
                Newsletter pentru directori de centre educaționale
              </h3>
              <p className="text-sm text-white/70 mt-1">
                1 email/lună cu tips, studii de caz și features noi. Fără spam.
              </p>
            </div>
            <form className="flex gap-2">
              <input
                type="email"
                placeholder="email@centrul-tau.ro"
                className="flex-1 rounded-md bg-white/10 border border-white/20 px-3 py-2 text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-white/30"
                aria-label="Email address"
              />
              <button
                type="submit"
                className="rounded-md bg-white px-4 py-2 text-sm font-semibold text-foreground hover:bg-white/90 transition-colors"
              >
                Abonează-te
              </button>
            </form>
          </div>
        </div>

        <div className="border-t border-white/10 pt-8 flex flex-col md:flex-row gap-4 items-start md:items-center justify-between text-xs text-white/60">
          <div>
            © 2026 Vector Learn SRL. Toate drepturile rezervate. CUI RO12345678.
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            <a href="#" className="hover:text-white">Termeni</a>
            <a href="#" className="hover:text-white">Confidențialitate</a>
            <a href="#" className="hover:text-white">Cookies</a>
            <a href="#" className="hover:text-white">DPA / GDPR</a>
            <a href="#" className="hover:text-white">SLA</a>
            {/* SPLIT-302: discreet Business Suite link — for FinDesk/PAR/ITPark users who land on CRM homepage */}
            <a href="#/business" className="hover:text-white font-medium" aria-label="Business Suite — FinDesk, PAR, ITPark">
              Business Suite
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
