/**
 * CORE-004: FinDesk "Compania mea" page — /app/fin/company
 * Placeholder that links to the profile/series API built in CORE-003.
 * Full CRUD UI will come in a later REGISTRY/PARTY iteration.
 * Design system: Vector 365 tokens only.
 */
import { useEffect, useState } from "react";
import { Building2, Loader2, AlertCircle, Pencil } from "lucide-react";
import { FinLayout } from "./FinLayout";
import { getFinOrgProfile, type FinOrgProfile } from "@/lib/api/fin";

const VAT_REGIME_LABELS: Record<string, string> = {
  payer: "Plătitor de TVA",
  non_payer: "Neplătitor de TVA",
};

export function FinCompany() {
  const [profile, setProfile] = useState<FinOrgProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getFinOrgProfile()
      .then((p) => setProfile(p))
      .catch(() => setError("Nu am putut încărca profilul firmei."))
      .finally(() => setLoading(false));
  }, []);

  return (
    <FinLayout
      pageTitle="Compania mea"
      pageDescription="Profil fiscal și configurare workspace"
    >
      {loading && (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
          {error}
        </div>
      )}

      {!loading && !error && !profile && (
        <div className="rounded-xl border border-border bg-card/60 p-8 text-center space-y-3">
          <Building2 className="h-10 w-10 text-muted-foreground mx-auto" aria-hidden="true" />
          <p className="text-sm font-medium text-foreground">Profilul firmei nu a fost configurat</p>
          <p className="text-xs text-muted-foreground">
            Completează profilul fiscal al companiei pentru a emite facturi.
          </p>
        </div>
      )}

      {!loading && !error && profile && (
        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-card p-6 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-foreground">{profile.legalName}</h2>
                {profile.idno && (
                  <p className="text-xs text-muted-foreground mt-0.5">IDNO: {profile.idno}</p>
                )}
              </div>
              <button
                type="button"
                aria-label="Editează profilul firmei"
                className="flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-2 text-xs font-medium hover:border-primary/40 hover:bg-primary/5 transition-colors min-h-[44px]"
              >
                <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                Editează
              </button>
            </div>

            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
              <div>
                <dt className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">Țară</dt>
                <dd className="mt-0.5 text-foreground">{profile.country}</dd>
              </div>
              <div>
                <dt className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">Regim TVA</dt>
                <dd className="mt-0.5 text-foreground">{VAT_REGIME_LABELS[profile.vatRegime] ?? profile.vatRegime}</dd>
              </div>
              {profile.vatNumber && (
                <div>
                  <dt className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">Cod TVA</dt>
                  <dd className="mt-0.5 text-foreground">{profile.vatNumber}</dd>
                </div>
              )}
              <div>
                <dt className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">Monedă de bază</dt>
                <dd className="mt-0.5 text-foreground">{profile.baseCurrency}</dd>
              </div>
              {profile.address && (
                <div className="sm:col-span-2">
                  <dt className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">Adresă</dt>
                  <dd className="mt-0.5 text-foreground">{profile.address}</dd>
                </div>
              )}
            </dl>
          </div>
        </div>
      )}
    </FinLayout>
  );
}
