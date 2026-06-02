/**
 * MOB-103: Notification settings page
 * Route: /m/settings/notifications
 * Allows students/parents to manage push notification categories.
 */
import { useEffect, useState } from "react";
import { Bell, BellOff, BookOpen, Calendar, GraduationCap, CreditCard, ChevronLeft, Loader2, Check } from "lucide-react";
import { Link, useRouter } from "@/router/HashRouter";
import { useSession } from "@/hooks/useSession";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

interface Category {
  id: string;
  label: string;
  description: string;
  icon: React.ReactNode;
}

const CATEGORIES: Category[] = [
  { id: "homework", label: "Teme", description: "Notificări când profesorul adaugă o temă", icon: <BookOpen className="h-4 w-4" /> },
  { id: "schedule_change", label: "Modificări orar", description: "Când o lecție este modificată sau anulată", icon: <Calendar className="h-4 w-4" /> },
  { id: "grades", label: "Note", description: "Când profesorul îți pune o notă", icon: <GraduationCap className="h-4 w-4" /> },
  { id: "payment", label: "Plăți", description: "Facturi noi și memento de plată", icon: <CreditCard className="h-4 w-4" /> },
  { id: "system", label: "Sistem", description: "Anunțuri importante de la academie", icon: <Bell className="h-4 w-4" /> },
];

type PermissionState = "default" | "granted" | "denied" | "unsupported";

export function NotificationsSettingsPage() {
  const { status: sessionStatus } = useSession();
  const { navigate } = useRouter();
  const [permission, setPermission] = useState<PermissionState>("default");
  const [subscribing, setSubscribing] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [categories, setCategories] = useState<string[]>(CATEGORIES.map((c) => c.id));
  const [vapidKey, setVapidKey] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (sessionStatus === "unauthenticated") navigate("/app/login");
  }, [sessionStatus, navigate]);

  useEffect(() => {
    if (!("Notification" in window)) {
      setPermission("unsupported");
      return;
    }
    setPermission(Notification.permission as PermissionState);
    setEnabled(Notification.permission === "granted");
  }, []);

  useEffect(() => {
    // Load VAPID public key for subscription setup
    api<{ key: string | null }>("/api/m/push/vapid-public-key")
      .then((d) => setVapidKey(d.key))
      .catch(() => undefined);
  }, [sessionStatus]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  const handleEnableNotifications = async () => {
    if (!("Notification" in window) || !vapidKey) {
      setToast("Push notifications nu sunt disponibile în acest browser");
      return;
    }

    setSubscribing(true);
    try {
      const perm = await Notification.requestPermission();
      setPermission(perm as PermissionState);

      if (perm === "granted") {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: vapidKey,
        });

        const subJson = sub.toJSON();
        await api("/api/m/push/subscribe", {
          method: "POST",
          body: JSON.stringify({
            endpoint: subJson.endpoint,
            keys: subJson.keys,
            categories,
          }),
        });

        setEnabled(true);
        setToast("Notificările au fost activate!");
      } else {
        setToast("Notificările au fost blocate de browser");
      }
    } catch (err) {
      console.error("[push] subscribe error:", err);
      setToast("Eroare la activarea notificărilor");
    } finally {
      setSubscribing(false);
    }
  };

  const toggleCategory = (id: string) => {
    setCategories((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
    );
  };

  if (sessionStatus === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Toast */}
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 rounded-xl bg-card border border-border px-4 py-2.5 text-sm font-medium shadow-lg">
          {toast}
        </div>
      )}

      {/* Header */}
      <header className="sticky top-0 z-10 bg-card border-b border-border px-4 py-3 flex items-center gap-3">
        <Link to="/m/dashboard" className="text-muted-foreground hover:text-foreground" aria-label="Înapoi">
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-sm font-semibold flex-1">Notificări</h1>
        {enabled ? (
          <Bell className="h-4 w-4 text-primary" />
        ) : (
          <BellOff className="h-4 w-4 text-muted-foreground" />
        )}
      </header>

      <main className="flex-1 px-4 py-5 space-y-5 max-w-lg mx-auto w-full">
        {/* Enable button */}
        {!enabled && (
          <section className="rounded-xl border border-dashed border-primary/30 bg-primary/5 p-5 text-center space-y-3">
            <Bell className="h-8 w-8 text-primary mx-auto" />
            <div>
              <p className="text-sm font-medium">Activează notificările</p>
              <p className="text-xs text-muted-foreground mt-1">
                Primești push pe telefon când profesorul adaugă teme sau modifică orarul.
              </p>
            </div>
            {permission === "denied" ? (
              <p className="text-xs text-destructive">
                Notificările sunt blocate. Activează-le din setările browserului.
              </p>
            ) : permission === "unsupported" ? (
              <p className="text-xs text-muted-foreground">
                Browserul tău nu suportă notificări push.
              </p>
            ) : !vapidKey ? (
              <p className="text-xs text-muted-foreground">
                Push notifications nu sunt configurate pe server.
              </p>
            ) : (
              <button
                onClick={handleEnableNotifications}
                disabled={subscribing}
                className="w-full rounded-xl bg-primary text-primary-foreground text-sm font-medium py-2.5 disabled:opacity-50 transition-opacity"
              >
                {subscribing ? "Se configurează..." : "Activează notificările"}
              </button>
            )}
          </section>
        )}

        {/* Category toggles */}
        <section>
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            Categorii de notificări
          </h2>
          <div className="space-y-2">
            {CATEGORIES.map((cat) => {
              const active = categories.includes(cat.id);
              return (
                <button
                  key={cat.id}
                  onClick={() => toggleCategory(cat.id)}
                  className={cn(
                    "w-full flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition-colors",
                    active ? "border-primary/30 bg-primary/5" : "border-border bg-card"
                  )}
                >
                  <span className={cn("shrink-0", active ? "text-primary" : "text-muted-foreground")}>
                    {cat.icon}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{cat.label}</p>
                    <p className="text-xs text-muted-foreground truncate">{cat.description}</p>
                  </div>
                  {active && <Check className="h-4 w-4 text-primary shrink-0" />}
                </button>
              );
            })}
          </div>
        </section>

        {enabled && categories.length > 0 && (
          <p className="text-xs text-center text-muted-foreground">
            Primești notificări pentru {categories.length} {categories.length === 1 ? "categorie" : "categorii"}.
          </p>
        )}
      </main>
    </div>
  );
}
