/**
 * KINDER-003 — /app/kinder/ratio
 *
 * Monitorizare raport personal/copii per cameră:
 * - Secțiunea Live status: carduri per cameră cu indicator verde/galben/roșu
 * - Secțiunea Configurare: limite per cameră + formular adăugare
 * - Banner alertă dacă orice cameră este over capacity
 */
import { useEffect, useState, useCallback } from "react";
import {
  Users, AlertTriangle, CheckCircle2, AlertCircle, Loader2,
  X, Plus, Trash2, Settings,
} from "lucide-react";
import { AppShell } from "@/components/app/AppShell";
import { useSession } from "@/hooks/useSession";
import {
  getLiveRatio,
  getRatioLimits,
  createRatioLimit,
  deleteRatioLimit,
  type RoomRatioStatus,
  type RatioLimit,
  type RatioStatus,
} from "@/lib/api/kinder";
import { cn } from "@/lib/utils";

// ─── Room type for dropdown ───────────────────────────────────────────────────

interface Room { id: string; name: string; }

// ─── Status helpers ───────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<RatioStatus, { label: string; color: string; bgColor: string; Icon: React.ElementType }> = {
  ok: {
    label: "OK",
    color: "text-green-700 dark:text-green-400",
    bgColor: "bg-green-50 dark:bg-green-950/20 border-green-300 dark:border-green-700",
    Icon: CheckCircle2,
  },
  warning: {
    label: "Atenție",
    color: "text-amber-700 dark:text-amber-400",
    bgColor: "bg-amber-50 dark:bg-amber-950/20 border-amber-300 dark:border-amber-700",
    Icon: AlertTriangle,
  },
  over: {
    label: "DEPĂȘIT",
    color: "text-red-700 dark:text-red-400",
    bgColor: "bg-red-50 dark:bg-red-950/20 border-red-400 dark:border-red-700",
    Icon: AlertCircle,
  },
  unconfigured: {
    label: "Neconfigurate",
    color: "text-muted-foreground",
    bgColor: "bg-card border-border",
    Icon: Settings,
  },
};

// ─── Room ratio card ──────────────────────────────────────────────────────────

function RoomRatioCard({ room }: { room: RoomRatioStatus }) {
  const cfg = STATUS_CONFIG[room.status];
  const Icon = cfg.Icon;

  const ratioStr = room.staffCount > 0
    ? `${room.childrenCount} copii / ${room.staffCount} personal`
    : `${room.childrenCount} copii (fără personal activ)`;

  return (
    <div className={cn("rounded-lg border p-5 space-y-3 transition-colors", cfg.bgColor)}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-base font-semibold text-foreground">{room.roomName}</h3>
        <div className={cn("flex items-center gap-1.5 text-sm font-semibold", cfg.color)}>
          <Icon className="h-4 w-4" />
          {cfg.label}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5">
          <Users className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm text-foreground">{ratioStr}</span>
        </div>
      </div>

      {room.ratioLimit !== null ? (
        <div className="text-xs text-muted-foreground">
          Limita legală: 1 personal la max {room.ratioLimit} copii
          {room.ageGroupLabel && <span> ({room.ageGroupLabel})</span>}
          {room.staffCount > 0 && (
            <span className="ml-2">= capacitate {room.staffCount * room.ratioLimit} copii</span>
          )}
        </div>
      ) : (
        <div className="text-xs text-muted-foreground">
          Limita legală nesetată pentru această cameră
        </div>
      )}
    </div>
  );
}

// ─── Add limit form ───────────────────────────────────────────────────────────

interface AddLimitFormProps {
  rooms: Room[];
  onSuccess: () => void;
}

function AddLimitForm({ rooms, onSuccess }: AddLimitFormProps) {
  const [roomId, setRoomId] = useState(rooms[0]?.id ?? "");
  const [maxChildren, setMaxChildren] = useState("8");
  const [ageGroupLabel, setAgeGroupLabel] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!roomId || !maxChildren) return;
    setLoading(true);
    setError(null);
    try {
      await createRatioLimit({
        roomId,
        maxChildrenPerStaff: Number(maxChildren),
        ageGroupLabel: ageGroupLabel.trim() || undefined,
      });
      setAgeGroupLabel("");
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Eroare");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="rounded-lg border border-border bg-card p-5 space-y-4">
      <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
        <Plus className="h-4 w-4" />
        Adaugă limită legală
      </h3>

      {error && (
        <p className="text-xs text-destructive flex items-center gap-1">
          <AlertCircle className="h-3.5 w-3.5" /> {error}
        </p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="sm:col-span-1">
          <label htmlFor="ratio-room" className="block text-xs font-medium text-muted-foreground mb-1">Cameră *</label>
          <select
            id="ratio-room"
            value={roomId}
            onChange={e => setRoomId(e.target.value)}
            required
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary appearance-none"
          >
            {rooms.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </div>

        <div>
          <label htmlFor="ratio-max" className="block text-xs font-medium text-muted-foreground mb-1">Max copii / angajat *</label>
          <input
            id="ratio-max"
            type="number"
            min="1"
            max="50"
            required
            value={maxChildren}
            onChange={e => setMaxChildren(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        <div>
          <label htmlFor="ratio-age" className="block text-xs font-medium text-muted-foreground mb-1">Grup de vârstă</label>
          <input
            id="ratio-age"
            type="text"
            value={ageGroupLabel}
            onChange={e => setAgeGroupLabel(e.target.value)}
            placeholder="0-2 ani"
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
      </div>

      <button
        type="submit"
        disabled={loading || !roomId}
        className="flex items-center gap-2 rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
        Adaugă limită
      </button>
    </form>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function KinderRatioPage() {
  const { data: session } = useSession();
  const [liveData, setLiveData] = useState<{ hasOverCapacity: boolean; rooms: RoomRatioStatus[] }>({
    hasOverCapacity: false,
    rooms: [],
  });
  const [limits, setLimits] = useState<RatioLimit[]>([]);
  const [allRooms, setAllRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    if (!session) return;
    try {
      const [liveRes, limitsRes, roomsRes] = await Promise.all([
        getLiveRatio(),
        getRatioLimits(),
        fetch("/api/rooms", { credentials: "include" }).then(r => r.ok ? r.json() as Promise<{ rooms: Room[] }> : Promise.reject()),
      ]);
      setLiveData({ hasOverCapacity: liveRes.hasOverCapacity, rooms: liveRes.rooms });
      setLimits(limitsRes);
      setAllRooms(roomsRes.rooms ?? []);
    } catch {
      setError("Nu s-au putut încărca datele de raport.");
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => { void loadAll(); }, [loadAll]);

  const handleDeleteLimit = async (limitId: string) => {
    setDeletingId(limitId);
    try {
      await deleteRatioLimit(limitId);
      await loadAll();
    } catch {
      setError("Ștergere eșuată.");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <AppShell
      pageTitle="Raport personal / copii"
      pageDescription="Monitorizare limită legală de licențiere"
    >
      {/* Over-capacity alert banner */}
      {liveData.hasOverCapacity && (
        <div className="mb-6 flex items-center gap-3 rounded-lg border border-red-400 bg-red-50 dark:bg-red-950/30 px-4 py-3 text-sm text-red-700 dark:text-red-400 font-medium">
          <AlertCircle className="h-5 w-5 shrink-0" />
          ATENȚIE: Una sau mai multe camere depășesc limita legală de personal/copii!
          Acționați imediat.
        </div>
      )}

      {error && (
        <div className="mb-4 flex items-center gap-2 rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
          <button type="button" onClick={() => setError(null)} className="ml-auto touch-target" aria-label="Închide">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : (
        <div className="space-y-8">
          {/* Live status */}
          <section>
            <h2 className="text-base font-semibold text-foreground mb-4 flex items-center gap-2">
              <Users className="h-4 w-4" />
              Status live — azi
            </h2>
            {liveData.rooms.length === 0 ? (
              <div className="rounded-lg border border-border bg-card p-8 text-center text-muted-foreground text-sm">
                Nicio cameră configurată. Adaugă camere din secțiunea Orar → Săli.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {liveData.rooms.map(room => (
                  <RoomRatioCard key={room.roomId} room={room} />
                ))}
              </div>
            )}
          </section>

          {/* Configured limits */}
          <section>
            <h2 className="text-base font-semibold text-foreground mb-4 flex items-center gap-2">
              <Settings className="h-4 w-4" />
              Limite configurate ({limits.length})
            </h2>
            {limits.length === 0 ? (
              <p className="text-sm text-muted-foreground mb-4">Nicio limită configurată. Adaugă limite pentru camerele tale.</p>
            ) : (
              <div className="rounded-lg border border-border bg-card overflow-hidden mb-4">
                <ul className="divide-y divide-border">
                  {limits.map(limit => (
                    <li key={limit.id} className="flex items-center gap-4 px-5 py-4">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground">
                          Max {limit.maxChildrenPerStaff} copii / angajat
                        </p>
                        {limit.ageGroupLabel && (
                          <p className="text-xs text-muted-foreground">{limit.ageGroupLabel}</p>
                        )}
                      </div>
                      <button
                        type="button"
                        disabled={deletingId === limit.id}
                        onClick={() => void handleDeleteLimit(limit.id)}
                        aria-label="Șterge limită"
                        className={cn(
                          "touch-target rounded-md hover:bg-destructive/10 hover:text-destructive text-muted-foreground flex items-center justify-center transition-colors",
                          deletingId === limit.id && "opacity-50"
                        )}
                      >
                        {deletingId === limit.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {allRooms.length > 0 && (
              <AddLimitForm rooms={allRooms} onSuccess={() => void loadAll()} />
            )}
          </section>
        </div>
      )}
    </AppShell>
  );
}
