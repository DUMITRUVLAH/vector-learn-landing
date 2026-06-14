/**
 * SPLIT-003: Business Suite Login Page — /business/login
 *
 * Separate authentication entry point for Business Suite (FinDesk + PAR + ITPark).
 * Calls /api/business/auth/login which validates tenant.app_kind === 'business'.
 * On success → redirect to /business/dashboard.
 */
import { useState } from "react";
import { Loader2, LogIn, Briefcase } from "lucide-react";
import { AuthLayout } from "@/components/app/AuthLayout";
import { api, ApiError } from "@/lib/api";
import { useRouter } from "@/router/HashRouter";

export function BusinessLoginPage() {
  const { navigate } = useRouter();
  const [email, setEmail] = useState("admin@demo.business.io");
  const [password, setPassword] = useState("demo123456");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await api("/api/business/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      navigate("/business/dashboard");
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === "invalid_credentials") {
          setError("Email sau parolă incorectă.");
        } else if (err.code === "wrong_app") {
          setError("Acest cont nu are acces la Business Suite. Folosiți /app/login pentru CRM Educațional.");
        } else if (err.code === "account_disabled") {
          setError("Contul este dezactivat. Contactați administratorul.");
        } else {
          setError(`Eroare: ${err.code}`);
        }
      } else {
        setError("Nu pot conecta la server.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      title="Business Suite"
      subtitle="FinDesk · PAR · ITPark — conectați-vă în cont"
      footer={
        <span className="text-xs text-muted-foreground">
          Cont CRM Educațional?{" "}
          <a href="#/app/login" className="text-primary font-semibold hover:underline">
            Login CRM
          </a>
        </span>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        {/* Demo credentials banner */}
        <div className="rounded-md bg-info/10 border border-info/30 px-3 py-2 text-xs text-info flex items-center gap-2">
          <Briefcase className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>
            <strong>Demo:</strong> admin@demo.business.io / demo123456 pre-completate
          </span>
        </div>

        <div>
          <label htmlFor="bs-email" className="block text-sm font-semibold mb-1.5">
            Email
          </label>
          <input
            id="bs-email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
          />
        </div>

        <div>
          <label htmlFor="bs-password" className="block text-sm font-semibold mb-1.5">
            Parolă
          </label>
          <input
            id="bs-password"
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
          />
        </div>

        {error && (
          <div role="alert" className="rounded-md bg-destructive/10 border border-destructive/30 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="inline-flex items-center justify-center gap-2 w-full rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed touch-target"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <LogIn className="h-4 w-4" aria-hidden="true" />}
          Conectare Business Suite
        </button>
      </form>
    </AuthLayout>
  );
}
