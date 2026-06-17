/**
 * SPLIT-003: Business Suite Login Page — /business/login
 *
 * Separate authentication entry point for Business Suite (FinDesk + PAR + ITPark).
 * Calls /api/business/auth/login which validates tenant.app_kind === 'business'.
 * On success → redirect to /business/dashboard.
 */
import { useState, useEffect } from "react";
import { Loader2, LogIn } from "lucide-react";
import { AuthLayout } from "@/components/app/AuthLayout";
import { api, ApiError } from "@/lib/api";
import { useRouter } from "@/router/HashRouter";

export function BusinessLoginPage() {
  const { navigate } = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Show error from Google OAuth callback (?error=...). The codes are emitted by
  // GET /api/auth/google/callback in server/routes/auth.ts — keep them in sync.
  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.split("?")[1] ?? "");
    const err = params.get("error");
    if (!err) return;
    const messages: Record<string, string> = {
      google_not_configured: "Conectarea cu Google nu este configurată pe acest server.",
      google_denied: "Ați anulat sau ați refuzat conectarea cu Google.",
      google_state_mismatch:
        "Sesiunea de conectare Google a expirat sau a fost întreruptă. Încercați din nou.",
      google_failed: "Conectarea cu Google a eșuat. Încercați din nou peste câteva momente.",
      google_email_unverified:
        "Adresa de email Google nu este verificată. Verificați-o în contul Google și reîncercați.",
    };
    setError(messages[err] ?? `Eroare la conectarea cu Google (${err}).`);
  }, []);

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
    >
      <form onSubmit={submit} className="space-y-4">
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

        <div className="relative my-1">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t border-border" />
          </div>
          <div className="relative flex justify-center text-xs">
            <span className="bg-background px-2 text-muted-foreground">sau</span>
          </div>
        </div>

        <a
          href="/api/auth/google"
          className="inline-flex items-center justify-center gap-2.5 w-full rounded-md border border-input bg-background px-4 py-2.5 text-sm font-semibold shadow-sm hover:bg-accent transition-colors touch-target"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
          Conectare cu Google
        </a>
      </form>
    </AuthLayout>
  );
}
