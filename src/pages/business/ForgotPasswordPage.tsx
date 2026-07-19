/**
 * /business/forgot — request a password-reset link. Always shows the same confirmation
 * (anti-enumeration): the server responds 200 whether or not the email exists.
 */
import { useState } from "react";
import { Loader2, Mail, ArrowLeft, CheckCircle2 } from "lucide-react";
import { AuthLayout } from "@/components/app/AuthLayout";
import { FinFlowLogo } from "@/components/business/FinFlowLogo";
import { api } from "@/lib/api";
import { useRouter } from "@/router/HashRouter";

export function ForgotPasswordPage() {
  const { navigate } = useRouter();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await api("/api/auth/forgot-password", { method: "POST", body: JSON.stringify({ email }) });
      setSent(true);
    } catch {
      // Even on error we avoid leaking; but a network/500 is worth surfacing.
      setError("Nu pot trimite acum. Încearcă din nou peste câteva momente.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout title="FinFlow" subtitle="Resetare parolă" headerLogo={<FinFlowLogo width={80} variant="color" />}>
      {sent ? (
        <div className="space-y-4 text-center">
          <CheckCircle2 className="h-10 w-10 text-emerald-500 mx-auto" aria-hidden />
          <p className="text-sm text-foreground">
            Dacă există un cont cu adresa <strong>{email}</strong>, am trimis un link de resetare.
            Verifică-ți emailul (și folderul spam). Linkul expiră în 1 oră.
          </p>
          <button
            type="button"
            onClick={() => navigate("/business/login")}
            className="inline-flex items-center justify-center gap-2 text-sm font-medium text-primary hover:underline"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden /> Înapoi la conectare
          </button>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Introdu adresa de email a contului. Îți trimitem un link pentru a-ți seta o parolă nouă.
          </p>
          <div>
            <label htmlFor="fp-email" className="block text-sm font-semibold mb-1.5">Email</label>
            <input
              id="fp-email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
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
            className="inline-flex items-center justify-center gap-2 w-full rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors disabled:opacity-50 touch-target"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Mail className="h-4 w-4" aria-hidden />}
            Trimite linkul de resetare
          </button>
          <button
            type="button"
            onClick={() => navigate("/business/login")}
            className="inline-flex items-center justify-center gap-2 w-full text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden /> Înapoi la conectare
          </button>
        </form>
      )}
    </AuthLayout>
  );
}
