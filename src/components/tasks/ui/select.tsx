/**
 * Select — API-ul din HR365 (Radix Select), fără Radix. Vezi `floating.ts`.
 *
 * `<SelectValue />` trebuie să arate eticheta opțiunii alese chiar cu lista ÎNCHISĂ, când
 * `SelectItem`-urile nu sunt montate. Radix le montează ascuns; aici le citim din arborele JSX
 * primit de `<Select>` (inclusiv cele produse cu `.map()`), care e exact forma în care le scriu
 * componentele portate.
 */
import {
  Children,
  createContext,
  forwardRef,
  isValidElement,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactElement,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  mergeRefs,
  useAnchoredPosition,
  useControllableOpen,
  useDismissableLayer,
  useStableId,
} from "./floating";

interface SelectContextValue {
  value: string | undefined;
  choose: (value: string) => void;
  open: boolean;
  setOpen: (open: boolean) => void;
  disabled: boolean;
  triggerRef: RefObject<HTMLButtonElement | null>;
  listId: string;
  labels: Map<string, ReactNode>;
}

const SelectContext = createContext<SelectContextValue | null>(null);

function useSelect(component: string): SelectContextValue {
  const ctx = useContext(SelectContext);
  if (!ctx) throw new Error(`<${component}> trebuie folosit în <Select>`);
  return ctx;
}

/** value → eticheta fiecărui `SelectItem` din arborele dat, oricât de adânc. */
function collectLabels(children: ReactNode, into: Map<string, ReactNode>): void {
  Children.forEach(children, (child) => {
    if (!isValidElement(child)) return;
    const element = child as ReactElement<{ value?: string; children?: ReactNode }>;
    if (element.type === SelectItem && typeof element.props.value === "string") {
      into.set(element.props.value, element.props.children);
      return;
    }
    if (element.props.children) collectLabels(element.props.children, into);
  });
}

export interface SelectProps {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  disabled?: boolean;
  name?: string;
  children: ReactNode;
}

export function Select({ value, defaultValue, onValueChange, open, onOpenChange, disabled = false, children }: SelectProps) {
  const [isOpen, setOpen] = useControllableOpen(open, false, onOpenChange);
  const inner = useRef<string | undefined>(defaultValue);
  const current = value !== undefined ? value : inner.current;
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const listId = useStableId("select");
  const labels = useMemo(() => {
    const map = new Map<string, ReactNode>();
    collectLabels(children, map);
    return map;
  }, [children]);

  const choose = (next: string) => {
    inner.current = next;
    setOpen(false);
    if (next !== current) onValueChange?.(next);
  };

  return (
    <SelectContext.Provider
      value={{ value: current, choose, open: isOpen, setOpen, disabled, triggerRef, listId, labels }}
    >
      {children}
    </SelectContext.Provider>
  );
}

export const SelectTrigger = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement>>(
  function SelectTrigger({ className, children, onKeyDown, onClick, disabled, ...props }, ref) {
    const ctx = useSelect("SelectTrigger");
    const isDisabled = disabled ?? ctx.disabled;
    return (
      <button
        ref={mergeRefs(ref, ctx.triggerRef)}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={ctx.open}
        aria-controls={ctx.open ? ctx.listId : undefined}
        data-state={ctx.open ? "open" : "closed"}
        disabled={isDisabled}
        className={cn(
          "flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 [&>span]:line-clamp-1",
          className,
        )}
        onClick={(event) => {
          onClick?.(event);
          if (!event.defaultPrevented) ctx.setOpen(!ctx.open);
        }}
        onKeyDown={(event) => {
          onKeyDown?.(event);
          if (event.defaultPrevented) return;
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            ctx.setOpen(true);
          }
        }}
        {...props}
      >
        {children}
        <ChevronDown className="h-4 w-4 shrink-0 opacity-50" aria-hidden="true" />
      </button>
    );
  },
);

export function SelectValue({ placeholder, className }: { placeholder?: ReactNode; className?: string }) {
  const ctx = useSelect("SelectValue");
  const label = ctx.value !== undefined ? ctx.labels.get(ctx.value) : undefined;
  return (
    <span className={cn("pointer-events-none truncate text-left", label === undefined && "text-muted-foreground", className)}>
      {label ?? placeholder ?? ""}
    </span>
  );
}

function options(list: HTMLElement | null): HTMLElement[] {
  if (!list) return [];
  return Array.from(list.querySelectorAll<HTMLElement>('[role="option"]:not([aria-disabled="true"])'));
}

export interface SelectContentProps extends HTMLAttributes<HTMLDivElement> {
  position?: "popper" | "item-aligned";
  side?: "top" | "bottom";
  align?: "start" | "center" | "end";
}

export const SelectContent = forwardRef<HTMLDivElement, SelectContentProps>(function SelectContent(
  { className, children, position: _position, side = "bottom", align = "start", style, ...props },
  ref,
) {
  const ctx = useSelect("SelectContent");
  const contentRef = useRef<HTMLDivElement | null>(null);
  const typeahead = useRef({ text: "", at: 0 });
  const position = useAnchoredPosition(ctx.triggerRef, contentRef, {
    open: ctx.open,
    side,
    align,
    sideOffset: 4,
    matchAnchorWidth: true,
  });

  useDismissableLayer({
    open: ctx.open,
    onDismiss: () => ctx.setOpen(false),
    elements: () => [contentRef.current, ctx.triggerRef.current],
  });

  // Focus pe opțiunea aleasă (sau pe prima) la deschidere; înapoi pe trigger la închidere.
  useEffect(() => {
    if (!ctx.open) return;
    const trigger = ctx.triggerRef.current;
    const frame = requestAnimationFrame(() => {
      const list = options(contentRef.current);
      const selected = list.find((el) => el.getAttribute("aria-selected") === "true");
      (selected ?? list[0] ?? contentRef.current)?.focus({ preventScroll: false });
    });
    return () => {
      cancelAnimationFrame(frame);
      trigger?.focus({ preventScroll: true });
    };
  }, [ctx.open, ctx.triggerRef]);

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const list = options(contentRef.current);
    const index = list.indexOf(document.activeElement as HTMLElement);
    let next = -1;
    if (event.key === "ArrowDown") next = Math.min(list.length - 1, index + 1);
    else if (event.key === "ArrowUp") next = Math.max(0, index - 1);
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = list.length - 1;
    else if (event.key === "Tab") {
      ctx.setOpen(false);
      return;
    } else if (event.key.length === 1 && /\S/.test(event.key)) {
      // Căutare după primele litere, ca într-un <select> nativ.
      const now = Date.now();
      typeahead.current.text = now - typeahead.current.at > 700 ? event.key : typeahead.current.text + event.key;
      typeahead.current.at = now;
      const needle = typeahead.current.text.toLocaleLowerCase();
      next = list.findIndex((el) => (el.textContent ?? "").trim().toLocaleLowerCase().startsWith(needle));
    }
    if (next >= 0) {
      event.preventDefault();
      list[next]?.focus();
    }
  };

  if (!ctx.open) return null;
  return createPortal(
    <div
      ref={mergeRefs(ref, contentRef)}
      id={ctx.listId}
      role="listbox"
      tabIndex={-1}
      data-state="open"
      data-side={position.side}
      style={{ ...position.style, ...style }}
      className={cn(
        "relative z-[80] max-h-96 min-w-[8rem] overflow-y-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md outline-none animate-in fade-in-0 zoom-in-95",
        className,
      )}
      onKeyDown={onKeyDown}
      {...props}
    >
      {children}
    </div>,
    document.body,
  );
});

export interface SelectItemProps extends HTMLAttributes<HTMLDivElement> {
  value: string;
  disabled?: boolean;
}

export const SelectItem = forwardRef<HTMLDivElement, SelectItemProps>(function SelectItem(
  { className, children, value, disabled, onKeyDown, ...props },
  ref,
) {
  const ctx = useSelect("SelectItem");
  const selected = ctx.value === value;
  return (
    <div
      ref={ref}
      role="option"
      tabIndex={-1}
      aria-selected={selected}
      aria-disabled={disabled || undefined}
      data-disabled={disabled ? "" : undefined}
      data-state={selected ? "checked" : "unchecked"}
      className={cn(
        "relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
        className,
      )}
      onClick={() => {
        if (!disabled) ctx.choose(value);
      }}
      onKeyDown={(event) => {
        onKeyDown?.(event);
        if (event.defaultPrevented) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          if (!disabled) ctx.choose(value);
        }
      }}
      {...props}
    >
      <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
        {selected && <Check className="h-4 w-4" aria-hidden="true" />}
      </span>
      <span>{children}</span>
    </div>
  );
});

export function SelectGroup({ children }: { children: ReactNode }) {
  return <div role="group">{children}</div>;
}

export function SelectLabel({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("py-1.5 pl-8 pr-2 text-sm font-semibold", className)} {...props} />;
}

export function SelectSeparator({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div role="separator" className={cn("-mx-1 my-1 h-px bg-muted", className)} {...props} />;
}
