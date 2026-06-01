/**
 * KINDER-001 — /app/kinder/students/:id/pickups
 *
 * Gestionarea persoanelor autorizate să ridice un copil:
 * - Tabel cu persoanele autorizate
 * - Formular adăugare persoană nouă (Nume + Relație + Telefon + PIN opțional)
 * - Buton ștergere
 */
import { useEffect, useState, useCallback } from "react";
import {
  UserCheck, Plus, Trash2, Loader2, AlertCircle, X,
  Phone, Star, Lock,
} from "lucide-react";
import { AppShell } from "@/components/app/AppShell";
import { useSession } from "@/hooks/useSession";
import { useRouter } from "@/router/HashRouter";
import {
  getStudentPickups,
  addPickup,
  removePickup,
  type AuthorizedPickup,
} from "@/lib/api/kinder";
import { cn } from "@/lib/utils";

// ─── Add pickup form ───────────────────────────────────────────────────────────

interface AddPickupFormProps {
  studentId: string;
  onSuccess: () => void;
}

function AddPickupForm({ studentId, onSuccess }: AddPickupFormProps) {
  const [name, setName] = useState("");
  const [relation, setRelation] = useState("");
  const [phone, setPhone] = useState("");
  const [pin, setPin] = useState("");
  const [isDefault, setIsDefault] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    setError(null);
    try {
      await addPickup(studentId, {
        name: name.trim(),
        relation: relation.trim() || undefined,
        phone: phone.trim() || undefined,
        pin: pin.trim() || undefined,
        isDefault,
      });
      setName(""); setRelation(""); setPhone(""); setPin(""); setIsDefault(false);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Eroare la adăugare");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="rounded-lg border border-border bg-card p-5 space-y-4">
      <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
        <Plus className="h-4 w-4" />
        Adaugă persoană autorizată
      </h3>

      {error && (
        <p className="text-xs text-destructive flex items-center gap-1">
          <AlertCircle className="h-3.5 w-3.5" /> {error}
        </p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label htmlFor="pickup-name" className="block text-xs font-medium text-muted-foreground mb-1">
            Nume complet *
          </label>
          <input
            id="pickup-name"
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Maria Ionescu"
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        <div>
          <label htmlFor="pickup-relation" className="block text-xs font-medium text-muted-foreground mb-1">
            Relație
          </label>
          <input
            id="pickup-relation"
            type="text"
            value={relation}
            onChange={(e) => setRelation(e.target.value)}
            placeholder="Mamă, Tată, Bunică..."
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        <div>
          <label htmlFor="pickup-phone" className="block text-xs font-medium text-muted-foreground mb-1">
            Telefon
          </label>
          <input
            id="pickup-phone"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+40 700 000 000"
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        <div>
          <label htmlFor="pickup-pin" className="block text-xs font-medium text-muted-foreground mb-1">
            PIN (4–6 cifre, opțional)
          </label>
          <input
            id="pickup-pin"
            type="password"
            inputMode="numeric"
            maxLength={6}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
            placeholder="••••"
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
      </div>

      <label className="flex items-center gap-2 cursor-pointer text-sm text-foreground">
        <input
          type="checkbox"
          checked={isDefault}
          onChange={(e) => setIsDefault(e.target.checked)}
          className="rounded border-border"
        />
        Persoană implicită (apare prima în lista la check-out)
      </label>

      <button
        type="submit"
        disabled={loading || !name.trim()}
        className="flex items-center gap-2 rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
        Adaugă
      </button>
    </form>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function KinderPickupsPage() {
  const { data: session } = useSession();
  const { path } = useRouter();
  // Extract studentId from path: /app/kinder/students/:id/pickups
  const studentId = path.split("/")[4] ?? "";

  const [pickups, setPickups] = useState<AuthorizedPickup[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!session || !studentId) return;
    try {
      const data = await getStudentPickups(studentId);
      setPickups(data);
    } catch {
      setError("Nu s-au putut încărca persoanele autorizate.");
    } finally {
      setLoading(false);
    }
  }, [session, studentId]);

  useEffect(() => { void load(); }, [load]);

  const handleDelete = async (pickupId: string) => {
    setDeletingId(pickupId);
    try {
      await removePickup(studentId, pickupId);
      await load();
    } catch {
      setError("Ștergere eșuată.");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <AppShell
      pageTitle="Persoane autorizate"
      pageDescription="Gestionează cine poate ridica copilul"
    >
      {error && (
        <div className="mb-4 flex items-center gap-2 rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
          <button
            type="button"
            onClick={() => setError(null)}
            className="ml-auto touch-target"
            aria-label="Închide alerta"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="space-y-6">
        {/* Existing pickups list */}
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <div className="px-5 py-4 border-b border-border">
            <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <UserCheck className="h-4 w-4" />
              Persoane autorizate ({pickups.length})
            </h2>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : pickups.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              <UserCheck className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">Nicio persoană autorizată încă.</p>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {pickups.map((p) => (
                <li key={p.id} className="flex items-center gap-4 px-5 py-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-foreground">{p.name}</p>
                      {p.isDefault && (
                        <span className="inline-flex items-center gap-0.5 text-xs text-amber-600 dark:text-amber-400">
                          <Star className="h-3 w-3 fill-current" />
                          implicit
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                      {p.relation && <span>{p.relation}</span>}
                      {p.phone && (
                        <span className="flex items-center gap-0.5">
                          <Phone className="h-3 w-3" /> {p.phone}
                        </span>
                      )}
                      {p.hasPin && (
                        <span className="flex items-center gap-0.5 text-green-600 dark:text-green-400">
                          <Lock className="h-3 w-3" /> PIN setat
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={deletingId === p.id}
                    onClick={() => void handleDelete(p.id)}
                    aria-label={`Șterge ${p.name}`}
                    className={cn(
                      "touch-target rounded-md hover:bg-destructive/10 hover:text-destructive flex items-center justify-center text-muted-foreground transition-colors",
                      deletingId === p.id && "opacity-50 cursor-not-allowed"
                    )}
                  >
                    {deletingId === p.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Add new pickup form */}
        <AddPickupForm studentId={studentId} onSuccess={() => void load()} />
      </div>
    </AppShell>
  );
}
