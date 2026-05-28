import { useState, useMemo } from "react";
import { Zap, Filter, Send, ArrowDown } from "lucide-react";
import { cn } from "@/lib/utils";

type Trigger = "lead_new" | "lesson_absent" | "payment_overdue" | "student_birthday" | "trial_no_show";
type Condition = "any" | "source_facebook" | "weekend" | "first_offence" | "vip_student";
type Action = "send_whatsapp" | "send_sms" | "send_email" | "create_task" | "send_telegram";

export interface AutomationConfig {
  trigger: Trigger;
  condition: Condition;
  action: Action;
}

const TRIGGER_META: Record<Trigger, { label: string; description: string }> = {
  lead_new: { label: "Lead nou primit", description: "Imediat ce vine un lead din orice sursă" },
  lesson_absent: { label: "Elev absent la lecție", description: "Profesor a marcat absență" },
  payment_overdue: { label: "Plată restantă", description: "Factură neachitată la scadență" },
  student_birthday: { label: "Ziua elevului", description: "Aniversare în calendar" },
  trial_no_show: { label: "Lipsă la ora de probă", description: "Lead nu a venit la trial" },
};

const CONDITION_META: Record<Condition, { label: string; description: string }> = {
  any: { label: "Fără condiție", description: "Aplică triggerul mereu" },
  source_facebook: { label: "DOAR dacă vine din Facebook", description: "Filtrare pe sursa de marketing" },
  weekend: { label: "DOAR dacă e weekend", description: "Sâmbătă sau duminică" },
  first_offence: { label: "Prima abatere a elevului", description: "Nu trimite la fiecare repetare" },
  vip_student: { label: "DOAR pentru elevi VIP", description: "Cei cu LTV > 2000€" },
};

const ACTION_META: Record<Action, { label: string; description: string; channel: "whatsapp" | "sms" | "email" | "telegram" | "task" }> = {
  send_whatsapp: { label: "Trimite WhatsApp către părinte", description: "Mesaj template aprobat Meta", channel: "whatsapp" },
  send_sms: { label: "Trimite SMS către părinte", description: "Limită 160 caractere", channel: "sms" },
  send_email: { label: "Trimite email", description: "Cu template HTML branded", channel: "email" },
  send_telegram: { label: "Trimite mesaj Telegram", description: "Doar dacă există bot connect", channel: "telegram" },
  create_task: { label: "Creează sarcină pentru recepționer", description: "Apare în to-do-ul echipei", channel: "task" },
};

interface AutomationBuilderProps {
  onChange?: (config: AutomationConfig) => void;
}

export function AutomationBuilder({ onChange }: AutomationBuilderProps) {
  const [config, setConfig] = useState<AutomationConfig>({
    trigger: "lesson_absent",
    condition: "first_offence",
    action: "send_whatsapp",
  });

  const summary = useMemo(() => buildSummary(config), [config]);

  const update = <K extends keyof AutomationConfig>(key: K, value: AutomationConfig[K]) => {
    const next = { ...config, [key]: value };
    setConfig(next);
    onChange?.(next);
  };

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-md">
      <div className="border-b border-border bg-muted/30 px-5 py-4">
        <h3 className="text-base font-bold">Construiește o automatizare</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Alege ce eveniment declanșează, filtrul opțional și acțiunea automată.
        </p>
      </div>

      <div className="p-5 sm:p-6 space-y-3">
        <Node
          step="1"
          label="Dacă se întâmplă"
          icon={Zap}
          pastel="pastel-mint"
          id="builder-trigger"
        >
          <select
            id="builder-trigger"
            value={config.trigger}
            onChange={(e) => update("trigger", e.target.value as Trigger)}
            className="w-full mt-2 rounded-md border border-input bg-background px-3 py-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
          >
            {(Object.keys(TRIGGER_META) as Trigger[]).map((k) => (
              <option key={k} value={k}>
                {TRIGGER_META[k].label}
              </option>
            ))}
          </select>
          <p className="text-[11px] text-muted-foreground mt-1.5">{TRIGGER_META[config.trigger].description}</p>
        </Node>

        <Arrow />

        <Node
          step="2"
          label="Verifică (opțional)"
          icon={Filter}
          pastel="pastel-sky"
          id="builder-condition"
        >
          <select
            id="builder-condition"
            value={config.condition}
            onChange={(e) => update("condition", e.target.value as Condition)}
            className="w-full mt-2 rounded-md border border-input bg-background px-3 py-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
          >
            {(Object.keys(CONDITION_META) as Condition[]).map((k) => (
              <option key={k} value={k}>
                {CONDITION_META[k].label}
              </option>
            ))}
          </select>
          <p className="text-[11px] text-muted-foreground mt-1.5">{CONDITION_META[config.condition].description}</p>
        </Node>

        <Arrow />

        <Node
          step="3"
          label="Atunci execută"
          icon={Send}
          pastel="pastel-lavender"
          id="builder-action"
        >
          <select
            id="builder-action"
            value={config.action}
            onChange={(e) => update("action", e.target.value as Action)}
            className="w-full mt-2 rounded-md border border-input bg-background px-3 py-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
          >
            {(Object.keys(ACTION_META) as Action[]).map((k) => (
              <option key={k} value={k}>
                {ACTION_META[k].label}
              </option>
            ))}
          </select>
          <p className="text-[11px] text-muted-foreground mt-1.5">{ACTION_META[config.action].description}</p>
        </Node>

        <div data-testid="automation-summary" className="mt-5 rounded-lg bg-primary/5 border border-primary/20 p-4">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-primary mb-1.5">
            Sumar automation
          </p>
          <p className="text-sm text-foreground/90 leading-relaxed">{summary}</p>
        </div>
      </div>
    </div>
  );
}

interface NodeProps {
  step: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  pastel: string;
  id: string;
  children: React.ReactNode;
}

function Node({ step, label, icon: Icon, pastel, id, children }: NodeProps) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <label htmlFor={id} className="flex items-center gap-3 cursor-pointer">
        <span className={cn("inline-flex h-9 w-9 items-center justify-center rounded-lg flex-shrink-0", pastel)}>
          <Icon className="h-4 w-4 text-foreground/80" />
        </span>
        <span className="flex-1">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground block">
            Pas {step}
          </span>
          <span className="text-sm font-bold text-foreground block">{label}</span>
        </span>
      </label>
      {children}
    </div>
  );
}

function Arrow() {
  return (
    <div className="flex justify-center" aria-hidden>
      <ArrowDown className="h-4 w-4 text-muted-foreground" />
    </div>
  );
}

export function buildSummary(config: AutomationConfig): string {
  const trigger = TRIGGER_META[config.trigger].label.toLowerCase();
  const action = ACTION_META[config.action].label.toLowerCase();
  if (config.condition === "any") {
    return `Când ${trigger}, ${action} automat.`;
  }
  const cond = CONDITION_META[config.condition].label.toLowerCase();
  return `Când ${trigger} și ${cond}, ${action} automat.`;
}

export type ActionChannel = (typeof ACTION_META)[Action]["channel"];

export function getActionChannel(action: Action): ActionChannel {
  return ACTION_META[action].channel;
}
