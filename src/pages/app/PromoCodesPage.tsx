/**
 * COURSE-203: Promo Codes page — create and manage discount codes.
 * Route: /app/promo-codes
 */
import { useEffect, useState } from "react";
import {
  Plus,
  Tag,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
} from "lucide-react";
import { AppShell } from "@/components/app/AppShell";
import { useSession } from "@/hooks/useSession";
import { useRouter } from "@/router/HashRouter";
import {
  listPromoCodes,
  createPromoCode,
  validatePromoCode,
  applyDiscount,
  type PromoCode,
  type PromoStatus,
  type DiscountType,
  type CreatePromoPayload,
} from "@/lib/api/promoCodes";
import { cn } from "@/lib/utils";

const STATUS_LABEL: Record<PromoStatus, string> = {
  active: "Activ",
  expired: "Expirat",
  exhausted: "Epuizat",
  disabled: "Dezactivat",
};

function StatusBadge({ status }: { status: PromoStatus }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
        status === "active"
          ? "bg-success/10 text-success-foreground"
          : "bg-muted text-muted-foreground"
      )}
    >
      {status === "active" ? (
        <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
      ) : status === "expired" ? (
        <Clock className="h-3 w-3" aria-hidden="true" />
      ) : (
        <XCircle className="h-3 w-3" aria-hidden="true" />
      )}
      {STATUS_LABEL[status]}
    </span>
  );
}

interface CreateModalProps {
  onClose: () => void;
  onCreated: (pc: PromoCode) => void;
}

function CreateModal({ onClose, onCreated }: CreateModalProps) {
  const [form, setForm] = useState<CreatePromoPayload>({
    code: "",
    discountType: "percent",
    discountValue: 10,
    maxUses: null,
    expiresAt: null,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.code.trim()) {
      setError("Introdu un cod promoțional.");
      return;
    }
    if (form.discountValue < 1) {
      setError("Valoarea discount-ului trebuie să fie cel puțin 1.");
      return;
    }
    if (form.discountType === "percent" && form.discountValue > 100) {
      setError("Procentul nu poate depăși 100.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const created = await createPromoCode({
        ...form,
        code: form.code.trim().toUpperCase(),
      });
      onCreated(created);
    } catch {
      setError("Eroare la creare. Codul poate deja exista.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-promo-title"
    >
      <div className="bg-card rounded-xl border border-border p-6 w-full max-w-md mx-4 shadow-xl">
        <h2
          id="create-promo-title"
          className="text-lg font-semibold text-foreground mb-4"
        >
          Cod promoțional nou
        </h2>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="promo-code" className="text-sm font-medium text-foreground">
              Cod
            </label>
            <input
              id="promo-code"
              type="text"
              value={form.code}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  code: e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, ""),
                }))
              }
              placeholder="ex: BACK2SCHOOL"
              maxLength={20}
              className="border border-border rounded-md px-3 py-2 text-sm bg-background text-foreground font-mono uppercase focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="discount-type" className="text-sm font-medium text-foreground">
                Tip discount
              </label>
              <select
                id="discount-type"
                value={form.discountType}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    discountType: e.target.value as DiscountType,
                  }))
                }
                className="border border-border rounded-md px-3 py-2 text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="percent">Procent (%)</option>
                <option value="fixed">Fix (RON)</option>
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="discount-value" className="text-sm font-medium text-foreground">
                Valoare {form.discountType === "percent" ? "(%)" : "(bani)"}
              </label>
              <input
                id="discount-value"
                type="number"
                min={1}
                max={form.discountType === "percent" ? 100 : undefined}
                value={form.discountValue}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    discountValue: parseInt(e.target.value, 10) || 1,
                  }))
                }
                className="border border-border rounded-md px-3 py-2 text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="max-uses" className="text-sm font-medium text-foreground">
                Max utilizări
              </label>
              <input
                id="max-uses"
                type="number"
                min={1}
                placeholder="∞"
                value={form.maxUses ?? ""}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    maxUses: e.target.value ? parseInt(e.target.value, 10) : null,
                  }))
                }
                className="border border-border rounded-md px-3 py-2 text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="expires-at" className="text-sm font-medium text-foreground">
                Expiră pe
              </label>
              <input
                id="expires-at"
                type="date"
                value={
                  form.expiresAt
                    ? form.expiresAt.slice(0, 10)
                    : ""
                }
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    expiresAt: e.target.value
                      ? `${e.target.value}T23:59:59Z`
                      : null,
                  }))
                }
                className="border border-border rounded-md px-3 py-2 text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
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
              Creează cod
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/** Inline promo code validator — can be used in PaymentsPage future integration. */
function PromoValidator() {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    valid: boolean;
    message: string;
    discountType?: DiscountType;
    discountValue?: number;
  } | null>(null);
  const sampleAmount = 10000; // 100 RON in cents for preview

  const handleValidate = async () => {
    if (!code.trim()) return;
    setLoading(true);
    setResult(null);
    try {
      const res = await validatePromoCode(code.trim());
      if (res.valid) {
        const discounted = applyDiscount(
          sampleAmount,
          res.discountType,
          res.discountValue
        );
        const savedCents = sampleAmount - discounted;
        setResult({
          valid: true,
          message: `Cod valid! Economisești ${(savedCents / 100).toFixed(2)} RON din 100 RON.`,
          discountType: res.discountType,
          discountValue: res.discountValue,
        });
      } else {
        const reasons: Record<string, string> = {
          not_found: "Cod inexistent.",
          expired: "Codul a expirat.",
          exhausted: "Codul a atins limita de utilizări.",
          disabled: "Codul este dezactivat.",
        };
        setResult({
          valid: false,
          message: reasons[res.reason] ?? "Cod invalid.",
        });
      }
    } catch {
      setResult({ valid: false, message: "Eroare la validare." });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="border border-border rounded-lg p-4 bg-muted/30">
      <p className="text-sm font-medium text-foreground mb-2">
        Testează un cod promoțional
      </p>
      <div className="flex gap-2">
        <input
          type="text"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          onKeyDown={(e) => e.key === "Enter" && handleValidate()}
          placeholder="BACK2SCHOOL"
          className="flex-1 border border-border rounded-md px-3 py-2 text-sm font-mono bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          aria-label="Cod promoțional de testat"
        />
        <button
          onClick={handleValidate}
          disabled={loading || !code.trim()}
          className="px-3 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-60 flex items-center gap-2"
        >
          {loading && (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          )}
          Aplică
        </button>
      </div>
      {result && (
        <p
          className={cn(
            "mt-2 text-sm",
            result.valid ? "text-success-foreground" : "text-destructive"
          )}
          role="status"
        >
          {result.message}
        </p>
      )}
    </div>
  );
}

export function PromoCodesPage() {
  const { status: sessionStatus } = useSession();
  const { navigate } = useRouter();

  const [codes, setCodes] = useState<PromoCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);

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
        setCodes(await listPromoCodes());
      } catch {
        setError("Nu s-au putut încărca codurile promoționale.");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [sessionStatus]);

  const handleCreated = (pc: PromoCode) => {
    setCodes((prev) => [pc, ...prev]);
    setShowModal(false);
  };

  return (
    <AppShell
      pageTitle="Coduri promo"
      pageDescription="Reduceri cu procent sau sumă fixă"
      actions={
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
          aria-label="Adaugă cod promoțional"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Cod nou
        </button>
      }
    >
      <div className="max-w-3xl space-y-6">
        {/* Validator demo widget */}
        <PromoValidator />

        {/* Table / list */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2
              className="h-8 w-8 animate-spin text-muted-foreground"
              aria-label="Se încarcă..."
            />
          </div>
        ) : error ? (
          <div className="flex items-center gap-2 text-destructive" role="alert">
            <AlertTriangle className="h-5 w-5" aria-hidden="true" />
            <span>{error}</span>
          </div>
        ) : codes.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Tag className="h-10 w-10 mx-auto mb-3 opacity-40" aria-hidden="true" />
            <p className="font-medium">Niciun cod promoțional</p>
            <p className="text-sm mt-1">Creează primul cu butonul din dreapta sus.</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm" data-testid="promo-codes-table">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-foreground">Cod</th>
                  <th className="text-left px-4 py-3 font-medium text-foreground">Discount</th>
                  <th className="text-left px-4 py-3 font-medium text-foreground">Utilizări</th>
                  <th className="text-left px-4 py-3 font-medium text-foreground">Expiră</th>
                  <th className="text-left px-4 py-3 font-medium text-foreground">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {codes.map((pc) => (
                  <tr key={pc.id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3 font-mono font-semibold text-foreground">
                      {pc.code}
                    </td>
                    <td className="px-4 py-3 text-foreground">
                      {pc.discountType === "percent"
                        ? `-${pc.discountValue}%`
                        : `-${(pc.discountValue / 100).toFixed(2)} RON`}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {pc.usedCount}
                      {pc.maxUses != null ? ` / ${pc.maxUses}` : " / ∞"}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {pc.expiresAt
                        ? new Date(pc.expiresAt).toLocaleDateString("ro-RO")
                        : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={pc.computedStatus} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showModal && (
        <CreateModal
          onClose={() => setShowModal(false)}
          onCreated={handleCreated}
        />
      )}
    </AppShell>
  );
}
