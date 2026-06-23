/**
 * VF-fix — /app/invite?token=… (also /business/par/invite?token=…)
 *
 * The page an invited PAR member lands on from the invite link/email. It was the
 * missing piece that made invites "do nothing": the invite link pointed here, but
 * no route + no page existed, and the backend accept endpoints didn't exist either.
 *
 * Flow:
 *   1. Read ?token from the hash, GET /api/auth/invite-info to show who/which org/role.
 *   2. If the email already has an account → send them to login (login auto-links the
 *      pending invite, so they get their PAR role on next sign-in).
 *   3. Otherwise → collect name + password, POST /api/auth/accept-invite (creates the
 *      account, grants the par_members role, logs them in), then enter the PAR area.
 *
 * Vector 365 tokens only · light + dark · a11y labelled inputs.
 */
import { useEffect, useState } from "react";
import { Loader2, UserPlus, CheckCircle2, AlertCircle } from "lucide-react";
import { AuthLayout } from "@/components/app/AuthLayout";
import { useRouter } from "@/router/HashRouter";
import { ApiError } from "@/lib/api";
import { getInviteInfo, acceptInvite, type InviteInfo, type ParRole } from "@/lib/api/par";

const ROLE_LABELS: Record<ParRole, string> = {
  requestor: "Solicitant",
  approver: "Aprobator",
  finance: "Finanțe",
  par_admin: "Administrator PAR",
};

/** Read ?token=… out of the hash (the router `path` carries the query string). */
function tokenFromHash(): string {
  const queryPart = window.location.hash.split("?")[1] ?? "";
  return new URLSearchParams(queryPart).get("token") ?? "";
}

export function ParInviteAccept() {
  const { navigate } = useRouter();
  const [token] = useState<string>(() => tokenFromHash());
  const [info, setInfo] = useState<InviteInfo | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!token) {
      setLoadError("Link de invitație invalid — lipsește tokenul.");
      setLoading(false);
      return;
    }
    getInviteInfo(token)
      .then((data) => {
        if (cancelled) return;
        setInfo(data);
      })
      .catch((err) => {
        if (cancelled) return;
        setLoadError(
          err instanceof ApiError && err.code === "invalid_or_expired"
            ? "Invitația nu mai este validă sau a expirat. Cere administratorului un link nou."
            : "Nu pot încărca invitația. Încearcă din nou peste câteva momente."
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    setSubmitting(true);
    try {
      await acceptInvite({ token, name, password });
      // Logged in + role granted → enter the PAR area.
      navigate("/business/par");
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === "account_exists") {
          setSubmitError("Există deja un cont cu acest email. Autentifică-te — rolul se conectează automat.");
        } else if (err.code === "invalid_or_expired") {
          setSubmitError("Invitația a expirat între timp. Cere un link nou.");
        } else {
          setSubmitError(`Eroare: ${err.code}`);
        }
      } else {
        setSubmitError("Nu pot finaliza acceptarea invitației.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <AuthLayout title="Invitație PAR" subtitle="Se încarcă invitația…">
        <div className="flex justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="Se încarcă" />
        </div>
      </AuthLayout>
    );
  }

  if (loadError || !info) {
    return (
      <AuthLayout title="Invitație PAR" subtitle="Acceptare invitație">
        <div role="alert" className="flex items-start gap-2 rounded-md bg-destructive/10 border border-destructive/30 px-3 py-2.5 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" aria-hidden />
          <span>{loadError ?? "Invitație indisponibilă."}</span>
        </div>
        <button
          type="button"
          onClick={() => navigate("/business/login")}
          className="mt-4 inline-flex items-center justify-center w-full rounded-md border border-input bg-background px-4 py-2.5 text-sm font-semibold hover:bg-accent transition-colors touch-target"
        >
          Mergi la conectare
        </button>
      </AuthLayout>
    );
  }

  // Account already exists for this email — direct them to log in (login links the invite).
  if (info.accountExists) {
    return (
      <AuthLayout
        title={`Te alături organizației ${info.orgName}`}
        subtitle={`Rol PAR: ${ROLE_LABELS[info.parRole]}`}
      >
        <div className="flex items-start gap-2 rounded-md bg-primary/10 border border-primary/20 px-3 py-2.5 text-sm">
          <CheckCircle2 className="h-4 w-4 flex-shrink-0 mt-0.5 text-primary" aria-hidden />
          <span>
            Există deja un cont pentru <strong>{info.email}</strong>. Autentifică-te și rolul{" "}
            <strong>{ROLE_LABELS[info.parRole]}</strong> se va activa automat.
          </span>
        </div>
        <button
          type="button"
          onClick={() => navigate("/business/login")}
          className="mt-4 inline-flex items-center justify-center gap-2 w-full rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors touch-target"
        >
          Conectare
        </button>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title={`Te alături organizației ${info.orgName}`}
      subtitle={`Rol PAR: ${ROLE_LABELS[info.parRole]} — creează-ți contul`}
    >
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label htmlFor="inv-email" className="block text-sm font-semibold mb-1.5">
            Email
          </label>
          <input
            id="inv-email"
            type="email"
            value={info.email}
            readOnly
            aria-readonly="true"
            className="w-full rounded-md border border-input bg-muted px-3 py-2.5 text-sm text-muted-foreground"
          />
        </div>

        <div>
          <label htmlFor="inv-name" className="block text-sm font-semibold mb-1.5">
            Nume complet
          </label>
          <input
            id="inv-name"
            type="text"
            required
            minLength={2}
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
          />
        </div>

        <div>
          <label htmlFor="inv-password" className="block text-sm font-semibold mb-1.5">
            Parolă <span className="font-normal text-muted-foreground">(minim 8 caractere)</span>
          </label>
          <input
            id="inv-password"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
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
          disabled={submitting}
          className="inline-flex items-center justify-center gap-2 w-full rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed touch-target"
        >
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <UserPlus className="h-4 w-4" aria-hidden />}
          Acceptă invitația
        </button>
      </form>
    </AuthLayout>
  );
}

export default ParInviteAccept;
