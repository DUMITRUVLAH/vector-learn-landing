/**
 * SPLIT-003 stub: Business Suite Dashboard — /business/dashboard
 *
 * Placeholder until SPLIT-101 (BusinessShell + sidebar) and SPLIT-204
 * (unified KPI dashboard) are built. Shows that the route works and
 * authentication succeeded.
 */
import { Briefcase } from "lucide-react";

export function BusinessDashboardPage() {
  return (
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-8">
      <div className="text-center max-w-md">
        <div className="inline-flex items-center justify-center rounded-full bg-primary/10 p-4 mb-4">
          <Briefcase className="h-8 w-8 text-primary" aria-hidden="true" />
        </div>
        <h1 className="text-2xl font-bold font-display mb-2">Business Suite</h1>
        <p className="text-muted-foreground text-sm mb-6">
          Autentificare reușită. Shell-ul complet (FinDesk · PAR · ITPark) se construiește în SPLIT-101.
        </p>
        <div className="flex flex-col gap-2 text-xs text-muted-foreground">
          <span className="rounded-full bg-muted/60 px-3 py-1">FinDesk — rapoarte financiare</span>
          <span className="rounded-full bg-muted/60 px-3 py-1">PAR — cereri de plată</span>
          <span className="rounded-full bg-muted/60 px-3 py-1">ITPark — rezidenți</span>
        </div>
      </div>
    </div>
  );
}
