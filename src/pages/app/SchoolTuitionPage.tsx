/**
 * SCHOOL-004 — /app/school/tuition
 *
 * Planuri de taxă școlară: lista planuri, creare plan, adăugare rate, asignare elevi,
 * generare facturi.
 */
import { useEffect, useState, useCallback } from "react";
import { Loader2, AlertCircle, Plus, Receipt, ChevronDown, ChevronUp, X } from "lucide-react";
import { AppShell } from "@/components/app/AppShell";
import { useSession } from "@/hooks/useSession";
import { useRouter } from "@/router/HashRouter";
import {
  listAcademicYears,
  type AcademicYear,
} from "@/lib/api/school";
import {
  listTuitionPlans,
  createTuitionPlan,
  listInstallments,
  addInstallment,
  listStudentTuitions,
  assignStudentToPlan,
  generateInvoicesForStudent,
  type TuitionPlan,
  type TuitionInstallment,
  type StudentTuition,
  type BillingCycle,
} from "@/lib/api/tuition";
import { listStudents, type Student } from "@/lib/api/students";
import { cn } from "@/lib/utils";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatCents(cents: number, currency = "RON"): string {
  return new Intl.NumberFormat("ro-RO", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

const CYCLE_LABELS: Record<BillingCycle, string> = {
  annual: "Anual",
  per_term: "Per semestru",
  monthly: "Lunar",
};

// ─── Add Plan Modal ───────────────────────────────────────────────────────────

interface AddPlanModalProps {
  years: AcademicYear[];
  onSave: (payload: {
    academicYearId: string;
    name: string;
    amountCents: number;
    billingCycle: BillingCycle;
    siblingDiscountPercent: number;
  }) => Promise<void>;
  onClose: () => void;
}

function AddPlanModal({ years, onSave, onClose }: AddPlanModalProps) {
  const [yearId, setYearId] = useState(years[0]?.id ?? "");
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [cycle, setCycle] = useState<BillingCycle>("annual");
  const [sibDisc, setSibDisc] = useState("10");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    if (!name.trim()) { setError("Numele planului e obligatoriu."); return; }
    const cents = Math.round(parseFloat(amount) * 100);
    if (isNaN(cents) || cents < 0) { setError("Suma trebuie să fie ≥ 0."); return; }
    setSaving(true);
    setError(null);
    try {
      await onSave({
        academicYearId: yearId,
        name: name.trim(),
        amountCents: cents,
        billingCycle: cycle,
        siblingDiscountPercent: parseFloat(sibDisc) || 0,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Eroare la salvare");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      role="dialog"
      aria-modal="true"
      aria-label="Plan de taxă nou"
    >
      <div className="bg-card border border-border rounded-lg shadow-xl w-full max-w-md mx-4 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-foreground">Plan de taxă nou</h2>
          <button
            onClick={onClose}
            className="rounded-md p-1 hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring"
            aria-label="Închide"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1" htmlFor="plan-year">
              An școlar
            </label>
            <select
              id="plan-year"
              value={yearId}
              onChange={(e) => setYearId(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {years.map((y) => (
                <option key={y.id} value={y.id}>{y.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1" htmlFor="plan-name">
              Nume plan
            </label>
            <input
              id="plan-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="ex. Taxă anuală 2026-2027 — Primar"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1" htmlFor="plan-amount">
                Sumă totală (RON)
              </label>
              <input
                id="plan-amount"
                type="number"
                min="0"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="ex. 5000"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1" htmlFor="plan-cycle">
                Ciclu facturare
              </label>
              <select
                id="plan-cycle"
                value={cycle}
                onChange={(e) => setCycle(e.target.value as BillingCycle)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="annual">Anual</option>
                <option value="per_term">Per semestru</option>
                <option value="monthly">Lunar</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1" htmlFor="plan-sibling">
              Reducere frați (% per copil suplimentar)
            </label>
            <input
              id="plan-sibling"
              type="number"
              min="0"
              max="100"
              step="0.5"
              value={sibDisc}
              onChange={(e) => setSibDisc(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-md text-sm border border-input hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring"
          >
            Anulează
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !yearId}
            className="px-4 py-2 rounded-md text-sm bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-ring"
          >
            {saving ? <Loader2 className="size-4 animate-spin inline mr-1" /> : null}
            Creează plan
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Plan Detail ──────────────────────────────────────────────────────────────

interface PlanDetailProps {
  plan: TuitionPlan;
  students: Student[];
}

function PlanDetail({ plan, students }: PlanDetailProps) {
  const [installments, setInstallments] = useState<TuitionInstallment[]>([]);
  const [studentTuitions, setStudentTuitions] = useState<StudentTuition[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);

  // Add installment form
  const [dueDate, setDueDate] = useState(new Date().toISOString().slice(0, 10));
  const [instAmount, setInstAmount] = useState("");
  const [addingInst, setAddingInst] = useState(false);

  // Assign student form
  const [selectedStudentId, setSelectedStudentId] = useState(students[0]?.id ?? "");
  const [siblingRank, setSiblingRank] = useState("1");
  const [scholarshipPct, setScholarshipPct] = useState("0");
  const [assigningStudent, setAssigningStudent] = useState(false);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [insts, sts] = await Promise.all([
          listInstallments(plan.id),
          listStudentTuitions(plan.id),
        ]);
        setInstallments(insts);
        setStudentTuitions(sts);
      } catch { /* non-blocking */ }
      finally { setLoading(false); }
    };
    load();
  }, [plan.id]);

  const handleAddInstallment = async () => {
    const cents = Math.round(parseFloat(instAmount) * 100);
    if (isNaN(cents)) return;
    setAddingInst(true);
    try {
      const inst = await addInstallment(plan.id, {
        dueDate,
        amountCents: cents,
        orderIndex: installments.length + 1,
      });
      setInstallments((prev) => [...prev, inst]);
      setInstAmount("");
    } catch { /* non-blocking */ }
    finally { setAddingInst(false); }
  };

  const handleAssignStudent = async () => {
    if (!selectedStudentId) return;
    setAssigningStudent(true);
    try {
      const st = await assignStudentToPlan({
        studentId: selectedStudentId,
        planId: plan.id,
        siblingRank: parseInt(siblingRank) || 1,
        scholarshipPercent: parseFloat(scholarshipPct) || 0,
      });
      setStudentTuitions((prev) => [...prev, st]);
    } catch { /* non-blocking */ }
    finally { setAssigningStudent(false); }
  };

  const handleGenerateInvoices = async (stId: string) => {
    try {
      const res = await generateInvoicesForStudent(stId);
      setToast(`${res.count} factur${res.count === 1 ? "ă" : "i"} create.`);
      setTimeout(() => setToast(null), 3000);
    } catch (err) {
      setToast(err instanceof Error ? err.message : "Eroare la generare facturi.");
      setTimeout(() => setToast(null), 4000);
    }
  };

  if (loading) return (
    <div className="flex items-center justify-center py-8">
      <Loader2 className="size-5 animate-spin text-muted-foreground" />
    </div>
  );

  const studentMap = new Map(students.map((s) => [s.id, s]));

  return (
    <div className="space-y-4 mt-4">
      {toast && (
        <div className="rounded-md bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 px-4 py-2 text-sm text-emerald-700 dark:text-emerald-300">
          {toast}
        </div>
      )}

      {/* Installments */}
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-2">Rate ({installments.length})</h3>
        {installments.length > 0 && (
          <ul className="space-y-1 mb-3">
            {installments.map((inst) => (
              <li key={inst.id} className="flex items-center justify-between text-sm rounded-md bg-muted/50 px-3 py-2">
                <span className="text-muted-foreground">Rata {inst.orderIndex} — scadent {inst.dueDate}</span>
                <span className="font-medium tabular-nums">{formatCents(inst.amountCents, plan.currency)}</span>
              </li>
            ))}
          </ul>
        )}
        <div className="flex gap-2 items-end flex-wrap">
          <div>
            <label className="block text-xs text-muted-foreground mb-1" htmlFor={`inst-date-${plan.id}`}>Scadență</label>
            <input
              id={`inst-date-${plan.id}`}
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="rounded-md border border-input bg-background px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1" htmlFor={`inst-amount-${plan.id}`}>Sumă (RON)</label>
            <input
              id={`inst-amount-${plan.id}`}
              type="number"
              min="0"
              step="0.01"
              value={instAmount}
              onChange={(e) => setInstAmount(e.target.value)}
              placeholder="500"
              className="w-28 rounded-md border border-input bg-background px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <button
            onClick={handleAddInstallment}
            disabled={addingInst || !instAmount}
            className="px-3 py-1.5 rounded-md text-xs bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-ring"
          >
            {addingInst ? <Loader2 className="size-3 animate-spin inline" /> : <Plus className="size-3 inline mr-0.5" />}
            Rată
          </button>
        </div>
      </div>

      {/* Students */}
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-2">Elevi ({studentTuitions.length})</h3>
        {studentTuitions.length > 0 && (
          <ul className="space-y-1 mb-3">
            {studentTuitions.map((st) => {
              const s = studentMap.get(st.studentId);
              return (
                <li key={st.id} className="flex items-center justify-between text-sm rounded-md bg-muted/50 px-3 py-2 gap-2 flex-wrap">
                  <span className="font-medium text-foreground">{s?.fullName ?? st.studentId}</span>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span>Rang frate: {st.siblingRank}</span>
                    {parseFloat(st.scholarshipPercent) > 0 && (
                      <span className="text-emerald-600 dark:text-emerald-400">Bursă {st.scholarshipPercent}%</span>
                    )}
                    <button
                      onClick={() => handleGenerateInvoices(st.id)}
                      className="px-2 py-1 rounded text-xs bg-secondary hover:bg-secondary/80 text-secondary-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                    >
                      Generează facturi
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <div className="flex gap-2 items-end flex-wrap">
          <div>
            <label className="block text-xs text-muted-foreground mb-1" htmlFor={`st-select-${plan.id}`}>Elev</label>
            <select
              id={`st-select-${plan.id}`}
              value={selectedStudentId}
              onChange={(e) => setSelectedStudentId(e.target.value)}
              className="rounded-md border border-input bg-background px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-ring max-w-[180px]"
            >
              {students.map((s) => (
                <option key={s.id} value={s.id}>{s.fullName}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1" htmlFor={`sib-rank-${plan.id}`}>Rang frate</label>
            <select
              id={`sib-rank-${plan.id}`}
              value={siblingRank}
              onChange={(e) => setSiblingRank(e.target.value)}
              className="rounded-md border border-input bg-background px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="1">1 (fără reducere)</option>
              <option value="2">2 (reducere x1)</option>
              <option value="3">3+ (reducere x2)</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1" htmlFor={`sch-pct-${plan.id}`}>Bursă %</label>
            <input
              id={`sch-pct-${plan.id}`}
              type="number"
              min="0"
              max="100"
              step="5"
              value={scholarshipPct}
              onChange={(e) => setScholarshipPct(e.target.value)}
              className="w-16 rounded-md border border-input bg-background px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <button
            onClick={handleAssignStudent}
            disabled={assigningStudent || !selectedStudentId}
            className="px-3 py-1.5 rounded-md text-xs bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-ring"
          >
            {assigningStudent ? <Loader2 className="size-3 animate-spin inline" /> : <Plus className="size-3 inline mr-0.5" />}
            Adaugă elev
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function SchoolTuitionPage() {
  const { status: sessionStatus } = useSession();
  const { navigate } = useRouter();

  const [years, setYears] = useState<AcademicYear[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [plans, setPlans] = useState<TuitionPlan[]>([]);
  const [selectedYearId, setSelectedYearId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddPlan, setShowAddPlan] = useState(false);
  const [expandedPlanId, setExpandedPlanId] = useState<string | null>(null);

  useEffect(() => {
    if (sessionStatus !== "authenticated") return;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const [{ years: yearsData }, { items: studentsData }] = await Promise.all([
          listAcademicYears(),
          listStudents({ limit: 100 }),
        ]);
        setYears(yearsData);
        setStudents(studentsData);

        const currentYear = yearsData.find((y) => y.isCurrent) ?? yearsData[0];
        if (currentYear) {
          setSelectedYearId(currentYear.id);
          const plansData = await listTuitionPlans(currentYear.id);
          setPlans(plansData);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Eroare la încărcare");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [sessionStatus]);

  const handleYearChange = useCallback(async (yearId: string) => {
    setSelectedYearId(yearId);
    setPlans([]);
    try {
      const data = await listTuitionPlans(yearId);
      setPlans(data);
    } catch { /* non-blocking */ }
  }, []);

  const handleCreatePlan = useCallback(
    async (payload: Parameters<typeof createTuitionPlan>[0]) => {
      const plan = await createTuitionPlan(payload);
      setPlans((prev) => [...prev, plan]);
    },
    []
  );

  if (sessionStatus === "loading") {
    return (
      <AppShell pageTitle="Taxe școlare">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="size-8 animate-spin text-muted-foreground" />
        </div>
      </AppShell>
    );
  }

  if (sessionStatus === "unauthenticated") {
    navigate("/login");
    return null;
  }

  return (
    <AppShell pageTitle="Taxe școlare">
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-2">
            <Receipt className="size-6 text-primary" aria-hidden="true" />
            <h1 className="text-2xl font-bold text-foreground">Taxe școlare</h1>
          </div>
          <button
            onClick={() => setShowAddPlan(true)}
            disabled={years.length === 0}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm hover:bg-primary/90 disabled:opacity-40 focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <Plus className="size-4" aria-hidden="true" />
            Plan nou
          </button>
        </div>

        {/* Year selector */}
        <div className="w-48">
          <label className="block text-xs font-medium text-muted-foreground mb-1" htmlFor="tuition-year">
            An școlar
          </label>
          <select
            id="tuition-year"
            value={selectedYearId}
            onChange={(e) => handleYearChange(e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            aria-label="Selectează an școlar"
          >
            <option value="" disabled>Selectează…</option>
            {years.map((y) => (
              <option key={y.id} value={y.id}>
                {y.name}{y.isCurrent ? " (curent)" : ""}
              </option>
            ))}
          </select>
        </div>

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive" role="alert">
            <AlertCircle className="size-4 flex-shrink-0" aria-hidden="true" />
            {error}
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="size-8 animate-spin text-muted-foreground" />
          </div>
        )}

        {/* Plans list */}
        {!loading && (
          <div className="space-y-3">
            {plans.length === 0 ? (
              <div className="py-16 text-center text-muted-foreground text-sm">
                Niciun plan de taxă definit pentru acest an.
                <br />
                Apasă „Plan nou" pentru a adăuga primul plan.
              </div>
            ) : (
              plans.map((plan) => {
                const isExpanded = expandedPlanId === plan.id;
                return (
                  <div
                    key={plan.id}
                    className="rounded-lg border border-border bg-card overflow-hidden"
                  >
                    <button
                      onClick={() => setExpandedPlanId(isExpanded ? null : plan.id)}
                      className={cn(
                        "w-full flex items-center justify-between px-4 py-4 hover:bg-muted/30 transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-inset",
                      )}
                      aria-expanded={isExpanded}
                    >
                      <div className="text-left">
                        <p className="font-semibold text-foreground">{plan.name}</p>
                        <p className="text-sm text-muted-foreground mt-0.5">
                          {formatCents(plan.amountCents, plan.currency)} · {CYCLE_LABELS[plan.billingCycle]}
                          {parseFloat(plan.siblingDiscountPercent) > 0
                            ? ` · reducere frați ${plan.siblingDiscountPercent}%`
                            : ""}
                        </p>
                      </div>
                      {isExpanded ? (
                        <ChevronUp className="size-5 text-muted-foreground flex-shrink-0" />
                      ) : (
                        <ChevronDown className="size-5 text-muted-foreground flex-shrink-0" />
                      )}
                    </button>

                    {isExpanded && (
                      <div className="px-4 pb-4 border-t border-border bg-muted/10">
                        <PlanDetail plan={plan} students={students} />
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>

      {/* Modal */}
      {showAddPlan && (
        <AddPlanModal
          years={years}
          onSave={handleCreatePlan}
          onClose={() => setShowAddPlan(false)}
        />
      )}
    </AppShell>
  );
}
