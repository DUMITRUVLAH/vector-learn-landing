/**
 * SET-802 — Notification preferences page
 *
 * /app/settings/notifications — User can toggle which notification categories they receive.
 * Saves automatically on toggle (debounced 500ms). "system" category is locked on.
 */
import { useState, useEffect, useRef } from "react";
import { AppShell } from "@/components/app/AppShell";
import { api } from "@/lib/api";
import {
  Bell,
  BellOff,
  ShieldAlert,
  Megaphone,
  BookOpen,
  AlertTriangle,
  CheckCircle,
  AlertCircle,
  RefreshCw,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type NotificationCategory = "system" | "marketing" | "alerts" | "lessons";

interface NotificationPreferences {
  system: boolean;
  marketing: boolean;
  alerts: boolean;
  lessons: boolean;
}

// ─── Category meta ────────────────────────────────────────────────────────────

interface CategoryMeta {
  key: NotificationCategory;
  label: string;
  description: string;
  iconClass: string;
  Icon: React.ElementType;
  locked?: boolean;
}

const CATEGORIES: CategoryMeta[] = [
  {
    key: "system",
    label: "Notificări de sistem",
    description:
      "Alerte critice: outage, expirare sesiune, acțiuni de securitate. Nu pot fi dezactivate.",
    Icon: ShieldAlert,
    iconClass: "text-destructive",
    locked: true,
  },
  {
    key: "alerts",
    label: "Alerte operaționale",
    description:
      "Lecție anulată, sală schimbată, plată ratată, student absent recurent.",
    Icon: AlertTriangle,
    iconClass: "text-amber-500",
  },
  {
    key: "lessons",
    label: "Notificări cursuri",
    description:
      "Teme noi, feedback profesor, raport de progres, material publicat.",
    Icon: BookOpen,
    iconClass: "text-primary",
  },
  {
    key: "marketing",
    label: "Marketing și noutăți",
    description:
      "Promoții, noi funcționalități Vector Learn, newsletter lunar.",
    Icon: Megaphone,
    iconClass: "text-muted-foreground",
  },
];

// ─── Toggle component ─────────────────────────────────────────────────────────

interface ToggleProps {
  checked: boolean;
  disabled?: boolean;
  onChange: (val: boolean) => void;
  ariaLabel: string;
}

function Toggle({ checked, disabled, onChange, ariaLabel }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      className={[
        "relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent",
        "transition-colors duration-200 ease-in-out",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        "disabled:cursor-not-allowed disabled:opacity-50",
        checked ? "bg-primary" : "bg-input",
      ].join(" ")}
    >
      <span
        className={[
          "pointer-events-none inline-block h-5 w-5 rounded-full bg-background shadow-lg",
          "ring-0 transition duration-200 ease-in-out",
          checked ? "translate-x-5" : "translate-x-0",
        ].join(" ")}
        aria-hidden="true"
      />
    </button>
  );
}

// ─── API helpers ──────────────────────────────────────────────────────────────

async function fetchPrefs(): Promise<{ preferences: NotificationPreferences }> {
  return api<{ preferences: NotificationPreferences }>("/api/settings/notifications");
}

async function savePrefs(updates: Partial<NotificationPreferences>): Promise<{ ok: boolean }> {
  return api<{ ok: boolean }>("/api/settings/notifications", {
    method: "PUT",
    body: JSON.stringify(updates),
  });
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function NotificationPrefsPage() {
  const [prefs, setPrefs] = useState<NotificationPreferences>({
    system: true,
    marketing: true,
    alerts: true,
    lessons: true,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<"saved" | "error" | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showToast(type: "saved" | "error") {
    setToast(type);
    setTimeout(() => setToast(null), 2500);
  }

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchPrefs();
      setPrefs(res.preferences);
    } catch {
      setError("Nu am putut încărca preferințele.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  function handleToggle(category: NotificationCategory, value: boolean) {
    if (category === "system") return; // locked
    const updated = { ...prefs, [category]: value };
    setPrefs(updated);

    // Debounce 500ms
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        await savePrefs({ [category]: value });
        showToast("saved");
      } catch {
        // Revert optimistic update
        setPrefs(prefs);
        showToast("error");
      }
    }, 500);
  }

  return (
    <AppShell
      pageTitle="Preferințe notificări"
      pageDescription="Alege ce tipuri de notificări dorești să primești. Modificările se salvează automat."
    >
      <div className="mx-auto max-w-2xl">
        {/* Error */}
        {error && (
          <div
            role="alert"
            className="mb-6 flex items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
          >
            <AlertCircle className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
            {error}
            <button
              type="button"
              onClick={load}
              className="ml-auto flex items-center gap-1 text-xs hover:underline"
            >
              <RefreshCw className="h-3 w-3" aria-hidden="true" />
              Reîncearcă
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
                <BellOff className="h-4 w-4" aria-hidden="true" /> Eroare la salvare
              </>
            )}
          </div>
        )}

        {/* Skeleton */}
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="h-20 animate-pulse rounded-lg bg-muted"
                aria-hidden="true"
              />
            ))}
          </div>
        ) : (
          <>
            <div className="divide-y divide-border rounded-lg border border-border bg-card shadow-sm">
              {CATEGORIES.map((cat) => {
                const enabled = cat.locked ? true : prefs[cat.key];
                return (
                  <div
                    key={cat.key}
                    className="flex items-center justify-between px-5 py-4"
                  >
                    <div className="flex items-start gap-3">
                      <cat.Icon
                        className={["h-5 w-5 mt-0.5 flex-shrink-0", cat.iconClass].join(" ")}
                        aria-hidden="true"
                      />
                      <div>
                        <p className="text-sm font-medium text-foreground">
                          {cat.label}
                          {cat.locked && (
                            <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                              Obligatoriu
                            </span>
                          )}
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {cat.description}
                        </p>
                      </div>
                    </div>

                    <Toggle
                      checked={enabled}
                      disabled={cat.locked}
                      onChange={(val) => handleToggle(cat.key, val)}
                      ariaLabel={`${cat.locked ? "Activat permanent: " : ""}${cat.label}`}
                    />
                  </div>
                );
              })}
            </div>

            <p className="mt-6 text-xs text-muted-foreground">
              <Bell className="inline h-3.5 w-3.5 mr-1" aria-hidden="true" />
              Notificările critice de sistem sunt mereu activate pentru siguranța contului tău.
            </p>
          </>
        )}
      </div>
    </AppShell>
  );
}
