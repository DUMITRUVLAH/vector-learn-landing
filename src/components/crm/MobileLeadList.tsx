/**
 * CRM-121 — Vedere mobilă dedicată
 * Carduri verticale compacte cu swipe actions: sună / WhatsApp / mută stadiu.
 * Afișat automat sub lg breakpoint (CSS: block lg:hidden).
 */
import { useState, useRef } from "react";
import { Phone, MessageCircle, Mail, Clock, ChevronRight, CheckCircle2, X } from "lucide-react";
import { type Lead, type LeadStage, moveLeadStage } from "@/lib/api/leads";
import { type PipelineStage } from "@/lib/api/pipeline";
import { cn } from "@/lib/utils";

const SOURCE_LABEL: Record<string, string> = {
  webform: "Site web", manual: "Manual", facebook_ad: "Facebook",
  google_ads: "Google", referral: "Recomandare", phone_in: "Telefon",
  instagram: "Instagram", import: "Import", other: "Altul",
};

const STAGE_LABEL: Record<string, string> = {
  new: "Lead nou", contacted: "Contactat", trial: "Trial",
  paid: "Client", lost: "Pierdut",
};

export interface MobileLeadListProps {
  leads: Lead[];
  stages: PipelineStage[];
  onTap: (leadId: string) => void;
  onRefresh: () => void;
  onError: (msg: string) => void;
}

// ─── Swipe constants ──────────────────────────────────────────────────────────
const SWIPE_THRESHOLD = 60; // px to trigger swipe reveal
const SWIPE_FULL = 200; // px for full reveal

export function MobileLeadList({ leads, stages, onTap, onRefresh, onError }: MobileLeadListProps) {
  const [stageSheetFor, setStageSheetFor] = useState<Lead | null>(null);
  const [lostReasonFor, setLostReasonFor] = useState<{ lead: Lead; targetStage: string } | null>(null);

  if (leads.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-2 text-muted-foreground">
        <p className="text-sm">Niciun lead găsit. Modifică filtrele sau adaugă un lead.</p>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-2" role="list" aria-label="Lista leaduri mobilă">
        {leads.map((lead) => (
          <SwipeableLeadCard
            key={lead.id}
            lead={lead}
            onTap={() => onTap(lead.id)}
            onStageChange={() => setStageSheetFor(lead)}
          />
        ))}
      </div>

      {/* Stage bottom-sheet */}
      {stageSheetFor && (
        <StageBottomSheet
          lead={stageSheetFor}
          stages={stages}
          onClose={() => setStageSheetFor(null)}
          onSelect={(stage) => {
            setStageSheetFor(null);
            const targetStage = stages.find((s) => s.key === stage);
            const isLost = targetStage?.isLost ?? stage === "lost";
            if (isLost) {
              setLostReasonFor({ lead: stageSheetFor, targetStage: stage });
            } else {
              void moveLeadStage(stageSheetFor.id, stage as LeadStage)
                .then(() => onRefresh())
                .catch(() => onError("Nu pot muta lead-ul"));
            }
          }}
        />
      )}

      {/* Lost reason bottom-sheet */}
      {lostReasonFor && (
        <LostReasonBottomSheet
          leadName={lostReasonFor.lead.fullName}
          onConfirm={(reason) => {
            const { lead, targetStage } = lostReasonFor;
            setLostReasonFor(null);
            void moveLeadStage(lead.id, targetStage as LeadStage, reason)
              .then(() => onRefresh())
              .catch(() => onError("Nu pot muta lead-ul"));
          }}
          onClose={() => setLostReasonFor(null)}
        />
      )}
    </>
  );
}

// ─── Swipeable card ───────────────────────────────────────────────────────────

interface SwipeableLeadCardProps {
  lead: Lead;
  onTap: () => void;
  onStageChange: () => void;
}

function SwipeableLeadCard({ lead, onTap, onStageChange }: SwipeableLeadCardProps) {
  const [offsetX, setOffsetX] = useState(0);
  const [revealing, setRevealing] = useState<"left" | "right" | null>(null);
  const startX = useRef<number>(0);
  const startY = useRef<number>(0);
  const isDragging = useRef(false);

  const isOverdue = lead.nextTask?.dueAt != null && new Date(lead.nextTask.dueAt) < new Date();
  const daysOverdue = isOverdue
    ? Math.floor((Date.now() - new Date(lead.nextTask!.dueAt!).getTime()) / 86400000)
    : 0;

  const formatEur = (cents: number) =>
    cents > 0
      ? new Intl.NumberFormat("ro-RO", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(cents / 100)
      : null;

  const handleTouchStart = (e: React.TouchEvent) => {
    startX.current = e.touches[0].clientX;
    startY.current = e.touches[0].clientY;
    isDragging.current = false;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    const dx = e.touches[0].clientX - startX.current;
    const dy = e.touches[0].clientY - startY.current;
    if (Math.abs(dy) > Math.abs(dx) && !isDragging.current) return;
    isDragging.current = true;
    const clamped = Math.max(-SWIPE_FULL, Math.min(SWIPE_FULL, dx));
    setOffsetX(clamped);
    setRevealing(clamped < -SWIPE_THRESHOLD ? "left" : clamped > SWIPE_THRESHOLD ? "right" : null);
    if (Math.abs(dx) > 10) e.preventDefault();
  };

  const handleTouchEnd = () => {
    if (!isDragging.current) {
      setOffsetX(0);
      setRevealing(null);
      return;
    }
    setOffsetX(0);
    setRevealing(null);
  };

  const handleCardClick = () => {
    if (isDragging.current) return;
    onTap();
  };

  return (
    <div
      className="relative overflow-hidden rounded-xl bg-card border border-border shadow-sm"
      role="listitem"
    >
      {/* Left action indicator (swipe right → stage change) */}
      <div
        className={cn(
          "absolute inset-y-0 left-0 flex items-center justify-center w-20 bg-primary/90 transition-opacity",
          revealing === "right" ? "opacity-100" : "opacity-0"
        )}
        aria-hidden="true"
      >
        <div className="flex flex-col items-center gap-1 text-primary-foreground text-[10px] font-bold">
          <ChevronRight className="h-5 w-5 rotate-180" />
          <span>Stadiu</span>
        </div>
      </div>

      {/* Right action indicators (swipe left → call/whatsapp/email) */}
      <div
        className={cn(
          "absolute inset-y-0 right-0 flex items-center gap-0 transition-opacity",
          revealing === "left" ? "opacity-100" : "opacity-0"
        )}
        aria-hidden="true"
      >
        {lead.phone && (
          <div className="flex items-center justify-center w-16 h-full bg-primary/90 text-primary-foreground">
            <Phone className="h-5 w-5" />
          </div>
        )}
        <div className="flex items-center justify-center w-16 h-full bg-success/90 text-success-foreground">
          <MessageCircle className="h-5 w-5" />
        </div>
        {lead.email && (
          <div className="flex items-center justify-center w-16 h-full bg-muted text-muted-foreground">
            <Mail className="h-5 w-5" />
          </div>
        )}
      </div>

      {/* Card content */}
      <div
        className="relative bg-card flex flex-col gap-2 p-3 cursor-pointer select-none"
        style={{ transform: `translateX(${offsetX}px)`, transition: offsetX === 0 ? "transform 0.2s ease" : "none" }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onClick={handleCardClick}
        aria-label={`Lead ${lead.fullName}, stadiu ${STAGE_LABEL[lead.stage] ?? lead.stage}`}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm truncate">
              {lead.dealName ?? lead.fullName}
            </p>
            {lead.company && (
              <p className="text-[11px] text-muted-foreground italic truncate">{lead.company}</p>
            )}
            {lead.interestCourse && (
              <p className="text-[11px] text-muted-foreground truncate">{lead.interestCourse}</p>
            )}
          </div>

          {/* Stage badge — clickable for quick stage change */}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onStageChange(); }}
            className="shrink-0 inline-flex items-center gap-1 rounded-full border border-border/60 px-2 py-0.5 text-[11px] font-semibold hover:border-primary/50 active:scale-95 transition-all min-h-[44px] min-w-[44px] justify-center"
            aria-label={`Schimbă stadiu ${STAGE_LABEL[lead.stage] ?? lead.stage}`}
          >
            {STAGE_LABEL[lead.stage] ?? lead.stage}
          </button>
        </div>

        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[11px] text-muted-foreground">
              {SOURCE_LABEL[lead.source] ?? lead.source}
            </span>
            {formatEur(lead.valueCents ?? 0) && (
              <span className="text-[11px] font-semibold tabular-nums">
                {formatEur(lead.valueCents ?? 0)}
              </span>
            )}
            {(lead.debtCents ?? 0) > 0 && (
              <span className="text-[11px] text-destructive font-semibold tabular-nums">
                Datorie {formatEur(lead.debtCents ?? 0)}
              </span>
            )}
          </div>

          {/* Quick action buttons (always visible, no swipe required) */}
          <div className="flex items-center gap-1 shrink-0">
            {lead.phone && (
              <a
                href={`tel:${lead.phone}`}
                onClick={(e) => e.stopPropagation()}
                className="inline-flex items-center justify-center rounded-md bg-primary/10 hover:bg-primary/20 text-primary min-h-[44px] min-w-[44px] transition-colors"
                aria-label={`Sună ${lead.fullName}`}
              >
                <Phone className="h-4 w-4" />
              </a>
            )}
            {lead.phone && (
              <a
                href={`https://wa.me/${lead.phone.replace(/\D/g, "")}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="inline-flex items-center justify-center rounded-md bg-success/10 hover:bg-success/20 text-success min-h-[44px] min-w-[44px] transition-colors"
                aria-label={`WhatsApp ${lead.fullName}`}
              >
                <MessageCircle className="h-4 w-4" />
              </a>
            )}
          </div>
        </div>

        {/* Task signal */}
        <div className="flex items-center gap-2 flex-wrap">
          {lead.nextTask ? (
            <span className={cn(
              "inline-flex items-center gap-1 text-[10px] font-semibold",
              isOverdue ? "text-destructive" : "text-amber-600 dark:text-amber-400"
            )}
              aria-label={isOverdue ? `Task restant ${daysOverdue} zile` : "Următor task"}
            >
              <Clock className="h-3 w-3" aria-hidden="true" />
              {isOverdue
                ? `${daysOverdue}d restant`
                : lead.nextTask.dueAt
                  ? new Date(lead.nextTask.dueAt).toLocaleDateString("ro-RO", { day: "2-digit", month: "short" })
                  : lead.nextTask.title.slice(0, 25)}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30 rounded px-1.5 py-0.5">
              Fără task
            </span>
          )}

          {lead.convertedToStudentId && (
            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-success">
              <CheckCircle2 className="h-3 w-3" />
              Convertit
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Stage bottom-sheet ───────────────────────────────────────────────────────

interface StageBottomSheetProps {
  lead: Lead;
  stages: PipelineStage[];
  onClose: () => void;
  onSelect: (stage: string) => void;
}

function StageBottomSheet({ lead, stages, onClose, onSelect }: StageBottomSheetProps) {
  const stageList = stages.length > 0 ? stages : [
    { key: "new", label: "Lead nou", isLost: false },
    { key: "contacted", label: "Contactat", isLost: false },
    { key: "trial", label: "Trial", isLost: false },
    { key: "paid", label: "Client", isLost: false },
    { key: "lost", label: "Pierdut", isLost: true },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      role="dialog"
      aria-modal="true"
      aria-label={`Schimbă stadiu pentru ${lead.fullName}`}
    >
      <div className="absolute inset-0 bg-foreground/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg rounded-t-2xl border-t border-border bg-card p-4">
        <div className="flex items-center justify-between mb-4">
          <p className="font-bold text-sm">Mută în stadiu</p>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md hover:bg-muted p-1 min-h-[44px] min-w-[44px] flex items-center justify-center"
            aria-label="Închide"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-2" role="listbox" aria-label="Stadii disponibile">
          {stageList.map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => onSelect(s.key)}
              disabled={s.key === lead.stage}
              className={cn(
                "w-full flex items-center justify-between rounded-lg border px-4 py-3 text-sm font-semibold transition-colors min-h-[44px]",
                s.key === lead.stage
                  ? "border-primary/50 bg-primary/10 text-primary cursor-default"
                  : "border-border hover:bg-muted/40",
                s.isLost && s.key !== lead.stage && "hover:bg-destructive/5 hover:border-destructive/30"
              )}
              role="option"
              aria-selected={s.key === lead.stage}
            >
              {s.label}
              {s.key === lead.stage && <span className="text-xs text-primary">Curent</span>}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Lost reason bottom-sheet ─────────────────────────────────────────────────

const LOST_REASON_PRESETS = [
  "Preț prea mare", "Concurență", "Nu mai e de interes",
  "S-a înscris în altă parte", "Lipsă timp", "Nu răspunde", "Altul",
];

interface LostReasonBottomSheetProps {
  leadName: string;
  onConfirm: (reason: string) => void;
  onClose: () => void;
}

function LostReasonBottomSheet({ leadName, onConfirm, onClose }: LostReasonBottomSheetProps) {
  const [reason, setReason] = useState("");
  const [custom, setCustom] = useState("");

  const effectiveReason = reason === "Altul" ? custom.trim() : reason;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      role="dialog"
      aria-modal="true"
      aria-label={`Motiv pierdere pentru ${leadName}`}
    >
      <div className="absolute inset-0 bg-foreground/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg rounded-t-2xl border-t border-border bg-card p-4 space-y-3 max-h-[80vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <p className="font-bold text-sm">Motiv pierdere</p>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md hover:bg-muted p-1 min-h-[44px] min-w-[44px] flex items-center justify-center"
            aria-label="Închide"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-1.5" role="radiogroup" aria-label="Motiv pierdere">
          {LOST_REASON_PRESETS.map((preset) => (
            <label
              key={preset}
              className={cn(
                "flex items-center gap-2 rounded-lg border p-3 cursor-pointer text-sm transition-colors min-h-[44px]",
                reason === preset
                  ? "border-primary bg-primary/10 text-primary font-semibold"
                  : "border-border hover:bg-muted/40"
              )}
            >
              <input
                type="radio"
                name="mobile_lost_reason"
                value={preset}
                checked={reason === preset}
                onChange={() => setReason(preset)}
                className="sr-only"
              />
              {preset}
            </label>
          ))}
        </div>
        {reason === "Altul" && (
          <div>
            <label htmlFor="mobile-custom-reason" className="block text-sm font-semibold mb-1">Detalii</label>
            <input
              id="mobile-custom-reason"
              type="text"
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              placeholder="Descrie motivul..."
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              autoFocus
            />
          </div>
        )}
        <button
          type="button"
          disabled={!effectiveReason}
          onClick={() => onConfirm(effectiveReason)}
          className="w-full rounded-lg bg-destructive px-4 py-3 text-sm font-semibold text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50 min-h-[44px]"
        >
          Marchează pierdut
        </button>
      </div>
    </div>
  );
}
