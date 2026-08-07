/**
 * HR365-006 — form primitives: Label, Input, Textarea, Select, Checkbox, Switch.
 *
 * All 40px tall (except Textarea), `rounded-md` (12px), 1px `input` border, and
 * a 2px ring on focus. `invalid` swaps the border to destructive and is what
 * drives `aria-invalid`, so a red field is always announced, never just seen.
 */
import type {
  InputHTMLAttributes,
  LabelHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";
import { ChevronDown, Check } from "lucide-react";
import { cn } from "@/lib/utils";

const FIELD =
  "w-full rounded-md border bg-background px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring/45 disabled:cursor-not-allowed disabled:opacity-50";

// ─── Label ────────────────────────────────────────────────────────────────────

export interface LabelProps extends LabelHTMLAttributes<HTMLLabelElement> {
  required?: boolean;
  children: ReactNode;
}

export function Label({ required, className, children, ...rest }: LabelProps) {
  return (
    <label className={cn("inline-block text-sm font-medium leading-none text-foreground", className)} {...rest}>
      {children}
      {required && (
        <span className="ml-0.5 text-destructive" aria-hidden="true">
          *
        </span>
      )}
    </label>
  );
}

// ─── Input ────────────────────────────────────────────────────────────────────

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "size"> {
  invalid?: boolean;
  /** Rendered inside the field, on the left. Purely decorative. */
  icon?: ReactNode;
}

export function Input({ invalid, icon, className, ...rest }: InputProps) {
  const field = (
    <input
      aria-invalid={invalid || undefined}
      className={cn(FIELD, "h-10", invalid ? "border-destructive" : "border-input", icon && "pl-9", className)}
      {...rest}
    />
  );
  if (!icon) return field;
  return (
    <div className="relative w-full">
      <span
        className="pointer-events-none absolute left-3 top-1/2 flex -translate-y-1/2 text-muted-foreground"
        aria-hidden="true"
      >
        {icon}
      </span>
      {field}
    </div>
  );
}

// ─── Textarea ─────────────────────────────────────────────────────────────────

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
}

export function Textarea({ invalid, rows = 3, className, ...rest }: TextareaProps) {
  return (
    <textarea
      rows={rows}
      aria-invalid={invalid || undefined}
      className={cn(
        FIELD,
        "min-h-[80px] resize-y py-2 leading-normal",
        invalid ? "border-destructive" : "border-input",
        className,
      )}
      {...rest}
    />
  );
}

// ─── Select ───────────────────────────────────────────────────────────────────

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  invalid?: boolean;
  children: ReactNode;
}

/**
 * `className` styles the WRAPPER, not the `<select>` — the wrapper is what a flex
 * row lays out, so `className="w-auto"` has to reach it or the control stretches
 * and the chevron detaches from the field.
 */
export function Select({ invalid, className, children, ...rest }: SelectProps) {
  return (
    <div className={cn("relative inline-flex w-full", className)}>
      <select
        aria-invalid={invalid || undefined}
        className={cn(
          FIELD,
          "h-10 w-full cursor-pointer appearance-none pr-9",
          invalid ? "border-destructive" : "border-input",
        )}
        {...rest}
      >
        {children}
      </select>
      <ChevronDown
        className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 opacity-50"
        aria-hidden="true"
      />
    </div>
  );
}

// ─── Checkbox ─────────────────────────────────────────────────────────────────

export interface CheckboxProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  label?: ReactNode;
  disabled?: boolean;
  id?: string;
  className?: string;
  /** Required when there is no visible `label` — the skin span is aria-hidden. */
  "aria-label"?: string;
}

export function Checkbox({ checked, onChange, label, disabled, id, className, ...rest }: CheckboxProps) {
  return (
    <label className={cn("inline-flex items-center gap-2", disabled ? "cursor-not-allowed" : "cursor-pointer")}>
      {/*
        The real input is stretched over the box at opacity-0 rather than parked
        off-screen with `sr-only`. Two things depend on it:
          - it stays the actual click target at the box's own size, so anything
            driving the input directly (tests, automation) can reach it;
          - `peer-focus-visible` on the skin restores the focus ring a keyboard
            user needs. An `sr-only` input is focusable but INVISIBLY so — you
            tab onto the checkbox and nothing on screen moves.
      */}
      <span className="relative inline-flex h-4 w-4 shrink-0">
        <input
          id={id}
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
          className={cn("peer absolute inset-0 h-full w-full opacity-0", disabled ? "cursor-not-allowed" : "cursor-pointer")}
          {...rest}
        />
        <span
          className={cn(
            // Explicit 4px: the token scale is built for cards, and `rounded-sm`
            // (10px) on a 16px box renders as a circle — indistinguishable from a radio.
            "pointer-events-none inline-flex h-4 w-4 items-center justify-center rounded-[4px] border border-primary text-primary-foreground transition-colors",
            "peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2",
            checked ? "bg-primary" : "bg-transparent",
            disabled && "opacity-50",
            className,
          )}
          aria-hidden="true"
        >
          {checked && <Check className="h-3 w-3" strokeWidth={3} />}
        </span>
      </span>
      {label && <span className="text-sm font-medium">{label}</span>}
    </label>
  );
}

// ─── Switch ───────────────────────────────────────────────────────────────────

export interface SwitchProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  /** Required: an icon-less toggle has no accessible name of its own. */
  "aria-label": string;
  className?: string;
}

export function Switch({ checked, onChange, disabled, className, ...rest }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "inline-flex h-6 w-11 shrink-0 items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        checked ? "bg-primary" : "bg-input",
        disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer",
        className,
      )}
      {...rest}
    >
      <span
        className={cn(
          "block h-5 w-5 rounded-full bg-background shadow-lg transition-transform",
          checked ? "translate-x-5" : "translate-x-0",
        )}
      />
    </button>
  );
}
