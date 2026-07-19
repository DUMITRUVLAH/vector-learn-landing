/**
 * /business/signup — self-serve: create a brand-new FinFlow (business) workspace with a password.
 * Calls POST /api/business/auth/signup (mints an appKind:"business" tenant + admin), then lands in
 * the workspace. For joining an EXISTING org, users use an invite link instead.
 */
import { useState } from "react";
import { Loader2, UserPlus, ArrowLeft } from "lucide-react";
import { AuthLayout } from "@/components/app/AuthLayout";
import { FinFlowLogo } from "@/components/business/FinFlowLogo";
import { api, ApiError } from "@/lib/api";
import { useRouter } from "@/router/HashRouter";

export function BusinessSignupPage() {
  const { navigate } = useRouter();
  const [tenantName, setTenantName] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 8) { setError("Parola trebuie să aibă cel puțin 8 caractere."); return; }
    setLoading(true);
    try {
      await api("/api/business/auth/signup", {
        method: "POST",
        body: JSON.stringify({ tenantName, name, email, password }),
      });
      navigate("/business/dashboard");
    } catch (err) {
      if (err instanceof ApiError && err.code === "email_taken") {
        setError("Există deja un cont cu acest email. Conectează-te sau folosește „Ai uitat parola?”.");
      } else {
        setError("Nu pot crea contul acum. Încearcă din nou.");
      }
    } finally {
      setLoading(false);
    }
  };

  const inputCls = "w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1";

  return (
    <AuthLayout title="FinFlow" subtitle="Creează un workspace nou" headerLogo={<FinFlowLogo width={80} variant="color" />}>
      <form onSubmit={submit} className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Creezi o organizație nouă în FinFlow și devii administratorul ei. Ai fost invitat într-o
          organizație existentă? Folosește linkul din invitație.
        </p>
        <div>
          <label htmlFor="su-org" className="block text-sm font-semibold mb-1.5">Numele organizației</label>
          <input id="su-org" type="text" required value={tenantName} onChange={(e) => setTenantName(e.target.value)} className={inputCls} placeholder="ex. Asociația Exemplu" />
        </div>
        <div>
          <label htmlFor="su-name" className="block text-sm font-semibold mb-1.5">Numele tău</label>
          <input id="su-name" type="text" required autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} className={inputCls} placeholder="Prenume Nume" />
        </div>
        <div>
          <label htmlFor="su-email" className="block text-sm font-semibold mb-1.5">Email</label>
          <input id="su-email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} />
        </div>
        <div>
          <label htmlFor="su-pass" className="block text-sm font-semibold mb-1.5">Parolă</label>
          <input id="su-pass" type="password" required autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className={inputCls} />
          <p className="text-xs text-muted-foreground mt-1">Minim 8 caractere.</p>
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
          {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <UserPlus className="h-4 w-4" aria-hidden />}
          Creează workspace-ul
        </button>
        <button
          type="button"
          onClick={() => navigate("/business/login")}
          className="inline-flex items-center justify-center gap-2 w-full text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden /> Am deja cont — conectare
        </button>
      </form>
    </AuthLayout>
  );
}
