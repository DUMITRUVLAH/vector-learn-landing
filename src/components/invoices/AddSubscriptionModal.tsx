import { useState } from "react";
import { X } from "lucide-react";
import { createSubscription } from "@/lib/api/invoices";
import type { InvoiceCurrency } from "@/lib/api/invoices";
import type { Student } from "@/lib/api/students";
import { ApiError } from "@/lib/api";

interface AddSubscriptionModalProps {
  students: Student[];
  onClose: () => void;
  onSaved: () => void;
  onError: (m: string) => void;
}

export function AddSubscriptionModal({
  students,
  onClose,
  onSaved,
  onError,
}: AddSubscriptionModalProps) {
  const [studentId, setStudentId] = useState(students[0]?.id ?? "");
  const [amount, setAmount] = useState(280);
  const [currency, setCurrency] = useState<InvoiceCurrency>("RON");
  const [billingDay, setBillingDay] = useState(1);
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!studentId) return;
    setSubmitting(true);
    try {
      await createSubscription({
        studentId,
        amountCents: Math.round(amount * 100),
        currency,
        billingDay,
        description: description || null,
      });
      onSaved();
    } catch (err) {
      if (err instanceof ApiError) onError(`Eroare ${err.status}: ${err.code}`);
      else onError("Nu pot crea abonamentul");
    } finally {
      setSubmitting(false);
    }
  };

  if (students.length === 0) {
    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        role="dialog"
        aria-modal="true"
        aria-label="Niciun elev disponibil"
      >
        <div
          className="absolute inset-0 bg-foreground/40 backdrop-blur-sm"
          onClick={onClose}
          aria-hidden="true"
        />
        <div className="relative w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-xl">
          <h2 className="text-base font-bold mb-3">Niciun elev activ</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Adaugă mai întâi un elev cu status „Activ" în secțiunea Elevi.
          </p>
          <button
            onClick={onClose}
            className="w-full rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
          >
            OK
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Adaugă abonament recurent"
    >
      <div
        className="absolute inset-0 bg-foreground/40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="relative w-full max-w-md rounded-2xl border border-border bg-card shadow-xl">
        <div className="border-b border-border px-5 py-3.5 flex items-center justify-between">
          <h2 className="text-base font-bold">Abonament nou</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Închide"
            className="rounded-md hover:bg-muted p-1"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        <form onSubmit={submit} className="p-5 space-y-3">
          {/* Student */}
          <div>
            <label htmlFor="sub-student" className="block text-sm font-semibold mb-1.5">
              Elev
            </label>
            <select
              id="sub-student"
              value={studentId}
              onChange={(e) => setStudentId(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              {students.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.fullName}
                </option>
              ))}
            </select>
          </div>

          {/* Amount + currency */}
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <div>
              <label htmlFor="sub-amount" className="block text-sm font-semibold mb-1.5">
                Sumă / lună
              </label>
              <input
                id="sub-amount"
                type="number"
                min={0}
                step={1}
                value={amount}
                onChange={(e) => setAmount(Number(e.target.value))}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label htmlFor="sub-currency" className="block text-sm font-semibold mb-1.5">
                Monedă
              </label>
              <select
                id="sub-currency"
                value={currency}
                onChange={(e) => setCurrency(e.target.value as InvoiceCurrency)}
                className="rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="RON">RON</option>
                <option value="EUR">EUR</option>
                <option value="USD">USD</option>
              </select>
            </div>
          </div>

          {/* Billing day */}
          <div>
            <label htmlFor="sub-billing-day" className="block text-sm font-semibold mb-1.5">
              Zi facturare (1–28)
            </label>
            <input
              id="sub-billing-day"
              type="number"
              min={1}
              max={28}
              step={1}
              value={billingDay}
              onChange={(e) => setBillingDay(Math.min(28, Math.max(1, Number(e.target.value))))}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>

          {/* Description */}
          <div>
            <label htmlFor="sub-desc" className="block text-sm font-semibold mb-1.5">
              Descriere (opțional)
            </label>
            <input
              id="sub-desc"
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="ex: Curs engleza nivel B1"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-border bg-card px-4 py-2 text-sm font-semibold hover:bg-muted"
            >
              Anulează
            </button>
            <button
              type="submit"
              disabled={submitting || !studentId}
              className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {submitting ? "Se salvează…" : "Adaugă abonament"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
