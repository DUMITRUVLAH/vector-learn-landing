/**
 * DIPLOMA-805 — /verify/:token (public no-auth page)
 *
 * Anyone who scans the QR code on a certificate lands here.
 * Shows: participant name, course, edition, mentor, completion date,
 * certificate ID, issued date — with an "Authentic" badge.
 * No authentication required.
 */
import { useEffect, useState } from "react";
import { ShieldCheck, ShieldX, Loader2 } from "lucide-react";
import { Logo } from "@/components/Logo";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

interface CertificateData {
  certificateId: string;
  participantName: string;
  courseName: string;
  edition: string | null;
  mentorName: string | null;
  completionDate: string | null;
  issuedAt: string;
}

type VerifyState =
  | { phase: "loading" }
  | { phase: "valid"; cert: CertificateData }
  | { phase: "invalid" }
  | { phase: "error" };

// ─── API call ─────────────────────────────────────────────────────────────────

async function verifyCertificate(token: string): Promise<VerifyState> {
  const res = await fetch(`/api/public/certificates/${encodeURIComponent(token)}`);
  if (res.status === 404) return { phase: "invalid" };
  if (!res.ok) return { phase: "error" };
  const data = (await res.json()) as { valid?: boolean; certificate?: CertificateData };
  if (!data.valid || !data.certificate) return { phase: "invalid" };
  return { phase: "valid", cert: data.certificate };
}

// ─── Component ────────────────────────────────────────────────────────────────

interface VerifyCertificatePageProps {
  token: string;
}

export function VerifyCertificatePage({ token }: VerifyCertificatePageProps) {
  const [state, setState] = useState<VerifyState>({ phase: "loading" });

  useEffect(() => {
    let cancelled = false;
    async function run() {
      setState({ phase: "loading" });
      try {
        const result = await verifyCertificate(token);
        if (!cancelled) setState(result);
      } catch {
        if (!cancelled) setState({ phase: "error" });
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="border-b border-border bg-card px-4 py-3 flex items-center gap-2">
        <Logo />
        <span className="text-xs text-muted-foreground ml-auto">Verificare certificat</span>
      </header>

      <main className="container mx-auto max-w-lg px-4 py-10">
        {state.phase === "loading" && <LoadingState />}
        {state.phase === "valid" && <ValidState cert={state.cert} />}
        {(state.phase === "invalid" || state.phase === "error") && (
          <InvalidState />
        )}
      </main>
    </div>
  );
}

// ─── States ───────────────────────────────────────────────────────────────────

function LoadingState() {
  return (
    <div
      className="flex flex-col items-center gap-3 py-20 text-muted-foreground"
      aria-live="polite"
      aria-busy="true"
    >
      <Loader2 className="h-8 w-8 animate-spin" aria-hidden="true" />
      <p className="text-sm">Se verifică certificatul...</p>
    </div>
  );
}

interface ValidStateProps {
  cert: CertificateData;
}

function ValidState({ cert }: ValidStateProps) {
  const dateLabel = cert.completionDate
    ? formatDate(cert.completionDate)
    : null;

  return (
    <div
      className="space-y-6"
      role="main"
      aria-label="Certificat autentic"
    >
      {/* Authentic badge */}
      <div className="flex flex-col items-center gap-3 py-6">
        <div className="h-20 w-20 rounded-full bg-success/15 flex items-center justify-center">
          <ShieldCheck
            className="h-10 w-10 text-success"
            aria-hidden="true"
          />
        </div>
        <h1 className="text-xl font-bold text-success">Certificat autentic</h1>
        <p className="text-sm text-muted-foreground text-center max-w-xs">
          Acest certificat a fost emis de Vector Learn și este valid.
        </p>
      </div>

      {/* Certificate details card */}
      <div className="rounded-2xl border border-border bg-card shadow-sm p-6 space-y-4">
        <Row label="Participant" value={cert.participantName} highlight />
        <Divider />
        <Row label="Curs" value={cert.courseName} />
        {cert.edition && <Row label="Ediție / promoție" value={cert.edition} />}
        {cert.mentorName && <Row label="Mentor / instructor" value={cert.mentorName} />}
        {dateLabel && <Row label="Dată finalizare" value={dateLabel} />}
        <Divider />
        <Row label="ID certificat" value={cert.certificateId} mono />
        <Row label="Emis la" value={formatDateTime(cert.issuedAt)} />
      </div>

      {/* Trust footer */}
      <p className="text-center text-xs text-muted-foreground">
        Verificare realizată prin platforma{" "}
        <span className="font-semibold">Vector Learn</span>. Scanați QR-ul
        de pe diplomă pentru a accesa această pagină.
      </p>
    </div>
  );
}

function InvalidState() {
  return (
    <div
      className="flex flex-col items-center gap-4 py-20"
      role="main"
      aria-label="Certificat invalid"
    >
      <div className="h-20 w-20 rounded-full bg-muted flex items-center justify-center">
        <ShieldX
          className="h-10 w-10 text-muted-foreground"
          aria-hidden="true"
        />
      </div>
      <h1 className="text-xl font-bold">Certificat negăsit</h1>
      <p className="text-sm text-muted-foreground text-center max-w-xs">
        Linkul de verificare este invalid sau certificatul nu există în sistem.
        Dacă credeți că este o eroare, contactați instituția emitentă.
      </p>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

interface RowProps {
  label: string;
  value: string;
  highlight?: boolean;
  mono?: boolean;
}

function Row({ label, value, highlight = false, mono = false }: RowProps) {
  return (
    <div className="flex justify-between items-start gap-4">
      <dt className="text-xs text-muted-foreground shrink-0">{label}</dt>
      <dd
        className={cn(
          "text-sm text-right",
          highlight && "font-semibold",
          mono && "font-mono text-xs"
        )}
      >
        {value}
      </dd>
    </div>
  );
}

function Divider() {
  return <hr className="border-border" />;
}

function formatDate(dateStr: string): string {
  try {
    return new Intl.DateTimeFormat("ro-RO", {
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(new Date(dateStr));
  } catch {
    return dateStr;
  }
}

function formatDateTime(isoStr: string): string {
  try {
    return new Intl.DateTimeFormat("ro-RO", {
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(isoStr));
  } catch {
    return isoStr;
  }
}
