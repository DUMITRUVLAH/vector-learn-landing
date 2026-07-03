import { ReactNode } from "react";
import { Logo } from "@/components/Logo";
import { Link } from "@/router/HashRouter";
import { ArrowLeft } from "lucide-react";

interface AuthLayoutProps {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer?: ReactNode;
  /** Override the default Vector Learn logo in the header. */
  headerLogo?: ReactNode;
}

export function AuthLayout({ title, subtitle, children, footer, headerLogo }: AuthLayoutProps) {
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <header className="container mx-auto px-4 py-6">
        <div className="flex items-center justify-between">
          {headerLogo ?? <Logo />}
          <Link to="/" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-3 w-3" />
            Acasă
          </Link>
        </div>
      </header>
      <main className="flex-1 flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-md">
          <div className="mb-6 text-center">
            <h1 className="text-2xl sm:text-3xl font-display font-bold tracking-tight">
              {title}
            </h1>
            <p className="text-sm text-muted-foreground mt-2">{subtitle}</p>
          </div>
          <div className="rounded-2xl border border-border bg-card p-6 sm:p-8 shadow-md">
            {children}
          </div>
          {footer && <div className="mt-4 text-center text-sm text-muted-foreground">{footer}</div>}
        </div>
      </main>
    </div>
  );
}
