/**
 * COURSE-103: StudentGroupsList — tab content for the student detail page.
 * Shows all groups the student is enrolled in (course name, schedule, spots).
 */
import { useEffect, useState } from "react";
import { Loader2, BookOpen } from "lucide-react";
import { listStudentGroups, type StudentGroupEntry } from "@/lib/api/groups";

interface StudentGroupsListProps {
  studentId: string;
}

function formatSchedule(entry: StudentGroupEntry): string {
  const t = entry.group.scheduleTemplate;
  if (!t?.days?.length) return "—";
  return `${t.days.join("/")} ${t.startTime}–${t.endTime}`;
}

export function StudentGroupsList({ studentId }: StudentGroupsListProps) {
  const [items, setItems] = useState<StudentGroupEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    listStudentGroups(studentId)
      .then((r) => {
        if (!cancelled) setItems(r.items);
      })
      .catch(() => {
        if (!cancelled) setError("Nu s-au putut încărca grupele.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [studentId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden="true" />
        <span className="sr-only">Se încarcă grupele...</span>
      </div>
    );
  }

  if (error) {
    return (
      <p role="alert" className="py-4 text-center text-sm text-destructive">
        {error}
      </p>
    );
  }

  if (items.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        Elevul nu este înrolat în nicio grupă.
      </p>
    );
  }

  return (
    <ul role="list" className="divide-y divide-border rounded-lg border border-border">
      {items.map(({ enrollment, group, courseName, courseCefr }) => (
        <li key={enrollment.id} className="flex items-start gap-3 px-4 py-3">
          <div
            className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-primary/10"
            aria-hidden="true"
          >
            <BookOpen className="h-4 w-4 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-foreground">{group.name}</p>
            <p className="text-xs text-muted-foreground">
              {courseName}
              {courseCefr ? ` · ${courseCefr}` : ""}
            </p>
            <p className="text-xs text-muted-foreground">{formatSchedule({ enrollment, group, courseName, courseCefr })}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}
