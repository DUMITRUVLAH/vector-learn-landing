/**
 * PAY-004: Stripe settings page — /app/settings/integrations/stripe
 * Configure Stripe keys per tenant.
 */
import { useEffect, useState } from "react";
import { CreditCard, Save, CheckCircle2, XCircle, Loader2, Info } from "lucide-react";
import { AppShell } from "@/components/app/AppShell";
import {
  getStripeSettings,
  saveStripeSettings,
  testStripeConnection,
  type StripeSettings,
} from "@/lib/api/stripe";

export function StripeSettingsPage() {
  const [settings, setSettings] = useState<StripeSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message?: string } | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [publishableKey, setPublishableKey] = useState("");
  const [secretKey, setSecretKey] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [enabled, setEnabled] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const s = await getStripeSettings();
        setSettings(s);
        if (s.publishableKey) setPublishableKey(s.publishableKey);
        setEnabled(s.enabled);
      } catch {
        setError("Nu am putut încărca setările Stripe.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!publishableKey.startsWith("pk_")) {
      setError("Cheia publică trebuie să înceapă cu pk_");
      return;
    }
    if (!secretKey.startsWith("sk_")) {
      setError("Cheia secretă trebuie să înceapă cu sk_");
      return;
    }
    setSaving(true);
    setError(null);
    setSaveSuccess(false);
    try {
      await saveStripeSettings({ publishableKey, secretKey, webhookSecret: webhookSecret || undefined, enabled });
      setSaveSuccess(true);
      setSecretKey(""); // clear after save for security
      setWebhookSecret("");
      // Reload settings
      const s = await getStripeSettings();
      setSettings(s);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Eroare la salvare.");
    } finally {
      setSaving(false);
    }
  }

  async function handleTest() {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await testStripeConnection();
      setTestResult(res);
    } catch {
      setTestResult({ ok: false, message: "Nu am putut testa conexiunea." });
    } finally {
      setTesting(false);
    }
  }

  return (
    <AppShell pageTitle="Setări Stripe" pageDescription="Configurează integrarea Stripe pentru plăți cu cardul.">
      <div className="max-w-2xl mx-auto py-8 px-4 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10">
            <CreditCard className="size-5 text-primary" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">Stripe — Plăți cu cardul</h1>
            <p className="text-sm text-muted-foreground">
              Configurează integrarea Stripe pentru a accepta plăți cu cardul.
            </p>
          </div>
        </div>

        {/* Status badge */}
        {!loading && settings && (
          <div
            className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
              settings.configured && settings.enabled
                ? "border-success/30 bg-success/10 text-success"
                : "border-border bg-muted text-muted-foreground"
            }`}
          >
            {settings.configured && settings.enabled ? (
              <>
                <CheckCircle2 className="size-4" aria-hidden="true" />
                Stripe configurat și activ
              </>
            ) : settings.configured ? (
              <>
                <Info className="size-4" aria-hidden="true" />
                Stripe configurat dar dezactivat
              </>
            ) : (
              <>
                <Info className="size-4" aria-hidden="true" />
                Stripe neconfigurat — completează cheile de mai jos
              </>
            )}
          </div>
        )}

        {loading && (
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            Se încarcă setările...
          </div>
        )}

        {/* Form */}
        {!loading && (
          <form onSubmit={handleSave} className="space-y-4 rounded-xl border border-border bg-card p-5">
            <div className="space-y-1">
              <label htmlFor="pk" className="block text-sm font-medium">
                Publishable Key
              </label>
              <input
                id="pk"
                type="text"
                value={publishableKey}
                onChange={(e) => setPublishableKey(e.target.value)}
                placeholder="pk_live_... sau pk_test_..."
                required
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <p className="text-xs text-muted-foreground">
                Vizibilă în codul frontend — sigură de expus.
              </p>
            </div>

            <div className="space-y-1">
              <label htmlFor="sk" className="block text-sm font-medium">
                Secret Key {settings?.secretKeyMasked && <span className="text-muted-foreground font-normal">(lăsă gol pentru a păstra cea existentă)</span>}
              </label>
              <input
                id="sk"
                type="password"
                value={secretKey}
                onChange={(e) => setSecretKey(e.target.value)}
                placeholder={settings?.secretKeyMasked ?? "sk_live_... sau sk_test_..."}
                required={!settings?.configured}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <p className="text-xs text-muted-foreground">
                Secretă — nu se afișează după salvare.
              </p>
            </div>

            <div className="space-y-1">
              <label htmlFor="wh" className="block text-sm font-medium">
                Webhook Secret{" "}
                <span className="text-muted-foreground font-normal">(opțional dar recomandat)</span>
              </label>
              <input
                id="wh"
                type="password"
                value={webhookSecret}
                onChange={(e) => setWebhookSecret(e.target.value)}
                placeholder={
                  settings?.webhookSecretConfigured
                    ? "whsec_... (lăsă gol pentru a păstra)"
                    : "whsec_..."
                }
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <p className="text-xs text-muted-foreground">
                URL webhook Stripe: <code className="text-xs bg-muted px-1 rounded">/api/webhooks/stripe</code>
              </p>
            </div>

            <div className="flex items-center gap-2">
              <input
                id="enabled"
                type="checkbox"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
                className="size-4 rounded border-border text-primary"
              />
              <label htmlFor="enabled" className="text-sm font-medium">
                Activează Stripe pentru acest centru
              </label>
            </div>

            {error && (
              <div role="alert" className="rounded-lg bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">
                {error}
              </div>
            )}

            {saveSuccess && (
              <div role="status" className="flex items-center gap-2 rounded-lg bg-success/10 border border-success/20 p-3 text-sm text-success">
                <CheckCircle2 className="size-4" aria-hidden="true" />
                Setări salvate cu succes!
              </div>
            )}

            <div className="flex gap-2 pt-1">
              <button
                type="submit"
                disabled={saving}
                className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60 transition-colors"
              >
                {saving ? (
                  <>
                    <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                    Salvez...
                  </>
                ) : (
                  <>
                    <Save className="size-4" aria-hidden="true" />
                    Salvează
                  </>
                )}
              </button>

              {settings?.configured && (
                <button
                  type="button"
                  onClick={handleTest}
                  disabled={testing}
                  className="flex items-center gap-1.5 rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-60 transition-colors"
                >
                  {testing ? (
                    <>
                      <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                      Testez...
                    </>
                  ) : (
                    "Testează conexiunea"
                  )}
                </button>
              )}
            </div>

            {testResult && (
              <div
                role="status"
                className={`flex items-center gap-2 rounded-lg border p-3 text-sm ${
                  testResult.ok
                    ? "border-success/30 bg-success/10 text-success"
                    : "border-destructive/30 bg-destructive/10 text-destructive"
                }`}
              >
                {testResult.ok ? (
                  <CheckCircle2 className="size-4" aria-hidden="true" />
                ) : (
                  <XCircle className="size-4" aria-hidden="true" />
                )}
                {testResult.ok ? "Conexiune Stripe OK!" : (testResult.message ?? "Conexiune eșuată")}
              </div>
            )}
          </form>
        )}
      </div>
    </AppShell>
  );
}
