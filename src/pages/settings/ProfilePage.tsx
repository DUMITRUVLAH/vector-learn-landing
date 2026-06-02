import { useState, useEffect } from "react";
import { Loader2, Save, KeyRound, Download, Trash2, User } from "lucide-react";
import { AppShell } from "@/components/app/AppShell";
import { api, ApiError } from "@/lib/api";
import { useSession } from "@/hooks/useSession";

interface ProfileData {
  name: string;
  phone: string;
  language: "ro" | "en" | "ru";
  timezone: string;
}

interface ChangePasswordForm {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

/**
 * AUTH-003: User profile page at /app/settings/profile.
 * Sections: Profile edit, Change password, GDPR export, GDPR delete.
 */
export function ProfilePage() {
  const { data: sessionData } = useSession();
  const [profile, setProfile] = useState<ProfileData>({
    name: sessionData?.user?.name ?? "",
    phone: "",
    language: "ro",
    timezone: "Europe/Bucharest",
  });
  const [pwForm, setPwForm] = useState<ChangePasswordForm>({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [saving, setSaving] = useState(false);
  const [savingPw, setSavingPw] = useState(false);
  const [profileMsg, setProfileMsg] = useState<{ type: "ok" | "error"; text: string } | null>(null);
  const [pwMsg, setPwMsg] = useState<{ type: "ok" | "error"; text: string } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);

  // Fetch current profile on mount
  useEffect(() => {
    api("/api/auth/me")
      .then((data: unknown) => {
        const d = data as { user: ProfileData & { name: string } };
        setProfile({
          name: d.user.name ?? "",
          phone: (d.user as { phone?: string }).phone ?? "",
          language: (d.user as { language?: "ro" | "en" | "ru" }).language ?? "ro",
          timezone: (d.user as { timezone?: string }).timezone ?? "Europe/Bucharest",
        });
      })
      .catch(() => {}); // silently fail — profile pre-filled from session
  }, []);

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setProfileMsg(null);
    try {
      await api("/api/auth/profile", {
        method: "PATCH",
        body: JSON.stringify(profile),
      });
      setProfileMsg({ type: "ok", text: "Profil actualizat cu succes." });
    } catch {
      setProfileMsg({ type: "error", text: "Nu s-a putut actualiza profilul." });
    } finally {
      setSaving(false);
    }
  };

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pwForm.newPassword !== pwForm.confirmPassword) {
      setPwMsg({ type: "error", text: "Parolele nu se potrivesc." });
      return;
    }
    setSavingPw(true);
    setPwMsg(null);
    try {
      await api("/api/auth/change-password", {
        method: "POST",
        body: JSON.stringify(pwForm),
      });
      setPwMsg({ type: "ok", text: "Parola schimbată. Te vei deconecta automat." });
      setPwForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
      setTimeout(() => {
        window.location.hash = "#/app/login";
      }, 2000);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setPwMsg({ type: "error", text: "Parola curentă este greșită." });
      } else {
        setPwMsg({ type: "error", text: "Nu s-a putut schimba parola." });
      }
    } finally {
      setSavingPw(false);
    }
  };

  const exportData = async () => {
    try {
      const data = await api("/api/auth/export-data", { method: "POST" });
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "datele-mele-vectorlearn.json";
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert("Nu s-au putut exporta datele.");
    }
  };

  const deleteAccount = async () => {
    if (!deleteConfirm) return;
    setDeleting(true);
    try {
      await api("/api/auth/delete-account", {
        method: "POST",
        body: JSON.stringify({ password: deleteConfirm }),
      });
      window.location.hash = "#/app/login";
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        alert("Parola incorectă.");
      } else {
        alert("Eroare la ștergerea contului.");
      }
    } finally {
      setDeleting(false);
    }
  };

  return (
    <AppShell pageTitle="Profilul meu">
      <div className="max-w-2xl mx-auto space-y-8 px-4 py-6">

        {/* Profile section */}
        <section className="rounded-lg border border-border bg-card p-6">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <User className="h-5 w-5 text-primary" aria-hidden="true" />
            Date personale
          </h2>
          <form onSubmit={saveProfile} className="space-y-4">
            <div>
              <label htmlFor="prof-name" className="block text-sm font-semibold mb-1.5">Nume complet</label>
              <input
                id="prof-name"
                type="text"
                required
                value={profile.name}
                onChange={(e) => setProfile((p) => ({ ...p, name: e.target.value }))}
                className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
              />
            </div>
            <div>
              <label htmlFor="prof-phone" className="block text-sm font-semibold mb-1.5">Telefon</label>
              <input
                id="prof-phone"
                type="tel"
                value={profile.phone}
                onChange={(e) => setProfile((p) => ({ ...p, phone: e.target.value }))}
                placeholder="+40 700 000 000"
                className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
              />
            </div>
            <div>
              <label htmlFor="prof-lang" className="block text-sm font-semibold mb-1.5">Limbă</label>
              <select
                id="prof-lang"
                value={profile.language}
                onChange={(e) => setProfile((p) => ({ ...p, language: e.target.value as "ro" | "en" | "ru" }))}
                className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
              >
                <option value="ro">Română</option>
                <option value="en">English</option>
                <option value="ru">Русский</option>
              </select>
            </div>
            {profileMsg && (
              <div
                role="alert"
                className={`rounded-md px-3 py-2 text-sm ${profileMsg.type === "ok" ? "bg-success/10 border border-success/30 text-success" : "bg-destructive/10 border border-destructive/30 text-destructive"}`}
              >
                {profileMsg.text}
              </div>
            )}
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Salvează profilul
            </button>
          </form>
        </section>

        {/* Change password section */}
        <section className="rounded-lg border border-border bg-card p-6">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <KeyRound className="h-5 w-5 text-primary" aria-hidden="true" />
            Schimbă parola
          </h2>
          <form onSubmit={changePassword} className="space-y-4">
            <div>
              <label htmlFor="cp-current" className="block text-sm font-semibold mb-1.5">Parola curentă</label>
              <input
                id="cp-current"
                type="password"
                required
                autoComplete="current-password"
                value={pwForm.currentPassword}
                onChange={(e) => setPwForm((f) => ({ ...f, currentPassword: e.target.value }))}
                className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
              />
            </div>
            <div>
              <label htmlFor="cp-new" className="block text-sm font-semibold mb-1.5">Parola nouă (min. 8 caractere)</label>
              <input
                id="cp-new"
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                value={pwForm.newPassword}
                onChange={(e) => setPwForm((f) => ({ ...f, newPassword: e.target.value }))}
                className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
              />
            </div>
            <div>
              <label htmlFor="cp-confirm" className="block text-sm font-semibold mb-1.5">Confirmă parola nouă</label>
              <input
                id="cp-confirm"
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                value={pwForm.confirmPassword}
                onChange={(e) => setPwForm((f) => ({ ...f, confirmPassword: e.target.value }))}
                className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
              />
            </div>
            {pwMsg && (
              <div
                role="alert"
                className={`rounded-md px-3 py-2 text-sm ${pwMsg.type === "ok" ? "bg-success/10 border border-success/30 text-success" : "bg-destructive/10 border border-destructive/30 text-destructive"}`}
              >
                {pwMsg.text}
              </div>
            )}
            <button
              type="submit"
              disabled={savingPw}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {savingPw ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
              Schimbă parola
            </button>
          </form>
        </section>

        {/* GDPR section */}
        <section className="rounded-lg border border-border bg-card p-6 space-y-6">
          <h2 className="text-lg font-semibold">Drepturile tale (GDPR)</h2>

          {/* Export data */}
          <div>
            <p className="text-sm text-muted-foreground mb-3">
              <strong>Export date (Art. 15)</strong> — Descarcă toate datele tale personale stocate în Vector Learn.
            </p>
            <button
              type="button"
              onClick={exportData}
              className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-4 py-2 text-sm font-semibold hover:bg-accent"
            >
              <Download className="h-4 w-4" />
              Exportă datele mele (JSON)
            </button>
          </div>

          {/* Delete account */}
          <div className="border-t border-border pt-4">
            <p className="text-sm text-muted-foreground mb-3">
              <strong>Ștergere cont (Art. 17)</strong> — Contul va fi marcat pentru ștergere și anonimizat complet după 30 de zile. Introdu parola pentru confirmare.
            </p>
            <div className="flex gap-2 items-center">
              <input
                type="password"
                aria-label="Confirmare parolă pentru ștergere cont"
                placeholder="Parola ta"
                value={deleteConfirm}
                onChange={(e) => setDeleteConfirm(e.target.value)}
                className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <button
                type="button"
                disabled={deleting || !deleteConfirm}
                onClick={deleteAccount}
                className="inline-flex items-center gap-2 rounded-md bg-destructive px-4 py-2 text-sm font-semibold text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50"
              >
                {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                Șterge contul
              </button>
            </div>
          </div>
        </section>

      </div>
    </AppShell>
  );
}
