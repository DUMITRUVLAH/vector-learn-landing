/**
 * FB-003 — Send a feedback form to selected students, and review who has
 * responded. Shows the public link per recipient (copyable for demo / manual send).
 */
import { useCallback, useEffect, useState } from "react";
import { Loader2, Send, Check, Copy, Search, CircleDot, CheckCircle2 } from "lucide-react";
import { AppShell } from "@/components/app/AppShell";
import { BackToFeedback } from "@/pages/app/FeedbackPage";
import { cn } from "@/lib/utils";
import { listStudents, type Student } from "@/lib/api/students";
import { sendForm, listInvitations, type InvitationRow } from "@/lib/api/feedback";

interface FeedbackSendPanelProps {
  formId: string;
  formTitle: string;
  onClose: () => void;
}

function publicLink(token: string): string {
  return `${window.location.origin}/#/feedback/${token}`;
}

export function FeedbackSendPanel({ formId, formTitle, onClose }: FeedbackSendPanelProps) {
  const [students, setStudents] = useState<Student[]>([]);
  const [invitations, setInvitations] = useState<InvitationRow[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [studs, inv] = await Promise.all([
        listStudents({ status: "active", limit: 200 }),
        listInvitations(formId),
      ]);
      setStudents(studs.items);
      setInvitations(inv.items);
    } finally {
      setLoading(false);
    }
  }, [formId]);

  useEffect(() => {
    void load();
  }, [load]);

  const invitedIds = new Set(invitations.map((i) => i.studentId));
  const filtered = students.filter((s) =>
    s.fullName.toLowerCase().includes(search.trim().toLowerCase())
  );

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSend = async () => {
    if (selected.size === 0) return;
    setSending(true);
    setResult(null);
    try {
      const res = await sendForm(formId, [...selected]);
      setResult(`Trimis către ${res.sent} cursanți` + (res.alreadyInvited ? `, ${res.alreadyInvited} deja invitați` : ""));
      setSelected(new Set());
      await load();
    } catch {
      setResult("Trimiterea a eșuat. Reîncearcă.");
    } finally {
      setSending(false);
    }
  };

  const handleCopy = async (token: string) => {
    await navigator.clipboard.writeText(publicLink(token));
    setCopied(token);
    setTimeout(() => setCopied(null), 1500);
  };

  return (
    <AppShell pageTitle="Trimite formular" pageDescription={formTitle}>
      <BackToFeedback onClick={onClose} />

      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" aria-label="Se încarcă" />
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Pick students */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold">Selectează cursanți</h3>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <label htmlFor="stud-search" className="sr-only">
                Caută cursant
              </label>
              <input
                id="stud-search"
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Caută după nume…"
                className="w-full rounded-md border border-input bg-background py-2 pl-9 pr-3 text-sm"
              />
            </div>
            <ul className="max-h-[420px] space-y-1 overflow-y-auto rounded-lg border border-border p-1">
              {filtered.length === 0 ? (
                <li className="px-3 py-6 text-center text-sm text-muted-foreground">
                  Niciun cursant găsit.
                </li>
              ) : (
                filtered.map((s) => {
                  const alreadyInvited = invitedIds.has(s.id);
                  const isSelected = selected.has(s.id);
                  return (
                    <li key={s.id}>
                      <button
                        type="button"
                        onClick={() => !alreadyInvited && toggle(s.id)}
                        disabled={alreadyInvited}
                        className={cn(
                          "flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm touch-target",
                          alreadyInvited
                            ? "cursor-not-allowed opacity-60"
                            : "hover:bg-accent",
                          isSelected && "bg-accent"
                        )}
                      >
                        <span>{s.fullName}</span>
                        {alreadyInvited ? (
                          <span className="text-xs text-muted-foreground">deja trimis</span>
                        ) : (
                          <span
                            className={cn(
                              "flex h-5 w-5 items-center justify-center rounded border",
                              isSelected ? "border-primary bg-primary text-primary-foreground" : "border-input"
                            )}
                          >
                            {isSelected && <Check className="h-3.5 w-3.5" />}
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })
              )}
            </ul>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => void handleSend()}
                disabled={selected.size === 0 || sending}
                className={cn(
                  "inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 touch-target",
                  (selected.size === 0 || sending) && "opacity-50"
                )}
              >
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Trimite ({selected.size})
              </button>
              {result && <span className="text-sm text-muted-foreground">{result}</span>}
            </div>
          </section>

          {/* Recipients + status */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold">
              Destinatari ({invitations.filter((i) => i.status === "submitted").length}/
              {invitations.length} au răspuns)
            </h3>
            {invitations.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                Încă nu ai trimis acest formular nimănui.
              </div>
            ) : (
              <ul className="space-y-1">
                {invitations.map((inv) => (
                  <li
                    key={inv.id}
                    className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm"
                  >
                    <span className="flex items-center gap-2">
                      {inv.status === "submitted" ? (
                        <CheckCircle2 className="h-4 w-4 text-primary" aria-hidden />
                      ) : (
                        <CircleDot className="h-4 w-4 text-muted-foreground" aria-hidden />
                      )}
                      {inv.studentName}
                    </span>
                    {inv.status === "submitted" ? (
                      <span className="text-xs font-medium text-primary">a răspuns</span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => void handleCopy(inv.token)}
                        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground touch-target"
                      >
                        {copied === inv.token ? (
                          <>
                            <Check className="h-3.5 w-3.5" /> copiat
                          </>
                        ) : (
                          <>
                            <Copy className="h-3.5 w-3.5" /> copiază link
                          </>
                        )}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </AppShell>
  );
}
