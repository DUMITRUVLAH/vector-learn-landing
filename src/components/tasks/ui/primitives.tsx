/**
 * Primitivele simple ale modulului de task-uri, cu clasele din HR365 (shadcn) — aceleași
 * tokeni semantici ca restul FinFlow, deci arată la fel în light și dark.
 *
 * `forwardRef` peste tot: componentele portate țin ref-uri pe câmpuri (focus după adăugare,
 * poziționarea unui popover pe un câmp) exact ca în sursă.
 */
import {
  forwardRef,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type InputHTMLAttributes,
  type LabelHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, type, ...props },
  ref,
) {
  return (
    <input
      ref={ref}
      type={type}
      className={cn(
        "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        className,
      )}
      {...props}
    />
  );
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, ...props }, ref) {
    return (
      <textarea
        ref={ref}
        className={cn(
          "flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        {...props}
      />
    );
  },
);

export const Label = forwardRef<HTMLLabelElement, LabelHTMLAttributes<HTMLLabelElement>>(function Label(
  { className, ...props },
  ref,
) {
  return (
    <label
      ref={ref}
      className={cn("text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70", className)}
      {...props}
    />
  );
});

export interface CheckboxProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onChange" | "value"> {
  checked?: boolean | "indeterminate";
  onCheckedChange?: (checked: boolean) => void;
}

/**
 * Căsuța arată 16px, ca în sursă, dar zona de apăsare are 44px (`after:` invizibil) — pragul
 * de atingere din CLAUDE.md §3.3, fără să umfle rândurile dense din liste.
 */
export const Checkbox = forwardRef<HTMLButtonElement, CheckboxProps>(function Checkbox(
  { className, checked = false, onCheckedChange, onClick, disabled, ...props },
  ref,
) {
  const isChecked = checked === true;
  return (
    <button
      ref={ref}
      type="button"
      role="checkbox"
      aria-checked={checked === "indeterminate" ? "mixed" : isChecked}
      data-state={isChecked ? "checked" : "unchecked"}
      disabled={disabled}
      className={cn(
        "peer relative h-4 w-4 shrink-0 rounded-sm border border-primary ring-offset-background after:absolute after:-inset-[14px] after:content-[''] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground",
        className,
      )}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented) onCheckedChange?.(!isChecked);
      }}
      {...props}
    >
      {isChecked && (
        <span className="flex items-center justify-center text-current">
          <Check className="h-4 w-4" aria-hidden="true" />
        </span>
      )}
    </button>
  );
});

export const Card = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(function Card({ className, ...props }, ref) {
  return <div ref={ref} className={cn("rounded-lg border bg-card text-card-foreground shadow-sm", className)} {...props} />;
});

export const CardContent = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(function CardContent(
  { className, ...props },
  ref,
) {
  return <div ref={ref} className={cn("p-6 pt-0", className)} {...props} />;
});

export function Avatar({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn("relative flex h-10 w-10 shrink-0 overflow-hidden rounded-full", className)} {...props} />;
}

export function AvatarFallback({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn("flex h-full w-full items-center justify-center rounded-full bg-muted", className)} {...props} />;
}

export function AvatarImage({ className, alt = "", ...props }: InputHTMLAttributes<HTMLImageElement> & { src?: string; alt?: string }) {
  return <img alt={alt} className={cn("aspect-square h-full w-full", className)} {...(props as HTMLAttributes<HTMLImageElement>)} />;
}

/** Radix ScrollArea desena bare proprii; aici derularea e cea nativă, cu aceeași cutie. */
export const ScrollArea = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(function ScrollArea(
  { className, children, ...props },
  ref,
) {
  return (
    <div ref={ref} className={cn("relative overflow-auto", className)} {...props}>
      {children}
    </div>
  );
});

export function ScrollBar(_props: { orientation?: "vertical" | "horizontal"; className?: string }) {
  return null;
}

export function Separator({
  className,
  orientation = "horizontal",
  ...props
}: HTMLAttributes<HTMLDivElement> & { orientation?: "horizontal" | "vertical" }) {
  return (
    <div
      role="separator"
      aria-orientation={orientation}
      className={cn("shrink-0 bg-border", orientation === "horizontal" ? "h-[1px] w-full" : "h-full w-[1px]", className)}
      {...props}
    />
  );
}
