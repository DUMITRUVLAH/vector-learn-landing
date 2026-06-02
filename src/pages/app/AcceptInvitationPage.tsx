import { useState, useEffect } from "react";
import { Loader2, UserPlus, CheckCircle2, XCircle } from "lucide-react";
import { AuthLayout } from "@/components/app/AuthLayout";
import { api, ApiError } from "@/lib/api";
import { useRouter, Link } from "@/router/HashRouter";

interface InvitationMeta {
  email: string;
  role: string;
}

/**
 * AUTH-002: Accept team invitation page.
 * Reached via link in email: /app/accept-invitation?token=<rawToken>
 * Fetches the invitation metadata (email pre-filled), user sets name + password.
 */
export function AcceptInvitationPage() {
  const { navigate } = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [meta, setMeta] = useState<InvitationMeta | null>(null);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const hash = window.location.hash;
    const queryStart = hash.indexOf("?");
    if (queryStart === -1) { setFetchError("Link invalid — token lipsă."); return; }
    const params = new URLSearchParams(hash.slice(queryStart + 1));
    const t = params.get("token");
    if (!t) { setFetchError("Link invalid — token lipsă."); return; }
    setToken(t);

    api(`/api/team/invitation?token=${encodeURIComponent(t)}`)
      .then((data: unknown) => setMeta(data as InvitationMeta))
      .catch(() => setFetchError("Link-ul de invitație este invalid sau a expirat."));
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) { setSubmitError("Parolele nu se potrivesc."); return; }
    if (!token) return;
    setSubmitError(null);
    setLoading(true);
    try {
      await api("/api/team/accept-invitation", {
        method: "POST",
        body: JSON.stringify({ token, name, password }),
      });
      setDone(true);
      setTimeout(() => navigate("/app/dashboard"), 1500);
    } catch (err) {
      if (err instanceof ApiError && err.status === 400) {
        setSubmitError("Link-ul a expirat sau a fost deja folosit.");
      } else {
        setSubmitError("Eroare la activarea contului. Încearcă din nou.");
      }
    } finally {
      setLoading(false);
    }
  };

  if (fetchError) {
    return (
      <AuthLayout title="Link invalid" subtitle="Solicită o nouă invitație de la admin.">
        <div className="flex flex-col items-center gap-4 py-4">
          <XCircle className="h-12 w-12 text-destructive" aria-hidden="true" />
          <p className="text-sm text-destructive text-center">{fetchError}</p>
          <Link to="/app/login" className="text-primary hover:underline text-sm font-semibold">
            Mergi la autentificare
          </Link>
        </div>
      </AuthLayout>
    );
  }

  if (done) {
    return (
      <AuthLayout title="Cont activat!" subtitle="Ești autentificat automat.">
        <div className="flex flex-col items-center gap-4 py-4">
          <CheckCircle2 className="h-12 w-12 text-success" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">Redirecționare…</p>
        </div>
      </AuthLayout>
    );
  }

  if (!meta) {
    return (
      <AuthLayout title="Se verifică invitația…" subtitle="">
        <div className="flex justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" aria-label="Se încarcă" />
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Activează contul"
      subtitle={`Ai fost invitat ca ${meta.role}. Alege un nume și o parolă.`}
    >
      <form onSubmit={submit} className="space-y-4">
        {/* Email — read-only, pre-filled from invitation */}
        <div>
          <label htmlFor="ai-email" className="block text-sm font-semibold mb-1.5">
            Email
          </label>
          <input
            id="ai-email"
            type="email"
            readOnly
            value={meta.email}
            className="w-full rounded-md border border-input bg-muted px-3 py-2.5 text-sm text-muted-foreground cursor-not-allowed"
          />
        </div>

        <div>
          <label htmlFor="ai-name" className="block text-sm font-semibold mb-1.5">
            Nume complet
          </label>
          <input
            id="ai-name"
            type="text"
            required
            minLength={2}
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ion Popescu"
            className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
          />
        </div>

        <div>
          <label htmlFor="ai-pwd" className="block text-sm font-semibold mb-1.5">
            Parolă (min. 8 caractere)
          </label>
          <input
            id="ai-pwd"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
          />
        </div>

        <div>
          <label htmlFor="ai-confirm" className="block text-sm font-semibold mb-1.5">
            Confirmă parola
          </label>
          <input
            id="ai-confirm"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
          />
        </div>

        {submitError && (
          <div role="alert" className="rounded-md bg-destructive/10 border border-destructive/30 px-3 py-2 text-sm text-destructive">
            {submitError}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="inline-flex items-center justify-center gap-2 w-full rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
          Activează contul
        </button>
      </form>
    </AuthLayout>
  );
}
