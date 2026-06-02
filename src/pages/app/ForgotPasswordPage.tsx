import { useState } from "react";
import { Loader2, Mail, ArrowLeft, CheckCircle2 } from "lucide-react";
import { AuthLayout } from "@/components/app/AuthLayout";
import { api, ApiError } from "@/lib/api";
import { Link } from "@/router/HashRouter";

/**
 * AUTH-001: Forgot-password flow.
 * The user enters their email; we call POST /api/auth/forgot-password.
 * On success (whether the email exists or not) we show a confirmation screen.
 * The server always returns 200 to prevent email enumeration.
 */
export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await api("/api/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email }),
      });
      setSent(true);
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) {
        setError("Prea multe cereri. Încearcă din nou în 15 minute.");
      } else {
        setError("Nu pot trimite emailul acum. Încearcă mai târziu.");
      }
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <AuthLayout
        title="Verifică-ți emailul"
        subtitle="Dacă adresa există în sistem, vei primi un link în câteva minute."
        footer={
          <Link to="/app/login" className="inline-flex items-center gap-1 text-primary hover:underline text-sm font-semibold">
            <ArrowLeft className="h-3.5 w-3.5" />
            Înapoi la autentificare
          </Link>
        }
      >
        <div className="flex flex-col items-center gap-4 py-4">
          <CheckCircle2 className="h-12 w-12 text-success" aria-hidden="true" />
          <p className="text-sm text-muted-foreground text-center">
            Link-ul de resetare este valid <strong>1 oră</strong>. Dacă nu apare, verifică folderul Spam.
          </p>
          <button
            type="button"
            onClick={() => { setSent(false); setEmail(""); }}
            className="text-sm text-muted-foreground hover:text-foreground underline"
          >
            Nu am primit emailul — încearcă din nou
          </button>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Resetează parola"
      subtitle="Introdu adresa de email și îți trimitem un link de resetare."
      footer={
        <Link to="/app/login" className="inline-flex items-center gap-1 text-primary hover:underline text-sm font-semibold">
          <ArrowLeft className="h-3.5 w-3.5" />
          Înapoi la autentificare
        </Link>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label htmlFor="fp-email" className="block text-sm font-semibold mb-1.5">
            Email
          </label>
          <input
            id="fp-email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="admin@centrul-tau.ro"
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
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
          Trimite link de resetare
        </button>
      </form>
    </AuthLayout>
  );
}
