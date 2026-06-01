/**
 * SET-803 — Branding settings page
 *
 * /app/settings/branding — Owner can upload logo and set primary/accent colors.
 * Preview is live. Reset to Vector Learn defaults available.
 */
import { useState, useEffect, useRef } from "react";
import { AppShell } from "@/components/app/AppShell";
import { api } from "@/lib/api";
import {
  Palette,
  Upload,
  X,
  RefreshCw,
  Save,
  AlertCircle,
  CheckCircle,
  Image,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface BrandingJson {
  primaryColor?: string;
  accentColor?: string;
}

interface BrandingState {
  logoUrl: string | null;
  brandingJson: BrandingJson | null;
}

// ─── Default colors (Vector Learn design system) ──────────────────────────────

const DEFAULT_PRIMARY = "#2563eb"; // blue-600
const DEFAULT_ACCENT = "#7c3aed"; // violet-600

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isValidHex(v: string): boolean {
  return /^#[0-9A-Fa-f]{6}$/.test(v);
}

function applyBrandColors(primary: string, accent: string) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.style.setProperty("--preview-primary", primary);
  root.style.setProperty("--preview-accent", accent);
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function BrandingPage() {
  const [branding, setBranding] = useState<BrandingState>({
    logoUrl: null,
    brandingJson: null,
  });
  const [primaryColor, setPrimaryColor] = useState(DEFAULT_PRIMARY);
  const [accentColor, setAccentColor] = useState(DEFAULT_ACCENT);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [logoUploading, setLogoUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<"saved" | "error" | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function showToast(type: "saved" | "error") {
    setToast(type);
    setTimeout(() => setToast(null), 2500);
  }

  // Load branding
  useEffect(() => {
    const load = async () => {
      try {
        const data = await api<BrandingState>("/api/settings/branding");
        setBranding(data);
        if (data.brandingJson?.primaryColor) {
          setPrimaryColor(data.brandingJson.primaryColor);
        }
        if (data.brandingJson?.accentColor) {
          setAccentColor(data.brandingJson.accentColor);
        }
      } catch {
        setError("Nu am putut încărca setările de branding.");
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);

  // Live preview — apply CSS vars
  useEffect(() => {
    if (isValidHex(primaryColor) && isValidHex(accentColor)) {
      applyBrandColors(primaryColor, accentColor);
    }
  }, [primaryColor, accentColor]);

  async function handleSave() {
    const validPrimary = isValidHex(primaryColor);
    const validAccent = isValidHex(accentColor);
    if (!validPrimary || !validAccent) {
      setError("Culorile trebuie să fie hex valide (#RRGGBB).");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api<{ ok: boolean }>("/api/settings/branding", {
        method: "PUT",
        body: JSON.stringify({
          brandingJson: { primaryColor, accentColor },
        }),
      });
      showToast("saved");
    } catch {
      showToast("error");
    } finally {
      setSaving(false);
    }
  }

  async function handleReset() {
    setPrimaryColor(DEFAULT_PRIMARY);
    setAccentColor(DEFAULT_ACCENT);
    setSaving(true);
    try {
      await api<{ ok: boolean }>("/api/settings/branding", {
        method: "PUT",
        body: JSON.stringify({
          logoUrl: "",
          brandingJson: { primaryColor: DEFAULT_PRIMARY, accentColor: DEFAULT_ACCENT },
        }),
      });
      setBranding((prev) => ({ ...prev, logoUrl: null }));
      showToast("saved");
    } catch {
      showToast("error");
    } finally {
      setSaving(false);
    }
  }

  async function handleLogoUpload(file: File) {
    const allowed = ["image/png", "image/jpeg", "image/svg+xml"];
    if (!allowed.includes(file.type)) {
      setError("Sunt acceptate doar fișierele PNG, JPG și SVG.");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setError("Logo-ul trebuie să fie mai mic de 2MB.");
      return;
    }
    setLogoUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/settings/branding/logo", {
        method: "POST",
        credentials: "include",
        body: form,
      });
      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        throw new Error(body.error ?? "upload_failed");
      }
      const data = (await res.json()) as { logoUrl: string };
      setBranding((prev) => ({ ...prev, logoUrl: data.logoUrl }));
      showToast("saved");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Eroare la upload.");
      showToast("error");
    } finally {
      setLogoUploading(false);
    }
  }

  function handleFileDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) void handleLogoUpload(file);
  }

  function handleFileInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) void handleLogoUpload(file);
  }

  return (
    <AppShell
      pageTitle="Branding"
      pageDescription="Personalizează aplicația cu logo-ul și culorile centrului tău."
    >
      <div className="mx-auto max-w-2xl space-y-8">
        {/* Error */}
        {error && (
          <div
            role="alert"
            className="flex items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
          >
            <AlertCircle className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
            {error}
            <button
              type="button"
              onClick={() => setError(null)}
              className="ml-auto"
              aria-label="Închide eroarea"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Toast */}
        {toast && (
          <div
            role="status"
            aria-live="polite"
            className={[
              "fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-lg px-4 py-3 text-sm font-medium shadow-lg",
              toast === "saved"
                ? "bg-foreground text-background"
                : "bg-destructive text-destructive-foreground",
            ].join(" ")}
          >
            {toast === "saved" ? (
              <>
                <CheckCircle className="h-4 w-4" aria-hidden="true" /> Salvat
              </>
            ) : (
              <>
                <AlertCircle className="h-4 w-4" aria-hidden="true" /> Eroare la salvare
              </>
            )}
          </div>
        )}

        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-32 animate-pulse rounded-lg bg-muted" aria-hidden />
            ))}
          </div>
        ) : (
          <>
            {/* ─ Logo ─ */}
            <section className="rounded-lg border border-border bg-card p-6 shadow-sm">
              <h2 className="mb-4 flex items-center gap-2 text-base font-semibold text-foreground">
                <Image className="h-5 w-5 text-primary" aria-hidden="true" />
                Logo centru
              </h2>

              {/* Current logo preview */}
              {branding.logoUrl && (
                <div className="mb-4 flex items-center gap-4">
                  <img
                    src={branding.logoUrl}
                    alt="Logo curent"
                    className="h-16 w-auto max-w-48 rounded-md border border-border object-contain"
                  />
                  <button
                    type="button"
                    onClick={() => setBranding((prev) => ({ ...prev, logoUrl: null }))}
                    className="flex items-center gap-1 text-xs text-destructive hover:underline"
                    aria-label="Elimină logo-ul"
                  >
                    <X className="h-3 w-3" aria-hidden="true" />
                    Elimină
                  </button>
                </div>
              )}

              {/* Drop zone */}
              <div
                role="button"
                tabIndex={0}
                aria-label="Zona de upload logo — trage fișierul sau apasă pentru a selecta"
                onDrop={handleFileDrop}
                onDragOver={(e) => e.preventDefault()}
                onClick={() => fileInputRef.current?.click()}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") fileInputRef.current?.click();
                }}
                className={[
                  "flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-border",
                  "px-6 py-8 text-center transition-colors",
                  "hover:border-primary hover:bg-muted/50",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  logoUploading ? "opacity-50 pointer-events-none" : "",
                ].join(" ")}
              >
                {logoUploading ? (
                  <RefreshCw className="mb-2 h-8 w-8 animate-spin text-muted-foreground" aria-hidden="true" />
                ) : (
                  <Upload className="mb-2 h-8 w-8 text-muted-foreground" aria-hidden="true" />
                )}
                <p className="text-sm font-medium text-foreground">
                  {logoUploading ? "Se încarcă..." : "Trage logo-ul aici sau apasă pentru a selecta"}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  PNG, JPG sau SVG · max 2MB
                </p>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/svg+xml"
                className="sr-only"
                aria-label="Upload logo"
                onChange={handleFileInputChange}
              />
            </section>

            {/* ─ Colors ─ */}
            <section className="rounded-lg border border-border bg-card p-6 shadow-sm">
              <h2 className="mb-4 flex items-center gap-2 text-base font-semibold text-foreground">
                <Palette className="h-5 w-5 text-primary" aria-hidden="true" />
                Culori brand
              </h2>

              <div className="grid gap-6 sm:grid-cols-2">
                {/* Primary color */}
                <div>
                  <label
                    htmlFor="primary-color"
                    className="mb-2 block text-sm font-medium text-foreground"
                  >
                    Culoare primară
                  </label>
                  <div className="flex items-center gap-3">
                    <input
                      id="primary-color"
                      type="color"
                      value={primaryColor}
                      onChange={(e) => setPrimaryColor(e.target.value)}
                      className="h-10 w-16 cursor-pointer rounded-md border border-border bg-transparent p-1"
                      aria-label="Alege culoarea primară"
                    />
                    <input
                      type="text"
                      value={primaryColor}
                      onChange={(e) => setPrimaryColor(e.target.value)}
                      maxLength={7}
                      placeholder="#2563eb"
                      aria-label="Hex culoare primară"
                      className={[
                        "flex-1 rounded-md border px-3 py-2 text-sm font-mono",
                        "bg-background text-foreground",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        !isValidHex(primaryColor) ? "border-destructive" : "border-border",
                      ].join(" ")}
                    />
                  </div>
                </div>

                {/* Accent color */}
                <div>
                  <label
                    htmlFor="accent-color"
                    className="mb-2 block text-sm font-medium text-foreground"
                  >
                    Culoare accent
                  </label>
                  <div className="flex items-center gap-3">
                    <input
                      id="accent-color"
                      type="color"
                      value={accentColor}
                      onChange={(e) => setAccentColor(e.target.value)}
                      className="h-10 w-16 cursor-pointer rounded-md border border-border bg-transparent p-1"
                      aria-label="Alege culoarea accent"
                    />
                    <input
                      type="text"
                      value={accentColor}
                      onChange={(e) => setAccentColor(e.target.value)}
                      maxLength={7}
                      placeholder="#7c3aed"
                      aria-label="Hex culoare accent"
                      className={[
                        "flex-1 rounded-md border px-3 py-2 text-sm font-mono",
                        "bg-background text-foreground",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        !isValidHex(accentColor) ? "border-destructive" : "border-border",
                      ].join(" ")}
                    />
                  </div>
                </div>
              </div>

              {/* Preview swatch */}
              <div className="mt-6 flex items-center gap-3">
                <div
                  className="h-8 w-24 rounded-md"
                  style={{ backgroundColor: isValidHex(primaryColor) ? primaryColor : DEFAULT_PRIMARY }}
                  aria-label={`Preview culoare primară: ${primaryColor}`}
                />
                <div
                  className="h-8 w-24 rounded-md"
                  style={{ backgroundColor: isValidHex(accentColor) ? accentColor : DEFAULT_ACCENT }}
                  aria-label={`Preview culoare accent: ${accentColor}`}
                />
                <span className="text-xs text-muted-foreground">Preview live</span>
              </div>
            </section>

            {/* ─ Actions ─ */}
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => void handleSave()}
                disabled={saving}
                className={[
                  "flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground",
                  "transition-opacity hover:opacity-90",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                  "disabled:opacity-50 disabled:cursor-not-allowed",
                ].join(" ")}
              >
                {saving ? (
                  <RefreshCw className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Save className="h-4 w-4" aria-hidden="true" />
                )}
                Salvează
              </button>

              <button
                type="button"
                onClick={() => void handleReset()}
                disabled={saving}
                className={[
                  "flex items-center gap-2 rounded-lg border border-border bg-background px-5 py-2.5 text-sm font-medium text-foreground",
                  "transition-colors hover:bg-muted",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                  "disabled:opacity-50 disabled:cursor-not-allowed",
                ].join(" ")}
              >
                <RefreshCw className="h-4 w-4" aria-hidden="true" />
                Resetează la default
              </button>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
