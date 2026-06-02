import { useState } from "react";
import { ShieldCheck, Loader2 } from "lucide-react";
import { api, ApiError } from "@/lib/api";

/**
 * AUTH-004: Verify 2FA page shown after a successful password login
 * when the user has 2FA enabled.
 * Route: #/app/verify-2fa
 */
export function Verify2FAPage() {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return;
    setLoading(true);
    setError(null);
    try {
      await api("/api/auth/2fa/verify", {
        method: "POST",
        body: JSON.stringify({ code: code.trim() }),
      });
      // Verification successful — redirect to app dashboard
      window.location.hash = "#/app";
    } catch (err) {
      if (err instanceof ApiError && err.status === 400) {
        setError("Cod invalid. Verifică aplicația autentificator sau folosește un cod de recuperare.");
      } else {
        setError("Eroare de verificare. Încearcă din nou.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <ShieldCheck className="mx-auto h-12 w-12 text-primary" aria-hidden="true" />
          <h1 className="mt-4 text-2xl font-bold tracking-tight">Verificare în doi pași</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Introdu codul din aplicația autentificator sau un cod de recuperare.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="2fa-code" className="block text-sm font-semibold mb-1.5">
              Cod de verificare
            </label>
            <input
              id="2fa-code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={20}
              required
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="000000"
              className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm text-center tracking-widest font-mono focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
            />
          </div>

          {error && (
            <div role="alert" className="rounded-md bg-destructive/10 border border-destructive/30 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !code.trim()}
            className="w-full inline-flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
            Verifică
          </button>
        </form>

        <p className="text-center text-xs text-muted-foreground">
          Ai pierdut accesul la autentificator?{" "}
          <span className="text-muted-foreground">
            Folosește unul dintre codurile de recuperare (format: XXXXXXXX).
          </span>
        </p>
      </div>
    </div>
  );
}
