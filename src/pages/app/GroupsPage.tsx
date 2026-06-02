/**
 * COURSE-202: Groups page — class sections with capacity badges and waitlist support.
 * Route: /app/groups
 */
import { useEffect, useState } from "react";
import { Plus, Users, Loader2, AlertTriangle, ChevronDown, ChevronUp } from "lucide-react";
import { AppShell } from "@/components/app/AppShell";
import { useSession } from "@/hooks/useSession";
import { useRouter } from "@/router/HashRouter";
import {
  listGroups,
  createGroup,
  enrollStudent,
  unenrollStudent,
  type Group,
  type CreateGroupPayload,
} from "@/lib/api/groups";
import { listCourses, type Course } from "@/lib/api/lessons";
import { cn } from "@/lib/utils";

/**
 * CapacityBadge — "6/8" with color coding.
 * green: < 80%, amber: 80-99%, red: 100% (full)
 */
function CapacityBadge({ enrolled, max }: { enrolled: number; max: number }) {
  const pct = max > 0 ? enrolled / max : 0;
  const full = enrolled >= max;
  const label = `${enrolled}/${max}`;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold",
        full
          ? "bg-destructive/15 text-destructive"
          : pct >= 0.8
          ? "bg-warning/15 text-warning-foreground"
          : "bg-success/10 text-success-foreground"
      )}
      aria-label={`${enrolled} elevi din ${max}`}
      title={full ? "Grupă plină" : `${enrolled} din ${max} locuri ocupate`}
    >
      <Users className="h-3 w-3" aria-hidden="true" />
      {label}
    </span>
  );
}

interface GroupCardProps {
  group: Group;
  onEnroll: (groupId: string, studentId: string) => void;
  onUnenroll: (groupId: string, studentId: string) => void;
}

function GroupCard({ group }: GroupCardProps) {
  const full = group.enrolled >= group.maxStudents;

  return (
    <div
      className="rounded-lg border border-border bg-card p-4 flex flex-col gap-3"
      data-testid="group-card"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-semibold text-foreground">{group.name}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            ID: {group.id.slice(0, 8)}
          </p>
        </div>
        <CapacityBadge enrolled={group.enrolled} max={group.maxStudents} />
      </div>

      {group.waitlisted > 0 && (
        <p className="text-xs text-muted-foreground">
          {group.waitlisted} pe{" "}
          <span className="text-warning-foreground font-medium">waitlist</span>
        </p>
      )}

      {full && (
        <p className="text-xs text-destructive font-medium" role="alert">
          Grupă plină — noii elevi vor fi adăugați pe waitlist automat.
        </p>
      )}
    </div>
  );
}

interface CreateGroupModalProps {
  courses: Course[];
  onClose: () => void;
  onCreated: (g: Group) => void;
}

function CreateGroupModal({ courses, onClose, onCreated }: CreateGroupModalProps) {
  const [form, setForm] = useState<CreateGroupPayload>({
    courseId: courses[0]?.id ?? "",
    name: "",
    maxStudents: 20,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.courseId || !form.name.trim()) {
      setError("Completează cursul și numele grupei.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const created = await createGroup({ ...form, name: form.name.trim() });
      onCreated(created);
    } catch {
      setError("Eroare la creare. Încearcă din nou.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-group-title"
    >
      <div className="bg-card rounded-xl border border-border p-6 w-full max-w-md mx-4 shadow-xl">
        <h2
          id="create-group-title"
          className="text-lg font-semibold text-foreground mb-4"
        >
          Grupă nouă
        </h2>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="group-course"
              className="text-sm font-medium text-foreground"
            >
              Curs
            </label>
            <select
              id="group-course"
              value={form.courseId}
              onChange={(e) =>
                setForm((f) => ({ ...f, courseId: e.target.value }))
              }
              className="border border-border rounded-md px-3 py-2 text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="group-name"
              className="text-sm font-medium text-foreground"
            >
              Nume grupă
            </label>
            <input
              id="group-name"
              type="text"
              value={form.name}
              onChange={(e) =>
                setForm((f) => ({ ...f, name: e.target.value }))
              }
              placeholder="ex: Engleză B2 Mar/Joi"
              className="border border-border rounded-md px-3 py-2 text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="group-max"
              className="text-sm font-medium text-foreground"
            >
              Capacitate maximă (elevi)
            </label>
            <input
              id="group-max"
              type="number"
              min={1}
              max={500}
              value={form.maxStudents}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  maxStudents: parseInt(e.target.value, 10) || 1,
                }))
              }
              className="border border-border rounded-md px-3 py-2 text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm rounded-md border border-border text-muted-foreground hover:bg-muted transition-colors"
            >
              Anulează
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors disabled:opacity-60 flex items-center gap-2"
            >
              {loading && (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              )}
              Creează grupă
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function GroupsPage() {
  const { status: sessionStatus } = useSession();
  const { navigate } = useRouter();

  const [groups, setGroups] = useState<Group[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [filterCourseId, setFilterCourseId] = useState<string>("all");

  useEffect(() => {
    if (sessionStatus === "unauthenticated") {
      navigate("/app/login");
    }
  }, [sessionStatus, navigate]);

  useEffect(() => {
    if (sessionStatus !== "authenticated") return;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const [g, { items: c }] = await Promise.all([listGroups(), listCourses()]);
        setGroups(g);
        setCourses(c);
      } catch {
        setError("Nu s-au putut încărca grupele.");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [sessionStatus]);

  const handleCreated = (g: Group) => {
    setGroups((prev) => [g, ...prev]);
    setShowModal(false);
  };

  const filteredGroups =
    filterCourseId === "all"
      ? groups
      : groups.filter((g) => g.courseId === filterCourseId);

  return (
    <AppShell
      pageTitle="Grupe"
      pageDescription="Clase cu capacitate maximă și waitlist"
      actions={
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
          aria-label="Adaugă grupă nouă"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Grupă nouă
        </button>
      }
    >
      {/* Filter by course */}
      <div className="mb-4 flex flex-wrap gap-2 items-center">
        <label htmlFor="filter-course" className="text-sm font-medium text-muted-foreground sr-only">
          Filtrează după curs
        </label>
        <select
          id="filter-course"
          value={filterCourseId}
          onChange={(e) => setFilterCourseId(e.target.value)}
          className="border border-border rounded-md px-3 py-1.5 text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          aria-label="Filtrează grupe după curs"
        >
          <option value="all">Toate cursurile</option>
          {courses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <span className="text-sm text-muted-foreground">
          {filteredGroups.length}{" "}
          {filteredGroups.length === 1 ? "grupă" : "grupe"}
        </span>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2
            className="h-8 w-8 animate-spin text-muted-foreground"
            aria-label="Se încarcă grupele..."
          />
        </div>
      ) : error ? (
        <div className="flex items-center gap-2 text-destructive py-8" role="alert">
          <AlertTriangle className="h-5 w-5" aria-hidden="true" />
          <span>{error}</span>
        </div>
      ) : filteredGroups.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Users className="h-10 w-10 mx-auto mb-3 opacity-40" aria-hidden="true" />
          <p className="font-medium">Nicio grupă</p>
          <p className="text-sm mt-1">
            Adaugă prima grupă cu butonul din dreapta sus.
          </p>
        </div>
      ) : (
        <div
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
          data-testid="groups-grid"
        >
          {filteredGroups.map((g) => (
            <GroupCard
              key={g.id}
              group={g}
              onEnroll={() => {}} // future: enroll UI
              onUnenroll={() => {}} // future: unenroll UI
            />
          ))}
        </div>
      )}

      {showModal && courses.length > 0 && (
        <CreateGroupModal
          courses={courses}
          onClose={() => setShowModal(false)}
          onCreated={handleCreated}
        />
      )}
    </AppShell>
  );
}
