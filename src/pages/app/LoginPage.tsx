import { useState } from "react";
import { Loader2, LogIn } from "lucide-react";
import { AuthLayout } from "@/components/app/AuthLayout";
import { api, ApiError } from "@/lib/api";
import { useRouter, Link } from "@/router/HashRouter";

// Maps an ?error=<code> returned by the Google OAuth callback to a friendly
// Romanian message. Unknown codes fall back to a generic message.
const GOOGLE_ERROR_MESSAGES: Record<string, string> = {
  google_not_configured: "Conectarea cu Google nu este configurată momentan.",
  google_denied: "Ai anulat conectarea cu Google.",
  google_state_mismatch: "Sesiunea Google a expirat. Încearcă din nou.",
  google_email_unverified: "Adresa de email Google nu este verificată.",
  google_failed: "Conectarea cu Google a eșuat. Încearcă din nou.",
};

function googleErrorFromHash(path: string): string | null {
  const qIndex = path.indexOf("?");
  if (qIndex === -1) return null;
  const code = new URLSearchParams(path.slice(qIndex + 1)).get("error");
  if (!code) return null;
  return GOOGLE_ERROR_MESSAGES[code] ?? "Conectarea cu Google a eșuat.";
}

export function LoginPage() {
  const { navigate, path } = useRouter();
  const [email, setEmail] = useState("admin@demo.vectorlearn.io");
  const [password, setPassword] = useState("demo123456");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(() => googleErrorFromHash(path));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await api("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      navigate("/app/dashboard");
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === "invalid_credentials") {
          setError("Email sau parolă incorectă.");
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
      title="Bine ai venit!"
      subtitle="Conectează-te în contul centrului tău"
      footer={
        <>
          Nu ai cont?{" "}
          <Link to="/app/signup" className="text-primary font-semibold hover:underline">
            Înregistrează-te
          </Link>
          {" · "}
          <Link to="/app/forgot-password" className="text-muted-foreground hover:text-primary hover:underline text-sm">
            Am uitat parola
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        <div className="rounded-md bg-info/10 border border-info/30 px-3 py-2 text-xs text-info">
          <strong>Demo:</strong> credentialele admin@demo.vectorlearn.io / demo123456 sunt pre-completate
        </div>

        <div>
          <label htmlFor="email" className="block text-sm font-semibold mb-1.5">
            Email
          </label>
          <input
            id="email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
          />
        </div>

        <div>
          <label htmlFor="password" className="block text-sm font-semibold mb-1.5">
            Parolă
          </label>
          <input
            id="password"
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
          className="inline-flex items-center justify-center gap-2 w-full rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
          Conectare
        </button>

        <div className="flex items-center gap-3 py-1" aria-hidden="true">
          <span className="h-px flex-1 bg-border" />
          <span className="text-xs text-muted-foreground">sau</span>
          <span className="h-px flex-1 bg-border" />
        </div>

        {/* Top-level navigation (not fetch): OAuth needs a full-page redirect. */}
        <a
          href="/api/auth/google"
          className="inline-flex items-center justify-center gap-2 w-full rounded-md border border-input bg-background px-4 py-2.5 text-sm font-semibold text-foreground shadow-sm hover:bg-muted transition-colors touch-target"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
            <path
              fill="#4285F4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1Z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84Z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38Z"
            />
          </svg>
          Continuă cu Google
        </a>
      </form>
    </AuthLayout>
  );
}
