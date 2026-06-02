/**
 * SET-801 — Team management page
 *
 * /app/settings/team — Admin can see, invite, disable, and change roles of team members.
 */
import { useState, useEffect } from "react";
import { AppShell } from "@/components/app/AppShell";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  Users,
  UserPlus,
  RefreshCw,
  AlertCircle,
  Check,
  X,
  ChevronDown,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

const ROLE_OPTIONS = [
  { value: "admin", label: "Admin" },
  { value: "manager", label: "Manager" },
  { value: "teacher", label: "Profesor" },
  { value: "receptionist", label: "Recepționist" },
  { value: "parent", label: "Părinte" },
];

const ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  manager: "Manager",
  teacher: "Profesor",
  receptionist: "Recepționist",
  student: "Elev",
  parent: "Părinte",
};

// ─── API helpers ──────────────────────────────────────────────────────────────

async function getTeam(): Promise<{ members: TeamMember[] }> {
  return api<{ members: TeamMember[] }>("/api/team");
}

async function inviteMember(email: string, role: string): Promise<{ inviteUrl: string }> {
  return api<{ inviteUrl: string }>("/api/team/invite", {
    method: "POST",
    body: JSON.stringify({ email, role }),
  });
}

async function patchMember(userId: string, patch: { role?: string; isActive?: boolean }) {
  return api<{ user: TeamMember }>(`/api/team/${userId}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

// ─── Modal — Invite member ────────────────────────────────────────────────────

interface InviteModalProps {
  onClose: () => void;
  onInvited: (inviteUrl: string) => void;
}

function InviteModal({ onClose, onInvited }: InviteModalProps) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("manager");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const result = await inviteMember(email, role);
      onInvited(result.inviteUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "A apărut o eroare.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="invite-modal-title"
    >
      <div className="bg-card border border-border rounded-xl w-full max-w-md p-6 shadow-xl">
        <div className="flex items-center justify-between mb-5">
          <h2 id="invite-modal-title" className="text-lg font-semibold">
            Invită membru nou
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Închide"
            className="rounded-md p-1.5 hover:bg-muted transition-colors"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="invite-email" className="block text-sm font-medium mb-1">
              Email
            </label>
            <input
              id="invite-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full border border-border rounded-md px-3 py-2 text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
              placeholder="ion@scoala.ro"
            />
          </div>

          <div>
            <label htmlFor="invite-role" className="block text-sm font-medium mb-1">
              Rol
            </label>
            <div className="relative">
              <select
                id="invite-role"
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="w-full appearance-none border border-border rounded-md px-3 py-2 pr-8 text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
              >
                {ROLE_OPTIONS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
            </div>
          </div>

          {error && (
            <div role="alert" className="text-sm text-destructive flex items-center gap-2">
              <AlertCircle className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
              {error}
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors"
            >
              Anulează
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {submitting ? "Se trimite..." : "Trimite invitație"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function TeamPage() {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const result = await getTeam();
      setMembers(result.members);
    } catch {
      setError("Nu s-au putut încărca membrii echipei.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }

  async function handleToggleActive(member: TeamMember) {
    try {
      await patchMember(member.id, { isActive: !member.isActive });
      setMembers((prev) =>
        prev.map((m) => (m.id === member.id ? { ...m, isActive: !m.isActive } : m))
      );
      showToast(`${member.name} ${!member.isActive ? "activat" : "dezactivat"}.`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Eroare la actualizare.");
    }
  }

  async function handleRoleChange(member: TeamMember, newRole: string) {
    try {
      await patchMember(member.id, { role: newRole });
      setMembers((prev) =>
        prev.map((m) => (m.id === member.id ? { ...m, role: newRole } : m))
      );
      showToast(`Rolul lui ${member.name} schimbat în ${ROLE_LABELS[newRole] ?? newRole}.`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Eroare la actualizare.");
    }
  }

  function handleInvited(url: string) {
    setShowInvite(false);
    setInviteUrl(url);
    load();
  }

  return (
    <AppShell
      pageTitle="Echipa"
      pageDescription="Gestionează membrii echipei, roluri și acces"
      actions={
        <button
          type="button"
          onClick={() => setShowInvite(true)}
          className="inline-flex items-center gap-2 rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          <UserPlus className="h-4 w-4" aria-hidden="true" />
          Invită
        </button>
      }
    >
      {/* ── Invite URL display ── */}
      {inviteUrl && (
        <div className="mb-6 rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 p-4">
          <div className="flex items-start gap-3">
            <Check className="h-4 w-4 text-emerald-600 dark:text-emerald-400 flex-shrink-0 mt-0.5" aria-hidden="true" />
            <div className="flex-1">
              <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400 mb-1">
                Invitație creată! Trimite link-ul invitatului:
              </p>
              <code className="text-xs break-all text-emerald-800 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-900/50 px-2 py-1 rounded">
                {window.location.origin}/#{inviteUrl}
              </code>
            </div>
            <button
              type="button"
              onClick={() => setInviteUrl(null)}
              aria-label="Închide"
              className="rounded hover:bg-emerald-200 dark:hover:bg-emerald-800 p-0.5"
            >
              <X className="h-4 w-4 text-emerald-600" aria-hidden="true" />
            </button>
          </div>
        </div>
      )}

      {/* ── Error state ── */}
      {error && (
        <div role="alert" className="flex items-center gap-3 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 p-4 mb-6 text-sm text-red-700 dark:text-red-400">
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

      {/* ── Loading ── */}
      {loading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="rounded-lg border border-border p-4 animate-pulse">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-full bg-muted" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-muted rounded w-1/4" />
                  <div className="h-3 bg-muted rounded w-1/3" />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Team table ── */}
      {!loading && members.length > 0 && (
        <div className="rounded-lg border border-border overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 bg-muted/30 border-b border-border">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <Users className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              {members.length} {members.length === 1 ? "membru" : "membri"}
            </div>
          </div>

          <div className="divide-y divide-border">
            {members.map((member) => (
              <div
                key={member.id}
                className={cn(
                  "flex items-center gap-4 px-4 py-3",
                  !member.isActive && "opacity-50"
                )}
              >
                {/* Avatar */}
                <div className="h-9 w-9 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center text-xs font-bold text-primary-foreground flex-shrink-0">
                  {member.name.slice(0, 2).toUpperCase()}
                </div>

                {/* Name + email */}
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm text-foreground truncate">
                    {member.name}
                    {!member.isActive && (
                      <span className="ml-2 text-xs text-muted-foreground">(dezactivat)</span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">{member.email}</p>
                </div>

                {/* Role selector */}
                <div className="relative flex-shrink-0">
                  <label htmlFor={`role-${member.id}`} className="sr-only">
                    Rol pentru {member.name}
                  </label>
                  <select
                    id={`role-${member.id}`}
                    value={member.role}
                    onChange={(e) => handleRoleChange(member, e.target.value)}
                    disabled={!member.isActive}
                    className="appearance-none border border-border rounded-md pl-3 pr-7 py-1.5 text-xs bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50"
                  >
                    {ROLE_OPTIONS.map((r) => (
                      <option key={r.value} value={r.value}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" aria-hidden="true" />
                </div>

                {/* Toggle active */}
                <button
                  type="button"
                  onClick={() => handleToggleActive(member)}
                  className={cn(
                    "flex-shrink-0 rounded-md px-3 py-1.5 text-xs font-medium transition-colors border",
                    member.isActive
                      ? "border-border text-muted-foreground hover:bg-muted hover:text-destructive"
                      : "border-emerald-200 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-400 dark:hover:bg-emerald-950/30"
                  )}
                  aria-label={member.isActive ? `Dezactivează ${member.name}` : `Activează ${member.name}`}
                >
                  {member.isActive ? "Dezactivează" : "Activează"}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Empty state ── */}
      {!loading && members.length === 0 && (
        <div className="text-center py-16 text-muted-foreground">
          <Users className="h-12 w-12 mx-auto mb-4 opacity-30" aria-hidden="true" />
          <p>Nu există membri în echipă.</p>
        </div>
      )}

      {/* ── Toast ── */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-6 right-6 rounded-lg bg-foreground text-background px-4 py-2.5 text-sm font-medium shadow-lg z-50"
        >
          {toast}
        </div>
      )}

      {/* ── Invite modal ── */}
      {showInvite && (
        <InviteModal
          onClose={() => setShowInvite(false)}
          onInvited={handleInvited}
        />
      )}
    </AppShell>
  );
}
