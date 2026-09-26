/**
 * DropdownMenu — API-ul din HR365 (Radix), fără Radix. Vezi `floating.ts`.
 *
 * Tastatura, ca într-un meniu de sistem: ↓/↑ mută între opțiuni (circular), Home/End sar la
 * capete, Enter/Space aleg, → deschide submeniul, ← îl închide, Escape închide stratul de sus,
 * Tab închide tot. Alegerea unei opțiuni — și dintr-un submeniu — închide meniul întreg.
 */
import {
  createContext,
  forwardRef,
  useContext,
  useEffect,
  useRef,
  useState,
  type HTMLAttributes,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Slot,
  mergeRefs,
  useAnchoredPosition,
  useControllableOpen,
  useDismissableLayer,
  useStableId,
  type Align,
  type Side,
} from "./floating";

const PANEL =
  "z-[80] min-w-[8rem] overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground outline-none animate-in fade-in-0 zoom-in-95";
const ITEM =
  "relative flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50";

interface RootContextValue {
  open: boolean;
  setOpen: (open: boolean) => void;
  triggerRef: RefObject<HTMLElement | null>;
  contentId: string;
}

const RootContext = createContext<RootContextValue | null>(null);

interface SubContextValue {
  open: boolean;
  setOpen: (open: boolean) => void;
  triggerRef: RefObject<HTMLElement | null>;
  contentRef: RefObject<HTMLDivElement | null>;
  scheduleClose: () => void;
  cancelClose: () => void;
}

const SubContext = createContext<SubContextValue | null>(null);

function useRoot(component: string): RootContextValue {
  const ctx = useContext(RootContext);
  if (!ctx) throw new Error(`<${component}> trebuie folosit în <DropdownMenu>`);
  return ctx;
}

/** Opțiunile DIRECTE ale unui panou (nu și cele din submeniuri portalate în altă parte). */
function itemsOf(panel: HTMLElement | null): HTMLElement[] {
  if (!panel) return [];
  return Array.from(panel.querySelectorAll<HTMLElement>('[role="menuitem"]')).filter(
    (el) => el.closest('[role="menu"]') === panel && el.getAttribute("aria-disabled") !== "true",
  );
}

function moveFocus(panel: HTMLElement | null, key: string): boolean {
  const items = itemsOf(panel);
  if (items.length === 0) return false;
  const current = items.indexOf(document.activeElement as HTMLElement);
  let next = current;
  if (key === "ArrowDown") next = current < 0 ? 0 : (current + 1) % items.length;
  else if (key === "ArrowUp") next = current < 0 ? items.length - 1 : (current - 1 + items.length) % items.length;
  else if (key === "Home") next = 0;
  else if (key === "End") next = items.length - 1;
  else return false;
  items[next]?.focus();
  return true;
}

export interface DropdownMenuProps {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  modal?: boolean;
  children: ReactNode;
}

export function DropdownMenu({ open, defaultOpen, onOpenChange, children }: DropdownMenuProps) {
  const [isOpen, setOpen] = useControllableOpen(open, defaultOpen, onOpenChange);
  const triggerRef = useRef<HTMLElement | null>(null);
  const contentId = useStableId("menu");
  return (
    <RootContext.Provider value={{ open: isOpen, setOpen, triggerRef, contentId }}>{children}</RootContext.Provider>
  );
}

export interface DropdownMenuTriggerProps extends HTMLAttributes<HTMLElement> {
  asChild?: boolean;
  disabled?: boolean;
  children: ReactNode;
}

export const DropdownMenuTrigger = forwardRef<HTMLElement, DropdownMenuTriggerProps>(function DropdownMenuTrigger(
  { asChild, children, onClick, onKeyDown, ...props },
  ref,
) {
  const { open, setOpen, triggerRef, contentId } = useRoot("DropdownMenuTrigger");
  const handlers = {
    "aria-haspopup": "menu",
    "aria-expanded": open,
    "aria-controls": open ? contentId : undefined,
    "data-state": open ? "open" : "closed",
    onClick: (event: ReactMouseEvent<HTMLElement>) => {
      onClick?.(event);
      if (!event.defaultPrevented) setOpen(!open);
    },
    onKeyDown: (event: ReactKeyboardEvent<HTMLElement>) => {
      onKeyDown?.(event);
      if (event.defaultPrevented) return;
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        setOpen(true);
      }
    },
  };
  if (asChild) {
    return (
      <Slot {...props} {...handlers} slotRef={mergeRefs(ref, triggerRef)}>
        {children}
      </Slot>
    );
  }
  return (
    <button
      type="button"
      {...(props as HTMLAttributes<HTMLButtonElement>)}
      {...handlers}
      ref={mergeRefs(ref, triggerRef as RefObject<HTMLButtonElement | null>)}
    >
      {children}
    </button>
  );
});

export interface DropdownMenuContentProps extends HTMLAttributes<HTMLDivElement> {
  side?: Side;
  align?: Align;
  sideOffset?: number;
  collisionPadding?: number;
}

export const DropdownMenuContent = forwardRef<HTMLDivElement, DropdownMenuContentProps>(function DropdownMenuContent(
  { className, side = "bottom", align = "center", sideOffset = 4, collisionPadding = 8, style, children, onKeyDown, ...props },
  ref,
) {
  const { open, setOpen, triggerRef, contentId } = useRoot("DropdownMenuContent");
  const contentRef = useRef<HTMLDivElement | null>(null);
  const position = useAnchoredPosition(triggerRef, contentRef, { open, side, align, sideOffset, collisionPadding });

  useDismissableLayer({
    open,
    onDismiss: () => setOpen(false),
    elements: () => [contentRef.current, triggerRef.current],
  });

  // La deschidere, prima opțiune primește focusul; la închidere, focusul se întoarce pe trigger.
  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => {
      const first = itemsOf(contentRef.current)[0];
      (first ?? contentRef.current)?.focus({ preventScroll: true });
    });
    const trigger = triggerRef.current;
    return () => {
      cancelAnimationFrame(frame);
      const active = document.activeElement;
      if (!active || active === document.body || contentRef.current?.contains(active)) trigger?.focus({ preventScroll: true });
    };
  }, [open, triggerRef]);

  if (!open) return null;
  return createPortal(
    <div
      ref={mergeRefs(ref, contentRef)}
      id={contentId}
      role="menu"
      aria-orientation="vertical"
      tabIndex={-1}
      data-state="open"
      data-side={position.side}
      style={{ ...position.style, ...style }}
      className={cn(PANEL, "shadow-md", className)}
      onKeyDown={(event) => {
        onKeyDown?.(event);
        if (event.defaultPrevented) return;
        if (event.key === "Tab") {
          setOpen(false);
          return;
        }
        if (moveFocus(contentRef.current, event.key)) event.preventDefault();
      }}
      {...props}
    >
      {children}
    </div>,
    document.body,
  );
});

export interface DropdownMenuItemProps extends Omit<HTMLAttributes<HTMLDivElement>, "onSelect"> {
  disabled?: boolean;
  inset?: boolean;
  /** Ca în Radix: `event.preventDefault()` aici ține meniul deschis. */
  onSelect?: (event: Event) => void;
}

export const DropdownMenuItem = forwardRef<HTMLDivElement, DropdownMenuItemProps>(function DropdownMenuItem(
  { className, disabled, inset, onSelect, onClick, onKeyDown, children, ...props },
  ref,
) {
  const root = useRoot("DropdownMenuItem");
  const activate = (event: ReactMouseEvent<HTMLDivElement> | ReactKeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    const selectEvent = new Event("select", { cancelable: true });
    onSelect?.(selectEvent);
    if (event.type === "click") onClick?.(event as ReactMouseEvent<HTMLDivElement>);
    if (!selectEvent.defaultPrevented && !event.defaultPrevented) root.setOpen(false);
  };
  return (
    <div
      ref={ref}
      role="menuitem"
      tabIndex={-1}
      aria-disabled={disabled || undefined}
      data-disabled={disabled ? "" : undefined}
      className={cn(ITEM, inset && "pl-8", className)}
      onClick={activate}
      onKeyDown={(event) => {
        onKeyDown?.(event);
        if (event.defaultPrevented) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          if (!disabled) {
            // Același drum ca un click: handler-ul autorului + închiderea meniului.
            (event.currentTarget as HTMLElement).click();
          }
        }
      }}
      {...props}
    >
      {children}
    </div>
  );
});

export function DropdownMenuSeparator({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div role="separator" className={cn("-mx-1 my-1 h-px bg-muted", className)} {...props} />;
}

export function DropdownMenuLabel({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("px-2 py-1.5 text-sm font-semibold", className)} {...props} />;
}

// ─── Submeniu ───────────────────────────────────────────────────────────────

export function DropdownMenuSub({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const timer = useRef<number | null>(null);
  const cancelClose = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
  };
  const scheduleClose = () => {
    cancelClose();
    // O mică întârziere, ca drumul în diagonală spre submeniu să nu-l închidă.
    timer.current = window.setTimeout(() => setOpen(false), 150);
  };
  useEffect(() => cancelClose, []);
  return (
    <SubContext.Provider value={{ open, setOpen, triggerRef, contentRef, scheduleClose, cancelClose }}>
      {children}
    </SubContext.Provider>
  );
}

function useSub(component: string): SubContextValue {
  const ctx = useContext(SubContext);
  if (!ctx) throw new Error(`<${component}> trebuie folosit în <DropdownMenuSub>`);
  return ctx;
}

export const DropdownMenuSubTrigger = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement> & { inset?: boolean }>(
  function DropdownMenuSubTrigger({ className, inset, children, ...props }, ref) {
    const sub = useSub("DropdownMenuSubTrigger");
    const openAndFocus = () => {
      sub.cancelClose();
      sub.setOpen(true);
      requestAnimationFrame(() => itemsOf(sub.contentRef.current)[0]?.focus());
    };
    return (
      <div
        ref={mergeRefs(ref, sub.triggerRef as RefObject<HTMLDivElement | null>)}
        role="menuitem"
        tabIndex={-1}
        aria-haspopup="menu"
        aria-expanded={sub.open}
        data-state={sub.open ? "open" : "closed"}
        className={cn(ITEM, "data-[state=open]:bg-accent", inset && "pl-8", className)}
        onPointerEnter={() => {
          sub.cancelClose();
          sub.setOpen(true);
        }}
        onPointerLeave={sub.scheduleClose}
        onClick={openAndFocus}
        onKeyDown={(event) => {
          if (event.key === "ArrowRight" || event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            event.stopPropagation();
            openAndFocus();
          }
        }}
        {...props}
      >
        {children}
        <ChevronRight className="ml-auto h-4 w-4" aria-hidden="true" />
      </div>
    );
  },
);

export const DropdownMenuSubContent = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  function DropdownMenuSubContent({ className, style, children, ...props }, ref) {
    const sub = useSub("DropdownMenuSubContent");
    const position = useAnchoredPosition(sub.triggerRef, sub.contentRef, {
      open: sub.open,
      side: "right",
      align: "start",
      sideOffset: 2,
    });
    useDismissableLayer({
      open: sub.open,
      onDismiss: (reason) => {
        sub.setOpen(false);
        // Escape închide doar submeniul; focusul revine pe rândul care l-a deschis.
        if (reason === "escape") sub.triggerRef.current?.focus();
      },
      elements: () => [sub.contentRef.current, sub.triggerRef.current],
    });
    if (!sub.open) return null;
    return createPortal(
      <div
        ref={mergeRefs(ref, sub.contentRef)}
        role="menu"
        aria-orientation="vertical"
        tabIndex={-1}
        data-state="open"
        data-side={position.side}
        style={{ ...position.style, ...style }}
        className={cn(PANEL, "shadow-lg", className)}
        onPointerEnter={sub.cancelClose}
        onPointerLeave={sub.scheduleClose}
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft" || event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            sub.setOpen(false);
            sub.triggerRef.current?.focus();
            return;
          }
          if (moveFocus(sub.contentRef.current, event.key)) {
            event.preventDefault();
            event.stopPropagation();
          }
        }}
        {...props}
      >
        {children}
      </div>,
      document.body,
    );
  },
);
