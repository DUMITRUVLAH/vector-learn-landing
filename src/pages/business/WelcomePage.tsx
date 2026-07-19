/**
 * SHELL-504: Google "create or join" choice screen.
 *
 * Route: /#/business/welcome (PUBLIC — relies on the short-lived encrypted G_PENDING_COOKIE
 * set by /api/auth/google/callback when a Google sign-in resolves to neither an existing account
 * nor a valid invite). Instead of silently spawning a new admin tenant (the old bug), the user
 * lands here and EXPLICITLY chooses:
 *   1. Creează un workspace nou  → POST /api/auth/google/create-workspace  (becomes admin of it)
 *   2. Alătură-te cu o invitație → POST /api/auth/google/join { token }     (gets the invited role)
 *
 * If the pending cookie is missing/expired, we bounce to /business/login.
 * Vector 365 tokens; light + dark; WCAG AA.
 */
import { useEffect, useState } from "react";
import { Building2, Loader2, Mail, Users, CheckCircle2 } from "lucide-react";
import { AuthLayout } from "@/components/app/AuthLayout";
import { useRouter } from "@/router/HashRouter";

const ROLE_LABELS: Record<string, string> = {
  requestor: "Solicitant",
  approver: "Aprobator",
  finance: "Finanțe",
  par_admin: "Administrator",
};

interface Pending {
  email: string;
  name: string;
  matchedInvite?: { orgName: string; role: string } | null;
}

interface PostResult { redirect?: string; error?: string; [k: string]: unknown }

async function postJson(path: string, body: unknown): Promise<{ status: number; json: PostResult | null }> {
  const r = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
  });
  let json: PostResult | null = null;
  try {
    json = (await r.json()) as PostResult;
  } catch {
    /* ignore */
  }
  return { status: r.status, json };
}

export function WelcomePage() {
  const { navigate } = useRouter();
  const [pending, setPending] = useState<Pending | null>(null);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<"choose" | "create" | "join">("choose");
  const [wsName, setWsName] = useState("");
  const [inviteLink, setInviteLink] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/auth/google/pending", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((d: Pending) => setPending(d))
      .catch(() => navigate("/business/login"))
      .finally(() => setLoading(false));
  }, [navigate]);

  const go = (redirect: string) => {
    // redirect is a hash path like "/#/business/fin/"
    window.location.href = redirect.startsWith("#") ? redirect : redirect.replace(/^\/?#?/, "#");
  };

  const createWorkspace = async () => {
    setBusy(true);
    setError(null);
    const { status, json } = await postJson("/api/auth/google/create-workspace", { name: wsName.trim() || undefined });
    setBusy(false);
    if (status === 200 && json?.redirect) return go(json.redirect);
    if (status === 401) return navigate("/business/login");
    setError("Nu am putut crea workspace-ul. Încearcă din nou.");
  };

  const acceptMatched = async () => {
    setBusy(true);
    setError(null);
    const { status, json } = await postJson("/api/auth/google/accept-matched-invite", {});
    setBusy(false);
    if (status === 200 && json?.redirect) return go(json.redirect);
    if (status === 401) return navigate("/business/login");
    if (status === 404) return setError("Invitația nu mai e validă (a fost folosită sau a expirat). Cere administratorului una nouă.");
    setError("Nu am putut finaliza. Încearcă din nou.");
  };

  const joinWorkspace = async () => {
    if (!inviteLink.trim()) return;
    setBusy(true);
    setError(null);
    const { status, json } = await postJson("/api/auth/google/join", { token: inviteLink.trim() });
    setBusy(false);
    if (status === 200 && json?.redirect) return go(json.redirect);
    if (status === 401) return navigate("/business/login");
    if (status === 403 && json?.error === "email_mismatch") {
      return setError("Invitația e pentru altă adresă de email decât contul tău Google.");
    }
    if (status === 410) return setError("Invitația a expirat. Cere administratorului una nouă.");
    setError("Invitație invalidă. Verifică linkul primit de la administrator.");
  };

  if (loading) {
    return (
      <AuthLayout title="Un moment…" subtitle="Verificăm contul tău Google.">
        <div className="flex justify-center py-4" role="status" aria-label="Se încarcă">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Bine ai venit!"
      subtitle="Contul tău Google a fost verificat. Ce vrei să faci în continuare?"
    >
      <div className="space-y-5">
        {pending && (
          <p className="text-xs text-muted-foreground flex items-center justify-center gap-1.5">
            <Mail className="h-3 w-3 flex-shrink-0" aria-hidden="true" />
            {pending.email}
          </p>
        )}

        {error && (
          <div role="alert" className="rounded-md bg-destructive/10 border border-destructive/30 px-4 py-2.5 text-sm text-destructive">
            {error}
          </div>
        )}

        {mode === "choose" && pending?.matchedInvite && (
          <div className="rounded-lg border border-primary/40 bg-primary/5 p-4 space-y-2">
            <p className="text-sm font-semibold text-foreground flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4 text-primary flex-shrink-0" aria-hidden="true" />
              Ai o invitație!
            </p>
            <p className="text-sm text-muted-foreground">
              Ești invitat în <strong className="text-foreground">{pending.matchedInvite.orgName}</strong> ca{" "}
              <strong className="text-foreground">{ROLE_LABELS[pending.matchedInvite.role] ?? pending.matchedInvite.role}</strong>.
            </p>
            <button
              type="button"
              onClick={acceptMatched}
              disabled={busy}
              className="w-full rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors touch-target disabled:opacity-50"
            >
              {busy ? "Se procesează…" : `Alătură-te — ${pending.matchedInvite.orgName}`}
            </button>
          </div>
        )}

        {mode === "choose" && (
          <div className="space-y-3">
            <button
              type="button"
              onClick={() => setMode("join")}
              className="w-full text-left rounded-lg border border-border bg-card hover:bg-accent transition-colors px-4 py-3 flex items-start gap-3 touch-target"
            >
              <Users className="h-5 w-5 text-primary shrink-0 mt-0.5" aria-hidden="true" />
              <span>
                <span className="block text-sm font-semibold text-foreground">Alătură-te unui workspace</span>
                <span className="block text-xs text-muted-foreground mt-0.5">
                  Am primit un link de invitație de la administrator
                </span>
              </span>
            </button>

            <button
              type="button"
              onClick={() => setMode("create")}
              className="w-full text-left rounded-lg border border-border bg-card hover:bg-accent transition-colors px-4 py-3 flex items-start gap-3 touch-target"
            >
              <Building2 className="h-5 w-5 text-primary shrink-0 mt-0.5" aria-hidden="true" />
              <span>
                <span className="block text-sm font-semibold text-foreground">Creează un workspace nou</span>
                <span className="block text-xs text-muted-foreground mt-0.5">
                  Pornesc o organizație nouă (voi fi administrator)
                </span>
              </span>
            </button>
          </div>
        )}

        {mode === "join" && (
          <div className="space-y-3">
            <label htmlFor="invite-link" className="block text-sm font-semibold text-foreground">
              Linkul de invitație
            </label>
            <input
              id="invite-link"
              type="text"
              value={inviteLink}
              onChange={(e) => setInviteLink(e.target.value)}
              placeholder="Lipește linkul primit pe email"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <button
              type="button"
              onClick={joinWorkspace}
              disabled={busy || !inviteLink.trim()}
              className="w-full rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors touch-target disabled:opacity-50"
            >
              {busy ? "Se procesează…" : "Intră în workspace"}
            </button>
            <button type="button" onClick={() => { setMode("choose"); setError(null); }} className="w-full text-xs text-muted-foreground hover:text-foreground">
              ← Înapoi
            </button>
          </div>
        )}

        {mode === "create" && (
          <div className="space-y-3">
            <label htmlFor="ws-name" className="block text-sm font-semibold text-foreground">
              Numele organizației
            </label>
            <input
              id="ws-name"
              type="text"
              value={wsName}
              onChange={(e) => setWsName(e.target.value)}
              placeholder="ex. Asociația Mea"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <button
              type="button"
              onClick={createWorkspace}
              disabled={busy}
              className="w-full rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors touch-target disabled:opacity-50"
            >
              {busy ? "Se creează…" : "Creează workspace"}
            </button>
            <button type="button" onClick={() => { setMode("choose"); setError(null); }} className="w-full text-xs text-muted-foreground hover:text-foreground">
              ← Înapoi
            </button>
          </div>
        )}
      </div>
    </AuthLayout>
  );
}
