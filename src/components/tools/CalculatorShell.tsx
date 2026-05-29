import { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { Link } from "@/router/HashRouter";

interface CalculatorShellProps {
  badge: string;
  title: ReactNode;
  description: string;
  children: ReactNode;
}

export function CalculatorShell({ badge, title, description, children }: CalculatorShellProps) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Navbar />
      <main className="pt-16">
        <section className="relative py-12 sm:py-16 overflow-hidden">
          <div className="absolute inset-0 -z-10">
            <div className="absolute inset-0 grid-pattern radial-mask opacity-50" />
            <div className="absolute top-1/3 left-1/2 -translate-x-1/2 h-[400px] w-[400px] bg-primary/10 rounded-full blur-3xl" />
          </div>

          <div className="container mx-auto px-4 sm:px-6 lg:px-8">
            <Link
              to="/"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors mb-6"
            >
              <ArrowLeft className="h-4 w-4" />
              Înapoi acasă
            </Link>

            <div className="max-w-3xl mx-auto text-center mb-12">
              <span className="inline-flex items-center rounded-full bg-primary/10 text-primary px-3 py-1 text-xs font-semibold mb-4">
                {badge}
              </span>
              <h1 className="text-3xl sm:text-4xl font-display font-bold tracking-tight leading-tight">
                {title}
              </h1>
              <p className="mt-4 text-base text-muted-foreground leading-relaxed">
                {description}
              </p>
            </div>

            {children}
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
