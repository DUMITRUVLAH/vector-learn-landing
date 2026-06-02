/**
 * COURSE-103: GroupDetailPage — shows group info + "Elevi înrolați" tab.
 * Route: /app/groups/:id
 */
import { useEffect, useId, useState } from "react";
import { ArrowLeft, Loader2, Users } from "lucide-react";
import { AppShell } from "@/components/app/AppShell";
import { GroupEnrollmentsList } from "@/components/app/GroupEnrollmentsList";
import { useSession } from "@/hooks/useSession";
import { useRouter } from "@/router/HashRouter";
import { getGroup, type Group } from "@/lib/api/groups";
import { cn } from "@/lib/utils";

type Tab = "info" | "elevi";

interface GroupDetailPageProps {
  groupId: string;
}

function formatSchedule(g: Group): string {
  const t = g.scheduleTemplate;
  if (!t?.days?.length) return "—";
  return `${t.days.join("/")} ${t.startTime}–${t.endTime}`;
}

export function GroupDetailPage({ groupId }: GroupDetailPageProps) {
  const { status: sessionStatus } = useSession();
  const { navigate } = useRouter();
  const tabBarId = useId();

  const [group, setGroup] = useState<Group | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("elevi");

  useEffect(() => {
    if (sessionStatus === "unauthenticated") navigate("/app/login");
  }, [sessionStatus, navigate]);

  const fetchGroup = () => {
    setLoading(true);
    setError(null);
    getGroup(groupId)
      .then((g) => setGroup(g))
      .catch(() => setError("Grupa nu a fost găsită."))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (!groupId) return;
    fetchGroup();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId]);

  if (loading) {
    return (
      <AppShell pageTitle="Detalii grupă">
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" aria-hidden="true" />
          <span className="sr-only">Se încarcă...</span>
        </div>
      </AppShell>
    );
  }

  if (error || !group) {
    return (
      <AppShell pageTitle="Detalii grupă">
        <div className="py-16 text-center">
          <p className="text-muted-foreground">{error ?? "Grupă negăsită."}</p>
          <button
            type="button"
            onClick={() => navigate("/app/groups")}
            className="mt-4 text-sm text-primary hover:underline"
          >
            Înapoi la grupe
          </button>
        </div>
      </AppShell>
    );
  }

  const isFull = group.spotsRemaining === 0;

  return (
    <AppShell pageTitle={group.name}>
      <div className="mx-auto max-w-3xl space-y-6 px-4 py-6">
        {/* Back link */}
        <button
          type="button"
          onClick={() => navigate("/app/groups")}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Grupe
        </button>

        {/* Header */}
        <div className="flex items-center gap-4">
          <div
            className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-primary/10"
            aria-hidden="true"
          >
            <Users className="h-6 w-6 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-semibold text-foreground">{group.name}</h1>
            <div className="flex items-center gap-2 flex-wrap mt-0.5">
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-xs font-medium",
                  isFull
                    ? "bg-destructive/15 text-destructive"
                    : "bg-success/15 text-success"
                )}
              >
                {isFull
                  ? "Plin"
                  : `${group.spotsRemaining} locuri rămase`}
              </span>
              <span className="text-sm text-muted-foreground">{formatSchedule(group)}</span>
            </div>
          </div>
        </div>

        {/* Tab bar */}
        <div
          role="tablist"
          aria-label="Secțiuni grupă"
          id={tabBarId}
          className="border-b border-border"
        >
          {(["elevi", "info"] as const).map((tab) => {
            const labels: Record<Tab, string> = { elevi: "Elevi înrolați", info: "Informații" };
            return (
              <button
                key={tab}
                type="button"
                role="tab"
                id={`${tabBarId}-tab-${tab}`}
                aria-selected={activeTab === tab}
                aria-controls={`${tabBarId}-panel-${tab}`}
                onClick={() => setActiveTab(tab)}
                className={cn(
                  "mr-1 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors",
                  activeTab === tab
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                )}
              >
                {labels[tab]}
              </button>
            );
          })}
        </div>

        {/* Tab panels */}
        <div
          role="tabpanel"
          id={`${tabBarId}-panel-elevi`}
          aria-labelledby={`${tabBarId}-tab-elevi`}
          hidden={activeTab !== "elevi"}
        >
          {activeTab === "elevi" && (
            <GroupEnrollmentsList
              group={group}
              onSpotsChanged={fetchGroup}
            />
          )}
        </div>

        <div
          role="tabpanel"
          id={`${tabBarId}-panel-info`}
          aria-labelledby={`${tabBarId}-tab-info`}
          hidden={activeTab !== "info"}
        >
          {activeTab === "info" && (
            <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {[
                { label: "Nume grupă", value: group.name },
                { label: "Program", value: formatSchedule(group) },
                {
                  label: "Capacitate",
                  value: `${group.enrolledCount}/${group.maxStudents} locuri ocupate`,
                },
                { label: "Status", value: group.status === "active" ? "Activă" : "Arhivată" },
              ].map(({ label, value }) => (
                <div key={label} className="rounded-lg border border-border p-3">
                  <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
                  <dd className="mt-0.5 text-sm text-foreground">{value}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      </div>
    </AppShell>
  );
}
