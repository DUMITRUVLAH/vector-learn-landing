/**
 * SHELL-503: PAR Invite acceptance page
 * Route: /#/business/invite?token=<raw-token>
 *
 * PUBLIC — no auth guard. The user lands here from the invite email link.
 * Shows org name + role from the invite, then offers two sign-in paths:
 *   1. Continuă cu Google → /api/auth/google?invite=<token>
 *   2. Password form (name + password) → POST /api/auth/accept-invite
 *
 * Vector 365 tokens throughout. Light + dark mode. WCAG 2.1 AA a11y.
 */
import { useState, useEffect } from "react";
import { Loader2, Mail, KeyRound, LogIn } from "lucide-react";
import { AuthLayout } from "@/components/app/AuthLayout";
import { useRouter } from "@/router/HashRouter";
import { getInviteInfo, acceptInvite, type InviteInfo } from "@/lib/api/par";
import { ApiError } from "@/lib/api";

/** Human-readable labels for PAR roles (Romanian) */
const PAR_ROLE_LABELS: Record<string, string> = {
  requestor: "Solicitant",
  approver: "Aprobator",
  finance: "Finanțe",
  par_admin: "Administrator PAR",
};

function getTokenFromHash(): string | null {
  // The hash looks like: #/business/invite?token=ABC
  const hash = window.location.hash.replace(/^#/, "");
  const qIdx = hash.indexOf("?");
  if (qIdx === -1) return null;
  const params = new URLSearchParams(hash.slice(qIdx + 1));
  return params.get("token");
}

type PageState = "loading" | "invalid" | "expired" | "ready" | "submitting" | "success";

export function InvitePage() {
  const { navigate } = useRouter();
  const [token] = useState<string | null>(() => getTokenFromHash());
  const [pageState, setPageState] = useState<PageState>("loading");
  const [inviteInfo, setInviteInfo] = useState<InviteInfo | null>(null);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setPageState("invalid");
      return;
    }
    getInviteInfo(token)
      .then((info) => {
        setInviteInfo(info);
        setPageState("ready");
      })
      .catch((err) => {
        if (err instanceof ApiError) {
          if (err.status === 410 || err.code === "invite_expired") {
            setPageState("expired");
          } else {
            setPageState("invalid");
          }
        } else {
          setPageState("invalid");
        }
      });
  }, [token]);

  const handleGoogleSignIn = () => {
    if (!token) return;
    // Pass the invite token through the OAuth round-trip via query param.
    window.location.href = `/api/auth/google?invite=${encodeURIComponent(token)}`;
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setFormError(null);
    setPageState("submitting");
    try {
      await acceptInvite({ token, name, password });
      setPageState("success");
      // Brief delay so the user sees the success message, then navigate to PAR.
      setTimeout(() => navigate("/business/par"), 1500);
    } catch (err) {
      setPageState("ready");
      if (err instanceof ApiError) {
        // P5: handle by BOTH err.code and err.status for robustness.
        if (err.status === 401 || err.code === "wrong_password") {
          setFormError("Parolă greșită. Introduceți parola contului existent cu această adresă de email.");
        } else if (err.status === 409 && err.code === "use_google_signin") {
          // P5: google-only account — point user to the Google button above.
          setFormError(
            "Acest cont folosește autentificarea Google. Apasă «Continuă cu Google» pentru a accepta invitația."
          );
        } else if (err.status === 410 || err.code === "invite_expired") {
          setFormError("Invitația a expirat. Cereți o nouă invitație administratorului.");
        } else if (err.code === "invite_not_found") {
          setFormError("Invitația nu mai este validă sau a fost deja acceptată.");
        } else {
          setFormError(`Eroare: ${err.code ?? "necunoscută"}`);
        }
      } else {
        setFormError("Nu pot conecta la server. Încercați din nou.");
      }
    }
  };

  // ── Loading skeleton ─────────────────────────────────────────────────────────
  if (pageState === "loading") {
    return (
      <AuthLayout title="Invitație PAR" subtitle="Se verifică invitația...">
        <div className="flex justify-center py-8" aria-live="polite" aria-busy="true">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden="true" />
        </div>
      </AuthLayout>
    );
  }

  // ── Invalid / not found ───────────────────────────────────────────────────────
  if (pageState === "invalid") {
    return (
      <AuthLayout title="Invitație invalidă" subtitle="Linkul de invitație nu este recunoscut.">
        <div
          role="alert"
          className="rounded-md bg-destructive/10 border border-destructive/30 px-4 py-3 text-sm text-destructive"
        >
          Invitația nu a fost găsită sau a fost deja folosită. Dacă credeți că este o eroare,
          contactați administratorul organizației.
        </div>
      </AuthLayout>
    );
  }

  // ── Expired ───────────────────────────────────────────────────────────────────
  if (pageState === "expired") {
    return (
      <AuthLayout
        title="Invitație expirată"
        subtitle="Linkul de invitație nu mai este valabil."
      >
        <div
          role="alert"
          className="rounded-md bg-amber-50 border border-amber-200 dark:bg-amber-900/20 dark:border-amber-800 px-4 py-3 text-sm text-amber-800 dark:text-amber-300"
        >
          Invitațiile sunt valabile 7 zile. Cereți administratorului să trimită o nouă invitație.
        </div>
      </AuthLayout>
    );
  }

  // ── Success ───────────────────────────────────────────────────────────────────
  if (pageState === "success") {
    return (
      <AuthLayout title="Bun venit!" subtitle="Contul a fost creat cu succes.">
        <div
          role="status"
          className="rounded-md bg-green-50 border border-green-200 dark:bg-green-900/20 dark:border-green-800 px-4 py-3 text-sm text-green-800 dark:text-green-300 text-center"
        >
          Cont creat. Vă redirecționăm spre PAR...
        </div>
      </AuthLayout>
    );
  }

  // ── Ready / submitting ────────────────────────────────────────────────────────
  const roleLabel = inviteInfo ? (PAR_ROLE_LABELS[inviteInfo.parRole] ?? inviteInfo.parRole) : "";
  const isSubmitting = pageState === "submitting";

  return (
    <AuthLayout
      title="Acceptă invitația"
      subtitle={
        inviteInfo
          ? `${inviteInfo.orgName} te invită ca ${roleLabel}`
          : "Completați detaliile contului"
      }
    >
      <div className="space-y-5">
        {/* Invite summary */}
        {inviteInfo && (
          <div className="rounded-lg bg-muted/50 border border-border px-4 py-3 space-y-1">
            <p className="text-sm font-semibold text-foreground">{inviteInfo.orgName}</p>
            <p className="text-xs text-muted-foreground">
              Rol:{" "}
              <span className="font-medium text-foreground">{roleLabel}</span>
            </p>
            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Mail className="h-3 w-3 flex-shrink-0" aria-hidden="true" />
              {inviteInfo.email}
            </p>
          </div>
        )}

        {/* Google sign-in (primary action) */}
        <button
          type="button"
          onClick={handleGoogleSignIn}
          disabled={isSubmitting}
          className="inline-flex items-center justify-center gap-2.5 w-full rounded-md border border-input bg-background px-4 py-2.5 text-sm font-semibold shadow-sm hover:bg-accent transition-colors touch-target disabled:opacity-50 disabled:cursor-not-allowed"
          aria-label="Continuă cu Google"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              fill="#4285F4"
            />
            <path
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              fill="#34A853"
            />
            <path
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
              fill="#FBBC05"
            />
            <path
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              fill="#EA4335"
            />
          </svg>
          Continuă cu Google
        </button>

        {/* Divider */}
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t border-border" aria-hidden="true" />
          </div>
          <div className="relative flex justify-center text-xs">
            <span className="bg-card px-2 text-muted-foreground">sau creează un cont cu parolă</span>
          </div>
        </div>

        {/* Password form */}
        <form onSubmit={handlePasswordSubmit} className="space-y-4" noValidate>
          <div>
            <label htmlFor="invite-name" className="block text-sm font-semibold mb-1.5">
              Nume complet
            </label>
            <input
              id="invite-name"
              type="text"
              required
              autoComplete="name"
              minLength={2}
              maxLength={200}
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={isSubmitting}
              className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:opacity-50"
              placeholder="Ion Popescu"
            />
          </div>

          <div>
            <label htmlFor="invite-password" className="block text-sm font-semibold mb-1.5">
              Parolă
            </label>
            <input
              id="invite-password"
              type="password"
              required
              autoComplete="new-password"
              minLength={8}
              maxLength={200}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isSubmitting}
              className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:opacity-50"
              placeholder="Minim 8 caractere"
            />
            <p className="mt-1 text-xs text-muted-foreground">Minim 8 caractere.</p>
          </div>

          {formError && (
            <div
              role="alert"
              className="rounded-md bg-destructive/10 border border-destructive/30 px-3 py-2 text-sm text-destructive"
            >
              {formError}
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting || !name.trim() || password.length < 8}
            className="inline-flex items-center justify-center gap-2 w-full rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed touch-target"
          >
            {isSubmitting ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <KeyRound className="h-4 w-4" aria-hidden="true" />
            )}
            {isSubmitting ? "Se creează contul..." : "Creează cont și acceptă"}
          </button>
        </form>

        {/* Already have account hint */}
        <p className="text-center text-xs text-muted-foreground">
          Ai deja un cont?{" "}
          <a
            href="#/business/login"
            className="font-semibold text-foreground underline underline-offset-2 hover:text-primary"
          >
            Conectează-te
          </a>
          {" "}— invitația va fi legată automat dacă emailul se potrivește.
        </p>
      </div>
    </AuthLayout>
  );
}
