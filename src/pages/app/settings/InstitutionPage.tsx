import { useEffect, useState } from "react";
import { Loader2, Save, Check } from "lucide-react";
import { AppShell } from "@/components/app/AppShell";
import { ApiError } from "@/lib/api";
import { getInstitutionType, setInstitutionType } from "@/lib/api/institution";
import { INSTITUTION_TYPES, type InstitutionType } from "@/lib/institution";
import { cn } from "@/lib/utils";

/**
 * INST-001 — /app/settings/institution
 * Choose the institution type (gradinita | scoala | mixt). This controls which
 * module groups appear in the sidebar and on the dashboard for the whole
 * workspace. Saved on the tenant; the page reloads on save so the sidebar
 * (which reads the session) reflects the new module set immediately.
 */
export function InstitutionPage() {
  const [selected, setSelected] = useState<InstitutionType>("mixt");
  const [initial, setInitial] = useState<InstitutionType>("mixt");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ type: "ok" | "error"; text: string } | null>(null);

  useEffect(() => {
    getInstitutionType()
      .then(({ institutionType }) => {
        setSelected(institutionType);
        setInitial(institutionType);
      })
      .catch(() => setError("Nu s-a putut încărca tipul instituției."))
      .finally(() => setLoading(false));
  }, []);

  const dirty = selected !== initial;

  async function handleSave() {
    setSaving(true);
    setMsg(null);
    try {
      await setInstitutionType(selected);
      setMsg({ type: "ok", text: "Salvat. Se reîncarcă meniul…" });
      // Reload so AppShell re-reads the session and updates module visibility.
      setTimeout(() => window.location.reload(), 600);
    } catch (e) {
      const text =
        e instanceof ApiError && e.status === 403
          ? "Doar administratorii pot schimba tipul instituției."
          : "Nu s-a putut salva. Încearcă din nou.";
      setMsg({ type: "error", text });
      setSaving(false);
    }
  }

  return (
    <AppShell
      pageTitle="Tip instituție"
      pageDescription="Alege ce ești — asta decide ce module apar în cabinet."
    >
      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground" role="status" aria-live="polite">
          <Loader2 className="h-5 w-5 animate-spin mr-2" aria-hidden="true" />
          Se încarcă…
        </div>
      ) : error ? (
        <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          {error}
        </div>
      ) : (
        <div className="max-w-2xl space-y-6">
          <fieldset className="space-y-3">
            <legend className="sr-only">Tip instituție</legend>
            {INSTITUTION_TYPES.map((opt) => {
              const active = selected === opt.value;
              return (
                <label
                  key={opt.value}
                  className={cn(
                    "flex items-start gap-3 rounded-xl border p-4 cursor-pointer transition-colors",
                    active
                      ? "border-primary bg-primary/5 ring-1 ring-primary"
                      : "border-border bg-card hover:bg-muted/40"
                  )}
                >
                  <input
                    type="radio"
                    name="institutionType"
                    value={opt.value}
                    checked={active}
                    onChange={() => setSelected(opt.value)}
                    className="sr-only"
                  />
                  <span
                    aria-hidden="true"
                    className={cn(
                      "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2",
                      active ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40"
                    )}
                  >
                    {active && <Check className="h-3 w-3" />}
                  </span>
                  <span className="flex-1">
                    <span className="block text-sm font-semibold">{opt.label}</span>
                    <span className="block text-xs text-muted-foreground mt-0.5">{opt.desc}</span>
                  </span>
                </label>
              );
            })}
          </fieldset>

          {msg && (
            <p
              role={msg.type === "error" ? "alert" : "status"}
              className={cn("text-sm", msg.type === "ok" ? "text-primary" : "text-destructive")}
            >
              {msg.text}
            </p>
          )}

          <button
            type="button"
            onClick={handleSave}
            disabled={!dirty || saving}
            className={cn(
              "inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors",
              !dirty || saving
                ? "bg-muted text-muted-foreground cursor-not-allowed"
                : "bg-primary text-primary-foreground hover:bg-primary/90"
            )}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Salvează
          </button>
        </div>
      )}
    </AppShell>
  );
}
