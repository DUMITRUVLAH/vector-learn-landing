import { useState, useEffect, useCallback } from "react";
import {
  ShieldCheck,
  ShieldOff,
  Monitor,
  Loader2,
  Trash2,
  RefreshCw,
  QrCode,
} from "lucide-react";
import { AppShell } from "@/components/app/AppShell";
import { api, ApiError } from "@/lib/api";

// ── Types ──────────────────────────────────────────────────────────────────────

interface SessionItem {
  id: string;
  ipAddress: string | null;
  userAgent: string | null;
  lastActiveAt: string | null;
  createdAt: string;
  isCurrent: boolean;
}

interface RecoveryCode {
  code: string;
  usedAt: string | null;
}

type TwoFAStep = "idle" | "setup" | "enabled" | "disabling";

// ── Helpers ────────────────────────────────────────────────────────────────────

function relativeTime(iso: string | null): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return "Acum câteva secunde";
  if (ms < 3_600_000) return `Acum ${Math.floor(ms / 60_000)} min`;
  if (ms < 86_400_000) return `Acum ${Math.floor(ms / 3_600_000)} h`;
  return new Date(iso).toLocaleDateString("ro-RO");
}

function parseUserAgent(ua: string | null): string {
  if (!ua) return "Browser necunoscut";
  // Simplified UA parsing — good enough for the session list UI
  if (/iPhone|iPad/i.test(ua)) return "iOS Safari";
  if (/Android/i.test(ua)) return "Android Browser";
  if (/Chrome/i.test(ua)) return "Chrome";
  if (/Firefox/i.test(ua)) return "Firefox";
  if (/Safari/i.test(ua)) return "Safari";
  return ua.slice(0, 40);
}

// ── Component ──────────────────────────────────────────────────────────────────

/**
 * AUTH-004: Security settings page at /app/settings/security.
 * Sections: 2FA TOTP setup/disable + Active sessions list + revoke.
 */
export function SecurityPage() {
  // 2FA state
  const [twoFAEnabled, setTwoFAEnabled] = useState<boolean | null>(null);
  const [step, setStep] = useState<TwoFAStep>("idle");
  const [qrUri, setQrUri] = useState("");
  const [secretRaw, setSecretRaw] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [disableCode, setDisableCode] = useState("");
  const [disablePassword, setDisablePassword] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<RecoveryCode[]>([]);
  const [twoFAMsg, setTwoFAMsg] = useState<{ type: "ok" | "error"; text: string } | null>(null);
  const [twoFALoading, setTwoFALoading] = useState(false);

  // Sessions state
  const [sessionList, setSessionList] = useState<SessionItem[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [sessionsMsg, setSessionsMsg] = useState<string | null>(null);

  // ── Load sessions ────────────────────────────────────────────────────────────
  const loadSessions = useCallback(async () => {
    setSessionsLoading(true);
    try {
      const data = await api("/api/auth/sessions") as { sessions: SessionItem[] };
      setSessionList(data.sessions ?? []);
    } catch {
      // silently fail
    } finally {
      setSessionsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

  // ── 2FA: start setup ─────────────────────────────────────────────────────────
  const startSetup = async () => {
    setTwoFALoading(true);
    setTwoFAMsg(null);
    try {
      const res = await api("/api/auth/2fa/setup", { method: "POST" }) as {
        qrCodeUri: string;
        secret: string;
      };
      setQrUri(res.qrCodeUri);
      setSecretRaw(res.secret);
      setStep("setup");
    } catch {
      setTwoFAMsg({ type: "error", text: "Nu s-a putut iniția configurarea 2FA." });
    } finally {
      setTwoFALoading(false);
    }
  };

  // ── 2FA: enable ──────────────────────────────────────────────────────────────
  const enableTwoFA = async (e: React.FormEvent) => {
    e.preventDefault();
    if (totpCode.length !== 6) return;
    setTwoFALoading(true);
    setTwoFAMsg(null);
    try {
      const res = await api("/api/auth/2fa/enable", {
        method: "POST",
        body: JSON.stringify({ secret: secretRaw, code: totpCode }),
      }) as { ok: boolean; recoveryCodes: RecoveryCode[] };
      setRecoveryCodes(res.recoveryCodes);
      setTwoFAEnabled(true);
      setStep("enabled");
      setTotpCode("");
      setTwoFAMsg({ type: "ok", text: "2FA activat cu succes. Salvează codurile de recuperare!" });
    } catch (err) {
      if (err instanceof ApiError && err.status === 400) {
        setTwoFAMsg({ type: "error", text: "Cod invalid. Verifică aplicația autentificator." });
      } else {
        setTwoFAMsg({ type: "error", text: "Nu s-a putut activa 2FA." });
      }
    } finally {
      setTwoFALoading(false);
    }
  };

  // ── 2FA: disable ─────────────────────────────────────────────────────────────
  const disableTwoFA = async (e: React.FormEvent) => {
    e.preventDefault();
    setTwoFALoading(true);
    setTwoFAMsg(null);
    try {
      await api("/api/auth/2fa/disable", {
        method: "POST",
        body: JSON.stringify({ password: disablePassword, code: disableCode }),
      });
      setTwoFAEnabled(false);
      setStep("idle");
      setDisableCode("");
      setDisablePassword("");
      setRecoveryCodes([]);
      setTwoFAMsg({ type: "ok", text: "2FA dezactivat." });
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setTwoFAMsg({ type: "error", text: "Parolă incorectă." });
      } else if (err instanceof ApiError && err.status === 400) {
        setTwoFAMsg({ type: "error", text: "Cod TOTP invalid." });
      } else {
        setTwoFAMsg({ type: "error", text: "Nu s-a putut dezactiva 2FA." });
      }
    } finally {
      setTwoFALoading(false);
    }
  };

  // ── Sessions: revoke one ─────────────────────────────────────────────────────
  const revokeSession = async (id: string) => {
    try {
      await api(`/api/auth/sessions/${id}`, { method: "DELETE" });
      setSessionsMsg("Sesiunea a fost revocată.");
      void loadSessions();
    } catch {
      setSessionsMsg("Eroare la revocare.");
    }
  };

  // ── Sessions: revoke all except current ─────────────────────────────────────
  const revokeAllOthers = async () => {
    try {
      await api("/api/auth/sessions?except=current", { method: "DELETE" });
      setSessionsMsg("Toate celelalte sesiuni au fost revocate.");
      void loadSessions();
    } catch {
      setSessionsMsg("Eroare la revocare.");
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <AppShell pageTitle="Securitate cont">
      <div className="max-w-2xl mx-auto space-y-8 px-4 py-6">

        {/* ── 2FA Section ───────────────────────────────────────────────────── */}
        <section className="rounded-lg border border-border bg-card p-6">
          <h2 className="text-lg font-semibold mb-1 flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" aria-hidden="true" />
            Autentificare în doi pași (2FA)
          </h2>
          <p className="text-sm text-muted-foreground mb-4">
            Protejează-ți contul cu un cod TOTP din Google Authenticator sau Authy.
          </p>

          {/* Not yet configured */}
          {step === "idle" && !twoFAEnabled && (
            <button
              type="button"
              onClick={startSetup}
              disabled={twoFALoading}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {twoFALoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <QrCode className="h-4 w-4" />}
              Activează 2FA
            </button>
          )}

          {/* Setup: scan QR + enter code */}
          {step === "setup" && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Scanează codul QR cu aplicația autentificator, apoi introdu codul de 6 cifre pentru confirmare.
              </p>
              {/* QR code rendered as text URI (front-end can use qrcode.react or just display URI) */}
              <div
                className="rounded-md border border-border bg-muted p-3 text-xs font-mono break-all select-all"
                aria-label="URI autentificator (copiați în aplicație dacă QR-ul nu funcționează)"
              >
                {qrUri}
              </div>
              <p className="text-xs text-muted-foreground">
                Sau adaugă manual în aplicație:
                <span className="ml-1 font-mono font-semibold text-foreground">{secretRaw}</span>
              </p>
              <form onSubmit={enableTwoFA} className="flex gap-2 items-center">
                <div className="flex-1">
                  <label htmlFor="totp-code-input" className="sr-only">Cod TOTP</label>
                  <input
                    id="totp-code-input"
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    minLength={6}
                    required
                    value={totpCode}
                    onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ""))}
                    placeholder="000000"
                    className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm font-mono tracking-widest text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                </div>
                <button
                  type="submit"
                  disabled={twoFALoading || totpCode.length !== 6}
                  className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  {twoFALoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Confirmă
                </button>
              </form>
            </div>
          )}

          {/* After enabling — show recovery codes */}
          {step === "enabled" && recoveryCodes.length > 0 && (
            <div className="space-y-3">
              <div className="rounded-md border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800 p-4">
                <p className="text-sm font-semibold text-amber-800 dark:text-amber-200 mb-2">
                  Coduri de recuperare — salvează-le acum, nu le vei mai vedea!
                </p>
                <ul className="grid grid-cols-2 gap-1 font-mono text-sm">
                  {recoveryCodes.map((rc) => (
                    <li key={rc.code} className={rc.usedAt ? "line-through opacity-50" : ""}>
                      {rc.code}
                    </li>
                  ))}
                </ul>
              </div>
              <button
                type="button"
                onClick={() => { setStep("disabling"); setRecoveryCodes([]); }}
                className="text-sm text-muted-foreground hover:text-destructive underline"
              >
                Dezactivează 2FA
              </button>
            </div>
          )}

          {/* 2FA already enabled but step is idle (page reload) */}
          {step === "idle" && twoFAEnabled === true && (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm text-success font-semibold">
                <ShieldCheck className="h-4 w-4" />
                2FA activ
              </div>
              <button
                type="button"
                onClick={() => setStep("disabling")}
                className="text-sm text-muted-foreground hover:text-destructive underline"
              >
                Dezactivează
              </button>
            </div>
          )}

          {/* Disable form */}
          {step === "disabling" && (
            <form onSubmit={disableTwoFA} className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Introdu parola și codul TOTP curent pentru a dezactiva 2FA.
              </p>
              <div>
                <label htmlFor="disable-pw" className="block text-sm font-semibold mb-1">Parola</label>
                <input
                  id="disable-pw"
                  type="password"
                  required
                  value={disablePassword}
                  onChange={(e) => setDisablePassword(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>
              <div>
                <label htmlFor="disable-code" className="block text-sm font-semibold mb-1">Cod TOTP</label>
                <input
                  id="disable-code"
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  minLength={6}
                  required
                  value={disableCode}
                  onChange={(e) => setDisableCode(e.target.value.replace(/\D/g, ""))}
                  placeholder="000000"
                  className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm font-mono tracking-widest text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={twoFALoading}
                  className="inline-flex items-center gap-2 rounded-md bg-destructive px-4 py-2 text-sm font-semibold text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50"
                >
                  {twoFALoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldOff className="h-4 w-4" />}
                  Dezactivează 2FA
                </button>
                <button
                  type="button"
                  onClick={() => setStep("idle")}
                  className="rounded-md border border-border bg-background px-4 py-2 text-sm font-semibold hover:bg-accent"
                >
                  Anulează
                </button>
              </div>
            </form>
          )}

          {twoFAMsg && (
            <div
              role="alert"
              className={`mt-3 rounded-md px-3 py-2 text-sm ${twoFAMsg.type === "ok" ? "bg-success/10 border border-success/30 text-success" : "bg-destructive/10 border border-destructive/30 text-destructive"}`}
            >
              {twoFAMsg.text}
            </div>
          )}
        </section>

        {/* ── Sessions Section ──────────────────────────────────────────────── */}
        <section className="rounded-lg border border-border bg-card p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Monitor className="h-5 w-5 text-primary" aria-hidden="true" />
              Sesiuni active
            </h2>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={loadSessions}
                disabled={sessionsLoading}
                aria-label="Reîncarcă sesiunile"
                className="rounded-md border border-border bg-background px-3 py-1.5 text-xs font-semibold hover:bg-accent disabled:opacity-50 inline-flex items-center gap-1"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${sessionsLoading ? "animate-spin" : ""}`} />
                Reîncarcă
              </button>
              {sessionList.filter((s) => !s.isCurrent).length > 0 && (
                <button
                  type="button"
                  onClick={revokeAllOthers}
                  className="rounded-md border border-destructive/40 bg-background px-3 py-1.5 text-xs font-semibold text-destructive hover:bg-destructive/10 inline-flex items-center gap-1"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Revocă toate altele
                </button>
              )}
            </div>
          </div>

          {sessionsMsg && (
            <div role="alert" className="mb-3 rounded-md bg-muted px-3 py-2 text-sm">
              {sessionsMsg}
            </div>
          )}

          {sessionsLoading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}

          {!sessionsLoading && sessionList.length === 0 && (
            <p className="text-sm text-muted-foreground">Nu s-au găsit sesiuni active.</p>
          )}

          <ul className="space-y-2" aria-label="Lista sesiunilor active">
            {sessionList.map((s) => (
              <li
                key={s.id}
                className={`rounded-md border p-3 flex items-start justify-between gap-2 ${s.isCurrent ? "border-primary/50 bg-primary/5" : "border-border bg-background"}`}
              >
                <div className="min-w-0">
                  <div className="text-sm font-semibold truncate">
                    {parseUserAgent(s.userAgent)}
                    {s.isCurrent && (
                      <span className="ml-2 text-xs font-normal text-primary">(sesiunea curentă)</span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {s.ipAddress ?? "IP necunoscut"} · Ultima activitate: {relativeTime(s.lastActiveAt)}
                  </div>
                </div>
                {!s.isCurrent && (
                  <button
                    type="button"
                    onClick={() => void revokeSession(s.id)}
                    aria-label={`Revocă sesiunea de pe ${parseUserAgent(s.userAgent)}`}
                    className="shrink-0 rounded-md border border-destructive/40 bg-background px-2.5 py-1 text-xs font-semibold text-destructive hover:bg-destructive/10"
                  >
                    Revocă
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>

      </div>
    </AppShell>
  );
}
