/**
 * CRM-135: RRSettings — round-robin auto-assign settings panel.
 *
 * Shown in the Settings page under a "CRM" tab (or inline section).
 * Lets admins/managers configure which team members receive auto-assigned leads.
 */
import React, { useCallback, useEffect, useState } from "react";
import { Users, ChevronUp, ChevronDown, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { getRRAssignSettings, updateRRAssignSettings } from "@/lib/api/settings";
import { getTenantMembers, type TenantMember } from "@/lib/api/notifications";

interface RRSettingsProps {
  /** Optional className for the container */
  className?: string;
}

export function RRSettings({ className }: RRSettingsProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Settings state
  const [enabled, setEnabled] = useState(false);
  const [allMembers, setAllMembers] = useState<TenantMember[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [nextUserName, setNextUserName] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [settings, membersRes] = await Promise.all([
        getRRAssignSettings(),
        getTenantMembers(),
      ]);
      setEnabled(settings.enabled);
      setSelectedIds(settings.userIds);
      setNextUserName(settings.nextUser?.name ?? null);
      setAllMembers(membersRes.members);
    } catch {
      setError("Nu pot încărca setările. Încearcă din nou.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const toggleMember = (memberId: string) => {
    setSelectedIds((prev) =>
      prev.includes(memberId)
        ? prev.filter((id) => id !== memberId)
        : [...prev, memberId]
    );
  };

  const moveUp = (idx: number) => {
    if (idx === 0) return;
    setSelectedIds((prev) => {
      const next = [...prev];
      [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
      return next;
    });
  };

  const moveDown = (idx: number) => {
    setSelectedIds((prev) => {
      if (idx >= prev.length - 1) return prev;
      const next = [...prev];
      [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
      return next;
    });
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const updated = await updateRRAssignSettings(enabled, selectedIds);
      setNextUserName(updated.nextUser?.name ?? null);
      setSuccessMsg("Setările au fost salvate.");
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch {
      setError("Nu pot salva setările.");
    } finally {
      setSaving(false);
    }
  };

  const selectedMembers = selectedIds
    .map((id) => allMembers.find((m) => m.id === id))
    .filter((m): m is TenantMember => !!m);

  const unselectedMembers = allMembers.filter((m) => !selectedIds.includes(m.id));

  if (loading) {
    return (
      <div className={cn("rounded-xl border border-border bg-card p-6", className)}>
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          <Loader2 className="h-4 w-4 animate-spin" />
          Se încarcă...
        </div>
      </div>
    );
  }

  return (
    <div className={cn("rounded-xl border border-border bg-card p-6 space-y-4", className)}>
      <div className="flex items-center gap-3">
        <Users className="h-5 w-5 text-primary" aria-hidden="true" />
        <div>
          <h2 className="text-sm font-semibold">Asignare automată (round-robin)</h2>
          <p className="text-xs text-muted-foreground">
            Lead-urile noi fără responsabil vor fi distribuite în ordine circulară.
          </p>
        </div>
      </div>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {successMsg && (
        <p role="status" className="text-sm text-green-600 dark:text-green-400">
          {successMsg}
        </p>
      )}

      {/* Enable toggle */}
      <label className="flex items-center gap-3 cursor-pointer">
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label="Activează asignare automată"
          onClick={() => setEnabled((v) => !v)}
          className={cn(
            "relative inline-flex h-5 w-9 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-ring",
            enabled ? "bg-primary" : "bg-muted"
          )}
        >
          <span
            className={cn(
              "inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform mt-0.5",
              enabled ? "translate-x-4" : "translate-x-0.5"
            )}
          />
        </button>
        <span className="text-sm font-medium">
          {enabled ? "Activ" : "Inactiv"}
        </span>
      </label>

      {enabled && (
        <>
          {/* Current rotation order */}
          {selectedMembers.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">
                Ordine rotație
              </p>
              <ul className="space-y-1" aria-label="Ordine rotație utilizatori">
                {selectedMembers.map((member, idx) => (
                  <li
                    key={member.id}
                    className="flex items-center gap-2 rounded-md border border-border bg-background px-3 py-1.5"
                  >
                    <span className="text-xs text-muted-foreground w-5 text-center">
                      {idx + 1}
                    </span>
                    <span className="flex-1 text-sm font-medium">{member.name}</span>
                    <span className="text-xs text-muted-foreground capitalize">{member.role}</span>
                    <div className="flex gap-0.5">
                      <button
                        type="button"
                        onClick={() => moveUp(idx)}
                        disabled={idx === 0}
                        aria-label={`Mută ${member.name} mai sus`}
                        className="rounded p-0.5 hover:bg-muted disabled:opacity-30"
                      >
                        <ChevronUp className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => moveDown(idx)}
                        disabled={idx === selectedMembers.length - 1}
                        aria-label={`Mută ${member.name} mai jos`}
                        className="rounded p-0.5 hover:bg-muted disabled:opacity-30"
                      >
                        <ChevronDown className="h-3 w-3" />
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => toggleMember(member.id)}
                      aria-label={`Elimină ${member.name} din rotație`}
                      className="text-xs text-destructive hover:underline ml-1"
                    >
                      Elimină
                    </button>
                  </li>
                ))}
              </ul>
              {nextUserName && (
                <p className="text-xs text-muted-foreground mt-2">
                  Urmează: <span className="font-semibold text-foreground">{nextUserName}</span>
                </p>
              )}
            </div>
          )}

          {/* Add members */}
          {unselectedMembers.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">
                Adaugă în rotație
              </p>
              <ul className="space-y-1" aria-label="Utilizatori disponibili">
                {unselectedMembers.map((member) => (
                  <li key={member.id}>
                    <button
                      type="button"
                      onClick={() => toggleMember(member.id)}
                      className="w-full text-left rounded-md border border-dashed border-border px-3 py-1.5 text-sm hover:border-primary hover:bg-primary/5 transition-colors"
                    >
                      <span className="font-medium">{member.name}</span>
                      <span className="ml-2 text-xs text-muted-foreground capitalize">
                        {member.role}
                      </span>
                      <span className="ml-2 text-xs text-primary">+ Adaugă</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {selectedMembers.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Adaugă cel puțin un utilizator în rotație pentru a activa asignarea automată.
            </p>
          )}
        </>
      )}

      <div className="pt-2">
        <button
          type="button"
          onClick={() => { void save(); }}
          disabled={saving}
          className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2"
        >
          {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          Salvează setările
        </button>
      </div>
    </div>
  );
}
