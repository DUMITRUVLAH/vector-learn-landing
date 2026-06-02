import { useState, useEffect } from "react";
import { Loader2, KeyRound, CheckCircle2, XCircle } from "lucide-react";
import { AuthLayout } from "@/components/app/AuthLayout";
import { api, ApiError } from "@/lib/api";
import { useRouter, Link } from "@/router/HashRouter";

/**
 * AUTH-001: Reset-password page (reached via link in email).
 * Reads the token from the URL query string: /app/reset?token=<rawToken>.
 * On success: auto-login + redirect to /app/dashboard (server sets session cookie).
 */
export function ResetPasswordPage() {
  const { navigate } = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Extract the token from the hash-based URL: /#/app/reset?token=xxx
  useEffect(() => {
    const hash = window.location.hash; // e.g. "#/app/reset?token=abc123"
    const queryStart = hash.indexOf("?");
    if (queryStart === -1) {
      setError("Link invalid — token lipsă.");
      return;
    }
    const params = new URLSearchParams(hash.slice(queryStart + 1));
    const t = params.get("token");
    if (!t) setError("Link invalid — token lipsă.");
    else setToken(t);
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirm) {
      setError("Parolele nu se potrivesc.");
      return;
    }
    if (!token) return;
    setError(null);
    setLoading(true);
    try {
      await api("/api/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({ token, newPassword }),
      });
      setDone(true);
      // Server set a fresh session cookie — redirect to dashboard after brief delay.
      setTimeout(() => navigate("/app/dashboard"), 1500);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 400) {
          setError("Link-ul a expirat sau a fost deja folosit. Solicită un link nou.");
        } else {
          setError("Eroare la resetare. Încearcă din nou.");
        }
      } else {
        setError("Nu pot conecta la server.");
      }
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <AuthLayout title="Parolă resetată" subtitle="Ești autentificat automat.">
        <div className="flex flex-col items-center gap-4 py-4">
          <CheckCircle2 className="h-12 w-12 text-success" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">Redirecționare către dashboard…</p>
        </div>
      </AuthLayout>
    );
  }

  if (error && !token) {
    return (
      <AuthLayout title="Link invalid" subtitle="Solicită un nou link de resetare.">
        <div className="flex flex-col items-center gap-4 py-4">
          <XCircle className="h-12 w-12 text-destructive" aria-hidden="true" />
          <p className="text-sm text-destructive text-center">{error}</p>
          <Link to="/app/forgot-password" className="text-primary hover:underline text-sm font-semibold">
            Solicită alt link
          </Link>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Parolă nouă"
      subtitle="Alege o parolă sigură de minim 8 caractere."
      footer={
        <Link to="/app/login" className="text-muted-foreground hover:text-primary text-sm">
          Înapoi la autentificare
        </Link>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label htmlFor="rp-new" className="block text-sm font-semibold mb-1.5">
            Parolă nouă
          </label>
          <input
            id="rp-new"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
          />
        </div>

        <div>
          <label htmlFor="rp-confirm" className="block text-sm font-semibold mb-1.5">
            Confirmă parola
          </label>
          <input
            id="rp-confirm"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
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
          disabled={loading || !token}
          className="inline-flex items-center justify-center gap-2 w-full rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
          Setează parola nouă
        </button>
      </form>
    </AuthLayout>
  );
}
