/**
 * /business/reset?token=… — target of the password-reset email. Sets a new password via
 * POST /api/auth/reset-password, which also starts a fresh session, then lands in the workspace.
 */
import { useState, useEffect } from "react";
import { Loader2, KeyRound, AlertCircle } from "lucide-react";
import { AuthLayout } from "@/components/app/AuthLayout";
import { FinFlowLogo } from "@/components/business/FinFlowLogo";
import { api, ApiError } from "@/lib/api";
import { useRouter } from "@/router/HashRouter";

export function ResetPasswordPage() {
  const { navigate } = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const q = window.location.hash.split("?")[1] ?? "";
    const t = new URLSearchParams(q).get("token");
    setToken(t);
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 8) { setError("Parola trebuie să aibă cel puțin 8 caractere."); return; }
    if (password !== confirm) { setError("Parolele nu coincid."); return; }
    if (!token) { setError("Link invalid — lipsește tokenul."); return; }
    setLoading(true);
    try {
      await api("/api/auth/reset-password", { method: "POST", body: JSON.stringify({ token, newPassword: password }) });
      navigate("/business/dashboard");
    } catch (err) {
      if (err instanceof ApiError && err.code === "invalid_or_expired_token") {
        setError("Linkul de resetare a expirat sau a fost deja folosit. Cere un link nou.");
      } else {
        setError("Nu pot reseta parola acum. Încearcă din nou.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout title="FinFlow" subtitle="Setează o parolă nouă" headerLogo={<FinFlowLogo width={80} variant="color" />}>
      {token === null ? (
        <div className="flex items-start gap-2 rounded-md bg-destructive/10 border border-destructive/30 px-3 py-2.5 text-sm text-destructive" role="alert">
          <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" aria-hidden />
          <span>Link invalid. Deschide linkul din emailul de resetare, sau cere unul nou din „Ai uitat parola?".</span>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label htmlFor="rp-pass" className="block text-sm font-semibold mb-1.5">Parolă nouă</label>
            <input
              id="rp-pass"
              type="password"
              required
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
            />
            <p className="text-xs text-muted-foreground mt-1">Minim 8 caractere.</p>
          </div>
          <div>
            <label htmlFor="rp-confirm" className="block text-sm font-semibold mb-1.5">Confirmă parola</label>
            <input
              id="rp-confirm"
              type="password"
              required
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
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 w-full rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors disabled:opacity-50 touch-target"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <KeyRound className="h-4 w-4" aria-hidden />}
            Setează parola și intră
          </button>
        </form>
      )}
    </AuthLayout>
  );
}
